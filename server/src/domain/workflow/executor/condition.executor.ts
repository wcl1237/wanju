import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent } from '../model/sse-events';

/** 条件分支节点 — 根据字段值判断走 true/false 分支 */
export class ConditionExecutor implements INodeExecutor {
  readonly type = 'condition';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const result = this.evaluate(node.data, ctx);

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'condition',
      stepName: node.data.label || '条件判断',
      conditionResult: result,
      timeMs: Date.now() - stepStart,
    });

    return { output: null, conditionResult: result };
  }

  private evaluate(data: FlowNode['data'], ctx: ExecContext): boolean {
    const field = data.conditionField || '';
    const op = data.conditionOp || 'not_empty';
    const value = data.conditionValue || '';

    let fieldValue = ctx.params[field] || '';
    if (field === 'userMessage') fieldValue = ctx.userMessage;

    switch (op) {
      case 'contains': return fieldValue.includes(value);
      case 'equals': return fieldValue === value;
      case 'not_empty': return fieldValue.length > 0;
      case 'has_result': return ctx.results.size > 0;
      default: return true;
    }
  }
}
