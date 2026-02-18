# Pipeline Separation & Text-to-Voice Port PRD

> **Version**: 1.2
> **Created**: 2026-02-18
> **Updated**: 2026-02-18
> **Status**: Draft
> **Based on**: main (Python/FastAPI) + hskim-wigvo-test (TypeScript/Fastify) codebase analysis

---

## 1. Overview

### 1.1 Problem Statement

현재 relay-server의 `AudioRouter`(557줄)는 모놀리식 클래스로, 모든 통신 모드(voice_to_voice, text_to_voice, voice_to_text, full_agent)의 로직이 하나에 혼재한다.

| 문제 | 영향 |
|------|------|
| 모드별 분기가 AudioRouter 내부 곳곳에 흩어짐 | 새 모드 추가/수정 시 regression 위험 |
| Session A/B가 항상 `['text', 'audio']` modality로 고정 | text_to_voice 모드에서 불필요한 audio output 토큰 소비 |
| EchoDetector + legacy Echo Gate 이중 경로가 모든 모드에서 초기화됨 | text 입력 모드에서 불필요한 에코 감지 오버헤드 |
| hskim-wigvo-test의 검증된 text-to-voice 패턴 미반영 | per-response instruction, exact utterance 등 유용한 패턴 미활용 |

### 1.2 Goals

- G1: AudioRouter를 Strategy 패턴으로 분리하여 모드별 독립 관리
- G2: hskim-wigvo-test의 text-to-voice 핵심 패턴을 Python으로 이식
- G3: 기존 voice_to_voice 기능 100% 유지 (124개 테스트 통과)
- G4: text_to_voice 모드에서 Session B audio 토큰 절약 (modality `['text']`)

### 1.3 Non-Goals (Out of Scope)

- TypeScript relay-server 자체를 포팅하는 것 (패턴만 이식)
- 모바일 앱 변경 (이번 PRD는 relay-server only)
- Web 클라이언트 변경 (기존 WsMessage 프로토콜 유지)
- `packages/shared` 형태의 공유 패키지 도입

### 1.4 Scope

| 포함 | 제외 |
|------|------|
| `apps/relay-server/src/realtime/` 리팩토링 | 모바일/웹 클라이언트 변경 |
| Pipeline 분리 (4개 모드 → 3개 Pipeline + 1 서브모드) | 새로운 통신 모드 추가 |
| hskim 패턴 이식 (5개 항목) | TypeScript 코드 직접 이식 |
| 기존 테스트 유지 + 신규 테스트 | E2E 통화 테스트 |

**모드 → Pipeline 매핑:**

| CommunicationMode | Pipeline | 비고 |
|-------------------|----------|------|
| `VOICE_TO_VOICE` | VoiceToVoicePipeline | 기본 모드 |
| `VOICE_TO_TEXT` | VoiceToVoicePipeline (`suppress_b_audio=True`) | Session B audio 출력만 생략 |
| `TEXT_TO_VOICE` | TextToVoicePipeline | hskim 이식 대상 |
| `FULL_AGENT` | FullAgentPipeline | TextToVoice 기반 + Function Calling |

---

## 2. User Stories

### 2.1 개발자 (Maintainability)

As a **개발자**, I want to **모드별로 분리된 파이프라인을 독립적으로 수정**할 수 있어야 한다, so that **voice_to_voice를 수정할 때 text_to_voice에 영향이 없다**.

### 2.2 사용자 (Text-to-Voice Quality)

As a **text_to_voice 사용자**, I want to **텍스트를 입력하면 정확히 그 문장만 번역되어 수신자에게 전달**되어야 한다, so that **AI가 임의로 내용을 추가하거나 변형하지 않는다**.

### 2.3 운영자 (Cost Efficiency)

As a **운영자**, I want to **text_to_voice 모드에서 Session B의 audio output 토큰을 절약**해야 한다, so that **불필요한 TTS 비용이 발생하지 않는다**.

### 2.4 Acceptance Criteria (Gherkin)

