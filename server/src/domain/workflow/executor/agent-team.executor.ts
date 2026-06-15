import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, llmEvent } from '../model/sse-events';
import { buildAgentTools } from './shared-utils';

/** Agent Teams 节点 — 多 Agent 并行协作，通过共享黑板交换数据 */
export class AgentTeamExecutor implements INodeExecutor {
  readonly type = 'agent_team';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const agentIds = node.data.agentIds || [];

    if (agentIds.length === 0) {
      console.warn(`[Workflow] Agent Teams 节点未配置 agentIds: ${node.id}`);
      return { output: null };
    }

    const teamAgents = (await Promise.all(agentIds.map((id: string) => deps.agentService.getById(id))))
      .filter(a => a !== undefined);

    if (teamAgents.length === 0) {
      return { output: null };
    }

    yield llmEvent({
      stage: 'start', nodeId: node.id,
      purpose: `Agent Teams (${teamAgents.length})`,
      input: ctx.userMessage.slice(0, 200),
    });

    // 共享黑板
    const blackboard = new Map<string, string>();

    const resultsSummary = [...ctx.results.entries()]
      .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v)}`)
      .join('\n');

    // 并行执行所有 Agent
    const teamResults = await Promise.all(teamAgents.map(async (agent) => {
      const reply = await this.executeAgent(agent, ctx, deps, blackboard, resultsSummary);
      return { name: agent.name, output: reply };
    }));

    yield llmEvent({
      stage: 'end', nodeId: node.id,
      purpose: `Agent Teams (${teamAgents.length})`,
      timeMs: Date.now() - stepStart,
    });

    const combinedOutput = teamResults.map(r => `【${r.name}】\n${r.output}`).join('\n\n');
    ctx.lastOutput = combinedOutput;
    ctx.contentYielded = false;

    // 将黑板内容存入 results
    if (blackboard.size > 0) {
      ctx.results.set(`${node.id}_blackboard`, Object.fromEntries(blackboard));
    }

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'agent_team',
      stepName: `Agent Teams (${teamAgents.map(a => a.name).join(', ')})`,
      result: combinedOutput.slice(0, 500),
      timeMs: Date.now() - stepStart,
    });

    return { output: combinedOutput };
  }

  private async executeAgent(
    agent: any,
    ctx: ExecContext,
    deps: ExecutorDeps,
    blackboard: Map<string, string>,
    resultsSummary: string,
  ): Promise<string> {
    const bbReadTool = {
      type: 'function', function: {
        name: 'blackboard_read', description: '从共享黑板读取数据',
        parameters: { type: 'object', properties: { key: { type: 'string', description: '键名' } }, required: ['key'] },
      },
    };
    const bbWriteTool = {
      type: 'function', function: {
        name: 'blackboard_write', description: '向共享黑板写入数据，其他 Agent 可以读取',
        parameters: {
          type: 'object',
          properties: { key: { type: 'string', description: '键名' }, value: { type: 'string', description: '值' } },
          required: ['key', 'value'],
        },
      },
    };

    const agentTools = [bbReadTool, bbWriteTool, ...buildAgentTools(agent.actions || [], deps.actions)];
    const sysPrompt = `${agent.prompt}\n\n你是 Agent Teams 中的一员，与其他 Agent 并行协作。\n你可以通过 blackboard_write 向共享黑板写入信息，通过 blackboard_read 读取其他 Agent 写入的信息。\n\n提取参数: ${JSON.stringify(ctx.params)}\n${resultsSummary ? `上游节点结果:\n${resultsSummary}` : ''}`;

    const msgs: any[] = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: ctx.userMessage },
    ];

    let reply = '';
    for (let r = 0; r < 5; r++) {
      const resp = await deps.llmClient.chat(msgs, {
        tools: agentTools, toolChoice: 'auto', temperature: 0.7, maxTokens: 4000,
      });

      if (!resp.toolCalls || resp.toolCalls.length === 0) {
        reply = resp.content || '';
        break;
      }

      msgs.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.toolCalls });

      for (const tc of resp.toolCalls) {
        const fn = tc.function.name;
        let args: any;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        let toolResult: string;
        if (fn === 'blackboard_write') {
          blackboard.set(args.key, args.value);
          toolResult = JSON.stringify({ success: true, key: args.key });
        } else if (fn === 'blackboard_read') {
          toolResult = JSON.stringify({ key: args.key, value: blackboard.get(args.key) || null });
        } else {
          const action = deps.actions.get(fn);
          if (action) {
            const result = await action.execute(args, deps.actionContext);
            toolResult = result.output;
          } else {
            toolResult = JSON.stringify({ error: `未知工具: ${fn}` });
          }
        }
        msgs.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
      }
    }

    if (!reply) {
      const last = await deps.llmClient.chat(msgs, { temperature: 0.7, maxTokens: 4000 });
      reply = last.content || '';
    }

    return reply;
  }
}
