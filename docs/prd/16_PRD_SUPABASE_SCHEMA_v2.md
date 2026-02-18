# Supabase Schema Redesign PRD

> **Version**: 2.0
> **Created**: 2026-02-18
> **Status**: Draft
> **Previous Schema**: `apps/relay-server/migrations/001_v3_schema.sql` (ALTER only, base schema 없음)

## 1. Overview

### 1.1 Problem Statement

현재 Supabase 스키마에 다음 문제가 있다:

1. **기본 스키마가 Git에 없음** — base CREATE TABLE이 코드에 없어서 환경 재현 불가
2. **`calls` 테이블 과부하** — Web App 필드 + Relay Server 필드 + 레거시 ElevenLabs 필드가 혼재 (30+ 컬럼)
3. **컬럼 불일치** — `auto_ended` 컬럼이 실제 DB에 없어서 `persist_call()` 실패
4. **ID 혼란** — Web App은 `id` (UUID PK), Relay Server는 `call_id` (같은 UUID를 별도 컬럼으로)
5. **JSONB 과다 사용** — `transcript_bilingual`, `guardrail_events` 등이 단일 행에 무한 성장하는 JSONB 배열
6. **레거시 잔재** — `elevenlabs_conversation_id`, `call_mode DEFAULT 'voice-to-voice'` 등
7. **통화 분석 불가** — transcript가 JSONB 배열이라 개별 턴 검색/집계 불가

### 1.2 Goals

- 전체 스키마를 Git에서 완전히 재현 가능하도록 CREATE TABLE + Migration 관리
- `calls` 테이블을 정규화하여 Relay Server 데이터를 별도 테이블로 분리
- 다양한 시나리오/언어 대화를 지원하는 확장 가능한 구조
- 통화 transcript를 턴 단위로 쿼리 가능하게 분리
- 비용 추적 및 통화 품질 분석 지원

### 1.3 Non-Goals

- Supabase에서 다른 DB로 마이그레이션
- 실시간 Subscription (Realtime) 기능 (향후 별도 PRD)
- 파일 스토리지 (녹음 파일 등)

### 1.4 Scope

| 포함 | 제외 |
|------|------|
| 전체 테이블 CREATE TABLE 정의 | Supabase Auth 설정 (기존 유지) |
| 기존 데이터 마이그레이션 SQL | Edge Functions |
| RLS 정책 정의 | 녹음 파일 스토리지 |
| 인덱스 + 성능 최적화 | 실시간 Subscription |
| Relay Server/Web App 코드 동기화 | Mobile App DB 접근 (현재 Auth만) |

---

## 2. Current State Analysis

### 2.1 현재 테이블 구조

```
┌─────────────────────┐     ┌──────────────────────┐
│   conversations     │────<│      messages         │
│   (대화 세션)       │     │   (채팅 메시지)       │
├─────────────────────┤     ├──────────────────────┤
│ id (UUID, PK)       │     │ id (UUID, PK)        │
│ user_id (FK→auth)   │     │ conversation_id (FK) │
│ status              │     │ role                 │
│ collected_data(JSONB│     │ content              │
│ created_at          │     │ metadata (JSONB)     │
│ updated_at          │     │ created_at           │
└────────┬────────────┘     └──────────────────────┘
         │
         │  1:N
         ▼
┌─────────────────────────────────────────────────┐
│                    calls                         │
│            (통화 기록 — 과부하)                   │
├─────────────────────────────────────────────────┤
│ ── Web App 소유 ──                              │
│ id (UUID, PK)                                   │
│ user_id, conversation_id, request_type          │
│ target_name, target_phone                       │
│ parsed_date, parsed_time, parsed_service        │
│ status, result, summary                         │
│ elevenlabs_conversation_id ← 레거시             │
│ call_mode, relay_ws_url                         │
│ created_at, updated_at, completed_at            │
│                                                 │
│ ── Relay Server 소유 (001_v3 ALTER) ──          │
│ call_mode, source_language, target_language      │
│ vad_mode, twilio_call_sid                       │
│ session_a_id, session_b_id                      │
│ transcript_bilingual (JSONB[]) ← 무한 성장      │
│ cost_tokens (JSONB)                             │
│ guardrail_events (JSONB[]) ← 무한 성장          │
│ recovery_events (JSONB[]) ← 무한 성장           │
│ call_result, call_result_data (JSONB)           │
│ auto_ended ← DB에 실제로 없음!                  │
│ function_call_logs (JSONB[]) ← 무한 성장        │
└─────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌────────────────────────┐
│ conversation_entities    │  │ place_search_cache     │
│ (추출된 엔티티)          │  │ (네이버 검색 캐시)     │
├──────────────────────────┤  ├────────────────────────┤
│ id, conversation_id      │  │ id, query_hash (UQ)    │
│ entity_type (UQ w/ conv) │  │ query_text, results    │
│ entity_value, confidence │  │ created_at, expires_at │
│ source_message_id        │  │                        │
│ created_at, updated_at   │  │                        │
└──────────────────────────┘  └────────────────────────┘
```

