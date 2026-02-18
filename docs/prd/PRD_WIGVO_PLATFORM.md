# WIGVO Platform PRD

> **Version**: 1.0
> **Created**: 2026-02-18
> **Status**: Draft
> **Based on**: Codebase analysis (commit fced4bd, main branch)

---

## 1. Overview

### 1.1 Problem Statement

매년 한국 체류 외국인 220만 명, 재외 한국인 280만 명, 청각/언어 장애인 39만 명, 콜포비아 Gen-Z ~400만 명이 **전화 통화**라는 장벽에 직면합니다.

기존 번역 앱(Google, Papago)은 **일방향 텍스트** 번역만 처리합니다. 실제 전화선 위에서 **양방향 실시간 음성 번역**을 제공하는 제품은 존재하지 않습니다. 수신자 측에 앱 설치를 요구하지 않고, 일반 전화를 통해 AI가 실시간으로 번역하는 서비스가 필요합니다.

### 1.2 Product Definition

WIGVO는 **AI 실시간 전화 통역 & 중계 플랫폼**입니다.

1. 사용자가 AI 챗봇과 대화하며 통화 목적/정보를 수집
2. 수집된 정보를 기반으로 수신자에게 실제 전화 발신
3. 통화 중 양방향 실시간 음성 번역 (OpenAI Realtime API + Twilio)
4. 수신자는 앱 설치 없이 일반 전화를 받기만 하면 됨

### 1.3 Goals

- G1: 언어 장벽 없는 전화 통화 (번역 지연 < 1초)
- G2: 수신자 측 제로 설치 (일반 전화 수신)
- G3: 다양한 사용자 접근성 지원 (음성, 텍스트, 혼합)
- G4: 통화 품질 보장 (에코 제거, 가드레일, 세션 복구)
- G5: 비용 효율적 운영 (클라이언트 VAD, 토큰 추적)

### 1.4 Non-Goals (Out of Scope)

- 동시 3인 이상 다자간 통화
- 오프라인 번역 (온라인 연결 필수)
- SMS/MMS 번역
- 수신자 측 앱 설치 요구
- 자체 STT/TTS 모델 훈련

### 1.5 Scope

| 포함 | 제외 |
|------|------|
| Web App (Next.js) | iOS/Android 네이티브 앱 (React Native는 존재하나 Web 우선) |
| Relay Server (FastAPI) | 자체 AI 모델 |
| Twilio 전화 발신 | 수신자→사용자 역방향 발신 |
| OpenAI Realtime API | 자체 음성 인프라 |
| Supabase DB/Auth | 자체 인증 시스템 |
| 한국어 ↔ 영어 (주력) | 50개 이상 언어 동시 지원 |
| Google Cloud Run 배포 | 온프레미스 배포 |

---

## 2. User Personas & Stories

### 2.1 Persona A: 재한 외국인 (Primary)

**프로필**: 한국 거주 영어 사용자, 한국어 초급
**Pain Point**: 식당 예약, 병원 예약, 배달 주문 시 전화 불가

```
As a foreign resident in Korea,
I want to make phone calls in my language and have them translated in real-time,
so that I can independently handle daily tasks like restaurant reservations.
```

### 2.2 Persona B: 청각 장애인

**프로필**: 한국인, 청각 장애 등급 보유
**Pain Point**: 음성 전화 사용 불가, 텍스트 기반 커뮤니케이션 필요

```
As a hearing-impaired user,
I want to type messages that AI speaks on my behalf during a phone call,
so that I can communicate with businesses without hearing.
```

### 2.3 Persona C: 콜포비아 (Gen-Z)

**프로필**: 20-30대 한국인, 전화 공포증
**Pain Point**: 전화 자체를 회피, AI가 대신 통화해주길 원함

```
As someone with phone anxiety,
I want AI to make the entire call on my behalf with the information I provide,
so that I never have to speak on the phone myself.
```

### 2.4 Acceptance Criteria (Gherkin)

```gherkin
Scenario: 외국인이 식당 예약 전화를 한다
  Given 사용자가 로그인하고 "식당 예약" 시나리오를 선택했다
  And AI 챗봇에게 날짜, 인원, 식당명을 알려줬다
  And 네이버 장소 검색으로 전화번호가 확인되었다
  When 사용자가 "전화 걸기"를 클릭한다
  Then Twilio를 통해 식당에 실제 전화가 발신된다
  And 사용자 음성이 한국어로 번역되어 수신자에게 전달된다
  And 수신자 음성이 영어로 번역되어 사용자에게 전달된다
  And 양방향 자막이 실시간으로 표시된다

Scenario: 청각 장애인이 텍스트로 통화한다
  Given 사용자가 Agent 모드로 통화를 시작했다
  When 사용자가 텍스트 메시지를 입력한다
  Then AI가 텍스트를 음성으로 변환하여 수신자에게 전달한다
  And 수신자의 응답이 텍스트 자막으로 사용자에게 표시된다

Scenario: 콜포비아 사용자가 AI에게 통화를 맡긴다
  Given 사용자가 Agent 모드를 선택하고 예약 정보를 제공했다
  When 통화가 시작된다
  Then AI가 수집된 정보를 기반으로 자율적으로 대화를 진행한다
  And 사용자는 실시간 자막으로 통화 진행 상황을 모니터링한다
  And AI가 예약 확인/변경/취소 결과를 function calling으로 기록한다
```

