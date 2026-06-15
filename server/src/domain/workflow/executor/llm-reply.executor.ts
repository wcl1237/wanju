import { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
import { FlowNode, ExecContext } from '../model/workflow.model';
import { stepEvent, llmEvent, contentChunkEvent } from '../model/sse-events';

/** AI 生成回复节点 — 流式输出 */
export class LlmReplyExecutor implements INodeExecutor {
  readonly type = 'llm_reply';

  async *execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult> {
    const stepStart = Date.now();

    yield llmEvent({ stage: 'start', nodeId: node.id, purpose: 'AI 生成回复', input: ctx.userMessage.slice(0, 200) });

    const customPrompt = node.data.prompt || '根据上下文生成友好的回复';
    const resultsSummary = [...ctx.results.entries()]
      .map(([k, v]) => `节点 ${k}: ${JSON.stringify(v)}`)
      .join('\n');

    const prompt = `${customPrompt}

用户消息: ${ctx.userMessage}
提取参数: ${JSON.stringify(ctx.params)}
执行结果:
${resultsSummary}

请生成面向用户的友好回复。不要暴露内部实现。`;

    let fullContent = '';
    try {
      const stream = deps.llmClient.completeStream(prompt, { temperature: 0.7, maxTokens: 4000 });
      for await (const chunk of stream) {
        if (deps.abortSignal?.aborted) break;
        fullContent += chunk;
        yield contentChunkEvent(chunk);
      }
    } catch {
      if (!fullContent) fullContent = '工作流已执行完成。';
    }

    if (!fullContent) fullContent = '工作流执行完成。';

    yield llmEvent({ stage: 'end', nodeId: node.id, purpose: 'AI 生成回复', timeMs: Date.now() - stepStart });

    ctx.lastOutput = fullContent;
    ctx.contentYielded = true;

    yield stepEvent({
      stepIndex: deps.visitedCount - 1,
      nodeId: node.id,
      stepType: 'llm_reply',
      stepName: node.data.label || 'AI 生成',
      result: fullContent.slice(0, 500),
      timeMs: Date.now() - stepStart,
    });

    return { output: fullContent, contentYielded: true };
  }
}
