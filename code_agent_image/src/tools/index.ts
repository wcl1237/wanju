/**
 * Tools Index — 注册所有内置工具
 */
import { ToolRegistry } from './tool-registry';
import { BashTool } from './bash/BashTool';
import { FileReadTool } from './file-read/FileReadTool';
import { FileWriteTool } from './file-write/FileWriteTool';
import { FileEditTool } from './file-edit/FileEditTool';
import { GrepTool } from './grep/GrepTool';
import { GlobTool } from './glob/GlobTool';
import { ReportProgressTool } from './report-progress/ReportProgressTool';
import { RequestDecisionTool } from './request-decision/RequestDecisionTool';
import { createSaveMemoryTool } from './save-memory/SaveMemoryTool';
import { createRecallMemoryTool } from './recall-memory/RecallMemoryTool';

/**
 * 创建并注册所有内置工具
 */
export function registerBuiltinTools(registry: ToolRegistry, memoryStore: any): void {
  registry.registerAll([
    new BashTool(),
    new FileReadTool(),
    new FileWriteTool(),
    new FileEditTool(),
    new GrepTool(),
    new GlobTool(),
    new ReportProgressTool(),
    new RequestDecisionTool(),
    createSaveMemoryTool(memoryStore),
    createRecallMemoryTool(memoryStore),
  ]);
}