```
Scenario: Voice-to-Voice 기존 동작 유지
  Given 사용자가 voice_to_voice 모드로 통화를 시작한다
  When 사용자가 음성을 입력한다
  Then Session A에 pcm16 오디오가 전달된다
  And Session B가 번역 음성(pcm16)을 App에 전달한다
  And Echo Gate가 정상 작동한다

Scenario: Text-to-Voice 번역 정확성
  Given 사용자가 text_to_voice 모드로 통화를 시작한다
  When 사용자가 "I'd like to make a reservation" 텍스트를 입력한다
  Then Session A가 conversation.item.create로 텍스트를 수신한다
  And response.create에 strict relay instruction이 포함된다
  And Twilio로 번역된 한국어 TTS 오디오만 전달된다
  And AI가 임의로 추가 문장을 생성하지 않는다

Scenario: Text-to-Voice Session B 텍스트 전용
  Given text_to_voice 모드의 통화가 진행 중이다
  When 수신자가 한국어로 응답한다
  Then Session B가 modalities=['text']로 설정되어 있다
  And App에 번역 텍스트(자막)만 전달된다
  And Session B audio output 토큰이 0이다

Scenario: First Message Exact Utterance
  Given 통화가 연결되고 수신자가 응답한다
  When First Message를 전송해야 한다
  Then "Say exactly this sentence and nothing else:" 래핑으로 전달된다
  And AI가 인사말을 확장하거나 변형하지 않는다
```

---

## 3. Functional Requirements

| ID | Requirement | Priority | Dependencies |
|----|------------|----------|--------------|
| FR-001 | `pipeline/` 디렉토리에 BasePipeline ABC 생성 | P0 | - |
| FR-002 | VoiceToVoicePipeline: 기존 AudioRouter 로직 이전 | P0 | FR-001 |
| FR-003 | TextToVoicePipeline: hskim 패턴 기반 구현 | P0 | FR-001 |
| FR-004 | FullAgentPipeline: Agent Mode 로직 이전 | P1 | FR-001 |
| FR-005 | AudioRouter를 얇은 위임자로 리팩토링 | P0 | FR-002, FR-003 |
| FR-006 | DualSessionManager에 communication_mode별 config 분기 추가 | P0 | - |
| FR-007 | Per-response instruction override 구현 | P0 | FR-003 |
| FR-008 | sendExactUtteranceToSessionA 패턴 이식 | P1 | - |
| FR-009 | Session B modalities 동적 설정 (`['text']` / `['text','audio']`) | P0 | FR-006 |
| FR-010 | STT 모델을 `gpt-4o-mini-transcribe`로 업그레이드 | P2 | - |
| FR-011 | Translation buffer 서버 누적 패턴 이식 | P2 | FR-003 |
| FR-012 | 기존 124개 테스트 통과 유지 | P0 | FR-002, FR-005 |
| FR-013 | Pipeline별 신규 단위 테스트 추가 | P1 | FR-002, FR-003, FR-004 |

---

## 4. Non-Functional Requirements

### 4.1 Performance

- 기존 voice_to_voice 레이턴시 변화 없음 (pipeline 위임 오버헤드 < 1ms)
- text_to_voice Session B audio 토큰 0 (modality `['text']` 검증)

### 4.2 Backward Compatibility

- `WsMessage` 프로토콜 변경 없음 (App/Web 클라이언트 수정 불필요)
- `CallStartRequest` 스키마 변경 없음
- `CommunicationMode` enum 변경 없음

### 4.3 Testability

- 각 Pipeline이 독립적으로 테스트 가능해야 함
- 기존 AudioRouter mock 패턴 유지

---

## 5. Technical Design

### 5.1 Pipeline Architecture

```
apps/relay-server/src/realtime/
├── pipeline/
│   ├── __init__.py
│   ├── base.py              # BasePipeline ABC
│   ├── voice_to_voice.py    # VoiceToVoicePipeline (EchoDetector 포함)
│   ├── text_to_voice.py     # TextToVoicePipeline (에코 감지 불필요)
│   └── full_agent.py        # FullAgentPipeline (에코 감지 불필요)
├── audio_router.py          # 얇은 위임자 → Pipeline 선택 + 공통 생명주기
├── audio_utils.py           # 공유 mu-law 유틸리티 (ulaw_rms) ← 이미 존재
├── echo_detector.py         # EchoDetector (Pearson 상관계수 기반) ← 이미 존재
├── session_manager.py       # DualSessionManager (modality 분기 추가)
├── session_a.py             # SessionAHandler (변경 최소)
├── session_b.py             # SessionBHandler (response.text.delta 추가)
├── context_manager.py       # 유지
├── first_message.py         # exact utterance 패턴 추가
├── interrupt_handler.py     # 유지
├── recovery.py              # 유지
└── ring_buffer.py           # 유지
```

