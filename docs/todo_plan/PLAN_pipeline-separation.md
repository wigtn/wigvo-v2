# Task Plan: Pipeline Separation & Text-to-Voice Port

> **Generated from**: docs/prd/PRD_PIPELINE_SEPARATION.md
> **Created**: 2026-02-18
> **Updated**: 2026-02-18
> **Status**: pending

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Pre-existing Changes (이미 완료)

다음 파일은 이미 구현 완료 상태이며, 파이프라인 분리 시 활용한다:

| File | 설명 |
|------|------|
| `src/realtime/echo_detector.py` | Pearson 상관계수 기반 per-chunk 에코 감지 (NEW) |
| `src/realtime/audio_utils.py` | 공유 mu-law 유틸리티 — ulaw_rms, _ULAW_TO_LINEAR (NEW) |
| `src/config.py` | echo_detector 설정 6개 추가 (MODIFIED) |
| `src/prompt/templates.py` | 1인칭 직역 규칙 적용 완료 (MODIFIED) — hskim 이식 불필요 |

## Mode → Pipeline Mapping

| CommunicationMode | Pipeline | 비고 |
|-------------------|----------|------|
| `VOICE_TO_VOICE` | VoiceToVoicePipeline | 기본 모드 |
| `VOICE_TO_TEXT` | VoiceToVoicePipeline (`suppress_b_audio=True`) | Session B audio 출력만 생략 |
| `TEXT_TO_VOICE` | TextToVoicePipeline | hskim 이식 대상 |
| `FULL_AGENT` | FullAgentPipeline | TextToVoice 기반 + Function Calling |

## Phases

### Phase 0: Spike — Session B `modalities=['text']` 이벤트 검증
- [x] 0.1 `scripts/tests/spike_text_modality.py` — OpenAI Realtime API에서 `modalities=['text']` 설정 시 이벤트 타입 검증
  - `response.text.delta` / `response.text.done` 이벤트 발생 확인
  - `input_audio_buffer.speech_started/stopped` 이벤트 발생 여부 확인
  - 이벤트 페이로드 필드명 (`delta` vs `text`) 확인

### Phase 1: Foundation — BasePipeline + RealtimeSession 확장
- [x] 1.1 `src/realtime/pipeline/__init__.py` 생성
- [x] 1.2 `src/realtime/pipeline/base.py` — BasePipeline ABC 정의
- [x] 1.3 `src/types.py` SessionConfig에 `modalities` 필드 추가 (기본값 `['text', 'audio']`)
- [x] 1.4 `src/realtime/session_manager.py` RealtimeSession.connect()에서 `config.modalities` 사용 (하드코딩 제거)
- [x] 1.5 `src/realtime/session_manager.py` RealtimeSession에 `send_text_item()`, `create_response(instructions=)` 추가
- [x] 1.6 `src/realtime/session_manager.py` DualSessionManager에 `communication_mode` 파라미터 추가 + Session B config 분기
- [x] 1.7 `src/realtime/session_b.py` — `response.text.delta`, `response.text.done` 핸들러 추가
- [x] 1.8 기존 124개 테스트 통과 확인

### Phase 2: VoiceToVoicePipeline 추출
- [x] 2.1 `src/realtime/pipeline/voice_to_voice.py` 생성 — AudioRouter에서 voice 관련 로직 추출
- [x] 2.2 VoiceToVoicePipeline에 `suppress_b_audio` 파라미터 추가 (VOICE_TO_TEXT 서브모드)
- [x] 2.3 **EchoDetector** (dual-path: new + legacy fallback) 이전 — VoiceToVoice 전용
- [x] 2.4 Echo Gate (legacy blanket block) 이전 — VoiceToVoice 전용 fallback
- [x] 2.5 Audio Energy Gate, Interrupt, Recovery, Context Manager, Guardrail 이전
- [x] 2.6 AudioRouter를 얇은 위임자로 리팩토링 (4개 모드 → Pipeline match + __getattr__/__setattr__ 프록시)
- [x] 2.7 `src/routes/stream.py` — communication_mode는 AudioRouter가 call.communication_mode에서 직접 읽으므로 별도 전달 불필요
- [x] 2.8 **기존 124개 테스트 전수 통과 확인** (regression gate)

### Phase 3: TextToVoicePipeline 구현
- [x] 3.1 `src/realtime/pipeline/text_to_voice.py` 생성
- [x] 3.2 `handle_user_text()` — per-response instruction override 구현 (hskim 이식)
- [x] 3.3 Session B `modalities=['text']` 적용 확인 (DualSessionManager 분기 활용)
- [x] 3.4 `src/realtime/first_message.py` — `send_exact_utterance()` 패턴 추가 (hskim 이식)
- [x] 3.5 `handle_user_audio()` — text 모드에서 audio 입력 무시 (graceful no-op + 로깅)
- [x] 3.6 EchoDetector/Echo Gate 모두 비초기화 (텍스트 입력 = TTS echo loop 불가)
- [x] 3.7 Audio Energy Gate는 유지 (Twilio 수신자 오디오 무음 필터링 필요)
- [x] 3.8 TextToVoicePipeline 단위 테스트 작성 (14개)

