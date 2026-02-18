# WIGVO Relay Server

OpenAI Realtime API + Twilio Media Streams 기반 양방향 실시간 번역 통화 서버.

## Quick Start

```bash
uv sync                              # 의존성 설치
cp .env.example .env                  # 환경변수 설정
uv run uvicorn src.main:app --reload  # 개발 서버
uv run pytest                         # 테스트
```

## 디렉토리 구조

```
src/
├── main.py                  # FastAPI 엔트리포인트, 라우터 등록, lifespan
├── config.py                # 환경변수 (pydantic-settings)
├── types.py                 # 공유 타입/Enum/Pydantic 모델
├── call_manager.py          # 통화 라이프사이클 싱글톤 (중앙 리소스 관리)
│
├── routes/
│   ├── calls.py             # POST /relay/calls/start, /end — 통화 시작/종료 API
│   ├── stream.py            # WS /relay/calls/{id}/stream — App ↔ Relay WebSocket
│   ├── twilio_webhook.py    # POST /twilio/webhook — TwiML, WS /twilio/media-stream
│   └── health.py            # GET /health
│
├── realtime/
│   ├── session_manager.py   # RealtimeSession (OpenAI WS 래퍼) + DualSessionManager
│   ├── audio_router.py      # AudioRouter — 모든 오디오 흐름의 중앙 허브
│   ├── session_a.py         # SessionAHandler — User→수신자 번역 이벤트 처리
│   ├── session_b.py         # SessionBHandler — 수신자→User 번역 이벤트 처리
│   ├── interrupt_handler.py # 턴 겹침/인터럽트 처리 (수신자 우선)
│   ├── first_message.py     # 수신자 응답 감지 → AI 고지 전송
│   ├── context_manager.py   # 대화 컨텍스트 슬라이딩 윈도우 (6턴)
│   ├── recovery.py          # 세션 장애 감지 → 자동 재연결 + catch-up
│   └── ring_buffer.py       # 30초 순환 오디오 버퍼 (Recovery용)
│
├── guardrail/
│   ├── checker.py           # GuardrailChecker — Level 1/2/3 분류 파이프라인
│   ├── filter.py            # 규칙 기반 텍스트 필터 (regex + keyword)
│   ├── dictionary.py        # 금지어/교정 사전 (ko/en/ja/zh)
│   └── fallback_llm.py      # GPT-4o-mini 텍스트 교정 (Level 2/3)
│
├── prompt/
│   ├── generator_v3.py      # Session A/B 시스템 프롬프트 동적 생성
│   └── templates.py         # 프롬프트 템플릿 + 언어별 변수
│
├── tools/
│   ├── definitions.py       # Agent Mode Function Calling 도구 정의
│   └── executor.py          # Function Call 실행 + ActiveCall에 결과 기록
│
├── twilio/
│   ├── outbound.py          # Twilio REST API 발신 (sync → async 래핑)
│   └── media_stream.py      # TwilioMediaStreamHandler (WS 파싱/오디오 전송)
│
└── db/
    └── supabase_client.py   # Supabase 영속화 (통화 종료 시 upsert)
```

## 아키텍처 개요

### Dual Session 구조

하나의 통화에 **2개의 독립적인 OpenAI Realtime 세션**이 동작한다:

```
Session A: User → 수신자 (source → target 번역)
  - 입력: pcm16 (App에서)
  - 출력: g711_ulaw (Twilio로)

Session B: 수신자 → User (target → source 번역)
  - 입력: g711_ulaw (Twilio에서)
  - 출력: pcm16 (App으로)
```

두 세션을 분리하는 이유: 번역 방향을 혼동하지 않기 위함. 단일 세션으로 합치면 source/target 언어가 뒤섞인다.

### 통화 시작 시퀀스

```
① App → POST /relay/calls/start
   ├─ ActiveCall 생성
   ├─ System Prompt 생성 (prompt/generator_v3)
   ├─ DualSessionManager → OpenAI Realtime WS 2개 연결
   └─ Twilio REST API로 전화 발신

② App → WS /relay/calls/{id}/stream 연결
   └─ call_manager에 App WS 등록

③ Twilio → POST /twilio/webhook/{id}
   └─ TwiML <Stream> 응답 → Media Stream 연결 지시

④ Twilio → WS /twilio/media-stream/{id} 연결
   ├─ TwilioMediaStreamHandler 생성
   ├─ AudioRouter 생성 + call_manager에 등록   ← 핵심 파이프라인 시작점
   ├─ dual_session.listen_all() 백그라운드 시작
   └─ Twilio 오디오 수신 루프 시작
```

