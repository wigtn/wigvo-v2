# WIGVO

**AI 실시간 릴레이 플랫폼** — 언어 장벽 없는 전화 통화

[![English](https://img.shields.io/badge/lang-English-red.svg)](README.md)

WIGVO는 외국인, 언어/청각 장애인, 콜포비아 사용자를 위한 **AI 실시간 전화 통역 및 중개 플랫폼**입니다. 사용자가 모국어로 말하면 AI가 실시간으로 번역하여 상대방에게 전달하고, 상대방의 응답을 다시 번역하여 돌려줍니다.

## 문제 정의

전화 통화에서 언어 장벽은 일상을 가로막습니다:

- **외국인 (한국 거주)** — 한국어 통화 불가: 병원 예약, 배달 주문, 관공서 문의 불가능
- **한국인 (해외 통화)** — 영어/현지어 통화 어려움: 호텔 예약, 항공사 문의에 장벽
- **언어 장애인** — 음성 통화 자체가 불가능하나, 전화만 받는 업소가 다수
- **청각 장애인** — 상대방 음성을 들을 수 없어 실시간 자막이 필요

기존 번역 앱은 **일방향 텍스트 번역**만 지원합니다.
WIGVO는 **양방향 실시간 음성 번역 + 전화 연결**을 하나의 플랫폼에서 해결합니다.

## 작동 방식

```
사용자 (영어)                         수신자 (한국어)
     |                                    |
     |  "I'd like to make                |
     |   a reservation"                  |
     |         |                          |
     |         v                          |
     |   +------------+                  |
     |   |   WIGVO    |                  |
     |   |   Relay    |   Twilio 전화    |
     |   |   Server   |---------------->|
     |   |            |  "예약하고       |
     |   |   OpenAI   |   싶습니다"      |
     |   |   Realtime |                  |
     |   |   API      |<----------------|
     |   +------------+  "네, 몇 시에    |
     |         |          오실 건가요?"   |
     |         v                          |
     |  "Yes, what time                 |
     |   would you like                 |
     |   to come?"                      |
     |  + 영어 음성 재생                  |
     |  + 실시간 자막                     |
```

### 지원 모드

| 모드 | 사용자 입력 | AI 출력 | 대상 사용자 |
|------|-----------|---------|------------|
| **Voice-to-Voice** | 모국어 음성 | 번역 음성 + 자막 | 외국인, 일반 사용자 |
| **Text-to-Voice** | 텍스트 입력 | 음성 변환 + 전달 | 언어 장애인, 콜포비아 |
| **Voice-to-Text** | 음성 | 실시간 자막 | 청각 장애인 |

## 아키텍처

```
+-------------------+       +-------------------+       +-------------------+
|   Next.js 웹앱    |  WS   |                   |  WS   |  OpenAI Realtime  |
|   (Chat Agent +   |<----->|   Relay Server    |<----->|  API (GPT-4o)     |
|    통화 모니터링)   |       |   (FastAPI)       |       +-------------------+
+-------------------+       |                   |
                            |                   |  WS   +-------------------+
+-------------------+       |                   |<----->|  Twilio Media     |
|  React Native     |  WS   |                   |       |  Streams          |
|  모바일 앱         |<----->|                   |       +-------------------+
|  (VAD + 오디오)    |       +--------+----------+
+-------------------+                |
                                     v
                            +-------------------+
                            |   Supabase        |
                            |   (PostgreSQL +   |
                            |    Auth)          |
                            +-------------------+
```

### 앱 구성

| 앱 | 기술 스택 | 위치 | 역할 |
|-----|-------|----------|---------|
| **웹 앱** | Next.js 16, React 19, shadcn/ui, Zustand | `apps/web/` | Chat Agent + 통화 시작 + 통화 모니터링 |
| **릴레이 서버** | Python 3.12+, FastAPI, uvicorn | `apps/relay-server/` | 실시간 오디오 릴레이, 이중 번역 세션 |
| **모바일 앱** | React Native (Expo SDK 54), TypeScript | `apps/mobile/` | 클라이언트 VAD + 오디오 스트리밍 + 통화 UI |
| **데이터베이스** | Supabase PostgreSQL + Auth | Cloud | 사용자 데이터, 대화, 통화 기록 |

## 웹 앱 — Chat Agent 파이프라인

웹 앱은 통화 전 대화형 채팅 인터페이스로 통화 정보를 수집합니다:

```
사용자 채팅 진입
      |
      v
+------------------+     +------------------+     +------------------+
| 1. 시나리오      |     | 2. GPT-4o-mini   |     | 3. 네이버 장소   |
|    선택           |--->|    대화로 정보    |--->|    검색           |
| (예약, 문의 등)  |     |    수집           |     | (업체 찾기)      |
+------------------+     +------------------+     +------------------+
                                                         |
                                                         v
+------------------+     +------------------+     +------------------+
| 6. Relay Server  |     | 5. Call 생성     |     | 4. 사용자가      |
|    Twilio로 전화 |<---|    (PENDING)      |<---|    장소 확인      |
|    연결           |     |                  |     | -> 상태: READY   |
+------------------+     +------------------+     +------------------+
```

**주요 기능:**
- 시나리오 기반 대화 플로우 (예약, 문의, 취소, 자유 형식)
- LLM 기반 자연어 데이터 수집
- 네이버 장소 검색 API 연동
- 실시간 통화 상태 모니터링 (폴링)
- 다국어 지원 (한국어, 영어) — next-intl

**API 라우트:**
| 엔드포인트 | 메서드 | 설명 |
|----------|--------|-------------|
| `/api/chat` | POST | AI 대화 (GPT-4o-mini), 시나리오 기반 |
| `/api/conversations` | GET/POST | 대화 세션 목록/생성 |
| `/api/conversations/[id]` | GET | 대화 세션 상세 |
| `/api/calls` | GET/POST | 통화 기록 목록/생성 |
| `/api/calls/[id]` | GET | 통화 기록 상세 |
| `/api/calls/[id]/start` | POST | Relay Server를 통한 통화 시작 |

## 릴레이 서버 — 실시간 번역 엔진

### 이중 세션 아키텍처

두 개의 OpenAI Realtime 세션을 동시에 운영하여 번역 방향 혼동을 원천 차단합니다:

- **Session A** (사용자 -> 수신자): 사용자의 음성/텍스트를 수신자 언어로 번역 + TTS
- **Session B** (수신자 -> 사용자): 수신자의 음성을 사용자 언어로 번역 + 자막 + TTS

### 통화 모드

| 모드 | 동작 | 사용 상황 |
|------|------|----------|
| **Relay** | AI는 번역만, 자체 판단 금지 | 실시간 통역 |
| **Agent** | 수집된 정보 기반으로 AI가 통화 진행 | 자동 전화 |

### Echo Gate v2

수신자 발화를 놓치지 않으면서 에코 피드백 루프를 방지하는 출력 전용 게이팅:

- 입력은 항상 활성 (음성 감지가 차단되지 않음)
- TTS 재생 중 출력만 억제
- 억제된 출력은 큐에 저장 후 쿨다운 후 자동 배출
- 수신자 발화 감지 시 즉시 게이트 해제

### 대화 컨텍스트 윈도우

최근 6턴의 슬라이딩 윈도우를 각 세션에 주입하여 번역 일관성을 보장합니다.

### 가드레일 시스템

3단계 번역 품질 검증:

| 레벨 | 동작 | 지연 |
|------|------|------|
| Level 1 | 자동 통과 (정상 번역) | 0ms |
| Level 2 | 비동기 검증 (TTS 먼저, 백그라운드 교정) | 0ms |
| Level 3 | 동기 차단 (필러 오디오 + GPT-4o-mini 교정) | ~800ms |

### 세션 복구

OpenAI 세션 장애 시 자동 복구:

- Heartbeat 모니터링 (5초 간격, 45초 타임아웃)
- 지수 백오프 재연결 (1s -> 2s -> 4s, 최대 30s)
- 링 버퍼 catch-up (미전송 오디오 Whisper 배치 처리)
- Degraded 모드 자동 전환 (10초 복구 실패 시)

### 릴레이 서버 엔드포인트

| 엔드포인트 | 타입 | 설명 |
|----------|------|-------------|
| `POST /calls/start` | HTTP | 새 통화 시작 (Twilio 발신) |
| `POST /calls/{id}/end` | HTTP | 활성 통화 종료 |
| `WS /calls/{id}/stream` | WebSocket | 실시간 오디오 스트림 (앱 <-> 릴레이) |
| `POST /twilio/incoming` | HTTP | Twilio 웹훅 (통화 이벤트) |
| `WS /twilio/media-stream` | WebSocket | Twilio Media Stream (오디오 브릿지) |
| `GET /health` | HTTP | 헬스 체크 |

## 모바일 앱 — 클라이언트 VAD

### 음성 활동 감지

모바일 앱에서 **Voice Activity Detection**을 로컬로 수행하여 API 비용을 40% 이상 절감합니다:

- RMS 에너지 기반 음성 감지 (임계값: 0.015)
- 상태 머신: `SILENT -> SPEAKING -> COMMITTED`
- 발화 시작 손실 방지를 위한 300ms 프리스피치 링 버퍼
- 노이즈 저항을 위한 onset/end 지연 설정

### 인터럽트 우선순위

자연스러운 대화를 위한 우선순위 기반 중단:

1. **수신자 발화** (최고) — 수신자를 기다리게 하면 안 됨
2. **사용자 발화**
3. **AI 생성** (최저) — 언제든 중단 가능

### 오디오 파이프라인

```
마이크 -> expo-av 녹음 -> PCM16 청크
    -> VAD 프로세서 -> 음성 프레임만
    -> WebSocket -> Relay Server
    -> OpenAI Realtime API -> 번역
    -> TTS 오디오 -> WebSocket -> expo-av 재생
```

## 기술 스택

| 컴포넌트 | 기술 |
|-----------|-----------|
| 웹 앱 | Next.js 16, React 19, TypeScript, shadcn/ui, Zustand, next-intl |
| 모바일 앱 | React Native (Expo SDK 54), TypeScript, Expo Router |
| 릴레이 서버 | Python 3.12+, FastAPI, uvicorn, websockets, Pydantic v2 |
| AI | OpenAI Realtime API (GPT-4o), GPT-4o-mini (채팅 + 가드레일), Whisper (폴백) |
| 전화 | Twilio (REST API + Media Streams) |
| 데이터베이스 | Supabase (PostgreSQL + Auth + Row Level Security) |
| 검색 | 네이버 장소 검색 API |
| 패키지 매니저 | uv (Python), npm (Web/Mobile) |

## 프로젝트 구조

```
apps/
+-- relay-server/                   # Python FastAPI 릴레이 서버
|   +-- src/
|   |   +-- main.py                 # FastAPI 진입점
|   |   +-- config.py               # 환경 설정 (pydantic-settings)
|   |   +-- types.py                # 공유 타입 (Pydantic 모델)
|   |   +-- call_manager.py         # 통화 생명주기 싱글톤
|   |   +-- routes/
|   |   |   +-- calls.py            # POST /calls/start, /calls/{id}/end
|   |   |   +-- stream.py           # WS /calls/{id}/stream
|   |   +-- realtime/
|   |   |   +-- session_manager.py  # 이중 세션 관리
|   |   |   +-- session_a.py        # Session A (사용자 -> 수신자)
|   |   |   +-- session_b.py        # Session B (수신자 -> 사용자)
|   |   |   +-- audio_router.py     # 오디오 라우팅 + Echo Gate
|   |   |   +-- context_manager.py  # 대화 컨텍스트 윈도우
|   |   |   +-- recovery.py         # 세션 장애 복구
|   |   |   +-- ring_buffer.py      # 30초 오디오 링 버퍼
|   |   +-- guardrail/              # 번역 품질 검증 (3단계)
|   |   +-- prompt/                 # 시스템 프롬프트 템플릿
|   |   +-- tools/                  # Function Calling (Agent 모드)
|   |   +-- twilio/                 # Twilio 연동
|   |   +-- db/                     # Supabase 클라이언트
|   +-- tests/                      # 74개 테스트 (8개 파일)
|
+-- web/                            # Next.js 웹 앱
|   +-- app/
|   |   +-- page.tsx                # 홈 (채팅 인터페이스)
|   |   +-- login/ signup/          # 인증 페이지
|   |   +-- calling/[id]/           # 통화 모니터링 페이지
|   |   +-- result/[id]/            # 통화 결과 페이지
|   |   +-- history/                # 통화 이력 페이지
|   |   +-- api/                    # API 라우트 (7개 엔드포인트)
|   +-- components/
|   |   +-- chat/                   # 채팅 UI 컴포넌트
|   |   +-- call/                   # 통화 모니터링 컴포넌트
|   |   +-- ui/                     # shadcn/ui 기본 컴포넌트
|   +-- hooks/                      # 커스텀 훅 (useCallPolling, useDashboard)
|   +-- lib/
|   |   +-- services/chat-service.ts  # Chat Agent 파이프라인 로직
|   |   +-- supabase/               # Supabase 클라이언트 (SSR)
|   |   +-- api.ts                  # API 클라이언트
|   +-- shared/types.ts             # 공유 타입 정의
|   +-- messages/                   # i18n 번역 (ko, en)
|
+-- mobile/                         # React Native (Expo) 앱
|   +-- app/                        # Expo Router 페이지
|   |   +-- (auth)/                 # 로그인 / 회원가입
|   |   +-- (main)/                 # 홈 / 통화 화면
|   +-- components/call/
|   |   +-- RealtimeCallView.tsx    # 메인 통화 UI
|   |   +-- LiveCaptionPanel.tsx    # 실시간 자막
|   |   +-- PushToTalkInput.tsx     # 텍스트 / 음성 입력
|   |   +-- VadIndicator.tsx        # VAD 상태 시각화
|   +-- hooks/
|   |   +-- useRealtimeCall.ts      # 마스터 훅 (WS + VAD + 재생)
|   |   +-- useClientVad.ts         # 녹음 + VAD 통합
|   |   +-- useAudioRecorder.ts     # expo-av 청크 녹음
|   |   +-- useAudioPlayback.ts     # 오디오 재생
|   +-- lib/vad/                    # VAD 코어 라이브러리
|       +-- vad-config.ts           # VAD 파라미터
|       +-- vad-processor.ts        # RMS 에너지 감지 + 상태 머신
|       +-- audio-ring-buffer.ts    # 프리스피치 링 버퍼
|
docs/
+-- prd/                            # PRD 문서
+-- todo_plan/                      # 구현 계획
```

## 시작하기

### 사전 요구사항

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python 패키지 매니저)
- [ngrok](https://ngrok.com/) (개발 환경 Twilio 웹훅용)
- Expo Go 앱 (iOS/Android) — 모바일 개발용

### 환경 변수

```bash
# apps/relay-server/.env
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
RELAY_SERVER_URL=https://your-ngrok-url.ngrok-free.dev

# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
RELAY_SERVER_URL=https://your-ngrok-url.ngrok-free.dev
OPENAI_API_KEY=sk-...
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...

# apps/mobile/.env
EXPO_PUBLIC_RELAY_SERVER_URL=https://your-ngrok-url.ngrok-free.dev
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 서비스 실행

```bash
# 1. 릴레이 서버
cd apps/relay-server
uv sync
uv run uvicorn src.main:app --reload --port 8000

# 2. 웹 앱
cd apps/web
npm install
npm run dev              # localhost:3000

# 3. 모바일 앱
cd apps/mobile
npm install --legacy-peer-deps
npx expo start

# 4. ngrok (Twilio 웹훅용)
ngrok http 8000
```

### 테스트 실행

```bash
# 릴레이 서버 (74개 테스트)
cd apps/relay-server
uv run pytest

# 웹 앱
cd apps/web
npm run build            # 타입 체크 + 빌드
```

## 데이터베이스 스키마

Supabase PostgreSQL 5개 테이블:

| 테이블 | 용도 |
|--------|------|
| `conversations` | 수집된 데이터가 포함된 채팅 세션 (시나리오, 대상 정보) |
| `messages` | 대화 내 채팅 메시지 (사용자 + AI) |
| `calls` | 통화 기록 (상태, 결과, 소요 시간, 토큰) |
| `conversation_entities` | 대화에서 추출된 엔티티 |
| `place_search_cache` | 네이버 장소 검색 캐시 |

## 접근성

WIGVO는 다양한 사용자를 위해 접근성을 최우선으로 설계했습니다:

- **자막 폰트 크기 조절** — 3단계 (1.0x / 1.5x / 2.0x)
- **진동 피드백** — 수신자 발화 시 100ms, 인터럽트 시 더블 진동
- **최소 터치 타겟** — 모든 버튼 48x48dp 이상
- **스크린리더 호환** — 모든 UI 요소에 accessibility label/hint
- **텍스트 입력 모드** — 음성 발화가 어려운 사용자를 위한 채팅 모드

## 라이선스

Private - All rights reserved
