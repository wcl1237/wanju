import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('openclaw_sessions')
export class OpenClawSessionEntity {
  @PrimaryColumn('text')
  id: string; // 会话 ID (UUID)

  @Column('text')
  userId: string; // 用户 ID

  @Column('text', { name: 'container_id', nullable: true })
  containerId: string; // Docker 容器 ID

  @Column('text', { name: 'container_name', nullable: true })
  containerName: string; // 容器名称

  @Column('integer', { name: 'host_port', nullable: true })
  hostPort: number; // 映射在宿主机的随机端口

  @Column('text', { name: 'node_ip', nullable: true })
  nodeIp: string; // 当前容器跑在哪个 Docker 物理宿主机节点 IP 上

  @Column('text')
  status: 'starting' | 'running' | 'stopped' | 'failed'; // 状态: starting, running, stopped, failed

  @Column('integer', { name: 'created_at' })
  createdAt: number; // 创建时间毫秒时间戳

  @Column('integer', { name: 'last_active_at' })
  lastActiveAt: number; // 最后活跃时间毫秒时间戳
}
