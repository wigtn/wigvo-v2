# PRD: WIGVO Realtime Relay System v3

> **Project**: WIGVO — AI 실시간 중개 플랫폼 (외국인 & 교통약자)
> **Version**: 3.2
> **Created**: 2026-02-13
> **Updated**: 2026-02-13 (Critical 4건 + Major 8건 반영)
> **Status**: Draft
> **Previous**: docs/01_PRD.md (v2 — ElevenLabs Agent 기반)
> **Analysis**: docs/13_PRD_ANALYSIS_REPORT.md

---

## 1. Overview

### 1.1 Problem Statement

언어 장벽이 존재하는 전화 통화 상황에서 사용자들이 극심한 어려움을 겪고 있다.
- **외국인 (한국 거주)**: 한국어 통화 불가 → 병원 예약, 배달 주문, 택시 호출 등에 장벽
- **한국인 (해외 통화)**: 영어/현지어 통화 어려움 → 해외 호텔 예약, 항공사 문의, 현지 서비스 이용 장벽
- **언어 장애인**: 음성 통화 자체가 불가 → 텍스트로만 소통 가능하나 전화만 받는 업소 다수
- **청각 장애인**: 상대방 음성을 들을 수 없음 → 실시간 자막 필요

기존 v2는 ElevenLabs Conversational AI에 의존하여 **단방향(한국어→한국어) 전화 대행**만 가능했다.
번역, 실시간 자막, 텍스트-음성 중개 등 **양방향 실시간 통신**은 불가능했다.

### 1.2 Goals

- **G1**: 외국인 사용자가 모국어로 말하면 AI가 한국어(존댓말)로 실시간 변환하여 전화 통화를 중개한다
- **G2**: 한국인 사용자가 한국어로 말하면 AI가 영어로 실시간 변환하여 해외 전화 통화를 중개한다
- **G3**: 언어 장애인이 텍스트를 입력하면 AI가 음성으로 변환하여 전화하고, 상대방 응답을 텍스트로 돌려준다
- **G4**: 양방향 실시간 자막(Live Captioning)으로 통화 내용을 시각화한다
- **G5**: ElevenLabs 의존성을 제거하고 OpenAI Realtime API 단독 아키텍처로 전환한다
- **G6**: React Native 앱으로 전환하여 네이티브 WebSocket/오디오 지원을 확보한다
- **G7**: VAD(Voice Activity Detection) 최적화로 비용을 절감하고 지연 시간을 최소화한다

### 1.3 Non-Goals (Out of Scope)

- 인바운드 전화 수신 (사용자가 전화를 받는 기능)
- 3자 이상 동시 통화
- 음성 클로닝 (사용자 목소리 복제)
- 감정 분석 (Sentiment Analysis) — v4에서 검토
- Google Calendar 연동 — v2에서 이미 설계됨, 별도 구현

### 1.4 Scope

| 포함 | 제외 |
|------|------|
| **React Native 앱** (iOS/Android) | 웹 브라우저 전용 (v2는 Next.js 웹) |
| OpenAI Realtime API 기반 STT/TTS/번역 | ElevenLabs Conversational AI |
| Twilio 직접 연동 (Media Streams) | SIP Direct Integration (v3.1에서 검토) |
| Fastify Relay Server (WebSocket 중계) | Next.js API Routes (실시간 오디오 처리 불가) |
| Client-side VAD + Server-side VAD | WebRTC P2P (서버 중계 방식 사용) |
| Push-to-Talk (장애인 모드) | 음성 메시지 (비실시간) |
| 실시간 자막 UI | 통화 녹음 재생 |
| 한국어 ↔ 영어 양방향 번역 | 기타 언어 (v3.1에서 확장) |
| Non-blocking 오디오 버퍼링 | 오프라인 모드 |

---

## 2. User Stories

### 2.1 외국인 사용자 (Voice-to-Voice)

**Primary User**: John (32세, 미국인, 한국 거주 2년차)

```
AS A 한국 거주 외국인
I WANT TO 영어로 말하면 AI가 한국어로 번역하여 대신 전화해주길
SO THAT 언어 장벽 없이 병원 예약, 배달 주문 등을 할 수 있다
```

**Acceptance Criteria (Gherkin)**:
```
Scenario: 외국인이 영어로 병원 예약 전화를 건다
  Given John이 WIGVO에 로그인하고 전화할 정보를 수집 완료했다
  When John이 "Start Call" 버튼을 누르고 영어로 추가 요청을 말한다
  Then AI가 한국어 존댓말(해요체)로 번역하여 병원에 전화한다
  And 병원 직원의 한국어 응답이 영어 자막으로 실시간 표시된다
  And 병원 직원의 응답이 영어 음성으로 John에게 전달된다
  And 통화 완료 후 전체 대화록이 양쪽 언어로 저장된다
```

### 2.2 언어 장애인 사용자 (Chat-to-Voice)

**Primary User**: 김수진 (28세, 언어 장애인)

```
AS A 언어 장애인
I WANT TO 텍스트를 입력하면 AI가 음성으로 변환하여 전화해주길
SO THAT 직접 말하지 않고도 전화 기반 서비스를 이용할 수 있다
```

**Acceptance Criteria (Gherkin)**:
```
Scenario: 언어 장애인이 텍스트로 피자를 주문한다
  Given 수진이 채팅으로 "피자 페퍼로니 한 판 배달해주세요"를 입력했다
  When AI가 피자 매장에 전화를 건다
  Then 수진의 텍스트가 자연스러운 한국어 음성으로 매장에 전달된다
  And 매장 직원의 질문("주소가 어디세요?")이 수진의 채팅창에 실시간 텍스트로 표시된다
  And 수진이 텍스트로 답변을 입력하면 다시 음성으로 변환되어 전달된다
  And Push-to-Talk 방식으로 수진이 준비될 때만 응답이 전송된다
```

### 2.3 청각 장애인 사용자 (Voice-to-Text)

**Primary User**: 이민호 (35세, 청각 장애인)

```
AS A 청각 장애인
I WANT TO 상대방의 말이 실시간 자막으로 표시되길
SO THAT 전화 통화 내용을 시각적으로 이해할 수 있다
```

### 2.4 한국인 사용자 — 해외 통화 (KR→EN Voice-to-Voice)

**Primary User**: 박지영 (30세, 직장인, 해외 출장/여행 빈번)

```
AS A 영어 통화가 어려운 한국인
I WANT TO 한국어로 말하면 AI가 영어로 번역하여 해외에 전화해주길
SO THAT 언어 장벽 없이 해외 호텔 예약, 항공사 문의 등을 할 수 있다
```

**Acceptance Criteria (Gherkin)**:
```
Scenario: 한국인이 한국어로 해외 호텔 예약 전화를 건다
  Given 지영이 WIGVO에 로그인하고 해외 호텔 전화번호와 예약 정보를 수집 완료했다
  When 지영이 "전화 걸기" 버튼을 누르고 한국어로 요청을 말한다
  Then AI가 영어로 번역하여 호텔에 전화한다
  And AI가 수신자 응답 후 자기소개를 한다: "Hello, this is an AI translation assistant calling on behalf of a customer."
  And 호텔 직원의 영어 응답이 한국어 자막으로 실시간 표시된다
  And 호텔 직원의 응답이 한국어 음성으로 지영에게 전달된다
  And 통화 완료 후 전체 대화록이 양쪽 언어로 저장된다
```

**Note**: 한국인 사용자의 경우 Session A는 KR→EN, Session B는 EN→KR로 번역 방향이 반전된다.
시스템은 사용자의 모국어(sourceLanguage)와 수신자 언어(targetLanguage) 설정으로 방향을 자동 결정한다.

---

## 3. Technical Architecture

### 3.1 Platform: React Native + Relay Server

> **C-1 반영**: 기존 Next.js 웹앱에서 **React Native 앱**으로 전환.
> React Native는 WebSocket을 네이티브 지원하므로 실시간 오디오 스트리밍에 적합하다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WIGVO Realtime Relay System v3                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐      ┌───────────────┐      ┌──────────────┐ │
│  │  React Native   │      │ Relay Server   │      │   Phone      │ │
│  │  App (User)     │◄────►│ (Fastify)      │◄────►│  (수신자)    │ │
│  │                 │  WS  │                │  WS  │              │ │
│  │  ┌───────────┐ │      │  ┌──────────┐ │      └──────────────┘ │
│  │  │ VAD       │ │      │  │ Session  │ │                        │
│  │  │ Processing│ │      │  │ Manager  │ │                        │
│  │  └───────────┘ │      │  └──────────┘ │                        │
│  │  ┌───────────┐ │      │  ┌──────────┐ │      ┌──────────────┐ │
│  │  │ Live      │ │      │  │ Audio    │ │      │ OpenAI       │ │
│  │  │ Caption   │ │      │  │ Router   │◄├──────►│ Realtime API │ │
│  │  └───────────┘ │      │  └──────────┘ │  WS  │              │ │
│  │  ┌───────────┐ │      │  ┌──────────┐ │      │ Session A    │ │
│  │  │ Push-to-  │ │      │  │ Ring     │ │      │ Session B    │ │
│  │  │ Talk Input│ │      │  │ Buffer   │ │      └──────────────┘ │
│  │  └───────────┘ │      │  └──────────┘ │                        │
│  └────────────────┘      │  ┌──────────┐ │      ┌──────────────┐ │
│                          │  │ Guardrail│ │      │ Twilio       │ │
│                          │  │ + LLM    │◄├──────►│ Media Streams│ │
│                          │  └──────────┘ │  WS  └──────────────┘ │
│                          └───────────────┘                        │
│                                 │                                  │
│                          ┌──────┴──────┐                          │
│                          │  Supabase   │                          │
│                          │  (DB/Auth)  │                          │
│                          └─────────────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Split Architecture

| Component | 기술 스택 | 배포 | 역할 |
|-----------|----------|------|------|
| **React Native App** | React Native (Expo), WebSocket, Audio API | App Store / Play Store | UI, VAD, 오디오 캡처, 실시간 자막 표시 |
| **Relay Server** | Fastify + @fastify/websocket + ws | Railway / Fly.io | Twilio 연동, OpenAI Realtime 세션 관리, 오디오 라우팅, Guardrail |
| **REST API** | Fastify (Relay Server 내장) 또는 별도 Next.js | 동일 서버 또는 Vercel | 채팅, 대화 관리, 통화 레코드 CRUD |
| **Database** | Supabase PostgreSQL + Auth | Supabase Cloud | 공유 데이터베이스, 인증 |

