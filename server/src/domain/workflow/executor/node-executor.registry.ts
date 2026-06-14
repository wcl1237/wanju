/**
 * 节点执行器注册中心 — 插件式管理所有节点类型的执行器
 *
 * 使用方式:
 *   1. 创建 Registry 实例
 *   2. register() 注册所有执行器
 *   3. get(type) 获取对应执行器
 *
 * 支持运行时动态注册，便于后续扩展自定义节点类型。
 */

import { INodeExecutor } from './node-executor.interface';

export class NodeExecutorRegistry {
  private executors = new Map<string, INodeExecutor>();

  /**
   * 注册一个节点执行器
   * @throws 如果同类型执行器已注册
   */
  register(executor: INodeExecutor): void {
    if (this.executors.has(executor.type)) {
      console.warn(`[NodeExecutorRegistry] 覆盖已注册的执行器: ${executor.type}`);
    }
    this.executors.set(executor.type, executor);
    console.log(`[NodeExecutorRegistry] ✅ 注册执行器: ${executor.type}`);
  }

  /**
   * 批量注册执行器
   */
  registerAll(executors: INodeExecutor[]): void {
    for (const executor of executors) {
      this.register(executor);
    }
  }

  /**
   * 获取指定类型的执行器
   * @returns 执行器实例，未找到则返回 undefined
   */
  get(type: string): INodeExecutor | undefined {
    return this.executors.get(type);
  }

  /**
   * 检查是否已注册某类型
   */
  has(type: string): boolean {
    return this.executors.has(type);
  }

  /**
   * 获取所有已注册的类型列表
   */
  getRegisteredTypes(): string[] {
    return [...this.executors.keys()];
  }
}
