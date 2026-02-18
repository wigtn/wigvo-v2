# WIGVO

**AI Realtime Relay Platform** — Phone calls without language barriers

[![Korean](https://img.shields.io/badge/lang-한국어-blue.svg)](README.ko.md)

WIGVO is an **AI-powered real-time phone interpretation and relay platform** for foreigners, people with speech/hearing disabilities, and those with phone anxiety. When a user speaks in their native language, the AI translates in real time and delivers it to the other party, then translates the response back.

## Problem

Language barriers block everyday phone calls:

- **Foreigners living in Korea** — Cannot make calls in Korean: hospital appointments, delivery orders, government inquiries
- **Koreans making overseas calls** — Struggle with English/local languages: hotel reservations, airline inquiries
- **People with speech disabilities** — Cannot make voice calls, but many businesses only accept phone calls
- **People with hearing disabilities** — Cannot hear the other party, need real-time captions

Existing translation apps only support **one-way text translation**.
WIGVO solves **bidirectional real-time voice translation + phone connection** in a single platform.

## How It Works

```
User (English)                        Recipient (Korean)
     |                                    |
     |  "I'd like to make                |
     |   a reservation"                  |
     |         |                          |
     |         v                          |
     |   +------------+                  |
     |   |   WIGVO    |                  |
     |   |   Relay    |   Twilio Call    |
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
     |  + English audio playback         |
     |  + Real-time captions             |
```

### Supported Modes

| Mode | User Input | AI Output | Target Users |
|------|-----------|---------|------------|
| **Voice-to-Voice** | Native language speech | Translated speech + captions | Foreigners, general users |
| **Text-to-Voice** | Text input | Voice conversion + delivery | Speech disabilities, phone anxiety |
| **Voice-to-Text** | Speech | Real-time captions | Hearing disabilities |

## Architecture

```
+-------------------+       +-------------------+       +-------------------+
|   Next.js Web     |  WS   |                   |  WS   |  OpenAI Realtime  |
|   (Chat Agent +   |<----->|   Relay Server    |<----->|  API (GPT-4o)     |
|    Call Monitor)   |       |   (FastAPI)       |       +-------------------+
+-------------------+       |                   |
                            |                   |  WS   +-------------------+
+-------------------+       |                   |<----->|  Twilio Media     |
|  React Native     |  WS   |                   |       |  Streams          |
|  Mobile App       |<----->|                   |       +-------------------+
|  (VAD + Audio)    |       +--------+----------+
+-------------------+                |
                                     v
                            +-------------------+
                            |   Supabase        |
                            |   (PostgreSQL +   |
                            |    Auth)          |
                            +-------------------+
```

### Apps Overview

| App | Stack | Location | Purpose |
|-----|-------|----------|---------|
| **Web App** | Next.js 16, React 19, shadcn/ui, Zustand | `apps/web/` | Chat Agent + call initiation + call monitoring |
| **Relay Server** | Python 3.12+, FastAPI, uvicorn | `apps/relay-server/` | Real-time audio relay, dual translation sessions |
| **Mobile App** | React Native (Expo SDK 54), TypeScript | `apps/mobile/` | Client-side VAD + audio streaming + call UI |
| **Database** | Supabase PostgreSQL + Auth | Cloud | User data, conversations, call records |

## Web App — Chat Agent Pipeline

The web app provides a conversational chat interface that collects call information before initiating the call:

```
User enters chat
      |
      v
+------------------+     +------------------+     +------------------+
| 1. Select        |     | 2. Chat with     |     | 3. Naver Place   |
|    Scenario       |--->|    GPT-4o-mini   |--->|    Search         |
| (Reservation,    |     |    (collect info) |     | (find business)  |
|  Inquiry, etc.)  |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
                                                         |
                                                         v
+------------------+     +------------------+     +------------------+
| 6. Relay Server  |     | 5. Call Created  |     | 4. User confirms |
|    connects call |<---|    (PENDING)      |<---|    target place   |
|    via Twilio    |     |                  |     | -> status: READY |
+------------------+     +------------------+     +------------------+
```

**Key Features:**
- Scenario-based conversation flow (reservation, inquiry, cancellation, custom)
- LLM-powered natural language data collection
- Naver Place Search API integration for business lookup
- Real-time call status monitoring with polling
- i18n support (Korean, English) via next-intl

**API Routes:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Chat with AI (GPT-4o-mini), scenario-based conversation |
| `/api/conversations` | GET/POST | List/create conversation sessions |
| `/api/conversations/[id]` | GET | Get conversation details |
| `/api/calls` | GET/POST | List/create call records |
| `/api/calls/[id]` | GET | Get call details |
| `/api/calls/[id]/start` | POST | Initiate call via Relay Server |

## Relay Server — Real-time Translation Engine

### Dual Session Architecture

Two simultaneous OpenAI Realtime sessions prevent translation direction confusion:

- **Session A** (User -> Recipient): Translates user's speech/text to recipient's language + TTS
- **Session B** (Recipient -> User): Translates recipient's speech to user's language + captions + TTS

### Call Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Relay** | AI translates only, no autonomous decisions | Real-time interpretation |
| **Agent** | AI conducts the call using collected information | Automated calling |

### Echo Gate v2

Output-only gating that prevents echo feedback loops without losing recipient speech:

- Input always active (speech detection never blocked)
- Output suppressed during TTS playback
- Pending output queued and flushed after cooldown
- Recipient speech immediately releases the gate

### Conversation Context Window

Sliding window of recent 6 turns injected into each session for translation consistency.

### Guardrail System

Three-level translation quality verification:

| Level | Action | Latency |
|-------|--------|---------|
| Level 1 | Auto-pass (normal translation) | 0ms |
| Level 2 | Async verification (TTS first, background correction) | 0ms |
| Level 3 | Sync block (filler audio + GPT-4o-mini correction) | ~800ms |

### Session Recovery

Automatic recovery from OpenAI session failures:

- Heartbeat monitoring (5s interval, 45s timeout)
- Exponential backoff reconnection (1s -> 2s -> 4s, max 30s)
- Ring buffer catch-up (undelivered audio via Whisper batch)
- Degraded mode fallback (after 10s recovery failure)

### Relay Server Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `POST /calls/start` | HTTP | Start a new call (Twilio outbound) |
| `POST /calls/{id}/end` | HTTP | End an active call |
| `WS /calls/{id}/stream` | WebSocket | Real-time audio stream (App <-> Relay) |
| `POST /twilio/incoming` | HTTP | Twilio webhook for call events |
| `WS /twilio/media-stream` | WebSocket | Twilio Media Stream (audio bridge) |
| `GET /health` | HTTP | Health check |

## Mobile App — Client-side VAD

### Voice Activity Detection

The mobile app performs **Voice Activity Detection** locally, reducing API costs by 40%+:

- RMS energy-based speech detection (threshold: 0.015)
- State machine: `SILENT -> SPEAKING -> COMMITTED`
- Pre-speech 300ms ring buffer to prevent speech onset loss
- Configurable onset/end delays for noise resistance

### Interrupt Priority

Natural conversation flow with priority-based interruption:

1. **Recipient speech** (highest) — Never make the recipient wait
2. **User speech**
3. **AI generation** (lowest) — Can be interrupted anytime

### Audio Pipeline

```
Microphone -> expo-av Recorder -> PCM16 chunks
    -> VAD Processor -> Speech frames only
    -> WebSocket -> Relay Server
    -> OpenAI Realtime API -> Translation
    -> TTS audio -> WebSocket -> expo-av Playback
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Web App | Next.js 16, React 19, TypeScript, shadcn/ui, Zustand, next-intl |
| Mobile App | React Native (Expo SDK 54), TypeScript, Expo Router |
| Relay Server | Python 3.12+, FastAPI, uvicorn, websockets, Pydantic v2 |
| AI | OpenAI Realtime API (GPT-4o), GPT-4o-mini (chat + guardrail), Whisper (fallback) |
| Telephony | Twilio (REST API + Media Streams) |
| Database | Supabase (PostgreSQL + Auth + Row Level Security) |
| Search | Naver Place Search API |
| Package Managers | uv (Python), npm (Web/Mobile) |

## Project Structure

```
apps/
+-- relay-server/                   # Python FastAPI Relay Server
|   +-- src/
|   |   +-- main.py                 # FastAPI entrypoint
|   |   +-- config.py               # Environment config (pydantic-settings)
|   |   +-- types.py                # Shared types (Pydantic models)
|   |   +-- call_manager.py         # Call lifecycle singleton
|   |   +-- routes/
|   |   |   +-- calls.py            # POST /calls/start, /calls/{id}/end
|   |   |   +-- stream.py           # WS /calls/{id}/stream
|   |   +-- realtime/
|   |   |   +-- session_manager.py  # Dual Session management
|   |   |   +-- session_a.py        # Session A (User -> Recipient)
|   |   |   +-- session_b.py        # Session B (Recipient -> User)
|   |   |   +-- audio_router.py     # Audio routing + Echo Gate
|   |   |   +-- context_manager.py  # Conversation context window
|   |   |   +-- recovery.py         # Session failure recovery
|   |   |   +-- ring_buffer.py      # 30s audio ring buffer
|   |   +-- guardrail/              # Translation quality (3 levels)
|   |   +-- prompt/                 # System prompt templates
|   |   +-- tools/                  # Function calling (Agent Mode)
|   |   +-- twilio/                 # Twilio integration
|   |   +-- db/                     # Supabase client
|   +-- tests/                      # 74 tests (8 test files)
|
+-- web/                            # Next.js Web App
|   +-- app/
|   |   +-- page.tsx                # Home (chat interface)
|   |   +-- login/ signup/          # Auth pages
|   |   +-- calling/[id]/           # Call monitoring page
|   |   +-- result/[id]/            # Call result page
|   |   +-- history/                # Call history page
|   |   +-- api/                    # API routes (7 endpoints)
|   +-- components/
|   |   +-- chat/                   # Chat UI components
|   |   +-- call/                   # Call monitoring components
|   |   +-- ui/                     # shadcn/ui base components
|   +-- hooks/                      # Custom hooks (useCallPolling, useDashboard)
|   +-- lib/
|   |   +-- services/chat-service.ts  # Chat Agent pipeline logic
|   |   +-- supabase/               # Supabase client (SSR)
|   |   +-- api.ts                  # API client
|   +-- shared/types.ts             # Shared type definitions
|   +-- messages/                   # i18n translations (ko, en)
|
+-- mobile/                         # React Native (Expo) App
|   +-- app/                        # Expo Router pages
|   |   +-- (auth)/                 # Login / Sign up
|   |   +-- (main)/                 # Home / Call screen
|   +-- components/call/
|   |   +-- RealtimeCallView.tsx    # Main call UI
|   |   +-- LiveCaptionPanel.tsx    # Real-time captions
|   |   +-- PushToTalkInput.tsx     # Text / Voice input
|   |   +-- VadIndicator.tsx        # VAD state visualization
|   +-- hooks/
|   |   +-- useRealtimeCall.ts      # Master hook (WS + VAD + Playback)
|   |   +-- useClientVad.ts         # Recording + VAD integration
|   |   +-- useAudioRecorder.ts     # expo-av chunk recording
|   |   +-- useAudioPlayback.ts     # Audio playback
|   +-- lib/vad/                    # VAD core library
|       +-- vad-config.ts           # VAD parameters
|       +-- vad-processor.ts        # RMS energy detection + state machine
|       +-- audio-ring-buffer.ts    # Pre-speech ring buffer
|
docs/
+-- prd/                            # PRD documents
+-- todo_plan/                      # Implementation plans
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [ngrok](https://ngrok.com/) (for Twilio webhooks in dev)
- Expo Go app (iOS/Android) — for mobile development

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

### Running the Services

```bash
# 1. Relay Server
cd apps/relay-server
uv sync
uv run uvicorn src.main:app --reload --port 8000

# 2. Web App
cd apps/web
npm install
npm run dev              # localhost:3000

# 3. Mobile App
cd apps/mobile
npm install --legacy-peer-deps
npx expo start

# 4. ngrok (for Twilio webhooks)
ngrok http 8000
```

### Running Tests

```bash
# Relay Server (74 tests)
cd apps/relay-server
uv run pytest

# Web App
cd apps/web
npm run build            # Type check + build
```

## Database Schema

Five tables in Supabase PostgreSQL:

| Table | Purpose |
|-------|---------|
| `conversations` | Chat sessions with collected data (scenario, target info) |
| `messages` | Chat messages (user + AI) within conversations |
| `calls` | Call records with status, result, duration, tokens |
| `conversation_entities` | Extracted entities from conversations |
| `place_search_cache` | Cached Naver Place Search results |

## Accessibility

WIGVO prioritizes accessibility for diverse users:

- **Caption font scaling** — 3 levels (1.0x / 1.5x / 2.0x)
- **Haptic feedback** — 100ms vibration on recipient speech, double vibration on interrupt
- **Minimum touch target** — All buttons 48x48dp+
- **Screen reader support** — Accessibility labels/hints on all UI elements
- **Text input mode** — Chat mode for users who cannot make voice calls

## License

Private - All rights reserved
