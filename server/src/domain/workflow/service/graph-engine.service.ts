import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { ILLMClient } from '../../ai/port/llm.port';
import { Action, ActionContext } from '../../ai/action/action.interface';
import {
  FlowNode, FlowEdge, FlowNodeData, WorkflowGraph, Workflow, ExecContext,
} from '../model/workflow.model';
import { AgentService } from '../../agent/service/agent.service';

/**
 * 工作流图遍历引擎 — 从 trigger 节点出发递归遍历执行
 *
 * 从 WorkflowService 中提取的纯引擎逻辑，职责单一。
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class GraphEngineService {
  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  agentService: AgentService;

  /**
   * 执行工作流 — 从 trigger 节点出发递归遍历图
   */
  async *executeWorkflow(
    workflow: Workflow,
    userMessage: string,
    actions: Map<string, Action>,
    context: ActionContext
  ): AsyncGenerator<string> {
    const startTime = Date.now();
    const { nodes, edges } = workflow.graph;

    console.log(`[Workflow] ━━━ 开始图遍历: ${workflow.name} (${nodes.length} 节点, ${edges.length} 边) ━━━`);

    yield `data: ${JSON.stringify({
      type: 'workflow_start',
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowIcon: workflow.icon,
      stepCount: nodes.length,
    })}\n\n`;

    // 1. 找 trigger 节点
    const triggerNode = nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
      console.error('[Workflow] 未找到 trigger 节点');
      yield `data: ${JSON.stringify({ type: 'content', content: '工作流配置错误：缺少触发器节点。' })}\n\n`;
      return;
    }

    // 2. 构建邻接表
    const adjacency = this.buildAdjacency(edges);

    // 3. 初始化执行上下文
    const execCtx: ExecContext = {
      params: {},
      results: new Map(),
      userMessage,
      lastOutput: '',
      contentYielded: false,
    };

    // 4. 递归遍历
    const visited = new Set<string>();
    yield* this.traverseNode(
      triggerNode.id, adjacency, nodes, actions, context, execCtx, visited
    );

    const totalMs = Date.now() - startTime;
    console.log(`[Workflow] ━━━ 图遍历完成: ${workflow.name} (${totalMs}ms, 访问 ${visited.size} 节点) ━━━`);

    yield `data: ${JSON.stringify({
      type: 'workflow_end',
      workflowId: workflow.id,
      workflowName: workflow.name,
      totalSteps: visited.size,
      totalTimeMs: totalMs,
    })}\n\n`;
  }

  /**
   * 递归遍历单个节点
   */
  private async *traverseNode(
    nodeId: string,
    adjacency: Map<string, string[]>,
    nodes: FlowNode[],
    actions: Map<string, Action>,
    context: ActionContext,
    execCtx: ExecContext,
    visited: Set<string>
  ): AsyncGenerator<string> {
    // 防环
    if (visited.has(nodeId)) {
      console.warn(`[Workflow] 跳过已访问节点: ${nodeId}`);
      return;
    }
    visited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error(`[Workflow] 节点不存在: ${nodeId}`);
      return;
    }

    console.log(`[Workflow] 📌 遍历节点: ${node.type} (${nodeId})`);
    const stepStart = Date.now();

    // ---- 执行节点 ----
    let nodeResult: any = null;
    let conditionResult: boolean | null = null;

    try {
      switch (node.type) {
        case 'trigger':
          break;

        case 'end': {
          console.log(`[Workflow] 🏁 到达结束节点: ${nodeId}`);
          // 优先使用标记为“最终回复”的节点输出
          const finalContent = execCtx.finalReplyContent ?? execCtx.lastOutput;
          if (finalContent && !execCtx.contentYielded) {
            let isStructured = false;
            try {
              const parsed = JSON.parse(finalContent);
              isStructured = typeof parsed === 'object' && parsed !== null;
            } catch { /* not JSON, treat as text */ }

            if (!isStructured) {
              console.log(`[Workflow] 🏁 输出最终回复: "${finalContent.slice(0, 60)}..."`);
              yield `data: ${JSON.stringify({ type: 'content', content: finalContent })}\n\n`;
            }
          }

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'end', stepName: node.data.label || '结束',
            output: finalContent ? (typeof finalContent === 'string' ? finalContent.slice(0, 200) : finalContent) : null,
            timeMs: Date.now() - stepStart,
          })}\n\n`;
          return;
        }

        case 'extract': {
          const extractLLMStart = Date.now();
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'start', nodeId: node.id, purpose: '参数提取', input: execCtx.userMessage.slice(0, 200) })}\n\n`;

          const params = await this.execExtract(node.data, execCtx.userMessage);
          Object.assign(execCtx.params, params);
          nodeResult = params;
          execCtx.lastOutput = JSON.stringify(params);
          execCtx.contentYielded = false;

          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: '参数提取', timeMs: Date.now() - extractLLMStart })}\n\n`;

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'extract', stepName: node.data.label || '参数提取',
            input: execCtx.userMessage.slice(0, 200), params, result: params,
            timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'condition': {
          conditionResult = this.execCondition(node.data, execCtx);
          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'condition', stepName: node.data.label || '条件判断',
            conditionResult, timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'knowledge': {
          const searchAction = actions.get('search_knowledge');
          if (searchAction) {
            const query = this.templateReplace(node.data.query || execCtx.userMessage, execCtx.params);
            yield `data: ${JSON.stringify({ type: 'tool_start', tool: 'search_knowledge', args: { query }, round: 1 })}\n\n`;

            const result = await searchAction.execute({ query, topK: node.data.topK || 3 }, context);
            nodeResult = result.output;
            execCtx.results.set(nodeId, result.output);
            execCtx.lastOutput = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
            execCtx.contentYielded = false;

            yield `data: ${JSON.stringify({
              type: 'tool_result', tool: 'search_knowledge',
              result: result.ssePayload || result.output, round: 1, timeMs: Date.now() - stepStart,
            })}\n\n`;

            yield `data: ${JSON.stringify({
              type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
              stepType: 'knowledge', stepName: node.data.label || '知识检索',
              input: query, result: result.ssePayload || result.output,
              timeMs: Date.now() - stepStart,
            })}\n\n`;
          }
          break;
        }

        case 'ticket': {
          const ticketAction = actions.get('create_ticket');
          if (ticketAction) {
            const args = {
              title: this.templateReplace(node.data.title || '', execCtx.params),
              category: node.data.category || 'general',
              priority: node.data.ticketPriority || 'medium',
              description: this.templateReplace(node.data.ticketDescription || '', execCtx.params),
            };
            yield `data: ${JSON.stringify({ type: 'tool_start', tool: 'create_ticket', args, round: 1 })}\n\n`;

            const result = await ticketAction.execute(args, context);
            nodeResult = result.output;
            execCtx.results.set(nodeId, result.output);
            execCtx.lastOutput = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
            execCtx.contentYielded = false;

            yield `data: ${JSON.stringify({
              type: 'tool_result', tool: 'create_ticket',
              result: result.ssePayload || result.output, round: 1, timeMs: Date.now() - stepStart,
            })}\n\n`;

            yield `data: ${JSON.stringify({
              type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
              stepType: 'ticket', stepName: node.data.label || '创建工单',
              input: args, result: result.ssePayload || result.output,
              timeMs: Date.now() - stepStart,
            })}\n\n`;
          }
          break;
        }

        case 'reply': {
          const text = this.templateReplace(node.data.replyText || '', execCtx.params);
          yield `data: ${JSON.stringify({ type: 'content', content: text })}\n\n`;
          execCtx.lastOutput = text;
          execCtx.contentYielded = true;

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'reply', stepName: node.data.label || '消息回复',
            result: text, timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'llm_reply': {
          const llmStart = Date.now();
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'start', nodeId: node.id, purpose: 'AI 生成回复', input: execCtx.userMessage.slice(0, 200) })}\n\n`;

          const replyContent = await this.execLLMReply(node.data, execCtx);
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: 'AI 生成回复', timeMs: Date.now() - llmStart })}\n\n`;

          yield `data: ${JSON.stringify({ type: 'content', content: replyContent })}\n\n`;
          execCtx.lastOutput = replyContent;
          execCtx.contentYielded = true;

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'llm_reply', stepName: node.data.label || 'AI 生成',
            result: replyContent.slice(0, 500), timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'http': {
          nodeResult = await this.execHTTP(node.data, execCtx);
          execCtx.results.set(nodeId, nodeResult);
          execCtx.lastOutput = typeof nodeResult === 'string' ? nodeResult : JSON.stringify(nodeResult);
          execCtx.contentYielded = false;

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'http', stepName: node.data.label || 'HTTP 请求',
            input: node.data.url,
            result: typeof nodeResult === 'string' ? nodeResult.slice(0, 500) : nodeResult,
            timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'agent': {
          const agentId = node.data.agentId;
          if (!agentId) {
            console.warn(`[Workflow] Agent 节点未配置 agentId: ${nodeId}`);
            break;
          }
          const agent = await this.agentService.getById(agentId);
          if (!agent) {
            console.warn(`[Workflow] Agent 不存在: ${agentId}`);
            break;
          }

          const agentLLMStart = Date.now();
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'start', nodeId: node.id, purpose: `Agent: ${agent.name}`, input: execCtx.userMessage.slice(0, 200) })}\n\n`;

          const resultsSummary = [...execCtx.results.entries()]
            .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v).slice(0, 500)}`)
            .join('\n');

          const agentSystemPrompt = `${agent.prompt}