> AudioRouter는 **Twilio WS 연결 시점**에 생성된다. App WS가 먼저 연결되더라도 AudioRouter 없이는 오디오를 처리하지 않고 대기한다.

### 오디오 파이프라인

#### Pipeline A: User → 수신자

```
App                       Relay Server                      Twilio
 │                             │                              │
 │── audio_chunk ──► stream.py │                              │
 │                      │      │                              │
 │              AudioRouter.handle_user_audio()                │
 │                      │                                     │
 │              RingBuffer A에 기록                             │
 │                      │                                     │
 │              SessionAHandler.send_user_audio()              │
 │                      │                                     │
 │                      ▼                                     │
 │              OpenAI Session A                               │
 │              [User 음성 STT → 번역 → TTS]                   │
 │                      │                                     │
 │        response.audio.delta (g711_ulaw)                    │
 │                      │                                     │
 │              SessionAHandler._handle_audio_delta()          │
 │                      │                                     │
 │                (Guardrail 검사)                              │
 │                      │                                     │
 │              AudioRouter._on_session_a_tts()                │
 │                      │                                     │
 │                (Echo Gate 활성화)                             │
 │                (Interrupt 체크)                              │
 │                      │                                     │
 │              TwilioHandler.send_audio() ───────────────────►│
 │                                          g711_ulaw          │
```

Client VAD 모드에서는 `vad_state:committed` 시 Context 주입 후 `input_audio_buffer.commit` + `response.create`.

#### Pipeline B: 수신자 → User

```
Twilio                    Relay Server                      App
 │                             │                              │
 │── media event ──► twilio_   │                              │
 │   (g711_ulaw)     webhook   │                              │
 │                      │      │                              │
 │              AudioRouter.handle_twilio_audio()              │
 │                      │                                     │
 │              RingBuffer B에 기록                             │
 │                      │                                     │
 │              SessionBHandler.send_recipient_audio()         │
 │                      │                                     │
 │                      ▼                                     │
 │              OpenAI Session B                               │
 │              [수신자 음성 STT → 번역 → TTS]                  │
 │                      │                                     │
 │        ┌─ Stage 1: input_audio_transcription.completed      │
 │        │  (원문 STT, 예: "안녕하세요") ────────────────────►│ caption.original
 │        │                                                   │
 │        └─ Stage 2: response.audio_transcript.done           │
 │           (번역 완료, 예: "Hello") ───────────────────────►│ caption.translated
 │                      │                                     │
 │        response.audio.delta (pcm16)                        │
 │                      │                                     │
 │              Echo Gate 체크 (억제 중이면 pending 큐)         │
 │                      │                                     │
 │              ────────────────────────────────────────────►│ recipient_audio
```

### 핵심 메커니즘

#### Echo Gate v2

Session A가 TTS를 Twilio로 보내면, 그 소리가 Twilio 수신자 마이크를 통해 다시 Session B로 들어와 에코가 발생한다. 이를 방지하는 게이팅:

| 단계 | 동작 |
|---|---|
| Session A TTS 시작 | `output_suppressed = True` (Session B OUTPUT만 억제, INPUT은 항상 활성) |
| Session A 응답 완료 | 쿨다운 타이머 시작 (기본 0.3초) |
| 쿨다운 완료 | `output_suppressed = False` → `flush_pending_output()` |
| 억제 중 수신자 발화 | 즉시 게이트 해제 (수신자 우선) |

핵심: **INPUT은 차단하지 않음** → 수신자 발화를 항상 감지할 수 있다. OUTPUT만 억제하고 pending 큐에 저장 후 나중에 배출.

#### Interrupt (턴 겹침 처리)

우선순위: 수신자 발화 > User 발화 > AI 생성

| 케이스 | 처리 |
|---|---|
| Session A TTS 중 수신자 끼어듦 | `response.cancel` + Twilio 버퍼 `clear` |
| User 발화 중 수신자 끼어듦 | App에 알림, User 오디오는 버퍼링 유지 |
| Session A/B 동시 출력 | 독립 경로이므로 병렬 허용 |

수신자 발화 종료 후 **1.5초 쿨다운**으로 짧은 쉼 후 이어 말하는 패턴을 보호한다.

#### Context Manager (대화 맥락 유지)

최근 **6턴 슬라이딩 윈도우**로 대화를 추적한다. 발화 커밋/종료 시점에 `conversation.item.create`로 세션에 주입하여 번역 일관성을 확보한다. `session.update`를 쓰지 않는 이유: 세션 전체 설정이 리셋되기 때문.

#### First Message