---

## 3. System Architecture

### 3.1 Overview

```
┌──────────────────┐         ┌───────────────────────────────┐         ┌──────────────────┐
│                  │         │                               │         │                  │
│   Next.js Web    │◄──WS──►│       Relay Server            │◄──WS──►│  OpenAI Realtime  │
│   (Chat + Call   │         │       (FastAPI)               │         │  API (GPT-4o)    │
│    Monitor)      │         │                               │         │                  │
│                  │         │  ┌───────────┐ ┌───────────┐  │         └──────────────────┘
└──────────────────┘         │  │ Session A │ │ Session B │  │
                             │  │ User→수신자│ │ 수신자→User│  │         ┌──────────────────┐
                             │  └───────────┘ └───────────┘  │◄──WS──►│  Twilio Media    │
                             │                               │         │  Streams         │
                             │  ┌───────────┐ ┌───────────┐  │         │  (전화 브릿지)    │
                             │  │ Echo Gate │ │ Guardrail │  │         └──────────────────┘
                             │  └───────────┘ └───────────┘  │
                             │                               │
                             └───────────────┬───────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │    Supabase     │
                                    │  PostgreSQL +   │
                                    │  Auth + RLS     │
                                    └─────────────────┘
```

### 3.2 Dual Session Architecture (Core Design Decision)

단일 번역 세션은 양방향 대화를 처리할 수 없습니다 (번역 방향 혼동). WIGVO는 **두 개의 OpenAI Realtime 세션을 동시에** 운영합니다:

| Session | Direction | Input Format | Output Format | VAD Mode |
|---------|-----------|-------------|---------------|----------|
| **Session A** | User → 수신자 | pcm16 16kHz (App) | g711_ulaw (Twilio) | Client/Server (configurable) |
| **Session B** | 수신자 → User | g711_ulaw 8kHz (Twilio) | pcm16 16kHz (App) | Always Server VAD |

Session B는 항상 Server VAD를 사용합니다 (수신자 측 클라이언트 제어 불가).

### 3.3 Call Modes

| Mode | Description | User Role | AI Role | UI |
|------|-------------|-----------|---------|-----|
| **Relay** | 실시간 번역기 | 직접 발화 | 번역만 수행, 자체 판단 금지 | AudioControls (마이크/볼륨) |
| **Agent** | AI 자율 통화 | 정보 제공 + 모니터링 | 수집된 정보 기반 자율 대화 | TextInput (채팅 입력) |

### 3.4 Interrupt Priority (M-1)

```
Priority 1 (최고): 수신자 발화 — 수신자를 기다리게 하면 안 됨
Priority 2:        사용자 발화
Priority 3 (최저): AI 생성 — 언제든 중단 가능
```

수신자가 말하기 시작하면:
1. Session A 응답 취소 (response.cancel)
2. Twilio 버퍼 클리어 (send_clear)
3. App에 interrupt_alert 전송

---

## 4. Component Specifications

### 4.1 Web App (Next.js 16)

#### 4.1.1 Pages & Routing

| Route | Component | Description | Status |
|-------|-----------|-------------|--------|
| `/` | DashboardLayout | 메인 허브 (채팅 + 지도 + 통화 패널) | IMPLEMENTED |
| `/login` | LoginForm | 이메일/OAuth 로그인 | IMPLEMENTED |
| `/call/[callId]` | RealtimeCallView | 실시간 통화 화면 | IMPLEMENTED |
| `/calling/[id]` | CallingPanel | 통화 연결 대기 (폴링) | IMPLEMENTED |
| `/result/[id]` | ResultCard | 통화 결과 요약 | IMPLEMENTED |
| `/history` | HistoryList | 통화 이력 | IMPLEMENTED |

#### 4.1.2 Chat Flow (AI Information Collection) — v5: Mode-First

