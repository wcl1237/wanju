import { Controller, Get, Post, Patch, Inject, Param, Body, Query } from '@midwayjs/core';
import { TicketService } from '../service/ticket.service';
import { CreateTicketDTO, TicketStatus } from '../interface';

@Controller('/api/tickets')
export class TicketController {
  @Inject()
  ticketService: TicketService;

  @Get('/')
  async getTickets(@Query('status') status?: TicketStatus) {
    const tickets = await this.ticketService.getTickets(status);
    return { success: true, data: tickets };
  }

  @Post('/')
  async createTicket(@Body() body: CreateTicketDTO) {
    const ticket = await this.ticketService.createTicket(body);
    return { success: true, data: ticket };
  }

  @Get('/:id')
  async getTicket(@Param('id') id: string) {
    const ticket = await this.ticketService.getTicket(id);
    if (!ticket) return { success: false, message: '工单不存在' };
    return { success: true, data: ticket };
  }

  @Patch('/:id')
  async updateTicket(@Param('id') id: string, @Body() body: { status: TicketStatus }) {
    const ticket = await this.ticketService.updateTicketStatus(id, body.status);
    if (!ticket) return { success: false, message: '工单不存在' };
    return { success: true, data: ticket };
  }
}
