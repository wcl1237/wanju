export interface ToolCallState {
  id: string;
  name: string;
  phase: 'start' | 'running' | 'result';
  arguments?: string;
  result?: any;
  isError?: boolean;
}

export interface StreamEvent {
  type: 'lifecycle' | 'text' | 'tool' | 'error';
  runId: string;
  timestamp: number;
  phase?: 'start' | 'running' | 'result' | 'end';
  delta?: string;
  text?: string;
  toolCall?: ToolCallState;
  error?: string;
}

/**
 * Standardizes OpenClaw heterogeneous events into a single schema.
 * Decouples the low-level transport protocol from the UI rendering layer.
 */
export const normalizeWSEvent = (msg: any): StreamEvent | null => {
  if (!msg) return null;

  // 1. Handle streaming chat events (state: "delta" | "final")
  if (msg.type === 'event' && msg.event === 'chat') {
    const payload = msg.payload;
    if (!payload) return null;

    const runId = payload.runId;
    const state = payload.state; // 'delta' or 'final'
    
    let text = '';
    if (payload.message?.content?.[0]?.text) {
      text = payload.message.content[0].text;
    } else if (payload.deltaText) {
      text = payload.deltaText;
    }

    if (state === 'delta') {
      return {
        type: 'text',
        runId,
        timestamp: payload.message?.timestamp || Date.now(),
        delta: payload.deltaText || '',
        text: text
      };
    } else if (state === 'final') {
      return {
        type: 'lifecycle',
        phase: 'end',
        runId,
        timestamp: payload.message?.timestamp || Date.now(),
        text: text
      };
    }
  }

  // 2. Handle agent events (stream: "lifecycle" | "assistant" | "tool" | "error")
  if (msg.type === 'event' && msg.event === 'agent') {
    const payload = msg.payload;
    if (!payload) return null;

    const runId = payload.runId;
    const stream = payload.stream; // 'lifecycle' | 'assistant' | 'tool' | 'error'
    const timestamp = payload.ts || Date.now();

    if (stream === 'lifecycle') {
      const phase = payload.data?.phase; // 'start' | 'end'
      if (phase === 'start') {
        return {
          type: 'lifecycle',
          phase: 'start',
          runId,
          timestamp
        };
      } else if (phase === 'end') {
        return {
          type: 'lifecycle',
          phase: 'end',
          runId,
          timestamp,
          error: payload.data?.error
        };
      }
    }

    if (stream === 'assistant') {
      return {
        type: 'text',
        runId,
        timestamp,
        delta: payload.data?.delta || '',
        text: payload.data?.text || ''
      };
    }

    if (stream === 'tool') {
      return {
        type: 'tool',
        runId,
        timestamp,
        toolCall: {
          id: payload.data?.toolCallId || '',
          name: payload.data?.name || '',
          phase: payload.data?.phase || 'running', // 'start' | 'running' | 'result'
          arguments: typeof payload.data?.arguments === 'string' 
            ? payload.data.arguments 
            : JSON.stringify(payload.data?.arguments),
          result: payload.data?.result,
          isError: payload.data?.isError
        }
      };
    }

    if (stream === 'error') {
      return {
        type: 'error',
        runId,
        timestamp,
        error: payload.data?.error || 'Unknown agent error'
      };
    }
  }

  return null;
};
