from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # OpenAI
    openai_api_key: str = ""
    openai_realtime_model: str = "gpt-4o-realtime-preview"

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_key: str = ""

    # Relay Server
    relay_server_url: str = "http://localhost:8000"
    relay_server_port: int = 8000
    relay_server_host: str = "0.0.0.0"

    # Call limits (M-3: 최대 통화 시간 10분)
    max_call_duration_ms: int = 600_000
    call_warning_ms: int = 480_000  # 8분 경고

    # Feature flag (DEPRECATED: elevenlabs mode removed in v3, only "realtime" supported)
    call_mode: str = "realtime"

    # First message timeouts (C-3)
    recipient_answer_timeout_s: int = 15
    user_silence_timeout_s: int = 10

    # Phase 3: Recovery settings (PRD 5.3)
    recovery_max_attempts: int = 5
    recovery_initial_backoff_s: float = 1.0
    recovery_max_backoff_s: float = 30.0
    recovery_backoff_multiplier: float = 2.0
    recovery_timeout_s: float = 10.0  # 10초 초과 시 Degraded Mode
    heartbeat_interval_s: float = 5.0
    heartbeat_timeout_s: float = 5.0
    ring_buffer_capacity_slots: int = 1500  # 30초 / 20ms

    # Whisper fallback (Degraded Mode)
    whisper_model: str = "whisper-1"

    # Phase 4: Guardrail (PRD M-2)
    guardrail_enabled: bool = True
    guardrail_fallback_model: str = "gpt-4o-mini"
    guardrail_fallback_timeout_ms: int = 2000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
