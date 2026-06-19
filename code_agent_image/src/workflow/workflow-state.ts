/**
 * WorkflowState — 工作流状态机
 *
 * 管理工作流的执行状态、变量、步骤结果。
 */
import {
  WorkflowDefinition,
  WorkflowExecutionState,
  WorkflowStatus,
  WorkflowStep,
  StepResult,
  DecisionRecord,
} from './types';

export class WorkflowState {
  private state: WorkflowExecutionState;
  private definition: WorkflowDefinition;
  /** 步骤执行顺序（拓扑排序后的 ID 列表） */
  private executionOrder: string[];

  private constructor(definition: WorkflowDefinition) {
    this.definition = definition;
    this.executionOrder = this.computeExecutionOrder(definition.steps);
    this.state = {
      workflowId: definition.id,
      status: 'pending',
      currentStepIndex: 0,
      variables: { ...definition.variables },
      stepResults: new Map(),
      decisionLog: [],
      startTime: Date.now(),
    };
  }

  static create(definition: WorkflowDefinition): WorkflowState {
    return new WorkflowState(definition);
  }

  // ─── 状态查询 ───────────────────────────────────────────

  get status(): WorkflowStatus { return this.state.status; }
  get workflowId(): string { return this.state.workflowId; }
  get variables(): Record<string, unknown> { return this.state.variables; }
  get currentStepIndex(): number { return this.state.currentStepIndex; }

  getDefinition(): WorkflowDefinition { return this.definition; }

  /** 是否还有下一个步骤 */
  hasNextStep(): boolean {
    return this.state.currentStepIndex < this.executionOrder.length
      && this.state.status === 'running';
  }

  /** 获取下一个步骤 */
  nextStep(): WorkflowStep & { index: number } {
    const stepId = this.executionOrder[this.state.currentStepIndex];
    const step = this.definition.steps.find(s => s.id === stepId);
    if (!step) throw new Error(`步骤不存在: ${stepId}`);
    return { ...step, index: this.state.currentStepIndex };
  }

  /** 获取步骤总数 */
  getTotalSteps(): number {
    return this.executionOrder.length;
  }

  /** 获取步骤信息列表（用于通知客户端） */
  getStepInfoList(): Array<{ id: string; name: string; type: string }> {
    return this.executionOrder.map(id => {
      const step = this.definition.steps.find(s => s.id === id);
      return { id, name: step?.name || id, type: step?.type || 'unknown' };
    });
  }

  /** 获取上游步骤的结果（用于注入 Agent 上下文） */
  getPreviousResults(): Array<{ stepName: string; output: string }> {
    const results: Array<{ stepName: string; output: string }> = [];
    for (let i = 0; i < this.state.currentStepIndex; i++) {
      const stepId = this.executionOrder[i];
      const result = this.state.stepResults.get(stepId);
      const step = this.definition.steps.find(s => s.id === stepId);
      if (result && result.output) {
        results.push({
          stepName: step?.name || stepId,
          output: result.output,
        });
      }
    }
    return results;
  }

  // ─── 状态更新 ───────────────────────────────────────────

  /** 标记工作流开始 */
  start(): void {
    this.state.status = 'running';
    this.state.startTime = Date.now();
  }

  /** 完成当前步骤 */
  completeStep(stepId: string, result: Omit<StepResult, 'stepId' | 'status'>): void {
    this.state.stepResults.set(stepId, {
      stepId,
      status: 'completed',
      ...result,
    });

    // 合并步骤更新的变量
    if (result.updatedVariables) {
      Object.assign(this.state.variables, result.updatedVariables);
    }

    this.state.currentStepIndex++;
  }

  /** 跳过当前步骤 */
  skipStep(stepId: string): void {
    this.state.stepResults.set(stepId, {
      stepId,
      status: 'skipped',
      startTime: Date.now(),
      endTime: Date.now(),
    });
    this.state.currentStepIndex++;
  }

  /** 步骤失败 */
  failStep(stepId: string, error: string): void {
    this.state.stepResults.set(stepId, {
      stepId,
      status: 'failed',
      error,
      startTime: Date.now(),
      endTime: Date.now(),
    });
  }

  /** 暂停（等待决策） */
  pause(): void {
    this.state.status = 'paused';
  }

  /** 恢复执行 */
  resume(): void {
    this.state.status = 'running';
  }

  /** 完成 */
  complete(): void {
    this.state.status = 'completed';
    this.state.endTime = Date.now();
  }

  /** 失败 */
  fail(error: string): void {
    this.state.status = 'failed';
    this.state.error = error;
    this.state.endTime = Date.now();
  }

  /** 取消 */
  cancel(): void {
    this.state.status = 'cancelled';
    this.state.endTime = Date.now();
  }

  /** 记录决策 */
  recordDecision(record: DecisionRecord): void {
    this.state.decisionLog.push(record);
  }

  /** 设置变量 */
  setVariable(key: string, value: unknown): void {
    this.state.variables[key] = value;
  }

  /** 变量插值 */
  resolveVariables(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = this.state.variables[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  /** 生成执行摘要 */
  getSummary(): string {
    const totalSteps = this.executionOrder.length;
    const completed = Array.from(this.state.stepResults.values()).filter(r => r.status === 'completed').length;
    const failed = Array.from(this.state.stepResults.values()).filter(r => r.status === 'failed').length;
    const duration = (this.state.endTime || Date.now()) - this.state.startTime;

    return [
      `工作流 "${this.definition.name}" 执行${this.state.status === 'completed' ? '完成' : '结束'}`,
      `状态: ${this.state.status}`,
      `步骤: ${completed}/${totalSteps} 完成${failed > 0 ? `, ${failed} 失败` : ''}`,
      `用时: ${(duration / 1000).toFixed(1)}s`,
      `决策: ${this.state.decisionLog.length} 次`,
      this.state.error ? `错误: ${this.state.error}` : '',
    ].filter(Boolean).join('\n');
  }

  /** 导出状态（用于持久化） */
  toJSON(): Record<string, unknown> {
    return {
      ...this.state,
      stepResults: Object.fromEntries(this.state.stepResults),
    };
  }

  // ─── 私有方法 ───────────────────────────────────────────

  /** 计算步骤执行顺序（简单线性排列，按 steps 数组顺序） */
  private computeExecutionOrder(steps: WorkflowStep[]): string[] {
    // 简化处理：直接按 steps 数组顺序执行
    // 后续可扩展为 DAG 拓扑排序
    return steps.map(s => s.id);
  }
}
