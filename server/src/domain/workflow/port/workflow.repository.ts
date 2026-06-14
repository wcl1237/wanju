/**
 * 工作流仓储接口 — 领域层定义
 *
 * Domain Service 依赖此接口，具体实现在 infrastructure 层。
 */

import { Workflow, CreateWorkflowDTO, UpdateWorkflowDTO } from '../model/workflow.model';

export interface IWorkflowRepository {
  /** 创建工作流 */
  create(dto: CreateWorkflowDTO): Promise<Workflow>;

  /** 更新工作流 */
  update(id: string, dto: UpdateWorkflowDTO): Promise<Workflow | undefined>;

  /** 删除工作流 */
  delete(id: string): Promise<boolean>;

  /** 获取所有工作流 */
  findAll(): Promise<Workflow[]>;

  /** 根据 ID 获取 */
  findById(id: string): Promise<Workflow | undefined>;

  /** 获取所有已启用的工作流（按优先级排序） */
  findAllEnabled(): Promise<Workflow[]>;
}
