# PRD Analysis Report: Realtime Relay System v3

## 분석 대상
- **문서**: `docs/12_PRD_REALTIME_RELAY.md`
- **버전**: 3.0
- **분석일**: 2026-02-13

---

## 요약

| 카테고리 | 발견 | Critical | Major | Minor |
|----------|------|----------|-------|-------|
| 완전성 | 6 | 2 | 3 | 1 |
| 실현가능성 | 4 | 2 | 2 | 0 |
| 보안 | 2 | 0 | 1 | 1 |
| 일관성 | 3 | 0 | 2 | 1 |
| **총계** | **15** | **4** | **8** | **3** |

---

## 상세 분석

### Critical (즉시 수정 필요)

#### C-1. Next.js App Router는 WebSocket을 지원하지 않음 — 인프라 재설계 필요

- **위치**: Section 3.1 System Overview, Section 8.2 API Specification
- **문제**: PRD는 `app/api/calls/[id]/stream/route.ts`를 WebSocket 엔드포인트로 정의하고 있으나, **Next.js 16 App Router는 WebSocket 업그레이드를 지원하지 않는다** (GitHub Discussion #58698 확인). 현재 프로젝트는 Vercel serverless 배포를 전제하고 있어 더욱 불가능하다.
- **영향**: Twilio Media Streams(WebSocket 필수), OpenAI Realtime API(WebSocket 필수), Browser 실시간 오디오 스트리밍 — 세 가지 핵심 기능이 모두 동작하지 않음. **구현 자체가 불가능**.
- **근거**: Twilio + OpenAI Realtime 공식 데모 3건 모두 **별도의 Fastify/Express 장수명 서버** 사용.
- **개선안**:

  ```markdown
  ### 3.1.1 Split Architecture (추가)

  v3의 실시간 오디오 처리는 Next.js와 분리된 별도 서버가 필요하다.

  | Component | 기술 | 배포 | 역할 |
  |-----------|------|------|------|
  | **Frontend + REST API** | Next.js 16 App Router | Vercel | UI, 채팅, 대화 관리, 통화 레코드 CRUD |
  | **Relay Server** | Fastify + @fastify/websocket | Railway / Fly.io | Twilio Media Streams, OpenAI Realtime API, 오디오 라우팅 |
  | **DB** | Supabase | Supabase Cloud | 공유 데이터베이스 (상태 동기화) |

  #### 통신 패턴
  - Next.js → Relay Server: REST API (통화 시작/종료 요청)
  - Relay Server → Supabase: 직접 DB 접근 (통화 상태 업데이트)
  - Next.js ← Supabase: Realtime subscription 또는 polling (상태 변경 감지)
  - Browser ↔ Relay Server: WebSocket (오디오/자막 스트리밍)
  ```

#### C-2. Session A의 역할이 모호함 — "번역기" vs "자율 에이전트"

- **위치**: Section 3.2 Dual Session Architecture, Section 8.1 System Prompt
- **문제**: PRD가 Session A를 두 가지 상충되는 역할로 정의하고 있다.
  - **번역기로서**: "User 음성 (영어) → STT → Translation (영어→한국어) → TTS" (Section 3.2)
  - **자율 에이전트로서**: `Opening: "안녕하세요, {{service}} 관련해서 연락드렸습니다."` + `For confirmations, use: "네, 맞습니다"` (Section 8.1)
- **영향**: 근본적인 아키텍처 결정이 누락됨.
  - **번역기 모드**: User가 "Please book for 3pm"이라고 말하면 → "오후 3시에 예약 부탁드려요"로 번역. User가 실시간으로 모든 대화를 제어.
  - **자율 에이전트 모드**: User가 채팅으로 정보만 제공하면 → AI가 알아서 통화를 진행 (v2 방식).
  - 이 둘은 완전히 다른 UX이고, Session A의 System Prompt, VAD 설계, Interrupt 처리가 달라짐.
- **개선안**:

  ```markdown
  ### 3.2.1 Session A 운영 모드 (추가)

  Session A는 사용자 유형에 따라 두 가지 모드로 운영된다.

  | 모드 | 적용 대상 | Session A 역할 | User 참여도 |
  |------|----------|----------------|------------|
  | **Relay Mode** (기본) | 외국인 (Voice-to-Voice) | 실시간 번역기. User의 말을 한국어로 번역만 함 | 높음 — User가 직접 대화를 주도 |
  | **Agent Mode** | 장애인 (Chat-to-Voice), 한국인 (v2 호환) | 자율 대화 에이전트. 수집된 정보 기반으로 AI가 통화 진행 | 낮음 — 정보 제공 후 AI에 위임 |

  #### Relay Mode 동작
  - User가 영어로 말한 것을 한국어로 번역하여 전달
  - 수신자의 한국어를 영어로 번역하여 User에게 전달
  - AI는 자체 판단으로 말을 추가하지 않음
  - 첫 인사만 자동 생성: "안녕하세요, {{service}} 관련해서 연락드렸습니다."

  #### Agent Mode 동작
  - v2와 동일하게 AI가 자율적으로 통화 진행
  - User는 텍스트로 중간 지시만 가능 (예: "배달 주소 알려줘")
  - 수신자 응답을 텍스트로 User에게 실시간 전달
  ```

#### C-3. "첫 인사" 타이밍 문제 미정의

- **위치**: Section 3.2, Section 8.1
- **문제**: 수신자가 전화를 받았을 때 **누가 먼저 말하는가?** 가 정의되지 않았다. v2에서는 ElevenLabs의 `first_message` 기능으로 처리했고, 이 타이밍이 맞지 않아 2-3초 만에 전화가 끊기는 문제가 반복되었다 (docs/11 트러블슈팅 참고).
  - **Relay Mode**: User가 아직 말하기 전에 수신자가 "네, OO입니다" 하면 → Session A에 입력이 없으므로 **침묵 발생** → 수신자가 끊을 수 있음.
  - **Agent Mode**: AI가 자동으로 인사해야 하는데, 수신자의 "여보세요"를 듣고 나서 말해야 할지, 바로 말해야 할지 불명확.
- **영향**: 통화 성공률에 직접적 영향. v2에서 가장 큰 트러블 포인트였음.
- **개선안**:

  ```markdown
  ### 8.1.1 First Message Strategy (추가)

  #### 수신자 응답 감지 후 자동 인사 (권장)
  1. Twilio가 전화를 건다
  2. Session B가 수신자 음성을 감지 (Server VAD)
  3. 수신자의 첫 발화 감지 즉시 → Session A에 자동 인사 트리거
  4. Session A가 한국어 인사 TTS 생성: "안녕하세요, {{service}} 관련해서 연락드렸습니다."
  5. 인사 완료 후 → Relay Mode: User에게 "상대방이 응답했습니다. 말씀하세요" 알림
  6. 인사 완료 후 → Agent Mode: AI가 바로 용건 시작

  #### Timeout 처리
  - 10초 이내 수신자 응답 없음 → "전화를 받지 않았습니다" 처리
  - 수신자 응답 후 User가 5초 이내 말하지 않음 (Relay Mode) → AI가 대신 "잠시만요" 필러
  ```

#### C-4. 한국인 사용자 시나리오 (v2 호환) 누락

- **위치**: Section 2 User Stories, Section 1.4 Scope
- **문제**: 기존 v2의 핵심 사용자인 **한국인 콜포비아 사용자**가 v3 User Story에 전혀 없다. v3가 EN↔KR 번역에 집중하면서 KR→KR 전화 대행(v2 핵심 기능)의 처리 방법이 불명확하다. Scope 테이블의 "한국어 ↔ 영어 번역"은 한국인→한국인 시나리오를 커버하지 못한다.
- **영향**: 기존 사용자 기반(콜포비아 MZ, 바쁜 직장인)을 잃을 수 있음. v2 기능이 v3에서 regression.
- **개선안**:

  ```markdown
  ### 2.4 한국인 사용자 (Agent Mode — v2 호환) (추가)

  **Primary User**: 이준호 (25세, 대학원생, 콜포비아)

  AS A 전화 통화가 부담스러운 한국인
  I WANT TO 채팅으로 정보만 입력하면 AI가 대신 전화해주길
  SO THAT 전화 스트레스 없이 예약/문의를 할 수 있다

  #### v3에서의 처리
  - Session A: Agent Mode (번역 없이 한국어→한국어 자율 대화)
  - Session B: STT만 수행 (번역 없이 한국어 텍스트 → User 자막)
  - VAD: Push-to-Talk (User는 텍스트로 중간 지시)
  - Guardrail: Level 1만 적용 (번역이 없으므로 교정 불필요)
  ```

---

### Major (구현 전 수정 권장)

#### M-1. Turn Overlap / Interrupt 처리 미정의

- **위치**: Section 3.2, Section 5
- **문제**: 실제 전화 통화에서는 양쪽이 동시에 말하는 상황(interrupt/overlap)이 빈번하다. PRD에 이 처리가 없다.
  - Relay Mode: User가 영어로 말하는 중에 수신자가 끼어들면?
  - Session A가 TTS를 Twilio로 보내는 중에 수신자가 말하면?
  - 두 Session이 동시에 출력을 생성하면?
- **개선안**: Session A의 `response.cancel` + Session B의 interrupt detection 정의. 수신자 발화 감지 시 Session A TTS 즉시 중단.

#### M-2. Guardrail Level 분류 기준이 구체적이지 않음

- **위치**: Section 5.5
- **문제**: Level 2 "confidence가 낮은 경우"라고 했으나, OpenAI Realtime API는 번역 confidence score를 제공하지 않는다. **실제로 사용 가능한 것은 텍스트 기반 규칙 매칭뿐이다.** 다만 OpenAI Agents SDK에 `output guardrail` 기능이 있어 텍스트 델타를 100자 단위로 검사하는 것이 가능하다.
- **개선안**: Level 분류를 "confidence" 대신 **규칙 기반 + 텍스트 델타 검사**로 재정의:
  - Level 1: 규칙 필터에 매칭 없음 → PASS
  - Level 2: 반말/비격식 패턴 매칭 → 비동기 교정
  - Level 3: 금지어/욕설 매칭 → 동기 차단

#### M-3. 최대 통화 시간 미정의

- **위치**: 전체
- **문제**: OpenAI Realtime API 세션 제한 시간, Twilio 통화 최대 시간, 비용 상한선이 정의되지 않음. 무제한 통화 시 비용 폭발 위험.
- **개선안**: `MAX_CALL_DURATION_MS: 600000` (10분) 정의. 8분 경과 시 User에게 경고, 10분에 자동 종료.

#### M-4. 오디오 포맷 라우팅이 세션별로 불명확

- **위치**: Section 4.3 Session Configuration
- **문제**: Session A와 Session B의 입출력 오디오 포맷이 혼재되어 있다.
  - Session A Input: Browser 오디오 (pcm16 16kHz) 또는 텍스트
  - Session A Output: Twilio로 보낼 오디오 → `g711_ulaw` 필요
  - Session B Input: Twilio에서 오는 오디오 → `g711_ulaw`
  - Session B Output: Browser로 보낼 오디오 → `pcm16` 또는 텍스트만
- **개선안**: 각 Session의 `input_audio_format`과 `output_audio_format`을 명시적 테이블로 정리:

  | Session | Input Format | Output Format | 비고 |
  |---------|-------------|---------------|------|
  | A (Relay) | pcm16 (browser) | g711_ulaw (Twilio) | Client VAD 적용 |
  | A (Agent/PTT) | text only | g711_ulaw (Twilio) | 텍스트 입력, 오디오 출력 |
  | B | g711_ulaw (Twilio) | pcm16 (browser) + text | 자막용 텍스트 필수 |

#### M-5. Ring Buffer catch-up 1.5x 속도가 기술적으로 불가능

- **위치**: Section 5.3
- **문제**: "1.5x 속도로 압축 전송 (빠른 따라잡기)"라고 했으나, OpenAI Realtime API는 오디오를 실시간으로 처리한다. 1.5배속 오디오를 보내면 피치가 변하거나, API가 정상적으로 처리하지 못할 수 있다.
- **개선안**: catch-up 전략을 **STT-only 모드**로 변경. Ring Buffer의 미전송 오디오를 Whisper API(batch)로 텍스트 변환 후, 번역 텍스트를 User에게 "[복구됨]" 태그로 전달. 실시간성은 포기하되 내용 누락 방지.

#### M-6. Relay Server와 Next.js 간 통화 시작 흐름이 미정의

- **위치**: Section 8.2
- **문제**: C-1에서 Split Architecture로 전환 시, 통화 시작 시퀀스가 달라진다. 현재 `POST /api/calls/[id]/start`는 Next.js API Route인데, 실제 Twilio 발신과 OpenAI 세션 생성은 Relay Server에서 해야 한다. 두 서버 간의 호출 순서와 에러 처리가 정의되지 않았다.
- **개선안**:

  ```
  1. Browser → Next.js: POST /api/calls/[id]/start (통화 요청)
  2. Next.js → Relay Server: POST /relay/calls/start (Twilio + OpenAI 초기화 요청)
  3. Relay Server: Twilio 발신 + OpenAI Dual Session 생성
  4. Relay Server → Supabase: call 상태를 CALLING으로 업데이트
  5. Relay Server → Next.js: { relayWebSocketUrl, callSid } 반환
  6. Next.js → Browser: { websocketUrl: relayWebSocketUrl } 반환
  7. Browser → Relay Server: WebSocket 연결 (오디오/자막 스트리밍)
  ```

#### M-7. 접근성(Accessibility) 구체 사항 누락

- **위치**: Section 2.2, 2.3, Section 4.4
- **문제**: 장애인 사용자를 위한 접근성 요구사항이 UI 수준에서 정의되지 않음.
  - 텍스트 크기 조절 (자막 가독성)
  - 키보드 전용 네비게이션 (Push-to-Talk 키보드 단축키)
  - 스크린 리더 호환성
  - 고대비 모드
- **개선안**: NFR에 접근성 항목 추가. 최소한 Push-to-Talk 키보드 단축키(Enter/Space)와 자막 폰트 크기 조절 필수.

#### M-8. Relay Server 기술 스택 및 배포 명세 누락

- **위치**: Section 8.4, Section 10
- **문제**: Relay Server의 구체적 기술 스택(Fastify vs Express), 배포 플랫폼(Railway vs Fly.io), 환경변수, 헬스체크, 모니터링이 정의되지 않음.
- **개선안**: Twilio 공식 데모 기반으로 **Fastify + @fastify/websocket** 스택 권장. 배포는 Railway (간편) 또는 Fly.io (글로벌 엣지) 중 선택.

---

### Minor (개선 제안)

#### m-1. 통화 녹음 동의/법적 고지 미정의

- **위치**: Section 7.4 Security
- **문제**: 한국 통신비밀보호법상 통화 녹음 시 상대방 동의가 필요할 수 있다. 트랜스크립트 저장도 개인정보에 해당.
- **개선안**: 통화 시작 시 "이 통화는 서비스 품질을 위해 기록됩니다" 안내 멘트를 Session A 첫 메시지에 포함할지 검토. 해커톤에서는 Skip 가능하나 프로덕션에서는 필수.

#### m-2. 비용 추정치에 System Prompt 토큰 미포함

- **위치**: Section 7.3 Cost
- **문제**: OpenAI Realtime API는 **매 턴마다 System Prompt를 입력 토큰으로 재전송**한다. 1000자 System Prompt는 비용을 2-3x 증가시킬 수 있다. 현재 비용 추정($0.37/분)은 이를 반영하지 않았을 수 있다.
- **개선안**: System Prompt 길이를 최소화하고, Cached Audio Input ($0.40/1M tokens) 활용 검토. 비용 추정을 Prompt 포함 기준으로 재계산.

#### m-3. 용어 불일치

- **위치**: 전체
- **문제**: "수신자", "상대방", "전화 상대방"이 혼용됨. "Relay Server", "Relay", "서버"가 혼용됨.
- **개선안**: 용어 통일 — "수신자(Recipient)", "Relay Server"로 고정.

---

## 누락된 요구사항

| ID | 요구사항 | 권장 우선순위 | 근거 |
|----|---------|--------------|------|
| NEW-1 | Split Architecture 정의 (Next.js + Relay Server) | P0 | C-1: WebSocket 불가 |
| NEW-2 | Session A 운영 모드 정의 (Relay vs Agent) | P0 | C-2: 역할 모호 |
| NEW-3 | First Message Strategy (인사 타이밍) | P0 | C-3: v2 최대 트러블 |
| NEW-4 | 한국인 사용자 시나리오 (v2 호환) | P0 | C-4: 기존 사용자 유실 |
| NEW-5 | Turn Overlap / Interrupt 처리 | P1 | M-1: 실시간 대화 필수 |
| NEW-6 | 최대 통화 시간 제한 | P1 | M-3: 비용 폭발 방지 |
| NEW-7 | Relay Server 기술 스택/배포 명세 | P1 | M-8: 인프라 구현 필수 |
| NEW-8 | 접근성 (키보드 단축키, 자막 크기) | P1 | M-7: 장애인 타겟 |
| NEW-9 | 통화 시작 시퀀스 (Next.js ↔ Relay Server) | P1 | M-6: Split Architecture |

---

## 권장 조치

### 즉시 조치 (Critical — 구현 불가 이슈)

1. **C-1**: Split Architecture 도입 — Relay Server(Fastify) 분리
2. **C-2**: Session A 운영 모드(Relay/Agent) 명확히 정의
3. **C-3**: First Message Strategy 추가
4. **C-4**: 한국인 사용자 시나리오 추가 (v2 호환)

### 구현 전 조치 (Major)

5. **M-1**: Turn Overlap/Interrupt 처리 정의
6. **M-2**: Guardrail Level 분류를 규칙 기반으로 재정의
7. **M-3**: 최대 통화 시간 10분 제한 추가
8. **M-4**: 세션별 오디오 포맷 명시적 테이블 추가
9. **M-5**: Ring Buffer catch-up을 STT-only 모드로 변경
10. **M-6**: 통화 시작 시퀀스 정의 (Next.js → Relay Server)
11. **M-7**: 접근성 요구사항 추가
12. **M-8**: Relay Server 기술 스택/배포 명세 추가

### 가능하면 조치 (Minor)

13. **m-1**: 통화 녹음 동의 멘트 검토
14. **m-2**: 비용 추정치 System Prompt 토큰 반영
15. **m-3**: 용어 통일

---

## 긍정적 발견사항

분석 중 확인된 기술적으로 검증된 사항:

1. **Guardrail 텍스트 인터셉션 가능**: OpenAI Realtime API는 `modalities: ["text", "audio"]` 설정 시 텍스트 델타가 오디오보다 먼저 도착하므로, **오디오 출력 전에 텍스트 검사가 가능**하다. OpenAI Agents SDK(Node.js)에는 이를 위한 내장 guardrail 기능이 있어, 100자 단위로 자동 검사 + 위반 시 오디오 차단이 가능.
2. **Twilio + OpenAI Realtime 공식 레퍼런스 존재**: 정확히 이 아키텍처(양방향 번역)를 구현한 공식 데모가 존재 (twilio-samples/live-translation-openai-realtime-api).
3. **g711_ulaw 네이티브 지원**: OpenAI Realtime API가 g711_ulaw를 직접 지원하므로 오디오 코덱 변환이 불필요.
4. **VAD 설계가 잘 되어 있음**: 3단계 VAD 전략(Client/Server/PTT)은 시나리오별로 적절하며, 비용 절감 효과도 현실적.

---

## 다음 단계

Critical 이슈 4건을 PRD에 반영한 후 `/implement realtime-relay`로 구현을 시작하세요.

> Critical 이슈가 모두 해결되면 구현을 시작해도 좋습니다.
> Major 이슈는 구현 중 병행 수정 가능합니다.
