import { Provide, Inject, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowEntity } from '../entity/workflow.entity';
import { AIConfig } from '../interface';
import { Action, ActionContext } from '../action/base.action';

// ==================== 图结构类型 ====================

export interface FlowNodeData {
  label?: string;
  // trigger
  triggerType?: string; // 'keyword' | 'llm'
  keywords?: string[];
  // condition
  expression?: string;
  conditionField?: string;
  conditionOp?: string; // 'contains' | 'equals' | 'not_empty'
  conditionValue?: string;
  // reply
  replyText?: string;
  // llm_reply
  prompt?: string;
  // extract
  params?: string[];
  extractPrompt?: string;
  // knowledge
  query?: string;
  topK?: number;
  // ticket
  title?: string;
  category?: string;
  ticketPriority?: string;
  ticketDescription?: string;
  // http
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FlowNode {
  id: string;
  type: string; // trigger | reply | llm_reply | condition | knowledge | ticket | extract | http
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // 条件分支: 'true' | 'false'
  targetHandle?: string | null;
}

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerDescription: string;
  graph: WorkflowGraph;
  enabled: boolean;
  mode: 'independent' | 'replace_input';
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowDTO {
  name: string;
  description?: string;
  icon?: string;
  triggerDescription: string;
  graph?: WorkflowGraph;
  mode?: 'independent' | 'replace_input';
  priority?: number;
}

export interface UpdateWorkflowDTO {
  name?: string;
  description?: string;
  icon?: string;
  triggerDescription?: string;
  graph?: WorkflowGraph;
  enabled?: boolean;
  mode?: 'independent' | 'replace_input';
  priority?: number;
}

/** 执行上下文：在图遍历中共享 */
interface ExecContext {
  params: Record<string, string>;
  results: Map<string, any>;
  userMessage: string;
  /** 上一个节点的输出（透传给结束节点） */
  lastOutput: string;
  /** 已经通过 content 事件发送的内容 */
  contentYielded: boolean;
}

// ==================== 服务 ====================

@Provide()
@Scope(ScopeEnum.Singleton)
export class WorkflowService {
  @InjectEntityModel(WorkflowEntity)
  workflowRepo: Repository<WorkflowEntity>;

  @Config('ai')
  aiConfig: AIConfig;

  // ==================== CRUD ====================

