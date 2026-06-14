export interface Agent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  actions: string[];
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentDTO {
  name: string;
  description?: string;
  prompt?: string;
  actions?: string[];
  icon?: string;
}

export interface UpdateAgentDTO {
  name?: string;
  description?: string;
  prompt?: string;
  actions?: string[];
  icon?: string;
  enabled?: boolean;
}
