import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { MessageEntity } from './message.entity';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { default: '新对话' })
  title: string;

  @Column('text', { name: 'blueprint_id', default: '' })
  blueprintId: string;

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;

  @OneToMany(() => MessageEntity, m => m.conversation)
  messages: MessageEntity[];
}
