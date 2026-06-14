import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, toolStartEvent, toolResultEvent } from '../model/sse-events';
import { templateReplace } from './shared-utils';

/** 知识检索节点 — 调用 search_knowledge Action 搜索知识库 */
export class KnowledgeExecutor implements INodeExecutor {
  readonly type = 'knowledge';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const searchAction = deps.actions.get('search_knowledge');

    if (!searchAction) {
      console.warn(`[Workflow] knowledge 节点: search_knowledge action 不可用`);
      return { output: null };
    }

    const query = templateReplace(node.data.query || ctx.userMessage, ctx.params);
    yield toolStartEvent('search_knowledge', { query }, 1);

    const result = await searchAction.execute({ query, topK: node.data.topK || 3 }, deps.actionContext);
    const output = result.output;
    ctx.results.set(node.id, output);
    ctx.lastOutput = typeof output === 'string' ? output : JSON.stringify(output);
    ctx.contentYielded = false;

    yield toolResultEvent('search_knowledge', result.ssePayload || output, 1, Date.now() - stepStart);

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'knowledge',
      stepName: node.data.label || '知识检索',
      input: query,
      result: result.ssePayload || output,
      timeMs: Date.now() - stepStart,
    });

    return { output };
  }
}
