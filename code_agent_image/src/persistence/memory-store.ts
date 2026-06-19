/**
 * MemoryStore — 记忆存储
 *
 * 参考 Claude Code 的 Memory YAML 前置元数据格式，持久化到文件系统。
 */
import { Provide, Scope, ScopeEnum, Config } from '@midwayjs/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryEntry {
  name: string;
  description: string;
  type: MemoryType;
  created: string;
  source?: string;
  content: string;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class MemoryStore {
  @Config('agent')
  agentConfig: { workspaceDir: string };

  private get memoryDir(): string {
    return path.join(this.agentConfig.workspaceDir, '.code-agent', 'memory');
  }

  /** 保存记忆 */
  async save(entry: MemoryEntry): Promise<string> {
    const typeDir = path.join(this.memoryDir, entry.type);
    await fs.mkdir(typeDir, { recursive: true });

    const fileName = this.slugify(entry.name) + '.md';
    const filePath = path.join(typeDir, fileName);

    const frontmatter = {
      name: entry.name,
      description: entry.description,
      type: entry.type,
      created: entry.created || new Date().toISOString(),
      source: entry.source,
    };

    const content = `---\n${stringifyYaml(frontmatter)}---\n\n${entry.content}\n`;
    await fs.writeFile(filePath, content, 'utf-8');

    // 更新索引
    await this.updateIndex();

    return filePath;
  }

  /** 读取所有记忆 */
  async readAll(): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];

    try {
      const types: MemoryType[] = ['user', 'feedback', 'project', 'reference'];
      for (const type of types) {
        const typeDir = path.join(this.memoryDir, type);
        try {
          const files = await fs.readdir(typeDir);
          for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const entry = await this.readFile(path.join(typeDir, file));
            if (entry) entries.push(entry);
          }
        } catch {
          // 目录不存在，跳过
        }
      }
    } catch {
      // 根目录不存在
    }

    return entries;
  }

  /** 按类型读取记忆 */
  async readByType(type: MemoryType): Promise<MemoryEntry[]> {
    const typeDir = path.join(this.memoryDir, type);
    const entries: MemoryEntry[] = [];

    try {
      const files = await fs.readdir(typeDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const entry = await this.readFile(path.join(typeDir, file));
        if (entry) entries.push(entry);
      }
    } catch {
      // 目录不存在
    }

    return entries;
  }

  /** 搜索记忆（简单关键字匹配） */
  async search(query: string): Promise<MemoryEntry[]> {
    const all = await this.readAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(e =>
      e.name.toLowerCase().includes(lowerQuery) ||
      e.description.toLowerCase().includes(lowerQuery) ||
      e.content.toLowerCase().includes(lowerQuery)
    );
  }

  /** 删除记忆 */
  async delete(type: MemoryType, name: string): Promise<boolean> {
    const fileName = this.slugify(name) + '.md';
    const filePath = path.join(this.memoryDir, type, fileName);

    try {
      await fs.unlink(filePath);
      await this.updateIndex();
      return true;
    } catch {
      return false;
    }
  }

  // ─── 私有方法 ───────────────────────────────────────────

  private async readFile(filePath: string): Promise<MemoryEntry | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
      if (!match) return null;

      const frontmatter = parseYaml(match[1]);
      return {
        name: frontmatter.name || '',
        description: frontmatter.description || '',
        type: frontmatter.type || 'project',
        created: frontmatter.created || '',
        source: frontmatter.source,
        content: match[2].trim(),
      };
    } catch {
      return null;
    }
  }

  /** 更新 MEMORY.md 索引文件 */
  private async updateIndex(): Promise<void> {
    const entries = await this.readAll();
    const lines = ['# Memory Index\n'];

    const grouped: Record<string, MemoryEntry[]> = {};
    for (const e of entries) {
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type].push(e);
    }

    for (const [type, items] of Object.entries(grouped)) {
      lines.push(`## ${type}\n`);
      for (const item of items) {
        lines.push(`- **${item.name}**: ${item.description}`);
      }
      lines.push('');
    }

    const indexPath = path.join(this.memoryDir, 'MEMORY.md');
    await fs.mkdir(this.memoryDir, { recursive: true });
    await fs.writeFile(indexPath, lines.join('\n'), 'utf-8');
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
