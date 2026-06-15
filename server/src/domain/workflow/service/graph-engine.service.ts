import { Provide, Inject, Scope, ScopeEnum, Init } from '@midwayjs/core';
import { ILLMClient } from '../../ai/port/llm.port';
import { Action, ActionContext } from '../../ai/action/action.interface';
import {
  FlowNode, FlowEdge, Workflow, ExecContext,
} from '../model/workflow.model';
import { sseEvent, contentEvent } from '../model/sse-events';
import { AgentService } from '../../agent/service/agent.service';
import { NodeExecutorRegistry, ExecutorDeps, createDefaultRegistry } from '../executor';

/**
 * 工作流图遍历引擎 — 从 trigger 节点出发递归遍历执行
 *
 * 重构: 节点执行逻辑委托给 NodeExecutor 插件，本类仅负责图遍历编排。
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class GraphEngineService {
  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  agentService: AgentService;

  /** 节点执行器注册中心 */
  private registry: NodeExecutorRegistry;

  @Init()
  async init() {
    this.registry = createDefaultRegistry();
    console.log(`[GraphEngine] 初始化完成，已注册 ${this.registry.getRegisteredTypes().length} 种节点类型: [${this.registry.getRegisteredTypes().join(', ')}]`);
  }

  /**
   * 获取 Registry，允许外部注册自定义节点执行器
   */
  getRegistry(): NodeExecutorRegistry {
    return this.registry;
  }

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

    yield sseEvent({
      type: 'workflow_start',
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowIcon: workflow.icon,
      stepCount: nodes.length,
    });

    // 1. 找入口节点（优先 start，兼容 trigger）
    const entryNode = nodes.find(n => n.type === 'start') || nodes.find(n => n.type === 'trigger');
    if (!entryNode) {
      console.error('[Workflow] 未找到入口节点（start 或 trigger）');
      yield sseEvent({ type: 'content', content: '工作流配置错误：缺少开始节点。' });
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
      entryNode.id, adjacency, nodes, actions, context, execCtx, visited
    );

    const totalMs = Date.now() - startTime;
    console.log(`[Workflow] ━━━ 图遍历完成: ${workflow.name} (${totalMs}ms, 访问 ${visited.size} 节点) ━━━`);

    yield sseEvent({
      type: 'workflow_end',
      workflowId: workflow.id,
      workflowName: workflow.name,
      totalSteps: visited.size,
      totalTimeMs: totalMs,
    });
  }

  /**
   * 递归遍历单个节点 — 委托给对应的 NodeExecutor
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
    // 全局步数限制，防止无限循环（不限制节点重复执行）
    execCtx._stepCount = (execCtx._stepCount || 0) + 1;
    if (execCtx._stepCount > 100) {
      console.error(`[Workflow] 达到最大执行步数 (100)，终止执行`);
      return;
    }

    visited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error(`[Workflow] 节点不存在: ${nodeId}`);
      return;
    }

    console.log(`[Workflow] 📌 遍历节点: ${node.type} (${nodeId}) [step ${execCtx._stepCount}]`);

    // 查找执行器
    const executor = this.registry.get(node.type);
    if (!executor) {
      console.warn(`[Workflow] 未注册的节点类型: ${node.type}，跳过`);
      return;
    }

    // 构建依赖
    const deps: ExecutorDeps = {
      llmClient: this.llmClient,
      agentService: this.agentService,
      actions,
      actionContext: context,
      visitedCount: execCtx._stepCount,
    };

    // 执行节点
    let conditionResult: boolean | null = null;
    try {
      const generator = executor.execute(node, execCtx, deps);
      let iterResult = await generator.next();

      while (!iterResult.done) {
        yield iterResult.value as string;
        iterResult = await generator.next();
      }

      // 获取返回值
      const result = iterResult.value;

      if (result.output !== undefined && result.output !== null) {
        execCtx.results.set(nodeId, result.output);
      }
      if (result.conditionResult !== undefined) {
        conditionResult = result.conditionResult;
      }
      if (result.contentYielded !== undefined) {
        execCtx.contentYielded = result.contentYielded;
      }

      // end 节点不再继续遍历
      if (node.type === 'end') {
        return;
      }
    } catch (e: any) {
      console.error(`[Workflow] 节点 ${nodeId} 执行失败:`, e.message);
      yield sseEvent({
        type: 'workflow_step',
        stepIndex: execCtx._stepCount - 1,
        nodeId: node.id,
        stepType: node.type,
        stepName: `${node.data.label || node.type} (失败)`,
        error: e.message,
        timeMs: 0,
      });
    }

    // 检查是否标记为最终回复
    if (node.data.isFinalReply && execCtx.lastOutput) {
      console.log(`[Workflow] 📤 捕获最终回复节点: ${nodeId}`);
      execCtx.finalReplyContent = execCtx.lastOutput;
    }

    // 节点可配置 responseText — 执行后向对话窗口发送固定反馈
    const trimmedResponse = (node.data.responseText || '').trim();
    if (trimmedResponse) {
      const respText = trimmedResponse.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => execCtx.params[key] || `{{${key}}}`);
      yield contentEvent(respText);
      execCtx.lastOutput = respText;
      execCtx.contentYielded = true;
    }

    // 节点可配置 autoAIResponse — 执行后让 AI 根据结果自动生成反馈
    if (node.data.autoAIResponse && !trimmedResponse) {
      try {
        const nodeResult = execCtx.results.get(nodeId) || execCtx.lastOutput || '';
        const customPrompt = node.data.aiResponsePrompt || '';
        const aiPrompt = customPrompt
          ? `${customPrompt}\n\n节点执行结果:\n${typeof nodeResult === 'string' ? nodeResult : JSON.stringify(nodeResult, null, 2)}\n\n用户原始消息: ${execCtx.userMessage}\n\n请直接输出面向用户的回复，不要解释或添加前缀:`
          : `你是客服助手。当前工作流的「${node.data.label || node.type}」节点已执行完成。\n\n节点执行结果:\n${typeof nodeResult === 'string' ? nodeResult : JSON.stringify(nodeResult, null, 2)}\n\n用户原始消息: ${execCtx.userMessage}\n\n请根据上述信息，用简洁友好的语言向用户反馈当前进展。直接输出回复内容:`;

        const aiReply = await deps.llmClient.complete(aiPrompt, { temperature: 0.5, maxTokens: 500 });
        if (aiReply) {
          yield contentEvent(aiReply);
          execCtx.lastOutput = aiReply;
          execCtx.contentYielded = true;
        }
      } catch (e: any) {
        console.error(`[Workflow] AI 反馈生成失败 (${nodeId}):`, e.message);
      }
    }

    // 获取下游节点并递归
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
}
