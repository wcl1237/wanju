import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('code_agent_sessions')
export class CodeAgentSessionEntity {
  @PrimaryColumn('text')
  id: string; // 会话 ID (UUID)

  @Column('text', { name: 'user_id' })
  userId: string; // 用户 ID

  @Column('text', { name: 'container_id', nullable: true })
  containerId: string; // Docker 容器 ID

  @Column('text', { name: 'container_name', nullable: true })
  containerName: string; // 容器名称

  @Column('integer', { name: 'host_port', nullable: true })
  hostPort: number; // 映射在宿主机的随机端口

  @Column('text', { name: 'node_ip', nullable: true })
  nodeIp: string; // 宿主机 IP

  @Column('text')
  status: 'starting' | 'running' | 'stopped' | 'failed';

  @Column('integer', { name: 'created_at' })
  createdAt: number; // 毫秒时间戳

  @Column('integer', { name: 'last_active_at' })
  lastActiveAt: number; // 毫秒时间戳
}
