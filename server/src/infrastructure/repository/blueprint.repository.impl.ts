import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BlueprintEntity } from '../../domain/blueprint/entity/blueprint.entity';
import { IBlueprintRepository } from '../../domain/blueprint/port/blueprint.repository';
import { AgentBlueprint, CreateBlueprintDTO, UpdateBlueprintDTO } from '../../domain/blueprint/model/blueprint.model';

@Provide('blueprintRepository')
@Scope(ScopeEnum.Singleton)
export class TypeOrmBlueprintRepository implements IBlueprintRepository {
  @InjectEntityModel(BlueprintEntity)
  repo: Repository<BlueprintEntity>;

  async findAll(): Promise<AgentBlueprint[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map(r => this.toModel(r));
  }

  async findById(id: string): Promise<AgentBlueprint | undefined> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toModel(row) : undefined;
  }

  async findDefault(): Promise<AgentBlueprint | undefined> {
    const row = await this.repo.findOneBy({ isDefault: 1, enabled: 1 });
    return row ? this.toModel(row) : undefined;
  }

  async findEnabled(): Promise<AgentBlueprint[]> {
    const rows = await this.repo.find({ where: { enabled: 1 }, order: { createdAt: 'DESC' } });
    return rows.map(r => this.toModel(r));
  }

  async create(dto: CreateBlueprintDTO): Promise<AgentBlueprint> {
    const now = new Date().toISOString();
    const entity = this.repo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description || '',
      icon: dto.icon || '🤖',
      runtimeType: dto.runtimeType,
      config: JSON.stringify(dto.config),
      enabled: 1,
      isDefault: dto.isDefault ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
    await this.repo.save(entity);
    return this.toModel(entity);
  }

  async update(id: string, dto: UpdateBlueprintDTO): Promise<AgentBlueprint | undefined> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) return undefined;

    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.icon !== undefined) entity.icon = dto.icon;
    if (dto.config !== undefined) entity.config = JSON.stringify(dto.config);
    if (dto.enabled !== undefined) entity.enabled = dto.enabled ? 1 : 0;
    if (dto.isDefault !== undefined) entity.isDefault = dto.isDefault ? 1 : 0;
    entity.updatedAt = new Date().toISOString();

    await this.repo.save(entity);
    return this.toModel(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected || 0) > 0;
  }

  async clearDefault(): Promise<void> {
    await this.repo.update({}, { isDefault: 0 });
  }

  private toModel(e: BlueprintEntity): AgentBlueprint {
    let config: any;
    try { config = JSON.parse(e.config); } catch { config = {}; }
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      icon: e.icon,
      runtimeType: e.runtimeType as any,
      config,
      enabled: e.enabled === 1,
      isDefault: e.isDefault === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
