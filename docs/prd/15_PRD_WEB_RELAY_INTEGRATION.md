# WIGVO Web Relay Integration PRD

> **Version**: 1.0
> **Created**: 2026-02-18
> **Status**: Draft
> **Base Projects**: `wigtn-voice-only` (Next.js) + `wigvo/apps/relay-server` (Python/FastAPI)

## 1. Overview

### 1.1 Problem Statement

현재 두 개의 분리된 프로젝트가 존재한다:

| 프로젝트 | 역할 | 한계 |
|----------|------|------|
| **wigtn-voice-only** | 챗 기반 정보 수집 + ElevenLabs 자동 통화 | User가 통화에 참여 불가, ElevenLabs 의존 |
| **wigvo relay-server** | 실시간 번역 통화 (OpenAI Realtime API) | 웹 프론트엔드 없음, 모바일만 지원 |

**목표**: 두 프로젝트를 통합하여 **챗으로 정보 수집 → OpenAI Realtime API로 실시간 통화**를 웹에서 수행하는 단일 플랫폼을 구축한다.

### 1.2 Goals

- 기존 챗 수집 UI를 그대로 활용 (wigtn-voice-only)
- ElevenLabs를 제거하고 OpenAI Realtime API 기반 relay-server로 통화 실행
- 웹 브라우저에서 마이크/스피커를 통한 실시간 양방향 통역 통화 지원
- Agent Mode (AI 자동 통화) + Relay Mode (User 실시간 참여) 모두 지원
- 모바일(React Native) 고도화를 고려한 공통 로직 분리 설계

### 1.3 Non-Goals (Out of Scope)

- React Native 모바일 앱 구현 (고도화 단계)
- 결제/과금 시스템
- 다국어 UI (한국어 우선, i18n 구조는 유지)
- Supabase Auth 변경 (기존 그대로 사용)

### 1.4 Scope

| 포함 | 제외 |
|------|------|
| 웹 기반 실시간 통화 UI | 모바일 앱 구현 |
| OpenAI Realtime API 통합 | ElevenLabs 유지 |
| Agent + Relay 모드 | 새로운 시나리오 타입 |
| 브라우저 마이크/오디오 | Push-to-Talk 물리 버튼 |
| 실시간 자막 (2단계) | 녹음 파일 재생 |
| Relay Server API 연동 | Relay Server 핵심 로직 변경 |

---

## 2. Architecture

### 2.1 통합 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│  NEXT.JS WEB APP (wigtn-voice-only 기반)                         │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────┐ │
│  │ 챗 수집 UI   │→│ 모드 선택     │→│ 실시간 통화 UI         │ │
│  │ (기존 유지)  │  │ Agent/Relay   │  │ (신규: 마이크+자막)   │ │
│  └──────────────┘  └───────────────┘  └──────────┬─────────────┘ │
│                                                   │ WebSocket     │
└───────────────────────────────────────────────────┼──────────────┘
                                                    │
                    ┌───────────────────────────────┼──────────────┐
                    │  RELAY SERVER (FastAPI)        │              │
                    │                               ▼              │
                    │  ┌──────────────────────────────────────┐    │
                    │  │ AudioRouter                           │    │
                    │  │  Session A (User→수신자)               │    │
                    │  │  Session B (수신자→User)               │    │
                    │  │  InterruptHandler + EchoGate          │    │
                    │  │  ContextManager                       │    │
                    │  └───────────┬───────────────┬──────────┘    │
                    │              │               │               │
                    │       ┌──────┘               └──────┐        │
                    │       ▼                              ▼        │
                    │  ┌─────────┐                  ┌──────────┐   │
                    │  │ Twilio  │ ← Media Stream → │ OpenAI   │   │
                    │  │ (전화)  │                  │ Realtime │   │
                    │  └─────────┘                  └──────────┘   │
                    └──────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
[Phase 1: 정보 수집]
  User → ChatInput → POST /api/chat → GPT-4o-mini → CollectedData
  (기존 wigtn-voice-only 로직 100% 재사용)