### 2.2 서비스별 DB 접근 패턴

| 서비스 | 테이블 | 접근 키 | 작업 |
|--------|--------|---------|------|
| Web App | conversations | Supabase Anon Key + RLS | CRUD |
| Web App | messages | Supabase Anon Key + RLS | INSERT, SELECT |
| Web App | calls | Supabase Anon Key + RLS | INSERT, SELECT, UPDATE (status) |
| Web App | conversation_entities | Supabase Anon Key + RLS | UPSERT, SELECT, DELETE |
| Web App | place_search_cache | Supabase Anon Key + RLS | UPSERT, SELECT, DELETE |
| Relay Server | calls | Supabase Service Key | UPSERT (persist_call) |
| Mobile App | (없음) | Auth만 사용 | - |

### 2.3 발견된 문제점

| # | 문제 | 영향 | 심각도 |
|---|------|------|--------|
| 1 | `auto_ended` 컬럼 누락 | `persist_call()` 400 에러 | **Critical** |
| 2 | `call_id` vs `id` 혼란 | Relay Server upsert가 `call_id` 컬럼 사용, Web App은 `id` | **Major** |
| 3 | `call_mode` 기본값 불일치 | Migration: `'voice-to-voice'`, 코드: `'agent'\|'relay'` | Major |
| 4 | `call_sid` vs `twilio_call_sid` 중복 | 두 컬럼이 같은 값 저장 | Minor |
| 5 | JSONB 배열 무한 성장 | 긴 통화 시 `transcript_bilingual`가 수백 항목 → 단일 행 비대 | Major |
| 6 | ElevenLabs 레거시 컬럼 | `elevenlabs_conversation_id` 더 이상 미사용 | Minor |
| 7 | 기본 스키마 미버전관리 | 새 환경에서 재현 불가 | Major |
| 8 | RLS 정책 미문서화 | 보안 검증 불가 | Major |

---

## 3. Proposed Schema (v2)

### 3.1 설계 원칙

1. **소유권 분리**: Web App 소유 테이블과 Relay Server 소유 테이블을 명확히 구분
2. **정규화**: JSONB 배열 대신 별도 테이블로 분리 (쿼리/집계 가능)
3. **ID 통일**: `calls.id` (UUID)를 모든 서비스의 PK로 사용. `call_id` 별도 컬럼 제거
4. **하위 호환**: 기존 데이터 마이그레이션 경로 제공
5. **레거시 제거**: ElevenLabs 관련 컬럼 삭제

### 3.2 ERD (Entity Relationship Diagram)

```
┌──────────────┐    1:N    ┌──────────────┐    1:N    ┌──────────────┐
│ conversations │─────────>│   messages    │          │conversation_ │
│              │          │              │          │  entities    │
│              │─────────────────────────────────>│              │
└──────┬───────┘          └──────────────┘          └──────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐    1:1    ┌──────────────────┐
│    calls     │─────────>│  call_sessions    │  ← Relay Server 소유
│ (Web App 소유)│          │ (세션 메타데이터)  │
└──────┬───────┘          └──────────────────┘
       │
       │ 1:N
       ├──────────────────────────────────┐
       ▼                                  ▼
┌──────────────────┐           ┌──────────────────┐
│ call_transcripts │           │   call_events     │
│ (턴별 대화 기록) │           │ (guardrail/recovery│
│                  │           │  /function 로그)   │
└──────────────────┘           └──────────────────┘

┌──────────────────┐
│place_search_cache│  (독립)
└──────────────────┘
```

### 3.3 Table Definitions

---

#### `conversations` (변경 없음)

Web App 소유. 채팅 대화 세션.

```sql
CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'COLLECTING'
                CHECK (status IN ('COLLECTING','READY','CALLING','COMPLETED','CANCELLED')),
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user_created ON conversations(user_id, created_at DESC);
```

---

