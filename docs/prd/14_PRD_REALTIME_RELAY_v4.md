# PRD: WIGVO Realtime Relay System v4

> **Project**: WIGVO — AI 실시간 중개 플랫폼 (외국인 & 교통약자)
> **Version**: 4.0
> **Created**: 2026-02-16
> **Status**: Draft
> **Previous**: docs/prd/12_PRD_REALTIME_RELAY.md (v3.2)
> **Purpose**: 현재 구현 기준 재정리 + Gap 분석 반영

---

## 0. Gap Analysis Summary (v3.2 PRD vs 실제 구현)

### 기술 스택 변경 (PRD와 다르게 구현됨)

| 항목 | PRD v3.2 명시 | 실제 구현 |
|------|-------------|----------|
| Relay Server Framework | Fastify + @fastify/websocket | **FastAPI + websockets + uvicorn** |
| 언어 | TypeScript (Node.js) | **Python 3.12+** |
| 패키지 매니저 | npm/pnpm | **uv** |
| API 네이밍 | camelCase (callId, callMode) | **snake_case (call_id, vad_mode)** |
| 설정 관리 | dotenv | **pydantic-settings** |
| API Response | `{ success: true, data: {...} }` | **Flat Pydantic model** |

### PRD에 없지만 구현된 기능

| 기능 | 설명 | 위치 |
|------|------|------|
| **Echo Gate** | Session A TTS → Twilio 출력 시 Session B 입력 억제로 에코 피드백 루프 차단 | `audio_router.py` |
| **CallManager 싱글톤** | 통화 라이프사이클 중앙 관리, idempotent cleanup, asyncio.Lock | `call_manager.py` |
| **Twilio Status Callback** | 수신자 전화 끊기 감지 → 자동 cleanup_call() | `twilio_webhook.py` |
| **Session B 에코 필터링** | 프롬프트에 "machine-generated speech or echo → produce NO output" 규칙 추가 | `templates.py` |
| **Session A TURN-TAKING** | "Translate SINGLE utterance then STOP. Never generate speech on your own" 규칙 추가 | `templates.py` |

### PRD에 있지만 미구현된 기능

| 기능 | PRD 섹션 | 상태 | 비고 |
|------|---------|------|------|
| Supabase Auth JWT 인증 | 8.2 | **미구현** | API 엔드포인트에 인증 미들웨어 없음 |
| CALL_IDLE_TIMEOUT_MS (30초) | 7.3 | **미구현** | 양쪽 무발화 타임아웃 미적용 |
| callMode 필드 | 8.2 | **미구현** | voice-to-voice / chat-to-voice 구분 없이 mode(relay/agent) + vad_mode 사용 |
| Dockerfile | 8.4 | **미구현** | 배포 인프라 미설정 |
| 통화 기록 화면 | 8.4 | **미구현** | 모바일 앱에 calls.tsx 없음 |
| 설정 화면 | 8.4 | **미구현** | 모바일 앱에 settings.tsx 없음 |
| 채팅 수집 화면 | 8.4 | **미구현** | chat/[id].tsx 없음 |
| 고대비 모드 | 7.6 | **미구현** | 다크/라이트 + 고대비 옵션 |
| 스크린 리더 호환 | 7.6 | **부분** | VoiceOver/TalkBack 레이블 미검증 |
| useLiveCaption 훅 | 8.4 | **미구현** | LiveCaptionPanel 컴포넌트만 존재 |

### WebSocket 메시지 타입 불일치

| PRD v3.2 | 실제 구현 | 방향 |
|----------|----------|------|
| `audio.chunk` | `audio_chunk` | C → S |
| `audio.commit` | `vad_state` (state: "committed") | C → S |
| `text.send` | `text_input` | C → S |
| `call.end` | `end_call` | C → S |
| `transcript.recipient` | `caption.original` | S → C |
| `transcript.recipient.translated` | `caption.translated` | S → C |
| `audio.recipient.translated` | `recipient_audio` | S → C |
| `call.status` | `call_status` | S → C |

---

## 1. Overview

### 1.1 Problem Statement

언어 장벽이 존재하는 전화 통화 상황에서 사용자들이 극심한 어려움을 겪고 있다.
- **외국인 (한국 거주)**: 한국어 통화 불가 → 병원 예약, 배달 주문, 택시 호출 등에 장벽
- **한국인 (해외 통화)**: 영어/현지어 통화 어려움 → 해외 호텔 예약, 항공사 문의, 현지 서비스 이용 장벽
- **언어 장애인**: 음성 통화 자체가 불가 → 텍스트로만 소통 가능하나 전화만 받는 업소 다수
- **청각 장애인**: 상대방 음성을 들을 수 없음 → 실시간 자막 필요

### 1.2 Goals

- **G1**: 외국인 사용자가 모국어로 말하면 AI가 한국어(존댓말)로 실시간 변환하여 전화 통화를 중개한다
- **G2**: 한국인 사용자가 한국어로 말하면 AI가 영어로 실시간 변환하여 해외 전화 통화를 중개한다
- **G3**: 언어 장애인이 텍스트를 입력하면 AI가 음성으로 변환하여 전화하고, 상대방 응답을 텍스트로 돌려준다
- **G4**: 양방향 실시간 자막(Live Captioning)으로 통화 내용을 시각화한다
- **G5**: OpenAI Realtime API 단독 아키텍처 (ElevenLabs 의존성 제거 완료)
- **G6**: React Native 앱으로 네이티브 WebSocket/오디오 지원 확보
- **G7**: Client VAD + Echo Gate로 비용 절감 및 에코 피드백 방지

