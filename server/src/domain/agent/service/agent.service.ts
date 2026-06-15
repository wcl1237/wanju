import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { ILLMClient } from '../../ai/port/llm.port';
import { IAgentRepository } from '../port/agent.repository';
import { Agent, CreateAgentDTO, UpdateAgentDTO } from '../model/agent.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class AgentService {
  @Inject('agentRepository')
  agentRepo: IAgentRepository;

  @Inject('llmClient')
  llmClient: ILLMClient;

  async create(dto: CreateAgentDTO): Promise<Agent> {
    return this.agentRepo.create(dto);
  }

  async update(id: string, dto: UpdateAgentDTO): Promise<Agent | undefined> {
    return this.agentRepo.update(id, dto);
  }

  async delete(id: string): Promise<boolean> {
    return this.agentRepo.delete(id);
  }

  async getAll(): Promise<Agent[]> {
    return this.agentRepo.findAll();
  }

  async getById(id: string): Promise<Agent | undefined> {
    return this.agentRepo.findById(id);
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
      const content = await this.llmClient.complete(prompt, { temperature: 0.7, maxTokens: 4000 });
      return content || '';
    } catch (e: any) {
      console.error('[Agent] AI 生成 Prompt 失败:', e.message);
      return '';
    }
  }
}