#### `messages` (변경 없음)

Web App 소유. 채팅 메시지.

```sql
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL DEFAULT '',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at ASC);
```

---

#### `conversation_entities` (변경 없음)

Web App 소유. LLM이 추출한 엔티티.

```sql
CREATE TABLE conversation_entities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL,
  entity_value      TEXT NOT NULL DEFAULT '',
  confidence        REAL NOT NULL DEFAULT 0.0,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (conversation_id, entity_type)
);

CREATE INDEX idx_entities_conv ON conversation_entities(conversation_id);
```

---

#### `calls` (정리 — Web App 소유 컬럼만)

**변경 사항**:
- Relay Server 전용 컬럼을 `call_sessions`로 이동
- `elevenlabs_conversation_id` 제거
- `call_mode` 기본값 수정
- `relay_ws_url` 유지 (Web App이 프론트엔드에 전달용)

```sql
CREATE TABLE calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- 시나리오 메타데이터
  request_type    TEXT CHECK (request_type IN ('RESERVATION','INQUIRY','AS_REQUEST')),
  target_name     TEXT,
  target_phone    TEXT NOT NULL,
  parsed_date     TEXT,
  parsed_time     TEXT,
  parsed_service  TEXT,

  -- 통화 상태
  call_mode       TEXT NOT NULL DEFAULT 'agent'
                  CHECK (call_mode IN ('agent','relay')),
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','CALLING','IN_PROGRESS','COMPLETED','FAILED')),
  result          TEXT CHECK (result IN ('SUCCESS','NO_ANSWER','REJECTED','ERROR','PARTIAL')),
  summary         TEXT,

  -- Relay Server 연결
  relay_ws_url    TEXT,
  twilio_call_sid TEXT,

  -- 통화 비용 요약 (call_sessions에서 집계)
  total_tokens    INTEGER DEFAULT 0,
  duration_s      INTEGER DEFAULT 0,

  -- 타임스탬프
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_calls_user_created ON calls(user_id, created_at DESC);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_conversation ON calls(conversation_id);
```

---

#### `call_sessions` (신규 — Relay Server 소유)

Relay Server가 통화 종료 시 세션 메타데이터를 저장. `calls`와 1:1.

```sql
CREATE TABLE call_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id           UUID NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,

  -- 세션 정보
  source_language   TEXT NOT NULL DEFAULT 'en',
  target_language   TEXT NOT NULL DEFAULT 'ko',
  vad_mode          TEXT NOT NULL DEFAULT 'server'
                    CHECK (vad_mode IN ('client','server','push_to_talk')),
  session_a_id      TEXT DEFAULT '',
  session_b_id      TEXT DEFAULT '',

  -- 비용 상세
  cost_tokens       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {audio_input, audio_output, text_input, text_output}

  -- 통화 결과 (Agent Mode 판정)
  call_result       TEXT DEFAULT '',
  call_result_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_ended        BOOLEAN NOT NULL DEFAULT false,

  -- 시스템 프롬프트 (디버깅용)
  prompt_a_hash     TEXT DEFAULT '',
  prompt_b_hash     TEXT DEFAULT '',

  -- 타임스탬프
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_sessions_call ON call_sessions(call_id);
```

---

#### `call_transcripts` (신규 — 턴별 대화 기록)

Relay Server가 각 턴 완료 시 저장. 개별 턴을 쿼리/검색/집계 가능.

```sql
CREATE TABLE call_transcripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,

  -- 턴 정보
  turn_index      SMALLINT NOT NULL DEFAULT 0,
  role            TEXT NOT NULL CHECK (role IN ('user','recipient','ai')),
  direction       TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  -- outbound: User→수신자 (Session A), inbound: 수신자→User (Session B)

  -- 텍스트
  original_text   TEXT NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL DEFAULT '',
  source_language TEXT NOT NULL DEFAULT '',
  target_language TEXT NOT NULL DEFAULT '',

  -- 메타데이터
  duration_ms     INTEGER DEFAULT 0,
  token_count     INTEGER DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcripts_call ON call_transcripts(call_id, turn_index ASC);
CREATE INDEX idx_transcripts_role ON call_transcripts(call_id, role);
```

---

#### `call_events` (신규 — 통합 이벤트 로그)

Guardrail, Recovery, Function Call 등 모든 이벤트를 통합 저장.