### 1.3 Non-Goals (Out of Scope)

- 인바운드 전화 수신 (사용자가 전화를 받는 기능)
- 3자 이상 동시 통화
- 음성 클로닝 (사용자 목소리 복제)
- 감정 분석 (Sentiment Analysis)
- Google Calendar 연동

### 1.4 Scope

| 포함 | 제외 |
|------|------|
| **React Native 앱** (iOS/Android, Expo) | 웹 브라우저 전용 |
| OpenAI Realtime API 기반 STT/TTS/번역 | ElevenLabs (deprecated) |
| Twilio 직접 연동 (Media Streams) | SIP Direct Integration |
| **FastAPI Relay Server** (Python 3.12+, WebSocket 중계) | Fastify/Node.js |
| Client-side VAD + Server-side VAD + Push-to-Talk | WebRTC P2P |
| 실시간 자막 UI | 통화 녹음 재생 |
| 한국어 ↔ 영어 양방향 번역 | 기타 언어 (향후 확장) |
| Non-blocking 오디오 버퍼링 + Echo Gate | 오프라인 모드 |

---

## 2. User Stories

### 2.1 외국인 사용자 (Voice-to-Voice — Relay Mode)

```
AS A 한국 거주 외국인
I WANT TO 영어로 말하면 AI가 한국어로 번역하여 대신 전화해주길
SO THAT 언어 장벽 없이 병원 예약, 배달 주문 등을 할 수 있다
```

**Acceptance Criteria**:
```
Scenario: 외국인이 영어로 병원 예약 전화를 건다
  Given John이 WIGVO에 로그인하고 전화번호를 입력했다
  When "Start Call" 버튼을 누르고 영어로 말한다
  Then AI가 한국어 존댓말(해요체)로 번역하여 병원에 전화한다
  And 병원 직원의 한국어 응답이 영어 자막으로 실시간 표시된다
  And 통화 완료 후 전체 대화록이 양쪽 언어로 저장된다
```

### 2.2 언어 장애인 사용자 (Chat-to-Voice — Agent Mode)

```
AS A 언어 장애인
I WANT TO 텍스트를 입력하면 AI가 음성으로 변환하여 전화해주길
SO THAT 직접 말하지 않고도 전화 기반 서비스를 이용할 수 있다
```

### 2.3 한국인 사용자 — 해외 통화 (KR→EN Relay Mode)

```
AS A 영어 통화가 어려운 한국인
I WANT TO 한국어로 말하면 AI가 영어로 번역하여 해외에 전화해주길
SO THAT 언어 장벽 없이 해외 호텔 예약, 항공사 문의 등을 할 수 있다
```

---

## 3. Technical Architecture

### 3.1 Platform: React Native + FastAPI Relay Server

```
┌──────────────────────────────────────────────────────────────────┐
│                 WIGVO Realtime Relay System v4                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌────────────────┐    ┌────────────────────┐    ┌────────────┐ │
│  │  React Native   │    │  Relay Server       │    │   Phone    │ │
│  │  App (User)     │◄──►│  (FastAPI/Python)   │◄──►│  (수신자)  │ │
│  │                 │ WS │                     │ WS │            │ │
│  │  ┌───────────┐ │    │  ┌──────────────┐  │    └────────────┘ │
│  │  │ VAD       │ │    │  │ CallManager  │  │                    │
│  │  │ Processing│ │    │  │ (Singleton)  │  │                    │
│  │  └───────────┘ │    │  └──────────────┘  │                    │
│  │  ┌───────────┐ │    │  ┌──────────────┐  │    ┌────────────┐ │
│  │  │ Live      │ │    │  │ Audio Router │  │    │ OpenAI     │ │
│  │  │ Caption   │ │    │  │ + Echo Gate  │◄─├───►│ Realtime   │ │
│  │  └───────────┘ │    │  └──────────────┘  │ WS │ API        │ │
│  │  ┌───────────┐ │    │  ┌──────────────┐  │    │ Session A  │ │
│  │  │ Push-to-  │ │    │  │ Ring Buffer  │  │    │ Session B  │ │
│  │  │ Talk Input│ │    │  │ + Recovery   │  │    └────────────┘ │
│  │  └───────────┘ │    │  └──────────────┘  │                    │
│  └────────────────┘    │  ┌──────────────┐  │    ┌────────────┐ │
│                         │  │ Guardrail    │  │    │ Twilio     │ │
│                         │  │ + Fallback   │◄─├───►│ Media      │ │
│                         │  └──────────────┘  │ WS │ Streams    │ │
│                         └────────────────────┘    └────────────┘ │
│                                  │                                │
│                           ┌──────┴──────┐                        │
│                           │  Supabase   │                        │
│                           │  (DB/Auth)  │                        │
│                           └─────────────┘                        │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Stack (실제 구현 기준)

| Component | 기술 스택 | 위치 | 역할 |
|-----------|----------|------|------|
| **React Native App** | React Native (Expo), WebSocket, expo-av | `apps/mobile/` | UI, VAD, 오디오 캡처, 실시간 자막 표시 |
| **Relay Server** | Python 3.12+, FastAPI, uvicorn, websockets | `apps/relay-server/` | Twilio 연동, OpenAI 세션 관리, 오디오 라우팅, Guardrail, Echo Gate |
| **Database** | Supabase PostgreSQL + Auth | Cloud | 통화 기록, 인증 |

### 3.3 Dual Session Architecture

두 개의 독립적인 OpenAI Realtime API 세션으로 양방향 번역을 처리한다.

| 사용자 유형 | sourceLanguage | targetLanguage | Session A | Session B |
|------------|---------------|---------------|-----------|-----------|
| 외국인 (한국 거주) | en | ko | EN→KR | KR→EN |
| 한국인 (해외 통화) | ko | en | KR→EN | EN→KR |

```
Session A: User → 수신자 (Outbound Translation)
  Input:  User 음성 (pcm16 16kHz) 또는 텍스트
  Process: STT → Translation → Guardrail → TTS
  Output: targetLanguage 음성 (g711_ulaw) → Twilio → 수신자
  Side:   번역 텍스트 → App 자막 (caption)

