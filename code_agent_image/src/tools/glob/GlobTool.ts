/**
 * GlobTool — 按模式查找文件
 */
import { glob } from 'glob';
import * as path from 'path';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class GlobTool implements Tool {
  readonly name = 'glob';
  readonly description = '按 glob 模式查找文件。用于发现项目中的文件结构。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob 模式（如 "**/*.ts" 或 "src/**/*.{js,jsx}"）',
      },
      path: {
        type: 'string',
        description: '搜索的根路径，默认当前工作目录',
      },
    },
    required: ['pattern'],
  };

  isReadOnly(): boolean {
    return true;
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = String(args.pattern);
    const searchPath = args.path
      ? path.isAbsolute(String(args.path))
        ? String(args.path)
        : path.resolve(ctx.workingDir, String(args.path))
      : ctx.workingDir;

    try {
      const files = await glob(pattern, {
        cwd: searchPath,
        nodir: false,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
        maxDepth: 10,
      });

      if (files.length === 0) {
        return { success: true, output: `未找到匹配 "${pattern}" 的文件。` };
      }

      const maxResults = 100;
      const truncated = files.length > maxResults;
      const result = files.slice(0, maxResults).join('\n');

      return {
        success: true,
        output: `找到 ${files.length} 个文件${truncated ? `（仅显示前 ${maxResults} 个）` : ''}:\n${result}`,
      };
    } catch (error) {
      return { success: false, output: `文件搜索失败: ${error.message}` };
    }
  }
}