```
1. Communication Mode Selection (v5 — 가장 먼저!)
   ├── voice_to_voice: 양방향 음성 번역 (Relay)
   ├── text_to_voice: 텍스트→음성 (Relay)
   ├── voice_to_text: 음성→자막 (Relay)
   └── full_agent: AI 자율 통화 (Agent)
         ↓
2. Scenario Selection
   ├── RESERVATION (식당, 미용실, 병원, 숙소, 기타)
   ├── INQUIRY (영업시간, 가격, 위치, 서비스, 기타)
   └── AS_REQUEST (수리, 교환, 환불, A/S접수, 기타)
         ↓
3. AI Chat (gpt-4o-mini + Function Calling)
   ├── 모드별 수집 깊이 분기:
   │   ├── Relay 모드: target_name + target_phone만 수집
   │   └── Agent 모드: 시나리오별 전체 필수 필드 수집
   ├── search_place() → 네이버 장소 검색 API
   ├── Smart Place Matching (번호/이름/AI 응답 매칭)
   └── 지도 실시간 업데이트
         ↓
4. Collection Summary (모드별 is_complete 검증)
   ├── 모드 배지 표시 (CallModeSelector 제거)
   ├── Relay: target_name + target_phone 충족 시 READY
   ├── Agent: 시나리오별 필수 필드 전체 충족 시 READY
   └── 편집/확인 UI
         ↓
5. Call Initiation (저장된 communicationMode 자동 전달)
```

**모드 선택을 먼저 하는 이유:**
- Relay 모드 사용자(외국인, 장애인)는 전화번호만 알면 바로 통화 가능 — 불필요한 상세 정보 질문 제거
- Agent 모드 사용자(콜포비아)는 AI가 대화하므로 모든 정보가 사전에 필요
- 모드에 따라 AI 챗봇의 질문 깊이/인사말이 자동 조절

#### 4.1.3 Call Flow (Realtime Communication)

```
1. POST /api/calls (Call record 생성)
         ↓
2. POST /api/calls/[id]/start
   ├── system_prompt_override 생성 (Agent mode)
   ├── Relay Server HTTP API 호출
   └── relay_ws_url + call_sid 반환
         ↓
3. WebSocket 연결 (App ↔ Relay Server)
   ├── Relay Mode: Client VAD + Audio Recording
   ├── Agent Mode: Text Input + Live Captions
   └── 공통: Live Captions + Call Duration Timer
         ↓
4. Call End → ResultCard
```

#### 4.1.4 State Management

| Store | Type | Purpose |
|-------|------|---------|
| `useDashboard` | Zustand | Sidebar, 지도, 검색결과, 활성 대화, 통화 ID |
| `useChat` | React State | 메시지, 수집 데이터, 대화 ID, 시나리오 |
| `useRelayCall` | React Hook | WebSocket, VAD, 자막, 오디오 플레이어 |
| LocalStorage | Persistent | 마지막 대화 ID (자동 복원) |

### 4.2 Relay Server (FastAPI)

#### 4.2.1 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/relay/calls/start` | 통화 시작 (Twilio 발신 + OpenAI 세션 생성) | API Key |
| POST | `/relay/calls/{id}/end` | 통화 종료 | API Key |
| WS | `/relay/calls/{id}/stream` | App ↔ Relay 실시간 스트림 | WS Auth |
| WS | `/twilio/webhook/{id}` | Twilio TwiML 응답 | Twilio |
| WS | `/twilio/media-stream/{id}` | Twilio Media Stream | Twilio |
| POST | `/twilio/status-callback/{id}` | Twilio 상태 콜백 | Twilio |
| GET | `/health` | 헬스 체크 | None |

#### 4.2.2 Core Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| **AudioRouter** | `src/realtime/audio_router.py` | 중앙 오디오 오케스트레이터 |
| **DualSessionManager** | `src/realtime/session_manager.py` | OpenAI 이중 세션 관리 |
| **SessionAHandler** | `src/realtime/session_a.py` | User→수신자 번역 + 가드레일 |
| **SessionBHandler** | `src/realtime/session_b.py` | 수신자→User 번역 + 2-Stage 자막 |
| **CallManager** | `src/call_manager.py` | 싱글톤 통화 라이프사이클 관리 |
| **Echo Gate v2** | `src/realtime/audio_router.py` | 에코 피드백 루프 방지 |
| **GuardrailChecker** | `src/guardrail/checker.py` | 3레벨 번역 품질 보장 |
| **SessionRecoveryManager** | `src/realtime/recovery.py` | 세션 복구 + Degraded 모드 |
| **RingBuffer** | `src/realtime/ring_buffer.py` | 30초 순환 오디오 버퍼 |
| **PromptGenerator** | `src/prompt/generator_v3.py` | 모드별 프롬프트 생성 |
| **FunctionExecutor** | `src/tools/executor.py` | Agent 모드 함수 실행 |
| **InterruptHandler** | `src/realtime/interrupt_handler.py` | 턴 오버랩 방지 |
| **ContextManager** | `src/realtime/context_manager.py` | 6턴 슬라이딩 윈도우 컨텍스트 |
| **FirstMessageHandler** | `src/realtime/first_message.py` | AI 인사말 처리 |

