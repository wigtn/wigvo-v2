# Task Plan: supabase-schema-v2

> **Generated from**: docs/prd/16_PRD_SUPABASE_SCHEMA_v2.md
> **Created**: 2026-02-18
> **Status**: pending

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 (DB 변경이므로) |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Phases

### Phase 1: 긴급 수정 (현재 에러 해결)
- [ ] Supabase 대시보드에서 `auto_ended` BOOLEAN 컬럼 추가
- [ ] `call_mode` DEFAULT 'voice-to-voice' → 'agent' 변경
- [ ] E2E 테스트로 `persist_call()` 에러 해결 확인

### Phase 2: Migration SQL 작성
- [ ] `002_v2_base_schema.sql` — 전체 CREATE TABLE (7개 테이블)
- [ ] RLS 정책 SQL 포함
- [ ] 인덱스 정의 포함
- [ ] Supabase에서 새 테이블 생성 (call_sessions, call_transcripts, call_events)

### Phase 3: Relay Server 코드 변경
- [ ] `supabase_client.py` — `persist_call()` 3테이블 분산 저장으로 리팩토링
- [ ] `supabase_client.py` — `save_transcript_turn()` 실시간 턴 저장 함수 추가
- [ ] `supabase_client.py` — `save_call_event()` 이벤트 저장 함수 추가
- [ ] `types.py` — `ActiveCall`에 ISO 타임스탬프 helper 추가
- [ ] `audio_router.py` — 턴 완료 시 `save_transcript_turn()` 호출
- [ ] 기존 테스트 업데이트

### Phase 4: Web App 코드 변경
- [ ] `shared/types.ts` — `CallRow` 업데이트 (ElevenLabs 제거, total_tokens/duration_s 추가)
- [ ] `hooks/useCallPolling.ts` — Call 타입 동기화
- [ ] `app/api/calls/[id]/start/route.ts` — 업데이트 경로 확인

### Phase 5: 데이터 마이그레이션 + 레거시 정리
- [ ] `003_v2_data_migration.sql` — 기존 JSONB 데이터 이관
- [ ] 데이터 정합성 검증 쿼리 작성
- [ ] `004_v2_cleanup.sql` — 레거시 컬럼 제거
- [ ] 최종 E2E 테스트

## Progress

| Metric | Value |
|--------|-------|
| Total Tasks | 0/16 |
| Current Phase | - |
| Status | pending |

## Execution Log

| Timestamp | Phase | Task | Status |
|-----------|-------|------|--------|
| - | - | - | - |