  async create(dto: CreateWorkflowDTO): Promise<Workflow> {
    const now = new Date().toISOString();
    const defaultGraph: WorkflowGraph = {
      nodes: [{ id: 'trigger-1', type: 'trigger', position: { x: 300, y: 50 }, data: { label: '触发器' } }],
      edges: [],
    };
    const entity = this.workflowRepo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description || '',
      icon: dto.icon || '🔄',
      triggerDescription: dto.triggerDescription,
      graph: JSON.stringify(dto.graph || defaultGraph),
      enabled: 1,
      mode: dto.mode || 'independent',
      priority: dto.priority || 0,
      createdAt: now,
      updatedAt: now,
    });
    await this.workflowRepo.save(entity);
    return this.toWorkflow(entity);
  }

  async update(id: string, dto: UpdateWorkflowDTO): Promise<Workflow | undefined> {
    const entity = await this.workflowRepo.findOneBy({ id });
    if (!entity) return undefined;
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.icon !== undefined) entity.icon = dto.icon;
    if (dto.triggerDescription !== undefined) entity.triggerDescription = dto.triggerDescription;
    if (dto.graph !== undefined) entity.graph = JSON.stringify(dto.graph);
    if (dto.enabled !== undefined) entity.enabled = dto.enabled ? 1 : 0;
    if (dto.mode !== undefined) entity.mode = dto.mode;
    if (dto.priority !== undefined) entity.priority = dto.priority;
    entity.updatedAt = new Date().toISOString();
    await this.workflowRepo.save(entity);
    return this.toWorkflow(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.workflowRepo.delete(id);
    return (result.affected || 0) > 0;
  }

  async getAll(): Promise<Workflow[]> {
    const rows = await this.workflowRepo.find({ order: { priority: 'DESC', createdAt: 'DESC' } });
    return rows.map(r => this.toWorkflow(r));
  }

  async getById(id: string): Promise<Workflow | undefined> {
    const row = await this.workflowRepo.findOneBy({ id });
    return row ? this.toWorkflow(row) : undefined;
  }

  // ==================== LLM 意图匹配 ====================

  async matchWorkflow(userMessage: string): Promise<Workflow | null> {
    const allEnabled = await this.workflowRepo.find({
      where: { enabled: 1 },
      order: { priority: 'DESC' },
    });
    if (allEnabled.length === 0) return null;

    // ====== 关键词预过滤：检查 trigger 节点中配置的关键词 ======
    const msgLower = userMessage.toLowerCase();
    for (const entity of allEnabled) {
      try {
        const graph = JSON.parse(entity.graph || '{}');
        const triggerNode = (graph.nodes || []).find((n: any) => n.type === 'trigger');
        const keywords: string[] = triggerNode?.data?.keywords || [];
        if (keywords.length > 0 && keywords.some(kw => kw && msgLower.includes(kw.toLowerCase()))) {
          console.log(`[Workflow] ⚡ 关键词命中: "${entity.name}" (跳过 LLM 匹配)`);
          return this.toWorkflow(entity);
        }
      } catch { /* ignore parse errors */ }
    }

    // ====== LLM 意图匹配 ======
    const workflowList = allEnabled
      .map((w, i) => `[${i + 1}] ID: ${w.id}\n   触发条件: ${w.triggerDescription}`)
      .join('\n');

    const prompt = `你是一个意图识别专家。给定用户消息和一组工作流定义，判断用户消息是否触发了某个工作流。

工作流列表:
${workflowList}

用户消息: ${userMessage}

如果用户消息匹配某个工作流，只输出该工作流的 ID。如果不匹配任何工作流，只输出 none。
不要输出其他内容。`;

    try {
      const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.aiConfig.apiKey}` },
        body: JSON.stringify({ model: this.aiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 200 }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      let content = data.choices[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      console.log(`[Workflow] LLM 意图匹配结果: "${content}"`);
      if (content.toLowerCase() === 'none') return null;
      const matchedEntity = allEnabled.find(w => content.includes(w.id));
      if (matchedEntity) {
        console.log(`[Workflow] ✅ 匹配到工作流: ${matchedEntity.name}`);
        return this.toWorkflow(matchedEntity);
      }
      return null;
    } catch (e) {
      console.error('[Workflow] LLM 匹配失败:', e.message);
      return null;
    }
  }

  // ==================== 递归图遍历引擎 ====================

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
          // 触发器：仅作为入口，不执行逻辑
          break;

        case 'end': {
          // 结束节点：透传上一个节点的返回，然后终止遍历
          console.log(`[Workflow] 🏁 到达结束节点: ${nodeId}`);

          // 只透传文本类输出（reply/llm_reply 等），不透传 extract 的 JSON 参数
          if (execCtx.lastOutput && !execCtx.contentYielded) {
            // 检查是否为结构化数据（JSON对象/数组），如果是则不作为 content 直接展示
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
          // 发出 LLM 调用追踪事件
          const extractLLMStart = Date.now();
          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'start', nodeId: node.id, purpose: '参数提取', input: execCtx.userMessage.slice(0, 200) })}\n\n`;

          const params = await this.execExtract(node.data, execCtx.userMessage);
          Object.assign(execCtx.params, params);
          nodeResult = params;
          execCtx.lastOutput = JSON.stringify(params);
          execCtx.contentYielded = false;

          yield `data: ${JSON.stringify({ type: 'workflow_llm', stage: 'end', nodeId: node.id, purpose: '参数提取', timeMs: Date.now() - extractLLMStart })}\n\n`;

          yield `data: ${JSON.stringify({
            type: 'workflow_step',
            stepIndex: visited.size - 1,
            nodeId: node.id,
            stepType: 'extract',
            stepName: node.data.label || '参数提取',
            input: execCtx.userMessage.slice(0, 200),
            params,
            result: params,
            timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'condition': {
          conditionResult = this.execCondition(node.data, execCtx);

          yield `data: ${JSON.stringify({
            type: 'workflow_step',
            stepIndex: visited.size - 1,
            nodeId: node.id,
            stepType: 'condition',
            stepName: node.data.label || '条件判断',
            conditionResult,
            timeMs: Date.now() - stepStart,
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
              input: query,
              result: result.ssePayload || result.output,
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
              input: args,
              result: result.ssePayload || result.output,
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
            result: text,
            timeMs: Date.now() - stepStart,
          })}\n\n`;
          break;
        }

        case 'llm_reply': {
          // LLM 调用追踪
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
            result: replyContent.slice(0, 500),
            timeMs: Date.now() - stepStart,
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

    // 存储结果
    if (nodeResult !== null) {
      execCtx.results.set(nodeId, nodeResult);
    }

    // ---- 获取下游节点并递归 ----
    let nextNodeIds: string[];

    if (node.type === 'condition') {
      // 条件分支：根据结果选择 handle
      const handle = conditionResult ? 'true' : 'false';
      nextNodeIds = adjacency.get(`${nodeId}:${handle}`) || [];
      console.log(`[Workflow] 条件 ${handle} → [${nextNodeIds.join(', ')}]`);
    } else {
      // 普通节点：所有出边
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
      const resp = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.aiConfig.apiKey}` },
        body: JSON.stringify({ model: this.aiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 300 }),
      });
      const d = await resp.json();
      let content = d.choices[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const m = content.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : {};
    } catch { return {}; }
  }

  private execCondition(data: FlowNodeData, ctx: ExecContext): boolean {
    const field = data.conditionField || '';
    const op = data.conditionOp || 'not_empty';
    const value = data.conditionValue || '';

    // 从 userMessage 或 params 中获取字段值
    let fieldValue = ctx.params[field] || '';
    if (field === 'userMessage') fieldValue = ctx.userMessage;

    switch (op) {
      case 'contains': return fieldValue.includes(value);
      case 'equals': return fieldValue === value;
      case 'not_empty': return fieldValue.length > 0;
      case 'has_result': {
        // 检查是否有任何节点结果
        return ctx.results.size > 0;
      }
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
      const resp = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.aiConfig.apiKey}` },
        body: JSON.stringify({ model: this.aiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 800 }),
      });
      const d = await resp.json();
      let content = d.choices[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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

  /** 构建邻接表：nodeId → [targetIds], nodeId:handle → [targetIds] */
  private buildAdjacency(edges: FlowEdge[]): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const edge of edges) {
      // 带 handle 的 key（用于条件分支）
      if (edge.sourceHandle) {
        const key = `${edge.source}:${edge.sourceHandle}`;
        if (!adj.has(key)) adj.set(key, []);
        adj.get(key)!.push(edge.target);
      }
      // 通用 key
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

  private toWorkflow(e: WorkflowEntity): Workflow {
    let graph: WorkflowGraph = { nodes: [], edges: [] };
    try { graph = JSON.parse(e.graph || '{"nodes":[],"edges":[]}'); } catch { /* */ }
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      icon: e.icon || '🔄',
      triggerDescription: e.triggerDescription,
      graph,
      enabled: e.enabled === 1,
      mode: (e.mode as any) || 'independent',
      priority: e.priority || 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
