"""Session Recovery Manager — 장애 감지 + 자동 재연결 + catch-up.

PRD 5.3:
  1. 장애 감지 (3초 이내) — WebSocket close/error, heartbeat timeout
  2. Session 재연결 — exponential backoff (1s→2s→4s→8s, max 30s)
  3. Ring Buffer catch-up — 미전송 오디오를 Whisper API로 STT 배치 처리
  4. Conversation context 복원 — 이전 transcript를 새 세션에 주입
  5. Degraded Mode — 10초 초과 시 Whisper batch STT + GPT 번역 fallback

Recovery 이벤트 로깅:
  - 모든 복구 과정을 ActiveCall.recovery_events에 JSONB 형태로 기록
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import struct
import time
from typing import Any, Callable, Coroutine

import openai

from src.config import settings
from src.realtime.ring_buffer import AudioRingBuffer
from src.realtime.session_manager import RealtimeSession
from src.types import (
    ActiveCall,
    RecoveryEvent,
    RecoveryEventType,
    SessionState,
    WsMessage,
    WsMessageType,
)

logger = logging.getLogger(__name__)

# 세션 장애가 아닌 단순 타이밍 경쟁 에러 — Recovery 불필요
_IGNORABLE_ERROR_CODES = {
    "response_cancel_not_active",        # 이미 끝난 응답을 cancel 시도 (interrupt 타이밍)
    "conversation_already_has_active_response",  # 응답 생성 중 중복 요청
}


class SessionRecoveryManager:
    """단일 OpenAI Realtime 세션의 장애 복구를 관리한다."""

    def __init__(
        self,
        session: RealtimeSession,
        ring_buffer: AudioRingBuffer,
        call: ActiveCall,
        system_prompt: str,
        on_notify_app: Callable[[WsMessage], Coroutine],
        on_recovered_caption: Callable[[str, str], Coroutine] | None = None,
    ):
        self.session = session
        self.ring_buffer = ring_buffer
        self.call = call
        self._system_prompt = system_prompt
        self._on_notify_app = on_notify_app
        self._on_recovered_caption = on_recovered_caption

        self._recovering = False
        self._recovery_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._last_heartbeat: float = time.time()
        self._attempt: int = 0
        self._degraded_mode: bool = False
        self._openai_client: openai.AsyncOpenAI | None = None

    @property
    def is_recovering(self) -> bool:
        return self._recovering

    @property
    def is_degraded(self) -> bool:
        return self._degraded_mode

    def start_monitoring(self) -> None:
        """Heartbeat 모니터링을 시작한다."""
        self._last_heartbeat = time.time()
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        # 세션에 에러/종료 핸들러 등록
        self.session.on("error", self._on_session_error)
        self.session.on("session.created", self._on_heartbeat)
        self.session.on("session.updated", self._on_heartbeat)
        self.session.on("response.done", self._on_heartbeat)
        self.session.on("response.audio.delta", self._on_heartbeat)
        self.session.on("response.audio_transcript.delta", self._on_heartbeat)
        self.session.on("response.text.delta", self._on_heartbeat)
        self.session.on("input_audio_buffer.speech_started", self._on_heartbeat)
        self.session.on("input_audio_buffer.speech_stopped", self._on_heartbeat)
        self.session.on("input_audio_buffer.committed", self._on_heartbeat)
        self.session.on("conversation.item.input_audio_transcription.completed", self._on_heartbeat)

    async def stop(self) -> None:
        """모니터링과 복구 작업을 중지한다."""
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        if self._recovery_task:
            self._recovery_task.cancel()
            try:
                await self._recovery_task
            except asyncio.CancelledError:
                pass

    async def _on_heartbeat(self, event: dict[str, Any]) -> None:
        """세션에서 이벤트를 수신하면 heartbeat를 갱신한다."""
        self._last_heartbeat = time.time()

    async def _on_session_error(self, event: dict[str, Any]) -> None:
        """세션 에러 발생 시 복구를 시작한다."""
        error = event.get("error", {})
        error_code = error.get("code", "")
        error_msg = str(error.get("message", "unknown error"))

        # 타이밍 경쟁으로 발생하는 무해한 에러는 무시
        if error_code in _IGNORABLE_ERROR_CODES:
            logger.debug(
                "[%s] Ignoring non-critical error (%s): %s",
                self.session.label, error_code, error_msg,
            )
            return

        logger.error(
            "[%s] Session error detected: %s", self.session.label, error_msg
        )
        if not self._recovering:
            await self._start_recovery(reason=f"session_error: {error_msg}")

    async def _heartbeat_loop(self) -> None:
        """Heartbeat를 주기적으로 확인한다."""
        try:
            while True:
                await asyncio.sleep(settings.heartbeat_interval_s)

                if self._recovering:
                    continue

                elapsed = time.time() - self._last_heartbeat
                if elapsed > settings.heartbeat_timeout_s and not self.session.is_closed:
                    logger.warning(
                        "[%s] Heartbeat timeout (%.1fs since last event)",
                        self.session.label,
                        elapsed,
                    )
                    await self._start_recovery(reason="heartbeat_timeout")

                # 세션이 닫혔는데 복구 중이 아니면 복구 시작
                if self.session.is_closed and not self._recovering:
                    logger.warning(
                        "[%s] Session closed unexpectedly",
                        self.session.label,
                    )
                    await self._start_recovery(reason="connection_closed")

        except asyncio.CancelledError:
            pass

    async def _start_recovery(self, reason: str) -> None:
        """복구 프로세스를 시작한다."""
        if self._recovering:
            return

        self._recovering = True
        self._attempt = 0
        self._update_session_state(SessionState.RECONNECTING)

        self._log_recovery_event(
            RecoveryEventType.SESSION_DISCONNECTED,
            detail=reason,
        )

        # App에 복구 시작 알림
        await self._on_notify_app(
            WsMessage(
                type=WsMessageType.SESSION_RECOVERY,
                data={
                    "status": "recovering",
                    "session": self.session.label,
                    "gap_ms": self.ring_buffer.gap_ms,
                    "message": "연결 복구 중...",
                },
            )
        )

        self._recovery_task = asyncio.create_task(self._recovery_loop())

    async def _recovery_loop(self) -> None:
        """Exponential backoff로 세션 재연결을 시도한다."""
        recovery_start = time.time()

        while self._recovering:
            self._attempt += 1
            backoff = min(
                settings.recovery_initial_backoff_s
                * (settings.recovery_backoff_multiplier ** (self._attempt - 1)),
                settings.recovery_max_backoff_s,
            )

            logger.info(
                "[%s] Reconnect attempt #%d (backoff=%.1fs)",
                self.session.label,
                self._attempt,
                backoff,
            )

            self._log_recovery_event(
                RecoveryEventType.RECONNECT_ATTEMPT,
                attempt=self._attempt,
            )

            await asyncio.sleep(backoff)

            # 복구 타임아웃 체크 — Degraded Mode 전환
            elapsed = time.time() - recovery_start
            if elapsed > settings.recovery_timeout_s:
                logger.warning(
                    "[%s] Recovery timeout (%.1fs) — entering degraded mode",
                    self.session.label,
                    elapsed,
                )
                await self._enter_degraded_mode()
                return

            # 재연결 시도
            try:
                await self.session.close()
                await self.session.connect(self._build_recovery_prompt())
                self._last_heartbeat = time.time()

                logger.info(
                    "[%s] Reconnected successfully (attempt #%d)",
                    self.session.label,
                    self._attempt,
                )

                self._log_recovery_event(
                    RecoveryEventType.RECONNECT_SUCCESS,
                    attempt=self._attempt,
                )

                # Catch-up 처리
                await self._catchup()

                # 정상 복귀
                self._recovering = False
                self._update_session_state(SessionState.CONNECTED)

                self._log_recovery_event(RecoveryEventType.NORMAL_RESTORED)

                await self._on_notify_app(
                    WsMessage(
                        type=WsMessageType.SESSION_RECOVERY,
                        data={
                            "status": "recovered",
                            "session": self.session.label,
                            "gap_ms": 0,
                            "message": "연결이 복구되었습니다.",
                        },
                    )
                )

                # 복구 후 listen 루프 재시작
                asyncio.create_task(self.session.listen())
                return

            except Exception as e:
                logger.error(
                    "[%s] Reconnect attempt #%d failed: %s",
                    self.session.label,
                    self._attempt,
                    e,
                )
                self._log_recovery_event(
                    RecoveryEventType.RECONNECT_FAILED,
                    attempt=self._attempt,
                    detail=str(e),
                )

                if self._attempt >= settings.recovery_max_attempts:
                    logger.warning(
                        "[%s] Max reconnect attempts reached — entering degraded mode",
                        self.session.label,
                    )
                    await self._enter_degraded_mode()
                    return

    def _build_recovery_prompt(self) -> str:
        """복구 시 이전 transcript를 포함한 프롬프트를 생성한다."""
        if not self.call.transcript_history:
            return self._system_prompt

        # 이전 대화 내용을 context로 주입
        history_lines = []
        for entry in self.call.transcript_history[-20:]:  # 최근 20개
            role = entry.get("role", "unknown")
            text = entry.get("text", "")
            history_lines.append(f"[{role}]: {text}")

        context = "\n".join(history_lines)
        return (
            f"{self._system_prompt}\n\n"
            f"--- Previous conversation context (restored after reconnection) ---\n"
            f"{context}\n"
            f"--- End of context ---\n"
            f"Continue the conversation naturally from where it left off."
        )

    async def _catchup(self) -> None:
        """Ring Buffer의 미전송 오디오를 Whisper API로 STT 배치 처리한다."""
        gap_ms = self.ring_buffer.gap_ms
        if gap_ms <= 0:
            logger.info("[%s] No audio gap — skipping catch-up", self.session.label)
            return

        logger.info(
            "[%s] Starting catch-up: gap=%dms (%d chunks)",
            self.session.label,
            gap_ms,
            self.ring_buffer.gap,
        )

        self._log_recovery_event(
            RecoveryEventType.CATCHUP_STARTED,
            gap_ms=gap_ms,
        )

        # 미전송 오디오를 Whisper API로 배치 STT
        unsent_audio = self.ring_buffer.get_unsent_audio_bytes()
        if not unsent_audio:
            return

        try:
            transcript = await self._whisper_transcribe(unsent_audio)
            if transcript:
                # 복구된 텍스트를 "[복구됨]" 태그로 전달
                if self._on_recovered_caption:
                    await self._on_recovered_caption("recipient", f"[복구됨] {transcript}")

                # App에 복구된 자막 전달
                await self._on_notify_app(
                    WsMessage(
                        type=WsMessageType.CAPTION,
                        data={
                            "role": "recipient",
                            "text": f"[복구됨] {transcript}",
                            "direction": "inbound",
                            "recovered": True,
                        },
                    )
                )

            # 전송 완료로 마킹
            self.ring_buffer.last_sent_seq = self.ring_buffer.last_received_seq

            self._log_recovery_event(
                RecoveryEventType.CATCHUP_COMPLETED,
                gap_ms=gap_ms,
                detail=f"transcribed {len(unsent_audio)} bytes",
            )

        except Exception as e:
            logger.error("[%s] Catch-up failed: %s", self.session.label, e)

    async def _enter_degraded_mode(self) -> None:
        """Degraded Mode로 전환한다 — Whisper batch STT fallback."""
        self._degraded_mode = True
        self._recovering = False
        self._update_session_state(SessionState.DEGRADED)

        self._log_recovery_event(RecoveryEventType.DEGRADED_MODE_ENTERED)

        await self._on_notify_app(
            WsMessage(
                type=WsMessageType.SESSION_RECOVERY,
                data={
                    "status": "degraded",
                    "session": self.session.label,
                    "gap_ms": self.ring_buffer.gap_ms,
                    "message": "일시적으로 자막이 지연됩니다.",
                },
            )
        )

        logger.warning("[%s] Entered degraded mode", self.session.label)

    async def exit_degraded_mode(self) -> None:
        """Degraded Mode에서 정상 모드로 복귀한다."""
        self._degraded_mode = False
        self._update_session_state(SessionState.CONNECTED)

        self._log_recovery_event(RecoveryEventType.DEGRADED_MODE_EXITED)

        await self._on_notify_app(
            WsMessage(
                type=WsMessageType.SESSION_RECOVERY,
                data={
                    "status": "recovered",
                    "session": self.session.label,
                    "gap_ms": 0,
                    "message": "연결이 정상화되었습니다.",
                },
            )
        )

    async def process_degraded_audio(self, audio_bytes: bytes) -> str | None:
        """Degraded Mode에서 오디오를 Whisper로 배치 처리한다.

        Args:
            audio_bytes: g711_ulaw 오디오 바이트

        Returns:
            Whisper STT 결과 텍스트 또는 None
        """
        if not self._degraded_mode:
            return None

        try:
            return await self._whisper_transcribe(audio_bytes)
        except Exception as e:
            logger.error("[%s] Degraded mode transcription failed: %s", self.session.label, e)
            return None

    async def _whisper_transcribe(self, audio_bytes: bytes) -> str | None:
        """Whisper API로 오디오를 텍스트로 변환한다.

        Args:
            audio_bytes: g711_ulaw 오디오 바이트 (8kHz)

        Returns:
            STT 결과 텍스트
        """
        if not audio_bytes:
            return None

        if self._openai_client is None:
            self._openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

        # PCM16 raw bytes를 WAV 형식으로 감싸서 전송
        wav_bytes = self._pcm16_to_wav(audio_bytes, sample_rate=8000)
        audio_file = io.BytesIO(wav_bytes)
        audio_file.name = "audio.wav"

        try:
            result = await self._openai_client.audio.transcriptions.create(
                model=settings.whisper_model,
                file=audio_file,
                language=self.session.config.source_language,
            )
            return result.text if result.text else None
        except Exception as e:
            logger.error("[%s] Whisper transcription error: %s", self.session.label, e)
            return None

    @staticmethod
    def _pcm16_to_wav(pcm_bytes: bytes, sample_rate: int = 8000) -> bytes:
        """PCM16 raw bytes에 WAV 헤더를 붙여서 Whisper가 인식할 수 있게 한다."""
        num_channels = 1
        bits_per_sample = 16
        byte_rate = sample_rate * num_channels * bits_per_sample // 8
        block_align = num_channels * bits_per_sample // 8
        data_size = len(pcm_bytes)

        header = struct.pack(
            "<4sI4s4sIHHIIHH4sI",
            b"RIFF",
            36 + data_size,
            b"WAVE",
            b"fmt ",
            16,                 # chunk size
            1,                  # PCM format
            num_channels,
            sample_rate,
            byte_rate,
            block_align,
            bits_per_sample,
            b"data",
            data_size,
        )
        return header + pcm_bytes

    def _update_session_state(self, state: SessionState) -> None:
        """ActiveCall의 세션 상태를 업데이트한다."""
        if self.session.label == "SessionA":
            self.call.session_a_state = state
        elif self.session.label == "SessionB":
            self.call.session_b_state = state

    def _log_recovery_event(
        self,
        event_type: RecoveryEventType,
        gap_ms: int = 0,
        attempt: int = 0,
        detail: str = "",
    ) -> None:
        """Recovery 이벤트를 기록한다."""
        event = RecoveryEvent(
            type=event_type,
            session_label=self.session.label,
            gap_ms=gap_ms or self.ring_buffer.gap_ms,
            attempt=attempt or self._attempt,
            status=event_type.value,
            timestamp=time.time(),
            detail=detail,
        )
        self.call.recovery_events.append(event)
        logger.info(
            "[%s] Recovery event: %s (gap=%dms, attempt=%d) %s",
            self.session.label,
            event_type.value,
            event.gap_ms,
            event.attempt,
            detail,
        )
