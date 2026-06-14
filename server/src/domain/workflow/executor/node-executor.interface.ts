/**
 * 节点执行器接口 — Strategy 模式
 *
 * 每种节点类型对应一个 Executor 实现，通过 Registry 注册和查找。
 * GraphEngineService 不再需要 switch-case，而是委托给对应的 Executor。
 */

import { FlowNode, ExecContext } from '../model/workflow.model';
import { Action, ActionContext } from '../../ai/action/action.interface';
import { ILLMClient } from '../../ai/port/llm.port';
import { AgentService } from '../../agent/service/agent.service';

/**
 * 执行器依赖 — 每个 Executor 可能需要的外部依赖
 */
export interface ExecutorDeps {
  /** LLM 客户端 */
  llmClient: ILLMClient;
  /** Agent 服务 */
  agentService: AgentService;
  /** 全局 Action 注册表 */
  actions: Map<string, Action>;
  /** Action 上下文 */
  actionContext: ActionContext;
  /** 已访问节点数（用于 stepIndex） */
  visitedCount: number;
}

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
  /** 节点的业务输出（存入 execCtx.results） */
  output?: any;
  /** 条件分支结果（仅 condition 节点使用） */
  conditionResult?: boolean | null;
  /** 是否已向 SSE 流发送了 content 事件 */
  contentYielded?: boolean;
}

/**
 * 节点执行器接口
 *
 * 每种节点类型实现此接口，封装该节点的执行逻辑。
 */
export interface INodeExecutor {
  /** 节点类型标识（与 FlowNode.type 对应） */
  readonly type: string;

  /**
   * 执行节点
   *
   * @param node 当前节点
   * @param ctx 执行上下文（可变，executor 可以写入 params/results/lastOutput）
   * @param deps 外部依赖
   * @returns 异步生成器，yield SSE 事件字符串
   */
  execute(
    node: FlowNode,
    ctx: ExecContext,
    deps: ExecutorDeps,
  ): AsyncGenerator<string, NodeExecutionResult>;
}
