/**
 * ReportProgressTool — 主动汇报进度
 *
 * 允许 Agent 主动向用户汇报当前工作进度。
 */
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class ReportProgressTool implements Tool {
  readonly name = 'report_progress';
  readonly description = '向用户汇报当前工作进度。当完成重要阶段或需要用户了解当前状态时使用。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '进度消息内容',
      },
      percent: {
        type: 'number',
        description: '完成百分比（0-100），可选',
      },
    },
    required: ['message'],
  };

  isReadOnly(): boolean {
    return true;
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const message = String(args.message);
    const percent = args.percent !== undefined ? Number(args.percent) : undefined;

    ctx.onProgress?.(
      percent !== undefined ? `[${percent}%] ${message}` : message
    );

    return {
      success: true,
      output: '进度已汇报给用户。',
    };
  }
}
