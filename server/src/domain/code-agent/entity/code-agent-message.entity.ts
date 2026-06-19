import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('code_agent_messages')
export class CodeAgentMessageEntity {
  @PrimaryColumn('text')
  id: string; // 消息 ID

  @Column('text', { name: 'session_id' })
  sessionId: string; // 所属会话 ID

  @Column('text')
  role: string; // 'user' | 'assistant' | 'system'

  @Column('text', { default: '' })
  content: string; // 消息内容

  @Column('text', { name: 'tool_calls', nullable: true })
  toolCalls: string | null; // JSON 序列化的 ToolCallInfo[]

  @Column('text', { nullable: true })
  decision: string | null; // JSON 序列化的 DecisionInfo

  @Column('integer', { name: 'created_at' })
  createdAt: number; // 毫秒时间戳
}
