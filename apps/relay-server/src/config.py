from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

# Monorepo 루트의 .env 파일 경로 (config.py → src → relay-server → apps → wigvo)
# Docker(/app/src/config.py)에서는 parents[3]이 없으므로 안전하게 처리
try:
    _ROOT_DIR = Path(__file__).resolve().parents[3]
except IndexError:
    _ROOT_DIR = Path(__file__).resolve().parent  # Docker fallback → env vars 사용
_ENV_FILE = _ROOT_DIR / ".env"


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
            "https://wigvo-web-gzjzn35jyq-du.a.run.app",
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
    heartbeat_timeout_s: float = 120.0  # 45→120s: 대화 중 자연스러운 침묵(타이핑 대기 등)을 disconnect로 오판 방지
    ring_buffer_capacity_slots: int = 1500  # 30초 / 20ms

    # Whisper fallback (Degraded Mode)
    whisper_model: str = "whisper-1"

    # Echo Gate (에코 피드백 루프 차단)
    echo_gate_cooldown_s: float = 2.5  # TTS 완료 후 에코 소멸 대기 (레거시 폴백용)

    # Echo Detector (에너지 핑거프린트 기반 에코 감지) — 현재 비활성화, Echo Gate + Silence Injection 사용
    echo_detector_enabled: bool = False
    echo_detector_threshold: float = 0.6
    echo_detector_safety_cooldown_s: float = 0.15
    echo_detector_min_delay_chunks: int = 4
    echo_detector_max_delay_chunks: int = 20
    echo_detector_correlation_window: int = 8

    # Session B VAD 설정 (수신자 음성 감지 민감도)
    session_b_vad_threshold: float = 0.8  # 0.0~1.0, 높을수록 큰 소리만 감지 (전화 오디오 권장 0.8~0.85)
    session_b_vad_silence_ms: int = 500  # 발화 종료 판정까지 필요한 무음 시간 (기본 200ms → 500ms)
    session_b_vad_prefix_padding_ms: int = 300  # 발화 시작 전 포함할 오디오 (기본 300ms)
    session_b_min_speech_ms: int = 250  # 최소 발화 길이 — 이보다 짧은 segment는 노이즈로 간주

    # Local VAD (Silero VAD + RMS Energy Gate)
    local_vad_enabled: bool = True
    local_vad_rms_threshold: float = 150.0
    local_vad_speech_threshold: float = 0.5
    local_vad_silence_threshold: float = 0.35
    local_vad_min_speech_frames: int = 2    # 2 × 32ms = 64ms
    local_vad_min_silence_frames: int = 15  # 15 × 32ms = 480ms

    # 클라이언트 측 오디오 에너지 게이트 (무음/소음 필터링)
    # NOTE: Server VAD threshold 0.8이 소음 필터링을 담당하므로,
    # 에너지 게이트는 순수 무음만 차단하도록 낮은 임계값 사용
    audio_energy_gate_enabled: bool = True
    audio_energy_min_rms: float = 150.0  # mu-law RMS 최소 임계값 (전화선 배경 소음 ~50-200 필터, 발화 ~500-2000+ 통과)
    echo_energy_threshold_rms: float = 400.0  # Echo window 중 에너지 임계값
                                               # 에코(감쇠): ~100-400, 발화(직접): ~500-2000+

    # Logging
    log_level: str = "INFO"
    log_dir: str = "logs"
    log_max_bytes: int = 10_485_760  # 10MB
    log_backup_count: int = 5

    # Phase 4: Guardrail (PRD M-2)
    guardrail_enabled: bool = True
    guardrail_fallback_model: str = "gpt-4o-mini"
    guardrail_fallback_timeout_ms: int = 2000

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",  # 공유 .env의 Web 전용 변수(NEXT_PUBLIC_* 등) 무시
    }


settings = Settings()
