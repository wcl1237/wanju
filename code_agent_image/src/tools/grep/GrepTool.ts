/**
 * GrepTool — 正则搜索文件内容
 */
import { exec } from 'child_process';
import * as path from 'path';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class GrepTool implements Tool {
  readonly name = 'grep';
  readonly description = '在文件中搜索匹配指定模式的内容。使用 ripgrep (rg) 进行高性能正则搜索。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索模式（正则表达式）',
      },
      path: {
        type: 'string',
        description: '搜索路径（文件或目录），默认当前工作目录',
      },
      include: {
        type: 'string',
        description: '文件类型过滤（如 "*.ts" 或 "*.py"）',
      },
      case_insensitive: {
        type: 'string',
        description: '是否忽略大小写（true/false），默认 false',
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
    const include = args.include ? String(args.include) : undefined;
    const caseInsensitive = String(args.case_insensitive) === 'true';

    // 优先使用 ripgrep，回退到 grep
    const useRg = await this.hasCommand('rg');
    let cmd: string;

    if (useRg) {
      cmd = `rg --line-number --max-count=50 --color=never`;
      if (caseInsensitive) cmd += ' --ignore-case';
      if (include) cmd += ` --glob '${include}'`;
      cmd += ` '${pattern.replace(/'/g, "'\\''")}'`;
      cmd += ` '${searchPath}'`;
    } else {
      cmd = `grep -rnI --max-count=50 --color=never`;
      if (caseInsensitive) cmd += ' -i';
      if (include) cmd += ` --include='${include}'`;
      cmd += ` '${pattern.replace(/'/g, "'\\''")}'`;
      cmd += ` '${searchPath}'`;
    }

    return new Promise<ToolResult>((resolve) => {
      exec(cmd, { cwd: ctx.workingDir, timeout: 30000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error && error.code === 1) {
          // grep 返回 1 表示无匹配
          resolve({ success: true, output: '未找到匹配结果。' });
        } else if (error) {
          resolve({ success: false, output: `搜索失败: ${stderr || error.message}` });
        } else {
          const lines = stdout.trim().split('\n');
          const truncated = lines.length >= 50;
          resolve({
            success: true,
            output: `找到 ${lines.length} 处匹配${truncated ? '（结果已截断至 50 条）' : ''}:\n\n${stdout.trim()}`,
          });
        }
      });
    });
  }

  private hasCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`which ${cmd}`, (error) => resolve(!error));
    });
  }
}
