export interface CustomerProfile {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  requirement?: string;
  status: 'partial' | 'complete';
}
