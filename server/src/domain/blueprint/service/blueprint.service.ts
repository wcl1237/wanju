import { Provide, Inject, Scope, ScopeEnum, Init } from '@midwayjs/core';
import { IBlueprintRepository } from '../port/blueprint.repository';
import {
  AgentBlueprint, CreateBlueprintDTO, UpdateBlueprintDTO,
  DEFAULT_BLUEPRINT_ID, DEFAULT_REACT_CONFIG,
} from '../model/blueprint.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class BlueprintService {
  @Inject('blueprintRepository')
  repo: IBlueprintRepository;

  @Init()
  async init() {
    await this.ensureDefaultExists();
  }

  /** 确保默认蓝图存在 */
  async ensureDefaultExists(): Promise<void> {
    // 检查是否已有默认蓝图（按 isDefault 查找，而非固定 ID）
    const existing = await this.repo.findDefault();
    if (existing) {
      console.log(`[Blueprint] 默认智能体「${existing.name}」已存在 (id=${existing.id})`);
      return;
    }

    // 创建默认的「智能对话」蓝图
    await this.repo.create({
      name: '智能对话',
      description: '全渠道智能客服系统，支持 RAG 知识库检索、工单创建、多轮对话、三层记忆',
      icon: '💬',
      runtimeType: 'react',
      config: DEFAULT_REACT_CONFIG,
      isDefault: true,
    });

    console.log('[Blueprint] ✅ 默认智能体「智能对话」已创建');
  }

  async getAll(): Promise<AgentBlueprint[]> {
    return this.repo.findAll();
  }

  async getById(id: string): Promise<AgentBlueprint | undefined> {
    return this.repo.findById(id);
  }

  async getDefault(): Promise<AgentBlueprint | undefined> {
    return this.repo.findDefault();
  }

  async getEnabled(): Promise<AgentBlueprint[]> {
    return this.repo.findEnabled();
  }

  async create(dto: CreateBlueprintDTO): Promise<AgentBlueprint> {
    if (dto.isDefault) {
      await this.repo.clearDefault();
    }
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateBlueprintDTO): Promise<AgentBlueprint | undefined> {
    if (dto.isDefault) {
      await this.repo.clearDefault();
    }
    return this.repo.update(id, dto);
  }

  async delete(id: string): Promise<boolean> {
    // 禁止删除默认蓝图
    if (id === DEFAULT_BLUEPRINT_ID) {
      throw new Error('不能删除默认智能体');
    }
    return this.repo.delete(id);
  }
}