**Note**: `audio_utils.py`와 `echo_detector.py`는 이미 구현 완료 상태.
EchoDetector는 VoiceToVoicePipeline에서만 사용하며, TextToVoice/FullAgent 파이프라인에서는 초기화하지 않는다.

### 5.2 BasePipeline Interface

```python
from abc import ABC, abstractmethod

class BasePipeline(ABC):
    """통신 모드별 파이프라인 기본 인터페이스."""

    def __init__(self, call, dual_session, twilio_handler, app_ws_send, **kwargs):
        self.call = call
        self.dual_session = dual_session
        self.twilio_handler = twilio_handler
        self._app_ws_send = app_ws_send

    @abstractmethod
    async def handle_user_audio(self, audio_b64: str) -> None:
        """User 오디오 입력 처리."""

    @abstractmethod
    async def handle_user_audio_commit(self) -> None:
        """Client VAD 발화 종료 처리."""

    @abstractmethod
    async def handle_user_text(self, text: str) -> None:
        """User 텍스트 입력 처리."""

    @abstractmethod
    async def handle_twilio_audio(self, audio_bytes: bytes) -> None:
        """Twilio 수신자 오디오 처리."""

    @abstractmethod
    async def start(self) -> None:
        """파이프라인 시작."""

    @abstractmethod
    async def stop(self) -> None:
        """파이프라인 중지."""
```

### 5.3 Pipeline별 Session Config

| Config | VoiceToVoice | VoiceToText (서브모드) | TextToVoice | FullAgent |
|--------|-------------|----------------------|-------------|-----------|
| **Pipeline** | VoiceToVoicePipeline | VoiceToVoicePipeline | TextToVoicePipeline | FullAgentPipeline |
| **Session A modalities** | `['text', 'audio']` | `['text', 'audio']` | `['text', 'audio']` | `['text', 'audio']` |
| **Session A input_audio_format** | `pcm16` | `pcm16` | `pcm16` (유지) | `pcm16` (유지) |
| **Session A turn_detection** | client VAD / server VAD | client VAD / server VAD | `null` (manual) | `null` (manual) |
| **Session A input_audio_transcription** | `whisper-1` | `whisper-1` | N/A | N/A |
| **Session B modalities** | `['text', 'audio']` | `['text', 'audio']` | **`['text']`** | **`['text']`** |
| **Session B output_audio_format** | `pcm16` | `pcm16` | N/A (텍스트만) | N/A (텍스트만) |
| **Session B → App audio** | **전송** | **생략** (`suppress_b_audio`) | N/A | N/A |
| **EchoDetector** | **활성** | **활성** | **불필요** | **불필요** |
| **Audio Energy Gate** | 활성 | 활성 | 활성 | 활성 |
| **Interrupt Handler** | 활성 | 활성 | 활성 | 활성 |
| **Function Calling** | 없음 | 없음 | 없음 | **활성** |

**VoiceToText 서브모드**: `VoiceToVoicePipeline`과 동일한 세션 config를 사용하되, `_on_session_b_audio()` 콜백에서 App으로의 audio 전송만 생략한다. 현재 `audio_router.py:342-344`의 `CommunicationMode.VOICE_TO_TEXT` 분기와 동일 동작.

**EchoDetector vs Legacy Echo Gate**:
- `EchoDetector` (`echo_detector.py`): per-chunk Pearson 상관계수 분석 — 에코 청크만 정밀 드롭 (기본 활성, `echo_detector_enabled=True`)
- Legacy Echo Gate: 2.5s blanket block — TTS 완료 후 전체 입력 차단 (fallback용, `echo_detector_enabled=False` 시)
- TextToVoice/FullAgent: Session A 입력이 텍스트이므로 TTS echo loop 자체가 불가능 → 에코 감지 전체 불필요

### 5.4 Per-Response Instruction Override (hskim 이식)