[Phase 2: 통화 준비]
  CollectedData 확인 → 모드 선택 (Agent/Relay)
  → POST /relay/calls/start (Relay Server)
  → Twilio 발신 + OpenAI Dual Session 생성

[Phase 3: 실시간 통화]
  WebSocket /relay/calls/{call_id}/stream
  ├─ User 마이크 → audio_chunk → Session A → TTS → Twilio → 수신자
  ├─ 수신자 → Twilio → Session B → 번역 오디오 → User 스피커
  ├─ 자막 (caption, caption.original, caption.translated)
  └─ 상태 (call_status, translation.state, interrupt_alert)

[Phase 4: 통화 종료]
  end_call → cleanup → 결과 저장 → ResultCard 표시
```

### 2.3 공유 계층 (모바일 고도화 대비)

```
shared/
├── types.ts          # CollectedData, Call, Message 등 (기존)
├── call-types.ts     # 통화 관련 타입 (WsMessage, CallMode 등)
├── audio-utils.ts    # PCM16 인코딩/디코딩, Base64 변환
└── relay-client.ts   # Relay Server HTTP/WS 클라이언트 (플랫폼 무관)

hooks/ (React 공통 — Web/Mobile 모두 사용 가능)
├── useRelayConnection.ts  # WebSocket 연결 관리
├── useAudioStream.ts      # 오디오 스트리밍 추상화
└── useCallState.ts        # 통화 상태 관리

lib/ (플랫폼별 구현)
├── web/
│   ├── web-audio-recorder.ts   # Web Audio API 마이크 녹음
│   └── web-audio-player.ts     # AudioContext 재생
└── mobile/  (고도화 시)
    ├── native-audio-recorder.ts
    └── native-audio-player.ts
