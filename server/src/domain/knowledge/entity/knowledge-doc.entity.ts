import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { KnowledgeChunkEntity } from './knowledge-chunk.entity';

@Entity('knowledge_docs')
export class KnowledgeDocEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  content: string;

  @Column('integer', { name: 'chunk_count', default: 0 })
  chunkCount: number;

  @Column('text', { name: 'created_at' })
  createdAt: string;

  @OneToMany(() => KnowledgeChunkEntity, c => c.doc)
  chunks: KnowledgeChunkEntity[];
}
