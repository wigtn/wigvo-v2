FROM python:3.12-slim

# silero-vad-lite (ONNX Runtime) 런타임 의존성
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

# uv 설치
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# 의존성 먼저 복사 (캐싱)
COPY pyproject.toml uv.lock ./

# 의존성 설치 (venv 없이 시스템에 직접)
RUN uv sync --frozen --no-dev --no-editable

# 소스 복사
COPY src/ src/
COPY static/ static/

# Cloud Run은 PORT 환경변수를 주입함
ENV PORT=8080

EXPOSE 8080

# uvicorn 실행 — Cloud Run이 주입하는 PORT 사용
CMD uv run uvicorn src.main:app \
  --host 0.0.0.0 \
  --port ${PORT} \
  --workers 1 \
  --timeout-keep-alive 300