```python
# TextToVoicePipeline.handle_user_text()
async def handle_user_text(self, text: str) -> None:
    """텍스트 입력 → Session A (per-response instruction 포함)."""
    # 1. conversation.item.create
    await self.dual_session.session_a.send_text_item(text)

    # 2. response.create with strict relay instruction
    strict_instruction = (
        f"Translate the user's message from {self.call.source_language} "
        f"to {self.call.target_language} and speak ONLY that translated sentence. "
        "Do NOT answer, interpret, add extra words, or ask follow-up questions."
    )
    await self.dual_session.session_a.create_response(
        instructions=strict_instruction
    )
```

### 5.5 Exact Utterance Pattern (hskim 이식)

```python
# first_message.py 수정
async def send_exact_utterance(self, text: str) -> None:
    """AI 확장 방지: 정확히 주어진 문장만 발화하도록 강제."""
    await self.session_a.send_text_item(
        f'Say exactly this sentence and nothing else: "{text}"'
    )
    await self.session_a.create_response()
```

### 5.6 RealtimeSession 확장

`session_manager.py`의 `RealtimeSession`에 2개 메서드 추가:

```python
async def send_text_item(self, text: str) -> None:
    """conversation.item.create만 전송 (response.create 분리)."""
    await self._send({
        "type": "conversation.item.create",
        "item": {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": text}],
        },
    })

async def create_response(self, instructions: str | None = None) -> None:
    """response.create 전송 (선택적 per-response instruction 포함)."""
    payload: dict = {"type": "response.create"}
    if instructions:
        payload["response"] = {"instructions": instructions}
    await self._send(payload)
```

### 5.7 DualSessionManager 분기

```python
class DualSessionManager:
    def __init__(self, mode, source_language, target_language, vad_mode,
                 communication_mode=CommunicationMode.VOICE_TO_VOICE):
        # Session A config
        session_a_config = self._build_session_a_config(communication_mode, vad_mode)

        # Session B config (핵심 분기)
        session_b_config = self._build_session_b_config(communication_mode)

    def _build_session_b_config(self, comm_mode):
        if comm_mode in (CommunicationMode.TEXT_TO_VOICE, CommunicationMode.FULL_AGENT):
            return SessionConfig(
                modalities=["text"],           # ← 핵심: audio 제거
                input_audio_format="g711_ulaw",
                output_audio_format=None,       # 출력 없음
                vad_mode=VadMode.SERVER,
                input_audio_transcription={"model": "whisper-1"},
            )
        else:
            return SessionConfig(
                modalities=["text", "audio"],
                input_audio_format="g711_ulaw",
                output_audio_format="pcm16",
                vad_mode=VadMode.SERVER,
                input_audio_transcription={"model": "whisper-1"},
            )
```

### 5.8 AudioRouter 리팩토링

```python
class AudioRouter:
    """얇은 위임자 — Pipeline 선택 + 공통 생명주기 관리."""

    def __init__(self, call, dual_session, twilio_handler, app_ws_send, **kwargs):
        # Pipeline 선택
        self.pipeline = self._create_pipeline(
            call, dual_session, twilio_handler, app_ws_send, **kwargs
        )

    def _create_pipeline(self, call, ...) -> BasePipeline:
        match call.communication_mode:
            case CommunicationMode.VOICE_TO_VOICE:
                return VoiceToVoicePipeline(call, ...)
            case CommunicationMode.VOICE_TO_TEXT:
                return VoiceToVoicePipeline(call, ..., suppress_b_audio=True)
            case CommunicationMode.TEXT_TO_VOICE:
                return TextToVoicePipeline(call, ...)
            case CommunicationMode.FULL_AGENT:
                return FullAgentPipeline(call, ...)
            case _:
                return VoiceToVoicePipeline(call, ...)  # fallback

    # 위임 메서드들
    async def handle_user_audio(self, audio_b64):
        await self.pipeline.handle_user_audio(audio_b64)

    async def handle_user_text(self, text):
        await self.pipeline.handle_user_text(text)

    async def handle_twilio_audio(self, audio_bytes):
        await self.pipeline.handle_twilio_audio(audio_bytes)
```

### 5.9 SessionBHandler response.text.delta 핸들러 추가

