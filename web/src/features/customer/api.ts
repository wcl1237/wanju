import { authFetch, apiUrl } from '../../shared/http-client';
import type { CustomerProfile } from './types';

export async function getByConversation(conversationId: string): Promise<CustomerProfile | null> {
  const res = await authFetch(apiUrl(`/customers/by-conversation?conversationId=${conversationId}`));
  const data = await res.json();
  return data.success && data.data ? data.data : null;
}
