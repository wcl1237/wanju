export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  triggerDescription: string;
  graph: { nodes: any[]; edges: any[] };
  enabled: boolean;
  priority: number;
  mode?: 'independent' | 'replace_input';
  createdAt: string;
}

export interface CreateWorkflowDTO {
  name: string;
  triggerDescription?: string;
  graph: { nodes: any[]; edges: any[] };
  mode?: string;
}

export interface UpdateWorkflowDTO {
  name?: string;
  triggerDescription?: string;
  graph?: { nodes: any[]; edges: any[] };
  enabled?: boolean;
  mode?: string;
}
