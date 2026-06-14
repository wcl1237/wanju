import { Controller, Get, Post, Put, Del, Inject, Param, Body } from '@midwayjs/core';
import { WorkflowAppService } from '../../application/workflow.app-service';
import { CreateWorkflowDTO, UpdateWorkflowDTO } from '../../domain/workflow/model/workflow.model';

@Controller('/api/workflows')
export class WorkflowController {
  @Inject()
  workflowAppService: WorkflowAppService;

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