#### React Native의 실시간 오디오 장점

- **WebSocket 네이티브 지원**: `react-native-websocket` 또는 내장 WebSocket API
- **오디오 캡처**: `expo-av` 또는 `react-native-audio-api`로 마이크 입력 직접 접근
- **백그라운드 오디오**: 앱이 백그라운드에 있어도 통화 오디오 유지 가능
- **네이티브 VAD**: Web Audio API 대신 네이티브 오디오 프로세싱으로 더 정확한 VAD
- **Push Notification**: 통화 결과를 네이티브 푸시로 전달

#### Relay Server 운영 요구사항

> **M-8 반영**: Relay Server의 배포/운영 명세.

| 항목 | 명세 |
|------|------|
| **기술 스택** | Fastify 5.x + @fastify/websocket + ws |
| **Node.js** | v20 LTS 이상 |
| **배포 플랫폼** | Railway (권장, 간편 배포) 또는 Fly.io (글로벌 엣지) |
| **인스턴스** | 최소 1 (해커톤), 프로덕션 시 2+ (멀티 리전) |
| **메모리** | 최소 512MB (Ring Buffer + 동시 세션) |
| **Health Check** | `GET /health` → `{ status: "ok", activeSessions: N, uptime: M }` |
| **모니터링** | 활성 통화 수, 세션 에러율, 평균 지연시간 로깅 (stdout → Railway 대시보드) |
| **환경변수** | Section 10 참조 |
| **Graceful Shutdown** | SIGTERM 수신 시 진행 중 통화 완료 대기 (최대 30초) 후 종료 |

#### 통화 시작 시퀀스 (App ↔ Relay Server)

```
1. App → Relay Server: POST /relay/calls/start
   { callId, mode, sourceLanguage, targetLanguage, collectedData }

2. Relay Server:
   a. Twilio REST API로 아웃바운드 콜 발신
   b. Twilio webhook → TwiML로 Media Stream 연결
   c. OpenAI Realtime API에 Dual Session 생성
   d. Supabase: call 상태를 CALLING으로 업데이트

3. Relay Server → App: { relayWsUrl, callSid, sessionIds }

4. App → Relay Server: WebSocket 연결 (relayWsUrl)
   → 오디오 스트리밍 + 실시간 자막 수신 시작
```

### 3.2 Dual Session Architecture

두 개의 독립적인 OpenAI Realtime API 세션으로 양방향 번역을 처리한다.
단일 세션으로 양방향 처리 시 번역 방향 혼동 위험이 있으므로 **분리가 필수**다.

번역 방향은 사용자의 `sourceLanguage`와 `targetLanguage`에 따라 동적으로 결정된다.

| 사용자 유형 | sourceLanguage | targetLanguage | Session A | Session B |
|------------|---------------|---------------|-----------|-----------|
| 외국인 (한국 거주) | en | ko | EN→KR | KR→EN |
| 한국인 (해외 통화) | ko | en | KR→EN | EN→KR |

```
┌─────────────────────────────────────────────────────────────┐
│  Session A: User → 수신자 (Outbound Translation)            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input: User 음성 (sourceLanguage) 또는 텍스트              │
│      ↓                                                      │
│  Processing:                                                │
│      ├─ STT (음성 → 텍스트)                                 │
│      ├─ Translation (source → target)                       │
│      ├─ Guardrail (존댓말/정중 표현 교정)                   │
│      └─ TTS (targetLanguage 음성 생성)                      │
│      ↓                                                      │
│  Output: targetLanguage 음성 → Twilio → 수신자 전화        │
│                                                             │
│  Side Output: 번역된 텍스트 → App 자막                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Session B: 수신자 → User (Inbound Translation)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input: 수신자 음성 (targetLanguage) via Twilio             │
│      ↓                                                      │
│  Processing:                                                │
│      ├─ STT (음성 → 텍스트)                                 │
│      ├─ Translation (target → source)                       │
│      └─ TTS (sourceLanguage 음성 생성) [선택적]             │
│      ↓                                                      │
│  Output: sourceLanguage 텍스트 → App 자막                   │
│  Output: sourceLanguage 음성 → App 스피커 [선택적]          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Session A 운영 모드

> **C-2 반영**: Session A는 사용자 시나리오에 따라 두 가지 모드로 운영된다.

| 모드 | 적용 대상 | Session A 역할 | User 참여도 |
|------|----------|----------------|------------|
| **Relay Mode** (기본) | 외국인, 한국인 (Voice-to-Voice) | **실시간 번역기**. User의 말을 번역만 함. AI 자체 판단으로 말을 추가하지 않음 | 높음 — User가 직접 대화를 주도 |
| **Agent Mode** | 장애인 (Chat-to-Voice) | **자율 대화 에이전트**. 수집된 정보 기반으로 AI가 통화 진행. User는 텍스트로 중간 지시만 가능 | 낮음 — 정보 제공 후 AI에 위임 |

#### Relay Mode 동작 (외국인/한국인)
```
User: "I'd like to book for 3pm tomorrow" (영어)
  → Session A: "내일 오후 3시에 예약하고 싶은데요" (한국어 해요체)
  → Twilio → 수신자

수신자: "3시는 좀 어렵고 4시는 가능한데요" (한국어)
  → Session B: "3pm is difficult, but 4pm is available" (영어)
  → App → User

User: "4pm works, please book it" (영어)
  → Session A: "네, 4시로 예약 부탁드려요" (한국어 해요체)
  → Twilio → 수신자
```
- User가 대화를 완전히 주도
- AI는 번역만 수행, 자체 판단으로 내용 추가 금지
- 첫 인사만 자동 생성 (Section 3.4 참조)

#### Agent Mode 동작 (장애인)
```
[사전에 채팅으로 수집된 정보: 피자 페퍼로니 1판, 주소: 강남구...]

AI가 자율적으로 통화:
  Session A: "안녕하세요, 배달 주문하려고 연락드렸습니다."
  수신자: "네, 말씀하세요."
  Session A: "페퍼로니 피자 한 판 배달 부탁드릴게요."
  수신자: "주소가 어디세요?"
  → Session B: 수신자 질문을 텍스트로 User에게 전달
  → User가 텍스트로 답변 입력 → Session A가 음성으로 전달
```
- AI가 대화를 주도하되, 예상치 못한 질문은 User에게 전달
- v2의 Dynamic System Prompt 방식과 유사

### 3.4 First Message Strategy (AI 고지)

> **C-3 반영**: 수신자가 전화를 받으면 AI임을 먼저 고지하고 대화를 시작한다.

```
┌─────────────────────────────────────────────────────────────┐
│  First Message Sequence                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Twilio가 전화를 건다                                    │
│     → 수신자 전화기가 울림                                  │
│                                                             │
│  2. 수신자가 전화를 받는다                                  │
│     → "여보세요" / "네, OO입니다"                           │
│                                                             │
│  3. Session B가 수신자 첫 발화를 감지 (Server VAD)          │
│     → 수신자 인사를 STT + 번역하여 User 앱에 자막 표시     │
│                                                             │
│  4. 자동 AI 고지 (Session A → Twilio → 수신자)             │
│     → targetLanguage로 자기소개 TTS 생성:                   │
│                                                             │
│     한국어 수신자:                                          │
│     "안녕하세요. AI 통역 서비스를 이용해서 연락드렸습니다.  │
│      고객님을 대신해서 통화를 도와드리고 있어요.            │
│      잠시 후 말씀드릴게요."                                 │
│                                                             │
│     영어 수신자:                                            │
│     "Hello, this is an AI translation assistant calling     │
│      on behalf of a customer. I'll relay their message      │
│      shortly."                                              │
│                                                             │
│  5. AI 고지 완료 후:                                        │
│     → Relay Mode: User 앱에 "상대방이 응답했습니다.         │
│       말씀하세요" 알림 + VAD 활성화                         │
│     → Agent Mode: AI가 바로 용건 시작                       │
│                                                             │
│  Timeout 처리:                                              │
│  - 15초 이내 수신자 응답 없음 → "전화를 받지 않았습니다"    │
│  - Relay Mode에서 AI 고지 후 User가 10초간 발화 없음       │
│    → "잠시만 기다려 주세요" 필러 오디오 재생                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 수신자별 자동 인사 템플릿

| targetLanguage | AI 고지 메시지 |
|---------------|---------------|
| ko (한국어) | "안녕하세요. AI 통역 서비스를 이용해서 연락드렸습니다. 고객님을 대신해서 통화를 도와드리고 있어요." |
| en (영어) | "Hello, this is an AI translation assistant calling on behalf of a customer. I'll relay their message shortly." |

### 3.5 Component Responsibility Map

| Component | 역할 | 기술 |
|-----------|------|------|
| **React Native App** | User 음성/텍스트 입력, 실시간 자막 표시, VAD 처리 | React Native, WebSocket, expo-av |
| **Relay Server** | 세션 관리, 오디오 라우팅, 버퍼링, Fallback 제어, First Message | Fastify, @fastify/websocket, ws |
| **OpenAI Realtime API** | STT, Translation, Guardrail, TTS, Function Calling | gpt-4o-realtime, WebSocket |
| **Twilio** | PSTN 전화 발신, 오디오 스트리밍 | Media Streams, REST API |
| **Fallback LLM** | 번역 교정 실패 시 별도 LLM으로 교정 | GPT-4o-mini, REST API |
| **Supabase** | 대화 기록, 트랜스크립트 저장, 사용자 인증 | PostgreSQL, Auth |

### 3.6 Turn Overlap / Interrupt 처리

> **M-1 반영**: 실시간 전화 통화에서 양쪽이 동시에 말하는 상황(interrupt/overlap)은 빈번하다.
> Dual Session 구조에서의 명확한 처리 규칙을 정의한다.

#### 시나리오별 Interrupt 처리

