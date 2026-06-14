import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, toolStartEvent, toolResultEvent } from '../model/sse-events';
import { templateReplace } from './shared-utils';

/** 工单创建节点 — 调用 create_ticket Action 创建客服工单 */
export class TicketExecutor implements INodeExecutor {
  readonly type = 'ticket';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const ticketAction = deps.actions.get('create_ticket');

    if (!ticketAction) {
      console.warn(`[Workflow] ticket 节点: create_ticket action 不可用`);
      return { output: null };
    }

    const args = {
      title: templateReplace(node.data.title || '', ctx.params),
      category: node.data.category || 'general',
      priority: node.data.ticketPriority || 'medium',
      description: templateReplace(node.data.ticketDescription || '', ctx.params),
    };

    yield toolStartEvent('create_ticket', args, 1);

    const result = await ticketAction.execute(args, deps.actionContext);
    const output = result.output;
    ctx.results.set(node.id, output);
    ctx.lastOutput = typeof output === 'string' ? output : JSON.stringify(output);
    ctx.contentYielded = false;

    yield toolResultEvent('create_ticket', result.ssePayload || output, 1, Date.now() - stepStart);

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'ticket',
      stepName: node.data.label || '创建工单',
      input: args,
      result: result.ssePayload || output,
      timeMs: Date.now() - stepStart,
    });

    return { output };
  }
}