Session B가 `modalities=['text']`인 경우, `response.audio_transcript.delta` 대신 `response.text.delta`와 `response.text.done` 이벤트가 발생한다. SessionBHandler에 이 핸들러를 추가해야 한다.

**Spike 검증 결과** (`scripts/tests/spike_text_modality.py`):

| 항목 | 결과 | 비고 |
|------|------|------|
| `response.text.delta` 발생 | **Yes** | `delta` 필드 (기존 핸들러 재사용 가능) |
| `response.text.done` 발생 | **Yes** | **`text` 필드** (NOT `transcript` — 별도 핸들러 필요) |
| `response.audio.delta` 발생 | **No** | text-only 정상 |
| `audio_output_tokens` | **0** | 비용 절약 확인 |
| `speech_started/stopped` | **No** | server VAD가 text-only에서 비활성화됨 (아래 5.10 참조) |

```python
def _register_handlers(self) -> None:
    # 기존 핸들러 유지
    self.session.on("response.audio.delta", self._handle_audio_delta)
    self.session.on("response.audio_transcript.delta", self._handle_transcript_delta)
    self.session.on("response.audio_transcript.done", self._handle_transcript_done)

    # 추가: text-only modality용 핸들러
    self.session.on("response.text.delta", self._handle_transcript_delta)  # delta 필드 동일
    self.session.on("response.text.done", self._handle_text_done)  # text 필드 (transcript 아님!)

async def _handle_text_done(self, event: dict) -> None:
    """response.text.done — text-only modality 전용.

    주의: 필드명이 'text' (response.audio_transcript.done의 'transcript'과 다름)
    """
    text = event.get("text", "")  # ← 'transcript'가 아닌 'text' 필드
    if not text:
        return
    # 이하 _handle_transcript_done과 동일한 로직 (저장, 로깅, 컨텍스트 콜백)
```

### 5.10 Server VAD와 text-only modality의 상호작용

**Spike 결과**: `modalities=['text']`로 설정하면 `input_audio_buffer.speech_started/stopped` 이벤트가 **발생하지 않는다**.

이는 TextToVoice/FullAgent 파이프라인에서 수신자 발화 감지 (First Message, Interrupt)에 영향을 준다:

| 기능 | VoiceToVoice (audio+text) | TextToVoice/FullAgent (text only) |
|------|--------------------------|-----------------------------------|
| `speech_started` | 발생 | **미발생** |
| First Message 감지 | Server VAD | Server VAD (Session B는 여전히 audio modality) |
| Interrupt 감지 | Server VAD | Server VAD (Session B는 여전히 audio modality) |

**해결**: TextToVoice/FullAgent에서 **Session B만** `modalities=['text']`로 설정하고, Session B의 `input_audio_format='g711_ulaw'` + `turn_detection=server_vad`는 유지한다. text-only modality는 **출력**에만 영향을 미치며, 입력 오디오 처리(VAD 포함)는 독립적으로 동작하는지 추가 검증이 필요하다.

**대안 (VAD가 text-only에서 완전 비활성화되는 경우)**: Session B는 `modalities=['text', 'audio']`를 유지하되, `_on_session_b_audio()` 콜백에서 audio 출력을 App에 전달하지 않는 방식으로 구현 (현재 `voice_to_text` 모드와 동일한 패턴). 이 경우 audio output 토큰이 발생하지만, VAD + First Message + Interrupt는 정상 동작한다.

---

## 6. Implementation Phases

### Phase 1: Foundation — BasePipeline + RealtimeSession 확장
- [ ] `pipeline/__init__.py`, `pipeline/base.py` 생성
- [ ] `RealtimeSession.send_text_item()` 추가
- [ ] `RealtimeSession.create_response(instructions=)` 추가
- [ ] `SessionConfig`에 `modalities` 필드 추가
- [ ] `DualSessionManager`에 `communication_mode` 파라미터 + Session B config 분기

**Deliverable**: 기존 동작 변경 없이 새 인터페이스만 추가

