import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';

/** 触发器节点 — 工作流入口，不执行实际逻辑 */
export class TriggerExecutor implements INodeExecutor {
  readonly type = 'trigger';

  async *execute(
    _node: FlowNode,
    _ctx: ExecContext,
    _deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    // trigger 节点不执行任何逻辑，仅作为图的入口
    return { output: null };
  }
}