提取参数: ${JSON.stringify(execCtx.params)}
${resultsSummary ? `上游节点结果:\n${resultsSummary}` : ''}`;

          try {
            let agentReply: string;

            // 如果 Agent 配置了 actions，使用 function calling + ReAct 循环
            if (agent.actions && agent.actions.length > 0) {
              const agentTools = this.buildAgentTools(agent.actions, actions);
              const agentMessages: any[] = [
                { role: 'system', content: agentSystemPrompt },
                { role: 'user', content: execCtx.userMessage },
              ];

              const MAX_AGENT_ROUNDS = 5;
              agentReply = '';

              for (let r = 0; r < MAX_AGENT_ROUNDS; r++) {
                const resp = await this.llmClient.chat(agentMessages, {
                  tools: agentTools.length > 0 ? agentTools : undefined,
                  toolChoice: agentTools.length > 0 ? 'auto' : undefined,
                  temperature: 0.7,
                  maxTokens: 1000,
                });

                if (!resp.toolCalls || resp.toolCalls.length === 0) {
                  agentReply = resp.content || '';
                  break;
                }

                // 有 tool calls → 执行工具
                agentMessages.push({
                  role: 'assistant', content: resp.content || '',
                  tool_calls: resp.toolCalls,
                });

                for (const tc of resp.toolCalls) {
                  const actionName = tc.function.name;
                  let args: any;
                  try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

                  console.log(`[Workflow] Agent ${agent.name} → Action: ${actionName}(${JSON.stringify(args).slice(0, 80)})`);
                  yield `data: ${JSON.stringify({ type: 'tool_start', tool: actionName, args, round: r + 1 })}\n\n`;

                  const action = actions.get(actionName);
                  let toolResult: string;
                  if (action) {
                    const result = await action.execute(args, context);
                    toolResult = result.output;
                    yield `data: ${JSON.stringify({ type: 'tool_result', tool: actionName, result: result.ssePayload || result.output, round: r + 1 })}\n\n`;
                  } else {
                    toolResult = JSON.stringify({ error: `未知工具: ${actionName}` });
                  }

                  agentMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
                }
              }

              if (!agentReply) {
                // 超过最大轮次，取最后内容
                const lastResp = await this.llmClient.chat(agentMessages, { temperature: 0.7, maxTokens: 1000 });
                agentReply = lastResp.content || '工作流 Agent 执行完成。';
              }
            } else {
              // 无 actions，简单 complete
              const simplePrompt = `${agentSystemPrompt}\n\n用户消息: ${execCtx.userMessage}\n\n请根据以上信息回复用户。`;
              agentReply = await this.llmClient.complete(simplePrompt, { temperature: 0.7, maxTokens: 1000 });
            }

            yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: `Agent: ${agent.name}`, timeMs: Date.now() - agentLLMStart })}\n\n`;

            nodeResult = agentReply;
            execCtx.lastOutput = agentReply;
            execCtx.contentYielded = false;

            yield `data: ${JSON.stringify({
              type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
              stepType: 'agent', stepName: `Agent: ${agent.name}`,
              result: agentReply.slice(0, 500), timeMs: Date.now() - stepStart,
            })}\n\n`;
          } catch (agentErr) {
            yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: `Agent: ${agent.name}`, timeMs: Date.now() - agentLLMStart })}\n\n`;
            throw agentErr;
          }
          break;
        }

        case 'agent_team': {
          const agentIds = node.data.agentIds || [];
          if (agentIds.length === 0) {
            console.warn(`[Workflow] Agent Teams 节点未配置 agentIds: ${nodeId}`);
            break;
          }

          const teamAgents = (await Promise.all(agentIds.map(id => this.agentService.getById(id))))
            .filter(a => a !== undefined);

          if (teamAgents.length === 0) { break; }

          const teamStart = Date.now();
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'start', nodeId: node.id, purpose: `Agent Teams (${teamAgents.length})`, input: execCtx.userMessage.slice(0, 200) })}\n\n`;

          // 共享黑板
          const blackboard = new Map<string, string>();

          const resultsSummary = [...execCtx.results.entries()]
            .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v).slice(0, 500)}`)
            .join('\n');

          // 并行执行所有 Agent
          const teamResults = await Promise.all(teamAgents.map(async (agent) => {
            const bbReadTool = {
              type: 'function', function: {
                name: 'blackboard_read', description: '从共享黑板读取数据',
                parameters: { type: 'object', properties: { key: { type: 'string', description: '键名' } }, required: ['key'] },
              },
            };
            const bbWriteTool = {
              type: 'function', function: {
                name: 'blackboard_write', description: '向共享黑板写入数据，其他 Agent 可以读取',
                parameters: { type: 'object', properties: { key: { type: 'string', description: '键名' }, value: { type: 'string', description: '值' } }, required: ['key', 'value'] },
              },
            };

            const agentTools = [bbReadTool, bbWriteTool, ...this.buildAgentTools(agent.actions || [], actions)];
            const sysPrompt = `${agent.prompt}\n\n你是 Agent Teams 中的一员，与其他 Agent 并行协作。\n你可以通过 blackboard_write 向共享黑板写入信息，通过 blackboard_read 读取其他 Agent 写入的信息。\n\n提取参数: ${JSON.stringify(execCtx.params)}\n${resultsSummary ? `上游节点结果:\n${resultsSummary}` : ''}`;

            const msgs: any[] = [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: execCtx.userMessage },
            ];

            let reply = '';
            for (let r = 0; r < 5; r++) {
              const resp = await this.llmClient.chat(msgs, {
                tools: agentTools, toolChoice: 'auto', temperature: 0.7, maxTokens: 800,
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
                  const action = actions.get(fn);
                  if (action) {
                    const result = await action.execute(args, context);
                    toolResult = result.output;
                  } else {
                    toolResult = JSON.stringify({ error: `未知工具: ${fn}` });
                  }
                }
                msgs.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
              }
            }

            if (!reply) {
              const last = await this.llmClient.chat(msgs, { temperature: 0.7, maxTokens: 800 });
              reply = last.content || '';
            }

            return { name: agent.name, output: reply };
          }));

          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: `Agent Teams (${teamAgents.length})`, timeMs: Date.now() - teamStart })}\n\n`;

          const combinedOutput = teamResults.map(r => `【${r.name}】\n${r.output}`).join('\n\n');
          nodeResult = combinedOutput;
          execCtx.lastOutput = combinedOutput;
          execCtx.contentYielded = false;

          // 将黑板内容也存入 results
          if (blackboard.size > 0) {
            execCtx.results.set(`${nodeId}_blackboard`, Object.fromEntries(blackboard));
          }

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'agent_team', stepName: `Agent Teams (${teamAgents.map(a => a.name).join(', ')})`,
            result: combinedOutput.slice(0, 500), timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'master_sub_agent': {
          const masterId = node.data.masterAgentId;
          const subIds = node.data.subAgentIds || [];

          if (!masterId) {
            console.warn(`[Workflow] Master-Sub 节点未配置 masterAgentId: ${nodeId}`);
            break;
          }

          const masterAgent = await this.agentService.getById(masterId);
          if (!masterAgent) {
            console.warn(`[Workflow] Master Agent 不存在: ${masterId}`);
            break;
          }

          const subAgents = (await Promise.all(subIds.map(id => this.agentService.getById(id))))
            .filter(a => a !== undefined);

          const masterStart = Date.now();
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'start', nodeId: node.id, purpose: `Master: ${masterAgent.name}`, input: execCtx.userMessage.slice(0, 200) })}\n\n`;

          const resultsSummaryMS = [...execCtx.results.entries()]
            .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v).slice(0, 500)}`)
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

          const masterTools = [subAgentTool, ...this.buildAgentTools(masterAgent.actions || [], actions)];

          const masterSysPrompt = `${masterAgent.prompt}\n\n你是 Master Agent，负责编排和协调以下 Sub Agent：\n${subAgents.map(a => `- ${a.name}: ${a.description || '无描述'}`).join('\n')}\n\n使用 call_sub_agent 工具来分配任务给合适的 Sub Agent。你可以多次调用不同的 Sub Agent，然后综合他们的结果给出最终回复。\n\n提取参数: ${JSON.stringify(execCtx.params)}\n${resultsSummaryMS ? `上游节点结果:\n${resultsSummaryMS}` : ''}`;

          const masterMsgs: any[] = [
            { role: 'system', content: masterSysPrompt },
            { role: 'user', content: execCtx.userMessage },
          ];

          let masterReply = '';
          const MAX_MASTER_ROUNDS = 8;

          for (let r = 0; r < MAX_MASTER_ROUNDS; r++) {
            const resp = await this.llmClient.chat(masterMsgs, {
              tools: masterTools, toolChoice: 'auto', temperature: 0.7, maxTokens: 1000,
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
                const subAgent = subAgents.find(a => a.name === args.agent_name);
                if (!subAgent) {
                  toolResult = JSON.stringify({ error: `Sub Agent 不存在: ${args.agent_name}` });
                } else {
                  console.log(`[Workflow] Master ${masterAgent.name} → Sub ${subAgent.name}: "${(args.task || '').slice(0, 60)}"`);
                  yield `data: ${JSON.stringify({ type: 'tool_start', tool: `sub_agent:${subAgent.name}`, args: { task: args.task }, round: r + 1 })}\n\n`;

                  // 执行 Sub Agent
                  const subPrompt = `${subAgent.prompt}\n\n你是被 Master Agent 调用的 Sub Agent。\nMaster 分配的任务: ${args.task}\n用户原始消息: ${execCtx.userMessage}\n提取参数: ${JSON.stringify(execCtx.params)}`;

                  const subMsgs: any[] = [
                    { role: 'system', content: subPrompt },
                    { role: 'user', content: args.task },
                  ];

                  const subTools = this.buildAgentTools(subAgent.actions || [], actions);
                  let subReply = '';

                  for (let sr = 0; sr < 3; sr++) {
                    const subResp = await this.llmClient.chat(subMsgs, {
                      tools: subTools.length > 0 ? subTools : undefined,
                      toolChoice: subTools.length > 0 ? 'auto' : undefined,
                      temperature: 0.7, maxTokens: 800,
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
                      const saction = actions.get(sfn);
                      const sresult = saction ? (await saction.execute(sargs, context)).output : JSON.stringify({ error: `未知工具: ${sfn}` });
                      subMsgs.push({ role: 'tool', content: sresult, tool_call_id: stc.id });
                    }
                  }

                  if (!subReply) {
                    const lastSub = await this.llmClient.chat(subMsgs, { temperature: 0.7, maxTokens: 800 });
                    subReply = lastSub.content || '';
                  }

                  toolResult = subReply;
                  yield `data: ${JSON.stringify({ type: 'tool_result', tool: `sub_agent:${subAgent.name}`, result: subReply.slice(0, 500), round: r + 1 })}\n\n`;
                }
              } else {
                // Master 自身的 action
                const action = actions.get(fn);
                if (action) {
                  const result = await action.execute(args, context);
                  toolResult = result.output;
                } else {
                  toolResult = JSON.stringify({ error: `未知工具: ${fn}` });
                }
              }

              masterMsgs.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
            }
          }

          if (!masterReply) {
            const lastMaster = await this.llmClient.chat(masterMsgs, { temperature: 0.7, maxTokens: 1000 });
            masterReply = lastMaster.content || '编排完成。';
          }

          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: `Master: ${masterAgent.name}`, timeMs: Date.now() - masterStart })}\n\n`;

          nodeResult = masterReply;
          execCtx.lastOutput = masterReply;
          execCtx.contentYielded = false;

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'master_sub_agent', stepName: `Master: ${masterAgent.name}`,
            result: masterReply.slice(0, 500), timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }
      }
    } catch (e) {
      console.error(`[Workflow] 节点 ${nodeId} 执行失败:`, e.message);
      yield `data: ${JSON.stringify({
        type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
        stepType: node.type, stepName: `${node.data.label || node.type} (失败)`,
        error: e.message, timeMs: Date.now() - stepStart,
      })}\n\n`;
    }

    if (nodeResult !== null) {
      execCtx.results.set(nodeId, nodeResult);
    }

    // 检查是否标记为最终回复，后面的覆盖前面的
    if (node.data.isFinalReply && execCtx.lastOutput) {
      console.log(`[Workflow] 📤 捕获最终回复节点: ${nodeId}`);
      execCtx.finalReplyContent = execCtx.lastOutput;
    }

    // ---- 获取下游节点并递归 ----
    let nextNodeIds: string[];

    if (node.type === 'condition') {
      const handle = conditionResult ? 'true' : 'false';
      nextNodeIds = adjacency.get(`${nodeId}:${handle}`) || [];
      console.log(`[Workflow] 条件 ${handle} → [${nextNodeIds.join(', ')}]`);
    } else {
      nextNodeIds = adjacency.get(nodeId) || [];
    }

    for (const nextId of nextNodeIds) {
      yield* this.traverseNode(nextId, adjacency, nodes, actions, context, execCtx, visited);
    }
  }

  // ==================== 节点执行器 ====================

  private async execExtract(data: FlowNodeData, userMessage: string): Promise<Record<string, string>> {
    const paramsList = (data.params || []).join('、');
    const prompt = `从以下用户消息中提取指定参数。${data.extractPrompt || ''}

