import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, llmEvent, toolStartEvent, toolResultEvent } from '../model/sse-events';
import { buildAgentTools } from './shared-utils';

/** 单 Agent 节点 — 调用 Agent 池中的 Agent 执行任务 */
export class AgentExecutor implements INodeExecutor {
  readonly type = 'agent';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const agentId = node.data.agentId;

    if (!agentId) {
      console.warn(`[Workflow] Agent 节点未配置 agentId: ${node.id}`);
      return { output: null };
    }

    const agent = await deps.agentService.getById(agentId);
    if (!agent) {
      console.warn(`[Workflow] Agent 不存在: ${agentId}`);
      return { output: null };
    }

    const llmStart = Date.now();
    yield llmEvent({ stage: 'start', nodeId: node.id, purpose: `Agent: ${agent.name}`, input: ctx.userMessage.slice(0, 200) });

    const resultsSummary = [...ctx.results.entries()]
      .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v)}`)
      .join('\n');

    const systemPrompt = `${agent.prompt}

提取参数: ${JSON.stringify(ctx.params)}
${resultsSummary ? `上游节点结果:\n${resultsSummary}` : ''}`;

    try {
      let agentReply: string;

      if (agent.actions && agent.actions.length > 0) {
        agentReply = yield* this.executeWithTools(agent, systemPrompt, ctx, deps);
      } else {
        const simplePrompt = `${systemPrompt}\n\n用户消息: ${ctx.userMessage}\n\n请根据以上信息回复用户。`;
        agentReply = await deps.llmClient.complete(simplePrompt, { temperature: 0.7, maxTokens: 4000 });
      }

      yield llmEvent({ stage: 'end', nodeId: node.id, purpose: `Agent: ${agent.name}`, timeMs: Date.now() - llmStart });

      ctx.lastOutput = agentReply;
      ctx.contentYielded = false;

      yield stepEvent({
        stepIndex: deps.visitedCount - 1,
        nodeId: node.id,
        stepType: 'agent',
        stepName: `Agent: ${agent.name}`,
        result: agentReply.slice(0, 500),
        timeMs: Date.now() - stepStart,
      });

      return { output: agentReply };
    } catch (err: any) {
      yield llmEvent({ stage: 'end', nodeId: node.id, purpose: `Agent: ${agent.name}`, timeMs: Date.now() - llmStart });
      throw err;
    }
  }

  private async *executeWithTools(
    agent: { actions: string[]; prompt: string; name: string },
    systemPrompt: string,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, string> {
    const agentTools = buildAgentTools(agent.actions, deps.actions);
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: ctx.userMessage },
    ];

    const MAX_ROUNDS = 5;
    let reply = '';

    for (let r = 0; r < MAX_ROUNDS; r++) {
      const resp = await deps.llmClient.chat(messages, {
        tools: agentTools.length > 0 ? agentTools : undefined,
        toolChoice: agentTools.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
        maxTokens: 4000,
      });

      if (!resp.toolCalls || resp.toolCalls.length === 0) {
        reply = resp.content || '';
        break;
      }

      messages.push({
        role: 'assistant', content: resp.content || '',
        tool_calls: resp.toolCalls,
      });

      for (const tc of resp.toolCalls) {
        const actionName = tc.function.name;
        let args: any;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        console.log(`[Workflow] Agent ${agent.name} → Action: ${actionName}(${JSON.stringify(args).slice(0, 80)})`);
        yield toolStartEvent(actionName, args, r + 1);

        const action = deps.actions.get(actionName);
        let toolResult: string;
        if (action) {
          const result = await action.execute(args, deps.actionContext);
          toolResult = result.output;
          yield toolResultEvent(actionName, result.ssePayload || result.output, r + 1);
        } else {
          toolResult = JSON.stringify({ error: `未知工具: ${actionName}` });
        }

        messages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
      }
    }

    if (!reply) {
      const lastResp = await deps.llmClient.chat(messages, { temperature: 0.7, maxTokens: 4000 });
      reply = lastResp.content || '工作流 Agent 执行完成。';
    }

    return reply;
  }
}
