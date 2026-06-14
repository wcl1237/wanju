/**
 * 节点执行器 — 统一导出
 */
export { INodeExecutor, ExecutorDeps, NodeExecutionResult } from './node-executor.interface';
export { NodeExecutorRegistry } from './node-executor.registry';
export { TriggerExecutor } from './trigger.executor';
export { StartExecutor } from './start.executor';
export { EndExecutor } from './end.executor';
export { ExtractExecutor } from './extract.executor';
export { ConditionExecutor } from './condition.executor';
export { ReplyExecutor } from './reply.executor';
export { LlmReplyExecutor } from './llm-reply.executor';
export { KnowledgeExecutor } from './knowledge.executor';
export { TicketExecutor } from './ticket.executor';
export { HttpExecutor } from './http.executor';
export { AgentExecutor } from './agent.executor';
export { AgentTeamExecutor } from './agent-team.executor';
export { MasterSubAgentExecutor } from './master-sub-agent.executor';

import { NodeExecutorRegistry } from './node-executor.registry';
import { TriggerExecutor } from './trigger.executor';
import { StartExecutor } from './start.executor';
import { EndExecutor } from './end.executor';
import { ExtractExecutor } from './extract.executor';
import { ConditionExecutor } from './condition.executor';
import { ReplyExecutor } from './reply.executor';
import { LlmReplyExecutor } from './llm-reply.executor';
import { KnowledgeExecutor } from './knowledge.executor';
import { TicketExecutor } from './ticket.executor';
import { HttpExecutor } from './http.executor';
import { AgentExecutor } from './agent.executor';
import { AgentTeamExecutor } from './agent-team.executor';
import { MasterSubAgentExecutor } from './master-sub-agent.executor';

/**
 * 创建并注册所有内置节点执行器
 */
export function createDefaultRegistry(): NodeExecutorRegistry {
  const registry = new NodeExecutorRegistry();
  registry.registerAll([
    new TriggerExecutor(),
    new StartExecutor(),
    new EndExecutor(),
    new ExtractExecutor(),
    new ConditionExecutor(),
    new ReplyExecutor(),
    new LlmReplyExecutor(),
    new KnowledgeExecutor(),
    new TicketExecutor(),
    new HttpExecutor(),
    new AgentExecutor(),
    new AgentTeamExecutor(),
    new MasterSubAgentExecutor(),
  ]);
  return registry;
}
