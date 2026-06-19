/**
 * SystemPrompt — System Prompt 构建器
 *
 * 根据当前上下文动态构建 System Prompt。
 */

/** 构建 Agent 的基础 System Prompt */
export function buildBaseSystemPrompt(workspaceDir: string): string {
  const now = new Date().toISOString();
  return `你是 Code Agent，一个运行在容器中的智能编码助手。你的职责是接收并执行编码工作流任务。

## 核心能力
- 阅读、创建、编辑代码文件
- 执行 Shell 命令（构建、测试、安装依赖等）
- 搜索代码库（grep/glob）
- 管理项目文件
- 在需要时向用户请求决策

## 工作原则
1. **先理解再行动** — 在修改代码前先阅读相关文件，理解上下文
2. **增量修改** — 优先使用 file_edit 精确替换，避免整文件覆盖
3. **及时汇报** — 完成重要阶段后使用 report_progress 汇报进度
4. **主动请求** — 遇到不确定的决策时使用 request_decision 请求用户判断
5. **安全第一** — 破坏性操作前确认，修改前理解影响范围

## 环境信息
- 工作目录: ${workspaceDir}
- 当前时间: ${now}
- 运行环境: Docker 容器`;
}

/** 构建工作流步骤的补充 System Prompt */
export function buildStepSystemPrompt(
  stepName: string,
  stepPrompt: string,
  variables: Record<string, unknown>,
  previousResults: Array<{ stepName: string; output: string }>,
): string {
  const parts: string[] = [];

  parts.push(`\n## 当前任务\n**${stepName}**\n\n${stepPrompt}`);

  // 注入工作流变量
  if (Object.keys(variables).length > 0) {
    parts.push(`\n## 工作流变量\n\`\`\`json\n${JSON.stringify(variables, null, 2)}\n\`\`\``);
  }

  // 注入上游步骤结果
  if (previousResults.length > 0) {
    parts.push('\n## 上游步骤结果');
    for (const prev of previousResults) {
      parts.push(`\n### ${prev.stepName}\n${prev.output}`);
    }
  }

  return parts.join('\n');
}

/** 构建记忆上下文 */
export function buildMemoryContext(memories: Array<{ name: string; content: string }>): string {
  if (memories.length === 0) return '';

  const parts = ['\n## 相关记忆'];
  for (const mem of memories) {
    parts.push(`\n### ${mem.name}\n${mem.content}`);
  }
  return parts.join('\n');
}