```

---

## 3. Functional Requirements

### 3.1 기존 기능 유지 (from wigtn-voice-only)

| ID | Requirement | Priority | 변경 |
|----|------------|----------|------|
| FR-100 | 챗 기반 정보 수집 (시나리오별) | P0 | 유지 |
| FR-101 | 네이버 지도 장소 검색 | P0 | 유지 |
| FR-102 | CollectedData 병합 + 확인 UI | P0 | 유지 |
| FR-103 | Supabase Auth (Google, Apple, Kakao) | P0 | 유지 |
| FR-104 | 대화 이력 저장/복원 | P1 | 유지 |

### 3.2 신규: 통화 모드 선택

| ID | Requirement | Priority |
|----|------------|----------|
| FR-200 | CollectedData 완성 시 모드 선택 UI 표시 | P0 |
| FR-201 | **Agent Mode**: AI가 자율적으로 통화 수행 (User 대기) | P0 |
| FR-202 | **Relay Mode**: User가 마이크로 직접 참여, 실시간 번역 | P0 |
| FR-203 | 모드 설명 + 추천 표시 (예약 → Agent 추천, 문의 → Relay 추천) | P1 |

### 3.3 신규: Relay Server 연동

| ID | Requirement | Priority |
|----|------------|----------|
| FR-300 | Next.js API Route → Relay Server HTTP 프록시 | P0 |
| FR-301 | 브라우저 → Relay Server WebSocket 직접 연결 | P0 |
| FR-302 | collected_data를 CallStartRequest에 포함하여 전달 | P0 |
| FR-303 | phone_number E.164 변환 (기존 formatPhoneToE164 재사용) | P0 |

### 3.4 신규: 웹 브라우저 오디오

| ID | Requirement | Priority |
|----|------------|----------|
| FR-400 | 마이크 권한 요청 + 녹음 (Web Audio API) | P0 |
| FR-401 | PCM16 16kHz mono 포맷으로 캡처 | P0 |
| FR-402 | Base64 인코딩 후 WebSocket으로 전송 | P0 |
| FR-403 | 수신 PCM16 오디오를 AudioContext로 재생 | P0 |
| FR-404 | Client VAD (음성 활동 감지) — speechOnsetDelay 150ms, speechEndDelay 350ms | P0 |
| FR-405 | User 발화 시작 시 수신자 오디오 재생 중단 | P1 |

### 3.5 신규: 실시간 통화 UI

| ID | Requirement | Priority |
|----|------------|----------|
| FR-500 | 통화 상태 표시 (대기 → 연결 → 통화중 → 종료) | P0 |
| FR-501 | 실시간 자막 패널 (2단계: 원문 + 번역) | P0 |
| FR-502 | 번역 진행 인디케이터 ("Translating...") | P0 |
| FR-503 | 종료 버튼 + 확인 다이얼로그 | P0 |
| FR-504 | 마이크 음소거/해제 토글 | P1 |
| FR-505 | 통화 시간 타이머 | P1 |
| FR-506 | 인터럽트 알림 ("수신자가 말하고 있습니다") | P1 |
| FR-507 | 통화 결과 카드 (기존 ResultCard 재활용) | P0 |

### 3.6 Agent Mode 통화 흐름

| ID | Requirement | Priority |
|----|------------|----------|
| FR-600 | Agent Mode: User는 마이크 사용 안 함 (AI가 자동 통화) | P0 |
| FR-601 | 실시간 자막으로 AI↔수신자 대화 표시 | P0 |
| FR-602 | 통화 종료 후 결과 판정 (기존 7단계 알고리즘 서버 구현) | P0 |
| FR-603 | User가 중간에 개입할 수 있는 텍스트 입력 (선택적) | P2 |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|--------|--------|
| 마이크 → 수신자 스피커 지연 | < 2.0초 (E2E) |
| 수신자 발화 → User 스피커 지연 | < 2.0초 (E2E) |
| WebSocket 연결 수립 | < 500ms |
| 오디오 청크 크기 | 100ms (1600 samples @ 16kHz) |

### 4.2 Browser Support

| Browser | Version | 필수 API |
|---------|---------|----------|
| Chrome | 90+ | Web Audio API, MediaDevices |
| Safari | 15+ | Web Audio API, MediaDevices |
| Firefox | 90+ | Web Audio API, MediaDevices |
| Edge | 90+ | Web Audio API, MediaDevices |

### 4.3 Security

- Relay Server 통신: HTTPS + WSS (프로덕션)
- Supabase JWT로 API 인증 (기존)
- 마이크 권한: HTTPS 환경에서만 동작 (브라우저 보안 정책)
- 오디오 데이터: 서버 메모리에만 존재, 영구 저장 안 함

---

## 5. Technical Design

### 5.1 프로젝트 구조 변경

```
wigtn-voice-only/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # 기존 유지
│   │   ├── conversations/          # 기존 유지
│   │   └── calls/
│   │       ├── route.ts            # 기존 유지 (DB 기록 생성)
│   │       └── [id]/
│   │           └── start/route.ts  # 변경: ElevenLabs → Relay Server 프록시
│   └── call/[callId]/page.tsx      # 신규: 실시간 통화 페이지
├── components/
│   ├── chat/                       # 기존 유지
│   ├── call/
│   │   ├── CallingPanel.tsx        # 변경: 통화 상태 + 실시간 UI 통합
│   │   ├── ResultCard.tsx          # 기존 유지
│   │   ├── CallModeSelector.tsx    # 신규: Agent/Relay 모드 선택
│   │   ├── RealtimeCallView.tsx    # 신규: 실시간 통화 메인 뷰
│   │   ├── LiveCaptionPanel.tsx    # 신규: 실시간 자막 (2단계)
│   │   ├── AudioControls.tsx       # 신규: 마이크/스피커 컨트롤
│   │   └── CallStatusBar.tsx       # 신규: 통화 상태 바
│   └── map/                        # 기존 유지
├── hooks/
│   ├── useChat.ts                  # 기존 유지
│   ├── useRelayCall.ts             # 신규: Relay 통화 전체 관리
│   ├── useRelayWebSocket.ts        # 신규: WebSocket 연결 관리
│   ├── useWebAudioRecorder.ts      # 신규: 브라우저 마이크 녹음
│   ├── useWebAudioPlayer.ts        # 신규: PCM16 오디오 재생
│   └── useClientVad.ts             # 신규: 음성 활동 감지
├── lib/
│   ├── api.ts                      # 변경: Relay Server API 추가
│   ├── relay-client.ts             # 신규: Relay Server HTTP 클라이언트
│   ├── prompt-generator.ts         # 변경: OpenAI Realtime 포맷 적응
│   ├── elevenlabs.ts               # 삭제 (또는 레거시 유지)
│   ├── audio/
│   │   ├── pcm16-utils.ts          # 신규: PCM16 인코딩/디코딩
│   │   ├── web-recorder.ts         # 신규: Web Audio API 녹음
│   │   ├── web-player.ts           # 신규: AudioContext 재생
│   │   └── vad.ts                  # 신규: Client VAD 로직
│   ├── supabase/                   # 기존 유지
│   └── constants.ts                # 변경: Relay 관련 상수 추가
└── shared/
    ├── types.ts                    # 변경: 통화 관련 타입 추가
    └── call-types.ts               # 신규: WS 메시지 타입 정의
