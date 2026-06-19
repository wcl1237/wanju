/**
 * FileEditTool — 精确编辑文件（搜索替换）
 *
 * 参考 Claude Code FileEditTool 的精确替换模式。
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolContext, ToolResult, ToolInputSchema } from '../tool.interface';

export class FileEditTool implements Tool {
  readonly name = 'file_edit';
  readonly description = '精确编辑已有文件。通过指定要替换的原始文本和替换后的新文本来修改文件内容。原始文本必须与文件中的内容完全匹配。';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要编辑的文件路径',
      },
      old_text: {
        type: 'string',
        description: '要被替换的原始文本（必须与文件中的内容完全匹配）',
      },
      new_text: {
        type: 'string',
        description: '替换后的新文本',
      },
    },
    required: ['file_path', 'old_text', 'new_text'],
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = this.resolvePath(String(args.file_path), ctx.workingDir);
    const oldText = String(args.old_text);
    const newText = String(args.new_text);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // 检查原始文本是否存在
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          output: `未找到要替换的文本。请确保 old_text 与文件中的内容完全匹配（包括空格和缩进）。\n\n文件前 200 字符:\n${content.substring(0, 200)}`,
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          output: `找到 ${occurrences} 处匹配，为避免误替换，请提供更具体的 old_text 使其唯一匹配。`,
        };
      }

      const newContent = content.replace(oldText, newText);
      await fs.writeFile(filePath, newContent, 'utf-8');

      // 生成简短 diff 预览
      const oldLines = oldText.split('\n').length;
      const newLines = newText.split('\n').length;

      return {
        success: true,
        output: `文件已编辑: ${filePath}\n替换了 ${oldLines} 行 → ${newLines} 行`,
        artifacts: [{ path: filePath, action: 'modified' }],
      };
    } catch (error) {
      return { success: false, output: `编辑文件失败: ${error.message}` };
    }
  }

  private resolvePath(filePath: string, workingDir: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(workingDir, filePath);
  }
}