#### 4.2.3 WebSocket Message Protocol

**App → Relay:**

| Type | Data | Description |
|------|------|-------------|
| `audio_chunk` | `{audio: base64_pcm16}` | 사용자 음성 |
| `text_input` | `{text: string}` | 사용자 텍스트 (Agent) |
| `vad_state` | `{state: "committed"}` | Client VAD 발화 완료 |
| `end_call` | `{}` | 통화 종료 요청 |

**Relay → App:**

| Type | Data | Description |
|------|------|-------------|
| `caption` | `{role, text, direction}` | 기본 자막 |
| `caption.original` | `{role, text, stage:1, language}` | Stage 1: 원문 (즉시) |
| `caption.translated` | `{role, text, stage:2, language}` | Stage 2: 번역 (~0.5s) |
| `recipient_audio` | `{audio: base64_pcm16}` | 수신자 음성 |
| `call_status` | `{status, message?, result?}` | 통화 상태 변경 |
| `interrupt_alert` | `{speaking: "recipient"}` | 수신자 발화 감지 |
| `session.recovery` | `{type, detail}` | 세션 복구 이벤트 |
| `guardrail.triggered` | `{level, original, corrected?}` | 가드레일 발동 |
| `translation.state` | `{state: "processing"\|"done"}` | 번역 진행 상태 |
| `error` | `{message: string}` | 에러 |

### 4.3 Key Technical Innovations

#### 4.3.1 Echo Gate v2

Session A가 번역된 음성을 Twilio로 보내면, 그 음성이 Session B 마이크로 에코됩니다. 무한 번역 루프 방지:

```
                      ┌─────── TTS 재생 중 ────────┐
                      │                            │
입력 (수신자 음성):    │  항상 활성                  │  ← 실제 발화를 놓치지 않음
출력 (사용자에게):     │  억제 → 큐에 저장           │  ← 에코 전달 차단
                      │                            │
                      └───── 쿨다운 (300ms) ────────┘
                                    │
                              큐에 쌓인 출력 배출
```

- **원리**: Output-only gating. 입력은 항상 수신, 출력만 억제
- **즉시 해제**: 수신자가 TTS 중에 말하면 즉시 억제 해제
- **대기열**: 억제 중 축적된 출력은 쿨다운 후 일괄 전송

#### 4.3.2 Guardrail System (3-Level)

| Level | Trigger | Action | Latency |
|-------|---------|--------|---------|
| **L1** (PASS) | 정상 번역 | 통과 | **0ms** |
| **L2** (SUSPECT) | 반말 감지 | TTS 전송 + 백그라운드 교정 로깅 | **0ms** |
| **L3** (BLOCKED) | 욕설/유해 콘텐츠 | TTS 차단 + 필러 음성 + GPT-4o-mini 동기 교정 | **~800ms** |

- Text delta 100자 단위 실시간 검사
- Full text 최종 검사 (response.audio_transcript.done)
- Level은 에스컬레이션만 가능 (1→2→3, 역방향 불가)

#### 4.3.3 Session Recovery & Degraded Mode

```
세션 끊김 감지 (heartbeat timeout 45s)
         ↓
복구 시도 (exponential backoff: 1s → 2s → 4s → 8s, max 30s)
         ↓
Ring Buffer에서 미전송 오디오 추출
         ↓
Whisper Batch STT → 컨텍스트 재주입
         ↓
┌────────────────────────────────────────┐
│ 10초 이내 복구 성공 → 정상 모드 복귀   │
│ 10초 초과 실패 → Degraded 모드 진입    │
│   - Whisper STT + GPT-4o-mini 번역    │
│   - 텍스트 자막만, TTS 없음            │
└────────────────────────────────────────┘
```

#### 4.3.4 2-Stage Captions

수신자 발화에 대해 두 단계 자막:

| Stage | Event | Content | Latency |
|-------|-------|---------|---------|
| Stage 1 | `conversation.item.input_audio_transcription.completed` | 원문 (수신자 언어) | 즉시 |
| Stage 2 | `response.audio_transcript.done` | 번역문 (사용자 언어) | ~0.5s |

#### 4.3.5 Context Injection

- 슬라이딩 윈도우: 최근 6턴
- 턴당 최대 100자 (초과 시 truncate)
- ~200 토큰, 비용 무시 가능
- `conversation.item.create`로 주입 (session.update 대비 세션 상태 보존)

