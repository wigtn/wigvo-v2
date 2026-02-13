# Task Plan: Realtime Relay System v3.1

> **Generated from**: docs/12_PRD_REALTIME_RELAY.md (v3.1)
> **Created**: 2026-02-13
> **Updated**: 2026-02-13 (React Native + Fastify 아키텍처 반영)
> **Status**: pending

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Phases

### Phase 1: Core Relay (MVP) — Relay Server + React Native + Push-to-Talk

#### 1A. Relay Server 초기화 (Fastify)
- [ ] Fastify + @fastify/websocket 프로젝트 셋업 (`apps/relay-server/`)
- [ ] 환경변수 관리 (`src/config.ts`)
- [ ] 공유 타입 정의 (`src/types.ts`)
- [ ] Twilio SDK 설치 + 환경변수 설정

#### 1B. Twilio 연동
- [ ] Twilio Outbound Call REST API 발신 (`src/twilio/outbound.ts`)
- [ ] Twilio TwiML webhook 엔드포인트 (`src/routes/twilio-webhook.ts`)
- [ ] Twilio Media Stream WebSocket 핸들러 (`src/twilio/media-stream.ts`)
- [ ] Twilio status callback 엔드포인트

#### 1C. OpenAI Realtime API 연결
- [ ] OpenAI Realtime API WebSocket 연결 관리 (`src/realtime/session-manager.ts`)
- [ ] Session A 구현: 텍스트 입력 → targetLanguage TTS → Twilio (`src/realtime/session-a.ts`)
- [ ] Session B 구현: Twilio 오디오 → STT → sourceLanguage 번역 (`src/realtime/session-b.ts`)
- [ ] 오디오 라우터: Twilio ↔ OpenAI 양방향 포워딩 (`src/realtime/audio-router.ts`)

#### 1D. v3 프롬프트 시스템
- [ ] v3 System Prompt 생성기 — Relay/Agent 모드별 (`src/prompt/generator-v3.ts`)
- [ ] 언어별 프롬프트 템플릿 (`src/prompt/templates.ts`)
- [ ] First Message Strategy 구현 — AI 고지 + 수신자 인사 대기 (`src/realtime/first-message.ts`)

#### 1E. Relay Server API 엔드포인트
- [ ] 통화 시작 API (`POST /relay/calls/start`)
- [ ] WebSocket 스트리밍 엔드포인트 (`WS /relay/calls/:id/stream`)
- [ ] Health Check 엔드포인트 (`GET /health`) [M-8]
- [ ] 최대 통화 시간 제한 (10분 자동 종료 + 8분 경고) [M-3]
- [ ] 통화 종료 + 결과 DB 저장 (Supabase)
- [ ] Feature Flag 분기 (CALL_MODE=realtime | elevenlabs)

#### 1H. Turn Overlap / Interrupt 처리 [M-1]
- [ ] 수신자 발화 감지 시 Session A TTS 중단 (response.cancel)
- [ ] Interrupt 우선순위 로직 (수신자 > User > AI)
- [ ] 동시 발화 시 User 앱 시각적 알림 ("상대방이 말하고 있습니다")

#### 1F. React Native 앱 초기화
- [ ] Expo 프로젝트 셋업 (`apps/mobile/`)
- [ ] Supabase Auth 연동 (기존 로직 이식)
- [ ] 기본 네비게이션 구조 (Expo Router)
- [ ] Relay Server WebSocket 연결 훅 (`hooks/useRelayWebSocket.ts`)

#### 1G. React Native 통화 UI
- [ ] 기본 실시간 자막 UI (`components/call/LiveCaptionPanel.tsx`)
- [ ] Push-to-Talk 입력 UI (`components/call/PushToTalkInput.tsx`)
- [ ] 통화 뷰 컴포넌트 (`components/call/RealtimeCallView.tsx`)
- [ ] 접근성: 자막 폰트 크기 조절 설정 [M-7]
- [ ] 접근성: 수신자 발화 시 진동 피드백 [M-7]
- [ ] 접근성: Push-to-Talk 버튼 최소 48x48dp [M-7]

