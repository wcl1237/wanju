import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { ILLMClient } from '../../ai/port/llm.port';
import { IWorkflowRepository } from '../port/workflow.repository';
import {
  Workflow, CreateWorkflowDTO, UpdateWorkflowDTO,
} from '../model/workflow.model';
import { Action, ActionContext } from '../../ai/action/action.interface';
import { GraphEngineService } from './graph-engine.service';

/**
 * 工作流服务 — CRUD + 意图匹配
 *
 * 持久化操作委托给 IWorkflowRepository。
 * 图遍历执行委托给 GraphEngineService。
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class WorkflowService {
  @Inject('workflowRepository')
  workflowRepo: IWorkflowRepository;

  @Inject('llmClient')
  llmClient: ILLMClient;

  @Inject()
  graphEngine: GraphEngineService;

  // ==================== CRUD ====================

  async create(dto: CreateWorkflowDTO): Promise<Workflow> {
    return this.workflowRepo.create(dto);
  }

  async update(id: string, dto: UpdateWorkflowDTO): Promise<Workflow | undefined> {
    return this.workflowRepo.update(id, dto);
  }

  async delete(id: string): Promise<boolean> {
    return this.workflowRepo.delete(id);
  }

  async getAll(): Promise<Workflow[]> {
    return this.workflowRepo.findAll();
  }

  async getById(id: string): Promise<Workflow | undefined> {
    return this.workflowRepo.findById(id);
  }

  // ==================== LLM 意图匹配 ====================

  async matchWorkflow(userMessage: string): Promise<Workflow | null> {
    const allEnabled = await this.workflowRepo.findAllEnabled();
    if (allEnabled.length === 0) return null;

    const msgLower = userMessage.toLowerCase();

    // 按触发类型分类处理
    const intentWorkflows: Workflow[] = [];

    for (const workflow of allEnabled) {
      const triggerNode = (workflow.graph.nodes || []).find(n => n.type === 'trigger');
      const triggerType: string = triggerNode?.data?.triggerType || 'intent';

      switch (triggerType) {
        case 'always': {
          console.log(`[Workflow] ⚡ 始终触发: "${workflow.name}"`);
          return workflow;
        }

        case 'keyword': {
          const keywords: string[] = triggerNode?.data?.keywords || [];
          if (keywords.length > 0 && keywords.some(kw => kw && msgLower.includes(kw.toLowerCase()))) {
            console.log(`[Workflow] ⚡ 关键词命中: "${workflow.name}" (跳过 LLM 匹配)`);
            return workflow;
          }
          break;
        }

        case 'regex': {
          const pattern = triggerNode?.data?.regexPattern;
          if (pattern) {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(userMessage)) {
                console.log(`[Workflow] ⚡ 正则命中: "${workflow.name}" (pattern: ${pattern})`);
                return workflow;
              }
            } catch (regexErr) {
              console.warn(`[Workflow] 正则表达式无效: "${pattern}"`, regexErr);
            }
          }
          break;
        }

        case 'intent':
        default: {
          intentWorkflows.push(workflow);
          break;
        }
      }
    }

    // LLM 意图匹配（仅对 intent 类型的工作流）
    if (intentWorkflows.length === 0) return null;

    const workflowList = intentWorkflows
      .map((w, i) => `[${i + 1}] ID: ${w.id}\n   触发条件: ${w.triggerDescription}`)
      .join('\n');

    const prompt = `你是一个意图识别专家。给定用户消息和一组工作流定义，判断用户消息是否触发了某个工作流。

工作流列表:
${workflowList}

用户消息: ${userMessage}

如果用户消息匹配某个工作流，只输出该工作流的 ID。如果不匹配任何工作流，只输出 none。
不要输出其他内容。`;

    try {
      const content = await this.llmClient.complete(prompt, { temperature: 0.1, maxTokens: 1000 });
      console.log(`[Workflow] LLM 意图匹配结果: "${content}"`);
      if (content.toLowerCase() === 'none') return null;
      const matchedWorkflow = intentWorkflows.find(w => content.includes(w.id));
      if (matchedWorkflow) {
        console.log(`[Workflow] ✅ 匹配到工作流: ${matchedWorkflow.name}`);
        return matchedWorkflow;
      }
      return null;
    } catch (e: any) {
      console.error('[Workflow] LLM 匹配失败:', e.message);
      return null;
    }
  }

  // ==================== 图执行委托 ====================

  executeWorkflow(
    workflow: Workflow,
    userMessage: string,
    actions: Map<string, Action>,
    context: ActionContext
  ): AsyncGenerator<string> {
    return this.graphEngine.executeWorkflow(workflow, userMessage, actions, context);
  }
}
