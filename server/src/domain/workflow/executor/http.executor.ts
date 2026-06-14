import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent } from '../model/sse-events';
import { templateReplace } from './shared-utils';

/** HTTP 请求节点 — 调用外部 API */
export class HttpExecutor implements INodeExecutor {
  readonly type = 'http';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();
    const output = await this.doRequest(node.data, ctx);

    ctx.results.set(node.id, output);
    ctx.lastOutput = typeof output === 'string' ? output : JSON.stringify(output);
    ctx.contentYielded = false;

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'http',
      stepName: node.data.label || 'HTTP 请求',
      input: node.data.url,
      result: typeof output === 'string' ? output.slice(0, 500) : output,
      timeMs: Date.now() - stepStart,
    });

    return { output };
  }

  private async doRequest(data: FlowNode['data'], ctx: ExecContext): Promise<any> {
    const url = templateReplace(data.url || '', ctx.params);
    const method = data.method || 'GET';
    console.log(`[Workflow] HTTP ${method} ${url}`);

    try {
      const resp = await fetch(url, {
        method,
        headers: data.headers || {},
        body: method !== 'GET' ? templateReplace(data.body || '', ctx.params) : undefined,
      });
      return await resp.text();
    } catch (e: any) {
      console.error('[Workflow] HTTP 请求失败:', e.message);
      return { error: e.message };
    }
  }
}
