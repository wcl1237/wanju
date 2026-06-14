import { authFetch, apiUrl } from '../../shared/http-client';
import type { Ticket, TicketStatus, CreateTicketDTO } from './types';

export async function getTickets(status?: TicketStatus): Promise<Ticket[]> {
  const url = status ? apiUrl(`/tickets?status=${status}`) : apiUrl('/tickets');
  const res = await authFetch(url);
  if (!res.ok) throw new Error('获取工单列表失败');
  const data = await res.json();
  return data.data || data.tickets || [];
}

export async function createTicket(dto: CreateTicketDTO): Promise<Ticket> {
  const res = await authFetch(apiUrl('/tickets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error('创建工单失败');
  const data = await res.json();
  return data.data;
}

export async function updateTicketStatus(id: string, status: TicketStatus): Promise<Ticket> {
  const res = await authFetch(apiUrl(`/tickets/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('更新工单状态失败');
  const data = await res.json();
  return data.data;
}