```
┌─────────────────────────────────────────────────────────────────┐
│  Turn Overlap Handling                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Case 1: Session A TTS 재생 중 수신자가 끼어들기                │
│  ──────────────────────────────────────────────                  │
│  상황: Session A가 User 말을 번역한 TTS를 Twilio로 보내는 중    │
│        수신자가 끼어들어 말하기 시작                              │
│  처리:                                                          │
│    1. Session B가 수신자 발화 감지 (Server VAD)                  │
│    2. Relay Server가 Session A에 response.cancel 전송            │
│    3. Session A TTS 중단 → Twilio에 잔여 오디오 flush            │
│    4. Session B가 수신자 발화를 처리 (STT → 번역 → User 자막)   │
│    5. User가 응답하면 Session A가 다시 시작                      │
│                                                                 │
│  Case 2: User가 말하는 중 수신자가 끼어들기 (Relay Mode)        │
│  ──────────────────────────────────────────────                  │
│  상황: User가 영어로 말하고 있는 중에 수신자가 끼어들어 말함     │
│  처리:                                                          │
│    1. Session B가 수신자 발화 감지                                │
│    2. User 앱에 "상대방이 말하고 있습니다" 시각적 알림           │
│    3. User의 오디오 스트리밍은 계속 진행 (Session A는 버퍼링)    │
│    4. 수신자 발화 종료 후 → Session A가 버퍼된 User 오디오 처리  │
│    ※ User 오디오를 자르지 않음 — 누락 방지 우선                  │
│                                                                 │
│  Case 3: Session A와 Session B가 동시에 출력 생성                │
│  ──────────────────────────────────────────────                  │
│  상황: Session A TTS가 아직 Twilio로 스트리밍 중인데             │
│        Session B가 수신자 발화를 감지하여 User에게 텍스트 전달   │
│  처리:                                                          │
│    - Session A → Twilio: TTS 스트리밍 계속 (수신자에게 전달)    │
│    - Session B → User 앱: 텍스트 자막 병렬 전달 (충돌 없음)     │
│    - Twilio와 User 앱은 독립 경로이므로 동시 출력 가능           │
│                                                                 │
│  Case 4: Push-to-Talk 모드 (Agent Mode)                         │
│  ──────────────────────────────────────────────                  │
│  상황: AI가 자율적으로 통화 중 수신자가 끼어들기                 │
│  처리:                                                          │
│    - Session B가 수신자 발화 감지                                │
│    - Session A에 response.cancel 전송 → AI TTS 즉시 중단        │
│    - 수신자 발화 완료까지 대기                                   │
│    - 수신자 발화가 질문이면 → User에게 텍스트로 전달             │
│    - 수신자 발화가 정보 제공이면 → AI가 대화 계속               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Interrupt 우선순위

| 우선순위 | 설명 | 이유 |
|---------|------|------|
| 1 (최고) | 수신자 발화 | 실제 전화의 주도권은 수신자에게 있다. 수신자를 기다리게 하면 안 됨 |
| 2 | User 발화 | User가 의도적으로 말하고 있으므로 존중 |
| 3 (최저) | AI 생성 (TTS/필러) | AI 출력은 언제든 중단하고 재생성 가능 |

---

## 4. VAD (Voice Activity Detection) 설계

### 4.1 VAD 전략 Overview

비용 최적화와 사용자 경험을 위해 **3가지 VAD 모드**를 시나리오별로 적용한다.

| 방식 | 설명 | 비용 절감 효과 | 적용 시나리오 |
|------|------|---------------|--------------|
| **Server-side VAD** (OpenAI 기본) | API 내부에서 자동으로 음성을 감지하여 응답을 생성 | 편리하지만, 무음 오디오가 이미 서버로 전달된 후이므로 전송 비용이 발생할 수 있음 | 수신자 측 (Twilio 오디오) |
| **Client-side VAD** (강력 추천) | 앱 단에서 소리가 날 때만 데이터를 서버로 전송 | **가장 효과적**. 서버로 전송되는 오디오 입력 토큰 자체를 원천 차단하여 비용을 획기적으로 줄임 | 외국인 Voice-to-Voice 모드 |
| **Push-to-Talk** (수동) | 사용자가 버튼을 누를 때만 마이크를 활성화 | 무음으로 인한 비용 발생을 **0**으로 만듦 | 장애인용 텍스트 중개 시나리오 |

### 4.2 Client-side VAD 상세 설계

외국인 Voice-to-Voice 모드의 기본 VAD 전략이다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client-side VAD Pipeline                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Microphone                                                     │
│      │                                                          │
│      ▼                                                          │
│  ┌──────────────┐                                              │
│  │ React Native │                                              │
│  │ Audio API    │                                              │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────┐     ┌─────────────────┐             │
│  │  VAD Processor        │     │  Audio Buffer    │             │
│  │  ─────────────────    │     │  (Ring Buffer)   │             │
│  │                       │     │                   │             │
│  │  1. Energy Detection  │────►│  항상 최근 300ms  │             │
│  │     - RMS threshold   │     │  오디오를 보관    │             │
│  │     - 주파수 분석     │     │  (Pre-speech     │             │
│  │                       │     │   context 유지)   │             │
│  │  2. Speech Onset      │     └─────────┬───────┘             │
│  │     - 음성 시작 감지  │               │                      │
│  │     - 200ms debounce  │               │                      │
│  │                       │               │                      │
│  │  3. Speech End        │               │                      │
│  │     - 500ms silence   │               │                      │
│  │       → 발화 종료     │               │                      │
│  └──────────┬───────────┘               │                      │
│             │                            │                      │
│             │ isSpeaking = true          │                      │
│             ▼                            ▼                      │
│  ┌──────────────────────────────────────────────┐              │
│  │  WebSocket Sender                              │              │
│  │  ──────────────────                            │              │
│  │                                                │              │
│  │  음성 감지 시:                                 │              │
│  │    1. Pre-speech buffer (300ms) 먼저 전송      │              │
│  │    2. 실시간 오디오 청크 스트리밍 시작          │              │
│  │                                                │              │
│  │  음성 종료 시:                                 │              │
│  │    1. 마지막 청크 전송                          │              │
│  │    2. input_audio_buffer.commit 이벤트 전송     │              │
│  │    3. 스트리밍 중단 → 비용 절감                │              │
│  │                                                │              │
│  └────────────────────────────────────────────────┘              │
│                                                                 │
│  비용 절감 메커니즘:                                            │
│  ┌──────────────────────────────────────────────┐              │
│  │  무음 구간: 오디오 전송 안 함 → 토큰 0        │              │
│  │  발화 구간: 오디오 전송 → 토큰 과금            │              │
│  │  결과: 전체 통화 중 실제 발화 비율만 과금      │              │
│  │        (보통 30-40% → 60-70% 비용 절감)       │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### VAD 파라미터 설정

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| `speechThreshold` | 0.015 (RMS) | 이 값 이상이면 음성으로 판단 |
| `silenceThreshold` | 0.008 (RMS) | 이 값 이하가 지속되면 무음으로 판단 |
| `speechOnsetDelay` | 200ms | 음성 시작 후 200ms 지속 시 발화로 확정 (노이즈 필터링) |
| `speechEndDelay` | 500ms | 무음 500ms 지속 시 발화 종료로 판단 |
| `preBufferDuration` | 300ms | 음성 시작 전 300ms를 미리 버퍼링 (발화 시작 부분 누락 방지) |
| `sampleRate` | 16000Hz | React Native Audio 캡처 샘플레이트 |
| `chunkSize` | 4096 samples | WebSocket 전송 단위 (256ms @ 16kHz) |

#### VAD 상태 머신

```
┌──────────┐    음성감지 (200ms 지속)    ┌───────────┐
│  SILENT  │ ──────────────────────────► │ SPEAKING  │
│          │                             │           │
│  오디오   │◄──────────────────────────  │ 오디오     │
│  미전송   │    무음감지 (500ms 지속)    │  실시간    │
└──────────┘                             │  전송중    │
                                         └───────────┘
                                              │
                                              │ commit 전송
                                              ▼
                                         ┌───────────┐
                                         │ COMMITTED │
                                         │           │
                                         │ 응답 대기  │
                                         └─────┬─────┘
                                               │
                                               │ 응답 완료 or 새 음성
                                               ▼
                                         ┌──────────┐
                                         │  SILENT  │
                                         └──────────┘
```

### 4.3 세션별 오디오 포맷 매핑

> **M-4 반영**: Session A/B의 입출력 오디오 포맷을 명시적으로 정의한다.

| Session | 모드 | Input Format | Input Source | Output Format | Output Destination |
|---------|------|-------------|-------------|--------------|-------------------|
| **A** | Relay (Voice) | pcm16 16kHz | React Native 앱 (Client VAD) | g711_ulaw 8kHz | Twilio → 수신자 |
| **A** | Agent / PTT | text only | React Native 앱 (텍스트 입력) | g711_ulaw 8kHz | Twilio → 수신자 |
| **B** | 모든 모드 | g711_ulaw 8kHz | Twilio ← 수신자 | pcm16 16kHz + text | React Native 앱 (자막 + 선택적 음성) |

#### Session Configuration 요약

```json
// Session A (Relay Mode - Voice)
{
  "input_audio_format": "pcm16",
  "output_audio_format": "g711_ulaw",
  "turn_detection": null  // Client VAD가 commit 제어
}

// Session A (Agent/PTT Mode)
{
  "input_audio_format": null,  // 텍스트만 사용
  "output_audio_format": "g711_ulaw",
  "turn_detection": null  // 수동 response.create
}

