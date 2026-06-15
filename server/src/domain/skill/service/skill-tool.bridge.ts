/**
 * SkillToolBridge — 将 Skill 转为 Action 接口
 *
 * 每个 Skill 动态生成一个 Action 实例：
 * - definition() → 从 skill.description + skill.parameters 构建 Tool 定义
 * - execute()    → 用参数渲染 skill.prompt → 调 LLM 生成结果 → 返回
 *
 * Tool name 使用 "skill_<id前8位>" 格式，避免与内置 Action 冲突。
 */

import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { Skill } from '../model/skill.model';
import { Action, ActionDefinition, ActionContext, ActionResult } from '../../ai/action/action.interface';
import { ILLMClient } from '../../ai/port/llm.port';

@Provide()
@Scope(ScopeEnum.Singleton)
export class SkillToolBridge {
  /**
   * 将 Skill 列表转为 Action Map
   * key 为 tool name（"skill_<id前8位>"），value 为动态生成的 Action 实例
   */
  toActions(skills: Skill[], llmClient: ILLMClient): Map<string, Action> {
    const map = new Map<string, Action>();
    for (const skill of skills) {
      if (!skill.enabled) continue;
      const action = this.toAction(skill, llmClient);
      map.set(action.definition().name, action);
    }
    return map;
  }

  /** 单个 Skill → Action */
  toAction(skill: Skill, llmClient: ILLMClient): Action {
    const toolName = `skill_${skill.id.slice(0, 8)}`;
    return new SkillAction(toolName, skill, llmClient);
  }
}

/**
 * SkillAction — 由 Skill 数据动态生成的 Action 实现
 */
class SkillAction implements Action {
  constructor(
    private toolName: string,
    private skill: Skill,
    private llmClient: ILLMClient,
  ) {}

  definition(): ActionDefinition {
    // 从 skill.parameters 构建 JSON Schema
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of this.skill.parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      name: this.toolName,
      description: `[${this.skill.icon} ${this.skill.name}] ${this.skill.description}`,
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
  }

  async execute(args: any, _context: ActionContext): Promise<ActionResult> {
    // 用参数渲染 prompt 模板中的 {{param}} 占位符
    let renderedPrompt = this.skill.prompt;
    for (const [key, value] of Object.entries(args || {})) {
      renderedPrompt = renderedPrompt.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        String(value),
      );
    }

    // 如果有 outputTemplate，追加输出格式要求
    if (this.skill.outputTemplate) {
      renderedPrompt += `\n\n请按以下格式输出:\n${this.skill.outputTemplate}`;
    }

    console.log(`[SkillAction] 🔧 执行技能「${this.skill.name}」 args=${JSON.stringify(args)}`);

    // 调 LLM 生成结果
    const result = await this.llmClient.complete(renderedPrompt, { temperature: 0.7, maxTokens: 2000 });

    return {
      output: result,
      ssePayload: {
        skillName: this.skill.name,
        skillIcon: this.skill.icon,
        args,
        result: result.slice(0, 200),
      },
    };
  }
}
