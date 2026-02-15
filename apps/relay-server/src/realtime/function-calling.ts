import type { Language } from '../types.js';

/**
 * Function Calling tools for OpenAI Realtime API Session A (Agent Mode).
 * Enables the AI agent to perform actions during calls.
 */

export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Get available tools for Agent Mode calls.
 */
export function getAgentTools(language: Language): ToolDefinition[] {
  return [
    {
      type: 'function',
      name: 'confirm_reservation',
      description: language === 'ko'
        ? '예약 정보를 확인합니다 (날짜, 시간, 인원, 이름)'
        : 'Confirm a reservation (date, time, party size, name)',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
          time: { type: 'string', description: 'Reservation time (HH:MM)' },
          party_size: { type: 'number', description: 'Number of guests' },
          name: { type: 'string', description: 'Name for the reservation' },
          confirmed: { type: 'boolean', description: 'Whether the recipient confirmed' },
        },
        required: ['confirmed'],
      },
    },
    {
      type: 'function',
      name: 'search_location',
      description: language === 'ko'
        ? '장소나 주소를 검색합니다'
        : 'Search for a place or address',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for the location' },
          address: { type: 'string', description: 'Address if mentioned' },
        },
        required: ['query'],
      },
    },
    {
      type: 'function',
      name: 'record_call_result',
      description: language === 'ko'
        ? '통화 결과를 기록합니다 (성공/실패/재시도 필요)'
        : 'Record the call outcome (success/failed/needs_retry)',
      parameters: {
        type: 'object',
        properties: {
          outcome: {
            type: 'string',
            enum: ['success', 'failed', 'needs_retry', 'partial'],
            description: 'Call outcome',
          },
          summary: { type: 'string', description: 'Brief summary of the call result' },
          next_action: { type: 'string', description: 'Suggested next action if any' },
        },
        required: ['outcome', 'summary'],
      },
    },
  ];
}

/**
 * Handle function call results from the AI agent.
 * Returns the result to inject back into the conversation.
 */
export function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): { result: string; shouldEndCall: boolean } {
  switch (name) {
    case 'confirm_reservation': {
      const confirmed = args.confirmed as boolean;
      return {
        result: confirmed
          ? `Reservation confirmed: ${args.date} ${args.time}, ${args.party_size} guests, name: ${args.name}`
          : 'Reservation was not confirmed by the recipient.',
        shouldEndCall: false,
      };
    }

    case 'search_location': {
      return {
        result: `Location search noted: "${args.query}"${args.address ? `, address: ${args.address}` : ''}. Continue the conversation.`,
        shouldEndCall: false,
      };
    }

    case 'record_call_result': {
      const outcome = args.outcome as string;
      return {
        result: `Call result recorded: ${outcome} - ${args.summary}`,
        shouldEndCall: outcome === 'success' || outcome === 'failed',
      };
    }

    default:
      return { result: `Unknown function: ${name}`, shouldEndCall: false };
  }
}
