/**
 * Agent 仓储实现 — TypeORM
 */

import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AgentEntity } from '../../domain/agent/entity/agent.entity';
import { Agent, CreateAgentDTO, UpdateAgentDTO } from '../../domain/agent/model/agent.model';
import { IAgentRepository } from '../../domain/agent/port/agent.repository';

@Provide('agentRepository')
@Scope(ScopeEnum.Singleton)
export class TypeOrmAgentRepository implements IAgentRepository {
  @InjectEntityModel(AgentEntity)
  repo: Repository<AgentEntity>;

  async create(dto: CreateAgentDTO): Promise<Agent> {
    const now = new Date().toISOString();
    const entity = this.repo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description || '',
      prompt: dto.prompt || '',
      actions: (dto.actions || []).join(','),
      icon: dto.icon || '🧑‍💼',
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    });
    await this.repo.save(entity);
    return this.toModel(entity);
  }

  async update(id: string, dto: UpdateAgentDTO): Promise<Agent | undefined> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) return undefined;
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.prompt !== undefined) entity.prompt = dto.prompt;
    if (dto.actions !== undefined) entity.actions = dto.actions.join(',');
    if (dto.icon !== undefined) entity.icon = dto.icon;
    if (dto.enabled !== undefined) entity.enabled = dto.enabled ? 1 : 0;
    entity.updatedAt = new Date().toISOString();
    await this.repo.save(entity);
    return this.toModel(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected || 0) > 0;
  }

  async findAll(): Promise<Agent[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map(r => this.toModel(r));
  }

  async findById(id: string): Promise<Agent | undefined> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toModel(row) : undefined;
  }

  /** Entity → Domain Model */
  private toModel(e: AgentEntity): Agent {
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      prompt: e.prompt,
      actions: e.actions ? e.actions.split(',').map(a => a.trim()).filter(a => a.length > 0) : [],
      icon: e.icon || '🧑‍💼',
      enabled: e.enabled === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
