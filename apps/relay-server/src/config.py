from pydantic import Field, field_validator
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

    # CORS
    allowed_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "https://wigvo.run",
            "https://wigvo-web-283075594688.asia-northeast3.run.app",
        ],
        description="CORS allowed origins",
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    # Call limits (M-3: 최대 통화 시간 10분)
    max_call_duration_ms: int = 600_000
    call_warning_ms: int = 480_000  # 8분 경고

    # Feature flag (DEPRECATED: elevenlabs mode removed in v3, only "realtime" supported)
    call_mode: str = "realtime"

    # First message timeouts (C-3)
    recipient_answer_timeout_s: int = 15

    # Phase 3: Recovery settings (PRD 5.3)
    recovery_max_attempts: int = 5
    recovery_initial_backoff_s: float = 1.0
    recovery_max_backoff_s: float = 30.0
    recovery_backoff_multiplier: float = 2.0
    recovery_timeout_s: float = 10.0  # 10초 초과 시 Degraded Mode
    heartbeat_interval_s: float = 5.0
    heartbeat_timeout_s: float = 45.0
    ring_buffer_capacity_slots: int = 1500  # 30초 / 20ms

    # Whisper fallback (Degraded Mode)
    whisper_model: str = "whisper-1"

    # Echo Gate (에코 피드백 루프 차단)
    echo_gate_cooldown_s: float = 3.0  # TTS 완료 후 에코 소멸 대기: TTS 잔향 + Twilio RTT + 디바이스 에코

    # Session B VAD 설정 (수신자 음성 감지 민감도)
    session_b_vad_threshold: float = 0.7  # 0.0~1.0, 높을수록 큰 소리만 감지 (기본 0.5 → 0.7, 전화 오디오용)
    session_b_vad_silence_ms: int = 500  # 발화 종료 판정까지 필요한 무음 시간 (기본 200ms → 500ms)
    session_b_vad_prefix_padding_ms: int = 300  # 발화 시작 전 포함할 오디오 (기본 300ms)

    # 클라이언트 측 오디오 에너지 게이트 (무음/소음 필터링)
    # NOTE: Server VAD threshold 0.8이 소음 필터링을 담당하므로,
    # 에너지 게이트는 순수 무음만 차단하도록 낮은 임계값 사용
    audio_energy_gate_enabled: bool = True
    audio_energy_min_rms: float = 20.0  # mu-law RMS 최소 임계값 (0=무음, 전화 소음 ~50-200, 발화 ~300+)

    # Phase 4: Guardrail (PRD M-2)
    guardrail_enabled: bool = True
    guardrail_fallback_model: str = "gpt-4o-mini"
    guardrail_fallback_timeout_ms: int = 2000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
