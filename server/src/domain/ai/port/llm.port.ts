/**
 * LLM 调用端口 — 领域层接口定义
 *
 * 所有需要调用 LLM 的领域服务依赖此端口，
 * 具体实现（OpenAI Compatible API、Ollama 等）在 infrastructure 层提供。
 */

import { AIMessage, AITool, LLMChatResult } from '../model/ai.model';

export interface ILLMClient {
  /**
   * 非流式对话（支持 tool calling）
   */
  chat(
    messages: AIMessage[],
    options?: {
      tools?: AITool[];
      toolChoice?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMChatResult>;

  /**
   * 流式对话（仅纯文本输出，不支持 tool calling）
   */
  chatStream(messages: AIMessage[]): AsyncGenerator<string>;

  /**
   * 简单文本补全（适用于关键词提取、分类等轻量任务）
   */
  complete(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string>;
}
