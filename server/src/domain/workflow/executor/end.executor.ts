import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, contentEvent } from '../model/sse-events';

/** 结束节点 — 输出最终回复并终止流程 */
export class EndExecutor implements INodeExecutor {
  readonly type = 'end';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    console.log(`[Workflow] 🏁 到达结束节点: ${node.id}`);
    const stepStart = Date.now();

    // 优先使用标记为"最终回复"的节点输出
    const finalContent = ctx.finalReplyContent ?? ctx.lastOutput;

    if (finalContent && !ctx.contentYielded) {
      let isStructured = false;
      try {
        const parsed = JSON.parse(finalContent);
        isStructured = typeof parsed === 'object' && parsed !== null;
      } catch { /* not JSON, treat as text */ }

      if (!isStructured) {
        console.log(`[Workflow] 🏁 输出最终回复: "${finalContent.slice(0, 60)}..."`);
        yield contentEvent(finalContent);
      }
    }

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'end',
      stepName: node.data.label || '结束',
      output: finalContent
        ? (typeof finalContent === 'string' ? finalContent.slice(0, 200) : finalContent)
        : null,
      timeMs: Date.now() - stepStart,
    });

    return { output: null };
  }
}
