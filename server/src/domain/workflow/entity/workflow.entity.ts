import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('workflows')
export class WorkflowEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { default: '' })
  description: string;

  @Column('text', { default: '🔄' })
  icon: string;

  @Column('text', { name: 'trigger_description' })
  triggerDescription: string;

  /** 图结构 JSON: { nodes: FlowNode[], edges: FlowEdge[] } */
  @Column('text', { default: '{"nodes":[],"edges":[]}' })
  graph: string;

  @Column('integer', { default: 1 })
  enabled: number;

  /** 工作流模式: independent=独立工作流(结果即最终返回), replace_input=替代输入(结果替代用户消息继续ReAct) */
  @Column('text', { default: 'independent' })
  mode: string;

  @Column('integer', { default: 0 })
  priority: number;

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
