# Task Plan: Realtime Relay System v3.1

> **Generated from**: docs/12_PRD_REALTIME_RELAY.md (v3.1)
> **Created**: 2026-02-13
> **Updated**: 2026-02-14 (Phase 1 Relay Server — Python/uv 기반 구현 완료)
> **Status**: in_progress

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Tech Stack (uv 적응)

| Component | PRD 원본 | 실제 구현 |
|-----------|---------|----------|
| Relay Server | Fastify + @fastify/websocket | **FastAPI + websockets + uvicorn** |
| 패키지 매니저 | npm/pnpm | **uv** |
| 언어 | TypeScript | **Python 3.12+** |

## Phases

### Phase 1: Core Relay (MVP) — Relay Server + Push-to-Talk

#### 1A. Relay Server 초기화 (FastAPI + uv)
- [x] FastAPI + uvicorn + websockets 프로젝트 셋업 (`apps/relay-server/`)
- [x] 환경변수 관리 (`src/config.py`)
- [x] 공유 타입 정의 — Pydantic models (`src/types.py`)
- [x] Twilio SDK 설치 + 환경변수 설정

#### 1B. Twilio 연동
- [x] Twilio Outbound Call REST API 발신 (`src/twilio/outbound.py`)
- [x] Twilio TwiML webhook 엔드포인트 (`src/routes/twilio_webhook.py`)
- [x] Twilio Media Stream WebSocket 핸들러 (`src/twilio/media_stream.py`)
- [x] Twilio status callback 엔드포인트

#### 1C. OpenAI Realtime API 연결
- [x] OpenAI Realtime API WebSocket 연결 관리 (`src/realtime/session_manager.py`)
- [x] Session A 구현: User 입력 → targetLanguage TTS → Twilio (`src/realtime/session_a.py`)
- [x] Session B 구현: Twilio 오디오 → STT → sourceLanguage 번역 (`src/realtime/session_b.py`)
- [x] 오디오 라우터: Twilio ↔ OpenAI 양방향 포워딩 (`src/realtime/audio_router.py`)

#### 1D. v3 프롬프트 시스템
- [x] v3 System Prompt 생성기 — Relay/Agent 모드별 (`src/prompt/generator_v3.py`)
- [x] 언어별 프롬프트 템플릿 (`src/prompt/templates.py`)
- [x] First Message Strategy 구현 — AI 고지 + 수신자 인사 대기 (`src/realtime/first_message.py`)

#### 1E. Relay Server API 엔드포인트
- [x] 통화 시작 API (`POST /relay/calls/start`)
- [x] WebSocket 스트리밍 엔드포인트 (`WS /relay/calls/{id}/stream`)
- [x] Health Check 엔드포인트 (`GET /health`) [M-8]
- [x] 최대 통화 시간 제한 (10분 자동 종료 + 8분 경고) [M-3]
- [x] 통화 종료 API (`POST /relay/calls/{id}/end`)
- [x] Feature Flag 분기 (CALL_MODE=realtime | elevenlabs)

#### 1H. Turn Overlap / Interrupt 처리 [M-1]
- [x] 수신자 발화 감지 시 Session A TTS 중단 (response.cancel)
- [x] Interrupt 우선순위 로직 (수신자 > User > AI)
- [x] 동시 발화 시 User 앱 시각적 알림 ("상대방이 말하고 있습니다")

#### 1F. React Native 앱 초기화
- [x] Expo 프로젝트 셋업 (`apps/mobile/`)
- [x] Supabase Auth 연동 (기존 로직 이식)
- [x] 기본 네비게이션 구조 (Expo Router)
- [x] Relay Server WebSocket 연결 훅 (`hooks/useRelayWebSocket.ts`)

#### 1G. React Native 통화 UI
- [x] 기본 실시간 자막 UI (`components/call/LiveCaptionPanel.tsx`)
- [x] Push-to-Talk 입력 UI (`components/call/PushToTalkInput.tsx`)
- [x] 통화 뷰 컴포넌트 (`components/call/RealtimeCallView.tsx`)
- [x] 접근성: 자막 폰트 크기 조절 설정 (`FontScaleControl.tsx`) [M-7]
- [x] 접근성: 수신자 발화 시 진동 피드백 [M-7]
- [x] 접근성: Push-to-Talk 버튼 최소 48x48dp [M-7]

### Phase 2: Voice Mode + Client-side VAD

- [x] React Native 오디오 캡처 구현 (`expo-av`, `hooks/useAudioRecorder.ts`)
- [x] Client-side VAD 로직 구현 (`lib/vad/vad-processor.ts`)
- [x] VAD 설정 파라미터 관리 (`lib/vad/vad-config.ts`)
- [x] Pre-speech Ring Buffer (300ms) 구현 (`lib/vad/audio-ring-buffer.ts`)
- [x] VAD 상태 머신 (SILENT → SPEAKING → COMMITTED)
- [x] `useClientVad` 커스텀 훅 (`hooks/useClientVad.ts`)
- [x] VAD 상태 시각화 (`components/call/VadIndicator.tsx`)
- [x] Session A: 음성 입력 모드 추가 (Client VAD → Relay Server → OpenAI)
- [x] 모드 선택 UI (`components/call/ModeSelector.tsx`)
- [x] `useRealtimeCall` 훅 통합 (`hooks/useRealtimeCall.ts`)

