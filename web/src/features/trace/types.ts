export interface TraceStep {
  tool: string;
  status: 'running' | 'done';
  args?: any;
  result?: any;
  thinking?: string;
  round?: number;
  timeMs?: number;
}