### Phase 4: FullAgentPipeline + 마무리
- [ ] 4.1 `src/realtime/pipeline/full_agent.py` 생성 (TextToVoice 기반 + Function Calling)
- [ ] 4.2 Agent Mode 피드백 루프 (Session B 번역 → Session A) 이전
- [ ] 4.3 FullAgentPipeline 단위 테스트 작성
- [ ] 4.4 기존 AudioRouter의 불필요 코드 정리
- [ ] 4.5 전체 테스트 (기존 124개 + 신규) 통과 확인
- [ ] 4.6 최종 커밋

## Key Files

| File | Action | Phase | Notes |
|------|--------|-------|-------|
| `scripts/tests/spike_text_modality.py` | NEW | 0 | C-3 spike 검증 |
| `src/realtime/pipeline/__init__.py` | NEW | 1 | |
| `src/realtime/pipeline/base.py` | NEW | 1 | |
| `src/realtime/pipeline/voice_to_voice.py` | NEW | 2 | EchoDetector + suppress_b_audio |
| `src/realtime/pipeline/text_to_voice.py` | NEW | 3 | hskim 패턴 이식 |
| `src/realtime/pipeline/full_agent.py` | NEW | 4 | |
| `src/realtime/audio_router.py` | REFACTOR | 2 | 557줄 → ~100줄 위임자 |
| `src/realtime/session_manager.py` | MODIFY | 1 | modality 분기 + send_text_item |
| `src/realtime/session_b.py` | MODIFY | 1 | response.text.delta 핸들러 |
| `src/realtime/first_message.py` | MODIFY | 3 | exact utterance 패턴 |
| `src/types.py` | MODIFY | 1 | SessionConfig.modalities |
| `src/routes/stream.py` | MODIFY | 2 | communication_mode 전달 |
| `src/realtime/echo_detector.py` | EXISTING | - | VoiceToVoice에서만 import |
| `src/realtime/audio_utils.py` | EXISTING | - | 공유 유틸리티 (변경 없음) |
| `src/config.py` | EXISTING | - | echo_detector 설정 이미 추가 |
| `src/prompt/templates.py` | EXISTING | - | 1인칭 직역 이미 적용 |

## Reference Files (hskim-wigvo-test)

| hskim File | 이식 대상 | Phase | 상태 |
|------------|----------|-------|------|
| `realtime/audio-router.ts::sendTextToSessionA` | TextToVoicePipeline.handle_user_text | 3 | **완료** ✅ |
| `realtime/audio-router.ts::sendExactUtteranceToSessionA` | FirstMessageHandler(use_exact_utterance=True) | 3 | **완료** ✅ |
| `realtime/session-manager.ts::createSessions` | DualSessionManager config 분기 | 1 | **완료** ✅ |
| `prompt/templates.ts` (1인칭 직역) | prompt/templates.py | - | **완료** ✅ |

## Progress

| Metric | Value |
|--------|-------|
| Total Tasks | 25/29 |
| Current Phase | 3 (TextToVoice) — 완료 |
| Status | in_progress |

## Execution Log

| Timestamp | Phase | Task | Status |
|-----------|-------|------|--------|
| 2026-02-18 | 0 | 0.1 Spike: text modality 이벤트 검증 스크립트 작성 | done |
| 2026-02-18 | 1 | 1.1 pipeline/__init__.py 생성 | done |
| 2026-02-18 | 1 | 1.2 pipeline/base.py — BasePipeline ABC | done |
| 2026-02-18 | 1 | 1.3 types.py SessionConfig.modalities 추가 | done |
| 2026-02-18 | 1 | 1.4 session_manager.py config.modalities 사용 | done |
| 2026-02-18 | 1 | 1.5 send_text_item() + create_response() 추가 | done |
| 2026-02-18 | 1 | 1.6 DualSessionManager communication_mode 분기 | done |
| 2026-02-18 | 1 | 1.7 session_b.py text.delta/done 핸들러 | done |
| 2026-02-18 | 1 | 1.8 124개 테스트 통과 확인 | done |
| 2026-02-18 | 2 | 2.1-2.5 VoiceToVoicePipeline 로직 추출 (462줄) | done |
| 2026-02-18 | 2 | 2.6 AudioRouter → 얇은 위임자 (155줄, __getattr__/__setattr__ 프록시) | done |
| 2026-02-18 | 2 | 2.7 stream.py 변경 불필요 확인 | done |
| 2026-02-18 | 2 | 2.8 124개 테스트 전수 통과 | done |
| 2026-02-18 | 3 | 3.1 text_to_voice.py 생성 (per-response override) | done |
| 2026-02-18 | 3 | 3.2-3.3 handle_user_text + Session B modalities=['text'] 확인 | done |
| 2026-02-18 | 3 | 3.4 first_message.py exact utterance 패턴 | done |
| 2026-02-18 | 3 | 3.5-3.7 audio no-op + 에코 비초기화 + 에너지 게이트 유지 | done |
| 2026-02-18 | 3 | 3.8 단위 테스트 14개 작성 (전체 138/138 통과) | done |
