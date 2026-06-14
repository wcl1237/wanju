import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * 长期记忆 Entity
 * 存储用户画像、偏好、业务上下文等向量化记忆
 */
@Entity('memories')
export class MemoryEntity {
  @PrimaryColumn('text')
  id: string;

  @Index()
  @Column('text', { name: 'user_id' })
  userId: string;

  @Column('text', { name: 'conversation_id', nullable: true })
  conversationId: string | null;

  /** profile=用户画像, preference=偏好, business=业务信息, context=上下文摘要 */
  @Column('text', { default: 'context' })
  type: string;

  /** 记忆内容 (自然语言) */
  @Column('text')
  content: string;

  /** 向量 (JSON 数组) */
  @Column('text', { nullable: true })
  embedding: string | null;

  /** 扩展元数据 (JSON) */
  @Column('text', { nullable: true })
  metadata: string | null;

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
