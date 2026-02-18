# WIGVO — AI Realtime Relay Platform

## Project Overview

외국인, 장애인, 콜포비아 사용자를 위한 AI 실시간 전화 통역/중개 플랫폼.
OpenAI Realtime API + Twilio Media Streams 기반 양방향 번역 통화.

- PRD: `docs/prd/12_PRD_REALTIME_RELAY.md` (v3.2)
- 분석 보고서: `docs/prd/13_PRD_ANALYSIS_REPORT.md`
- Task Plan: `docs/todo_plan/PLAN_realtime-relay.md`

## Architecture (Split Architecture — PRD C-1)

```
React Native App ←WS→ Relay Server (FastAPI) ←WS→ Twilio / OpenAI Realtime API
Next.js Web App  ←WS→       ↑                          ↑
                             ↕
                       Supabase (DB/Auth)
```

| Component | Stack | Location |
|-----------|-------|----------|
| Relay Server | Python 3.12+, FastAPI, uvicorn, websockets | `apps/relay-server/` |
| Mobile App | React Native (Expo SDK 54), TypeScript | `apps/mobile/` |
| Web App | Next.js 16, React 19, TypeScript, shadcn/ui, Zustand, next-intl | `apps/web/` |
| Database | Supabase PostgreSQL + Auth | Cloud |

## Tech Stack

- **Package Manager**: uv (Python), npm (Web/Mobile)
- **Python**: 3.12+, FastAPI, Pydantic v2, async/await
- **Web**: Next.js 16, React 19, shadcn/ui, Zustand, next-intl, Zod
- **Mobile**: React Native + Expo Router + expo-av
- **APIs**: OpenAI Realtime API (WebSocket), GPT-4o-mini (chat), Twilio REST + Media Streams, Naver Place Search
- **DB**: Supabase (PostgreSQL + Auth + RLS)

## Build & Run Commands

```bash
# Relay Server
cd apps/relay-server
uv sync                           # Install dependencies
uv run uvicorn src.main:app --reload  # Dev server (port 8000)
uv run pytest                     # Run tests (74 tests)

# Web App
cd apps/web
npm install                       # Install dependencies
npm run dev                       # Dev server (localhost:3000)
npm run build                     # Production build + type check

# Mobile App
cd apps/mobile
npm install --legacy-peer-deps    # React 19 peer dep conflicts
npx expo start                    # Dev server

# ngrok (Twilio webhooks)
ngrok http 8000                   # Required for Relay Server callbacks
```

## Key Conventions

- Python: snake_case, type hints, Pydantic models for all data structures
- TypeScript (Web): camelCase, functional components + hooks, shadcn/ui for UI
- TypeScript (Mobile): camelCase, Expo Router for navigation
- Commit messages: conventional commits (feat/fix/docs/refactor)
- Relay Server: API endpoints in `src/routes/`, business logic in dedicated modules
- Web App: API routes in `app/api/`, services in `lib/services/`, state in Zustand stores
- 환경변수: `.env` + pydantic-settings (Relay), `.env.local` (Web), `.env` (Mobile)

## Core Architecture Patterns

### Dual Session (PRD 3.2)
- Session A: User → 수신자 (sourceLanguage → targetLanguage)
- Session B: 수신자 → User (targetLanguage → sourceLanguage)
- 절대 단일 세션으로 합치지 않음 — 번역 방향 혼동 위험

### Call Mode (PRD 3.3 / C-2)
- **Relay Mode**: 실시간 번역기. AI는 번역만, 자체 판단 금지
- **Agent Mode**: 자율 대화. 수집된 정보 기반 AI가 통화 진행

### Interrupt Priority (PRD 3.6 / M-1)
1. 수신자 발화 (최고) — 수신자를 기다리게 하면 안 됨
2. User 발화
3. AI 생성 (최저) — 언제든 중단 가능

### Audio Format (PRD 4.3 / M-4)
- Session A output → Twilio: `g711_ulaw`
- Session B input ← Twilio: `g711_ulaw`
- App ↔ Relay: `pcm16` 16kHz

### Echo Gate v2
- Output-only gating: 입력은 항상 활성, 출력만 억제
- 억제된 출력은 큐에 저장 후 쿨다운 후 자동 배출
- 수신자 발화 감지 시 즉시 게이트 해제

### Chat Agent Pipeline (Web App)
- 시나리오 선택 → GPT-4o-mini 대화 → 네이버 장소 검색 → 데이터 수집 → READY → 통화 시작
- `lib/services/chat-service.ts`에서 전체 파이프라인 로직 관리
- Conversation 상태: COLLECTING → READY → CALLING → COMPLETED

## Web App Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | 홈 (채팅 인터페이스) |
| `app/api/chat/route.ts` | AI 대화 API (GPT-4o-mini) |
| `app/api/calls/route.ts` | 통화 생성/목록 API |
| `app/api/calls/[id]/start/route.ts` | Relay Server 통화 시작 |
| `lib/services/chat-service.ts` | Chat Agent 파이프라인 로직 |
| `shared/types.ts` | 공유 타입 정의 (Call, Conversation, etc.) |
| `hooks/useCallPolling.ts` | 통화 상태 폴링 |
| `components/chat/` | 채팅 UI 컴포넌트 |
| `components/call/` | 통화 모니터링 컴포넌트 |

## Database Schema (Supabase)

| Table | Purpose |
|-------|---------|
| `conversations` | 채팅 세션 + collected_data (시나리오, 대상 정보) |
| `messages` | 대화 메시지 (user + assistant) |
| `calls` | 통화 기록 (status, result, call_sid, duration_s, total_tokens) |
| `conversation_entities` | 추출된 엔티티 |
| `place_search_cache` | 네이버 장소 검색 캐시 |
