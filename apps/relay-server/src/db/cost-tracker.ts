/**
 * Cost token tracker for OpenAI Realtime API usage.
 * Tracks input/output tokens per session and guardrail usage.
 */
export interface CostTokens {
  session_a_input: number;
  session_a_output: number;
  session_b_input: number;
  session_b_output: number;
  guardrail_tokens: number;
}

export class CostTracker {
  private tokens: CostTokens = {
    session_a_input: 0,
    session_a_output: 0,
    session_b_input: 0,
    session_b_output: 0,
    guardrail_tokens: 0,
  };

  addSessionAInput(count: number) {
    this.tokens.session_a_input += count;
  }

  addSessionAOutput(count: number) {
    this.tokens.session_a_output += count;
  }

  addSessionBInput(count: number) {
    this.tokens.session_b_input += count;
  }

  addSessionBOutput(count: number) {
    this.tokens.session_b_output += count;
  }

  addGuardrailTokens(count: number) {
    this.tokens.guardrail_tokens += count;
  }

  /**
   * Update token counts from an OpenAI response.done event.
   */
  trackResponseDone(session: 'A' | 'B', usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number }) {
    if (!usage) return;

    if (session === 'A') {
      this.tokens.session_a_input += usage.input_tokens ?? 0;
      this.tokens.session_a_output += usage.output_tokens ?? 0;
    } else {
      this.tokens.session_b_input += usage.input_tokens ?? 0;
      this.tokens.session_b_output += usage.output_tokens ?? 0;
    }
  }

  getTokens(): CostTokens {
    return { ...this.tokens };
  }

  get totalTokens(): number {
    return (
      this.tokens.session_a_input +
      this.tokens.session_a_output +
      this.tokens.session_b_input +
      this.tokens.session_b_output +
      this.tokens.guardrail_tokens
    );
  }
}
