/**
 * 工作流工具函数 — 供各 Executor 共享
 */

/** 模板替换 {{paramName}} */
export function templateReplace(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] || '');
}

/**
 * 根据 Agent 配置的 action 名称列表，从全局 actions 中筛选并构建 LLM tools
 */
export function buildAgentTools(
  agentActions: string[],
  allActions: Map<string, { definition(): { name: string; description: string; parameters: any } }>,
): any[] {
  const tools: any[] = [];
  for (const actionName of agentActions) {
    const action = allActions.get(actionName);
    if (action) {
      const def = action.definition();
      tools.push({
        type: 'function',
        function: { name: def.name, description: def.description, parameters: def.parameters },
      });
    }
  }
  return tools;
}
