/**
 * 工作流仓储实现 — TypeORM
 */

import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowEntity } from '../../domain/workflow/entity/workflow.entity';
import {
  Workflow, WorkflowGraph, CreateWorkflowDTO, UpdateWorkflowDTO,
} from '../../domain/workflow/model/workflow.model';
import { IWorkflowRepository } from '../../domain/workflow/port/workflow.repository';

@Provide('workflowRepository')
@Scope(ScopeEnum.Singleton)
export class TypeOrmWorkflowRepository implements IWorkflowRepository {
  @InjectEntityModel(WorkflowEntity)
  repo: Repository<WorkflowEntity>;

  async create(dto: CreateWorkflowDTO): Promise<Workflow> {
    const now = new Date().toISOString();
    const defaultGraph: WorkflowGraph = {
      nodes: [{ id: 'trigger-1', type: 'trigger', position: { x: 300, y: 50 }, data: { label: '触发器' } }],
      edges: [],
    };
    const entity = this.repo.create({
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
    await this.repo.save(entity);
    return this.toModel(entity);
  }

  async update(id: string, dto: UpdateWorkflowDTO): Promise<Workflow | undefined> {
    const entity = await this.repo.findOneBy({ id });
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
    await this.repo.save(entity);
    return this.toModel(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected || 0) > 0;
  }

  async findAll(): Promise<Workflow[]> {
    const rows = await this.repo.find({ order: { priority: 'DESC', createdAt: 'DESC' } });
    return rows.map(r => this.toModel(r));
  }

  async findById(id: string): Promise<Workflow | undefined> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toModel(row) : undefined;
  }

  async findAllEnabled(): Promise<Workflow[]> {
    const rows = await this.repo.find({
      where: { enabled: 1 },
      order: { priority: 'DESC' },
    });
    return rows.map(r => this.toModel(r));
  }

  /** Entity → Domain Model */
  private toModel(e: WorkflowEntity): Workflow {
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
