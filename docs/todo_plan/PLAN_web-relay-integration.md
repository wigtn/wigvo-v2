# Task Plan: Web Relay Integration

> **Generated from**: docs/prd/15_PRD_WEB_RELAY_INTEGRATION.md
> **Created**: 2026-02-18
> **Status**: pending

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Phases

### Phase 1: 인프라 + 공통 계층
- [ ] `shared/call-types.ts` — WS 메시지 타입, CallMode 정의
- [ ] `lib/relay-client.ts` — Relay Server HTTP 클라이언트
- [ ] `lib/audio/pcm16-utils.ts` — PCM16 변환 유틸
- [ ] `lib/constants.ts` 업데이트
- [ ] `shared/types.ts` — Call 모델 확장 (callMode, relayWsUrl)
- [ ] `app/api/calls/[id]/start/route.ts` — Relay Server 프록시
- [ ] `.env.example` 업데이트
- [ ] Relay Server: `CallStartRequest`에 `system_prompt_override` 추가

### Phase 2: 웹 오디오 엔진
- [ ] `lib/audio/web-recorder.ts` — Web Audio API PCM16 녹음
- [ ] `lib/audio/web-player.ts` — AudioContext PCM16 재생
- [ ] `lib/audio/vad.ts` — Client VAD (RMS 기반)
- [ ] `hooks/useWebAudioRecorder.ts`
- [ ] `hooks/useWebAudioPlayer.ts`
- [ ] `hooks/useClientVad.ts`

### Phase 3: WebSocket + 통화 관리
- [ ] `hooks/useRelayWebSocket.ts` — WebSocket 연결 관리
- [ ] `hooks/useRelayCall.ts` — 통화 라이프사이클 관리
- [ ] CaptionEntry 타입 + 메시지 핸들링

### Phase 4: UI 컴포넌트
- [ ] `components/call/CallModeSelector.tsx`
- [ ] `components/call/RealtimeCallView.tsx`
- [ ] `components/call/LiveCaptionPanel.tsx`
- [ ] `components/call/AudioControls.tsx`
- [ ] `components/call/CallStatusBar.tsx`
- [ ] `app/call/[callId]/page.tsx`
- [ ] `components/call/CallingPanel.tsx` 수정

### Phase 5: Agent Mode + E2E 통합
- [ ] Agent Mode 프롬프트 통합 (system_prompt_override)
- [ ] Relay Server system_prompt_override 지원
- [ ] 통화 결과 판정 (서버 + 클라이언트)
- [ ] ResultCard 연동
- [ ] E2E 테스트 (Agent + Relay)
- [ ] ElevenLabs 코드 정리

### Phase 6: 마무리 + 모바일 준비
- [ ] 에러 핸들링 강화
- [ ] 통화 시간 제한/경고
- [ ] 공통 코드 분리 (shared/)
- [ ] 모바일 마이그레이션 가이드

## Dependencies

```
Phase 1 ──→ Phase 2 (오디오 유틸 필요)
Phase 1 ──→ Phase 3 (API 클라이언트 필요)
Phase 2 ──→ Phase 3 (오디오 Hook 필요)
Phase 3 ──→ Phase 4 (Hook이 UI에 필요)
Phase 4 ──→ Phase 5 (UI가 있어야 통합 테스트)
Phase 5 ──→ Phase 6 (기능 완성 후 마무리)
```

## Progress

| Metric | Value |
|--------|-------|
| Total Tasks | 0/30+ |
| Current Phase | - |
| Status | pending |
