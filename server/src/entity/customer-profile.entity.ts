import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('customer_profiles')
export class CustomerProfileEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'conversation_id', nullable: true })
  conversationId: string | null;

  @Column('text', { nullable: true })
  name: string | null;

  @Column('text', { nullable: true })
  phone: string | null;

  @Column('text', { nullable: true })
  email: string | null;

  @Column('text', { nullable: true })
  company: string | null;

  @Column('text', { nullable: true })
  position: string | null;

  @Column('text', { nullable: true })
  requirement: string | null;

  @Column('text', { nullable: true })
  extra: string | null;

  @Column('text', { default: 'partial' })
  status: string;

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @Column('text', { name: 'updated_at' })
  updatedAt: string;
}
