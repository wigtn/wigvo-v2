# WIGVO

**AI Realtime Relay Platform** — 언어 장벽 없는 전화 통화

WIGVO는 외국인, 언어/청각 장애인, 콜포비아 사용자를 위한 **AI 실시간 전화 통역 및 중개 플랫폼**입니다.
사용자가 모국어로 말하면 AI가 실시간으로 번역하여 상대방에게 전달하고, 상대방의 응답을 다시 번역하여 돌려줍니다.

## Problem

전화 통화에서 언어 장벽은 일상을 가로막습니다.

- **외국인 (한국 거주)** — 한국어 통화 불가. 병원 예약, 배달 주문, 관공서 문의 불가능
- **한국인 (해외 통화)** — 영어/현지어 통화 어려움. 호텔 예약, 항공사 문의에 장벽
- **언어 장애인** — 음성 통화 자체가 불가능하나, 전화만 받는 업소가 다수
- **청각 장애인** — 상대방 음성을 들을 수 없어 실시간 자막이 필요

기존 번역 앱은 **일방향 텍스트 번역**만 지원합니다.
WIGVO는 **양방향 실시간 음성 번역 + 전화 연결**을 하나의 앱에서 해결합니다.

## How It Works

```
사용자 (영어)                        수신자 (한국어)
     │                                    │
     │  "I'd like to make               │
     │   a reservation"                  │
     │         │                          │
     │         ▼                          │
     │   ┌────────────┐                  │
     │   │   WIGVO    │                  │
     │   │   Relay    │   Twilio Call    │
     │   │   Server   │────────────────►│
     │   │            │  "예약하고       │
     │   │   OpenAI   │   싶습니다"      │
     │   │   Realtime │                  │
     │   │   API      │◄────────────────│
     │   └────────────┘  "네, 몇 시에    │
     │         │          오실 건가요?"   │
     │         ▼                          │
     │  "Yes, what time                 │
     │   would you like                 │
     │   to come?"                      │
     │  + 영어 음성 재생                  │
     │  + 실시간 자막                     │
```

### 지원 모드

| 모드 | 사용자 입력 | AI 출력 | 대상 사용자 |
|------|-----------|---------|------------|
| **Voice-to-Voice** | 모국어 음성 | 번역 음성 + 자막 | 외국인, 일반 사용자 |
| **Text-to-Voice** | 텍스트 입력 | 음성 변환 + 전달 | 언어 장애인, 콜포비아 |
| **Voice-to-Text** | 음성 | 실시간 자막 | 청각 장애인 |

## Architecture

```
React Native App ◄──WS──► Relay Server (FastAPI) ◄──WS──► OpenAI Realtime API
                                    │
                              ◄──WS──► Twilio Media Streams ──► 수신자 전화
                                    │
                              Supabase (DB / Auth)
```

### Dual Session

동시에 두 개의 OpenAI Realtime 세션을 운영합니다.

- **Session A** (User → 수신자): 사용자의 음성/텍스트를 수신자 언어로 번역 + TTS
- **Session B** (수신자 → User): 수신자의 음성을 사용자 언어로 번역 + 자막 + TTS

두 세션을 분리함으로써 번역 방향 혼동을 원천 차단합니다.

### Client-side VAD

앱에서 **Voice Activity Detection**을 수행하여 무음 구간의 오디오를 서버에 전송하지 않습니다.

- RMS 에너지 기반 음성 감지 (speechThreshold: 0.015)
- 상태 머신: `SILENT → SPEAKING → COMMITTED`
- Pre-speech 300ms 링 버퍼로 발화 시작 부분 손실 방지
- **결과: 40%+ API 비용 절감**

### Interrupt Priority

자연스러운 대화를 위해 발화 우선순위를 적용합니다.

1. **수신자 발화** (최고) — 수신자를 기다리게 하면 안 됨
2. **사용자 발화**
3. **AI 생성** (최저) — 언제든 중단 가능

### Guardrail

번역 품질을 보장하는 3단계 검증 시스템입니다.

- **Level 1**: 자동 통과 (정상 번역)
- **Level 2**: 비동기 검증 (TTS 출력 후 백그라운드 교정)
- **Level 3**: 동기 차단 (필러 오디오 재생 + GPT-4o-mini 교정 후 전송)

### Recovery

OpenAI 세션 장애 시 자동 복구합니다.

- Heartbeat 모니터링 (5초 간격)
- Exponential backoff 재연결 (1s → 2s → 4s, max 30s)
- Ring Buffer catch-up (미전송 오디오 Whisper 배치 처리)
- Degraded Mode 자동 전환 (10초 복구 실패 시)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Mobile App | React Native (Expo SDK 54), TypeScript, Expo Router |
| Relay Server | Python 3.12+, FastAPI, uvicorn, websockets |
| AI | OpenAI Realtime API (GPT-4o), Whisper (fallback STT) |
| Telephony | Twilio (REST API + Media Streams) |
| Database | Supabase (PostgreSQL + Auth) |
| Package Manager | uv (Python), npm (React Native) |

## Project Structure

