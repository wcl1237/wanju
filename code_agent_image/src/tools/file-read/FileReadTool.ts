/**
 * FileReadTool — 读取文件内容
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class FileReadTool implements Tool {
  readonly name = 'file_read';
  readonly description = '读取文件的内容。可以指定行范围读取部分内容。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要读取的文件路径（相对于工作目录或绝对路径）',
      },
      start_line: {
        type: 'number',
        description: '起始行号（1-indexed，可选）',
      },
      end_line: {
        type: 'number',
        description: '结束行号（1-indexed，可选）',
      },
    },
    required: ['file_path'],
  };

  isReadOnly(): boolean {
    return true;
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = this.resolvePath(String(args.file_path), ctx.workingDir);
    const startLine = args.start_line ? Number(args.start_line) : undefined;
    const endLine = args.end_line ? Number(args.end_line) : undefined;

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(filePath, { withFileTypes: true });
        const listing = entries.map(e =>
          `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`
        ).join('\n');
        return { success: true, output: `目录内容 (${filePath}):\n${listing}` };
      }

      // 限制文件大小（5MB）
      if (stat.size > 5 * 1024 * 1024) {
        return {
          success: false,
          output: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，请使用 bash 工具的 head/tail 命令。`,
        };
      }

      let content = await fs.readFile(filePath, 'utf-8');

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const start = Math.max(0, (startLine || 1) - 1);
        const end = Math.min(lines.length, endLine || lines.length);
        content = lines.slice(start, end)
          .map((line, i) => `${start + i + 1}: ${line}`)
          .join('\n');
        return {
          success: true,
          output: `文件 ${filePath} (行 ${start + 1}-${end}, 共 ${lines.length} 行):\n${content}`,
        };
      }

      const lineCount = content.split('\n').length;
      return {
        success: true,
        output: `文件 ${filePath} (${lineCount} 行, ${stat.size} 字节):\n${content}`,
      };
    } catch (error) {
      return { success: false, output: `读取文件失败: ${error.message}` };
    }
  }

  private resolvePath(filePath: string, workingDir: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(workingDir, filePath);
  }
}