Session B: 수신자 → User (Inbound Translation)
  Input:  수신자 음성 (g711_ulaw) via Twilio
  Process: STT → Translation → TTS (optional)
  Output: sourceLanguage 텍스트 → App 자막 (caption.original + caption.translated)
  Output: sourceLanguage 음성 (pcm16) → App 스피커 (optional)
```

### 3.4 Session A 운영 모드

| 모드 | 적용 대상 | Session A 역할 | User 참여도 |
|------|----------|----------------|------------|
| **Relay Mode** (기본) | 외국인, 한국인 | 실시간 번역기. User 말을 번역만 | 높음 — User가 대화 주도 |
| **Agent Mode** | 장애인 (Chat-to-Voice) | 자율 대화 에이전트. 수집 정보 기반 통화 | 낮음 — AI에 위임 |

### 3.5 First Message Strategy (AI 고지)

수신자가 전화를 받으면 AI임을 먼저 고지하고 대화를 시작한다.

```
1. Twilio가 전화를 건다
2. 수신자가 전화를 받는다 ("여보세요")
3. Session B가 수신자 첫 발화를 감지 (Server VAD)
4. 자동 AI 고지 (Session A → Twilio → 수신자)
   - ko: "안녕하세요. AI 통역 서비스를 이용해서 연락드렸습니다."
   - en: "Hello, this is an AI translation assistant calling on behalf of a customer."
5. Relay Mode: User에게 "상대방이 응답했습니다. 말씀하세요" 알림
   Agent Mode: AI가 바로 용건 시작
```

Timeout: 수신자 15초 무응답 시 "전화를 받지 않았습니다"

### 3.6 Turn Overlap / Interrupt 처리

#### Interrupt 우선순위

| 우선순위 | 설명 | 이유 |
|---------|------|------|
| 1 (최고) | 수신자 발화 | 수신자를 기다리게 하면 안 됨 |
| 2 | User 발화 | User가 의도적으로 발화 중 |
| 3 (최저) | AI 생성 (TTS/필러) | 언제든 중단 가능 |

#### 구현된 Interrupt 처리

- **Case 1**: Session A TTS 중 수신자 끼어들기 → Session A에 `response.cancel` → TTS 중단
- **Case 2**: User 발화 중 수신자 끼어들기 → App에 "상대방이 말하고 있습니다" 알림, User 오디오는 버퍼링 유지
- **Case 3**: Session A/B 동시 출력 → 독립 경로이므로 병렬 전달 가능
- **Case 4**: Agent Mode 중 수신자 끼어들기 → Session A `response.cancel` + 수신자 발화 처리

### 3.7 Echo Gate (PRD v3.2에 없음 — 신규)

**문제**: Session A TTS 오디오가 Twilio를 통해 수신자 전화로 전달될 때, 수신자 디바이스의 스피커에서 재생된 소리가 마이크로 다시 수집되어 Session B에 입력되는 에코 피드백 루프 발생.

**해결**: AudioRouter에 Echo Gate를 구현하여 Session A TTS 출력 중 Session B의 데이터 처리를 억제.

```
Session A TTS 시작
  → _activate_echo_suppression()
    → self._echo_suppressed = True
    → self.session_b.muted = True
    → Session B의 audio/transcript 이벤트 무시

Session A response.done
  → _start_echo_cooldown()
    → echo_gate_cooldown_s (기본 1.0초) 대기
    → self._echo_suppressed = False
    → self.session_b.muted = False
    → Session B input_audio_buffer.clear() (에코 잔여물 제거)
```

**Session B 프롬프트 보조 규칙**:
```
- If the audio sounds like machine-generated speech or echo → produce NO output.
- When in doubt, stay SILENT. Only translate when you clearly hear a human speaking.
```

### 3.8 CallManager 싱글톤 (PRD v3.2에 없음 — 신규)

통화 라이프사이클을 중앙에서 관리하는 싱글톤 패턴.

```python
class CallManager:
    _calls: dict[str, ActiveCall]
    _sessions: dict[str, DualSessionManager]
    _routers: dict[str, AudioRouter]
    _app_ws: dict[str, WebSocket]
    _listen_tasks: dict[str, asyncio.Task]
    _cleanup_locks: dict[str, asyncio.Lock]
