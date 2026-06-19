/**
 * HistoryStore — 对话历史与工作流日志持久化
 */
import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface HistoryEntry {
  timestamp: number;
  type: 'chat' | 'workflow' | 'decision';
  workflowId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class HistoryStore {
  @Config('agent')
  agentConfig: { workspaceDir: string };

  private get historyDir(): string {
    return path.join(this.agentConfig.workspaceDir, '.code-agent', 'history');
  }

  /** 追加历史记录（JSONL 格式） */
  async append(entry: HistoryEntry): Promise<void> {
    await fs.mkdir(this.historyDir, { recursive: true });
    const filePath = path.join(this.historyDir, 'history.jsonl');
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');
  }

  /** 保存工作流执行记录 */
  async saveWorkflowRecord(workflowId: string, record: Record<string, unknown>): Promise<void> {
    const workflowDir = path.join(this.agentConfig.workspaceDir, '.code-agent', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    const filePath = path.join(workflowDir, `${workflowId}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  /** 读取最近的历史记录 */
  async readRecent(limit = 50): Promise<HistoryEntry[]> {
    const filePath = path.join(this.historyDir, 'history.jsonl');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines
        .slice(-limit)
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter((e): e is HistoryEntry => e !== null);
    } catch {
      return [];
    }
  }

  /** 读取工作流执行记录 */
  async readWorkflowRecord(workflowId: string): Promise<Record<string, unknown> | null> {
    const filePath = path.join(this.agentConfig.workspaceDir, '.code-agent', 'workflows', `${workflowId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
