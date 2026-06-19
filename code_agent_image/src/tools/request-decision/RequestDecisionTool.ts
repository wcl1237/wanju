/**
 * RequestDecisionTool — 请求用户决策
 *
 * 当 Agent 遇到需要人类判断的情况时，通过此工具暂停执行并等待用户输入。
 */
import { v4 as uuidv4 } from 'uuid';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class RequestDecisionTool implements Tool {
  readonly name = 'request_decision';
  readonly description = '请求用户做出决策。当遇到多个方案需要选择、需要用户确认、或缺少必要信息时使用。Agent 会暂停执行直到收到用户回复。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: '向用户提出的问题',
      },
      context: {
        type: 'string',
        description: '问题的背景上下文说明',
      },
      options: {
        type: 'string',
        description: '可选项列表，用逗号分隔（如 "方案A,方案B,方案C"）。留空则允许用户自由输入。',
      },
    },
    required: ['question', 'context'],
  };

  isReadOnly(): boolean {
    return true;
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const question = String(args.question);
    const context = String(args.context);
    const options = args.options
      ? String(args.options).split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const decision = await ctx.requestDecision({
      id: uuidv4(),
      question,
      context,
      options,
      priority: 'blocking',
    });

    return {
      success: true,
      output: `用户决策: ${decision.choice}${decision.data ? `\n附加数据: ${JSON.stringify(decision.data)}` : ''}`,
    };
  }
}
