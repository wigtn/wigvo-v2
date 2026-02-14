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
                                ↕
                          Supabase (DB/Auth)
```

| Component | Stack | Location |
|-----------|-------|----------|
| Relay Server | Python 3.12+, FastAPI, uvicorn, websockets | `apps/relay-server/` |
| Mobile App | React Native (Expo), TypeScript | `apps/mobile/` |
| Database | Supabase PostgreSQL + Auth | Cloud |

## Tech Stack

- **Package Manager**: uv (Python), npm/pnpm (React Native)
- **Python**: 3.12+, FastAPI, Pydantic v2, async/await
- **Mobile**: React Native + Expo Router
- **APIs**: OpenAI Realtime API (WebSocket), Twilio REST + Media Streams
- **DB**: Supabase

## Build & Run Commands

```bash
# Relay Server
cd apps/relay-server
uv sync                           # Install dependencies
uv run uvicorn src.main:app --reload  # Dev server
uv run pytest                     # Run tests

# Mobile App (TBD)
cd apps/mobile
npx expo start                    # Dev server
```

## Key Conventions

- Python: snake_case, type hints, Pydantic models for all data structures
- TypeScript: camelCase (React Native)
- Commit messages: conventional commits (feat/fix/docs/refactor)
- All API endpoints in `src/routes/`, business logic in dedicated modules
- 환경변수는 `.env` + pydantic-settings (`src/config.py`)

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
