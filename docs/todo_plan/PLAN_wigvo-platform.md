# Task Plan: WIGVO Platform

> **Generated from**: docs/prd/PRD_WIGVO_PLATFORM.md
> **Created**: 2026-02-18
> **Status**: pending

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Phases

### Phase 1: CallMode & Accessibility (P0) — GAP-1, GAP-2

> **목표**: 사용자가 통화 모드를 선택할 수 있고, 접근성 모드별 적절한 UI가 표시됨

#### 1.1 CallMode 선택 UI 통합
- [ ] `CallModeSelector.tsx` 리팩토링 — 4가지 모드 지원
  - Voice → Voice (relay): 일반 양방향 음성 번역
  - Text → Voice (agent): 텍스트 입력, AI가 대신 말함
  - Voice → Text (relay + caption only): 음성 입력, 자막만 표시
  - Full Agent: AI 자율 통화 (기존 agent 모드)
- [ ] `CollectionSummary.tsx`에 모드 선택 단계 추가 (정보 수집 완료 후)
- [ ] 선택된 모드를 대화/통화 상태에 저장

#### 1.2 통화 생성 시 모드 전달
- [ ] `POST /api/calls` — call_mode 파라미터 추가
- [ ] `POST /api/calls/[id]/start` — call_mode 전달 (현재 기본값 "agent" → 사용자 선택값)
- [ ] Relay Server `CallStartRequest` — mode 필드에 매핑

#### 1.3 모드별 RealtimeCallView UI 분기
- [ ] Voice → Voice: AudioControls + LiveCaptionPanel (번역 자막)
- [ ] Text → Voice: TextInput + LiveCaptionPanel (수신자 응답 자막)
- [ ] Voice → Text: AudioControls + LiveCaptionPanel (자막 only, 수신자 음성 미재생)
- [ ] Full Agent: TextInput + LiveCaptionPanel (기존 agent UI)
- [ ] 각 모드별 적절한 안내 메시지 표시

#### 1.4 Relay Server 모드 분기 검증
- [ ] Relay Mode: Session A prompt = TRANSLATOR only
- [ ] Agent Mode: Session A prompt = AUTONOMOUS AGENT + tools
- [ ] Voice → Text: Session B output = caption only (audio 미전송)
- [ ] 모드별 프롬프트 정확성 검증

#### 1.5 테스트
- [ ] CallMode 선택 → 통화 시작 E2E 플로우 검증
- [ ] 각 모드별 WebSocket 메시지 정합성 확인
- [ ] call_mode DB 저장 확인

### Phase 2: Production Hardening (P1) — GAP-3, GAP-4, GAP-5

> **목표**: 프로덕션 보안 기준 충족

#### 2.1 CORS 제한
- [ ] `src/main.py` CORS middleware — allow_origins를 환경변수 기반 화이트리스트로 변경
- [ ] `src/config.py`에 `allowed_origins` 설정 추가

#### 2.2 Rate Limiting
- [ ] FastAPI rate limiting middleware 추가 (slowapi 또는 커스텀)
- [ ] API 엔드포인트별 제한 설정:
  - `/relay/calls/start`: 사용자당 분당 5회
  - `/api/chat`: 사용자당 분당 30회
  - `/api/calls`: 사용자당 분당 10회

#### 2.3 OAuth 설정
- [ ] Supabase OAuth provider 설정 (Google)
- [ ] Supabase OAuth provider 설정 (Kakao — 한국 시장)
- [ ] `OAuthButtons.tsx` 활성화 + 콜백 처리 검증

#### 2.4 Error Handling 강화
- [ ] Web App Error Boundary 추가
- [ ] Relay Server structured logging (JSON format)
- [ ] 에러 응답 표준화

### Phase 3: Quality & Monitoring (P2) — GAP-6, GAP-7, GAP-8

> **목표**: 운영 가시성 확보, 품질 개선

#### 3.1 Pre-recorded Filler Audio
- [ ] L3 가드레일 발동 시 사용할 필러 오디오 파일 준비 (한국어, 영어)
- [ ] `audio_router.py` TODO 교체 — 파일 재생 로직 구현

#### 3.2 Session Recovery 검증
- [ ] 인위적 WebSocket 끊김 시뮬레이션 테스트
- [ ] Degraded Mode 전환 + 복귀 검증
- [ ] Recovery 이벤트 App 알림 확인

#### 3.3 Admin Dashboard
- [ ] 통화 통계 API 엔드포인트 (/admin/stats)
- [ ] 비용 추적 집계 API
- [ ] 간단한 관리자 페이지 (또는 Supabase Dashboard 활용)

## Progress

| Metric | Value |
|--------|-------|
| Total Tasks | 0/25 |
| Current Phase | - |
| Status | pending |

## Execution Log

| Timestamp | Phase | Task | Status |
|-----------|-------|------|--------|
| - | - | - | - |
