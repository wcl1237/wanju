import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import { AIConfig, AIMessage, AITool, LLMChatResult } from '../../domain/ai/model/ai.model';
import { ILLMClient } from '../../domain/ai/port/llm.port';

/**
 * OpenAI Compatible LLM 客户端
 *
 * 统一封装所有 LLM API 调用逻辑，消除各 Service 中重复的 fetch 代码。
 * 支持 OpenAI / 通义千问 / DeepSeek 等兼容 API。
 */
@Provide('llmClient')
@Scope(ScopeEnum.Singleton)
export class OpenAICompatibleClient implements ILLMClient {
  @Config('ai')
  aiConfig: AIConfig;

  /**
   * 非流式对话（支持 tool calling）
   */
  async chat(
    messages: AIMessage[],
    options?: {
      tools?: AITool[];
      toolChoice?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMChatResult> {
    const body: any = {
      model: this.aiConfig.model,
      messages: messages.map(m => {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

    // 打印发送给 LLM 的完整 prompt
    console.log(`[LLM Request] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(JSON.stringify({
      model: body.model,
      messages: body.messages,
      tools: body.tools ? body.tools.map((t: any) => t.function?.name) : null,
      tool_choice: body.tool_choice || null,
    }, null, 2));
    console.log(`[LLM Request] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const msg = choice.message;

    // 完整打印 LLM 返回
    console.log(`[LLM Response] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(JSON.stringify({
      finish_reason: choice.finish_reason,
      message: {
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls || null,
      },
      usage: data.usage || null,
    }, null, 2));
    console.log(`[LLM Response] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return {
      content: msg.content || '',
      toolCalls: msg.tool_calls,
    };
  }

  /**
   * 流式对话（纯文本输出）
   */
  async *chatStream(messages: AIMessage[]): AsyncGenerator<string> {
    const body = {
      model: this.aiConfig.model,
      messages: messages.map(m => {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      stream: true,
    };

    const response = await fetch(`${this.aiConfig.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`AI API stream error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            const content = delta.content.replace(/<think>[\s\S]*?<\/think>/g, '');
            if (content) {
              yield content;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * 简单文本补全
   */
  async complete(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const result = await this.chat(
      [{ role: 'user', content: prompt }],
      {
        temperature: options?.temperature ?? 0.1,
        maxTokens: options?.maxTokens ?? 300,
      }
    );

    // 清理 think 标签
    return result.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
}
