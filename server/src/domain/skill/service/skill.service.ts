import { Provide, Scope, ScopeEnum, Inject } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SkillEntity } from '../entity/skill.entity';
import { Skill, SkillParameter, CreateSkillDTO, UpdateSkillDTO } from '../model/skill.model';
import { ILLMClient } from '../../ai/port/llm.port';

@Provide()
@Scope(ScopeEnum.Singleton)
export class SkillService {
  @InjectEntityModel(SkillEntity)
  skillRepo: Repository<SkillEntity>;

  @Inject('llmClient')
  llmClient: ILLMClient;

  async create(dto: CreateSkillDTO): Promise<Skill> {
    const now = new Date().toISOString();
    const entity = this.skillRepo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description || '',
      tags: (dto.tags || []).join(','),
      prompt: dto.prompt,
      parameters: JSON.stringify(dto.parameters || []),
      outputTemplate: dto.outputTemplate || '',
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
    if (dto.tags !== undefined) entity.tags = dto.tags.join(',');
    if (dto.prompt !== undefined) entity.prompt = dto.prompt;
    if (dto.parameters !== undefined) entity.parameters = JSON.stringify(dto.parameters);
    if (dto.outputTemplate !== undefined) entity.outputTemplate = dto.outputTemplate;
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

  /** 批量按 ID 查询（用于 Runtime 加载 Blueprint 配置的 Skill） */
  async getByIds(ids: string[]): Promise<Skill[]> {
    if (ids.length === 0) return [];
    const rows = await this.skillRepo.find({ where: { id: In(ids), enabled: 1 } });
    return rows.map(r => this.toSkill(r));
  }

  /** 获取所有启用的 Skill */
  async getAllEnabled(): Promise<Skill[]> {
    const rows = await this.skillRepo.find({ where: { enabled: 1 } });
    return rows.map(r => this.toSkill(r));
  }

  /**
   * AI 智能创建 Skill — 根据用户描述自动生成完整 Skill 定义
   *
   * 参考 Anthropic skill-creator: 意图捕获 → pushy 描述风格 → 参数提取 → prompt 模板生成
   */
  async generateSkill(userDescription: string): Promise<Partial<Skill>> {
    const prompt = `你是一个 AI Agent 技能创建专家。根据用户的描述，生成一个完整的 Skill（技能/工具）定义。

这个 Skill 会被注册为 LLM 的 Function Calling Tool，当 LLM 判断需要时会自动调用。

用户描述: "${userDescription}"

请生成以下字段:

1. **name**: 简短的技能名称（中文，2-6个字）
2. **description**: 详细描述何时应该使用这个技能。要"积极一些"——即使用户没有明确提到关键词，只要语境相关就应该触发。
   例如不要只写"处理退款请求"，而要写"当用户需要退款、退货、换货、取消订单、对商品不满意、要求退钱时使用此技能。即使用户没有明确说'退款'，只要涉及售后问题也应使用。"
3. **tags**: 相关标签数组（用于分类，3-5个）
4. **parameters**: 执行此技能需要从用户那里获取的参数列表，每个参数包含:
   - name: 参数名（英文，snake_case）
   - type: "string" | "number" | "boolean"
   - description: 参数描述（中文）
   - required: 是否必填
5. **prompt**: 详细的执行指令模板。用 {{参数名}} 引用参数。要包含完整的处理步骤和注意事项。
6. **outputTemplate**: 可选的输出格式要求（留空则 LLM 自由回复）
7. **icon**: 合适的 emoji（单个）

请严格以 JSON 格式返回，不要输出其他内容:
{
  "name": "",
  "description": "",
  "tags": [],
  "parameters": [],
  "prompt": "",
  "outputTemplate": "",
  "icon": ""
}`;

    const result = await this.llmClient.complete(prompt, { temperature: 0.7, maxTokens: 2000 });

    try {
      // 提取 JSON（可能被包裹在 ```json ... ``` 中）
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('未找到 JSON');
      return JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      console.error('[SkillService] AI 生成解析失败:', e.message);
      throw new Error('AI 生成技能失败，请重试');
    }
  }

  // ==================== 内部方法 ====================

  private toSkill(e: SkillEntity): Skill {
    let parameters: SkillParameter[] = [];
    try {
      parameters = JSON.parse(e.parameters || '[]');
    } catch { /* ignore */ }

    return {
      id: e.id,
      name: e.name,
      description: e.description,
      tags: e.tags ? e.tags.split(',').map(k => k.trim()).filter(k => k.length > 0) : [],
      prompt: e.prompt,
      parameters,
      outputTemplate: e.outputTemplate || '',
      icon: e.icon || '⚡',
      enabled: e.enabled === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
