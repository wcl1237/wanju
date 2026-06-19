/**
 * BashTool — Shell 命令执行
 *
 * 参考 Claude Code BashTool，在容器内执行 Shell 命令。
 */
import { exec } from 'child_process';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class BashTool implements Tool {
  readonly name = 'bash';
  readonly description = '在容器内执行 Shell 命令。用于运行构建工具、包管理器、git 操作、文件处理等。命令在工作目录中执行。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 Shell 命令',
      },
      timeout: {
        type: 'number',
        description: '命令超时时间（毫秒），默认 60000',
        default: 60000,
      },
    },
    required: ['command'],
  };

  isReadOnly(args: Record<string, unknown>): boolean {
    const cmd = String(args.command || '').trim();
    const readOnlyPrefixes = [
      'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep',
      'which', 'whoami', 'pwd', 'echo', 'date', 'env',
      'stat', 'file', 'du', 'df', 'tree', 'git log',
      'git status', 'git diff', 'git branch', 'git show',
    ];
    return readOnlyPrefixes.some(p => cmd.startsWith(p));
  }

  isDestructive(args: Record<string, unknown>): boolean {
    const cmd = String(args.command || '').trim();
    const destructivePrefixes = [
      'rm -rf', 'rm -r', 'rmdir', 'mkfs',
      'dd if=', 'shred', 'truncate',
      'drop database', 'drop table',
    ];
    return destructivePrefixes.some(p => cmd.toLowerCase().includes(p));
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const command = String(args.command);
    const timeout = Number(args.timeout) || 60000;

    // 破坏性操作需要用户确认
    if (this.isDestructive(args)) {
      const decision = await ctx.requestDecision({
        id: `bash-confirm-${Date.now()}`,
        question: `即将执行可能具有破坏性的命令：\n\`${command}\`\n\n是否继续？`,
        context: `工作目录: ${ctx.workingDir}`,
        options: ['确认执行', '取消'],
        priority: 'blocking',
      });
      if (decision.choice === '取消') {
        return { success: false, output: '用户取消了命令执行。' };
      }
    }

    return new Promise<ToolResult>((resolve) => {
      const child = exec(command, {
        cwd: ctx.workingDir,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: { ...process.env, TERM: 'dumb' },
      }, (error, stdout, stderr) => {
        if (ctx.abortSignal.aborted) {
          resolve({ success: false, output: '命令被中断。' });
          return;
        }

        const combinedOutput = [
          stdout ? `stdout:\n${stdout}` : '',
          stderr ? `stderr:\n${stderr}` : '',
        ].filter(Boolean).join('\n\n');

        if (error && error.killed) {
          resolve({
            success: false,
            output: `命令超时（${timeout}ms）。\n\n${combinedOutput}`.trim(),
          });
        } else if (error) {
          resolve({
            success: false,
            output: `命令退出码 ${error.code}。\n\n${combinedOutput}`.trim(),
          });
        } else {
          resolve({
            success: true,
            output: combinedOutput || '(无输出)',
          });
        }
      });

      // 支持中断
      ctx.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      });
    });
  }
}
