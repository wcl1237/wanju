import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { sseEvent } from '../model/sse-events';

/**
 * 开始节点 — 工作流入口，将用户消息传递给下游节点
 *
 * 与 trigger 不同，start 节点不做意图匹配，
 * 适用于通过 Blueprint 直接绑定的工作流。
 */
export class StartExecutor implements INodeExecutor {
  readonly type = 'start';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const welcomeMessage = node.data.welcomeMessage || '';

    yield sseEvent({
      type: 'workflow_step',
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'start',
      stepName: node.data.label || '开始',
      result: '工作流已启动',
      timeMs: 0,
    });

    // 如果有欢迎语且用户消息为空（首次对话），发送欢迎语
    if (welcomeMessage && !ctx.userMessage) {
      yield sseEvent({ type: 'content', content: welcomeMessage });
      ctx.contentYielded = true;
      return { output: welcomeMessage };
    }

    // 将用户消息设为上下文的 lastOutput，传递给下游节点
    ctx.lastOutput = ctx.userMessage;
    return { output: ctx.userMessage };
  }
}
