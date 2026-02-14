---
paths:
  - "apps/relay-server/src/routes/**/*.py"
  - "apps/mobile/lib/api/**/*.ts"
---

# API Conventions

## REST Endpoints
- `POST /relay/calls/start` — 통화 시작
- `POST /relay/calls/{call_id}/end` — 통화 종료
- `GET /health` — 헬스체크

## WebSocket Endpoints
- `WS /relay/calls/{call_id}/stream` — App ↔ Relay (유저 오디오/텍스트, 자막)
- `WS /twilio/media-stream/{call_id}` — Twilio ↔ Relay (수신자 오디오)

## WebSocket Message Format (App ↔ Relay)
```json
{
  "type": "audio_chunk | text_input | vad_state | end_call | caption | recipient_audio | call_status | interrupt_alert | error",
  "data": {}
}
```

## Error Handling
- REST: HTTPException with status code + detail
- WebSocket: `{"type": "error", "data": {"message": "..."}}` 전송 후 연결 유지
