import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('skills')
export class SkillEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { default: '' })
  description: string;

  @Column('text', { default: '' })
  tags: string; // 逗号分隔的标签

  @Column('text', { default: '' })
  prompt: string; // Prompt 模板，支持 {{param}} 占位符

  @Column('text', { default: '[]' })
  parameters: string; // JSON 字符串存储 SkillParameter[]

  @Column('text', { name: 'output_template', default: '' })
  outputTemplate: string;

  @Column('text', { default: '⚡' })
  icon: string;

  @Column('integer', { default: 1 })
  enabled: number; // 1=启用, 0=禁用

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
