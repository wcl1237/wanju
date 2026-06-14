/**
 * 工作流应用服务 — 编排工作流相关的跨域用例
 *
 * 位于 Controller 和 Domain Service 之间，负责：
 * - 编排跨域操作
 * - 输入验证
 * - 事务管理
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { WorkflowService } from '../domain/workflow/service/workflow.service';
import {
  Workflow, CreateWorkflowDTO, UpdateWorkflowDTO,
} from '../domain/workflow/model/workflow.model';

@Provide()
@Scope(ScopeEnum.Singleton)
export class WorkflowAppService {
  @Inject()
  workflowService: WorkflowService;

  async create(dto: CreateWorkflowDTO): Promise<Workflow> {
    // 业务验证
    if (!dto.name?.trim()) {
      throw new Error('工作流名称不能为空');
    }
    return this.workflowService.create(dto);
  }

  async update(id: string, dto: UpdateWorkflowDTO): Promise<Workflow | undefined> {
    return this.workflowService.update(id, dto);
  }

  async delete(id: string): Promise<boolean> {
    return this.workflowService.delete(id);
  }

  async getAll(): Promise<Workflow[]> {
    return this.workflowService.getAll();
  }

  async getById(id: string): Promise<Workflow | undefined> {
    return this.workflowService.getById(id);
  }
}