// Session B (모든 모드)
{
  "input_audio_format": "g711_ulaw",
  "output_audio_format": "pcm16",
  "turn_detection": { "type": "server_vad", ... }
}
```

### 4.4 Server-side VAD (수신자 측)

수신자(전화 상대방)의 오디오는 Twilio Media Stream을 통해 들어오므로 Client-side VAD를 적용할 수 없다.
OpenAI Realtime API의 **내장 Server VAD**를 활용한다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Server-side VAD (Session B: 수신자→User)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Twilio Media Stream                                            │
│      │                                                          │
│      │ g711_ulaw 8kHz (연속 스트림)                             │
│      ▼                                                          │
│  ┌──────────────────┐                                          │
│  │ Relay Server      │                                          │
│  │ Audio Router      │                                          │
│  │                   │                                          │
│  │ Twilio 오디오를   │                                          │
│  │ OpenAI Session B  │                                          │
│  │ 로 포워딩         │                                          │
│  └────────┬─────────┘                                          │
│           │                                                     │
│           │ input_audio_buffer.append                           │
│           ▼                                                     │
│  ┌──────────────────────────────────┐                          │
│  │ OpenAI Realtime API (Session B)   │                          │
│  │                                   │                          │
│  │ turn_detection:                   │                          │
│  │   type: "server_vad"             │                          │
│  │   threshold: 0.5                 │                          │
│  │   prefix_padding_ms: 300         │  ← 발화 시작 전 300ms   │
│  │   silence_duration_ms: 500       │  ← 무음 500ms = 턴 종료 │
│  │                                   │                          │
│  └──────────────────────────────────┘                          │
│                                                                 │
│  비용 참고:                                                     │
│  - Twilio→Server 구간은 Twilio 과금 (통화 시간 기준)           │
│  - Server→OpenAI 구간은 OpenAI 오디오 입력 토큰 과금           │
│  - 수신자 측은 Client VAD 적용 불가하므로 Server VAD 사용       │
│  - prefix_padding으로 발화 시작 누락 방지                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Session Configuration

```json
{
  "model": "gpt-4o-realtime",
  "modalities": ["text", "audio"],
  "instructions": "...(Session B system prompt)...",
  "input_audio_format": "g711_ulaw",
  "output_audio_format": "pcm16",
  "turn_detection": {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 500
  }
}
```

### 4.5 Push-to-Talk 모드 (장애인용)

언어 장애인의 Chat-to-Voice 시나리오에서는 Push-to-Talk이 가장 적합하다.
사용자가 텍스트를 입력하고 "전송" 버튼을 누를 때만 서버로 데이터를 보낸다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Push-to-Talk Mode (Chat-to-Voice)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User 앱 (React Native)                                                  │
│  ┌─────────────────────────────────────────┐                   │
│  │                                         │                   │
│  │  [실시간 자막 영역]                      │                   │
│  │  ──────────────────                      │                   │
│  │  사장님: "네, OO피자입니다"              │  ← Session B 출력 │
│  │  나: "페퍼로니 한 판 배달이요"           │                   │
│  │  사장님: "주소가 어디세요?"              │  ← Session B 출력 │
│  │                                         │                   │
│  │  ┌───────────────────────────────┐      │                   │
│  │  │ 서울시 강남구 역삼동 123-45  │[전송] │                   │
│  │  └───────────────────────────────┘      │                   │
│  │                                         │                   │
│  │  turn_detection: disabled               │  ← 수동 제어     │
│  │  텍스트 전송 시 response.create 호출    │                   │
│  │                                         │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  처리 흐름:                                                     │
│  1. User가 텍스트 입력 후 [전송] 클릭                           │
│  2. 텍스트를 Session A에 conversation.item.create로 전달        │
│  3. Session A가 한국어 TTS로 변환                               │
│  4. TTS 오디오를 Twilio로 스트리밍 → 수신자에게 전달            │
│  5. 수신자 응답은 Session B가 STT → 텍스트로 변환               │
│  6. 변환된 텍스트를 User 앱 (React Native)에 실시간 표시                 │
│                                                                 │
│  비용:                                                          │
│  - User→수신자: 텍스트 입력 토큰 + TTS 출력 토큰만 과금        │
│  - 오디오 입력 토큰 = 0 (마이크 사용 안 함)                    │
│  - 무음 비용 = 0 (Push-to-Talk)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Session A Configuration (Push-to-Talk)

```json
{
  "model": "gpt-4o-realtime",
  "modalities": ["text", "audio"],
  "instructions": "...(Session A system prompt)...",
  "output_audio_format": "g711_ulaw",
  "turn_detection": null
}
```

`turn_detection: null` → 자동 턴 감지 비활성화.
클라이언트가 `response.create`를 명시적으로 호출할 때만 응답 생성.

### 4.6 VAD 모드 선택 로직

```
사용자 프로필 확인
       │
       ├─ 외국인 (Voice-to-Voice)
       │      │
       │      └─→ Client-side VAD (기본)
       │          └─ 옵션: Push-to-Talk 전환 가능
       │
       ├─ 언어 장애인 (Chat-to-Voice)
       │      │
       │      └─→ Push-to-Talk (기본, 유일한 옵션)
       │          └─ 텍스트 입력만 사용
       │
       └─ 청각 장애인 (Voice-to-Text)
              │
              └─→ Client-side VAD (기본)
                  └─ TTS 출력은 자막으로만 표시
```

---

## 5. Non-blocking Audio Pipeline & Fallback 설계

### 5.1 핵심 원칙: 오디오를 절대 놓치지 않는다

비즈니스 로직(번역, 교정, DB 저장 등)이 blocking 되더라도 **수신자의 음성을 단 한 순간도 놓치면 안 된다**.
이를 위해 오디오 캡처, 처리, 출력을 **3개의 독립적인 파이프라인**으로 분리한다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Non-blocking Audio Pipeline Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: Audio Capture (절대 중단 불가)                        │
│  ──────────────────────────────────────                         │
│                                                                 │
│  Twilio Media Stream ──┬──► Ring Buffer (항상 기록)             │
│                        │                                        │
│                        └──► OpenAI Session B (항상 수신 중)     │
│                                                                 │
│  ※ Ring Buffer는 최근 30초 오디오를 항상 보관                   │
│  ※ Session B 연결이 끊겨도 Ring Buffer는 계속 기록              │
│  ※ Session B 복구 후 Ring Buffer에서 미처리 오디오 재전송       │
│                                                                 │
│  Layer 2: Processing (비동기, 실패 허용)                        │
│  ─────────────────────────────────────                          │
│                                                                 │
│  OpenAI Session B ──┬──► Transcript Queue (실시간 텍스트)       │
│                     │                                           │
│                     ├──► Translation Queue (번역 텍스트)        │
│                     │                                           │
│                     └──► Guardrail Check (교정 검증)            │
│                              │                                  │
│                              ├─ PASS → 바로 출력               │
│                              └─ FAIL → Fallback LLM 호출       │
│                                                                 │
│  Layer 3: Output (독립적 전달)                                  │
│  ────────────────────────────                                   │
│                                                                 │
│  Transcript Queue ──► User 앱 (React Native) (실시간 자막)               │
│  Translation Queue ──► User 앱 (React Native) (번역 자막)                │
│  TTS Audio ──► User 앱 (React Native) (번역 음성) [선택적]               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Ring Buffer 설계

수신자 오디오를 항상 보관하는 안전망이다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Ring Buffer (AudioRingBuffer)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  용도: Session B가 일시적으로 처리 불가 상태일 때               │
│        수신자 오디오를 누락 없이 보관                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  Slot 0  │ Slot 1  │ Slot 2  │ ... │ Slot N-1     │       │
│  │  (oldest)│         │         │     │ (newest)      │       │
│  │  ◄───────────── 30 seconds ──────────────►         │       │
│  └─────────────────────────────────────────────────────┘       │
│       ▲ write pointer (항상 전진)                               │
│       │                                                         │
│  동작:                                                          │
│  - Twilio에서 오디오 수신 시: write pointer 위치에 기록 후 전진 │
│  - 30초 초과 시: 가장 오래된 슬롯을 덮어쓰기 (순환)            │
│  - Session B 복구 시: 미전송 구간을 순서대로 재전송              │
│                                                                 │
│  구현:                                                          │
│  - capacity: 30초 (g711_ulaw 8kHz = 약 240KB)                  │
│  - chunkDuration: 20ms (Twilio 기본 패킷 크기)                  │
│  - slots: 1500 (30초 / 20ms)                                   │
│  - metadata per slot: timestamp, sequenceNumber                 │
│                                                                 │
│  상태 추적:                                                     │
│  - lastSentSequence: Session B에 마지막으로 전송한 시퀀스 번호  │
│  - lastReceivedSequence: Twilio에서 마지막으로 수신한 시퀀스    │
│  - gap = lastReceived - lastSent: 미전송 오디오 양              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Session 장애 복구 (Recovery Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  Session Recovery Flow                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  정상 상태:                                                     │
│  Twilio ──► Ring Buffer ──► Session B ──► User                 │
│             (동시 기록)     (실시간 처리)   (실시간 출력)        │
│                                                                 │
│  ─── Session B 장애 발생 ───                                    │
│                                                                 │
│  Twilio ──► Ring Buffer ──╳ Session B (끊김)                   │
│             (계속 기록!)                                         │
│                                                                 │
│  1. 장애 감지 (3초 이내)                                        │
│     - WebSocket close/error 이벤트                              │
│     - Heartbeat timeout (5초)                                   │
│                                                                 │
│  2. Session B 재연결                                            │
│     - 새 WebSocket 연결                                         │
│     - 동일 Session Config 재설정                                │
│     - conversation context 복원 (이전 transcript 주입)          │
│                                                                 │
│  3. 미전송 오디오 Catch-up (M-5 반영)                           │
│     - gap = lastReceivedSeq - lastSentSeq                      │
│     - Ring Buffer에서 gap 구간 오디오 추출                      │
│     - **STT-only 배치 모드**: Whisper API로 텍스트 변환         │
│     - 번역 텍스트를 User에게 "[복구됨]" 태그로 전달            │
│     - ※ 1.5x 오디오 전송은 불가 (Realtime API 실시간 처리만)  │
│                                                                 │
│  4. 정상 복귀                                                   │
│     - catch-up 완료 후 실시간 스트리밍 재개                     │
│     - 누락된 구간의 텍스트를 User에게 "[복구됨]" 태그로 전달   │
│                                                                 │
│  ─── 복구 실패 시 (10초 초과) ───                               │
│                                                                 │
│  5. Degraded Mode 전환                                          │
│     - Ring Buffer 오디오를 Whisper API로 batch STT              │
│     - 텍스트 결과를 GPT-4o-mini로 번역                         │
│     - 실시간성은 포기하되 내용 누락 방지                        │
│     - User에게 "일시적으로 자막이 지연됩니다" 알림              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 비즈니스 로직 Blocking 시나리오별 대응

```
┌─────────────────────────────────────────────────────────────────┐
│  Blocking Scenario Handling                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  시나리오 1: Guardrail 교정 지연 (Session A, User→수신자)       │
│  ──────────────────────────────────────────────────────────      │
│  상황: User가 말한 내용의 존댓말 교정이 느림                    │
│  영향: 수신자에게 전달되는 음성이 지연됨                        │
│  대응:                                                          │
│    - Session A의 Realtime API가 자체적으로 STT+번역+TTS를      │
│      단일 패스로 처리하므로 보통 이 시나리오는 발생하지 않음    │
│    - 만약 Fallback LLM을 별도 호출해야 하는 경우:              │
│      → 수신자에게 "잠시만요" 필러 오디오 재생                  │
│      → Fallback 완료 후 교정된 음성 전송                       │
│                                                                 │
│  시나리오 2: Translation 지연 (Session B, 수신자→User)          │
│  ──────────────────────────────────────────────────────────      │
│  상황: 수신자의 한국어를 영어로 번역하는 데 시간이 걸림         │
│  영향: User에게 자막이 지연됨                                   │
│  대응:                                                          │
│    - 원본 한국어 STT 텍스트를 먼저 표시 (Layer 2 Transcript)    │
│    - 번역 완료 시 영어 번역을 아래에 추가 표시                  │
│    - 2단계 자막: [즉시] 한국어 원문 → [0.5초 후] 영어 번역     │
│                                                                 │
│  시나리오 3: DB 저장 지연                                        │
│  ──────────────────────────────────────────────────────────      │
│  상황: Supabase에 트랜스크립트 저장이 느림                       │
│  영향: 없음 (오디오/자막 전달에 영향 없어야 함)                 │
│  대응:                                                          │
│    - DB 저장은 fire-and-forget 방식                             │
│    - 메모리 큐에 먼저 적재, 배치로 DB 저장                      │
│    - 통화 종료 후 최종 일괄 저장으로 정합성 보장                │
│                                                                 │
│  시나리오 4: Twilio Media Stream 끊김                           │
│  ──────────────────────────────────────────────────────────      │
│  상황: 네트워크 불안정으로 Twilio 스트림이 끊김                  │
│  영향: 수신자 오디오 수신 불가                                   │
│  대응:                                                          │
│    - Twilio 자동 재연결 (Media Stream은 기본 재연결 지원)       │
│    - 재연결 동안 User에게 "연결 복구 중..." 표시                │
│    - 3회 실패 시 통화 종료 + 결과 저장                          │
│                                                                 │
│  시나리오 5: OpenAI Rate Limit / 일시 장애                      │
│  ──────────────────────────────────────────────────────────      │
│  상황: OpenAI API에서 429 또는 5xx 에러                         │
│  영향: STT/번역/TTS 모두 중단                                   │
│  대응:                                                          │
│    - Ring Buffer가 오디오를 계속 보관 (최대 30초)               │
│    - Exponential backoff로 재연결 시도 (1초→2초→4초)           │
│    - 10초 이내 복구: Ring Buffer catch-up 후 정상 복귀          │
│    - 10초 초과: Degraded Mode (Whisper batch STT + GPT 번역)   │
│    - 30초 초과: 통화를 유지하되 "직접 통화" 모드 전환 안내      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 Fallback LLM 교정 로직

