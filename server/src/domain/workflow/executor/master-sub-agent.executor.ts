import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, llmEvent, toolStartEvent, toolResultEvent } from '../model/sse-events';
import { buildAgentTools } from './shared-utils';

/** Master-Sub Agent 节点 — Master 编排 Sub Agent 协作 */
export class MasterSubAgentExecutor implements INodeExecutor {
  readonly type = 'master_sub_agent';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const masterId = node.data.masterAgentId;
    const subIds = node.data.subAgentIds || [];

    if (!masterId) {
      console.warn(`[Workflow] Master-Sub 节点未配置 masterAgentId: ${node.id}`);
      return { output: null };
    }

    const masterAgent = await deps.agentService.getById(masterId);
    if (!masterAgent) {
      console.warn(`[Workflow] Master Agent 不存在: ${masterId}`);
      return { output: null };
    }

    const subAgents = (await Promise.all(subIds.map((id: string) => deps.agentService.getById(id))))
      .filter(a => a !== undefined);

    yield llmEvent({ stage: 'start', nodeId: node.id, purpose: `Master: ${masterAgent.name}`, input: ctx.userMessage.slice(0, 200) });

    const resultsSummary = [...ctx.results.entries()]
      .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v)}`)
      .join('\n');

    // 构建 call_sub_agent 工具
    const subAgentTool = {
      type: 'function', function: {
        name: 'call_sub_agent',
        description: `调用一个 Sub Agent 执行任务。可用的 Sub Agent: ${subAgents.map(a => `"${a.name}" (${a.description || '无描述'})`).join('; ')}`,
        parameters: {
          type: 'object',
          properties: {
            agent_name: { type: 'string', description: '要调用的 Sub Agent 名称', enum: subAgents.map(a => a.name) },
            task: { type: 'string', description: '分配给 Sub Agent 的任务描述' },
          },
          required: ['agent_name', 'task'],
        },
      },
    };

    const masterTools = [subAgentTool, ...buildAgentTools(masterAgent.actions || [], deps.actions)];

    const masterSysPrompt = `${masterAgent.prompt}\n\n你是 Master Agent，负责编排和协调以下 Sub Agent：\n${subAgents.map(a => `- ${a.name}: ${a.description || '无描述'}`).join('\n')}\n\n使用 call_sub_agent 工具来分配任务给合适的 Sub Agent。你可以多次调用不同的 Sub Agent，然后综合他们的结果给出最终回复。\n\n提取参数: ${JSON.stringify(ctx.params)}\n${resultsSummary ? `上游节点结果:\n${resultsSummary}` : ''}`;

    const masterMsgs: any[] = [
      { role: 'system', content: masterSysPrompt },
      { role: 'user', content: ctx.userMessage },
    ];

    let masterReply = '';
    const MAX_ROUNDS = 8;

    for (let r = 0; r < MAX_ROUNDS; r++) {
      const resp = await deps.llmClient.chat(masterMsgs, {
        tools: masterTools, toolChoice: 'auto', temperature: 0.7, maxTokens: 4000,
      });

      if (!resp.toolCalls || resp.toolCalls.length === 0) {
        masterReply = resp.content || '';
        break;
      }

      masterMsgs.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.toolCalls });

      for (const tc of resp.toolCalls) {
        const fn = tc.function.name;
        let args: any;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        let toolResult: string;

        if (fn === 'call_sub_agent') {
          toolResult = yield* this.executeSubAgent(args, subAgents, ctx, deps, r);
        } else {
          const action = deps.actions.get(fn);
          if (action) {
            const result = await action.execute(args, deps.actionContext);
            toolResult = result.output;
          } else {
            toolResult = JSON.stringify({ error: `未知工具: ${fn}` });
          }
        }

        masterMsgs.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
      }
    }

    if (!masterReply) {
      const lastMaster = await deps.llmClient.chat(masterMsgs, { temperature: 0.7, maxTokens: 4000 });
      masterReply = lastMaster.content || '编排完成。';
    }

    yield llmEvent({ stage: 'end', nodeId: node.id, purpose: `Master: ${masterAgent.name}`, timeMs: Date.now() - stepStart });

    ctx.lastOutput = masterReply;
    ctx.contentYielded = false;

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'master_sub_agent',
      stepName: `Master: ${masterAgent.name}`,
      result: masterReply.slice(0, 500),
      timeMs: Date.now() - stepStart,
    });

    return { output: masterReply };
  }

  /** 执行 Sub Agent */
  private async *executeSubAgent(
    args: any,
    subAgents: any[],
    ctx: ExecContext,
    deps: ExecutorDeps,
    round: number,
  ): AsyncGenerator<string, string> {
    const subAgent = subAgents.find(a => a.name === args.agent_name);
    if (!subAgent) {
      return JSON.stringify({ error: `Sub Agent 不存在: ${args.agent_name}` });
    }

    console.log(`[Workflow] Master → Sub ${subAgent.name}: "${(args.task || '').slice(0, 60)}"`);
    yield toolStartEvent(`sub_agent:${subAgent.name}`, { task: args.task }, round + 1);

    const subPrompt = `${subAgent.prompt}\n\n你是被 Master Agent 调用的 Sub Agent。\nMaster 分配的任务: ${args.task}\n用户原始消息: ${ctx.userMessage}\n提取参数: ${JSON.stringify(ctx.params)}`;

    const subMsgs: any[] = [
      { role: 'system', content: subPrompt },
      { role: 'user', content: args.task },
    ];

    const subTools = buildAgentTools(subAgent.actions || [], deps.actions);
    let subReply = '';

    for (let sr = 0; sr < 3; sr++) {
      const subResp = await deps.llmClient.chat(subMsgs, {
        tools: subTools.length > 0 ? subTools : undefined,
        toolChoice: subTools.length > 0 ? 'auto' : undefined,
        temperature: 0.7, maxTokens: 4000,
      });

      if (!subResp.toolCalls || subResp.toolCalls.length === 0) {
        subReply = subResp.content || '';
        break;
      }

      subMsgs.push({ role: 'assistant', content: subResp.content || '', tool_calls: subResp.toolCalls });
      for (const stc of subResp.toolCalls) {
        const sfn = stc.function.name;
        let sargs: any;
        try { sargs = JSON.parse(stc.function.arguments); } catch { sargs = {}; }
        const saction = deps.actions.get(sfn);
        const sresult = saction ? (await saction.execute(sargs, deps.actionContext)).output : JSON.stringify({ error: `未知工具: ${sfn}` });
        subMsgs.push({ role: 'tool', content: sresult, tool_call_id: stc.id });
      }
    }

    if (!subReply) {
      const lastSub = await deps.llmClient.chat(subMsgs, { temperature: 0.7, maxTokens: 4000 });
      subReply = lastSub.content || '';
    }

    yield toolResultEvent(`sub_agent:${subAgent.name}`, subReply.slice(0, 500), round + 1);
    return subReply;
  }
}
