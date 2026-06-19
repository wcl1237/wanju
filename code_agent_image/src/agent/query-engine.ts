/**
 * QueryEngine — LLM 推理循环
 *
 * 参考 Claude Code 的 query.ts，实现 ReAct 推理循环：
 * 1. 发送消息给 LLM
 * 2. 如果 LLM 返回 tool_calls → 执行工具 → 追加结果 → 继续推理
 * 3. 如果 LLM 返回纯文本 → 结束本次查询
 * 4. 超过最大轮次 → 强制结束
 */
import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { LLMClient } from '../llm/llm-client';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolContext, ToolResult, DecisionRequest, DecisionResponse } from '../tools/tool.interface';
import { Message, QueryParams, QueryResult, TokenUsage, AgentMessage } from './types';
import { DecisionGate } from './decision-gate';

@Provide()
@Scope(ScopeEnum.Request)
export class QueryEngine {
  @Inject()
  llmClient: LLMClient;

  @Inject()
  toolRegistry: ToolRegistry;

  @Inject()
  decisionGate: DecisionGate;

  /** WebSocket 消息发送器（由 Controller 注入） */
  private sendMessage: ((msg: AgentMessage) => void) | null = null;
  private abortController: AbortController = new AbortController();

  setSender(sender: (msg: AgentMessage) => void): void {
    this.sendMessage = sender;
    this.decisionGate.setSender(sender);
  }

  abort(): void {
    this.abortController.abort();
    this.decisionGate.cancelAll('查询已中断');
  }

  /**
   * 执行一次完整的推理查询
   *
   * 可能触发多轮 tool-call 循环，直到 LLM 给出最终回答或达到 maxTurns。
   */
  async query(params: QueryParams): Promise<QueryResult> {
    const { systemPrompt, maxTurns = 15, onToolCall, onToolResult, onProgress } = params;
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...params.messages,
    ];

    let turns = 0;
    let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const allFiles: Array<{ path: string; action: string }> = [];

    while (turns < maxTurns) {
      if (this.abortController.signal.aborted) {
        break;
      }

      turns++;
      onProgress?.({ type: 'thinking', message: `推理轮次 ${turns}/${maxTurns}` });

      // 通知客户端流开始
      this.sendMessage?.({ type: 'chat.stream_start' });

      // 调用 LLM（流式）
      const result = await this.llmClient.chatStream(
        messages as any,
        { tools: params.tools.length > 0 ? params.tools as any : undefined },
        {
          onToken: (token) => {
            this.sendMessage?.({ type: 'chat.chunk', chunk: token });
          },
        },
      );

      // 累加 token 使用
      if (result.usage) {
        totalUsage.promptTokens += result.usage.promptTokens;
        totalUsage.completionTokens += result.usage.completionTokens;
        totalUsage.totalTokens += result.usage.totalTokens;
      }

      // 如果 LLM 没有调用工具 → 最终回答
      if (!result.toolCalls || result.toolCalls.length === 0) {
        this.sendMessage?.({ type: 'chat.stream_end' });

        // 追加 assistant 消息
        messages.push({ role: 'assistant', content: result.content });

        return {
          finalAnswer: result.content,
          files: allFiles,
          turns,
          usage: totalUsage,
          messages,
        };
      }

      this.sendMessage?.({ type: 'chat.stream_end' });

      // LLM 返回了 tool_calls → 执行工具
      const assistantMessage: Message = {
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
      };
      messages.push(assistantMessage);

      // 执行每个工具调用
      for (const toolCall of result.toolCalls) {
        if (this.abortController.signal.aborted) break;

        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        onToolCall?.(toolName, toolArgs);
        this.sendMessage?.({ type: 'tool.start', tool: toolName, args: toolArgs });

        const startTime = Date.now();
        const toolResult = await this.executeTool(toolName, toolArgs);
        const timeMs = Date.now() - startTime;

        onToolResult?.(toolName, toolResult, timeMs);
        this.sendMessage?.({
          type: 'tool.result',
          tool: toolName,
          result: { success: toolResult.success, output: toolResult.output.substring(0, 500) },
          timeMs,
        });

        // 追加文件产物
        if (toolResult.artifacts) {
          for (const artifact of toolResult.artifacts) {
            allFiles.push(artifact);
            if (artifact.action === 'created') {
              this.sendMessage?.({
                type: 'file.created',
                path: artifact.path,
                size: artifact.size || 0,
              });
            } else if (artifact.action === 'modified') {
              this.sendMessage?.({ type: 'file.modified', path: artifact.path });
            }
          }
        }

        // 追加工具结果消息
        messages.push({
          role: 'tool',
          content: toolResult.output,
          tool_call_id: toolCall.id,
        });
      }
    }

    // 超过最大轮次
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    return {
      finalAnswer: (lastAssistant?.content as string) || '(达到最大推理轮次)',
      files: allFiles,
      turns,
      usage: totalUsage,
      messages,
    };
  }

  /**
   * 执行单个工具
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.toolRegistry.get(name);
    if (!tool) {
      return { success: false, output: `未知工具: ${name}` };
    }

    // 参数校验
    if (tool.validate) {
      const validation = tool.validate(args);
      if (!validation.valid) {
        return { success: false, output: `参数校验失败: ${validation.message}` };
      }
    }

    const ctx: ToolContext = {
      workingDir: process.env.WORKSPACE_DIR || '/workspace',
      abortSignal: this.abortController.signal,
      onProgress: (msg) => {
        this.sendMessage?.({ type: 'workflow.progress', percent: -1, message: msg });
      },
      requestDecision: (req: DecisionRequest) => this.decisionGate.requestDecision(req),
    };

    try {
      return await tool.execute(args, ctx);
    } catch (error) {
      return {
        success: false,
        output: `工具执行异常: ${error.message || error}`,
      };
    }
  }
}