#### 4.3.6 Call Duration Limits

| Threshold | Action |
|-----------|--------|
| 8분 (480s) | Warning 메시지 전송 |
| 10분 (600s) | Auto-end + timeout 상태 |

### 4.4 Database Schema

#### 4.4.1 Tables

**conversations**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | 대화 ID |
| user_id | uuid (FK → auth.users) | 사용자 ID |
| status | text | null → COLLECTING → READY → CALLING → COMPLETED/CANCELLED |
| scenario_type | text | RESERVATION / INQUIRY / AS_REQUEST |
| scenario_subtype | text | RESTAURANT / SALON / HOSPITAL / etc. |
| target_name | text | 수신자 이름 |
| target_phone | text | 수신자 전화번호 |
| collected_data | jsonb | 수집된 정보 (date, party_size, etc.) |
| is_complete | boolean | 수집 완료 여부 |
| created_at | timestamptz | 생성 시간 |
| updated_at | timestamptz | 수정 시간 |

**messages**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | 메시지 ID |
| conversation_id | uuid (FK → conversations) | 대화 ID |
| role | text | user / assistant |
| content | text | 메시지 내용 |
| metadata | jsonb | 부가 데이터 (place search results 등) |
| created_at | timestamptz | 생성 시간 |

**calls**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | 통화 ID (= call_id) |
| conversation_id | uuid (FK → conversations) | 대화 ID |
| user_id | uuid (FK → auth.users) | 사용자 ID |
| status | text | PENDING → CALLING → IN_PROGRESS → COMPLETED/FAILED |
| call_mode | text | relay / agent |
| source_language | text | 사용자 언어 |
| target_language | text | 수신자 언어 |
| vad_mode | text | client / server / push_to_talk |
| target_name | text | 수신자 이름 |
| target_phone | text | 수신자 전화번호 |
| twilio_call_sid | text | Twilio Call SID |
| session_a_id | text | OpenAI Session A ID |
| session_b_id | text | OpenAI Session B ID |
| transcript_bilingual | jsonb | 양방향 번역 트랜스크립트 |
| cost_tokens | jsonb | 토큰 사용량 {audio_input, audio_output, text_input, text_output} |
| guardrail_events | jsonb | 가드레일 발동 이력 |
| recovery_events | jsonb | 세션 복구 이력 |
| call_result | text | success / partial_success / failed / callback_needed |
| call_result_data | jsonb | {result, reason, summary, collected_data} |
| auto_ended | boolean | 시간 초과 자동 종료 여부 |
| function_call_logs | jsonb | Agent 모드 함수 호출 이력 |
| duration_s | integer | 통화 시간 (초) |
| started_at | timestamptz | 통화 시작 시간 |
| ended_at | timestamptz | 통화 종료 시간 |
| created_at | timestamptz | 생성 시간 |

**extracted_entities**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | 엔티티 ID |
| conversation_id | uuid (FK) | 대화 ID |
| entity_type | text | date / phone / party_size / etc. |
| entity_value | text | 추출된 값 |
| source_message_id | uuid (FK) | 출처 메시지 ID |
| confidence | float | 추출 신뢰도 |
| created_at | timestamptz | 생성 시간 |

**place_search_cache**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | 캐시 ID |
| query_hash | text (UNIQUE) | 검색어 해시 (djb2) |
| query_text | text | 원본 검색어 |
| results | jsonb | 네이버 장소 검색 결과 |
| expires_at | timestamptz | 만료 시간 (기본 7일) |
| created_at | timestamptz | 생성 시간 |

**Indexes:**
- `idx_calls_call_mode ON calls (call_mode)`
- `idx_calls_created_at ON calls (created_at DESC)`

### 4.5 Function Calling (Agent Mode)

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `confirm_reservation` | reservation_id, date, time, name, details, status | 예약 확인/변경/취소 기록 |
| `search_location` | place_name, address, phone, hours, notes | 장소 정보 기록 |
| `collect_info` | info_type (name/phone/address/...), value, context | 정보 수집 기록 |
| `end_call_judgment` | result (success/partial/failed/callback), reason, summary | 통화 결과 판정 |

### 4.6 Prompt System

**Session A (Relay Mode):**
- TRANSLATOR 역할, 자체 판단 금지
- 언어쌍별 존댓말 규칙
- 문화 적응 규칙
- 첫 인사말 처리 (AI greeting)

**Session A (Agent Mode):**
- AUTONOMOUS AGENT 역할
- 수집된 데이터 기반 자율 대화
- Function calling 활성화
- 통화 결과 판정

