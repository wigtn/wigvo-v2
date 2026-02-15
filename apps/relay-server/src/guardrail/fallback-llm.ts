import { config } from '../config.js';
import type { Language } from '../types.js';

interface CorrectionResult {
  corrected: string;
  explanation: string;
  latencyMs: number;
}

/**
 * Use GPT-4o-mini to correct/rephrase inappropriate or informal translations.
 * This is the Level 3 guardrail fallback — used when rule-based filter fails.
 */
export async function correctWithFallbackLLM(
  originalText: string,
  targetLanguage: Language,
  issue: string,
): Promise<CorrectionResult | null> {
  const startTime = Date.now();

  const systemPrompt = targetLanguage === 'ko'
    ? `당신은 한국어 교정 전문가입니다. 주어진 텍스트를 공손하고 격식 있는 해요체로 교정하세요.
       문제: ${issue}
       규칙:
       - 반말 → 해요체로 변환
       - 욕설/비속어 → 정중한 표현으로 대체
       - 원래 의미를 최대한 유지
       - 교정된 텍스트만 출력`
    : `You are an English language editor. Rephrase the given text in a professional, polite tone.
       Issue: ${issue}
       Rules:
       - Convert informal/slang to professional language
       - Remove any inappropriate content
       - Preserve original meaning
       - Output only the corrected text`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.guardrailFallbackTimeoutMs,
    );

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.guardrailFallbackModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalText },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[FallbackLLM] API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const corrected = data.choices[0]?.message?.content?.trim();
    if (!corrected) return null;

    return {
      corrected,
      explanation: issue,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[FallbackLLM] Timeout after ${config.guardrailFallbackTimeoutMs}ms`);
    } else {
      console.error('[FallbackLLM] Error:', err);
    }
    return null;
  }
}
