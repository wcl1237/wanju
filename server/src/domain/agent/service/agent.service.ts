import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ILLMClient } from '../../ai/port/llm.port';
import { AgentEntity } from '../entity/agent.entity';
import { Agent, CreateAgentDTO, UpdateAgentDTO } from '../model/agent.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class AgentService {
  @InjectEntityModel(AgentEntity)
  agentRepo: Repository<AgentEntity>;

  @Inject('llmClient')
  llmClient: ILLMClient;

  async create(dto: CreateAgentDTO): Promise<Agent> {
    const now = new Date().toISOString();
    const entity = this.agentRepo.create({
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
    await this.agentRepo.save(entity);
    return this.toAgent(entity);
  }

  async update(id: string, dto: UpdateAgentDTO): Promise<Agent | undefined> {
    const entity = await this.agentRepo.findOneBy({ id });
    if (!entity) return undefined;

    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.prompt !== undefined) entity.prompt = dto.prompt;
    if (dto.actions !== undefined) entity.actions = dto.actions.join(',');
    if (dto.icon !== undefined) entity.icon = dto.icon;
    if (dto.enabled !== undefined) entity.enabled = dto.enabled ? 1 : 0;
    entity.updatedAt = new Date().toISOString();

    await this.agentRepo.save(entity);
    return this.toAgent(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.agentRepo.delete(id);
    return (result.affected || 0) > 0;
  }

  async getAll(): Promise<Agent[]> {
    const rows = await this.agentRepo.find({ order: { createdAt: 'DESC' } });
    return rows.map(r => this.toAgent(r));
  }

  async getById(id: string): Promise<Agent | undefined> {
    const row = await this.agentRepo.findOneBy({ id });
    return row ? this.toAgent(row) : undefined;
  }

  /**
   * AI 生成 System Prompt
   * 根据 Agent 名称和描述，让 LLM 生成专业的 system prompt
   */
  async generatePrompt(name: string, description: string): Promise<string> {
    const prompt = `你是一个 AI Prompt 工程专家。请根据以下 Agent 信息，生成一段专业的 System Prompt。

Agent 名称: ${name}
Agent 描述: ${description}

要求:
1. Prompt 应该清晰定义 Agent 的角色、职责和行为准则
2. 包含必要的约束条件和输出格式要求
3. 语言专业但不过度复杂
4. 直接输出 System Prompt 内容，不要添加解释或前缀

请生成 System Prompt:`;

    try {
      const content = await this.llmClient.complete(prompt, { temperature: 0.7, maxTokens: 1000 });
      return content || '';
    } catch (e) {
      console.error('[Agent] AI 生成 Prompt 失败:', e.message);
      return '';
    }
  }

  private toAgent(e: AgentEntity): Agent {
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