### Phase 3: Non-blocking Pipeline + Recovery

- [x] Ring Buffer 구현 — 30초 오디오 보관 (`relay-server/src/realtime/ring_buffer.py`)
- [x] 시퀀스 번호 추적 (lastSent, lastReceived)
- [x] Session 장애 감지 (WebSocket close/error, heartbeat timeout)
- [x] Session 자동 재연결 (exponential backoff)
- [x] Ring Buffer catch-up (미전송 오디오를 STT-only 배치 처리)
- [x] Conversation context 복원 (이전 transcript 주입)
- [x] Degraded Mode 전환 (Whisper batch STT fallback)
- [x] 통화 상태 오버레이 UI (`components/call/CallStatusOverlay.tsx`)
- [x] Recovery 이벤트 로깅 (recovery_events JSONB)

### Phase 4: Guardrail + Fallback LLM

- [x] Guardrail Level 분류 로직 — 텍스트 델타 검사 기반 (`relay-server/src/guardrail/checker.py`) [M-2]
- [x] 규칙 기반 필터 — 반말, 욕설, 비격식 감지 (`relay-server/src/guardrail/filter.py`) [M-2]
- [x] 금지어/교정 사전 (`relay-server/src/guardrail/dictionary.py`)
- [x] Fallback LLM 교정 호출 — GPT-4o-mini (`relay-server/src/guardrail/fallback_llm.py`)
- [x] Level 1: 자동 PASS (추가 처리 없음)
- [x] Level 2: 비동기 검증 (TTS 출력 후 백그라운드 교정)
- [x] Level 3: 동기 차단 (필러 오디오 + 교정 후 재전송)
- [x] Guardrail 이벤트 로깅 (guardrail_events JSONB)
- [x] 필러 오디오 생성/관리 ("잠시만요" 등)

### Phase 5: DB Migration + Cost Tracking + Polish

- [x] DB 스키마 마이그레이션 (v3 필드 추가)
- [x] 양쪽 언어 트랜스크립트 저장 (transcript_bilingual)
- [x] 비용 토큰 추적 (cost_tokens JSONB)
- [x] Function Calling 구현 (예약 확인, 장소 검색)
- [x] 통화 결과 자동 판정 (Tool Call 기반)
- [x] 2단계 자막 (원문 즉시 → 번역 0.5초 후)
- [x] ElevenLabs 코드 정리 (deprecated 마킹 — config.py)
- [x] E2E 테스트 시나리오 작성

## Progress

| Metric | Value |
|--------|-------|
| Total Tasks | 65/65 |
| Current Phase | ALL PHASES COMPLETED |
| Status | completed |

## Execution Log

| Timestamp | Phase | Task | Status |
|-----------|-------|------|--------|
| 2026-02-14 | Phase 1 | 1A. Relay Server 초기화 (uv + FastAPI) | completed |
| 2026-02-14 | Phase 1 | 1B. Twilio 연동 | completed |
| 2026-02-14 | Phase 1 | 1C. OpenAI Realtime API 연결 | completed |
| 2026-02-14 | Phase 1 | 1D. v3 프롬프트 시스템 | completed |
| 2026-02-14 | Phase 1 | 1E. API 엔드포인트 | completed |
| 2026-02-14 | Phase 1 | 1H. Turn Overlap / Interrupt 처리 | completed |
| 2026-02-14 | Phase 1 | 1F. React Native 앱 초기화 | completed |
| 2026-02-14 | Phase 1 | 1G. React Native 통화 UI (기본) | completed |
| 2026-02-14 | Phase 3 | Ring Buffer + Recovery + Degraded Mode | completed |
| 2026-02-14 | Phase 4 | Guardrail Level 분류 + Fallback LLM | completed |
| 2026-02-14 | Phase 5 | DB 마이그레이션 + Supabase Client | completed |
| 2026-02-14 | Phase 5 | Transcript Bilingual + Cost Tokens | completed |
| 2026-02-14 | Phase 5 | Function Calling (Agent Mode) | completed |
| 2026-02-14 | Phase 5 | 통화 결과 자동 판정 | completed |
| 2026-02-14 | Phase 5 | 2단계 자막 (원문 즉시 → 번역 0.5초 후) | completed |
| 2026-02-14 | Phase 5 | E2E 테스트 시나리오 (34 tests) | completed |
| 2026-02-14 | Phase 2 | Voice Mode + Client-side VAD (9 신규 + 5 수정 파일) | completed |
| 2026-02-14 | Phase 1G | 접근성: FontScaleControl + 진동 피드백 + 48dp 터치 | completed |
| 2026-02-14 | Phase 3 | CallStatusOverlay (Recovery 상태 시각화) | completed |
| 2026-02-14 | Phase 5 | ElevenLabs deprecated 마킹 | completed |