OpenAI Realtime API의 System Prompt만으로 존댓말/해요체 교정이 부정확한 경우,
별도 LLM을 호출하여 교정하는 Fallback 레이어다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Guardrail + Fallback Flow (Session A: User→수신자)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌──────────────────────┐    ┌───────────────┐ │
│  │ User    │    │ OpenAI Realtime API   │    │ Twilio        │ │
│  │ (영어)  │───►│ Session A             │───►│ (수신자)      │ │
│  └─────────┘    │                       │    └───────────────┘ │
│                 │ STT → 번역 → TTS      │                      │
│                 │                       │                      │
│                 │ ┌───────────────────┐ │                      │
│                 │ │ Guardrail Check   │ │                      │
│                 │ │ (System Prompt    │ │                      │
│                 │ │  내장 교정)       │ │                      │
│                 │ └─────────┬─────────┘ │                      │
│                 └───────────┼───────────┘                      │
│                             │                                   │
│              ┌──────────────┼──────────────┐                   │
│              │              │              │                    │
│              ▼              ▼              ▼                    │
│         [Level 1]      [Level 2]      [Level 3]               │
│         자동 PASS      의심 구간       명확한 오류              │
│                                                                 │
│  Level 1: 자동 PASS (90%+ 케이스)                               │
│  ─────────────────────────────────                              │
│  - Realtime API가 System Prompt에 따라 올바르게 번역/교정      │
│  - 추가 처리 없이 바로 TTS → Twilio로 전달                     │
│  - 지연: 0ms (추가 지연 없음)                                   │
│                                                                 │
│  Level 2: 의심 구간 (5-8% 케이스)                               │
│  ─────────────────────────────────                              │
│  - 텍스트 델타 검사에서 반말/비격식 패턴이 매칭된 경우          │
│  - 규칙 기반 필터(정규식)로 감지                                │
│  - 동작:                                                       │
│    1. TTS 출력은 일단 Twilio로 전달 (지연 방지)                │
│    2. 동시에 Fallback LLM에 교정 요청 (비동기)                 │
│    3. 교정 결과가 다르면 → 로그에 기록 (학습 데이터)           │
│    4. 다음 턴부터 교정된 패턴 적용                              │
│  - 지연: 0ms (비동기 검증이므로 실시간 출력에 영향 없음)       │
│                                                                 │
│  Level 3: 명확한 오류 (2-5% 케이스)                             │
│  ─────────────────────────────────                              │
│  - 번역 결과에 욕설, 부적절한 표현, 심각한 문법 오류가 감지    │
│  - 규칙 기반 필터로 사전 차단 (정규식 + 금지어 사전)           │
│  - 동작:                                                       │
│    1. TTS 출력을 Twilio로 전달하지 않음 (차단)                 │
│    2. 수신자에게 "잠시만요" 필러 오디오 재생                    │
│    3. Fallback LLM (GPT-4o-mini)에 교정 요청 (동기)            │
│    4. 교정된 텍스트로 TTS 재생성                                │
│    5. 교정된 오디오를 Twilio로 전달                             │
│  - 지연: ~500-800ms (Fallback LLM 호출 시간)                   │
│                                                                 │
│  Fallback LLM 호출 스펙:                                        │
│  ─────────────────────                                          │
│  Model: gpt-4o-mini                                             │
│  Temperature: 0                                                 │
│  Max Tokens: 200                                                │
│  System Prompt:                                                 │
│    "당신은 한국어 교정 전문가입니다.                             │
│     입력된 한국어 문장을 해요체(존댓말)로 교정하세요.           │
│     원래 의미를 변경하지 마세요.                                │
│     반말, 비격식 표현, 문법 오류만 수정하세요."                 │
│                                                                 │
│  Timeout: 2000ms (2초 초과 시 원문 그대로 전달)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Guardrail 규칙 기반 필터

> **M-2 반영**: OpenAI Realtime API는 번역 confidence score를 제공하지 않는다.
> Level 분류는 **텍스트 델타 검사 + 규칙 기반 매칭**으로만 수행한다.

| 카테고리 | 패턴 | 동작 |
|---------|------|------|
| 반말 감지 | `~해`, `~야`, `~냐`, `~거든` (문장 끝) | Level 2: 비동기 교정 |
| 욕설/비속어 | 금지어 사전 매칭 | Level 3: 차단 + 동기 교정 |
| 명령형 | `~해라`, `~하세요` 대신 `~해주세요` | Level 2: 비동기 교정 |
| 호칭 오류 | 이름 직접 호칭 대신 "사장님", "선생님" 등 | Level 2: 비동기 교정 |
| 문화적 부적절 | 한국 비즈니스 맥락에서 부적절한 표현 | Level 2: 비동기 교정 |

#### 텍스트 델타 검사 메커니즘

```
OpenAI Realtime API (modalities: ["text", "audio"])
  │
  ├── response.text.delta (텍스트 먼저 도착)
  │     └─→ Guardrail Checker: 100자 단위로 규칙 필터 매칭
  │           ├─ 매칭 없음 → Level 1 PASS
  │           ├─ 반말/비격식 매칭 → Level 2
  │           └─ 금지어/욕설 매칭 → Level 3 → TTS 오디오 차단
  │
  └── response.audio.delta (오디오 약간 후에 도착)
        └─→ Level 3인 경우: 오디오를 Twilio로 전달하지 않음
            Level 1-2인 경우: 오디오를 Twilio로 정상 전달
```

> **핵심**: `modalities: ["text", "audio"]` 설정 시 텍스트 델타가 오디오보다 먼저 도착하므로,
> 오디오가 Twilio로 전달되기 전에 텍스트를 검사하여 차단할 수 있다.

---

## 6. Functional Requirements

| ID | Requirement | Priority | Dependencies | VAD 관련 |
|----|------------|----------|--------------|----------|
| FR-001 | OpenAI Realtime API WebSocket 연결 관리 (Dual Session) | P0 (Must) | - | - |
| FR-002 | Twilio Outbound Call 발신 (REST API) | P0 (Must) | - | - |
| FR-003 | Twilio Media Stream ↔ OpenAI Session 오디오 라우팅 | P0 (Must) | FR-001, FR-002 | Server VAD |
| FR-004 | Session A: User 음성 → 한국어 번역 → TTS → Twilio | P0 (Must) | FR-001 | Client VAD |
| FR-005 | Session B: Twilio 오디오 → 한국어 STT → 번역 → User 자막 | P0 (Must) | FR-003 | Server VAD |
| FR-006 | Client-side VAD 구현 (React Native Audio API) | P0 (Must) | - | Client VAD |
| FR-007 | Push-to-Talk 모드 (Chat-to-Voice) | P0 (Must) | FR-001 | PTT |
| FR-008 | 실시간 자막 UI (양방향) | P0 (Must) | FR-005 | - |
| FR-009 | Ring Buffer (30초 오디오 보관) | P0 (Must) | FR-003 | - |
| FR-010 | Session 장애 복구 (Recovery Flow) | P1 (Should) | FR-009 | - |
| FR-011 | Guardrail Level 1-3 교정 로직 | P1 (Should) | FR-004 | - |
| FR-012 | Fallback LLM 교정 (GPT-4o-mini) | P1 (Should) | FR-011 | - |
| FR-013 | Degraded Mode (Whisper batch STT fallback) | P2 (Could) | FR-009 | - |
| FR-014 | Function Calling (예약 확인, 장소 검색) | P1 (Should) | FR-001 | - |
| FR-015 | 통화 트랜스크립트 실시간 저장 | P1 (Should) | FR-005 | - |
| FR-016 | 통화 결과 자동 판정 (Tool Call 기반) | P1 (Should) | FR-014 | - |
| FR-017 | VAD 모드 자동 선택 (사용자 프로필 기반) | P2 (Could) | FR-006, FR-007 | - |
| FR-018 | 비용 모니터링 대시보드 (토큰 사용량 추적) | P2 (Could) | - | - |
| FR-019 | Turn Overlap/Interrupt 처리 (response.cancel + 우선순위) | P1 (Should) | FR-001, FR-003 | - |
| FR-020 | 최대 통화 시간 제한 (10분) + 경고 알림 (8분) | P1 (Should) | FR-008 | - |
| FR-021 | 접근성: 자막 폰트 크기 조절, 진동 피드백, 고대비 모드 | P1 (Should) | FR-008 | - |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| User 발화 → 수신자 전달 (E2E) | < 1500ms (p95) | Client VAD onset → Twilio audio out |
| 수신자 발화 → User 자막 표시 | < 1000ms (p95) | Twilio audio in → App text render |
| Guardrail Level 1 교정 | 0ms 추가 지연 | Realtime API 내장 |
| Guardrail Level 3 교정 (Fallback) | < 800ms | Fallback LLM 호출 완료 |
| Session 장애 감지 | < 3초 | WebSocket error/close → recovery start |
| Session 복구 완료 | < 10초 | Recovery start → normal streaming |
| Ring Buffer catch-up | < 5초 | 미전송 오디오 STT 배치 처리 완료 |

