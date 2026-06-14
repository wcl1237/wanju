import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ConversationEntity } from './conversation.entity';

@Entity('messages')
export class MessageEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'conversation_id' })
  conversationId: string;

  @Column('text')
  role: string;

  @Column('text', { default: '' })
  content: string;

  @Column('text', { name: 'tool_calls', nullable: true })
  toolCalls: string | null;

  @Column('text', { name: 'tool_call_id', nullable: true })
  toolCallId: string | null;

  @Column('text', { name: 'trace_steps', nullable: true })
  traceSteps: string | null; // JSON array of trace steps

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @ManyToOne(() => ConversationEntity, c => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ConversationEntity;
}
