import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SkillEntity } from '../entity/skill.entity';

export interface Skill {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  prompt: string;
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillDTO {
  name: string;
  description?: string;
  keywords: string[];
  prompt: string;
  icon?: string;
}

export interface UpdateSkillDTO {
  name?: string;
  description?: string;
  keywords?: string[];
  prompt?: string;
  icon?: string;
  enabled?: boolean;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class SkillService {
  @InjectEntityModel(SkillEntity)
  skillRepo: Repository<SkillEntity>;

  async create(dto: CreateSkillDTO): Promise<Skill> {
    const now = new Date().toISOString();
    const entity = this.skillRepo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description || '',
      keywords: (dto.keywords || []).join(','),
      prompt: dto.prompt,
      icon: dto.icon || '⚡',
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    });
    await this.skillRepo.save(entity);
    return this.toSkill(entity);
  }

  async update(id: string, dto: UpdateSkillDTO): Promise<Skill | undefined> {
    const entity = await this.skillRepo.findOneBy({ id });
    if (!entity) return undefined;

    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.keywords !== undefined) entity.keywords = dto.keywords.join(',');
    if (dto.prompt !== undefined) entity.prompt = dto.prompt;
    if (dto.icon !== undefined) entity.icon = dto.icon;
    if (dto.enabled !== undefined) entity.enabled = dto.enabled ? 1 : 0;
    entity.updatedAt = new Date().toISOString();

    await this.skillRepo.save(entity);
    return this.toSkill(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.skillRepo.delete(id);
    return (result.affected || 0) > 0;
  }

  async getAll(): Promise<Skill[]> {
    const rows = await this.skillRepo.find({ order: { createdAt: 'DESC' } });
    return rows.map(r => this.toSkill(r));
  }

  async getById(id: string): Promise<Skill | undefined> {
    const row = await this.skillRepo.findOneBy({ id });
    return row ? this.toSkill(row) : undefined;
  }

  /**
   * 根据用户消息文本匹配命中的启用技能
   * 返回所有关键词匹配到的技能列表
   */
  async matchByText(text: string): Promise<Skill[]> {
    const allEnabled = await this.skillRepo.find({
      where: { enabled: 1 },
    });

    const lowerText = text.toLowerCase();
    return allEnabled
      .filter(entity => {
        const kws = entity.keywords
          .split(',')
          .map(k => k.trim().toLowerCase())
          .filter(k => k.length > 0);
        return kws.some(kw => lowerText.includes(kw));
      })
      .map(e => this.toSkill(e));
  }

  private toSkill(e: SkillEntity): Skill {
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      keywords: e.keywords
        ? e.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
        : [],
      prompt: e.prompt,
      icon: e.icon || '⚡',
      enabled: e.enabled === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