```
apps/
├── relay-server/                   # Python FastAPI Relay Server
│   ├── src/
│   │   ├── main.py                 # FastAPI entrypoint
│   │   ├── config.py               # Environment variables (pydantic-settings)
│   │   ├── types.py                # Shared type definitions (Pydantic)
│   │   ├── routes/
│   │   │   ├── calls.py            # POST /calls/start, /calls/{id}/end
│   │   │   └── stream.py          # WS /calls/{id}/stream
│   │   ├── realtime/
│   │   │   ├── session_manager.py  # Dual Session management
│   │   │   ├── audio_router.py     # Audio routing (Twilio ↔ OpenAI)
│   │   │   ├── recovery.py         # Session failure recovery
│   │   │   └── ring_buffer.py      # 30s audio ring buffer
│   │   ├── guardrail/              # Translation quality verification
│   │   ├── prompt/                 # System prompt generator
│   │   ├── tools/                  # Function Calling (Agent Mode)
│   │   ├── twilio/                 # Twilio integration
│   │   └── db/                     # Supabase client
│   └── tests/                      # 34 tests
│
├── mobile/                         # React Native (Expo) App
│   ├── app/                        # Expo Router pages
│   │   ├── (auth)/                 # Login / Sign up
│   │   └── (main)/                 # Home / Call screen
│   ├── components/call/
│   │   ├── RealtimeCallView.tsx    # Main call view
│   │   ├── LiveCaptionPanel.tsx    # Realtime caption panel
│   │   ├── PushToTalkInput.tsx     # Text / Voice input
│   │   ├── VadIndicator.tsx        # VAD state visualization
│   │   ├── ModeSelector.tsx        # Voice / Text mode selector
│   │   ├── CallStatusOverlay.tsx   # Connection status overlay
│   │   └── FontScaleControl.tsx    # Caption font size control
│   ├── hooks/
│   │   ├── useRealtimeCall.ts      # Master hook (WS + VAD + Playback)
│   │   ├── useRelayWebSocket.ts    # WebSocket connection
│   │   ├── useClientVad.ts         # Recording + VAD integration
│   │   ├── useAudioRecorder.ts     # expo-av chunk recording
│   │   └── useAudioPlayback.ts     # Recipient audio playback
│   └── lib/
│       ├── types.ts                # Type definitions
│       └── vad/                    # VAD core library
│           ├── vad-config.ts       # VAD parameter constants
│           ├── vad-processor.ts    # RMS energy detection + state machine
│           └── audio-ring-buffer.ts # Pre-speech ring buffer
│
docs/
├── prd/                            # PRD documents
└── todo_plan/                      # Implementation plan (65/65 completed)
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Expo Go app (iOS/Android)

### Environment Variables

```bash
# apps/relay-server/.env
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
RELAY_SERVER_URL=http://localhost:8000

# apps/mobile/.env
EXPO_PUBLIC_RELAY_SERVER_URL=http://localhost:8000
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Relay Server

```bash
cd apps/relay-server
uv sync
uv run uvicorn src.main:app --reload --port 8000
```

### Mobile App

```bash
cd apps/mobile
npm install
npx expo start
```

### Tests

```bash
cd apps/relay-server
uv run pytest          # 34 tests
```

## User Scenarios

### 1. 외국인이 영어로 병원 예약 전화

```
1. 앱에서 "Start Call" → 병원 전화번호 입력 → Voice 모드 선택
2. 영어로 "I'd like to make an appointment for next Monday"
3. AI가 한국어로 번역: "다음 주 월요일에 예약하고 싶습니다"
4. 병원 직원 응답: "몇 시가 좋으세요?"
5. 앱에 영어 자막 + 영어 음성 재생: "What time works for you?"
6. 통화 종료 → 양쪽 언어 대화록 저장
```

### 2. 언어 장애인이 텍스트로 피자 주문

```
1. 앱에서 Text 모드 선택 → 피자 매장 전화번호 입력
2. 텍스트 입력: "페퍼로니 피자 한 판 배달해주세요"
3. AI가 자연스러운 한국어 음성으로 매장에 전달
4. 매장 직원: "주소가 어디세요?"
5. 앱에 텍스트로 표시 → 사용자가 텍스트로 답변
6. AI가 다시 음성으로 변환하여 전달
```

### 3. 한국인이 해외 호텔 예약

```
1. 앱에서 Source: KO, Target: EN 설정
2. 한국어로 "체크인 날짜를 변경하고 싶은데요"
3. AI가 영어로 번역: "I'd like to change my check-in date"
4. 호텔 직원 응답이 한국어 자막 + 한국어 음성으로 전달
```

## Accessibility

WIGVO는 다양한 사용자를 위해 접근성을 최우선으로 설계했습니다.

- **자막 폰트 크기 조절** — 3단계 (1.0x / 1.5x / 2.0x)
- **진동 피드백** — 수신자 발화 시 100ms, 인터럽트 시 더블 진동
- **최소 터치 타겟** — 모든 버튼 48x48dp 이상
- **스크린리더 호환** — 모든 UI 요소에 accessibility label/hint
- **텍스트 입력 모드** — 음성 발화가 어려운 사용자를 위한 채팅 모드

## License

Private - All rights reserved
