import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TicketEntity } from '../entity/ticket.entity';
import { Ticket, CreateTicketDTO, TicketStatus } from '../interface';

@Provide()
@Scope(ScopeEnum.Singleton)
export class TicketService {
  @InjectEntityModel(TicketEntity)
  ticketRepo: Repository<TicketEntity>;

  async createTicket(dto: CreateTicketDTO): Promise<Ticket> {
    const id = uuidv4();
    const now = new Date();
    const nowStr = now.toISOString();

    // 生成可读工单编号: TK + 日期 + 4位随机数
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    const ticketNo = `TK${dateStr}${rand}`;

    const entity = this.ticketRepo.create({
      id,
      ticketNo,
      title: dto.title,
      description: dto.description,
      priority: dto.priority || 'medium',
      category: dto.category || 'question',
      status: 'open',
      conversationId: dto.conversationId || null,
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    await this.ticketRepo.save(entity);
    return this.toTicket(entity);
  }

  async getTickets(status?: TicketStatus): Promise<Ticket[]> {
    const where = status ? { status } : {};
    const rows = await this.ticketRepo.find({ where, order: { createdAt: 'DESC' } });
    return rows.map(r => this.toTicket(r));
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const row = await this.ticketRepo.findOneBy({ id });
    return row ? this.toTicket(row) : undefined;
  }

  async updateTicketStatus(id: string, status: TicketStatus): Promise<Ticket | undefined> {
    const now = new Date().toISOString();
    await this.ticketRepo.update(id, { status, updatedAt: now });
    return this.getTicket(id);
  }

  private toTicket(e: TicketEntity): Ticket {
    return {
      id: e.id,
      ticketNo: e.ticketNo || '',
      title: e.title,
      description: e.description,
      priority: e.priority as any,
      category: e.category as any,
      status: e.status as any,
      conversationId: e.conversationId || undefined,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