### Phase 2: VoiceToVoicePipeline 추출
- [ ] `pipeline/voice_to_voice.py` 생성 — 기존 AudioRouter 로직 이전
- [ ] **EchoDetector** (Pearson 상관계수 per-chunk) + legacy Echo Gate fallback 포함
- [ ] **audio_utils.py** 공유 유틸리티는 현 위치 유지 (pipeline에서 import)
- [ ] Echo Gate, Interrupt, Recovery, Context Manager, Guardrail, Audio Energy Gate 포함
- [ ] AudioRouter를 위임자로 리팩토링 (VoiceToVoice만 우선 연결)
- [ ] **기존 124개 테스트 전수 통과 확인**

**Deliverable**: 기존 기능 동일 (EchoDetector dual-path 포함), 구조만 변경

### Phase 3: TextToVoicePipeline 구현 (hskim 이식)
- [ ] `pipeline/text_to_voice.py` 생성
- [ ] Per-response instruction override 구현 (FR-007)
- [ ] Session B `modalities=['text']` 적용 (FR-009)
- [ ] `response.text.delta` / `response.text.done` 핸들러 SessionBHandler에 추가
- [ ] EchoDetector/Echo Gate 모두 비활성화 (텍스트 입력 = TTS echo loop 불가)
- [ ] Audio Energy Gate는 유지 (Twilio 수신자 오디오 무음 필터링은 여전히 필요)
- [ ] `sendExactUtteranceToSessionA` 패턴 first_message.py에 추가 (FR-008)
- [ ] TextToVoicePipeline 단위 테스트 작성

**Deliverable**: text_to_voice 모드 완전 동작 (Session B audio 토큰 0)

### Phase 4: FullAgentPipeline 이전 + 마무리
- [ ] `pipeline/full_agent.py` 생성 — TextToVoice 기반 + Function Calling
- [ ] Agent Mode 피드백 루프 (Session B → Session A) 이전
- [ ] Pipeline별 단위 테스트 추가
- [ ] 기존 AudioRouter의 불필요 코드 정리

**Deliverable**: 전체 파이프라인 분리 완료

---

## 7. 이식 매핑 (hskim-wigvo-test → main)

| hskim (TS) | main (Python) | 이식 내용 | 상태 |
|------------|---------------|----------|------|
| `audio-router.ts:124-148` `sendTextToSessionA` | `pipeline/text_to_voice.py` `handle_user_text()` | per-response instruction + conversation.item.create | 미구현 |
| `audio-router.ts:151-169` `sendExactUtteranceToSessionA` | `first_message.py` `send_exact_utterance()` | AI 확장 방지 래핑 | 미구현 |
| `session-manager.ts:178` Session B `modalities: ['text']` | `session_manager.py` `_build_session_b_config()` | text-only modality 분기 | 미구현 |
| `session-manager.ts:143-167` Session A config 분기 | `session_manager.py` `_build_session_a_config()` | `input_audio_format` 조건부 설정 | 미구현 |
| `prompt/templates.ts:46-74` 1인칭 직역 규칙 | `prompt/templates.py` | 1인칭 직역 번역 지시 강화 | **완료** ✅ |
| `session-manager.ts:210-216` `response.text.delta` 핸들링 | `session_b.py` | text-only 응답 이벤트 핸들러 추가 | 미구현 |

### 7.1 이미 완료된 main 개선 (이식 불필요)

| 컴포넌트 | 파일 | 설명 |
|----------|------|------|
| **EchoDetector** | `echo_detector.py` (신규) | Pearson 상관계수 기반 per-chunk 에코 감지 — hskim에는 없는 main 고유 개선 |
| **audio_utils** | `audio_utils.py` (신규) | 공유 mu-law → linear PCM 변환 + RMS 계산 — echo_detector와 audio_router가 공유 |
| **1인칭 직역 프롬프트** | `prompt/templates.py` (수정) | Session A/B 모두 1인칭 직역 규칙 적용 완료 |
| **Audio Energy Gate** | `audio_router.py` + `config.py` | mu-law RMS 기반 무음 필터링 (min_rms=20.0) |
| **Echo Detector config** | `config.py` (수정) | `echo_detector_enabled`, threshold 0.6, safety_cooldown 0.3s 등 6개 설정 |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 기존 테스트 통과 | 124/124 | `uv run pytest -v` |
| Pipeline별 신규 테스트 | 15개 이상 | pytest 카운트 |
| text_to_voice Session B audio tokens | 0 | cost_tokens.audio_output |
| text_to_voice AI 문장 확장 발생 | 0건 | E2E 통화 검증 |
| voice_to_voice 레이턴시 변화 | < 5ms 차이 | 통화 로그 비교 |

