import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { KnowledgeDocEntity } from './knowledge-doc.entity';

@Entity('knowledge_chunks')
export class KnowledgeChunkEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'doc_id' })
  docId: string;

  @Column('text')
  content: string;

  @Column('text', { nullable: true })
  embedding: string | null;

  @Column('text', { nullable: true })
  keywords: string | null;

  @ManyToOne(() => KnowledgeDocEntity, d => d.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doc_id' })
  doc: KnowledgeDocEntity;
}
