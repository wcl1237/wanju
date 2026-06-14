export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'bug' | 'feature' | 'question' | 'complaint';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  status: TicketStatus;
  ticketNo?: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketDTO {
  title: string;
  description?: string;
  priority?: string;
  category?: string;
}