```

**cleanup_call() (idempotent)**:
어디서든 호출 가능 — App WS 끊김, Twilio 끊김, 수신자 전화 끊기, 유저 수동 종료, 서버 종료.

순서:
1. AudioRouter stop (Echo Gate, Recovery 정리)
2. Listen task cancel
3. DualSession close (양쪽 WebSocket 종료)
4. App WS 알림 + 닫기
5. DB persist (Supabase upsert)
6. active_calls에서 제거

---

## 4. VAD (Voice Activity Detection) 설계

### 4.1 3가지 VAD 모드

| 방식 | 적용 | 비용 절감 |
|------|------|----------|
| **Client-side VAD** | 외국인 Voice-to-Voice | 가장 효과적 — 무음 구간 전송 차단 |
| **Server-side VAD** (OpenAI 내장) | 수신자 측 (Twilio) | Twilio 스트림은 Client VAD 불가 |
| **Push-to-Talk** (수동) | 장애인 Chat-to-Voice | 무음 비용 = 0 |

### 4.2 Client-side VAD 구현 상태

**위치**: `apps/mobile/lib/vad/`

| 파일 | 역할 |
|------|------|
| `vad-config.ts` | VAD 파라미터 설정 |
| `audio-ring-buffer.ts` | Pre-speech Ring Buffer (300ms) |
| `vad-processor.ts` | VAD 상태 머신 (SILENT → SPEAKING → COMMITTED) |

**VAD 파라미터**:

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| `speechThreshold` | 0.015 (RMS) | 음성 판단 임계값 |
| `silenceThreshold` | 0.008 (RMS) | 무음 판단 임계값 |
| `speechOnsetDelay` | 200ms | 음성 확정 지연 |
| `speechEndDelay` | 500ms | 발화 종료 판단 |
| `preBufferDuration` | 300ms | 발화 시작 전 버퍼링 |
| `sampleRate` | 16000Hz | 오디오 캡처 샘플레이트 |
| `chunkSize` | 4096 samples | WebSocket 전송 단위 |

### 4.3 세션별 오디오 포맷

| Session | Input Format | Input Source | Output Format | Output Destination |
|---------|-------------|-------------|--------------|-------------------|
| **A** (Relay Voice) | pcm16 16kHz | App (Client VAD) | g711_ulaw 8kHz | Twilio → 수신자 |
| **A** (Agent/PTT) | text only | App (텍스트) | g711_ulaw 8kHz | Twilio → 수신자 |
| **B** (모든 모드) | g711_ulaw 8kHz | Twilio ← 수신자 | pcm16 16kHz + text | App (자막 + 음성) |

### 4.4 Session Configuration (실제 구현)

```python
# Session A (Client VAD → turn_detection=null)
SessionConfig(
    input_audio_format="pcm16",
    output_audio_format="g711_ulaw",
    vad_mode=VadMode.CLIENT,  # → turn_detection: null
)

# Session B (항상 Server VAD)
SessionConfig(
    input_audio_format="g711_ulaw",
    output_audio_format="pcm16",
    vad_mode=VadMode.SERVER,  # → turn_detection: { type: "server_vad" }
    input_audio_transcription={"model": "whisper-1"},  # 2단계 자막 Stage 1
)
```

---

## 5. Non-blocking Pipeline & Recovery

### 5.1 3-Layer Audio Pipeline

```
Layer 1: Audio Capture (절대 중단 불가)
  Twilio ──┬──► Ring Buffer (항상 기록, 최근 30초)
           └──► OpenAI Session B (항상 수신 중)

Layer 2: Processing (비동기, 실패 허용)
  Session B ──┬──► 원문 자막 즉시 전달 (Stage 1)
              ├──► 번역 자막 전달 (Stage 2)
              └──► Guardrail 검사

Layer 3: Output (독립적 전달)
  원문 자막 ──► App (caption.original)
  번역 자막 ──► App (caption.translated)
  번역 음성 ──► App (recipient_audio)
```

### 5.2 Ring Buffer (구현 완료)

**위치**: `apps/relay-server/src/realtime/ring_buffer.py`

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| capacity | 1500 slots | 30초 / 20ms |
| chunk_duration | 20ms | Twilio 기본 패킷 크기 |
| 상태 추적 | `last_sent_seq`, `last_received_seq` | 미전송 오디오 gap 계산 |

### 5.3 Session Recovery (구현 완료)

**위치**: `apps/relay-server/src/realtime/recovery.py`

```
정상 상태 → 장애 감지 (heartbeat timeout / ws close / error)
  → 재연결 시도 (exponential backoff: 1s → 2s → 4s → max 30s)
    → 성공: Catch-up (Ring Buffer 미전송 → Whisper STT) → 정상 복귀
    → 10초 초과 or 5회 실패: Degraded Mode (Whisper batch STT)