```sql
CREATE TABLE call_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,

  -- 이벤트 분류
  category    TEXT NOT NULL CHECK (category IN ('guardrail','recovery','function_call','system')),
  event_type  TEXT NOT NULL,
  -- guardrail: level_1, level_2, level_3
  -- recovery: session_disconnected, reconnect_attempt, reconnect_success, ...
  -- function_call: report_call_result, collect_info, ...
  -- system: echo_gate_triggered, timeout_warning, ...

  -- 이벤트 데이터
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- guardrail: {level, original, corrected, category}
  -- recovery: {session_label, gap_ms, attempt, status}
  -- function_call: {function_name, arguments, output}

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_call ON call_events(call_id, created_at ASC);
CREATE INDEX idx_events_category ON call_events(call_id, category);
```

---

#### `place_search_cache` (변경 없음)

```sql
CREATE TABLE place_search_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash  TEXT NOT NULL UNIQUE,
  query_text  TEXT NOT NULL DEFAULT '',
  results     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX idx_cache_hash ON place_search_cache(query_hash);
CREATE INDEX idx_cache_expires ON place_search_cache(expires_at);
```

---

## 4. Row Level Security (RLS)

### 4.1 정책 원칙

- Web App: `anon` key + RLS로 사용자 본인 데이터만 접근
- Relay Server: `service_role` key로 RLS 우회 (서버 간 통신)
- 관리자: 별도 role 정의 (향후)

### 4.2 RLS 정책

```sql
-- conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

-- messages (conversations 통해 간접 접근)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_messages" ON messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM conversations c
            WHERE c.id = messages.conversation_id AND c.user_id = auth.uid())
  );

-- conversation_entities
ALTER TABLE conversation_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_entities" ON conversation_entities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM conversations c
            WHERE c.id = conversation_entities.conversation_id AND c.user_id = auth.uid())
  );

-- calls
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_calls" ON calls
  FOR ALL USING (auth.uid() = user_id);

-- call_sessions (Relay Server service_role만)
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON call_sessions
  FOR ALL USING (auth.role() = 'service_role');
-- Web App은 calls JOIN call_sessions로 읽기
CREATE POLICY "users_read_own_sessions" ON call_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM calls c
            WHERE c.id = call_sessions.call_id AND c.user_id = auth.uid())
  );

-- call_transcripts
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_write" ON call_transcripts
  FOR INSERT USING (auth.role() = 'service_role');
CREATE POLICY "users_read_own_transcripts" ON call_transcripts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM calls c
            WHERE c.id = call_transcripts.call_id AND c.user_id = auth.uid())
  );

-- call_events
ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_write" ON call_events
  FOR INSERT USING (auth.role() = 'service_role');
CREATE POLICY "users_read_own_events" ON call_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM calls c
            WHERE c.id = call_events.call_id AND c.user_id = auth.uid())
  );

-- place_search_cache (모든 인증 사용자 접근)
ALTER TABLE place_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON place_search_cache
  FOR ALL USING (auth.role() = 'authenticated');
```

---

## 5. Data Flow (After Redesign)

### 5.1 채팅 → 통화 → 결과 흐름

```
[1] POST /api/conversations
    → INSERT conversations (status=COLLECTING)
    → INSERT messages (greeting)

[2] POST /api/chat (반복)
    → INSERT messages (user + assistant)
    → UPSERT conversation_entities
    → UPDATE conversations.collected_data

[3] POST /api/calls
    → INSERT calls (status=PENDING)
    → UPDATE conversations.status = CALLING

[4] POST /api/calls/:id/start
    → UPDATE calls.status = IN_PROGRESS
    → (Relay Server 호출)

[5] Relay Server 통화 중
    → INSERT call_transcripts (턴마다)
    → INSERT call_events (이벤트 발생 시)

[6] Relay Server 통화 종료
    → INSERT call_sessions (세션 메타)
    → UPDATE calls (status, result, summary, total_tokens, duration_s)
    → UPDATE conversations.status = COMPLETED
```

### 5.2 Relay Server `persist_call()` 변경

기존: 단일 UPSERT로 `calls` 테이블에 모든 데이터 저장
변경: 3개 테이블에 분산 저장