```

### 5.2 API 변경

#### 5.2.1 `POST /api/calls/[id]/start` (변경)

기존: ElevenLabs API 호출
변경: Relay Server `/relay/calls/start` 프록시

```typescript
// app/api/calls/[id]/start/route.ts
export async function POST(req, { params }) {
  const { id: callId } = params;

  // 1. DB에서 call + conversation 조회
  const call = await getCall(callId);
  const conversation = await getConversation(call.conversationId);

  // 2. Relay Server에 통화 시작 요청
  const response = await fetch(`${RELAY_SERVER_URL}/relay/calls/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call_id: callId,
      phone_number: formatPhoneToE164(call.targetPhone),
      mode: call.callMode,  // 'agent' | 'relay'
      source_language: 'en', // 또는 User 설정
      target_language: 'ko',
      vad_mode: call.callMode === 'relay' ? 'client' : 'server',
      collected_data: conversation.collectedData,
    }),
  });

  const data = await response.json();

  // 3. DB 업데이트
  await updateCall(callId, {
    status: 'CALLING',
    relay_ws_url: data.relay_ws_url,
    call_sid: data.call_sid,
  });

  return NextResponse.json({
    callId,
    relayWsUrl: data.relay_ws_url,
    callSid: data.call_sid,
  });
}
```

#### 5.2.2 WebSocket 연결 (신규)

브라우저에서 Relay Server WebSocket에 직접 연결:

```
wss://{RELAY_SERVER_HOST}/relay/calls/{call_id}/stream
```

Next.js API Route를 거치지 않음 (WebSocket 프록시 불필요).

### 5.3 핵심 Hook: `useRelayCall`

```typescript
// hooks/useRelayCall.ts
interface UseRelayCallReturn {
  // 상태
  callStatus: 'idle' | 'connecting' | 'waiting' | 'connected' | 'ended';
  translationState: 'idle' | 'processing' | 'done';
  captions: CaptionEntry[];
  callDuration: number;

  // 액션
  startCall: (callId: string) => Promise<void>;
  endCall: () => void;
  sendText: (text: string) => void;  // Agent 모드에서 User 개입
  toggleMute: () => void;

  // 오디오 상태
  isMuted: boolean;
  isRecording: boolean;
  isPlaying: boolean;
}
```

### 5.4 웹 오디오 파이프라인

```
[마이크 녹음]
MediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
  → AudioWorkletNode (PCM16 변환)
  → Client VAD (음성 감지)
  → Base64 인코딩
  → WebSocket send({ type: "audio_chunk", data: { audio: base64 } })

[오디오 재생]
WebSocket receive({ type: "recipient_audio", data: { audio: base64 } })
  → Base64 디코딩
  → PCM16 → Float32 변환
  → AudioContext.createBufferSource()
  → 스피커 출력
```

### 5.5 Client VAD (음성 활동 감지)

```typescript
// lib/audio/vad.ts
const VAD_CONFIG = {
  speechThreshold: 0.015,      // RMS 임계값
  silenceThreshold: 0.008,
  speechOnsetDelay: 150,       // ms
  speechEndDelay: 350,         // ms
  chunkSize: 1600,             // 100ms @ 16kHz
  sampleRate: 16000,
};

// 발화 감지 → "speaking" 상태
// 발화 종료 → WebSocket send({ type: "vad_state", data: { state: "committed" } })
```

### 5.6 Relay Server 변경 (최소)

Relay Server 핵심 로직은 변경하지 않음. 필요한 최소 변경:

| 변경 | 이유 |
|------|------|
| CORS 설정 확인 | 웹 브라우저에서 직접 WebSocket 연결 |
| `CallStartRequest.collected_data` 활용 | Agent Mode 프롬프트에 collected_data 주입 |
| 통화 결과 판정 로직 추가 | Agent Mode 종료 시 transcript 기반 결과 판정 |

### 5.7 prompt-generator 통합

기존 wigtn-voice-only의 `prompt-generator.ts`와 relay-server의 `generator_v3.py`를 통합:

```
Agent Mode:
  - collected_data → buildSystemPrompt() (기존 TS 로직)
  - → relay-server의 generate_session_a_prompt(mode=agent)
  - 프롬프트 구조: Identity + Objective + KeyInfo + Flow + Fallback + Ending + Rules

Relay Mode:
  - relay-server의 generate_session_a_prompt(mode=relay) 그대로 사용
  - Session A: 번역기 역할 (User 발화 → 수신자 언어로 번역)
  - Session B: 번역기 역할 (수신자 발화 → User 언어로 번역)
```

Agent Mode 프롬프트 통합을 위해, **Next.js에서 빌드한 systemPrompt를 relay-server에 전달**하는 방식 사용:

```typescript
// CallStartRequest에 system_prompt_override 필드 추가
{
  call_id: "...",
  mode: "agent",
  collected_data: { ... },
  system_prompt_override: buildSystemPrompt(collectedData), // 기존 TS 로직
}
```

Relay Server는 `system_prompt_override`가 있으면 이를 Session A 프롬프트로 사용.

---

## 6. UI Design

### 6.1 모드 선택 화면

CollectedData 확인 카드 아래에 모드 선택 버튼 표시:

```
┌─────────────────────────────────────────────┐
│  📋 정보 확인                                │
│                                             │
│  📍 OO미용실 (02-1234-5678)                 │
│  📅 내일 오후 3시                            │
│  ✂️ 커트                                     │
│  👤 홍길동                                   │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  통화 방식을 선택하세요                       │
│                                             │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │  🤖 AI 자동통화  │  │  🎙️ 직접 통화   │   │
│  │  (Agent Mode)   │  │  (Relay Mode)   │   │
│  │                 │  │                 │   │
│  │  AI가 알아서    │  │  내가 직접 말하  │   │
│  │  전화합니다     │  │  면 번역해줍니다 │   │
│  │                 │  │                 │   │
│  │  ⭐ 예약 추천   │  │  💬 문의 추천    │   │
│  └─────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────┘
```

### 6.2 실시간 통화 화면 (Relay Mode)

```
┌─────────────────────────────────────────────┐
│  📞 OO미용실 통화중  ⏱️ 02:34               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                             │
│  ┌─ 자막 ────────────────────────────────┐  │
│  │                                       │  │
│  │  👤 You:                               │  │
│  │  "I'd like to make a reservation"     │  │
│  │                                       │  │
│  │  🔄 Translating...                    │  │
│  │                                       │  │
│  │  📞 Recipient (original):             │  │
│  │  "네, 몇 시에 오실 건가요?"            │  │
│  │                                       │  │
│  │  📞 Recipient (translated):           │  │
│  │  "Yes, what time would you like?"     │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🎙️ ████████░░░░░░░  Listening...   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [🔇 Mute]                    [📞 End Call] │
└─────────────────────────────────────────────┘
```

### 6.3 실시간 통화 화면 (Agent Mode)

```
┌─────────────────────────────────────────────┐
│  🤖 OO미용실 AI 통화중  ⏱️ 01:23            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                             │
│  ┌─ AI 대화 내용 ────────────────────────┐  │
│  │                                       │  │
│  │  🤖 AI:                               │  │
│  │  "안녕하세요, 커트 예약 문의드립니다"   │  │
│  │                                       │  │
│  │  📞 수신자:                            │  │
│  │  "네, 몇 시에 오실 건가요?"            │  │
│  │                                       │  │
│  │  🤖 AI:                               │  │
│  │  "내일 오후 3시에 가능할까요?"          │  │
│  │                                       │  │
│  │  📞 수신자:                            │  │
│  │  "네, 가능합니다"                      │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  AI가 통화를 진행하고 있습니다...            │
│                                             │
│  [💬 직접 말하기]              [📞 End Call] │
└─────────────────────────────────────────────┘
```

---

## 7. Implementation Phases

### Phase 1: 인프라 + 공통 계층 (P0)

**목표**: Relay Server 연동 기반 + 공유 타입/유틸리티

- [ ] `shared/call-types.ts` — WS 메시지 타입, CallMode 타입 정의
- [ ] `lib/relay-client.ts` — Relay Server HTTP 클라이언트 (start, end)
- [ ] `lib/audio/pcm16-utils.ts` — PCM16 ↔ Float32 변환, Base64 유틸
- [ ] `lib/constants.ts` 업데이트 — RELAY_SERVER_URL 등 상수 추가
- [ ] `shared/types.ts` 업데이트 — Call에 callMode, relayWsUrl 필드 추가
- [ ] `app/api/calls/[id]/start/route.ts` — ElevenLabs → Relay Server 프록시로 변경
- [ ] `.env.example` 업데이트 — RELAY_SERVER_URL 추가, ElevenLabs 변수 제거

**Deliverable**: Relay Server와 HTTP 통신 가능, 통화 시작 API 동작

### Phase 2: 웹 오디오 엔진 (P0)

**목표**: 브라우저 마이크 녹음 + 오디오 재생

- [ ] `lib/audio/web-recorder.ts` — Web Audio API 기반 PCM16 녹음
- [ ] `lib/audio/web-player.ts` — AudioContext 기반 PCM16 재생
- [ ] `lib/audio/vad.ts` — Client VAD (RMS 기반 음성 감지)
- [ ] `hooks/useWebAudioRecorder.ts` — 녹음 Hook (start/stop/onChunk)
- [ ] `hooks/useWebAudioPlayer.ts` — 재생 Hook (play/stop/queue)
- [ ] `hooks/useClientVad.ts` — VAD Hook (onSpeechStart/onSpeechEnd/onCommit)

**Deliverable**: 브라우저에서 마이크 녹음 → PCM16 Base64 → 재생 가능

### Phase 3: WebSocket + 통화 관리 (P0)

**목표**: Relay Server WebSocket 연결 + 실시간 메시지 처리

- [ ] `hooks/useRelayWebSocket.ts` — WebSocket 연결/재연결/메시지 핸들링
- [ ] `hooks/useRelayCall.ts` — 통화 전체 라이프사이클 관리
  - startCall → WebSocket 연결 → 오디오 스트리밍 → 자막 수신 → endCall
  - Agent/Relay 모드 분기
  - 에러/복구 처리
- [ ] `shared/types.ts` — CaptionEntry 타입 추가 (stage 1/2)

**Deliverable**: Relay Server와 WebSocket으로 실시간 통신 가능

### Phase 4: UI 컴포넌트 (P0)

**목표**: 통화 UI 구현

- [ ] `components/call/CallModeSelector.tsx` — Agent/Relay 모드 선택
- [ ] `components/call/RealtimeCallView.tsx` — 실시간 통화 메인 뷰
- [ ] `components/call/LiveCaptionPanel.tsx` — 실시간 자막 (2단계)
- [ ] `components/call/AudioControls.tsx` — 마이크/음소거 컨트롤
- [ ] `components/call/CallStatusBar.tsx` — 통화 상태 표시
- [ ] `app/call/[callId]/page.tsx` — 통화 페이지 (라우트)
- [ ] `components/call/CallingPanel.tsx` 수정 — 모드 선택 통합

**Deliverable**: 웹에서 실시간 통화 UI 동작

### Phase 5: Agent Mode + 통합 테스트 (P0)

**목표**: Agent Mode 동작 + E2E 검증

- [ ] Agent Mode 프롬프트 통합 (system_prompt_override)
- [ ] Relay Server에 `system_prompt_override` 지원 추가
- [ ] Agent Mode 통화 결과 판정 (transcript 기반)
- [ ] 통화 결과 → DB 저장 + ResultCard 표시
- [ ] E2E 통화 테스트 (Agent + Relay 모드)
- [ ] `lib/elevenlabs.ts` 제거 또는 deprecated 처리

**Deliverable**: Agent Mode + Relay Mode 모두 웹에서 E2E 동작

### Phase 6: 마무리 + 모바일 준비 (P1)

- [ ] 에러 핸들링 강화 (WebSocket 끊김, 마이크 권한 거부 등)
- [ ] 통화 시간 제한 (10분) + 경고 (8분)
- [ ] Relay Server 상태 모니터링 (health check)
- [ ] 공통 Hook → `shared/hooks/`로 분리 (모바일 재사용 준비)
- [ ] 오디오 유틸 → `shared/audio/`로 분리
- [ ] React Native 마이그레이션 가이드 문서

**Deliverable**: 프로덕션 레디 + 모바일 확장 준비 완료

---

## 8. Relay Server 변경 사항 (최소)

기존 relay-server 코드를 최대한 유지하면서, 웹 통합에 필요한 최소 변경:

### 8.1 `CallStartRequest` 확장

```python
class CallStartRequest(BaseModel):
    call_id: str
    phone_number: str
    mode: CallMode = CallMode.RELAY
    source_language: str = "en"
    target_language: str = "ko"
    vad_mode: VadMode = VadMode.CLIENT
    collected_data: dict[str, Any] | None = None
    system_prompt_override: str | None = None  # 신규: Agent Mode 프롬프트
```

### 8.2 `start_call` 엔드포인트 수정

```python
# system_prompt_override가 있으면 그것을 Session A 프롬프트로 사용
if req.system_prompt_override:
    prompt_a = req.system_prompt_override
else:
    prompt_a = generate_session_a_prompt(...)
```

### 8.3 Agent Mode 통화 결과 판정

```python
# 통화 종료 시 transcript_bilingual에서 결과 추출
# → determineCallResult() 서버 버전 구현
# → cleanup_call 시 결과를 response에 포함
```

### 8.4 CORS 확인

```python
# 이미 allow_origins=["*"] 설정되어 있음 — 프로덕션에서는 도메인 제한 필요
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],  # 프로덕션
)
```

---

## 9. Environment Variables

### Next.js (.env.local)

```bash
# 기존 유지
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=...
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# 신규
RELAY_SERVER_URL=http://localhost:8000     # Relay Server HTTP (서버사이드)
NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:8000  # Relay Server WebSocket (클라이언트)

# 삭제
# ELEVENLABS_API_KEY (더 이상 불필요)
# ELEVENLABS_AGENT_ID
# ELEVENLABS_PHONE_NUMBER_ID
# ELEVENLABS_MOCK
```

### Relay Server (.env)

```bash
# 기존 유지 — 변경 없음
OPENAI_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
RELAY_SERVER_URL=http://localhost:8000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 통화 연결 성공률 | > 90% | 수신자 응답 / 총 시도 |
| E2E 번역 지연 | < 2.0s | User 발화 종료 → 수신자 TTS 시작 |
| 자막 정확도 | 체감 자연스러움 | 수동 검증 (5건 이상 통화) |
| Agent Mode 완료율 | > 80% | 예약 성공 / 총 Agent 통화 |
| 브라우저 호환성 | Chrome + Safari | 수동 테스트 |

---

## 11. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| 브라우저 마이크 권한 거부 | 통화 불가 | 권한 요청 UI + 가이드 표시 |
| WebSocket 연결 끊김 | 통화 중단 | 자동 재연결 (3초 간격, 최대 5회) |
| Safari AudioContext 정책 | 오디오 무음 | User gesture로 AudioContext resume |
| Relay Server 다운 | 전체 서비스 중단 | Health check + 사용자 알림 |
| OpenAI API 비용 | 비용 초과 | 통화 시간 제한 (10분), 일일 한도 |
| Agent Mode 환각 | 잘못된 예약 | Guardrail 시스템 유지 + 사용자 확인 |
