/**
 * Agent 仓储接口 — 领域层定义
 */

import { Agent, CreateAgentDTO, UpdateAgentDTO } from '../model/agent.model';

export interface IAgentRepository {
  create(dto: CreateAgentDTO): Promise<Agent>;
  update(id: string, dto: UpdateAgentDTO): Promise<Agent | undefined>;
  delete(id: string): Promise<boolean>;
  findAll(): Promise<Agent[]>;
  findById(id: string): Promise<Agent | undefined>;
}
