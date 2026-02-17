# Task Plan: Realtime Relay System v4

> **Generated from**: docs/prd/14_PRD_REALTIME_RELAY_v4.md
> **Created**: 2026-02-16
> **Status**: in_progress

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Completed Phases (v3 → 현재)

### Phase 1-5: Core Implementation ✅ (65/65 tasks)
- [x] Relay Server (FastAPI + uv + Python 3.12+)
- [x] Twilio 연동 (Outbound, TwiML webhook, Media Stream, Status Callback)
- [x] OpenAI Realtime API Dual Session (A + B)
- [x] AudioRouter + Echo Gate
- [x] v3 Prompt System (Relay/Agent + TURN-TAKING rules)
- [x] First Message Strategy (AI 고지)
- [x] Turn Overlap / Interrupt 처리
- [x] Client-side VAD (React Native, expo-av)
- [x] Ring Buffer (30초) + Recovery + Degraded Mode
- [x] Guardrail Level 1-3 + Fallback LLM
- [x] DB Migration + Supabase Client
- [x] Transcript Bilingual + Cost Tokens
- [x] Function Calling (Agent Mode)
- [x] 2단계 자막 (원문 즉시 → 번역 후)
- [x] React Native 앱 (Auth, Home, Call, VAD UI, 접근성)
- [x] 49개 테스트

### Phase 6: CallManager 리팩토링 ✅
- [x] CallManager 싱글톤 (중앙 통화 관리)
- [x] cleanup_call() idempotent + asyncio.Lock
- [x] Twilio status-callback 자동 정리

## Remaining Phases (미구현 항목)

### Phase 7: Authentication & Security (P1)
- [ ] Supabase Auth JWT 미들웨어 (FastAPI Depends)
- [ ] API 엔드포인트에 인증 적용 (/relay/calls/start, /end)
- [ ] WebSocket 연결 시 JWT 토큰 검증
- [ ] 테스트 업데이트

### Phase 8: Mobile App 완성 (P1)
- [ ] 채팅 수집 화면 (Agent Mode 정보 수집 UI)
- [ ] 통화 기록 화면 (이전 통화 목록 + 상세)
- [ ] 설정 화면 (폰트 크기, VAD 감도, 언어)
- [ ] 고대비 모드 (접근성)
- [ ] 스크린 리더 호환 검증

### Phase 9: Stability & Polish (P2)
- [ ] CALL_IDLE_TIMEOUT_MS (30초 무발화 감지)
- [ ] Dockerfile + Docker Compose
- [ ] CI/CD 파이프라인
- [ ] 배포 설정 (Railway 또는 Fly.io)

### Phase 10: New Features (TBD)
> 사용자가 별도로 설명 예정

## Progress

| Metric | Value |
|--------|-------|
| Total Completed | 65/65 (v3) + 3/3 (v3.1 CallManager) |
| Remaining | Phase 7-9 (~15 tasks) |
| Current Phase | Phase 7 대기 |
| Status | in_progress |