---

## 9. Risk & Mitigation

### 9.1 Critical (해소됨)

| # | Risk | Status | Resolution |
|---|------|--------|------------|
| C-1 | `voice_to_text` 모드 Pipeline 미정의 | **해소** | VoiceToVoicePipeline 서브모드(`suppress_b_audio=True`)로 매핑 (Section 1.4, 5.3, 5.8) |
| C-2 | 테스트 수 불일치 (74 vs 124) | **해소** | 전체 문서 124개로 수정 |
| C-3 | Session B `modalities=['text']` 이벤트 타입 미검증 | **해소** | Spike 검증 완료: `response.text.delta`=`delta`필드, `response.text.done`=`text`필드 (Section 5.9) |

### 9.2 Major

| # | Risk | Impact | Prob. | Section | Mitigation |
|---|------|--------|-------|---------|------------|
| M-1 | BasePipeline에 공통 기능(timer, notify, context) 메서드 부재 → AudioRouter가 두꺼운 래퍼 유지 | High | Medium | 5.2, 5.8 | AudioRouter 위임자가 공통 생명주기(timer, recovery)를 관리하고, 각 Pipeline은 오디오/텍스트 핸들링만 담당하는 것으로 명확화. BasePipeline `__init__`에 `notify_app`, `on_turn_complete` 콜백 추가 |
| M-2 | TextToVoice Session A `input_audio_format=None`이 Pydantic `str` 타입 및 OpenAI API와 비호환 가능 | Medium | Medium | 5.3 | Session A `input_audio_format`은 모든 모드에서 `pcm16` 유지 (텍스트 입력이더라도 설정은 필수). 오디오를 안 보낼 뿐 config 자체는 유효해야 함 |
| M-3 | VoiceToVoice에서 `handle_user_text()` 기존 패턴(`send_text()`) vs 새 패턴(`send_text_item()+create_response()`) 혼동 | Medium | Medium | 5.4, 5.6 | VoiceToVoice는 기존 `send_text()` 유지. TextToVoice만 새 `send_text_item()+create_response()` 사용. `send_text()`는 deprecated 표시하지 않고 VoiceToVoice 전용으로 유지 |
| M-4 | TextToVoice/FullAgent의 `handle_user_audio()` 처리 PRD 본문에 미기술 | Low | High | 5.2 | TextToVoice/FullAgent에서 `handle_user_audio()`는 graceful no-op (`logger.debug` + return). `handle_user_audio_commit()`도 동일하게 no-op |
| M-5 | `_build_session_a_config()` 구현 코드 미제공 | Medium | Medium | 5.7 | Session A config는 TextToVoice에서도 VoiceToVoice와 동일하게 유지 (`pcm16`, `['text','audio']`). `turn_detection`만 TextToVoice에서 `None`(manual)으로 분기. 코드는 구현 시 작성 |
| M-6 | AudioRouter 위임 리팩토링 시 기존 124개 테스트 mock 패턴 파괴 위험 | High | Medium | 5.8, 4.3 | Phase 2 시작 전 AudioRouter를 직접 테스트하는 테스트 목록 파악. `conftest.py`의 mock fixture 업데이트를 Phase 2 첫 태스크로 배치 |
| M-7 | `send_text()` vs `send_text_item()` 혼동 (RealtimeSession에 유사 메서드 2개) | Medium | Medium | 5.6 | `send_text()` = item+response 합체 (VoiceToVoice/기존 코드용). `send_text_item()` = item만 (TextToVoice용). docstring에 사용 컨텍스트 명시 |
| M-8 | `gpt-4o-mini-transcribe` STT 모델 가용성 미확인 (P2 우선순위이나 config table에 혼재) | Low | Medium | 5.3, FR-010 | Section 5.3 table에서 현재 `whisper-1`로 표기. FR-010(P2)으로 명확 분리. 초기 구현은 `whisper-1` 유지 |
| M-9 | Per-response instruction에 `source_language`/`target_language` 직접 삽입 → prompt injection 위험 | Medium | Low | 5.4 | `CallStartRequest.source_language`/`target_language`에 ISO 639-1 코드만 허용하는 `field_validator` 추가 (`^[a-z]{2}(-[A-Z]{2})?$`) |
| M-10 | Exact Utterance에서 사용자 텍스트 직접 프롬프트 삽입 → 프롬프트 탈출 가능 | Medium | Low | 5.5 | `text` 입력에 최대 500자 길이 제한. `conversation.item.create`의 `input_text` content type으로 전달하고, instruction은 별도 `response.create`에서 처리 (현재 설계와 동일) |
| M-11 | FullAgent에서 EchoDetector 비활성화 시 Session A TTS → Twilio → Session B 에코 오인식 위험 | Medium | Medium | 5.3 | Session B가 `modalities=['text','audio']` 유지하는 대안 채택 시 (Section 5.10) EchoDetector도 활성화 가능. 또는 Audio Energy Gate 임계값으로 에코 필터링 |
| M-12 | DualSessionManager 생성자 시그니처 변경의 호출 코드 수정 범위 미정의 | Medium | High | 5.7 | `communication_mode` 파라미터에 기본값 `VOICE_TO_VOICE` 제공하여 기존 호출 코드 무변경. 새 모드 사용 시에만 명시적 전달. 호출 위치: `call_manager.py` 또는 Twilio webhook route |
| M-13 | `response.text.done` 핸들러의 이벤트 페이로드 필드명 차이 (`text` vs `transcript`) | High | **확인됨** | 5.9 | Spike 검증으로 확인: `response.text.done`은 `text` 필드 사용. `_handle_text_done()` 별도 핸들러 구현 필요 (Section 5.9에 반영 완료) |
| M-14 | Session B `modalities=['text']` 시 server VAD 비활성화 → First Message/Interrupt 불능 | **High** | **확인됨** | 5.10 | Spike 검증으로 확인: `speech_started` 미발생. 대안: Session B `modalities=['text','audio']` 유지 + App으로의 audio 전달만 생략 (Section 5.10) |
| M-15 | EchoDetector를 VoiceToVoice에만 이전 시 legacy Echo Gate 연결 누락 | Medium | Medium | 5.3 | feature flag 양쪽 경로(`echo_detector_enabled=True/False`) 모두 VoiceToVoicePipeline 단위 테스트에 포함 |

