import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, contentEvent } from '../model/sse-events';
import { templateReplace } from './shared-utils';

/** 消息回复节点 — 发送固定文本（支持模板变量） */
export class ReplyExecutor implements INodeExecutor {
  readonly type = 'reply';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const text = templateReplace(node.data.replyText || '', ctx.params);

    yield contentEvent(text);
    ctx.lastOutput = text;
    ctx.contentYielded = true;

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'reply',
      stepName: node.data.label || '消息回复',
      result: text,
      timeMs: Date.now() - stepStart,
    });

    return { output: text, contentYielded: true };
  }
}