```python
async def persist_call(call: ActiveCall) -> None:
    """통화 종료 시 데이터를 정규화된 테이블에 저장."""
    client = await get_client()

    # 1. call_sessions — 세션 메타데이터
    await client.table("call_sessions").insert({
        "call_id": call.call_id,
        "source_language": call.source_language,
        "target_language": call.target_language,
        "vad_mode": call.vad_mode,
        "session_a_id": call.session_a_id,
        "session_b_id": call.session_b_id,
        "cost_tokens": call.cost_tokens.model_dump(),
        "call_result": call.call_result,
        "call_result_data": call.call_result_data,
        "auto_ended": call.auto_ended,
        "started_at": call.started_at_iso,
        "ended_at": call.ended_at_iso,
    }).execute()

    # 2. call_transcripts — 턴별 대화 기록
    if call.transcript_bilingual:
        rows = [
            {
                "call_id": call.call_id,
                "turn_index": i,
                "role": t.role,
                "direction": "outbound" if t.role == "user" else "inbound",
                "original_text": t.original_text,
                "translated_text": t.translated_text,
                "source_language": t.language,
                "target_language": call.target_language if t.role == "user" else call.source_language,
            }
            for i, t in enumerate(call.transcript_bilingual)
        ]
        await client.table("call_transcripts").insert(rows).execute()

    # 3. call_events — guardrail + recovery + function call
    events = []
    for e in call.guardrail_events_log:
        events.append({"call_id": call.call_id, "category": "guardrail", "event_type": f"level_{e.get('level',0)}", "data": e})
    for e in call.recovery_events:
        events.append({"call_id": call.call_id, "category": "recovery", "event_type": e.type.value, "data": e.model_dump()})
    for e in call.function_call_logs:
        events.append({"call_id": call.call_id, "category": "function_call", "event_type": e.get("function_name",""), "data": e})
    if events:
        await client.table("call_events").insert(events).execute()

    # 4. calls — 요약 업데이트
    await client.table("calls").update({
        "status": "COMPLETED",
        "result": call.call_result or None,
        "summary": _generate_summary(call),
        "total_tokens": call.cost_tokens.total,
        "duration_s": int(call.ended_at - call.started_at) if call.ended_at else 0,
        "twilio_call_sid": call.call_sid,
        "completed_at": call.ended_at_iso,
        "updated_at": "now()",
    }).eq("id", call.call_id).execute()
```

---

## 6. Migration Plan

### Phase 1: 기본 스키마 생성 (새 migration 파일)

```
migrations/
  001_v3_schema.sql          ← 기존 (하위 호환 유지)
  002_v2_base_schema.sql     ← 신규: 전체 CREATE TABLE
  003_v2_data_migration.sql  ← 신규: 기존 데이터 이관
  004_v2_cleanup.sql         ← 신규: 레거시 컬럼 제거
```

### Phase 2: 코드 변경

| 파일 | 변경 |
|------|------|
| `relay-server/src/db/supabase_client.py` | `persist_call()` → 3테이블 분산 저장 |
| `relay-server/src/types.py` | `ActiveCall`에 `started_at_iso`, `ended_at_iso` 추가 |
| `web/shared/types.ts` | `CallRow`에서 ElevenLabs 필드 제거, `total_tokens`/`duration_s` 추가 |
| `web/app/api/calls/[id]/start/route.ts` | `relay_ws_url` + `twilio_call_sid` 업데이트 경로 유지 |
| `web/hooks/useCallPolling.ts` | Call 타입 업데이트 |

### Phase 3: 데이터 마이그레이션

```sql
-- 기존 calls 테이블의 JSONB 데이터를 새 테이블로 이관

-- 1. call_sessions 생성 (기존 calls에서 추출)
INSERT INTO call_sessions (call_id, source_language, target_language, ...)
SELECT id, source_language, target_language, ...
FROM calls
WHERE source_language IS NOT NULL;

-- 2. call_transcripts 생성 (JSONB 배열 언패킹)
INSERT INTO call_transcripts (call_id, turn_index, role, original_text, translated_text, ...)
SELECT c.id, t.ordinality - 1, t.elem->>'role', t.elem->>'original_text', ...
FROM calls c,
LATERAL jsonb_array_elements(c.transcript_bilingual) WITH ORDINALITY AS t(elem, ordinality)
WHERE jsonb_array_length(c.transcript_bilingual) > 0;

-- 3. call_events 생성 (guardrail + recovery + function_call 언패킹)
-- (guardrail_events, recovery_events, function_call_logs 각각)

-- 4. 레거시 컬럼 제거 (Phase 3 완료 확인 후)
ALTER TABLE calls DROP COLUMN IF EXISTS elevenlabs_conversation_id;
ALTER TABLE calls DROP COLUMN IF EXISTS transcript_bilingual;
ALTER TABLE calls DROP COLUMN IF EXISTS cost_tokens;
ALTER TABLE calls DROP COLUMN IF EXISTS guardrail_events;
ALTER TABLE calls DROP COLUMN IF EXISTS recovery_events;
ALTER TABLE calls DROP COLUMN IF EXISTS function_call_logs;
ALTER TABLE calls DROP COLUMN IF EXISTS call_result;
ALTER TABLE calls DROP COLUMN IF EXISTS call_result_data;
ALTER TABLE calls DROP COLUMN IF EXISTS auto_ended;
ALTER TABLE calls DROP COLUMN IF EXISTS session_a_id;
ALTER TABLE calls DROP COLUMN IF EXISTS session_b_id;
ALTER TABLE calls DROP COLUMN IF EXISTS vad_mode;
ALTER TABLE calls DROP COLUMN IF EXISTS source_language;
ALTER TABLE calls DROP COLUMN IF EXISTS target_language;
```

