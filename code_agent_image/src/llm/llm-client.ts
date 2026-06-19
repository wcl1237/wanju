/**
 * LLM Client — OpenAI 兼容接口客户端
 *
 * 复用 WanJu 主应用的 LLM 配置（通过环境变量注入）。
 * 支持流式/非流式调用，支持 Function Calling。
 */
import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import OpenAI from 'openai';
import { LLMConfig, LLMMessage, LLMChatOptions, LLMChatResult, LLMStreamCallbacks, LLMToolCall } from './types';

@Provide()
@Scope(ScopeEnum.Singleton)
export class LLMClient {
  private client: OpenAI;
  private defaultModel: string;

  @Config('ai')
  aiConfig: LLMConfig;

  init() {
    this.client = new OpenAI({
      apiKey: this.aiConfig.apiKey,
      baseURL: this.aiConfig.apiBase,
    });
    this.defaultModel = this.aiConfig.model;
  }

  private ensureClient() {
    if (!this.client) {
      this.init();
    }
  }

  /**
   * 非流式聊天调用（支持 tool calling）
   */
  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMChatResult> {
    this.ensureClient();

    const params: Record<string, unknown> = {
      model: options?.model || this.defaultModel,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.7,
    };

    if (options?.maxTokens) {
      params.max_tokens = options.maxTokens;
    }
    if (options?.tools && options.tools.length > 0) {
      params.tools = options.tools;
    }

    const response = await this.client.chat.completions.create(params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming);
    const choice = response.choices[0];

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
    };
  }

  /**
   * 流式聊天调用
   */
  async chatStream(
    messages: LLMMessage[],
    options?: LLMChatOptions,
    callbacks?: LLMStreamCallbacks,
  ): Promise<LLMChatResult> {
    this.ensureClient();

    const params: Record<string, unknown> = {
      model: options?.model || this.defaultModel,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    if (options?.maxTokens) {
      params.max_tokens = options.maxTokens;
    }
    if (options?.tools && options.tools.length > 0) {
      params.tools = options.tools;
    }

    const stream = await this.client.chat.completions.create(params as unknown as OpenAI.ChatCompletionCreateParamsStreaming);

    let fullContent = '';
    const toolCalls: Map<number, LLMToolCall> = new Map();
    let finishReason: string = 'stop';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        callbacks?.onToken?.(delta.content);
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, {
              id: tc.id || '',
              type: 'function',
              function: { name: '', arguments: '' },
            });
          }
          const existing = toolCalls.get(idx);
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
    }

    const result: LLMChatResult = {
      content: fullContent,
      toolCalls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
      finishReason: finishReason === 'tool_calls' ? 'tool_calls' : 'stop',
    };

    // 通知每个完成的 tool_call
    if (result.toolCalls) {
      for (const tc of result.toolCalls) {
        callbacks?.onToolCall?.(tc);
      }
    }

    callbacks?.onComplete?.(result);
    return result;
  }
}