### 7.2 Reliability

| Metric | Target |
|--------|--------|
| 통화 성공률 (전화 연결) | > 95% |
| 번역 정확도 (의미 보존) | > 90% |
| 존댓말 준수율 | > 95% (Guardrail 포함) |
| 오디오 누락률 | < 1% (Ring Buffer 보장) |
| Session 복구 성공률 | > 90% |

### 7.3 Call Duration Limits

> **M-3 반영**: 무제한 통화 시 비용 폭발 위험을 방지한다.

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| `MAX_CALL_DURATION_MS` | 600,000 (10분) | 최대 통화 시간 |
| `CALL_WARNING_AT_MS` | 480,000 (8분) | User에게 "2분 남았습니다" 경고 |
| `CALL_AUTO_END_AT_MS` | 600,000 (10분) | 자동 종료 + 결과 저장 |
| `CALL_IDLE_TIMEOUT_MS` | 30,000 (30초) | 양쪽 모두 30초간 발화 없으면 "통화를 종료할까요?" 확인 |

#### 통화 시간 초과 시퀀스

```
통화 시작 (0분)
    │
    ├── 8분 경과
    │   → User 앱에 "2분 남았습니다" 알림 (시각적 + 진동)
    │   → 수신자에게는 알리지 않음 (대화 흐름 유지)
    │
    ├── 9분 30초 경과
    │   → User 앱에 "30초 후 통화가 종료됩니다" 알림
    │
    └── 10분 경과
        → Session A가 수신자에게 인사: "감사합니다, 좋은 하루 보내세요"
        → Twilio 통화 종료
        → 결과 DB 저장 (auto_ended: true)
```

### 7.4 Cost

| 항목 | 예상 비용 | 비고 |
|------|----------|------|
| OpenAI Realtime (Session A) | ~$0.15/분 | Client VAD로 오디오 입력 절감 |
| OpenAI Realtime (Session B) | ~$0.20/분 | Server VAD (Twilio 오디오 전량 수신) |
| Twilio 통화료 | ~$0.02/분 | 한국 PSTN 아웃바운드 |
| Fallback LLM (Level 3) | ~$0.001/건 | GPT-4o-mini, 200 토큰 이하 |
| **총 예상 비용** | **~$0.37/분** | Client VAD 적용 시 |
| 비용 절감 (VAD 미적용 대비) | **-40~50%** | 무음 구간 오디오 미전송 |
| System Prompt 토큰 | ~$0.01-0.03/턴 | 매 턴마다 재전송됨 (Cached Input 할인 적용 시 감소) |

> **Note**: 위 비용 추정은 System Prompt 토큰 비용을 포함하지 않은 순수 오디오 비용이다.
> OpenAI Realtime API는 매 턴마다 System Prompt를 입력 토큰으로 재전송하므로,
> System Prompt 길이를 최소화하고 **Cached Audio Input** ($0.40/1M tokens) 할인을 활용해야 한다.

### 7.5 Security

- Twilio 전화번호는 환경변수로 관리 (TWILIO_PHONE_NUMBER)
- OpenAI API Key는 Relay Server에서만 사용 (앱에 노출 금지)
- Supabase Auth JWT로 Relay Server API 인증
- 통화 트랜스크립트는 Supabase RLS로 본인 데이터만 접근
- 금지어 사전은 Relay Server에서 관리 (클라이언트 노출 방지)

### 7.6 Accessibility (접근성)

> **M-7 반영**: 장애인 사용자가 핵심 타겟이므로 접근성은 필수 요구사항이다.

| 요구사항 | 대상 | 구현 |
|---------|------|------|
| 자막 폰트 크기 조절 | 청각 장애인 | 설정에서 14px ~ 28px 슬라이더 |
| 고대비 모드 | 시각 약자 | 다크/라이트 + 고대비 옵션 |
| 진동 피드백 | 청각 장애인 | 수신자 발화 시작/종료 시 진동 |
| 큰 터치 영역 | 운동 장애 | Push-to-Talk 버튼 최소 48x48dp |
| 스크린 리더 호환 | 시각 장애인 | VoiceOver/TalkBack 레이블 적용 |
| 키보드 단축키 (텍스트 입력) | 언어 장애인 | Enter: 전송, Shift+Enter: 줄바꿈 |
| 자동 스크롤 자막 | 청각 장애인 | 자막 영역 자동 스크롤 + 수동 스크롤 시 멈춤 |

---

## 8. Technical Design

### 8.1 System Prompt 설계

#### Session A — Relay Mode: User→수신자 (실시간 번역기)

> 외국인/한국인 Voice-to-Voice 시나리오. User의 말을 번역만 수행.

```
You are a real-time phone translator.
You translate the user's speech from {{sourceLanguage}} to {{targetLanguage}}.

## Core Rules
1. Translate ONLY what the user says. Do NOT add your own words.
2. {{politeness_rules}}
3. Output ONLY the direct translation. No commentary, no suggestions.
4. Adapt cultural expressions naturally:
   {{cultural_adaptation_rules}}
5. For place names, use the local name (e.g., "Gangnam Station" → "강남역").
6. For proper nouns without local equivalents, transliterate them.

## Context
You are making a phone call to {{target_name}} on behalf of the user.
Purpose: {{scenario_type}} - {{service}}
Customer Name: {{customer_name}}

## First Message (AI 고지 — 자동 생성)
{{first_message_template}}

## CRITICAL: You are a TRANSLATOR, not a conversationalist.
- Do NOT answer questions from the recipient on your own.
- Do NOT make decisions on behalf of the user.
- If the recipient asks something, translate it to the user and wait.
```

**Dynamic Prompt Variables** (sourceLanguage/targetLanguage별 주입):

| sourceLanguage | targetLanguage | politeness_rules | cultural_adaptation_rules |
|---------------|---------------|-----------------|--------------------------|
| en | ko | "ALWAYS use polite Korean (해요체/존댓말). Use '사장님', '선생님' for addressing." | "Use indirect requests: '~해주실 수 있을까요?'" |
| ko | en | "Use polite, professional English. Use 'sir', 'ma'am' when appropriate." | "Convert Korean-specific terms with context: '만원' → '10,000 won (~$7.50)'" |

#### Session A — Agent Mode: AI 자율 통화 (장애인용)

> Chat-to-Voice 시나리오. 수집된 정보 기반으로 AI가 통화 진행.

```
You are an AI phone assistant making a call on behalf of a user who cannot speak.

## Core Rules
1. Use polite {{targetLanguage}} speech at all times.
2. Complete the task based on the collected information below.
3. If the recipient asks something you don't have the answer to,
   say "잠시만요, 확인하고 말씀드릴게요" and wait for the user's text input.
4. Keep responses concise and natural, like a real phone conversation.

## Collected Information
{{collected_data_json}}

## Task
{{scenario_type}}: {{service}}
Target: {{target_name}} ({{target_phone}})

## Conversation Strategy
1. Greet and state the purpose.
2. Provide collected information as needed.
3. Confirm details when asked.
4. Thank and close when task is complete.

## When You Don't Know the Answer
- Say a filler phrase: "잠시만요, 확인해 볼게요."
- Wait for text input from the user via conversation.item.create.
- Relay the user's text response naturally in speech.
```

#### Session B: 수신자→User (번역)

```
You are a real-time translator.
You translate the recipient's speech from {{targetLanguage}} to {{sourceLanguage}}.

## Core Rules
1. Translate what the recipient says into natural {{sourceLanguage}}.
2. Output ONLY the direct translation.
3. Preserve the speaker's intent, tone, and urgency.
4. For culture-specific terms, add brief context in parentheses:
   {{term_explanation_rules}}
5. For time/currency references, convert to the user's context.

## Do NOT:
- Add your own opinions or suggestions.
- Summarize or skip parts of the conversation.
- Respond to the recipient (you are only translating).
```

**Session B Dynamic Variables**:

| targetLanguage | sourceLanguage | term_explanation_rules |
|---------------|---------------|----------------------|
| ko | en | "'만원' → '10,000 won (~$7.50)', '평' → 'pyeong (3.3 sq meters)'" |
| en | ko | "'deposit' → '보증금(deposit)', 'lease' → '임대 계약(lease)'" |

### 8.2 API Specification

#### `POST /relay/calls/start` — 전화 발신 + Realtime Session 시작

> **Relay Server** (Fastify) 엔드포인트. React Native 앱에서 직접 호출.

**Description**: 수집된 정보를 기반으로 Twilio 전화를 걸고, OpenAI Realtime API Dual Session을 초기화한다.

**Authentication**: Required (Supabase Auth JWT)

**Request Body**:
```json
{
  "callId": "string (required) - 통화 레코드 ID",
  "mode": "string (required) - 'relay' | 'agent'",
  "callMode": "string (required) - 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text'",
  "sourceLanguage": "string (required) - 사용자 언어 ('en' | 'ko')",
  "targetLanguage": "string (required) - 수신자 언어 ('ko' | 'en')",
  "collectedData": "object (optional) - Agent Mode시 수집된 대화 정보"
}
```

**Response 200 OK**:
```json
{
  "success": true,
  "data": {
    "callSid": "string - Twilio Call SID",
    "sessionA": {
      "id": "string - OpenAI Session A ID",
      "status": "connected"
    },
    "sessionB": {
      "id": "string - OpenAI Session B ID",
      "status": "connected"
    },
    "relayWsUrl": "string - Relay Server WebSocket URL",
    "mode": "string - 'relay' | 'agent'",
    "callMode": "string - 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text'"
  }
}
```

**Error Responses**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | INVALID_MODE | Invalid call mode | 지원하지 않는 모드 |
| 400 | MISSING_DATA | Collected data incomplete | 필수 정보 누락 |
| 401 | UNAUTHORIZED | Authentication required | 인증 필요 |
| 404 | CALL_NOT_FOUND | Call record not found | 통화 레코드 없음 |
| 502 | TWILIO_ERROR | Failed to initiate call | Twilio 발신 실패 |
| 502 | OPENAI_ERROR | Failed to create session | OpenAI 세션 생성 실패 |