---

## 7. Useful Queries (After Redesign)

### 7.1 통화 이력 + 대화 내용

```sql
-- 사용자의 최근 통화 + 턴별 대화
SELECT c.id, c.target_name, c.status, c.result, c.duration_s,
       ct.turn_index, ct.role, ct.original_text, ct.translated_text
FROM calls c
LEFT JOIN call_transcripts ct ON ct.call_id = c.id
WHERE c.user_id = :user_id
ORDER BY c.created_at DESC, ct.turn_index ASC
LIMIT 100;
```

### 7.2 비용 분석

```sql
-- 사용자별 월간 토큰 사용량
SELECT c.user_id,
       date_trunc('month', c.created_at) AS month,
       SUM(c.total_tokens) AS tokens,
       COUNT(*) AS call_count,
       AVG(c.duration_s) AS avg_duration
FROM calls c
WHERE c.status = 'COMPLETED'
GROUP BY c.user_id, month
ORDER BY month DESC;
```

### 7.3 Guardrail 통계

```sql
-- 카테고리별 guardrail 이벤트 빈도
SELECT ce.event_type, COUNT(*) AS count,
       AVG((ce.data->>'correction_time_ms')::int) AS avg_correction_ms
FROM call_events ce
WHERE ce.category = 'guardrail'
GROUP BY ce.event_type
ORDER BY count DESC;
```

### 7.4 통화 성공률

```sql
-- 시나리오별 통화 성공률
SELECT c.request_type,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE c.result = 'SUCCESS') AS success,
       ROUND(100.0 * COUNT(*) FILTER (WHERE c.result = 'SUCCESS') / COUNT(*), 1) AS success_rate
FROM calls c
WHERE c.status = 'COMPLETED'
GROUP BY c.request_type;
```

---

## 8. Implementation Phases

### Phase 1: 긴급 수정 (즉시)
- [ ] Supabase에 `auto_ended` 컬럼 수동 추가 (현재 에러 해결)
- [ ] `call_mode` 기본값을 `'agent'`로 변경

### Phase 2: 새 테이블 생성
- [ ] `002_v2_base_schema.sql` 작성 (전체 CREATE TABLE)
- [ ] Supabase에서 새 테이블 생성 (call_sessions, call_transcripts, call_events)
- [ ] RLS 정책 적용

### Phase 3: 코드 변경
- [ ] `supabase_client.py` — `persist_call()` 리팩토링
- [ ] `types.py` — `ActiveCall` 타임스탬프 추가
- [ ] `shared/types.ts` — `CallRow` 업데이트
- [ ] `useCallPolling.ts` — Call 타입 업데이트

### Phase 4: 데이터 마이그레이션
- [ ] `003_v2_data_migration.sql` 실행
- [ ] 데이터 정합성 검증
- [ ] `004_v2_cleanup.sql` 실행 (레거시 컬럼 제거)

### Phase 5: 테스트
- [ ] 기존 테스트 업데이트 (persist_call mock 변경)
- [ ] E2E 통화 테스트 (persist 정상 저장 확인)
- [ ] Web App 대시보드 통화 이력 확인

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| `persist_call()` 에러율 | 0% | Relay Server 로그 |
| 단일 행 최대 크기 | < 10KB | `pg_column_size` |
| 스키마 재현성 | 100% | migration SQL만으로 새 DB 생성 |
| Transcript 쿼리 응답 | < 50ms (p95) | Supabase Dashboard |
| 통화 이력 조회 | < 100ms (p95) | Web App 성능 로그 |
