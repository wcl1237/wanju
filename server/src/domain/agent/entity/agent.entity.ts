import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('agents')
export class AgentEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { default: '' })
  description: string;

  @Column('text', { default: '' })
  prompt: string; // System Prompt

  @Column('text', { default: '' })
  actions: string; // 逗号分隔的可用 action 名称

  @Column('text', { name: 'skill_ids', default: '' })
  skillIds: string; // 逗号分隔的可触发技能 ID

  @Column('text', { name: 'workflow_ids', default: '' })
  workflowIds: string; // 逗号分隔的可触发工作流 ID

  @Column('text', { default: '🧑‍💼' })
  icon: string;

  @Column('integer', { default: 1 })
  enabled: number; // 1=启用, 0=禁用

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