需要提取的参数: ${paramsList}
用户消息: ${userMessage}

请以 JSON 格式输出: {"参数名": "值"}。无法提取的设为空字符串。只输出 JSON。`;

    try {
      const content = await this.llmClient.complete(prompt, { temperature: 0.1, maxTokens: 300 });
      const m = content.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : {};
    } catch { return {}; }
  }

  private execCondition(data: FlowNodeData, ctx: ExecContext): boolean {
    const field = data.conditionField || '';
    const op = data.conditionOp || 'not_empty';
    const value = data.conditionValue || '';

    let fieldValue = ctx.params[field] || '';
    if (field === 'userMessage') fieldValue = ctx.userMessage;

    switch (op) {
      case 'contains': return fieldValue.includes(value);
      case 'equals': return fieldValue === value;
      case 'not_empty': return fieldValue.length > 0;
      case 'has_result': return ctx.results.size > 0;
      default: return true;
    }
  }

  private async execLLMReply(data: FlowNodeData, ctx: ExecContext): Promise<string> {
    const customPrompt = data.prompt || '根据上下文生成友好的回复';
    const resultsSummary = [...ctx.results.entries()]
      .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v).slice(0, 500)}`)
      .join('\n');

    const prompt = `${customPrompt}

用户消息: ${ctx.userMessage}
提取参数: ${JSON.stringify(ctx.params)}
执行结果:
${resultsSummary}

请生成面向用户的友好回复。不要暴露内部实现。`;

    try {
      const content = await this.llmClient.complete(prompt, { temperature: 0.7, maxTokens: 800 });
      return content || '工作流执行完成。';
    } catch { return '工作流已执行完成。'; }
  }

  private async execHTTP(data: FlowNodeData, ctx: ExecContext): Promise<any> {
    const url = this.templateReplace(data.url || '', ctx.params);
    const method = data.method || 'GET';
    console.log(`[Workflow] HTTP ${method} ${url}`);
    try {
      const resp = await fetch(url, {
        method,
        headers: data.headers || {},
        body: method !== 'GET' ? this.templateReplace(data.body || '', ctx.params) : undefined,
      });
      return await resp.text();
    } catch (e) {
      console.error('[Workflow] HTTP 请求失败:', e.message);
      return { error: e.message };
    }
  }

  // ==================== 工具方法 ====================

  /** 构建邻接表 */
  private buildAdjacency(edges: FlowEdge[]): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.sourceHandle) {
        const key = `${edge.source}:${edge.sourceHandle}`;
        if (!adj.has(key)) adj.set(key, []);
        adj.get(key)!.push(edge.target);
      }
      const key = edge.source;
      if (!adj.has(key)) adj.set(key, []);
      adj.get(key)!.push(edge.target);
    }
    return adj;
  }

  /** 模板替换 {{paramName}} */
  private templateReplace(template: string, params: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] || '');
  }

  /** 根据 Agent 配置的 action 名称列表，从全局 actions 中筛选并构建 tools */
  private buildAgentTools(agentActions: string[], allActions: Map<string, Action>): any[] {
    const tools: any[] = [];
    for (const actionName of agentActions) {
      const action = allActions.get(actionName);
      if (action) {
        const def = action.definition();
        tools.push({
          type: 'function',
          function: { name: def.name, description: def.description, parameters: def.parameters },
        });
      }
    }
    return tools;
  }
}
