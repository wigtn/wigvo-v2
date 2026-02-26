# Web Frontend 소스코드 리뷰

> 대상: `apps/web/` | 분석일: 2026-02-27
> 목적: 현황 파악 + 리팩토링 방향 수립

---

## 목차

1. [프로젝트 구조 Overview](#1-프로젝트-구조-overview)
2. [스타일링 현황 & 문제점](#2-스타일링-현황--문제점)
3. [컴포넌트 크기 & 관심사 분리](#3-컴포넌트-크기--관심사-분리)
4. [상태 관리 현황](#4-상태-관리-현황)
5. [API Routes & 서버 로직](#5-api-routes--서버-로직)
6. [타입 & 에러 핸들링](#6-타입--에러-핸들링)
7. [테스트 현황](#7-테스트-현황)
8. [리팩토링 우선순위 로드맵](#8-리팩토링-우선순위-로드맵)

---

## 1. 프로젝트 구조 Overview

### 요약 수치

| 항목 | 수량 |
|------|------|
| 컴포넌트 (`components/**/*.tsx`) | 42개 |
| 페이지 (`app/**/page.tsx`) | 11개 |
| API 라우트 (`app/api/**/route.ts`) | 7개 (+1 auth callback) |
| 커스텀 훅 (`hooks/use*.ts`) | 10개 |
| i18n 언어 | 2개 (en, ko) |

### 디렉토리 트리

```
apps/web/
├── app/                              # Next.js 16 App Router
│   ├── layout.tsx                    # 루트 레이아웃 (providers, fonts)
│   ├── page.tsx                      # 홈 / 대시보드 진입점
│   ├── error.tsx / global-error.tsx   # 에러 바운더리
│   ├── api/                          # API Routes (서버사이드)
│   │   ├── calls/route.ts            # POST/GET /api/calls
│   │   ├── calls/[id]/route.ts       # GET /api/calls/[id]
│   │   ├── calls/[id]/start/route.ts # POST (통화 시작 트리거)
│   │   ├── chat/route.ts             # POST (GPT-4o-mini 채팅)
│   │   ├── conversations/route.ts    # POST/GET 대화 세션
│   │   ├── conversations/[id]/route.ts # GET/PATCH 개별 대화
│   │   └── metrics/route.ts          # GET 통화 메트릭
│   ├── auth/callback/route.ts        # Supabase OAuth 콜백
│   ├── call/[callId]/page.tsx        # 통화 모니터링 페이지
│   ├── call-preview/page.tsx         # 통화 전 프리뷰
│   ├── calling/[id]/page.tsx         # 실시간 통화 화면
│   ├── history/page.tsx              # 통화 이력
│   ├── login/ & signup/              # 인증 페이지
│   ├── metrics/page.tsx              # 메트릭 대시보드
│   ├── payment/{success,cancel}/     # 결제 결과 페이지
│   └── result/[id]/page.tsx          # 통화 결과 요약
│
├── components/                       # React UI 컴포넌트
│   ├── auth/                         # LoginForm, OAuthButtons, LoginButton
│   ├── call/                         # 통화 UI (12개): CallEffectPanel, RealtimeCallView,
│   │                                 #   LiveCaptionPanel, CallHistoryPanel, MetricsPanel 등
│   ├── chat/                         # 채팅 UI (11개): ChatContainer, ScenarioSelector,
│   │                                 #   ConversationHistoryPanel, ChatMessage 등
│   ├── common/                       # LanguageSwitcher, LanguageDropdown
│   ├── dashboard/                    # DashboardLayout, Sidebar, MobileDrawer, ConversationList
│   ├── layout/                       # Header, Sidebar (글로벌)
│   ├── providers/                    # I18nProvider
│   └── ui/                           # shadcn/ui (button, card, input, scroll-area, avatar, Orb)
│
├── hooks/                            # 커스텀 훅 (10개)
│   ├── useChat.ts                    # 채팅 에이전트 상태 관리 (434줄)
│   ├── useRelayCall.ts               # 릴레이 통화 오케스트레이션 (374줄)
│   ├── useRelayCallStore.ts          # Zustand 통화 상태 스토어
│   ├── useDashboard.ts               # Zustand 대시보드 상태
│   ├── useRelayWebSocket.ts          # WebSocket 연결 관리
│   ├── useCallPolling.ts             # 통화 상태 폴링
│   ├── useWebAudioPlayer.ts          # Web Audio 재생
│   ├── useWebAudioRecorder.ts        # Web Audio 녹음
│   ├── useClientVad.ts               # 브라우저 VAD
│   └── useGeolocation.ts             # 위치 정보
│
├── lib/                              # 유틸리티, 서비스, 설정
│   ├── api.ts                        # API 클라이언트 래퍼
│   ├── constants.ts                  # 앱 상수
│   ├── validation.ts                 # Zod 스키마
│   ├── prompts.ts                    # 정적 프롬프트 문자열 (480줄)
│   ├── prompt-generator.ts           # 동적 프롬프트 빌더 (319줄)
│   ├── relay-client.ts               # 릴레이 서버 WS 클라이언트
│   ├── response-parser.ts            # 채팅 응답 파싱
│   ├── audio/                        # PCM16, VAD, Web Audio 유틸
│   ├── demo/                         # 데모 모드 (mock API/WS/데이터)
│   ├── scenarios/                    # 6개 시나리오 정의 + 프롬프트
│   ├── services/                     # chat-service.ts, data-extractor.ts
│   └── supabase/                     # 클라이언트/서버 + DB 쿼리 헬퍼
│
├── shared/                           # 공유 타입
│   ├── types.ts                      # 핵심 도메인 타입 (354줄)
│   └── call-types.ts                 # 통화 관련 타입
│
├── messages/                         # i18n (en.json, ko.json)
├── middleware.ts                      # Next.js 미들웨어 (인증 리다이렉트)
└── next.config.ts
```

---

## 2. 스타일링 현황 & 문제점

### 2.1 globals.css 개요

- **줄 수**: 195줄
- **Tailwind 버전**: v4 (`@import "tailwindcss"`, `@theme inline`)
- **색상 시스템**: oklch() 색공간, 57개 CSS 변수 정의
- **커스텀 유틸리티 클래스**: 11개 (glass-surface, dashboard-panel 등)

CSS 변수 그룹:

| 그룹 | 수량 | 예시 |
|------|------|------|
| 시맨틱 색상 토큰 | 28 | `--background`, `--primary`, `--muted`, `--destructive` |
| 반지름 토큰 | 7 | `--radius`, `--radius-sm/md/lg/xl` |
| 차트 토큰 | 5 | `--chart-1` ~ `--chart-5` |
| 사이드바 토큰 | 8 | `--sidebar`, `--sidebar-primary` |
| 폰트 토큰 | 2 | `--font-sans`, `--font-mono` |

`@theme inline` 블록이 CSS 변수를 Tailwind 4 디자인 토큰으로 브리지 (`bg-primary`, `text-muted-foreground` 등 사용 가능).

### 2.2 핵심 문제: 하드코딩 Hex 색상 범람

**정량 데이터:**

| 지표 | 수치 |
|------|------|
| 고유 Hex 색상 | **40개** |
| 총 Hex 사용 횟수 | **796회** |
| Hex 사용 .tsx 파일 비율 | **47/56 (84%)** |
| Tailwind 시맨틱 클래스 사용 횟수 | **51회** |
| **Hex : 시맨틱 비율** | **~15:1** |

CSS 변수 시스템이 잘 정의되어 있지만, **기능 컴포넌트에서 거의 사용하지 않음**. 시맨틱 클래스는 `components/ui/` shadcn 프리미티브에서만 사용.

**빈도 Top 10:**

| 순위 | 색상 | 횟수 | Tailwind 대응 | 용도 |
|------|-------|------|---------------|------|
| 1 | `#94A3B8` | 135 | slate-400 | 아이콘/플레이스홀더 텍스트 |
| 2 | `#E2E8F0` | 132 | slate-200 | 카드/테이블 보더 |
| 3 | `#0F172A` | 126 | slate-950 | 기본 텍스트/제목 |
| 4 | `#64748B` | 97 | slate-500 | 보조 텍스트 |
| 5 | `#F1F5F9` | 92 | slate-100 | 배경/줄무늬 |
| 6 | `#334155` | 49 | slate-700 | 본문 텍스트 |
| 7 | `#CBD5E1` | 45 | slate-300 | 호버 보더 |
| 8 | `#F8FAFC` | 38 | slate-50 | 테이블 헤더 배경 |
| 9 | `#1E293B` | 25 | slate-800 | 테이블 셀 텍스트 |
| 10 | `#0B1324` | 12 | — | 활성 네비/로고 배경 |

Top 10 모두 **Slate 팔레트 변형** — 일관된 색상 체계이지만 완전히 하드코딩.

**Hex 밀도 상위 파일:**

| 파일 | Hex 횟수 |
|------|----------|
| `components/call/CallHistoryPanel.tsx` | 69 |
| `components/chat/ConversationHistoryPanel.tsx` | 59 |
| `app/metrics/page.tsx` | 40 |
| `components/chat/ScenarioSelector.tsx` | 39 |
| `components/chat/InfoPanel.tsx` | 25 |
| `components/call/RealtimeCallView.tsx` | 24 |

### 2.3 미사용 CSS 변수

| CSS 변수 그룹 | TSX 사용 여부 | 상태 |
|--------------|--------------|------|
| `--chart-1` ~ `--chart-5` | 0회 | **미사용** — 차트 라이브러리 미연결 |
| `--sidebar-*` (8개) | 0회 | **미사용** — shadcn Sidebar 대신 커스텀 구현 |
| 시맨틱 토큰 (primary, muted 등) | 51회 (ui/ 전용) | **과소 사용** |

### 2.4 커스텀 CSS 클래스 — 하드코딩 rgba

`globals.css`의 커스텀 클래스들이 CSS 변수 대신 하드코딩 rgba 사용:

| 클래스 | 사용 파일 수 | 하드코딩 색상 |
|--------|-------------|--------------|
| `page-card` | 12 | `rgba(248,251,255,0.92)` 등 |
| `page-center` | 11 | 없음 |
| `styled-scrollbar` | 9 | `rgba(71,85,105,0.2/0.34)` |
| `page-shell` | 5 | `#e4ebf4` |
| `glass-surface` | 3 | `rgba(244,248,255,0.48)` 등 |
| `dashboard-panel` | 1 | `rgba(244,248,255,0.58)` 등 |
| `surface-card` | 2 | `#FFFFFF`, `#E2E8F0` |

TSX 파일 내 인라인 `rgba()` — **24회** (11개 파일), 주로 Tailwind 임의값 문법 `shadow-[0_1px_3px_rgba(...)]` 형태.

### 2.5 리팩토링 제안

**Hex → Tailwind 시맨틱 토큰 매핑 테이블:**

```
#0F172A → text-slate-950  또는 text-foreground (시맨틱)
#334155 → text-slate-700
#64748B → text-slate-500  또는 text-muted-foreground
#94A3B8 → text-slate-400
#E2E8F0 → border-slate-200 또는 border-border
#F1F5F9 → bg-slate-100    또는 bg-muted
#F8FAFC → bg-slate-50
#CBD5E1 → border-slate-300
#1E293B → text-slate-800
```

**단계별 접근:**

1. `globals.css`에 시맨틱 토큰 확장 (text-body, text-caption, border-subtle 등)
2. `@theme inline`에 매핑 추가
3. 컴포넌트별 일괄 치환 (가장 빈도 높은 5개 색상부터)
4. 커스텀 CSS 클래스 내 하드코딩 → CSS 변수 참조로 전환

---

## 3. 컴포넌트 크기 & 관심사 분리

### 3.1 대형 파일 목록 (200줄+)

| 파일 | 줄 수 | useState | 핵심 문제 |
|------|-------|---------|-----------|
| `chat/ConversationHistoryPanel.tsx` | **737** | 9 | 3개 API 페치 + 리스트/디테일/모바일 혼재, 인라인 서브컴포넌트 5개 |
| `call/CallHistoryPanel.tsx` | **629** | — | ConversationHistoryPanel과 구조 거의 동일 — 대규모 중복 |
| `lib/prompts.ts` | **480** | — | 대형 인라인 프롬프트 문자열, prompt-generator.ts(319줄)와 병존 |
| `hooks/useChat.ts` | **434** | 14 | localStorage 8곳, 반환값 14개, 3가지 관심사 혼재 |
| `chat/ScenarioSelector.tsx` | **414** | 5 | 3개 독립 화면을 단일 컴포넌트에서 렌더링 |
| `hooks/useRelayCall.ts` | **374** | 9 | 캡션 머지 87줄, handleMessage 160줄 |
| `app/metrics/page.tsx` | **368** | — | 페이지 컴포넌트에 데이터 페칭 + UI 혼재 |
| `ui/Orb.tsx` | **357** | — | WebGL 코드 — 현 상태 유지 가능 |
| `shared/types.ts` | **354** | — | 타입 정의 — 현 상태 유지 가능 |
| `lib/prompt-generator.ts` | **319** | — | prompts.ts와 중복 — 통합 필요 |
| `call/RealtimeCallView.tsx` | **311** | 2 | 모드별 3개 렌더 함수 = 3개 별도 컴포넌트 |
| `lib/supabase/chat.ts` | **294** | — | DB 레이어 |
| `chat/ChatContainer.tsx` | **292** | — | 대형 오케스트레이터 |
| `lib/services/chat-service.ts` | **277** | — | 프롬프트+LLM+인텐트+Ready 4가지 관심사 |
| `call/CallEffectPanel.tsx` | **268** | 1 | 4개 얼리리턴 경로, 중복 상수 |

### 3.2 파일별 상세 분석 & 분리 방향

#### ConversationHistoryPanel.tsx (737줄)

**현재 구조:**
- 파일 레벨 헬퍼 함수 6개 (`formatDate`, `getStatusIcon`, `getStatusLabel` 등)
- 인라인 서브컴포넌트 5개 (`MessageBubble`, `CollectedDataCard`, `CallInfoCard`, `TranscriptBubble`, `SectionHeader`)
- API 페치 3건 (대화 목록 + 대화 상세 + 통화 결과)
- useState 9개, useRef 1개

**문제:**
- 리스트 + 디테일 + 모바일 네비게이션 = 3가지 UI 관심사 혼재
- 각 관심사마다 독립적인 로딩/에러 상태 존재
- 상태 레이블 로직이 CallHistoryPanel.tsx와 중복

**분리 방향:**
```
components/chat/history/
├── ConversationListPanel.tsx      # 왼쪽 목록
├── ConversationDetailPanel.tsx    # 오른쪽 상세
├── MessageBubble.tsx              # 메시지 버블
├── CollectedDataCard.tsx          # 수집 데이터 카드
├── CallInfoCard.tsx               # 통화 정보 카드
└── TranscriptBubble.tsx           # 번역 트랜스크립트

hooks/
├── useConversationList.ts         # 목록 페치 + 상태
└── useConversationDetail.ts       # 상세 페치 + 관련 통화

lib/utils/
└── status-labels.ts               # 공유 상태→라벨/뱃지 헬퍼
```

#### CallHistoryPanel.tsx (629줄) — ConversationHistoryPanel과 구조 중복

두 패널 모두 동일한 **마스터-디테일** 패턴 구현:
- 왼쪽 목록 + 오른쪽 상세 + 모바일 토글 + 새로고침

공유 코드 0줄. `<MasterDetailPanel>` 제네릭 컴포넌트 또는 `useMasterDetail()` 훅으로 수백 줄 제거 가능.

#### useChat.ts (434줄)

**현재:** 14개 useState, 3개 useRef, 7개 useCallback, localStorage 8곳

**혼재된 3가지 관심사:**
1. 세션 영속성 (localStorage 읽기/쓰기/삭제)
2. 채팅 메시징 (전송, 낙관적 업데이트, 롤백)
3. 통화 라이프사이클 (createCall, startCall, 대시보드 상태 전환)

**localStorage 접근 패턴:**
- 8곳에서 5개 함수를 통해 접근
- `removeItem` 패턴이 3개 함수에서 거의 동일하게 반복

**분리 방향:**
```
hooks/
├── useConversationPersistence.ts  # localStorage CRUD
├── useChatMessages.ts             # 메시지 전송/낙관적 업데이트
├── useCallConfirm.ts              # 통화 생성/시작/더블클릭 가드
└── useChat.ts                     # 위 3개를 조합하는 얇은 오케스트레이터
```

#### ScenarioSelector.tsx (414줄)

**현재:** 3개 독립 화면(카테고리/직접/AI자동)을 단일 컴포넌트에서 렌더링

**분리 방향:**
```
components/chat/scenario/
├── ScenarioSelector.tsx           # 스텝 라우터 (~50줄)
├── CategoryStep.tsx               # 카테고리 카드 2개
├── DirectCallStep.tsx             # 음성/텍스트 토글 + 시작
├── AiAutoStep.tsx                 # 퀵액션 그리드 + 자유 입력
└── LanguagePairSelector.tsx       # 언어 스왑 위젯
```

#### useRelayCall.ts (374줄)

**현재:** WebSocket 디스패치 + 오디오 제어 + VAD + 타이머 + 뮤트 + 캡션 머지 혼재

**핵심 복잡도:** 캡션 머지 로직 87줄 (Stage 1/2 스트리밍, 방향별 누적, `streamingRef` 추적)

**분리 방향:**
```
hooks/
├── useCaptionAccumulator.ts       # 스트리밍 캡션 머지 알고리즘
├── useCallDurationTimer.ts        # setInterval 타이머
├── useRelayMessageHandler.ts      # 메시지 디스패치 (순수 함수)
└── useRelayCall.ts                # 오케스트레이터
```

#### RealtimeCallView.tsx (311줄)

**현재:** 3개 렌더 함수(`renderVoiceToVoice`, `renderTextToVoice`, `renderFullAgent`)가 사실상 별개 컴포넌트

**추가 문제:**
- `useState` 이니셜라이저로 사이드이펙트 트리거 (안티패턴)
- `modeBadgeIcon`, `COMM_MODE_KEYS` 맵이 CallEffectPanel.tsx와 중복

**분리 방향:**
```
components/call/
├── VoiceToVoiceLayout.tsx         # 음성 모드 UI
├── TextToVoiceLayout.tsx          # 텍스트→음성 UI
├── FullAgentLayout.tsx            # AI 에이전트 UI
└── RealtimeCallView.tsx           # 모드 라우터 (~30줄)

shared/
└── call-ui-constants.ts           # modeBadgeIcon, COMM_MODE_KEYS (공유)
```

#### chat-service.ts (277줄)

**혼재된 4가지 관심사:**
1. OpenAI 클라이언트 싱글톤
2. 프롬프트 구성 (40줄 한국어 프롬프트 인라인)
3. LLM 호출 + 응답 파싱
4. 통화 준비 판단 (`isReadyForCall`)

**분리 방향:**
```
lib/
├── openai.ts                      # 싱글톤 클라이언트
├── prompts/direct-call-prompt.ts  # 인라인 프롬프트 이동
├── chat-pipeline.ts               # 6단계 파이프라인 함수들
└── call-readiness.ts              # isReadyForCall
```

#### CallEffectPanel.tsx (268줄)

**문제:**
- 4개 얼리리턴 경로 = 사실상 4개 컴포넌트
- `handleNewChat`에서 localStorage 키를 하드코딩 (useChat.ts의 상수와 중복)
- `getOrbHue` 순수 함수 — Orb 컴포넌트 또는 유틸로 이동 필요
- `modeBadgeIcon`/`COMM_MODE_KEYS` RealtimeCallView.tsx와 중복

#### 추가 주목 파일

| 파일 | 줄 수 | 참고 |
|------|-------|------|
| `lib/prompts.ts` | 480 | `prompt-generator.ts`(319줄)와 **2개 병렬 프롬프트 시스템** — 통합 필요 |
| `lib/scenarios/response-handling.ts` | 321 | 프롬프트 로직 + 응답 파싱 혼재 가능성 |
| `chat/ChatContainer.tsx` | 292 | 대형 오케스트레이터 |

---

## 4. 상태 관리 현황

### 4.1 Zustand 스토어 (2개)

**`useDashboard.ts`** — UI/네비게이션 상태

| 필드 | 타입 |
|------|------|
| `isSidebarOpen` | boolean |
| `isSidebarCollapsed` | boolean |
| `activeMenu` | string |
| `conversations` | array |
| `activeConversationId` | string |
| `scenarioSelected` | boolean |
| `callingCallId` | string |
| `callingCommunicationMode` | string |

Actions: 개별 setter + `resetDashboard()`, `resetCalling()`

**`useRelayCallStore.ts`** — 통화 런타임 상태

| 필드 | 타입 | 비고 |
|------|------|------|
| `callStatus` | string | |
| `translationState` | string | |
| `captions` | array | |
| `callDuration` | number | |
| `callMode` | string | |
| `isMuted` / `isRecording` / `isPlaying` | boolean | |
| `error` | string | |
| `metrics` | object | |
| `startCall` / `endCall` / `sendText` 등 | nullable function | **비관용적** — 함수를 스토어에 저장 |

두 스토어 모두 `devtools`, `persist`, `immer` 미들웨어 **없음**.

**평가:** 스토어 자체는 양호하나, `useRelayCallStore`에 nullable 함수를 저장하는 패턴은 `RelayCallProvider`와 강결합을 만듦.

### 4.2 useState 과다

전체 훅의 `useState` 호출: **39회** (8개 파일)

| 파일 | useState 수 | 상태 |
|------|------------|------|
| `useChat.ts` | **14** | `useReducer` 또는 Zustand 슬라이스 전환 필요 |
| `useRelayCall.ts` | **9** | 관심사 분리로 분산 필요 |
| `useCallPolling.ts` | 4 | 양호 |
| `useWebAudioRecorder.ts` | 4 | 양호 |
| `useRelayWebSocket.ts` | 2 | 양호 |
| `useGeolocation.ts` | 2 | 양호 |
| `useClientVad.ts` | 2 | 양호 |
| `useWebAudioPlayer.ts` | 2 | 양호 |

### 4.3 localStorage — 중앙 관리 부재

**5개 키, 43회 접근, 6개 파일:**

| 키 | 상수 위치 | 접근 파일 |
|----|----------|----------|
| `'currentConversationId'` | `lib/constants.ts` (export) | useChat, Sidebar×2, Header, CallEffectPanel, MobileDrawer |
| `'currentCommunicationMode'` | `useChat.ts` (로컬 상수) | useChat, CallEffectPanel, MobileDrawer |
| `'currentSourceLang'` | `useChat.ts` (로컬 상수) | useChat, CallEffectPanel |
| `'currentTargetLang'` | `useChat.ts` (로컬 상수) | useChat, CallEffectPanel |
| `'locale'` | 없음 | I18nProvider, lib/i18n.ts |

**핵심 문제:** `STORAGE_KEY_CONVERSATION_ID`만 `constants.ts`에서 export. 나머지 3개 키는 `useChat.ts`에 로컬 상수로 정의되어 있으나, `CallEffectPanel`, `MobileDrawer`, `Sidebar`, `Header`에서 **동일 문자열을 하드코딩**. 키 이름 변경 시 사일런트 버그 발생.

### 4.4 useContext

전체 `apps/web/`에서 **useContext 사용 0회**. Zustand로 전역 상태 관리 통일.

### 4.5 제안

1. **`useStorage` 커스텀 훅** — localStorage CRUD 캡슐화, 키 상수 중앙 관리
2. **모든 localStorage 키를 `lib/constants.ts`로 이동**
3. **`useChat.ts` 14개 useState → `useReducer`** 또는 3개 하위 훅으로 분산
4. **`useRelayCallStore`에서 함수 저장 제거** — 이벤트 에미터 또는 ref 패턴으로 전환

---

## 5. API Routes & 서버 로직

### 5.1 라우트 인벤토리

| 라우트 | 줄 수 | HTTP 메서드 |
|--------|-------|------------|
| `calls/[id]/start/route.ts` | **283** | POST |
| `calls/route.ts` | 196 | POST, GET |
| `metrics/route.ts` | 187 | GET |
| `conversations/route.ts` | 170 | POST, GET |
| `chat/route.ts` | 141 | POST |
| `conversations/[id]/route.ts` | 79 | GET |
| `calls/[id]/route.ts` | 60 | GET |
| **합계** | **1,116** | |

### 5.2 인증 체크 중복 (9회)

모든 라우트 핸들러가 동일한 보일러플레이트를 **9회** 복사:

```typescript
const supabase = await createClient();
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**위치:**
- `conversations/route.ts` — POST(L19), GET(L82)
- `conversations/[id]/route.ts` — L21
- `chat/route.ts` — L23
- `metrics/route.ts` — L51
- `calls/route.ts` — POST(L23), GET(L156)
- `calls/[id]/route.ts` — L22
- `calls/[id]/start/route.ts` — L44

### 5.3 입력 검증 불일치

| 라우트 | 검증 방식 | 문제 |
|--------|----------|------|
| `POST /api/chat` | **Zod** (`ChatRequestSchema`) | 양호 |
| `POST /api/conversations` | **없음** — bare try/catch | 타입 체크 없이 필드 추출 |
| `POST /api/calls` | **`as` cast** (`as CreateCallRequest`) | 런타임 검증 없음, `if (!conversationId)` 수동 체크만 |
| `POST /api/calls/[id]/start` | 없음 (params only) | 허용 가능 |

**아이러니:** `lib/validation.ts`에 `CreateConversationRequestSchema`와 `CreateCallRequestSchema` Zod 스키마가 **정의되어 있지만 해당 라우트에서 사용하지 않음**.

### 5.4 최대 핸들러: calls/[id]/start/route.ts (283줄)

**단일 POST 핸들러에 포함된 작업:**

1. 인증 체크
2. DB 조회 (calls + conversations JOIN)
3. `as unknown as CallWithConversation` — 타입 안전성 우회
4. 상태 검증 (PENDING만 허용)
5. `collected_data` 추출 + 인라인 fallback 객체
6. DB 업데이트: `status = 'CALLING'`
7. DB 업데이트: `conversations.status = 'CALLING'` — **에러 체크 없음**
8. 모드/프롬프트 로직
9. E.164 전화번호 포매팅
10. 릴레이 서버 통화 요청
11. DB 업데이트: `status = 'IN_PROGRESS'` — **에러 체크 없음**
12. 응답 반환
13. ~35줄 주석 처리된 레거시 코드
14. `updateCallFailed()` 헬퍼 — `supabase: any` 파라미터

**타입 안전성 문제:** `as unknown as` 캐스트 2회, `eslint-disable` 1회

### 5.5 제안

1. **`withAuth()` 고차 함수** 추출 — 인증 보일러플레이트 9회 → 0회
   ```typescript
   export function withAuth(handler: AuthedHandler) {
     return async (request: NextRequest) => {
       const supabase = await createClient();
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return unauthorized();
       return handler(request, user, supabase);
     };
   }
   ```
2. **Zod 검증 통일** — 이미 정의된 스키마를 해당 라우트에서 `validateRequest()` 호출
3. **`calls/[id]/start`** — 스텝별 함수 추출 (`validateCall`, `updateStatus`, `triggerRelay`), 레거시 코드 제거, DB 업데이트 에러 체크 추가

---

## 6. 타입 & 에러 핸들링

### 6.1 타입 산재

**중앙 타입 (`shared/types.ts`, 354줄):** `Call`, `Conversation`, `CallRow`, `MessageRow`, `CollectedData`, `ChatRequest`, `ChatResponse` 등 핵심 도메인 타입 정의

**로컬 타입 정의: 68개** (컴포넌트/훅/라우트 파일 내)

**문제적 중복:**

| 타입 | 중앙 정의 | 로컬 정의 위치 | 문제 |
|------|----------|---------------|------|
| `CallRow` | `shared/types.ts` | `app/api/metrics/route.ts` L20 | 쉐도잉 — 다른 필드 포함 가능성 |
| `CallStatus` | `shared/types.ts` | `useRelayCallStore.ts` L18, `useRelayCall.ts` L17 | 동일 타입 2곳에서 재정의 |
| `TranslationState` | — | `useRelayCallStore.ts` L19, `useRelayCall.ts` L18 | 동일 타입 2곳에서 재정의 |
| `ConversationRow` | `shared/types.ts` | `lib/supabase/chat.ts` L24 | DB 행 타입 쉐도잉 |
| `MessageRow` | `shared/types.ts` | `lib/supabase/chat.ts` L33 | DB 행 타입 쉐도잉 |
| `LatencyStats` | — | `app/metrics/page.tsx` L20 | API 라우트의 로컬 타입과 중복 |

### 6.2 에러 핸들링 — 구조화 부재

**console.error: 26회** (11개 파일)

| 파일 | 횟수 |
|------|------|
| `app/api/calls/[id]/start/route.ts` | 6 |
| `app/api/calls/route.ts` | 4 |
| `app/api/conversations/route.ts` | 3 |
| `lib/supabase/entities.ts` | 3 |
| `app/api/metrics/route.ts` | 2 |
| `app/api/chat/route.ts` | 2 |
| `lib/relay-client.ts` | 2 |
| 기타 4개 파일 | 각 1 |

**에러 패턴:**
- API 라우트: bare `try/catch` + `NextResponse.json({ error: '...' })` — 에러 코드 없음
- 클라이언트 훅: `setError(string)` + 5초 자동 소멸 타이머
- 에러 클래스/코드 체계 없음, `Result<T, E>` 타입 없음

**유일한 예외:** `lib/validation.ts`의 `validateRequest()` — 판별 유니온 `{ success, data } | { success, error }` 패턴 사용. 좋은 패턴이나 chat 라우트 1곳에서만 사용.

### 6.3 하드코딩 한국어 에러 메시지 (i18n 미적용)

| 파일 | 메시지 |
|------|--------|
| `app/api/chat/route.ts:83` | `'죄송합니다, 잠시 오류가 발생했어요...'` **(서버사이드 — 로케일 무관하게 항상 한국어)** |
| `hooks/useGeolocation.ts:85` | `'위치 정보를 가져오는 중 오류가 발생했습니다.'` |
| `hooks/useCallPolling.ts:76,90` | 서버 오류 / 네트워크 오류 메시지 |
| `lib/validation.ts:85,89` | `'메시지를 입력해주세요.'` / 글자 수 제한 |
| `app/result/[id]/page.tsx:37,46` | 데이터 로드 실패 / 네트워크 오류 |
| `chat/ConversationHistoryPanel.tsx` | 4곳 — 대화 기록 로드 실패 등 |

`messages/ko.json`에 i18n 키가 존재하지만, 이들 문자열은 i18n 시스템을 우회.

### 6.4 제안

1. **타입 중앙화:**
   - `CallStatus`, `TranslationState` → `shared/types.ts` 또는 `shared/call-types.ts`로 통합
   - `lib/supabase/chat.ts`의 로컬 Row 타입 → `shared/types.ts` import로 전환
   - `metrics/route.ts`의 `CallRow` 쉐도잉 해소

2. **AppError 클래스 도입:**
   ```typescript
   class AppError extends Error {
     constructor(
       public code: string,
       public messageKey: string,  // i18n 키
       public statusCode: number = 500,
       public context?: Record<string, unknown>
     ) { super(messageKey); }
   }
   ```

3. **에러 메시지 i18n 적용:** 하드코딩 한국어 → `messages/{en,ko}.json` 키 참조

---

## 7. 테스트 현황

| 컴포넌트 | 테스트 수 | 프레임워크 |
|----------|----------|-----------|
| Relay Server (`apps/relay-server/`) | **265** | pytest |
| Web App (`apps/web/`) | **0** | 없음 |

### 우선순위별 테스트 대상

**P0 — 비즈니스 로직 (단위 테스트)**

| 대상 | 이유 |
|------|------|
| `lib/services/chat-service.ts` | LLM 파이프라인 핵심 — 인텐트 감지, 데이터 추출, 준비 판단 |
| `lib/services/data-extractor.ts` | 엔티티 추출 정확도 직접 영향 |
| `lib/response-parser.ts` | 응답 파싱 로직 |
| `lib/prompt-generator.ts` | 프롬프트 구성 로직 |
| `shared/types.ts` (`mergeCollectedData`) | 데이터 머지 유틸 |

**P1 — 훅 (통합 테스트)**

| 대상 | 이유 |
|------|------|
| `hooks/useChat.ts` | 14개 상태의 전이 로직 |
| `hooks/useRelayCall.ts` | 캡션 머지 알고리즘 |
| `hooks/useCallPolling.ts` | 폴링 + 재시도 로직 |

**P2 — API 라우트 (통합 테스트)**

| 대상 | 이유 |
|------|------|
| `app/api/calls/[id]/start/route.ts` | 가장 복잡한 핸들러 (283줄) |
| `app/api/chat/route.ts` | LLM 인터랙션 경계 |
| `app/api/calls/route.ts` | CRUD 기본 동작 |

**추천 스택:** Vitest + React Testing Library + MSW (API 모킹)

---

## 8. 리팩토링 우선순위 로드맵

### P0 — 즉시 (높은 영향, 낮은 위험)

| 항목 | 예상 효과 | 영향 범위 |
|------|----------|----------|
| **Hex 색상 → Tailwind 토큰** | 796회 하드코딩 제거, 테마 변경 가능 | 47개 .tsx 파일 |
| **auth 미들웨어 추출** | 9회 보일러플레이트 → 0회 | 7개 API 라우트 |
| **Zod 검증 통일** | 이미 정의된 스키마 활성화 | 2개 API 라우트 |
| **localStorage 키 상수 중앙화** | 사일런트 버그 방지 | 6개 파일 |

### P1 — 단기 (구조 개선)

| 항목 | 예상 효과 | 영향 범위 |
|------|----------|----------|
| **ConversationHistoryPanel 분리** | 737줄 → 5-6개 파일 × ~100줄 | 1 파일 |
| **CallHistoryPanel + MasterDetail 추출** | 629줄 + 공통 패턴 제거 | 2 파일 |
| **useChat 분리** | 434줄 → 3개 하위 훅 + 오케스트레이터 | 1 파일 |
| **ScenarioSelector 분리** | 414줄 → 4개 스텝 컴포넌트 | 1 파일 |
| **RealtimeCallView 분리** | 311줄 → 3개 레이아웃 + 라우터 | 1 파일 |
| **타입 중앙화** | 68개 로컬 타입 정리, 쉐도잉 해소 | 다수 파일 |
| **prompts.ts + prompt-generator.ts 통합** | 799줄 병렬 시스템 → 단일 `lib/prompts/` | 2 파일 |
| **chat-service.ts 분리** | 277줄 → 4가지 관심사 분리 | 1 파일 |

### P2 — 중기 (품질 인프라)

| 항목 | 예상 효과 | 영향 범위 |
|------|----------|----------|
| **테스트 도입** (Vitest + RTL + MSW) | 웹 앱 테스트 0 → P0/P1 대상 커버리지 | 전체 |
| **구조화 로깅** | console.error 26개 → 표준 로거 | 11 파일 |
| **AppError 클래스** | 에러 코드/i18n 키 체계 | API 라우트 + 훅 |
| **한국어 하드코딩 → i18n** | 서버사이드 포함 로케일 대응 | 8 파일 |
| **미사용 CSS 변수 정리** | chart/sidebar 토큰 제거 또는 활용 | globals.css |

---

## 부록: 정량 데이터 요약

| 지표 | 수치 |
|------|------|
| 총 컴포넌트 | 42개 |
| 총 페이지 | 11개 |
| API 라우트 | 7개 (+ auth callback) |
| 커스텀 훅 | 10개 |
| 고유 Hex 색상 | 40개 |
| Hex 사용 횟수 | 796회 |
| Tailwind 시맨틱 사용 횟수 | 51회 |
| Hex 사용 파일 비율 | 84% (47/56) |
| useState 호출 (훅) | 39회 |
| localStorage 접근 | 43회 (6파일) |
| auth 보일러플레이트 | 9회 중복 |
| console.error | 26회 (11파일) |
| 로컬 타입 정의 | 68개 |
| 하드코딩 한국어 에러 | 8+ 파일 |
| 웹 앱 테스트 | 0개 |
| 릴레이 서버 테스트 | 265개 |
