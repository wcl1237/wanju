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

    // 跟踪条件节点执行次数，支持 maxRetries 防止无限循环
    const retryKey = `_condition_count_${node.id}`;
    const currentCount = parseInt(ctx.params[retryKey] || '0', 10) + 1;
    ctx.params[retryKey] = String(currentCount);

    const maxRetries = node.data.maxRetries ?? 3;
    let result: boolean;

    if (currentCount > maxRetries) {
      // 超过最大重试次数，强制走 true 分支
      result = true;
      console.log(`[Condition] ⚠️ 节点 ${node.id} 已达最大重试次数 (${maxRetries})，强制通过`);
    } else {
      result = this.evaluate(node.data, ctx);
      console.log(`[Condition] 节点 ${node.id} 第 ${currentCount}/${maxRetries} 次判断: ${result}`);
    }

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
    if (field === 'userMessage') {
      fieldValue = ctx.userMessage;
    }
    // LLM 节点输出存储在 ctx.lastOutput / ctx.results 中，而非 ctx.params
    // 当 conditionField 为 'llm_output' 或 params 中无对应值时，回退到上一个节点的输出
    if (!fieldValue && (field === 'llm_output' || field === 'lastOutput')) {
      fieldValue = ctx.lastOutput || '';
    }
    // 进一步回退: 尝试从 results Map 中查找最近的节点输出
    if (!fieldValue && ctx.results.size > 0) {
      const entries = Array.from(ctx.results.entries());
      const lastEntry = entries[entries.length - 1];
      if (lastEntry && typeof lastEntry[1] === 'string') {
        fieldValue = lastEntry[1];
      }
    }

    switch (op) {
      case 'contains': return fieldValue.includes(value);
      case 'equals': return fieldValue === value;
      case 'not_empty': return fieldValue.length > 0;
      case 'has_result': return ctx.results.size > 0;
      default: return true;
    }
  }
}
