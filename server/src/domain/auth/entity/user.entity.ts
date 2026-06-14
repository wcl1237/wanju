import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { unique: true })
  username: string;

  @Column('text')
  password: string;

  @Column('text', { name: 'created_at' })
  createdAt: string;
}
