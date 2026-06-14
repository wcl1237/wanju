import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, llmEvent } from '../model/sse-events';

/** 参数提取节点 — 通过 LLM 从用户消息中提取关键参数 */
export class ExtractExecutor implements INodeExecutor {
  readonly type = 'extract';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();

    yield llmEvent({ stage: 'start', nodeId: node.id, purpose: '参数提取', input: ctx.userMessage.slice(0, 200) });

    const params = await this.extractParams(node.data, ctx.userMessage, deps);
    Object.assign(ctx.params, params);
    ctx.lastOutput = JSON.stringify(params);
    ctx.contentYielded = false;

    yield llmEvent({ stage: 'end', nodeId: node.id, purpose: '参数提取', timeMs: Date.now() - stepStart });

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'extract',
      stepName: node.data.label || '参数提取',
      input: ctx.userMessage.slice(0, 200),
      params,
      result: params,
      timeMs: Date.now() - stepStart,
    });

    return { output: params };
  }

  private async extractParams(
    data: FlowNode['data'],
    userMessage: string,
    deps: ExecutorDeps,
  ): Promise<Record<string, string>> {
    const paramsList = (data.params || []).join('、');
    const prompt = `从以下用户消息中提取指定参数。${data.extractPrompt || ''}

需要提取的参数: ${paramsList}
用户消息: ${userMessage}

请以 JSON 格式输出: {"参数名": "值"}。无法提取的设为空字符串。只输出 JSON。`;

    try {
      const content = await deps.llmClient.complete(prompt, { temperature: 0.1, maxTokens: 300 });
      const m = content.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : {};
    } catch { return {}; }
  }
}
