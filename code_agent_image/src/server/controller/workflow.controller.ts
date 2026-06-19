/**
 * Workflow Controller — HTTP API 路由
 */
import { Controller, Get, Post, Inject, Body, Param } from '@midwayjs/core';
import { WorkflowRunner } from '../../workflow/workflow-runner';
import { HistoryStore } from '../../persistence/history-store';
import { WorkflowDefinition } from '../../workflow/types';

@Controller('/api/workflow')
export class WorkflowController {
  @Inject()
  historyStore: HistoryStore;

  /** 工作流状态缓存（简化版，后续可换为 Redis） */
  private static workflows: Map<string, {
    status: string;
    runner?: WorkflowRunner;
    startTime: number;
  }> = new Map();

  /** 推送并启动工作流 */
  @Post('/push')
  async pushWorkflow(@Body() body: { workflow: WorkflowDefinition }) {
    const { workflow } = body;

    if (!workflow || !workflow.id || !workflow.steps) {
      return { success: false, message: '无效的工作流定义' };
    }

    // 记录工作流
    WorkflowController.workflows.set(workflow.id, {
      status: 'pending',
      startTime: Date.now(),
    });

    await this.historyStore.append({
      timestamp: Date.now(),
      type: 'workflow',
      workflowId: workflow.id,
      content: `工作流 "${workflow.name}" 已推送`,
    });

    return {
      success: true,
      data: {
        workflowId: workflow.id,
        message: '工作流已接收，请通过 WebSocket 连接获取执行进度',
      },
    };
  }

  /** 查询工作流状态 */
  @Get('/:id/status')
  async getStatus(@Param('id') id: string) {
    const workflow = WorkflowController.workflows.get(id);
    if (!workflow) {
      return { success: false, message: '工作流不存在' };
    }

    return {
      success: true,
      data: {
        workflowId: id,
        status: workflow.status,
        duration: Date.now() - workflow.startTime,
      },
    };
  }

  /** 取消工作流 */
  @Post('/:id/cancel')
  async cancelWorkflow(@Param('id') id: string) {
    const workflow = WorkflowController.workflows.get(id);
    if (!workflow) {
      return { success: false, message: '工作流不存在' };
    }

    if (workflow.runner) {
      workflow.runner.cancel();
    }
    workflow.status = 'cancelled';

    return { success: true, data: { workflowId: id, status: 'cancelled' } };
  }

  /** 更新工作流状态（内部使用） */
  static updateStatus(workflowId: string, status: string, runner?: WorkflowRunner) {
    const entry = WorkflowController.workflows.get(workflowId);
    if (entry) {
      entry.status = status;
      if (runner) entry.runner = runner;
    }
  }
}