```

**Recovery 설정**:

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| `recovery_max_attempts` | 5 | 최대 재시도 횟수 |
| `recovery_initial_backoff_s` | 1.0 | 초기 대기 시간 |
| `recovery_max_backoff_s` | 30.0 | 최대 대기 시간 |
| `recovery_timeout_s` | 10.0 | Degraded Mode 전환 임계 |
| `heartbeat_interval_s` | 5.0 | 상태 확인 주기 |
| `heartbeat_timeout_s` | 15.0 | 타임아웃 임계 |

### 5.4 Guardrail + Fallback LLM (구현 완료)

**위치**: `apps/relay-server/src/guardrail/`

| 파일 | 역할 |
|------|------|
| `checker.py` | Level 분류 (100자 단위 텍스트 델타 검사) |
| `filter.py` | 규칙 기반 필터 (반말, 욕설, 비격식 정규식) |
| `dictionary.py` | 금지어/교정 사전 + 필러 메시지 |
| `fallback_llm.py` | GPT-4o-mini 교정 호출 (2초 타임아웃) |

**Guardrail 3단계**:

| Level | 빈도 | 동작 | 지연 |
|-------|------|------|------|
| Level 1 | ~90% | 자동 PASS | 0ms |
| Level 2 | ~5-8% | TTS 전달 + 비동기 교정 로그 | 0ms |
| Level 3 | ~2-5% | TTS 차단 + 필러 재생 + 동기 교정 → 재TTS | ~500-800ms |

**핵심 메커니즘**: `modalities: ["text", "audio"]` 설정 시 텍스트 델타가 오디오보다 먼저 도착하므로, 오디오가 Twilio로 전달되기 전에 텍스트를 검사하여 차단할 수 있다.

---

## 6. Functional Requirements

| ID | Requirement | Priority | 구현 상태 |
|----|------------|----------|----------|
| FR-001 | OpenAI Realtime API Dual Session 관리 | P0 | ✅ 완료 |
| FR-002 | Twilio Outbound Call 발신 (REST API) | P0 | ✅ 완료 |
| FR-003 | Twilio Media Stream ↔ OpenAI 오디오 라우팅 | P0 | ✅ 완료 |
| FR-004 | Session A: User 음성 → 번역 → TTS → Twilio | P0 | ✅ 완료 |
| FR-005 | Session B: Twilio → STT → 번역 → App 자막 | P0 | ✅ 완료 |
| FR-006 | Client-side VAD (React Native) | P0 | ✅ 완료 |
| FR-007 | Push-to-Talk 모드 (Chat-to-Voice) | P0 | ✅ 완료 |
| FR-008 | 실시간 자막 UI (양방향) | P0 | ✅ 완료 |
| FR-009 | Ring Buffer (30초 오디오 보관) | P0 | ✅ 완료 |
| FR-010 | Session 장애 복구 (Recovery Flow) | P1 | ✅ 완료 |
| FR-011 | Guardrail Level 1-3 교정 | P1 | ✅ 완료 |
| FR-012 | Fallback LLM (GPT-4o-mini) | P1 | ✅ 완료 |
| FR-013 | Degraded Mode (Whisper batch STT) | P2 | ✅ 완료 |
| FR-014 | Function Calling (예약 확인, 장소 검색) | P1 | ✅ 완료 |
| FR-015 | 통화 트랜스크립트 저장 (transcript_bilingual) | P1 | ✅ 완료 |
| FR-016 | 통화 결과 자동 판정 (Tool Call 기반) | P1 | ✅ 완료 |
| FR-017 | Turn Overlap / Interrupt 처리 | P1 | ✅ 완료 |
| FR-018 | 최대 통화 시간 제한 (10분/8분 경고) | P1 | ✅ 완료 |
| FR-019 | Echo Gate (에코 피드백 루프 차단) | P0 | ✅ 완료 |
| FR-020 | CallManager 중앙 통화 관리 | P0 | ✅ 완료 |
| FR-021 | 2단계 자막 (원문 즉시 → 번역 후) | P1 | ✅ 완료 |
| FR-022 | 비용 토큰 추적 (cost_tokens) | P1 | ✅ 완료 |
| FR-023 | 접근성: 폰트 크기 조절, 진동 피드백, 48dp 터치 | P1 | ✅ 완료 |
| FR-024 | Twilio Status Callback 자동 정리 | P1 | ✅ 완료 |
| FR-025 | Supabase Auth JWT 인증 | P1 | ❌ 미구현 |
| FR-026 | CALL_IDLE_TIMEOUT_MS (30초 무발화 감지) | P2 | ❌ 미구현 |
| FR-027 | 고대비 모드 + 스크린 리더 호환 | P2 | ❌ 미구현 |
| FR-028 | 통화 기록 화면 (calls history) | P1 | ❌ 미구현 |
| FR-029 | 설정 화면 (settings) | P2 | ❌ 미구현 |
| FR-030 | 채팅 수집 화면 (Agent Mode 정보 수집) | P1 | ❌ 미구현 |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| User 발화 → 수신자 전달 (E2E) | < 1500ms (p95) | Client VAD onset → Twilio audio out |
| 수신자 발화 → User 자막 표시 | < 1000ms (p95) | Twilio audio in → App text render |
| Guardrail Level 3 교정 | < 800ms | Fallback LLM 호출 완료 |
| Session 장애 감지 | < 3초 | WebSocket error/close → recovery start |
| Session 복구 완료 | < 10초 | Recovery start → normal streaming |

### 7.2 Reliability

| Metric | Target |
|--------|--------|
| 통화 성공률 (전화 연결) | > 95% |
| 번역 정확도 (의미 보존) | > 90% |
| 존댓말 준수율 (Guardrail 포함) | > 95% |
| 오디오 누락률 (Ring Buffer 보장) | < 1% |

### 7.3 Call Duration Limits

| 파라미터 | 값 | 구현 상태 |
|---------|-----|----------|
| `max_call_duration_ms` | 600,000 (10분) | ✅ 구현 |
| `call_warning_ms` | 480,000 (8분) | ✅ 구현 |
| `CALL_IDLE_TIMEOUT_MS` | 30,000 (30초) | ❌ 미구현 |

### 7.4 Cost

| 항목 | 예상 비용 |
|------|----------|
| OpenAI Realtime (Session A) | ~$0.15/분 (Client VAD 적용) |
| OpenAI Realtime (Session B) | ~$0.20/분 (Server VAD) |
| Twilio 통화료 | ~$0.02/분 |
| Fallback LLM (Level 3) | ~$0.001/건 |
| **총 예상 비용** | **~$0.37/분** |

### 7.5 Security

- OpenAI API Key는 Relay Server에서만 사용 (앱에 노출 금지)
- 금지어 사전은 서버에서만 관리
- Supabase RLS로 본인 데이터만 접근
- ⚠️ **미구현**: Supabase Auth JWT 인증 미들웨어

### 7.6 Accessibility (접근성)

| 요구사항 | 구현 상태 |
|---------|----------|
| 자막 폰트 크기 조절 (14~28px) | ✅ FontScaleControl |
| 진동 피드백 (수신자 발화 시) | ✅ 구현 |
| Push-to-Talk 버튼 최소 48x48dp | ✅ 구현 |
| 고대비 모드 | ❌ 미구현 |
| 스크린 리더 (VoiceOver/TalkBack) | ❌ 미검증 |

---

## 8. Technical Design

### 8.1 System Prompt 설계 (실제 구현 기준)

#### Session A — Relay Mode

```
You are a real-time phone translator.
You translate the user's speech from {source_language} to {target_language}.

