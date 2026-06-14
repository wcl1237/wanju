import { Provide, Inject, Controller, Get, Post, Put, Del, Body, Param } from '@midwayjs/core';
import { WorkflowService, CreateWorkflowDTO, UpdateWorkflowDTO } from '../service/workflow.service';

@Provide()
@Controller('/api/workflows')
export class WorkflowController {
  @Inject()
  workflowService: WorkflowService;

  @Get('/')
  async list() {
    const data = await this.workflowService.getAll();
    return { success: true, data };
  }

  @Get('/:id')
  async getOne(@Param('id') id: string) {
    const data = await this.workflowService.getById(id);
    if (!data) return { success: false, message: '工作流不存在' };
    return { success: true, data };
  }

  @Post('/')
  async create(@Body() body: CreateWorkflowDTO) {
    const data = await this.workflowService.create(body);
    return { success: true, data };
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: UpdateWorkflowDTO) {
    const data = await this.workflowService.update(id, body);
    if (!data) return { success: false, message: '工作流不存在' };
    return { success: true, data };
  }

  @Del('/:id')
  async delete(@Param('id') id: string) {
    const ok = await this.workflowService.delete(id);
    return { success: ok, message: ok ? '删除成功' : '工作流不存在' };
  }
}