### Phase 2: Voice Mode + Client-side VAD

- [ ] React Native 오디오 캡처 구현 (`expo-av` 또는 `react-native-audio-api`)
- [ ] Client-side VAD 로직 구현 (`lib/vad/client-vad.ts`)
- [ ] VAD 설정 파라미터 관리 (`lib/vad/vad-config.ts`)
- [ ] Pre-speech Ring Buffer (300ms) 구현
- [ ] VAD 상태 머신 (SILENT → SPEAKING → COMMITTED)
- [ ] `useClientVad` 커스텀 훅 (`hooks/useClientVad.ts`)
- [ ] VAD 상태 시각화 (`components/call/VadIndicator.tsx`)
- [ ] Session A: 음성 입력 모드 추가 (Client VAD → Relay Server → OpenAI)
- [ ] 모드 선택 UI (Voice-to-Voice / Chat-to-Voice / Voice-to-Text)
- [ ] `useRealtimeCall` 훅 통합 (`hooks/useRealtimeCall.ts`)

### Phase 3: Non-blocking Pipeline + Recovery

- [ ] Ring Buffer 구현 — 30초 오디오 보관 (`relay-server/src/realtime/ring-buffer.ts`)
- [ ] 시퀀스 번호 추적 (lastSent, lastReceived)
- [ ] Session 장애 감지 (WebSocket close/error, heartbeat timeout)
- [ ] Session 자동 재연결 (exponential backoff)
- [ ] Ring Buffer catch-up (미전송 오디오를 STT-only 배치 처리)
- [ ] Conversation context 복원 (이전 transcript 주입)
- [ ] Degraded Mode 전환 (Whisper batch STT fallback)
- [ ] 통화 상태 오버레이 UI (`mobile/components/call/CallStatusOverlay.tsx`)
- [ ] Recovery 이벤트 로깅 (recovery_events JSONB)

### Phase 4: Guardrail + Fallback LLM

- [ ] Guardrail Level 분류 로직 — 텍스트 델타 검사 기반 (`relay-server/src/guardrail/checker.ts`) [M-2]
- [ ] 규칙 기반 필터 — 반말, 욕설, 비격식 감지 (`relay-server/src/guardrail/filter.ts`) [M-2]
- [ ] 금지어/교정 사전 (`relay-server/src/guardrail/dictionary.ts`)
- [ ] Fallback LLM 교정 호출 — GPT-4o-mini (`relay-server/src/guardrail/fallback-llm.ts`)
- [ ] Level 1: 자동 PASS (추가 처리 없음)
- [ ] Level 2: 비동기 검증 (TTS 출력 후 백그라운드 교정)
- [ ] Level 3: 동기 차단 (필러 오디오 + 교정 후 재전송)
- [ ] Guardrail 이벤트 로깅 (guardrail_events JSONB)
- [ ] 필러 오디오 생성/관리 ("잠시만요" 등)

### Phase 5: DB Migration + Cost Tracking + Polish

- [ ] DB 스키마 마이그레이션 (v3 필드 추가)
- [ ] 양쪽 언어 트랜스크립트 저장 (transcript_bilingual)
- [ ] 비용 토큰 추적 (cost_tokens JSONB)
- [ ] Function Calling 구현 (예약 확인, 장소 검색)
- [ ] 통화 결과 자동 판정 (Tool Call 기반)
- [ ] 2단계 자막 (원문 즉시 → 번역 0.5초 후)
- [ ] ElevenLabs 코드 정리 (deprecated 마킹)
- [ ] E2E 테스트 시나리오 작성

## Progress

| Metric | Value |
|--------|-------|
| Total Tasks | 0/65 |
| Current Phase | - |
| Status | pending |

## Execution Log

| Timestamp | Phase | Task | Status |
|-----------|-------|------|--------|
| - | - | - | - |