## Core Rules
1. Translate ONLY what the user says. Do NOT add your own words.
2. {politeness_rules}
3. Output ONLY the direct translation.
4. Adapt cultural expressions naturally.

## TURN-TAKING (CRITICAL)
- Translate the user's SINGLE utterance, then STOP IMMEDIATELY.
- NEVER add follow-up questions, greetings, comments after translating.
- NEVER generate speech on your own. Only translate when the user speaks.
- One input → One translation → STOP.
- After translating, stay COMPLETELY SILENT until the user speaks again.

## ABSOLUTE RESTRICTIONS
- You are a TRANSLATOR, not a conversationalist.
- Do NOT answer questions from the recipient on your own.
- If the recipient asks something, translate it to the user and STOP.
- NEVER speak unless you are translating the user's words.
```

#### Session A — Agent Mode

```
You are an AI phone assistant making a call on behalf of a user who cannot speak.

## Core Rules
1. Use polite {target_language} speech at all times.
2. Complete the task based on the collected information.
3. If unknown answer, say "잠시만요, 확인하고 말씀드릴게요" and wait.
4. Keep responses concise and natural.

## Collected Information
{collected_data}
```

#### Session B (모든 모드)

```
You are a real-time phone translator. Your ONLY job is to translate.
You translate the recipient's speech from {target_language} to {source_language}.