**Session B (공통):**
- TRANSLATOR 역할
- 수신자 발화 → 사용자 언어 번역
- 문화 용어 설명
- `input_audio_transcription` 활성화 (2-Stage 자막)

---

## 5. Implementation Verification

### 5.1 Implemented (Verified)

| Feature | Location | Tests | Notes |
|---------|----------|-------|-------|
| Dual Session | `session_manager.py` | Yes | A/B 분리 정상 |
| Echo Gate v2 | `audio_router.py` | 12 tests | Output suppression 정상 |
| Guardrail 3-Level | `guardrail/` | Yes | L1/L2/L3 분류 정상 |
| Session Recovery | `recovery.py` | Yes | Framework 완성, 실전 미검증 |
| Ring Buffer | `ring_buffer.py` | Yes | 30s 순환 버퍼 정상 |
| Function Calling | `tools/` | Yes | 4개 도구 정상 |
| Call Manager | `call_manager.py` | Yes | Idempotent cleanup 정상 |
| Context Manager | `context_manager.py` | Yes | 6턴 윈도우 정상 |
| 2-Stage Captions | `session_b.py` | - | 코드 완성 |
| Interrupt Handler | `interrupt_handler.py` | - | 코드 완성 |
| First Message | `first_message.py` | - | 코드 완성 |
| Call Duration Limit | `audio_router.py` | - | 8min warn, 10min auto-end |
| Cost Token Tracking | `session_a/b.py` | - | response.done에서 추적 |
| Bilateral Transcript | `session_a/b.py` | - | 양방향 기록 |
| AI Chat | `app/api/chat/` | - | gpt-4o-mini + tool calling |
| Scenario Selection | `ScenarioSelector.tsx` | - | 3-tier 선택 |
| Place Search | `naver-maps.ts` | - | 네이버 API + 캐시 |
| Map Integration | `NaverMapContainer.tsx` | - | 실시간 업데이트 |
| Call Polling | `useCallPolling.ts` | - | 3초 간격 |
| Client VAD (Web) | `useClientVad.ts` | - | 임계값 기반 |
| Audio I/O (Web) | `lib/audio/` | - | PCM16 녹음, G711 재생 |
| i18n | `i18n.ts` | - | en/ko 지원 |
| DB Persistence | `supabase_client.py` | - | Upsert + field update |
| Twilio Integration | `twilio/` | - | 발신 + Media Stream |
| Docker + GCR | `Dockerfile`, `cloudbuild.yaml` | - | 양쪽 모두 |

**Total Tests: 74 passing** (relay-server 49 pytest + scripts/tests/ 25 component/integration)

### 5.2 Gaps: Designed but Not Implemented

| Gap ID | Feature | Description | Impact | Priority |
|--------|---------|-------------|--------|----------|
| ~~**GAP-1**~~ | ~~CallMode 선택 UI~~ | **RESOLVED**: v5 Mode-First UX — ScenarioSelector 3-screen wizard (mode → scenario → subtype). communicationMode가 전체 체인에 전달됨 | ~~사용자가 Relay 모드 사용 불가~~ | ~~**P0**~~ |
| ~~**GAP-2**~~ | ~~접근성 모드 분기~~ | **RESOLVED**: 4가지 모드 (V2V, T2V, V2T, Agent) 선택 UI + 모드별 수집 깊이 분기 + 모드별 프롬프트/인사말 | ~~청각/언어 장애인 지원 불가~~ | ~~**P0**~~ |
| **GAP-3** | OAuth 로그인 | 버튼 존재, 미설정 | Social login 불가 | P1 |
| **GAP-4** | CORS 제한 | Wildcard allow_origins | 프로덕션 보안 취약 | P1 |
| **GAP-5** | Rate Limiting | 미구현 | API 남용 가능 | P1 |
| **GAP-6** | Pre-recorded Filler | TODO 코멘트만 존재 | L3 가드레일 시 지연 | P2 |
| **GAP-7** | Admin Dashboard | 없음 | 운영 모니터링 불가 | P2 |
| **GAP-8** | Recovery 실전 검증 | Framework만 완성 | 실제 끊김 시 미검증 | P2 |
| **GAP-9** | Mobile App 통합 | React Native 코드 존재, Web과 미연동 | Mobile 앱 사용 불가 | P3 |

### 5.3 Design Intent Verification

