import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

export const config = {
  // Server
  port: optionalInt('PORT', 3001),
  host: optional('HOST', '0.0.0.0'),
  nodeEnv: optional('NODE_ENV', 'development'),

  // OpenAI
  openaiApiKey: required('OPENAI_API_KEY'),

  // Twilio
  twilioAccountSid: required('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: required('TWILIO_AUTH_TOKEN'),
  twilioPhoneNumber: required('TWILIO_PHONE_NUMBER'),
  twilioWebhookBaseUrl: required('TWILIO_WEBHOOK_BASE_URL'),

  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  // Feature Flags
  callMode: optional('CALL_MODE', 'realtime') as 'realtime' | 'elevenlabs',
  defaultSourceLanguage: optional('DEFAULT_SOURCE_LANGUAGE', 'en'),
  defaultTargetLanguage: optional('DEFAULT_TARGET_LANGUAGE', 'ko'),

  // Guardrail
  guardrailEnabled: optional('GUARDRAIL_ENABLED', 'true') === 'true',
  guardrailFallbackModel: optional('GUARDRAIL_FALLBACK_MODEL', 'gpt-4o-mini'),
  guardrailFallbackTimeoutMs: optionalInt('GUARDRAIL_FALLBACK_TIMEOUT_MS', 2000),

  // Call Limits
  maxCallDurationMs: optionalInt('MAX_CALL_DURATION_MS', 600_000),
  callWarningAtMs: optionalInt('CALL_WARNING_AT_MS', 480_000),
  callIdleTimeoutMs: optionalInt('CALL_IDLE_TIMEOUT_MS', 30_000),
} as const;

export type Config = typeof config;