#### `WebSocket /relay/calls/:id/stream` — 실시간 오디오/텍스트 스트리밍

> **Relay Server** (Fastify + @fastify/websocket) WebSocket 엔드포인트.

**Description**: React Native 앱과 Relay Server 간 양방향 WebSocket 연결. 오디오 전송 및 실시간 자막 수신.

**Client → Server Messages**:

| Type | Payload | VAD 모드 |
|------|---------|----------|
| `audio.chunk` | `{ audio: base64, timestamp: number }` | Client VAD: 음성 감지 시에만 전송 |
| `audio.commit` | `{ timestamp: number }` | Client VAD: 발화 종료 시 전송 |
| `text.send` | `{ text: string }` | Push-to-Talk: 텍스트 전송 |
| `vad.speech_start` | `{ timestamp: number }` | Client VAD: 발화 시작 알림 |
| `vad.speech_end` | `{ timestamp: number }` | Client VAD: 발화 종료 알림 |
| `call.end` | `{}` | 통화 종료 요청 |

**Server → Client Messages**:

| Type | Payload | 설명 |
|------|---------|------|
| `transcript.user` | `{ text: string, language: string, timestamp: number }` | User 발화 텍스트 (원어) |
| `transcript.user.translated` | `{ text: string, language: string, timestamp: number }` | User 발화 번역 텍스트 |
| `transcript.recipient` | `{ text: string, language: string, timestamp: number }` | 수신자 발화 텍스트 (원어) |
| `transcript.recipient.translated` | `{ text: string, language: string, timestamp: number }` | 수신자 발화 번역 텍스트 |
| `audio.recipient` | `{ audio: base64 }` | 수신자 원본 오디오 (청각장애인용) |
| `audio.recipient.translated` | `{ audio: base64 }` | 번역된 오디오 (외국인용) |
| `call.status` | `{ status: string, message?: string }` | 통화 상태 변경 |
| `session.recovery` | `{ status: string, gap_ms: number }` | 세션 복구 상태 |
| `guardrail.triggered` | `{ level: number, original: string, corrected?: string }` | 교정 트리거 알림 (디버그용) |
| `error` | `{ code: string, message: string }` | 에러 |

### 8.3 Database Schema Changes

기존 `calls` 테이블에 v3 필드를 추가한다.

```sql
-- v3 추가 필드
ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  call_mode TEXT DEFAULT 'legacy';
  -- 'legacy' (v2 ElevenLabs), 'voice-to-voice', 'chat-to-voice', 'voice-to-text'

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  source_language TEXT DEFAULT 'ko';

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  target_language TEXT DEFAULT 'ko';

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  twilio_call_sid TEXT;

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  session_a_id TEXT;

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  session_b_id TEXT;

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  transcript_bilingual JSONB DEFAULT '[]';
  -- [{role, original_text, translated_text, language, timestamp}]

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  vad_mode TEXT DEFAULT 'server';
  -- 'client', 'server', 'push-to-talk'

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  cost_tokens JSONB DEFAULT '{}';
  -- {audio_input: number, audio_output: number, text_input: number, text_output: number}

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  guardrail_events JSONB DEFAULT '[]';
  -- [{level, original, corrected, timestamp}]

ALTER TABLE calls ADD COLUMN IF NOT EXISTS
  recovery_events JSONB DEFAULT '[]';
  -- [{type, gap_ms, status, timestamp}]
```

### 8.4 File Structure (Split Architecture)

> React Native 앱과 Fastify Relay Server를 모노레포 또는 별도 레포로 구성.

```
wigtn-voice-only/
├── apps/
│   ├── mobile/                            # React Native App (Expo)
│   │   ├── app/                           # Expo Router 파일 기반 라우팅
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx              # 홈 (대화 시작)
│   │   │   │   ├── calls.tsx              # 통화 기록
│   │   │   │   └── settings.tsx           # 설정
│   │   │   ├── call/
│   │   │   │   └── [id].tsx               # 실시간 통화 화면
│   │   │   └── chat/
│   │   │       └── [id].tsx               # 채팅 수집 화면
│   │   ├── components/
│   │   │   ├── call/
│   │   │   │   ├── RealtimeCallView.tsx   # v3 통화 UI (자막 + 오디오)
│   │   │   │   ├── LiveCaptionPanel.tsx   # 실시간 자막 패널
│   │   │   │   ├── VadIndicator.tsx       # VAD 상태 표시
│   │   │   │   ├── PushToTalkInput.tsx    # Push-to-Talk 텍스트 입력
│   │   │   │   └── CallStatusOverlay.tsx  # 통화 상태 오버레이
│   │   │   └── chat/
│   │   │       └── ...                    # 기존 채팅 컴포넌트
│   │   ├── hooks/
│   │   │   ├── useRealtimeCall.ts         # Realtime 통화 관리 훅
│   │   │   ├── useClientVad.ts            # Client-side VAD 훅
│   │   │   ├── useLiveCaption.ts          # 실시간 자막 관리 훅
│   │   │   └── useRelayWebSocket.ts       # Relay Server WS 연결 관리
│   │   ├── lib/
│   │   │   ├── vad/
│   │   │   │   ├── client-vad.ts          # Client-side VAD 로직
│   │   │   │   └── vad-config.ts          # VAD 파라미터 설정
│   │   │   ├── audio/
│   │   │   │   ├── recorder.ts            # React Native 오디오 녹음
│   │   │   │   └── player.ts              # React Native 오디오 재생
│   │   │   └── supabase/                  # Supabase 클라이언트
│   │   ├── app.json
│   │   └── package.json
│   │
│   └── relay-server/                      # Fastify Relay Server
│       ├── src/
│       │   ├── server.ts                  # Fastify 서버 엔트리
│       │   ├── routes/
│       │   │   ├── calls.ts               # POST /relay/calls/start
│       │   │   ├── stream.ts              # WS /relay/calls/:id/stream
│       │   │   └── twilio-webhook.ts      # POST /relay/twilio/voice, /status
│       │   ├── realtime/
│       │   │   ├── session-manager.ts     # Dual Session lifecycle 관리
│       │   │   ├── session-a.ts           # Session A (User→수신자) 설정
│       │   │   ├── session-b.ts           # Session B (수신자→User) 설정
│       │   │   ├── audio-router.ts        # Twilio ↔ OpenAI 오디오 라우팅
│       │   │   ├── ring-buffer.ts         # Ring Buffer 구현 (30초)
│       │   │   ├── recovery.ts            # Session 장애 복구 로직
│       │   │   └── first-message.ts       # AI 고지 + First Message 처리
│       │   ├── guardrail/
│       │   │   ├── checker.ts             # Level 1-3 분류 로직
│       │   │   ├── filter.ts              # 규칙 기반 필터 (금지어, 반말 감지)
│       │   │   ├── fallback-llm.ts        # Fallback LLM 교정 호출
│       │   │   └── dictionary.ts          # 금지어/교정 사전
│       │   ├── twilio/
│       │   │   ├── outbound.ts            # Twilio 아웃바운드 콜 발신
│       │   │   ├── media-stream.ts        # Media Stream WebSocket 핸들러
│       │   │   └── twiml.ts               # TwiML 생성
│       │   ├── prompt/
│       │   │   ├── generator-v3.ts        # v3 System Prompt 생성기
│       │   │   └── templates.ts           # 언어별 프롬프트 템플릿
│       │   ├── types.ts                   # 공유 타입 정의
│       │   └── config.ts                  # 환경변수 + 설정 관리
│       ├── Dockerfile                     # Railway/Fly.io 배포용
│       └── package.json
│
├── packages/
│   └── shared/                            # 공유 타입/상수 (모노레포 시)
│       ├── types.ts
│       └── constants.ts
│
├── docs/                                  # 기존 문서
└── ...                                    # 기존 Next.js 웹앱 (v2, deprecated)
```

---

## 9. Implementation Phases

### Phase 1: Core Relay (MVP) — P0

Fastify Relay Server + Push-to-Talk 기본 양방향 번역 통화.

- [ ] **Relay Server 초기화**: Fastify + @fastify/websocket 프로젝트 셋업
- [ ] Twilio 환경 설정 (SDK, 환경변수, 전화번호)
- [ ] Twilio Outbound Call REST API 발신 구현 (`relay-server/src/twilio/outbound.ts`)
- [ ] Twilio TwiML webhook 엔드포인트 (`relay-server/src/routes/twilio-webhook.ts`)
- [ ] Twilio Media Stream WebSocket 핸들러 (`relay-server/src/twilio/media-stream.ts`)
- [ ] Twilio status callback 엔드포인트
- [ ] OpenAI Realtime API WebSocket 연결 관리 (`relay-server/src/realtime/session-manager.ts`)
- [ ] Session A 구현: 텍스트 입력 → targetLanguage TTS → Twilio
- [ ] Session B 구현: Twilio 오디오 → STT → sourceLanguage 번역
- [ ] 오디오 라우터: Twilio ↔ OpenAI 양방향 포워딩 (`relay-server/src/realtime/audio-router.ts`)
- [ ] v3 System Prompt 생성기 (Relay/Agent 모드별, 양방향 언어)
- [ ] First Message Strategy 구현 (AI 고지 + 수신자 인사 대기)
- [ ] 통화 시작 API (`POST /relay/calls/start`)
- [ ] WebSocket 스트리밍 엔드포인트 (`WS /relay/calls/:id/stream`)
- [ ] **React Native 앱 초기화**: Expo 프로젝트 셋업
- [ ] 기본 실시간 자막 UI (`mobile/components/call/LiveCaptionPanel.tsx`)
- [ ] Push-to-Talk 입력 UI (`mobile/components/call/PushToTalkInput.tsx`)
- [ ] 통화 뷰 컴포넌트 (`mobile/components/call/RealtimeCallView.tsx`)
- [ ] Relay Server WebSocket 연결 훅 (`mobile/hooks/useRelayWebSocket.ts`)
- [ ] 통화 종료 + 결과 DB 저장
- [ ] Feature Flag 분기 (CALL_MODE=realtime | elevenlabs)

**Deliverable**: React Native 앱에서 Push-to-Talk으로 기본 양방향 번역 통화 가능

### Phase 2: Voice Mode + Client-side VAD — P0

Voice-to-Voice 모드와 React Native Client-side VAD 구현.

