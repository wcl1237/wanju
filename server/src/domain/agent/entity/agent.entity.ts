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

  @Column('text', { default: '🧑‍💼' })
  icon: string;

  @Column('integer', { default: 1 })
  enabled: number; // 1=启用, 0=禁用

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
