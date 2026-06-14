import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { KnowledgeService } from '../../knowledge/service/knowledge.service';
import { Action, ActionDefinition, ActionResult, ActionContext } from './action.interface';

@Provide('action:search_knowledge')
@Scope(ScopeEnum.Singleton)
export class SearchKnowledgeAction implements Action {
  @Inject()
  knowledgeService: KnowledgeService;

  definition(): ActionDefinition {
    return {
      name: 'search_knowledge',
      description: '当需要查询知识库获取产品信息、FAQ、使用指南等来回答用户问题时调用。使用 RAG 多路串行检索管线（关键词召回 + 语义精排）获取最相关的知识',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询，用自然语言描述需要查找的信息' },
        },
        required: ['query'],
      },
    };
  }

  async execute(args: any, _context: ActionContext): Promise<ActionResult> {
    const ragResult = await this.knowledgeService.ragSearch(args.query, 5);

    return {
      output: JSON.stringify({
        context: ragResult.context,
        sources: ragResult.sources,
        debug: {
          keywords: ragResult.debug.extractedKeywords,
          keywordRecall: ragResult.debug.keywordRecallCount,
          semanticRecall: ragResult.debug.semanticRecallCount,
          timeMs: ragResult.debug.totalTimeMs,
        },
      }),
      ssePayload: {
        sources: ragResult.sources,
        keywords: ragResult.debug.extractedKeywords,
        recallCount: ragResult.debug.semanticRecallCount,
        keywordRecallCount: ragResult.debug.keywordRecallCount,
        context: ragResult.context.slice(0, 800),
        timeMs: ragResult.debug.totalTimeMs,
      },
    };
  }
}
