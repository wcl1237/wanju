/**
 * ConversationManager — 对话管理
 *
 * 管理对话上下文，支持工作流绑定对话和独立对话。
 */
import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, Message } from './types';

@Provide()
@Scope(ScopeEnum.Request)
export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();

  /** 创建新对话 */
  createConversation(workflowId?: string): Conversation {
    const conv: Conversation = {
      id: uuidv4(),
      workflowId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.conversations.set(conv.id, conv);
    return conv;
  }

  /** 获取对话 */
  getConversation(convId: string): Conversation | undefined {
    return this.conversations.get(convId);
  }

  /** 按工作流 ID 查找对话 */
  getByWorkflowId(workflowId: string): Conversation | undefined {
    for (const conv of this.conversations.values()) {
      if (conv.workflowId === workflowId) return conv;
    }
    return undefined;
  }

  /** 追加消息 */
  addMessage(convId: string, message: Message): void {
    const conv = this.conversations.get(convId);
    if (!conv) throw new Error(`对话不存在: ${convId}`);
    conv.messages.push(message);
    conv.updatedAt = Date.now();
  }

  /** 获取用于 LLM 的上下文消息（排除 system 消息，最近 N 条） */
  getContextMessages(convId: string, maxMessages = 40): Message[] {
    const conv = this.conversations.get(convId);
    if (!conv) return [];

    const nonSystem = conv.messages.filter(m => m.role !== 'system');

    if (nonSystem.length <= maxMessages) {
      return nonSystem;
    }

    // 保留最近的消息，但确保不切断 tool_call / tool 对
    const recent = nonSystem.slice(-maxMessages);

    // 确保第一条消息不是 tool 角色（否则 LLM API 会报错）
    while (recent.length > 0 && recent[0].role === 'tool') {
      recent.shift();
    }

    return recent;
  }

  /** 设置对话摘要（压缩历史时使用） */
  setSummary(convId: string, summary: string): void {
    const conv = this.conversations.get(convId);
    if (conv) {
      conv.summary = summary;
      conv.updatedAt = Date.now();
    }
  }

  /** 删除对话 */
  deleteConversation(convId: string): void {
    this.conversations.delete(convId);
  }
}
