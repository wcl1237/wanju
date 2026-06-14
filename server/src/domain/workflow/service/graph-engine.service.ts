import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { ILLMClient } from '../../ai/port/llm.port';
import { Action, ActionContext } from '../../ai/action/action.interface';
import {
  FlowNode, FlowEdge, FlowNodeData, WorkflowGraph, Workflow, ExecContext,
} from '../model/workflow.model';

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
          if (execCtx.lastOutput && !execCtx.contentYielded) {
            let isStructured = false;
            try {
              const parsed = JSON.parse(execCtx.lastOutput);
              isStructured = typeof parsed === 'object' && parsed !== null;
            } catch { /* not JSON, treat as text */ }

            if (!isStructured) {
              console.log(`[Workflow] 🏁 透传上一节点输出: "${execCtx.lastOutput.slice(0, 60)}..."`);
              yield `data: ${JSON.stringify({ type: 'content', content: execCtx.lastOutput })}\n\n`;
            }
          }

          yield `data: ${JSON.stringify({
            type: 'workflow_step', stepIndex: visited.size - 1, nodeId: node.id,
            stepType: 'end', stepName: node.data.label || '结束',
            output: execCtx.lastOutput ? (typeof execCtx.lastOutput === 'string' ? execCtx.lastOutput.slice(0, 200) : execCtx.lastOutput) : null,
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
}