### 9.3 Minor

| # | Risk | Section | Mitigation |
|---|------|---------|------------|
| m-1 | `_handle_text_done` 구현 상세 부재 — `response.text.done` 페이로드 스키마 | 5.9 | Spike 검증으로 스키마 확인 완료. `text` 필드 사용. Section 5.9에 코드 예시 반영 |
| m-2 | Recovery와 Pipeline 통합 방식 미언급 — Recovery Manager가 Pipeline 분리 후 어디에 위치하는지 | 5.1 | Recovery Manager는 AudioRouter 위임자 레벨에서 관리 (Pipeline과 독립적). `start()`/`stop()`에서 recovery 시작/중지 |
| m-3 | Exact Utterance multi-sentence 및 특수문자(큰따옴표) 처리 미정의 | 5.5 | text 내 큰따옴표는 이스케이프 처리. multi-sentence는 전체를 하나의 래핑으로 전달 |
| m-4 | `first_message.py`의 exact utterance 적용 범위 불명확 (모든 모드? TextToVoice only?) | 6 | `send_exact_utterance()`는 TextToVoice/FullAgent에서만 사용. VoiceToVoice는 기존 `send_greeting()` 유지 |
| m-5 | `create_response(instructions=)` 남용 방지 가이드 부재 | 5.6 | docstring에 "TextToVoicePipeline 전용 — VoiceToVoice에서는 system prompt로 충분" 명시 |
| m-6 | Section 5.3 Table 내 "None", "없음", "N/A" 표기 불일치 | 5.3 | 모든 해당없음 표기를 `N/A`로 통일 |
| m-7 | `voice_to_voice 레이턴시 변화 < 5ms` 측정 방법 모호 | 8 | 측정 구간: `handle_user_audio()` 진입 ~ `session_a.send_audio()` 호출. 방법: `time.perf_counter()` 로깅. 샘플: 100개 청크 평균 |
