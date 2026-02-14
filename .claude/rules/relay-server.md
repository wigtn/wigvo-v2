---
paths:
  - "apps/relay-server/**/*.py"
---

# Relay Server Rules (Python/FastAPI)

## Code Style
- Python 3.12+ features 사용 (type union `X | Y`, match statement)
- 모든 함수에 type hints 필수
- Pydantic BaseModel로 모든 데이터 구조 정의
- async/await 일관 사용 (sync 함수 금지, Twilio REST 호출 제외)

## Project Structure
- `src/routes/` — FastAPI 라우터 (API 엔드포인트)
- `src/realtime/` — OpenAI Realtime API 세션 관리
- `src/twilio/` — Twilio 연동 (outbound, media stream)
- `src/prompt/` — System Prompt 생성기 + 템플릿
- `src/config.py` — 환경변수 (pydantic-settings)
- `src/types.py` — 공유 타입 정의

## Patterns
- WebSocket 핸들러: event 기반 콜백 패턴 (`session.on("event_type", handler)`)
- 에러 처리: logger.error + HTTPException (API), logger.warning (WebSocket)
- active_calls: `src/main.py`의 in-memory dict로 관리

## Dependencies
- `uv sync`로 의존성 설치
- 새 패키지 추가 시 `pyproject.toml`의 dependencies에 추가 후 `uv sync`
