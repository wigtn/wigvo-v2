"""OpenAI Realtime API 세션 매니저.

Dual Session (A + B)을 생성하고 라이프사이클을 관리한다.

PRD 3.2:
  - Session A: User → 수신자 (source → target 번역)
  - Session B: 수신자 → User (target → source 번역)
"""

import asyncio
import json
import logging
from typing import Any, Callable, Coroutine

import websockets
from websockets.asyncio.client import ClientConnection

from src.config import settings
from src.types import CallMode, SessionConfig

logger = logging.getLogger(__name__)

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"


class RealtimeSession:
    """단일 OpenAI Realtime API WebSocket 세션."""

    def __init__(self, label: str, config: SessionConfig):
        self.label = label
        self.config = config
        self.ws: ClientConnection | None = None
        self.session_id: str = ""
        self._closed = False
        self._handlers: dict[str, list[Callable[..., Coroutine]]] = {}

    def on(self, event_type: str, handler: Callable[..., Coroutine]) -> None:
        """이벤트 핸들러 등록."""
        self._handlers.setdefault(event_type, []).append(handler)

    async def connect(self, system_prompt: str) -> None:
        """OpenAI Realtime API에 WebSocket 연결하고 세션을 설정한다."""
        url = f"{OPENAI_REALTIME_URL}?model={settings.openai_realtime_model}"
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        logger.info("[%s] Connecting to OpenAI Realtime API...", self.label)
        self.ws = await websockets.connect(url, additional_headers=headers)
        logger.info("[%s] Connected", self.label)

        # 세션 설정
        await self._send(
            {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": system_prompt,
                    "input_audio_format": self.config.input_audio_format,
                    "output_audio_format": self.config.output_audio_format,
                    "turn_detection": (
                        {"type": "server_vad"}
                        if self.config.vad_mode.value == "server"
                        else None
                    ),
                },
            }
        )

    async def send_audio(self, audio_b64: str) -> None:
        """base64로 인코딩된 오디오를 세션에 전송한다."""
        await self._send(
            {
                "type": "input_audio_buffer.append",
                "audio": audio_b64,
            }
        )

    async def send_text(self, text: str) -> None:
        """텍스트 메시지를 세션에 전송한다 (Agent mode)."""
        await self._send(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": text}],
                },
            }
        )
        await self._send({"type": "response.create"})

    async def commit_audio(self) -> None:
        """오디오 버퍼를 커밋하고 응답을 요청한다 (Client VAD 사용 시)."""
        await self._send({"type": "input_audio_buffer.commit"})
        await self._send({"type": "response.create"})

    async def cancel_response(self) -> None:
        """현재 진행 중인 응답을 취소한다 (Interrupt 처리)."""
        await self._send({"type": "response.cancel"})
        logger.info("[%s] Response cancelled (interrupt)", self.label)

    async def listen(self) -> None:
        """WebSocket 메시지를 수신하고 등록된 핸들러를 호출한다."""
        if not self.ws:
            return

        try:
            async for raw in self.ws:
                if self._closed:
                    break

                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type", "")

                if event_type == "session.created":
                    self.session_id = event.get("session", {}).get("id", "")
                    logger.info("[%s] Session created: %s", self.label, self.session_id)

                if event_type == "error":
                    logger.error("[%s] Error: %s", self.label, event)

                # 등록된 핸들러 호출
                for handler in self._handlers.get(event_type, []):
                    try:
                        await handler(event)
                    except Exception:
                        logger.exception(
                            "[%s] Handler error for %s", self.label, event_type
                        )

        except websockets.exceptions.ConnectionClosed:
            logger.info("[%s] Connection closed", self.label)
        finally:
            self._closed = True

    async def close(self) -> None:
        """세션을 종료한다."""
        self._closed = True
        if self.ws:
            await self.ws.close()
            logger.info("[%s] Session closed", self.label)

    async def _send(self, data: dict[str, Any]) -> None:
        if self.ws and not self._closed:
            await self.ws.send(json.dumps(data))

    @property
    def is_closed(self) -> bool:
        return self._closed


class DualSessionManager:
    """Session A + Session B를 함께 관리한다."""

    def __init__(
        self,
        mode: CallMode,
        source_language: str,
        target_language: str,
    ):
        self.mode = mode
        self.source_language = source_language
        self.target_language = target_language

        # Session A: User → 수신자 (PRD 3.2 / M-4)
        self.session_a = RealtimeSession(
            label="SessionA",
            config=SessionConfig(
                mode=mode,
                source_language=source_language,
                target_language=target_language,
                input_audio_format=(
                    "pcm16" if mode == CallMode.RELAY else "pcm16"
                ),
                output_audio_format="g711_ulaw",  # Twilio로 출력
                vad_mode=(
                    "server" if mode == CallMode.RELAY else "server"
                ),
            ),
        )

        # Session B: 수신자 → User (PRD 3.2 / M-4)
        self.session_b = RealtimeSession(
            label="SessionB",
            config=SessionConfig(
                mode=mode,
                source_language=target_language,
                target_language=source_language,
                input_audio_format="g711_ulaw",  # Twilio에서 입력
                output_audio_format="pcm16",  # App으로 출력
                vad_mode="server",
            ),
        )

    async def connect(
        self,
        prompt_a: str,
        prompt_b: str,
    ) -> None:
        """양쪽 세션을 동시에 연결한다."""
        await asyncio.gather(
            self.session_a.connect(prompt_a),
            self.session_b.connect(prompt_b),
        )

    async def close(self) -> None:
        """양쪽 세션을 종료한다."""
        await asyncio.gather(
            self.session_a.close(),
            self.session_b.close(),
            return_exceptions=True,
        )

    async def listen_all(self) -> None:
        """양쪽 세션의 이벤트를 동시에 수신한다."""
        await asyncio.gather(
            self.session_a.listen(),
            self.session_b.listen(),
            return_exceptions=True,
        )
