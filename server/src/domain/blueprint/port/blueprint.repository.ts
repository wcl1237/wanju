import { AgentBlueprint, CreateBlueprintDTO, UpdateBlueprintDTO } from '../model/blueprint.model';

export interface IBlueprintRepository {
  findAll(): Promise<AgentBlueprint[]>;
  findById(id: string): Promise<AgentBlueprint | undefined>;
  findDefault(): Promise<AgentBlueprint | undefined>;
  findEnabled(): Promise<AgentBlueprint[]>;
  create(dto: CreateBlueprintDTO): Promise<AgentBlueprint>;
  update(id: string, dto: UpdateBlueprintDTO): Promise<AgentBlueprint | undefined>;
  delete(id: string): Promise<boolean>;
  clearDefault(): Promise<void>;
}
