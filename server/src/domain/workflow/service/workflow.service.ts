import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ILLMClient } from '../../ai/port/llm.port';
import { WorkflowEntity } from '../entity/workflow.entity';
import {
  Workflow, WorkflowGraph, CreateWorkflowDTO, UpdateWorkflowDTO,
} from '../model/workflow.model';
import { Action, ActionContext } from '../../ai/action/action.interface';
import { GraphEngineService } from './graph-engine.service';

/**
 * 工作流服务 — CRUD + 意图匹配
 *
 * 图遍历执行委托给 GraphEngineService。
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class WorkflowService {
  @InjectEntityModel(WorkflowEntity)
  workflowRepo: Repository<WorkflowEntity>;

  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  graphEngine: GraphEngineService;

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

    // 关键词预过滤
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

    // LLM 意图匹配
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
      const content = await this.llmClient.complete(prompt, { temperature: 0.1, maxTokens: 200 });
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

  // ==================== 图执行委托 ====================

  /**
   * 执行工作流 — 委托给 GraphEngineService
   */
  executeWorkflow(
    workflow: Workflow,
    userMessage: string,
    actions: Map<string, Action>,
    context: ActionContext
  ): AsyncGenerator<string> {
    return this.graphEngine.executeWorkflow(workflow, userMessage, actions, context);
  }

  // ==================== 工具方法 ====================

  toWorkflow(e: WorkflowEntity): Workflow {
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