- [ ] React Native 오디오 캡처 구현 (`expo-av` 또는 `react-native-audio-api`)
- [ ] Client-side VAD 로직 구현 (`mobile/lib/vad/client-vad.ts`)
- [ ] VAD 설정 파라미터 관리 (`mobile/lib/vad/vad-config.ts`)
- [ ] Pre-speech Ring Buffer (300ms) 구현
- [ ] VAD 상태 머신 (SILENT → SPEAKING → COMMITTED)
- [ ] `useClientVad` 커스텀 훅 (`mobile/hooks/useClientVad.ts`)
- [ ] VAD 상태 시각화 (`mobile/components/call/VadIndicator.tsx`)
- [ ] Session A: 음성 입력 모드 추가 (Client VAD → Relay Server → OpenAI)
- [ ] 모드 선택 UI (Voice-to-Voice / Chat-to-Voice / Voice-to-Text)
- [ ] `useRealtimeCall` 훅 통합 (`mobile/hooks/useRealtimeCall.ts`)

**Deliverable**: 외국인 사용자가 영어로 말하면 한국어로 번역되어 전화 통화

### Phase 3: Non-blocking Pipeline + Recovery — P1

안정성과 품질 보장 레이어 구현.

- [ ] Ring Buffer 구현 — 30초 오디오 보관 (`relay-server/src/realtime/ring-buffer.ts`)
- [ ] 시퀀스 번호 추적 (lastSent, lastReceived)
- [ ] Session 장애 감지 (WebSocket close/error, heartbeat timeout)
- [ ] Session 자동 재연결 (exponential backoff)
- [ ] Ring Buffer catch-up (미전송 오디오를 STT-only 배치 처리)
- [ ] Conversation context 복원 (이전 transcript 주입)
- [ ] Degraded Mode 전환 (Whisper batch STT fallback)
- [ ] 통화 상태 오버레이 UI (`mobile/components/call/CallStatusOverlay.tsx`)
- [ ] Recovery 이벤트 로깅 (recovery_events JSONB)

**Deliverable**: 장애 상황에서도 오디오 누락 없이 통화 유지

### Phase 4: Guardrail + Fallback LLM — P1

번역 품질 보장 레이어 구현.

- [ ] Guardrail Level 분류 로직 (`relay-server/src/guardrail/checker.ts`)
- [ ] 규칙 기반 필터 — 반말, 욕설, 비격식 감지 (`relay-server/src/guardrail/filter.ts`)
- [ ] 금지어/교정 사전 (`relay-server/src/guardrail/dictionary.ts`)
- [ ] Fallback LLM 교정 호출 — GPT-4o-mini (`relay-server/src/guardrail/fallback-llm.ts`)
- [ ] Level 1: 자동 PASS (추가 처리 없음)
- [ ] Level 2: 비동기 검증 (TTS 출력 후 백그라운드 교정)
- [ ] Level 3: 동기 차단 (필러 오디오 + 교정 후 재전송)
- [ ] Guardrail 이벤트 로깅 (guardrail_events JSONB)
- [ ] 필러 오디오 생성/관리 ("잠시만요" 등)

**Deliverable**: 번역 품질 보장 + 부적절 표현 차단

### Phase 5: DB Migration + Cost Tracking + Polish — P2

비용 최적화와 UX 개선.

- [ ] DB 스키마 마이그레이션 (v3 필드 추가)
- [ ] 양쪽 언어 트랜스크립트 저장 (transcript_bilingual)
- [ ] 비용 토큰 추적 (cost_tokens JSONB)
- [ ] Function Calling 구현 (예약 확인, 장소 검색)
- [ ] 통화 결과 자동 판정 (Tool Call 기반)
- [ ] 2단계 자막 (원문 즉시 → 번역 0.5초 후)
- [ ] ElevenLabs 코드 정리 (deprecated 마킹)
- [ ] E2E 테스트 시나리오 작성

**Deliverable**: 최적화된 비용, 완성된 UX, 데이터 인사이트

---

## 10. Environment Variables (v3)

### Relay Server (`apps/relay-server/.env`)

```env
# ── Server ──
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# ── OpenAI (필수) ──
OPENAI_API_KEY=sk-...

# ── Twilio (필수) ──
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...        # E.164 형식 발신 번호
TWILIO_WEBHOOK_BASE_URL=https://relay.your-domain.com  # Twilio webhook URL

# ── Supabase (서버에서 DB 접근용) ──
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...    # 서버 전용 (service role)

# ── Feature Flags ──
CALL_MODE=realtime               # 'realtime' (v3) | 'elevenlabs' (v2 호환)
DEFAULT_SOURCE_LANGUAGE=en
DEFAULT_TARGET_LANGUAGE=ko

# ── Guardrail ──
GUARDRAIL_ENABLED=true
GUARDRAIL_FALLBACK_MODEL=gpt-4o-mini
GUARDRAIL_FALLBACK_TIMEOUT_MS=2000

# ── 기존 (v2 호환, deprecated) ──
ELEVENLABS_API_KEY=...           # v2 호환 시에만 필요
ELEVENLABS_AGENT_ID=...
ELEVENLABS_PHONE_NUMBER_ID=...
```

### React Native App (`apps/mobile/.env`)

```env
# ── Supabase (클라이언트용) ──
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...

# ── Relay Server ──
EXPO_PUBLIC_RELAY_SERVER_URL=https://relay.your-domain.com
EXPO_PUBLIC_RELAY_WS_URL=wss://relay.your-domain.com

# ── VAD 설정 (앱 내 Client-side VAD) ──
EXPO_PUBLIC_VAD_SPEECH_THRESHOLD=0.015
EXPO_PUBLIC_VAD_SILENCE_THRESHOLD=0.008
EXPO_PUBLIC_VAD_SPEECH_ONSET_DELAY_MS=200
EXPO_PUBLIC_VAD_SPEECH_END_DELAY_MS=500
EXPO_PUBLIC_VAD_PRE_BUFFER_MS=300

# ── Feature Flags ──
EXPO_PUBLIC_CALL_MODE=realtime
```

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| E2E 번역 지연 시간 | < 1.5초 (p95) | Client timestamp → Twilio output timestamp |
| 통화 성공률 | > 95% | 성공 통화 / 전체 시도 |
| 번역 정확도 (의미 보존) | > 90% | 수동 샘플링 검증 (100건/주) |
| 존댓말 준수율 | > 95% | Guardrail 로그 분석 |
| 오디오 누락률 | < 1% | Ring Buffer gap 로그 분석 |
| 비용 절감 (VAD) | > 40% | Client VAD 적용 전후 토큰 비용 비교 |
| Session 복구 성공률 | > 90% | 복구 성공 / 복구 시도 |
| 사용자 만족도 (해커톤) | 심사위원 긍정 평가 | 데모 피드백 |

---

## 12. Risk & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| 한국어 TTS 자연스러움 부족 | 수신자가 AI임을 바로 인지 | 중 | Realtime API voice 파라미터 튜닝, 필요 시 ElevenLabs TTS 하이브리드 |
| 번역 지연으로 대화 흐름 끊김 | UX 저하 | 중 | Client VAD + Pre-buffer로 지연 최소화, 필러 오디오 사용 |
| OpenAI Rate Limit | 통화 중단 | 낮 | Ring Buffer + Degraded Mode, exponential backoff |
| Twilio Media Stream 끊김 | 오디오 손실 | 낮 | 자동 재연결, Ring Buffer 보관 |
| VAD 오탐 (배경 소음) | 불필요한 오디오 전송, 비용 증가 | 중 | threshold 튜닝, 주파수 분석 병행, push-to-talk 전환 옵션 |
| Guardrail 과교정 | 원래 의미 변질 | 낮 | Level 2 비동기 검증으로 실시간 영향 최소화, 로그 기반 학습 |
| React Native 오디오 캡처 지연 | VAD 정확도 저하, 발화 시작 누락 | 중 | `expo-av` 대신 `react-native-audio-api` 네이티브 모듈 검토, Pre-buffer 300ms |
| React Native 백그라운드 제한 (iOS) | 앱 백그라운드시 오디오 중단 | 중 | iOS Background Audio Mode 활성화, `audio` background mode plist 설정 |
| Relay Server 단일 장애점 | 전체 통화 서비스 중단 | 중 | Railway/Fly.io 멀티 리전 배포, 헬스체크 + 자동 재시작 |
| 앱스토어 심사 거부 | 배포 지연 | 낮 | 통화 녹음/AI 고지 관련 개인정보처리방침 사전 준비 |

---

## 13. Migration Strategy (v2 → v3)

```
┌─────────────────────────────────────────────────────────────────┐
│  Migration Path                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase A: 플랫폼 전환 (웹 → 앱)                                │
│  ──────────────────────────────                                 │
│  - React Native (Expo) 프로젝트 신규 생성                      │
│  - 기존 Next.js 웹 UI/UX를 React Native로 재구현               │
│  - Supabase Auth/DB는 동일하게 사용 (클라이언트 변경만)         │
│  - 기존 웹앱은 v2 호환용으로 유지                                │
│                                                                 │
│  Phase B: Relay Server 구축 + Feature Flag 병행                 │
│  ──────────────────────────────                                 │
│  - Fastify Relay Server 배포 (Railway/Fly.io)                   │
│  - CALL_MODE=elevenlabs → 기존 v2 ElevenLabs 로직 사용         │
│  - CALL_MODE=realtime → 새 v3 Relay Server 연동                │
│  - 동일 DB, Relay Server가 Twilio+OpenAI 관리                  │
│                                                                 │
│  Phase C: v3 안정화 후 v2 제거                                  │
│  ──────────────────────────────                                 │
│  - v3가 모든 시나리오에서 안정적으로 동작 확인                   │
│  - ElevenLabs 관련 코드 제거                                    │
│  - 기존 Next.js 웹앱 deprecated                                 │
│  - CALL_MODE feature flag 제거                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. References

- [OpenAI Realtime API Guide](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime + Twilio Demo](https://github.com/openai/openai-realtime-twilio-demo)
- [Twilio Live Translation Sample](https://github.com/twilio-samples/live-translation-openai-realtime-api)
- [OpenAI Multi-Language Translation Cookbook](https://developers.openai.com/cookbook/examples/voice_solutions/one_way_translation_using_realtime_api/)
- [Twilio Outbound Calls + OpenAI Realtime (Node.js)](https://www.twilio.com/en-us/blog/outbound-calls-node-openai-realtime-api-voice)
- [OpenAI Realtime SIP Guide](https://platform.openai.com/docs/guides/realtime-sip)
- [기존 WIGVO PRD v2](./01_PRD.md)
- [기존 ElevenLabs 트러블슈팅](./11_ELEVENLABS_TWILIO_TROUBLESHOOTING.md)