## ABSOLUTE RESTRICTIONS
- NEVER generate your own sentences or opinions.
- If you hear silence, noise, or unclear audio → produce NO output.
- If the audio sounds like machine-generated speech or echo → produce NO output.
- When in doubt, stay SILENT.
```

### 8.2 API Specification (실제 구현 기준)

#### `POST /relay/calls/start` — 전화 발신

**Request Body** (Python snake_case):
```json
{
  "call_id": "string (required)",
  "phone_number": "string (required, E.164 format: +821012345678)",
  "mode": "string (relay | agent, default: relay)",
  "source_language": "string (default: en)",
  "target_language": "string (default: ko)",
  "collected_data": "object (optional, Agent Mode)",
  "vad_mode": "string (client | server | push_to_talk, default: client)"
}
```

**Response 200**:
```json
{
  "call_id": "string",
  "call_sid": "string (Twilio Call SID)",
  "relay_ws_url": "string (ws://host/relay/calls/{id}/stream)",
  "session_ids": {
    "session_a": "string",
    "session_b": "string"
  }
}
```

**Error Responses**:

| Status | 조건 |
|--------|------|
| 400 | call_mode 미지원, phone_number 형식 오류 |
| 409 | call_id 중복 (이미 진행 중) |
| 502 | Twilio 발신 실패, OpenAI 세션 생성 실패 |

#### `POST /relay/calls/{call_id}/end` — 통화 종료

**Request Body**:
```json
{
  "call_id": "string",
  "reason": "string (default: user_hangup)"
}
```

#### `GET /health` — Health Check

**Response**:
```json
{
  "status": "ok",
  "active_sessions": 0,
  "version": "3.1.0"
}
```

### 8.3 WebSocket Protocol (실제 구현 기준)

#### Endpoint: `WS /relay/calls/{call_id}/stream`

**Client → Server**:

| type | data | 설명 |
|------|------|------|
| `audio_chunk` | `{ audio: base64 }` | User 오디오 (pcm16, Client VAD 시에만) |
| `vad_state` | `{ state: "committed" }` | Client VAD 발화 종료 |
| `text_input` | `{ text: string }` | User 텍스트 (Agent Mode / PTT) |
| `end_call` | `{}` | 통화 종료 요청 |

**Server → Client**:

| type | data | 설명 |
|------|------|------|
| `caption` | `{ role, text, direction }` | 기본 자막 |
| `caption.original` | `{ role, text, stage: 1, language, direction }` | 수신자 원문 자막 (즉시) |
| `caption.translated` | `{ role, text, stage: 2, language, direction }` | 수신자 번역 자막 |
| `recipient_audio` | `{ audio: base64 }` | 수신자 번역 음성 (pcm16) |
| `call_status` | `{ status, message? }` | 통화 상태 (waiting, warning, timeout, ended) |
| `interrupt_alert` | `{ type }` | 상대방 발화 알림 |
| `session.recovery` | `{ status, session, gap_ms, message }` | Session 복구 상태 |
| `guardrail.triggered` | `{ level, original, corrected? }` | Guardrail 이벤트 (디버그) |
| `error` | `{ message }` | 에러 |

### 8.4 Database Schema (실제 구현 기준)

```sql
-- calls 테이블 v3 필드
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_mode TEXT DEFAULT 'legacy';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'ko';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS target_language TEXT DEFAULT 'ko';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS session_a_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS session_b_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_bilingual JSONB DEFAULT '[]';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS vad_mode TEXT DEFAULT 'server';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS cost_tokens JSONB DEFAULT '{}';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS guardrail_events JSONB DEFAULT '[]';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recovery_events JSONB DEFAULT '[]';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_result TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_result_data JSONB DEFAULT '{}';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS auto_ended BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS function_call_logs JSONB DEFAULT '[]';
```

### 8.5 File Structure (실제 구현 기준)

```
wigvo/
├── apps/
│   ├── mobile/                              # React Native App (Expo)
│   │   ├── app/
│   │   │   ├── _layout.tsx                  # Root layout
│   │   │   ├── index.tsx                    # Entry (redirect)
│   │   │   ├── (auth)/
│   │   │   │   ├── _layout.tsx              # Auth layout
│   │   │   │   ├── login.tsx                # 로그인
│   │   │   │   └── signup.tsx               # 회원가입
│   │   │   └── (main)/
│   │   │       ├── _layout.tsx              # Main layout
│   │   │       ├── home.tsx                 # 홈 (통화 시작)
│   │   │       └── call.tsx                 # 실시간 통화 화면
│   │   ├── components/call/
│   │   │   ├── RealtimeCallView.tsx         # 통화 메인 뷰
│   │   │   ├── LiveCaptionPanel.tsx         # 실시간 자막 패널
│   │   │   ├── VadIndicator.tsx             # VAD 상태 표시
│   │   │   ├── PushToTalkInput.tsx          # Push-to-Talk 입력
│   │   │   ├── ModeSelector.tsx             # 모드 선택 (Voice/PTT)
│   │   │   ├── CallStatusOverlay.tsx        # Recovery 상태 오버레이
│   │   │   └── FontScaleControl.tsx         # 자막 폰트 크기 조절
│   │   ├── hooks/
│   │   │   ├── useRealtimeCall.ts           # 통화 관리 통합 훅
│   │   │   ├── useClientVad.ts              # Client-side VAD 훅
│   │   │   ├── useAudioRecorder.ts          # expo-av 오디오 녹음
│   │   │   ├── useAudioPlayback.ts          # 오디오 재생
│   │   │   └── useRelayWebSocket.ts         # Relay WS 연결 관리
│   │   ├── lib/
│   │   │   ├── vad/
│   │   │   │   ├── vad-config.ts            # VAD 파라미터
│   │   │   │   ├── vad-processor.ts         # VAD 상태 머신
│   │   │   │   └── audio-ring-buffer.ts     # Pre-speech Ring Buffer
│   │   │   ├── supabase.ts                  # Supabase client
│   │   │   ├── AuthContext.tsx              # 인증 context
│   │   │   ├── constants.ts                 # 상수
│   │   │   └── types.ts                     # 공유 타입
│   │   └── package.json
│   │
│   └── relay-server/                        # FastAPI Relay Server (Python)
│       ├── src/
│       │   ├── main.py                      # FastAPI 앱 엔트리 + 라우터 등록
│       │   ├── config.py                    # pydantic-settings 환경변수
│       │   ├── types.py                     # Pydantic 모델 (공유 타입)
│       │   ├── call_manager.py              # CallManager 싱글톤
│       │   ├── routes/
│       │   │   ├── calls.py                 # POST /relay/calls/start, /end
│       │   │   ├── stream.py                # WS /relay/calls/{id}/stream
│       │   │   ├── twilio_webhook.py        # POST /twilio/webhook/{id}
│       │   │   └── health.py                # GET /health
│       │   ├── realtime/
│       │   │   ├── session_manager.py       # RealtimeSession + DualSessionManager
│       │   │   ├── session_a.py             # Session A 이벤트 핸들러
│       │   │   ├── session_b.py             # Session B 이벤트 핸들러
│       │   │   ├── audio_router.py          # 중앙 오디오 라우터 + Echo Gate
│       │   │   ├── ring_buffer.py           # Ring Buffer (30초)
│       │   │   ├── recovery.py              # Session Recovery + Degraded Mode
│       │   │   ├── first_message.py         # AI 고지 + First Message
│       │   │   └── interrupt_handler.py     # Interrupt 우선순위 처리
│       │   ├── guardrail/
│       │   │   ├── checker.py               # Level 1-3 분류
│       │   │   ├── filter.py                # 규칙 기반 필터 (정규식)
│       │   │   ├── dictionary.py            # 금지어/교정 사전
│       │   │   └── fallback_llm.py          # GPT-4o-mini 교정
│       │   ├── twilio/
│       │   │   ├── outbound.py              # Twilio REST API 발신
│       │   │   └── media_stream.py          # Media Stream WS 핸들러
│       │   ├── prompt/
│       │   │   ├── generator_v3.py          # System Prompt 생성기
│       │   │   └── templates.py             # 언어별 프롬프트 템플릿
│       │   ├── tools/
│       │   │   ├── definitions.py           # Function Calling 도구 정의
│       │   │   └── executor.py              # 도구 실행기
│       │   └── db/
│       │       └── supabase_client.py       # Supabase async client
│       ├── migrations/
│       │   └── 001_v3_schema.sql            # DB 스키마
│       ├── tests/                           # 49개 테스트
│       ├── pyproject.toml                   # uv 의존성
│       └── static/
│           └── test.html                    # Web test console
│
├── docs/
│   ├── prd/
│   │   ├── 12_PRD_REALTIME_RELAY.md         # v3.2 PRD (이전)
│   │   ├── 13_PRD_ANALYSIS_REPORT.md        # 분석 보고서
│   │   └── 14_PRD_REALTIME_RELAY_v4.md      # v4 PRD (현재 문서)
│   └── todo_plan/
│       └── PLAN_realtime-relay.md           # Task Plan (65/65 완료)
│
└── CLAUDE.md                                # 프로젝트 컨벤션
```

---

## 9. Function Calling (Agent Mode)

### 9.1 도구 목록

Agent Mode에서 AI가 자율적으로 호출할 수 있는 함수:

| 함수 | 설명 | required 파라미터 |
|------|------|-----------------|
| `confirm_reservation` | 예약 확인 정보 기록 | `status` (confirmed/modified/cancelled/pending) |
| `search_location` | 장소/업체 정보 기록 | `place_name` |
| `collect_info` | 수집 정보 기록 | `info_type`, `value` |
| `end_call_judgment` | 통화 결과 판정 | `result` (success/partial_success/failed/callback_needed), `reason` |

### 9.2 Function Call 흐름

```
OpenAI Realtime → response.function_call_arguments.delta (스트리밍)
  → SessionAHandler._fc_arguments 버퍼에 누적
  → response.function_call_arguments.done (완료)
    → FunctionExecutor.execute()
    → session.send_function_call_output(call_id, output)
    → session.send response.create (다음 응답 요청)