| Original Intent | Implementation | Verdict |
|----------------|----------------|---------|
| 이중 세션 (A/B) | Session A + B 분리 운영 | MATCH |
| Echo Gate | Output-only suppression + cooldown | MATCH |
| Relay/Agent 모드 | v5: 모드 선택 UI + 체인 전달 완료 | **MATCH** |
| 접근성 4개 모드 | v5: V2V, T2V, V2T, Agent 4모드 선택 가능 | **MATCH** |
| 가드레일 3레벨 | L1/L2/L3 전체 구현 | MATCH |
| 세션 복구 | Framework 완성, 실전 미검증 | PARTIAL (GAP-8) |
| 링 버퍼 30초 | 1500 slots @ 20ms | MATCH |
| Function Calling | 4개 도구 구현 | MATCH |
| 인터럽트 우선순위 | 수신자 > User > AI | MATCH |
| 통화 시간 제한 | 8min warn, 10min end | MATCH |
| 비용 추적 | response.done 토큰 추적 | MATCH |
| 2-Stage 자막 | 원문(즉시) + 번역(~0.5s) | MATCH |

---

## 6. Functional Requirements

### 6.1 Must Have (P0)

| ID | Requirement | Status | Gap |
|----|------------|--------|-----|
| FR-001 | AI 채팅으로 통화 정보 수집 (시나리오 기반) | DONE | - |
| FR-002 | 네이버 장소 검색 + 지도 연동 | DONE | - |
| FR-003 | Twilio 전화 발신 + OpenAI Realtime 세션 생성 | DONE | - |
| FR-004 | 이중 세션 양방향 번역 (Session A + B) | DONE | - |
| FR-005 | Echo Gate v2 에코 루프 방지 | DONE | - |
| FR-006 | 실시간 자막 (2-Stage) | DONE | - |
| FR-007 | Agent 모드 자율 통화 + Function Calling | DONE | - |
| FR-008 | CallMode 선택 UI 노출 | **DONE** (v5) | ~~GAP-1~~ |
| FR-009 | 접근성 모드 선택 (V2V, T2V, V2T, Agent) | **DONE** (v5) | ~~GAP-2~~ |
| FR-010 | 통화 결과 저장 + 이력 조회 | DONE | - |

### 6.2 Should Have (P1)

| ID | Requirement | Status | Gap |
|----|------------|--------|-----|
| FR-011 | 가드레일 3-Level 번역 품질 보장 | DONE | - |
| FR-012 | 인터럽트 우선순위 (수신자 > User > AI) | DONE | - |
| FR-013 | 통화 시간 제한 (10분) + 경고 (8분) | DONE | - |
| FR-014 | Client VAD (Web Audio API) | DONE | - |
| FR-015 | OAuth 소셜 로그인 (Google, Kakao) | TODO | GAP-3 |
| FR-016 | CORS 도메인 제한 (프로덕션) | TODO | GAP-4 |
| FR-017 | API Rate Limiting | TODO | GAP-5 |

### 6.3 Could Have (P2)

| ID | Requirement | Status | Gap |
|----|------------|--------|-----|
| FR-018 | Pre-recorded 필러 오디오 (L3 가드레일) | TODO | GAP-6 |
| FR-019 | 관리자 대시보드 (통화 통계, 비용) | TODO | GAP-7 |
| FR-020 | 세션 복구 실전 검증 + 모니터링 | TODO | GAP-8 |
| FR-021 | 비용 추적 대시보드 (사용자별) | TODO | - |
| FR-022 | 다국어 확장 (ja, zh, vi) | TODO | - |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target | Current |
|--------|--------|---------|
| 번역 지연 (User → 수신자) | < 1,000ms | ~800ms (OpenAI RTT) |
| 번역 지연 (수신자 → User) | < 1,500ms | ~1,200ms (2-stage) |
| Echo Gate 쿨다운 | 300ms | 300ms (configurable) |
| Guardrail L3 교정 | < 2,000ms | ~800ms (gpt-4o-mini) |
| WebSocket 재연결 | < 5 attempts | 5 (exponential backoff) |
| 세션 복구 timeout | 10s | 10s (then degraded) |
| 통화 최대 시간 | 10분 | 10분 (auto-end) |

### 7.2 Scalability

| Metric | Target |
|--------|--------|
| 동시 통화 수 (per instance) | ~50 (WebSocket 메모리 제한) |
| Cloud Run auto-scaling | 0-N instances |
| DB connections | Supabase pooling |

### 7.3 Security

| Area | Status | Notes |
|------|--------|-------|
| Authentication | Supabase Auth (email) | OAuth 미설정 |
| API Key validation | Relay Server | - |
| E.164 phone validation | Pydantic validator | - |
| CORS | **Wildcard** (GAP-4) | 프로덕션 제한 필요 |
| Rate Limiting | **None** (GAP-5) | 구현 필요 |
| Secrets | .env only | KMS/Vault 미사용 |
| Input sanitization | Minimal | Pydantic 기본 |

### 7.4 Reliability

