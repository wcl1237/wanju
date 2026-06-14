import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('tickets')
export class TicketEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  title: string;

  @Column('text')
  description: string;

  @Column('text', { default: 'medium' })
  priority: string;

  @Column('text', { default: 'question' })
  category: string;

  @Column('text', { default: 'open' })
  status: string;

  @Column('text', { name: 'ticket_no', default: '' })
  ticketNo: string;

  @Column('text', { name: 'conversation_id', nullable: true })
  conversationId: string | null;

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