수신자가 전화를 받고 처음 발화하면("여보세요") → Session B Server VAD가 감지 → AI 고지 메시지를 Session A를 통해 TTS로 전달.

#### Recovery

- **RingBuffer**: 30초 순환 버퍼에 모든 오디오를 항상 기록
- **Heartbeat**: 45초 이내 이벤트 없으면 장애로 판단
- **재연결**: exponential backoff (1s → 2s → 4s → 8s, max 30s)
- **Catch-up**: 미전송 오디오를 Whisper API로 배치 STT
- **Degraded Mode**: 10초 이상 복구 실패 시 Whisper batch fallback

#### Guardrail (번역 품질 보호)

```
텍스트 델타 도착 (오디오보다 먼저)
 │
 ├─ Level 1: PASS → 오디오 그대로 Twilio로 전달
 ├─ Level 2: 비격식 표현 감지 → 오디오는 전달, 백그라운드 LLM 교정 (로그)
 └─ Level 3: 욕설/금지어 감지 → 오디오 차단, LLM 교정 후 재TTS
```

### Relay Mode vs Agent Mode

| | Relay Mode | Agent Mode |
|---|---|---|
| Session A 역할 | User 발화를 번역만 | AI가 자율적으로 대화 |
| User 입력 | 음성/텍스트 → 번역 전달 | 텍스트 지시 → AI가 판단 |
| Session B → A 피드백 | 없음 | 수신자 번역을 Session A에 자동 전달 |
| Function Calling | 비활성 | 활성 (예약 확인, 정보 수집, 통화 종료 판정) |
| 프롬프트 | 번역기 프롬프트 | AI 전화 어시스턴트 프롬프트 |

### CallManager (중앙 리소스 관리)

`call_id` 기반 딕셔너리로 모든 리소스를 관리하는 싱글톤:

```python
_calls:        dict[str, ActiveCall]           # 통화 상태
_sessions:     dict[str, DualSessionManager]   # OpenAI 세션
_routers:      dict[str, AudioRouter]          # 오디오 라우터
_app_ws:       dict[str, WebSocket]            # App WebSocket
_listen_tasks: dict[str, asyncio.Task]         # 세션 리스닝 태스크
```

`cleanup_call(call_id)` — **idempotent**한 중앙 정리:
1. AudioRouter.stop()
2. listen_task.cancel()
3. DualSession.close()
4. App WS 알림 + 닫기
5. Supabase DB persist
6. 딕셔너리에서 제거

호출 지점: App WS 끊김, Twilio 끊김, status-callback, 수동 종료, 서버 셧다운.

## 통신 프로토콜

### App → Relay (WebSocket JSON)

| type | data | 설명 |
|---|---|---|
| `audio_chunk` | `{audio: base64}` | User 음성 (pcm16) |
| `vad_state` | `{state: "committed"}` | Client VAD 발화 종료 |
| `text_input` | `{text: string}` | User 텍스트 입력 |
| `end_call` | `{}` | 통화 종료 |

### Relay → App (WebSocket JSON)

| type | data | 설명 |
|---|---|---|
| `caption.original` | `{role, text, stage:1}` | 수신자 원문 자막 (즉시) |
| `caption.translated` | `{role, text, stage:2}` | 수신자 번역 자막 |
| `caption` | `{role, text, direction}` | Session A 번역 자막 |
| `recipient_audio` | `{audio: base64}` | 수신자 번역 음성 (pcm16) |
| `call_status` | `{status, message}` | 통화 상태 변경 |
| `translation.state` | `{state}` | 번역 진행 상태 (processing/done) |
| `interrupt_alert` | `{speaking}` | 수신자 끼어듦 알림 |
| `session.recovery` | `{status, gap_ms}` | 세션 복구 상태 |
| `guardrail.triggered` | `{level, original}` | Guardrail 이벤트 |
| `error` | `{message}` | 에러 |

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | | Twilio 계정 SID |
| `TWILIO_AUTH_TOKEN` | | Twilio 인증 토큰 |
| `TWILIO_PHONE_NUMBER` | | Twilio 발신 번호 |
| `OPENAI_API_KEY` | | OpenAI API 키 |
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview` | Realtime 모델 |
| `SUPABASE_URL` | | Supabase URL |
| `SUPABASE_SERVICE_KEY` | | Supabase 서비스 키 |
| `RELAY_SERVER_URL` | `http://localhost:8000` | 서버 URL (Twilio webhook용) |
| `GUARDRAIL_ENABLED` | `true` | Guardrail 활성화 |
| `ECHO_GATE_COOLDOWN_S` | `0.3` | Echo Gate 쿨다운 (초) |
