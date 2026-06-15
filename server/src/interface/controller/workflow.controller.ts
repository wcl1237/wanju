import { Controller, Get, Post, Put, Del, Inject, Param, Body } from '@midwayjs/core';
import { WorkflowAppService } from '../../application/workflow.app-service';
import { CreateWorkflowDTO, UpdateWorkflowDTO } from '../../domain/workflow/model/workflow.model';
import { ILLMClient } from '../../domain/ai/port/llm.port';

@Controller('/api/workflows')
export class WorkflowController {
  @Inject()
  workflowAppService: WorkflowAppService;

  @Inject('llmClient')
  llmClient: ILLMClient;

  @Get('/')
  async list() {
    const data = await this.workflowAppService.getAll();
    return { success: true, data };
  }

  @Get('/:id')
  async getOne(@Param('id') id: string) {
    const data = await this.workflowAppService.getById(id);
    if (!data) return { success: false, message: '工作流不存在' };
    return { success: true, data };
  }

  @Post('/generate')
  async generateWorkflow(@Body() body: { requirement: string }) {
    const prompt = `你是一个工作流设计专家。请根据用户需求，设计一个客服工作流的节点和连线。

## 可用节点类型
- start: 开始节点（必须有且只有一个，工作流入口）
- end: 结束节点（流程终止）
- reply: 消息回复（固定文本回复），data 字段: { replyText: "回复文本", isFinalReply?: true }
- llm_reply: AI 生成回复（LLM 动态生成），data 字段: { prompt: "生成提示词", isFinalReply?: true }
- condition: 条件分支（根据条件走不同路径），data 字段: { conditionField: "判断字段", conditionOp: "contains|equals|not_empty|has_result", conditionValue: "比较值", responseText?: "分支结果反馈" }
- extract: 参数提取（从用户消息提取关键信息），data 字段: { params: ["参数名1", "参数名2"], extractPrompt?: "提取指导", responseText?: "提取完成后的反馈" }
- knowledge: 知识检索（搜索知识库），data 字段: { query: "检索查询，留空使用用户消息", topK: 3, responseText?: "检索完成后的反馈" }
- ticket: 创建工单，data 字段: { title: "工单标题", category: "general|refund|complaint|inquiry", ticketPriority: "low|medium|high", responseText?: "工单创建后的反馈" }

注意: 除 reply/llm_reply 外的节点可通过 responseText 字段在执行后向用户发送反馈消息，支持 {{参数名}} 变量。

## 连线规则
- 普通节点的 source 锚点 ID 不需要指定
- condition 节点有两个输出锚点: "true"（是）和 "false"（否），连线时 sourceHandle 必须是 "true" 或 "false"
- 每个连线需要 markerEnd: { type: "arrowclosed", color: "#a855f7" }
- 连线 style: { stroke: "#a855f780", strokeWidth: 2 }
- animated: true

## 输出格式
严格输出 JSON，不要包含任何其他文字。格式:
{
  "name": "工作流名称",
  "nodes": [
    { "id": "node_1", "type": "start", "position": { "x": 400, "y": 50 }, "data": { "label": "开始" } },
    ...
  ],
  "edges": [
    { "id": "e1", "source": "node_1", "target": "node_2", "markerEnd": { "type": "arrowclosed", "color": "#a855f7" }, "style": { "stroke": "#a855f780", "strokeWidth": 2 }, "animated": true },
    ...
  ]
}

## 布局规则
- 节点从上到下排列（TB方向）
- y 坐标从 50 开始，每行间隔 120
- 并列节点 x 坐标间隔 300
- 主线 x=400

## 用户需求
${body.requirement}

请输出 JSON:`;

    try {
      const raw = await this.llmClient.complete(prompt, { temperature: 0.3, maxTokens: 3000 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false, message: 'AI 输出格式异常，请重试' };
      }
      const result = JSON.parse(jsonMatch[0]);
      return { success: true, data: result };
    } catch (e: any) {
      console.error('[Workflow] AI 生成工作流失败:', e.message);
      return { success: false, message: 'AI 生成失败: ' + (e.message || '未知错误') };
    }
  }

  @Post('/')
  async create(@Body() body: CreateWorkflowDTO) {
    const data = await this.workflowAppService.create(body);
    return { success: true, data };
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: UpdateWorkflowDTO) {
    const data = await this.workflowAppService.update(id, body);
    if (!data) return { success: false, message: '工作流不存在' };
    return { success: true, data };
  }

  @Del('/:id')
  async delete(@Param('id') id: string) {
    const ok = await this.workflowAppService.delete(id);
    return { success: ok, message: ok ? '删除成功' : '工作流不存在' };
  }
}
