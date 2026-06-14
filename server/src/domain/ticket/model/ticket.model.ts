/**
 * Ticket 工单域 — 类型定义
 */

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketCategory = 'bug' | 'feature' | 'question' | 'complaint';

export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
  status: TicketStatus;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketDTO {
  title: string;
  description: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  conversationId?: string;
}
