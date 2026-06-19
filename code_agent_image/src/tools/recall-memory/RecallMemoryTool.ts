/**
 * RecallMemoryTool — 检索相关记忆
 */
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export function createRecallMemoryTool(memoryStore: any): Tool {
  return {
    name: 'recall_memory',
    description: '检索记忆系统中的相关信息。用于获取之前保存的项目知识、用户偏好、技术决策等。',

    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        type: {
          type: 'string',
          description: '按类型过滤（可选）',
          enum: ['user', 'feedback', 'project', 'reference'],
        },
      },
      required: ['query'],
    },

    isReadOnly(): boolean {
      return true;
    },

    async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      try {
        let results;
        if (args.type) {
          results = await memoryStore.readByType(String(args.type));
          const query = String(args.query).toLowerCase();
          results = results.filter((e: any) =>
            e.name.toLowerCase().includes(query) ||
            e.description.toLowerCase().includes(query) ||
            e.content.toLowerCase().includes(query)
          );
        } else {
          results = await memoryStore.search(String(args.query));
        }

        if (results.length === 0) {
          return { success: true, output: '未找到相关记忆。' };
        }

        const output = results.map((e: any) =>
          `### ${e.name} (${e.type})\n${e.description}\n\n${e.content}`
        ).join('\n\n---\n\n');

        return {
          success: true,
          output: `找到 ${results.length} 条相关记忆:\n\n${output}`,
        };
      } catch (error) {
        return { success: false, output: `检索记忆失败: ${error.message}` };
      }
    },
  };
}
