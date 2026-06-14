import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('blueprint')
export class BlueprintEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 10, default: '🤖' })
  icon: string;

  @Column({ type: 'varchar', length: 20 })
  runtimeType: string;

  /** JSON 序列化的 RuntimeConfig */
  @Column({ type: 'text' })
  config: string;

  @Column({ type: 'integer', default: 1 })
  enabled: number;

  @Column({ type: 'integer', default: 0 })
  isDefault: number;

  @Column({ type: 'varchar', length: 30 })
  createdAt: string;

  @Column({ type: 'varchar', length: 30 })
  updatedAt: string;
}