```

---

## 10. Environment Variables

```env
# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# OpenAI
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview

# Supabase
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=

# Relay Server
RELAY_SERVER_URL=http://localhost:8000
RELAY_SERVER_PORT=8000
RELAY_SERVER_HOST=0.0.0.0

# Call Limits
MAX_CALL_DURATION_MS=600000
CALL_WARNING_MS=480000

# Feature Flag
CALL_MODE=realtime

# First Message
RECIPIENT_ANSWER_TIMEOUT_S=15
USER_SILENCE_TIMEOUT_S=10

# Recovery
RECOVERY_MAX_ATTEMPTS=5
RECOVERY_INITIAL_BACKOFF_S=1.0
RECOVERY_MAX_BACKOFF_S=30.0
RECOVERY_TIMEOUT_S=10.0
HEARTBEAT_INTERVAL_S=5.0
HEARTBEAT_TIMEOUT_S=15.0
RING_BUFFER_CAPACITY_SLOTS=1500

# Echo Gate
ECHO_GATE_COOLDOWN_S=1.0

# Guardrail
GUARDRAIL_ENABLED=true
GUARDRAIL_FALLBACK_MODEL=gpt-4o-mini
GUARDRAIL_FALLBACK_TIMEOUT_MS=2000
```

---

## 11. Test Coverage

**총 49개 테스트** (`apps/relay-server/tests/`):

| 카테고리 | 테스트 수 | 범위 |
|---------|----------|------|
| Config | 5+ | 환경변수, 설정 모델 |
| Types | 5+ | Pydantic 모델 유효성 |
| Prompt | 5+ | System Prompt 생성 |
| Session Manager | 5+ | Dual Session 연결/종료 |
| Audio Router | 5+ | 오디오 라우팅, Echo Gate |
| Guardrail | 5+ | Level 분류, 필터, Fallback |
| Recovery | 5+ | 장애 감지, 재연결, Degraded |
| Ring Buffer | 5+ | 순환 버퍼, gap 계산 |
| Function Calling | 5+ | 도구 정의, 실행 |
| CallManager | 5+ | 등록, cleanup, shutdown |

---

## 12. 미구현 항목 (Future Work)

### 12.1 즉시 필요 (P1)

| 항목 | 설명 | 예상 공수 |
|------|------|----------|
| **Supabase Auth JWT** | API 엔드포인트 인증 미들웨어 추가 | 반나절 |
| **채팅 수집 화면** | Agent Mode 전 정보 수집 UI (chat/[id].tsx) | 1일 |
| **통화 기록 화면** | 이전 통화 목록 + 상세 조회 | 1일 |

### 12.2 개선 필요 (P2)

| 항목 | 설명 |
|------|------|
| **CALL_IDLE_TIMEOUT_MS** | 양쪽 30초 무발화 시 "통화 종료할까요?" 확인 |
| **설정 화면** | 폰트 크기, VAD 감도, 언어 설정 |
| **고대비 모드** | 접근성 — 다크/라이트 + 고대비 |
| **스크린 리더** | VoiceOver/TalkBack 레이블 검증 |
| **Dockerfile** | 배포 인프라 구성 |

### 12.3 새 기능 (TBD)

> 사용자가 별도로 설명 예정

---

## 13. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 통화 성공률 | > 95% | 전화 연결 성공 / 전체 시도 |
| 번역 정확도 | > 90% | 사용자 피드백 기반 |
| 존댓말 준수율 | > 95% | Guardrail Level 3 발생률 < 5% |
| 평균 E2E 지연 | < 1.5초 | User 발화 → 수신자 도달 |
| 비용 효율 | < $0.40/분 | 월별 평균 통화 비용 |
| Recovery 성공률 | > 90% | 정상 복귀 / 전체 장애 발생 |
