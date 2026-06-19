/**
 * MessageStore — 对话消息持久化
 *
 * 保存所有 WS 消息到文件系统（JSONL 格式），支持重连后恢复全部对话历史。
 * 包括 chat、tool 调用、工作流事件、决策等所有类型。
 *
 * 流式输出采用三态管理：
 * - startStream(): 在内存中创建 isStreaming 消息（不写 JSONL）
 * - appendChunk(): 仅更新内存中的 content
 * - endStream():   写入 JSONL 并清除 isStreaming 标记
 * 这样 getAll() 任何时刻都能返回包含流式中内容的完整消息列表。
 */
import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface StoredMessage {
  id: string;
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
  /** 文本内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 是否正在流式输出中（仅内存态，不写入 JSONL） */
  isStreaming?: boolean;
  /** 是否已写入 JSONL（仅内存态） */
  _persisted?: boolean;
  /** 工具调用信息（role=tool_call 时） */
  toolCall?: {
    tool: string;
    args: Record<string, unknown>;
  };
  /** 工具结果（role=tool_result 时） */
  toolResult?: {
    tool: string;
    result: unknown;
    timeMs: number;
    success: boolean;
  };
  /** 决策信息（role=system 时） */
  decision?: {
    decisionId: string;
    question: string;
    options?: string[];
    context?: string;
    responded?: boolean;
    choice?: string;
  };
  /** 工作流信息 */
  workflow?: {
    workflowId: string;
    type: string;
    data?: unknown;
  };
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class MessageStore {
  @Config('agent')
  agentConfig: { workspaceDir: string };

  private messages: StoredMessage[] = [];
  private loaded = false;

  /** 当前流式消息 ID */
  private streamingMsgId: string | null = null;

  private get filePath(): string {
    return path.join(this.agentConfig.workspaceDir, '.code-agent', 'messages.jsonl');
  }

  /** 加载历史消息（仅首次调用时从文件读取） */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.messages = content
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter((m): m is StoredMessage => m !== null);
    } catch {
      this.messages = [];
    }
    this.loaded = true;
  }

  /** 追加消息并持久化到 JSONL */
  async append(msg: StoredMessage): Promise<void> {
    await this.load();
    this.messages.push(msg);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, JSON.stringify(msg) + '\n', 'utf-8');
  }

  /** 获取全部消息（含正在流式输出的消息及其累积内容） */
  async getAll(): Promise<StoredMessage[]> {
    await this.load();
    return [...this.messages];
  }

  /** 获取最近 N 条消息 */
  async getRecent(limit: number): Promise<StoredMessage[]> {
    await this.load();
    return this.messages.slice(-limit);
  }

  /** 清空消息 */
  async clear(): Promise<void> {
    this.messages = [];
    this.streamingMsgId = null;
    try {
      await fs.unlink(this.filePath);
    } catch { /* ignore */ }
  }

  // ─── 流式输出管理 ─────────────────────────────────

  /**
   * 开始流式输出 — 每轮 ReAct 推理创建独立的 assistant 消息
   * 仅在内存中创建，不写 JSONL（等 endStream 再写）
   */
  async startStream(id: string): Promise<void> {
    await this.load();
    const msg: StoredMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    this.messages.push(msg);
    this.streamingMsgId = id;
  }

  /** 追加流式 chunk — 仅更新内存，不写磁盘 */
  appendChunk(chunk: string): void {
    if (!this.streamingMsgId) return;
    const msg = this.messages.find(m => m.id === this.streamingMsgId);
    if (msg) {
      msg.content += chunk;
    }
  }

  /** 结束流式输出 — 清除 isStreaming 标记并立即写入 JSONL */
  async endStream(): Promise<void> {
    if (!this.streamingMsgId) return;
    const msg = this.messages.find(m => m.id === this.streamingMsgId);
    if (msg && msg.content) {
      msg.isStreaming = false;
      msg._persisted = true;
      // 立即写入 JSONL（不含内部标记字段）
      const { isStreaming, _persisted, ...persistMsg } = msg;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, JSON.stringify(persistMsg) + '\n', 'utf-8');
    } else if (msg) {
      // 流式内容为空，移除这条消息
      const idx = this.messages.indexOf(msg);
      if (idx >= 0) this.messages.splice(idx, 1);
    }
    this.streamingMsgId = null;
  }

  /** 获取当前是否有流式输出正在进行 */
  isCurrentlyStreaming(): boolean {
    return this.streamingMsgId !== null;
  }

  /** 获取最后一条已完成的 assistant 消息内容（用于去重） */
  getLastAssistantContent(): string | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === 'assistant' && m.content && !m.isStreaming) {
        return m.content;
      }
    }
    return null;
  }
}
