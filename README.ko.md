<div align="center">

<img src="docs/assets/wigvo_logo.png" alt="WIGVO" width="480" />

<br />
<br />

**AI 실시간 전화 통역 & 중계 플랫폼**

실제 전화 통화에서 양방향 실시간 음성 번역.
상대방은 앱 설치 없이 그냥 전화를 받으면 됩니다.

<br />

[![Live Demo](https://img.shields.io/badge/Live_Demo-wigvo.run-0F172A?style=for-the-badge&logo=google-cloud&logoColor=white)](https://wigvo.run)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](#기술-스택)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](#기술-스택)
[![Tests](https://img.shields.io/badge/Tests-136_passing-22C55E?style=for-the-badge&logo=pytest&logoColor=white)](#테스트)

<br />

[English](README.md)

</div>

---

## WIGVO란?

WIGVO는 **실제 전화 통화**에서 언어 장벽을 없애는 플랫폼입니다. 채팅도, 텍스트 번역도 아닌 — 양쪽이 각자 모국어로 자연스럽게 대화하는 **실시간 음성 통화**입니다.

```
사용자:        "I'd like to make a reservation for tonight"
                    ↓ OpenAI Realtime API (< 500ms)
수신자가 듣는 말:  "오늘 저녁 예약하고 싶은데요"  ← Twilio 전화로 전달
                    ↓
수신자:           "네, 몇 시에 오실 건가요?"
                    ↓ OpenAI Realtime API (< 500ms)
사용자가 듣는 말:  "Yes, what time would you like to come?"
```

수신자는 그냥 평범한 전화를 받는 것뿐입니다. 앱도 없고, 설정도 없고, AI가 관여하는지조차 모릅니다.

---

## 해결하려는 문제

매년 **한국 체류 외국인 200만 명 이상**이 단순한 일에서 막힙니다: 전화 한 통.

병원 예약. 배달 주문. 식당 예약. 관공서 문의. 이 모든 게 한국어 전화 통화를 요구합니다 — 그런데 기존 번역 앱은 **일방향 텍스트**만 처리하지, **실제 전화선 위의 실시간 양방향 음성**은 처리하지 못합니다.

| 대상 | 문제 | 규모 |
|------|------|------|
| 재한 외국인 | 한국어 전화 불가 | 220만 명 (2024) |
| 재외 한국인 | 현지어 전화 어려움 | 280만 명 |
| 언어/청각 장애인 | 음성 통화 접근성 부재 | 등록 39만 명 |
| 콜포비아 (Gen-Z) | 전화 자체를 회피 | 추정 ~400만 명 |

**양방향 실시간 음성 번역 + 전화 연결을 하나의 플랫폼에서 해결하는 제품은 아직 없습니다.**

---

## 사용 흐름

### 사용자 (Web App)

```
┌─────────────────────────────────────────────────────────┐
│  1. AI와 채팅          "식당 예약하고 싶어요"               │
│     ↓                                                    │
│  2. 정보 수집          날짜, 시간, 인원, 요청사항           │
│     ↓                                                    │
│  3. 장소 검색          네이버 장소 검색 → 전화번호 확인      │
│     ↓                                                    │
│  4. 원클릭 통화        Relay Server → Twilio 발신          │
│     ↓                                                    │
│  5. 실시간 모니터링     자막 + 통화 상태 표시                │
└─────────────────────────────────────────────────────────┘
```

### 지원 모드 & 파이프라인 아키텍처

각 통신 모드는 독립적인 **파이프라인** (Strategy 패턴)으로 처리되어, 모드별 독립 개발과 테스트가 가능합니다:

| 모드 | 파이프라인 | 입력 | 출력 | 대상 |
|------|----------|------|------|------|
| **Voice → Voice** | `VoiceToVoicePipeline` | 모국어 음성 | 번역된 음성 + 자막 | 일반 사용자 |
| **Voice → Text** | `VoiceToVoicePipeline` (audio 억제) | 음성 | 실시간 자막 | 청각 장애 |
| **Text → Voice** | `TextToVoicePipeline` | 텍스트 입력 | AI가 대신 말해줌 | 언어 장애, 콜포비아 |
| **Agent Mode** | `FullAgentPipeline` | 정보만 제공 | AI가 전화 전체를 자율 진행 | 모든 사용자 |

```
AudioRouter (얇은 위임자)
    │
    ├── VoiceToVoicePipeline  ← EchoDetector + 전체 오디오 경로
    ├── TextToVoicePipeline   ← Per-response instruction + 텍스트 전용 Session B
    └── FullAgentPipeline     ← Function Calling + 자율 AI 대화
```

---

## 아키텍처

```
┌──────────────────┐         ┌───────────────────────────────┐         ┌──────────────────┐
│                  │         │                               │         │                  │
│   Next.js Web    │◄──WS──►│       Relay Server            │◄──WS──►│  OpenAI Realtime  │
│   (Chat + Call   │         │       (FastAPI)               │         │  API (GPT-4o)    │
│    Monitor)      │         │                               │         │                  │
│                  │         │  ┌───────────┐ ┌───────────┐  │         └──────────────────┘
└──────────────────┘         │  │ Session A │ │ Session B │  │
                             │  │ User→수신자│ │ 수신자→User│  │         ┌──────────────────┐
┌──────────────────┐         │  └───────────┘ └───────────┘  │◄──WS──►│  Twilio Media    │
│                  │         │                               │         │  Streams         │
│  React Native    │◄──WS──►│  ┌───────────┐ ┌───────────┐  │         │  (전화 브릿지)    │
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

### 왜 이중 세션인가?

단일 번역 세션은 양방향 대화를 처리할 수 없습니다 — 번역 방향이 혼동됩니다. WIGVO는 **두 개의 OpenAI Realtime 세션을 동시에** 운영합니다:

- **Session A** (User → 수신자): 사용자 발화를 수신자 언어로 번역, Twilio로 출력
- **Session B** (수신자 → User): Twilio에서 수신자 발화를 캡처, 사용자 언어로 번역

이것이 실시간 양방향 전화 번역을 가능하게 하는 핵심 아키텍처 결정입니다.

---

## 핵심 기술

### 에코 방지 — 이중 레이어 감지

Session A가 번역된 음성을 Twilio로 보내면, 그 음성이 Session B 마이크로 에코됩니다. 대응 없이는 무한 번역 루프가 발생합니다.

**Layer 1: 오디오 핑거프린트 에코 감지기 (기본)**

Pearson 상관계수를 이용한 청크별 에너지 핑거프린트 분석:

```
Session A TTS 청크            Twilio 수신 오디오
       │                              │
       ▼                              ▼
  RMS 에너지 기록              80–600ms 지연 오프셋별
  참조 버퍼에 저장              에너지 패턴 비교
  (타임스탬프, RMS)                    │
                                      ▼
                              Pearson 상관계수 r
                              r > 0.6 → 에코 (드롭)
                              r ≤ 0.6 → 실제 발화 (즉시 통과)
```

- **에코 청크만 드롭** — 실제 수신자 발화는 즉시 통과
- 스케일 불변: 10–30dB 감쇠에도 정상 동작
- 전면 차단 방식 대비 **음성 유실 제로**

**Layer 2: Echo Gate v2 (출력측 게이팅)**

```
                      ┌─────── TTS 재생 중 ────────┐
                      │                            │
입력 (수신자 음성):    │  ● 항상 활성               │  ← 실제 발화를 놓치지 않음
출력 (사용자에게):     │  ○ 억제 → 큐에 저장        │  ← 에코 전달 차단
                      │                            │
                      └───── 쿨다운 (300ms) ────────┘
                                    │
                              큐에 쌓인 출력 배출
```

> **참고**: EchoDetector는 **VoiceToVoicePipeline**에서만 활성화됩니다. TextToVoice/FullAgent는 사용자 입력이 텍스트이므로 TTS 에코 루프 자체가 불가능하여 에코 감지가 불필요합니다.

### 가드레일 시스템 — 번역 품질 보장

95%+ 케이스에서 **지연 시간 제로**:

| 레벨 | 트리거 | 동작 | 추가 지연 |
|------|--------|------|----------|
| **L1** | 정상 번역 | 통과 | **0ms** |
| **L2** | 반말 감지 | TTS 먼저, 백그라운드 교정 | **0ms** |
| **L3** | 욕설/유해 콘텐츠 | 차단 + 필러 음성 + GPT-4o-mini 교정 | **~800ms** |

### 세션 복구 — 무중단 통화

OpenAI 세션이 끊어져도 통화는 계속됩니다:

- **링 버퍼**: 30초 순환 버퍼가 미전송 오디오 보존
- **Catch-up**: 재연결 시 미전송 오디오를 Whisper로 일괄 전사 후 재주입
- **Degraded 모드**: 10초 복구 실패 시 Whisper STT + GPT-4o-mini 번역으로 전환

### 클라이언트 VAD — API 비용 40% 절감

모바일 앱에서 **음성 활동 감지를 로컬로 수행**하여 음성 프레임만 서버로 전송:

- RMS 에너지 기반 감지 + 상태 머신 (`SILENT → SPEAKING → COMMITTED`)
- 발화 시작 손실 방지용 300ms 프리스피치 링 버퍼
- OpenAI로 전송되는 오디오 데이터를 ~40% 감소 → 비용 직감

---

## 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|----------|
| **Relay Server** | Python 3.12+, FastAPI, uvicorn | 비동기 WebSocket 처리, 저지연 |
| **Web App** | Next.js 16, React 19, shadcn/ui, Zustand | SSR, 실시간 UI 업데이트 |
| **Mobile App** | React Native, Expo SDK 54 | 크로스 플랫폼, expo-av 오디오 |
| **실시간 AI** | OpenAI Realtime API (GPT-4o) | 1초 이내 STT + 번역 + TTS |
| **채팅 AI** | GPT-4o-mini | 비용 효율적 데이터 수집 |
| **전화** | Twilio (REST + Media Streams) | 안정적 전화 인프라 |
| **데이터베이스** | Supabase (PostgreSQL + Auth + RLS) | 실시간 구독, 행 수준 보안 |
| **장소 검색** | 네이버 장소 검색 API | 한국 업종 디렉토리 |
| **배포** | Docker, Google Cloud Run | 자동 스케일링 |
| **패키지 관리** | uv (Python), npm (Web/Mobile) | 빠르고 안정적 의존성 관리 |

---

## 시작하기

### 사전 요구사항

- Python 3.12+ / Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python 패키지 매니저)
- [ngrok](https://ngrok.com/) (개발환경 Twilio 웹훅용)
- API 키: OpenAI, Twilio, Supabase, 네이버 (선택)

### 빠른 시작

```bash
# 1. Clone
git clone https://github.com/wigtn/wigvo-v2.git
cd wigvo-v2

# 2. Relay Server
cd apps/relay-server
cp .env.example .env          # API 키 입력
uv sync
uv run uvicorn src.main:app --reload --port 8000

# 3. Web App (새 터미널)
cd apps/web
cp .env.example .env.local    # API 키 입력
npm install
npm run dev

# 4. ngrok (새 터미널)
ngrok http 8000               # URL을 .env의 RELAY_SERVER_URL에 입력
```

### 테스트

```bash
# 단위 테스트 (147개, 서버 불필요)
cd apps/relay-server
uv run pytest -v

# 컴포넌트 테스트 (링 버퍼 성능, 비용 추적)
uv run python -m tests.run --suite component

# 통합 테스트 (서버 실행 필요)
uv run python -m tests.run --suite integration

# E2E 통화 테스트 (Twilio + OpenAI 키 필요)
uv run python -m tests.run --test call --phone +82... --scenario restaurant --auto
```

### 배포

두 서비스 모두 컨테이너화되어 **Google Cloud Run**에 배포됩니다:

```bash
gcloud builds submit --config=cloudbuild.yaml
```

---

## 시장 기회

| 세그먼트 | TAM (한국) | 지불 의향 |
|---------|-----------|----------|
| 재한 외국인 | 220만 (연 8% 성장) | 높음 — 일상 필수 |
| 재외 한국인 | 280만 | 중간 — 간헐적 사용 |
| 장애인 서비스 | 정부 지원 프로그램 | 기관 계약 |
| 콜포비아 (Gen-Z) | 추정 ~400만 | 구독 모델 |

**경쟁 현황**: Google 번역은 텍스트. 파파고도 텍스트 + 제한적 음성. **실제 전화선 위의 실시간 양방향 음성 번역은 아무도 하지 않습니다.** 가장 가까운 대안도 양쪽 모두 앱 설치를 요구 — WIGVO는 한쪽만 있으면 됩니다.

---

## 라이선스

All rights reserved.

---

<div align="center">

OpenAI Realtime API, Twilio, Supabase, 그리고 수많은 WebSocket 디버깅으로 만들었습니다.

</div>
