/**
 * FileWriteTool — 创建/覆盖文件
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class FileWriteTool implements Tool {
  readonly name = 'file_write';
  readonly description = '创建新文件或覆盖已有文件的全部内容。自动创建父目录。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要写入的文件路径（相对于工作目录或绝对路径）',
      },
      content: {
        type: 'string',
        description: '要写入的文件内容',
      },
    },
    required: ['file_path', 'content'],
  };

  isDestructive(args: Record<string, unknown>): boolean {
    // 覆盖已有文件是破坏性的（但由 Agent 自行决策，不主动拦截）
    return false;
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = this.resolvePath(String(args.file_path), ctx.workingDir);
    const content = String(args.content);

    try {
      // 确保父目录存在
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      const existed = await this.fileExists(filePath);
      await fs.writeFile(filePath, content, 'utf-8');

      const stat = await fs.stat(filePath);
      const action = existed ? 'modified' : 'created';

      return {
        success: true,
        output: `文件已${existed ? '覆盖' : '创建'}: ${filePath} (${stat.size} 字节)`,
        artifacts: [{ path: filePath, action, size: stat.size }],
      };
    } catch (error) {
      return { success: false, output: `写入文件失败: ${error.message}` };
    }
  }

  private resolvePath(filePath: string, workingDir: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(workingDir, filePath);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