| Area | Implementation |
|------|----------------|
| Graceful shutdown | CallManager.shutdown_all() |
| Idempotent cleanup | asyncio.Lock per call_id |
| Multiple cleanup triggers | WS disconnect, Twilio callback, manual end, server shutdown |
| Session recovery | Exponential backoff + degraded mode |
| Ring buffer | 30s audio preservation |

---

## 8. Implementation Phases (Forward Plan)

### Phase 1: CallMode & Accessibility (GAP-1, GAP-2) — P0

- [ ] CallModeSelector UI를 통화 시작 플로우에 통합
- [ ] 대화 수집 완료 → 모드 선택 → 통화 시작 흐름 구현
- [ ] 4개 통화 모드 정의 및 UI 분기:
  - Voice → Voice (Relay): 일반 양방향 음성 번역
  - Text → Voice (Agent + TTS): 텍스트 입력, AI 음성 출력
  - Voice → Text (Relay + 자막 only): 음성 입력, 자막만 출력
  - Full Agent: AI 자율 통화
- [ ] call_mode를 DB에 저장 (calls.call_mode 컬럼 활용)
- [ ] 모드별 RealtimeCallView UI 분기 검증

**Deliverable**: 사용자가 통화 모드를 선택할 수 있고, 모드별 적절한 UI가 표시됨

### Phase 2: Production Hardening (GAP-3, GAP-4, GAP-5) — P1

- [ ] CORS 도메인 제한 (wigvo.run, localhost)
- [ ] API Rate Limiting (FastAPI middleware)
- [ ] OAuth 설정 (Google, Kakao)
- [ ] Error boundary + fallback UI
- [ ] Logging 강화 (structured logging)

**Deliverable**: 프로덕션 보안 기준 충족

### Phase 3: Quality & Monitoring (GAP-6, GAP-7, GAP-8) — P2

- [ ] Pre-recorded filler audio (L3 가드레일 지연 감소)
- [ ] 세션 복구 통합 테스트 (인위적 끊김 시뮬레이션)
- [ ] 관리자 대시보드 (통화 통계, 비용 추적, 에러율)
- [ ] 사용자별 사용량 대시보드

**Deliverable**: 운영 가시성 확보, 품질 개선

---

## 9. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Web App** | Next.js | 16 | SSR, API Routes |
| | React | 19 | UI Components |
| | TypeScript | 5.x | Type Safety |
| | Tailwind CSS | 4.x | Styling |
| | shadcn/ui | latest | UI Component Library |
| | Zustand | latest | Global State |
| | next-intl | latest | i18n (en/ko) |
| **Relay Server** | Python | 3.12+ | Runtime |
| | FastAPI | latest | Web Framework |
| | uvicorn | latest | ASGI Server |
| | websockets | latest | WebSocket Client |
| | Pydantic | v2 | Data Validation |
| **AI** | OpenAI Realtime API | GPT-4o | STT + Translation + TTS |
| | OpenAI Chat API | GPT-4o-mini | Chat, Guardrail Fallback |
| **Telephony** | Twilio | REST + Media Streams | Phone Calls |
| **Database** | Supabase | PostgreSQL + Auth | Data + Auth |
| **Maps** | Naver Maps API | v3 | Place Search |
| **Deploy** | Docker | multi-stage | Containerization |
| | Google Cloud Run | - | Auto-scaling |
| | Cloud Build | - | CI/CD |
| **Package** | uv | latest | Python deps |
| | npm | latest | Node deps |

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 번역 정확도 | > 90% (사용자 만족도) | 통화 후 설문 |
| 통화 완료율 | > 80% (정상 종료) | call_result = success + partial_success |
| 평균 번역 지연 | < 1,000ms | OpenAI response latency |
| 가드레일 L3 발생률 | < 1% | guardrail_events count |
| 세션 복구 성공률 | > 95% | recovery_events status |
| 월간 활성 사용자 | 1,000+ (6개월 목표) | Supabase auth.users |
| 통화당 평균 비용 | < $0.50 | cost_tokens total |
| NPS | > 40 | 사용자 설문 |

---

## 11. Market Opportunity

| Segment | TAM (Korea) | Willingness to Pay |
|---------|-------------|-------------------|
| 재한 외국인 | 220만 (연 8% 성장) | High - daily necessity |
| 재외 한국인 | 280만 | Medium - occasional use |
| 장애인 서비스 | 정부 지원 프로그램 | Institutional contracts |
| 콜포비아 (Gen-Z) | 추정 ~400만 | Subscription model |

**Competitive Landscape**: Google Translate = text only. Papago = text + limited voice. **No product does real-time bidirectional voice translation over actual phone lines.** Closest alternatives require both parties to install an app. WIGVO requires only the caller.
