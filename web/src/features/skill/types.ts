export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  prompt: string;
  parameters: SkillParameter[];
  outputTemplate: string;
  icon: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillDTO {
  name: string;
  description: string;
  tags?: string[];
  prompt: string;
  parameters?: SkillParameter[];
  outputTemplate?: string;
  icon?: string;
}

export interface UpdateSkillDTO {
  name?: string;
  description?: string;
  tags?: string[];
  prompt?: string;
  parameters?: SkillParameter[];
  outputTemplate?: string;
  icon?: string;
  enabled?: boolean;
}
