/**
 * SaveMemoryTool — 保存重要信息到记忆系统
 */
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

/** 通过工厂函数注入 MemoryStore，因为工具不在 IoC 容器内 */
export function createSaveMemoryTool(memoryStore: any): Tool {
  return {
    name: 'save_memory',
    description: '将重要信息保存到记忆系统中，以便在未来的工作流中使用。适用于保存项目知识、用户偏好、技术决策等。',

    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '记忆名称（简短，唯一标识）',
        },
        description: {
          type: 'string',
          description: '一句话描述该记忆（用于未来检索时判断相关性）',
        },
        type: {
          type: 'string',
          description: '记忆类型',
          enum: ['user', 'feedback', 'project', 'reference'],
        },
        content: {
          type: 'string',
          description: '记忆内容（详细信息）',
        },
      },
      required: ['name', 'description', 'type', 'content'],
    },

    async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      try {
        const filePath = await memoryStore.save({
          name: String(args.name),
          description: String(args.description),
          type: String(args.type) as any,
          created: new Date().toISOString(),
          content: String(args.content),
        });

        return {
          success: true,
          output: `记忆已保存: ${args.name} (${args.type})`,
        };
      } catch (error) {
        return { success: false, output: `保存记忆失败: ${error.message}` };
      }
    },
  };
}
