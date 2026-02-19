<div align="center">

<img src="docs/assets/wigvo_logo.png" alt="WIGVO" width="480" />

<br />
<br />

**AI-Powered Realtime Phone Translation & Relay Platform**

Real-time bidirectional voice translation over actual phone calls.
No apps needed on the recipient's end. Just call.

<br />

[![Live Demo](https://img.shields.io/badge/Live_Demo-wigvo.run-0F172A?style=for-the-badge&logo=google-cloud&logoColor=white)](https://wigvo.run)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](#tech-stack)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](#tech-stack)
[![Tests](https://img.shields.io/badge/Tests-136_passing-22C55E?style=for-the-badge&logo=pytest&logoColor=white)](#testing)

<br />

[한국어](README.ko.md)

</div>

---

## What is WIGVO?

WIGVO connects people across language barriers through **real phone calls** — not chat, not text translation, but actual voice conversations where each side speaks their own language naturally.

```
You say:      "I'd like to make a reservation for tonight"
                    ↓ OpenAI Realtime API (< 500ms)
Recipient hears:  "오늘 저녁 예약하고 싶은데요"  ← via Twilio phone call
                    ↓
Recipient says:   "네, 몇 시에 오실 건가요?"
                    ↓ OpenAI Realtime API (< 500ms)
You hear:         "Yes, what time would you like to come?"
```

The recipient just answers a normal phone call. No apps. No setup. They don't even know AI is involved.

---

## The Problem

Every year, **2M+ foreigners in South Korea** struggle with a simple task: making a phone call.

Booking a hospital appointment. Ordering delivery. Calling a restaurant. Contacting a government office. These require Korean-language phone calls — and existing translation apps only handle **one-way text**, not **real-time bidirectional voice over a phone line**.

| Who | Pain Point | Scale |
|-----|-----------|-------|
| Foreigners in Korea | Can't make calls in Korean | 2.2M residents (2024) |
| Koreans abroad | Can't make calls in local language | 2.8M overseas Koreans |
| Speech/hearing disabilities | Voice calls inaccessible | 390K registered in Korea |
| Phone anxiety (콜포비아) | Avoid calls entirely | ~40% of Korean Gen-Z |

**No existing product solves bidirectional real-time voice translation + phone connection in a single platform.**

---

## How It Works

### For the User (Web App)

```
┌─────────────────────────────────────────────────────────┐
│  1. Chat with AI         "식당 예약하고 싶어요"              │
│     ↓                                                    │
│  2. AI collects info     날짜, 시간, 인원, 요청사항         │
│     ↓                                                    │
│  3. Find the place       네이버 장소 검색 → 전화번호 확인    │
│     ↓                                                    │
│  4. One-click call       Relay Server → Twilio 발신       │
│     ↓                                                    │
│  5. Real-time monitor    자막 + 상태 표시                   │
└─────────────────────────────────────────────────────────┘
```

### Supported Modes & Pipeline Architecture

Each communication mode is handled by a dedicated **pipeline** (Strategy pattern), enabling independent development and testing:

| Mode | Pipeline | Input | Output | For |
|------|----------|-------|--------|-----|
| **Voice → Voice** | `VoiceToVoicePipeline` | Speak your language | Translated speech + captions | General users |
| **Voice → Text** | `VoiceToVoicePipeline` (suppress audio) | Speak | Real-time captions only | Hearing disabilities |
| **Text → Voice** | `TextToVoicePipeline` | Type text | AI speaks for you via phone | Speech disabilities, phone anxiety |
| **Agent Mode** | `FullAgentPipeline` | Provide info upfront | AI handles entire call autonomously | Anyone |

```
AudioRouter (thin delegator)
    │
    ├── VoiceToVoicePipeline  ← EchoDetector + full audio path
    ├── TextToVoicePipeline   ← Per-response instruction + text-only Session B
    └── FullAgentPipeline     ← Function calling + autonomous AI
```

---

## Architecture

```
┌──────────────────┐         ┌───────────────────────────────┐         ┌──────────────────┐
│                  │         │                               │         │                  │
│   Next.js Web    │◄──WS──►│       Relay Server            │◄──WS──►│  OpenAI Realtime  │
│   (Chat + Call   │         │       (FastAPI)               │         │  API (GPT-4o)    │
│    Monitor)      │         │                               │         │                  │
│                  │         │  ┌───────────┐ ┌───────────┐  │         └──────────────────┘
└──────────────────┘         │  │ Session A │ │ Session B │  │
                             │  │ User→Recv │ │ Recv→User │  │         ┌──────────────────┐
┌──────────────────┐         │  └───────────┘ └───────────┘  │◄──WS──►│  Twilio Media    │
│                  │         │                               │         │  Streams         │
│  React Native    │◄──WS──►│  ┌───────────┐ ┌───────────┐  │         │  (Phone Bridge)  │
│  Mobile App      │         │  │ Echo Gate │ │ Guardrail │  │         │                  │
│  (VAD + Audio)   │         │  └───────────┘ └───────────┘  │         └──────────────────┘
│                  │         │                               │
└──────────────────┘         └───────────────┬───────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │    Supabase     │
                                    │  PostgreSQL +   │
                                    │  Auth + RLS     │
                                    └─────────────────┘
```

### Why Dual Sessions?

A single translation session can't handle bidirectional conversation — it confuses translation direction. WIGVO runs **two simultaneous OpenAI Realtime sessions**:

- **Session A** (User → Recipient): Translates user speech into recipient's language, outputs via Twilio
- **Session B** (Recipient → User): Captures recipient speech from Twilio, translates back to user's language

This is the core architectural decision that makes real-time bidirectional phone translation possible.

---

## Key Technical Innovations

### Echo Prevention — Dual-Layer Detection

When Session A sends translated audio to the recipient via Twilio, that same audio echoes back into Session B's microphone. Without mitigation, this creates an infinite translation loop.

**Layer 1: Audio Fingerprint Echo Detector (default)**

Per-chunk energy fingerprint analysis using Pearson correlation:

```
Session A TTS chunks          Twilio incoming audio
       │                              │
       ▼                              ▼
  Record RMS energy           Compare energy pattern
  to reference buffer         against reference at
  (timestamp, RMS)            80–600ms delay offsets
                                      │
                                      ▼
                              Pearson correlation r
                              r > 0.6 → ECHO (drop)
                              r ≤ 0.6 → GENUINE (pass through immediately)
```

- Only **echo chunks are dropped** — genuine recipient speech passes through immediately
- Scale-invariant: works even with 10–30dB signal attenuation
- **Zero false-positive speech loss** vs. the blanket blocking approach

**Layer 2: Echo Gate v2 (output-side gating)**

```
                      ┌─────── TTS Playing ───────┐
                      │                           │
Input (recipient):    │  ● Always active          │  ← Never miss real speech
Output (to user):     │  ○ Suppressed → Queue     │  ← Prevent echo forwarding
                      │                           │
                      └───── Cooldown (300ms) ────┘
                                    │
                              Flush queued output
```

- Input is **never blocked** — recipient speech detection stays active during echo suppression
- Output is **queued** during TTS playback, then flushed after cooldown
- Recipient speech **immediately releases** the gate (priority interrupt)

> **Note**: EchoDetector is only active in **VoiceToVoicePipeline**. TextToVoice/FullAgent don't need echo detection since user input is text (no TTS echo loop possible).

### Guardrail System — Translation Quality Verification

Real-time translation must balance speed and quality. Our 3-level system adds **zero latency** in 95%+ of cases:

| Level | Trigger | Action | Added Latency |
|-------|---------|--------|---------------|
| **L1** | Clean translation | Pass through | **0ms** |
| **L2** | Informal speech detected | TTS immediately, correct in background | **0ms** |
| **L3** | Profanity / harmful content | Block + filler audio + GPT-4o-mini correction | **~800ms** |

### Session Recovery — Zero-Downtime Resilience

OpenAI Realtime sessions can drop. Mid-call recovery is critical.

```
Normal ──► Heartbeat miss ──► Reconnect (exponential backoff)
                                    │
                              ┌─────┴─────┐
                              │           │
                         Success      Fail (10s)
                              │           │
                    Ring buffer        Degraded mode
                    catch-up           (Whisper batch
                    (unsent audio)      fallback)
```

- **Ring buffer**: 30-second circular buffer retains undelivered audio chunks
- **Catch-up**: On reconnect, unsent audio is batch-transcribed via Whisper and re-injected
- **Degraded mode**: After 10s failure, switches to Whisper STT + GPT-4o-mini translation

### Client-side VAD — 40% API Cost Reduction

The mobile app performs **Voice Activity Detection locally**, sending only speech frames to the server:

- RMS energy-based detection with configurable thresholds
- State machine: `SILENT → SPEAKING → COMMITTED`
- 300ms pre-speech ring buffer prevents onset clipping
- Reduces audio data sent to OpenAI by ~40%, directly cutting costs

### Interrupt Priority — Natural Conversation Flow

Phone calls have natural turn-taking. Our priority system ensures the recipient is never kept waiting:

```
Priority 1 (highest):  Recipient speech  → Immediately cancel AI output
Priority 2:            User speech        → Cancel AI, queue for translation
Priority 3 (lowest):   AI generation      → Can be interrupted by anyone
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Relay Server** | Python 3.12+, FastAPI, uvicorn | Async WebSocket handling, low latency |
| **Web App** | Next.js 16, React 19, shadcn/ui, Zustand | SSR, real-time UI updates |
| **Mobile App** | React Native, Expo SDK 54 | Cross-platform, expo-av for audio |
| **Realtime AI** | OpenAI Realtime API (GPT-4o) | Sub-second STT + Translation + TTS |
| **Chat AI** | GPT-4o-mini | Cost-efficient data collection |
| **Telephony** | Twilio (REST + Media Streams) | Reliable phone call infrastructure |
| **Database** | Supabase (PostgreSQL + Auth + RLS) | Real-time subscriptions, row-level security |
| **Place Search** | Naver Place Search API | Korean business directory |
| **Deploy** | Docker, Google Cloud Run | Auto-scaling, zero cold start |
| **Package Mgmt** | uv (Python), npm (Web/Mobile) | Fast, reliable dependency resolution |

---

## Project Structure

```
apps/
├── relay-server/                    # Python FastAPI — Real-time Translation Engine
│   ├── src/
│   │   ├── main.py                  # FastAPI entrypoint + lifespan
│   │   ├── call_manager.py          # Call lifecycle singleton (register/cleanup/shutdown)
│   │   ├── config.py                # pydantic-settings env config
│   │   ├── types.py                 # ActiveCall, CostTokens, WsMessage, etc.
│   │   ├── routes/                  # HTTP + WebSocket endpoints
│   │   │   ├── calls.py             # POST /calls/start, /calls/{id}/end
│   │   │   ├── stream.py            # WS /calls/{id}/stream (app ↔ relay)
│   │   │   └── twilio_webhook.py    # Twilio status callbacks
│   │   ├── realtime/                # OpenAI Realtime session management
│   │   │   ├── pipeline/            # Strategy pattern — mode-specific pipelines
│   │   │   │   ├── base.py          # BasePipeline ABC
│   │   │   │   ├── voice_to_voice.py # V2V + V2T (EchoDetector, full audio)
│   │   │   │   ├── text_to_voice.py  # T2V (per-response instruction, text-only B)
│   │   │   │   └── full_agent.py     # Agent (function calling, autonomous)
│   │   │   ├── audio_router.py      # Thin delegator → pipeline selection
│   │   │   ├── echo_detector.py     # Pearson correlation echo detection
│   │   │   ├── audio_utils.py       # Shared mu-law audio utilities
│   │   │   ├── session_manager.py   # Dual session orchestrator
│   │   │   ├── session_a.py         # User → Recipient translation
│   │   │   ├── session_b.py         # Recipient → User translation
│   │   │   ├── context_manager.py   # 6-turn sliding context window
│   │   │   ├── recovery.py          # Session failure recovery + degraded mode
│   │   │   └── ring_buffer.py       # 30s circular audio buffer
│   │   ├── guardrail/               # 3-level translation quality system
│   │   ├── tools/                   # Agent Mode function calling
│   │   ├── prompt/                  # System prompt templates + generator
│   │   └── db/                      # Supabase client
│   ├── tests/                       # 147 pytest unit tests
│   │   ├── component/              # Module benchmarks (cost tracking, ring buffer perf)
│   │   ├── integration/            # Server-required tests (API, WebSocket)
│   │   ├── e2e/                    # End-to-end call tests (Twilio + OpenAI required)
│   │   └── run.py                  # Test runner (--suite, --test options)
│
├── web/                             # Next.js 16 — Chat Agent + Call Monitor
│   ├── app/
│   │   ├── page.tsx                 # Dashboard (chat + call interface)
│   │   ├── api/                     # 7 API routes (chat, calls, conversations)
│   │   ├── calling/[id]/            # Real-time call monitoring
│   │   └── result/[id]/             # Call result display
│   ├── lib/
│   │   ├── services/                # Chat pipeline (chat-service, place-matcher, data-extractor)
│   │   ├── supabase/                # SSR client + helpers
│   │   └── scenarios/               # Scenario prompts (restaurant, hospital, salon, etc.)
│   ├── hooks/                       # useChat, useCallPolling, useRelayWebSocket, useDashboard
│   ├── components/                  # chat/, call/, dashboard/, ui/ (shadcn)
│   └── shared/types.ts              # Canonical type definitions (Call, Conversation, CallRow)
│
└── mobile/                          # React Native (Expo) — VAD + Audio Client
    ├── app/                         # Expo Router (auth + main screens)
    ├── hooks/                       # useRealtimeCall, useClientVad, useAudioRecorder
    ├── components/call/             # RealtimeCallView, LiveCaptionPanel, VadIndicator
    └── lib/vad/                     # VAD core (processor, ring buffer, config)
```

---

## API Reference

### Relay Server

| Endpoint | Type | Description |
|----------|------|-------------|
| `POST /relay/calls/start` | HTTP | Initiate outbound call via Twilio |
| `POST /relay/calls/{id}/end` | HTTP | Terminate active call |
| `WS /relay/calls/{id}/stream` | WebSocket | Bidirectional audio/text stream |
| `POST /twilio/incoming` | HTTP | Twilio call status webhook |
| `WS /twilio/media-stream` | WebSocket | Twilio Media Stream audio bridge |
| `GET /health` | HTTP | Health check |

### Web App

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | AI conversation (GPT-4o-mini, scenario-based) |
| `/api/conversations` | GET/POST | List or create conversation sessions |
| `/api/conversations/[id]` | GET | Conversation details with messages |
| `/api/calls` | GET/POST | List or create call records |
| `/api/calls/[id]` | GET | Call details (status, result, summary) |
| `/api/calls/[id]/start` | POST | Trigger call via Relay Server |

---

## Database Schema

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `conversations` | scenario, status, collected_data (JSONB) | Chat sessions with extracted info |
| `messages` | role, content, metadata (JSONB) | User + AI messages |
| `calls` | status, result, call_sid, duration_s, total_tokens | Call lifecycle tracking |
| `conversation_entities` | entity_type, value, confidence | Structured data extraction |
| `place_search_cache` | query, results (JSONB), expires_at | Naver API response cache |

All tables enforce **Row Level Security** — users can only access their own data.

---

## Getting Started

### Prerequisites

- Python 3.12+ / Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [ngrok](https://ngrok.com/) (Twilio webhooks in dev)
- API keys: OpenAI, Twilio, Supabase, Naver (optional)

### Quick Start

```bash
# 1. Clone
git clone https://github.com/wigtn/wigvo-v2.git
cd wigvo-v2

# 2. Relay Server
cd apps/relay-server
cp .env.example .env          # Fill in API keys
uv sync
uv run uvicorn src.main:app --reload --port 8000

# 3. Web App (new terminal)
cd apps/web
cp .env.example .env.local    # Fill in API keys
npm install
npm run dev

# 4. ngrok (new terminal)
ngrok http 8000               # Copy URL to .env RELAY_SERVER_URL
```

### Testing

```bash
# Unit tests (147 tests, no server needed)
cd apps/relay-server
uv run pytest -v

# Component tests (ring buffer perf, cost tracking)
uv run python -m tests.run --suite component

# Integration tests (requires running server)
uv run python -m tests.run --suite integration

# Individual test
uv run python -m tests.run --test cost

# E2E call test (requires Twilio + OpenAI keys)
uv run python -m tests.run --test call --phone +82... --scenario restaurant --auto
```

### Deployment

Both services are containerized and deploy to **Google Cloud Run**:

```bash
# Build & deploy via Cloud Build
gcloud builds submit --config=cloudbuild.yaml
```

| Service | Dockerfile | Cloud Run |
|---------|-----------|-----------|
| Relay Server | `apps/relay-server/Dockerfile` | Auto-scaling, WebSocket support |
| Web App | `apps/web/Dockerfile` | Next.js standalone output |

---

## Market Opportunity

| Segment | TAM (Korea) | Willingness to Pay |
|---------|------------|-------------------|
| Foreign residents | 2.2M (growing 8% YoY) | High — daily necessity |
| Overseas Koreans | 2.8M | Medium — occasional use |
| Disability services | Government-funded programs | Institutional contracts |
| Phone anxiety (Gen-Z) | ~4M estimated | Subscription model |

**Competitive landscape**: Google Translate handles text. Papago handles text + limited voice. **Nobody handles real-time bidirectional voice over an actual phone line.** The closest alternatives require both parties to use an app — WIGVO only requires one side.

---

## License

All rights reserved.

---

<div align="center">

Built with OpenAI Realtime API, Twilio, Supabase, and a lot of WebSocket debugging.

</div>
