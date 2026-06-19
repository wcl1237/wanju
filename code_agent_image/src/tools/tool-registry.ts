/**
 * Tool Registry — 工具注册中心
 *
 * 管理所有可用工具的注册和查找。
 * 参考 Claude Code 的 tools.ts 注册模式。
 */
import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { Tool, ToolDefinition } from './tool.interface';

@Provide()
@Scope(ScopeEnum.Singleton)
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /** 注册工具 */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool "${tool.name}" is already registered, overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** 批量注册 */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** 按名称获取工具 */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** 获取所有工具 */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** 按名称列表获取子集 */
  getSubset(names: string[]): Tool[] {
    return names
      .map(name => this.tools.get(name))
      .filter((t): t is Tool => t !== undefined);
  }

  /** 获取所有工具的 OpenAI Function Calling 定义 */
  getToolDefinitions(names?: string[]): ToolDefinition[] {
    const tools = names ? this.getSubset(names) : this.getAll();
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /** 获取已注册的工具名称列表 */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
