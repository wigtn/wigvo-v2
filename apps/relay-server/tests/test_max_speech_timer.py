"""Max Speech Duration Timer 테스트.

PSTN 배경 소음으로 Server VAD의 speech_stopped가 지연되는 문제를 해결하기 위해
SessionBHandler에 추가된 max speech timer의 동작을 검증한다.

핵심 검증 사항:
  - speech_started 시 타이머 시작
  - max_speech_duration_s 초과 시 commit_audio() 강제 호출
  - speech_stopped 시 타이머 취소 (정상 VAD 동작)
  - 타이머 자동 재시작 (연속 발화 분할 처리)
  - stop() 호출 시 타이머 정리
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.realtime.session_b import SessionBHandler


def _make_session_b(**overrides) -> SessionBHandler:
    """테스트용 SessionBHandler 생성."""
    session = MagicMock()
    session.on = MagicMock()
    session.commit_audio = AsyncMock()
    session._send = AsyncMock()

    handler = SessionBHandler(
        session=session,
        call=None,
        on_recipient_speech_started=AsyncMock(),
        on_recipient_speech_stopped=AsyncMock(),
    )
    return handler


class TestMaxSpeechTimerStart:
    """speech_started 시 타이머가 시작되는지 검증."""

    @pytest.mark.asyncio
    async def test_timer_starts_on_speech_started(self):
        """speech_started 이벤트 시 max speech timer가 시작된다."""
        handler = _make_session_b()

        assert handler._max_speech_timer is None
        await handler._handle_speech_started({})
        assert handler._max_speech_timer is not None
        assert not handler._max_speech_timer.done()

        # Cleanup
        handler.stop()

    @pytest.mark.asyncio
    async def test_timer_restarted_on_new_speech_started(self):
        """새로운 speech_started 시 기존 타이머가 교체된다."""
        handler = _make_session_b()

        await handler._handle_speech_started({})
        first_timer = handler._max_speech_timer

        await handler._handle_speech_started({})
        second_timer = handler._max_speech_timer

        assert first_timer is not second_timer
        # cancel() 호출 후 이벤트 루프에 제어를 넘겨야 cancelled() 상태가 됨
        await asyncio.sleep(0)
        assert first_timer.cancelled()

        handler.stop()


class TestMaxSpeechTimerCommit:
    """타이머 만료 시 commit_audio()가 호출되는지 검증."""

    @pytest.mark.asyncio
    async def test_commit_called_after_timeout(self):
        """max_speech_duration_s 후 commit_audio()가 강제 호출된다."""
        handler = _make_session_b()

        with patch("src.realtime.session_b.settings") as mock_settings:
            mock_settings.max_speech_duration_s = 0.1  # 100ms for fast test

            await handler._handle_speech_started({})
            await asyncio.sleep(0.2)  # 타이머 만료 대기

            handler.session.commit_audio.assert_called()

        handler.stop()

    @pytest.mark.asyncio
    async def test_timer_auto_restarts_after_commit(self):
        """commit 후 타이머가 자동 재시작되어 연속 발화를 분할 처리한다."""
        handler = _make_session_b()

        with patch("src.realtime.session_b.settings") as mock_settings:
            mock_settings.max_speech_duration_s = 0.1

            await handler._handle_speech_started({})
            await asyncio.sleep(0.25)  # 첫 번째 commit
            await asyncio.sleep(0.15)  # 두 번째 commit

            # 최소 2회 이상 commit 호출
            assert handler.session.commit_audio.call_count >= 2

        handler.stop()


class TestMaxSpeechTimerCancel:
    """타이머 취소 동작 검증."""

    @pytest.mark.asyncio
    async def test_timer_cancelled_on_speech_stopped(self):
        """speech_stopped 시 타이머가 취소된다."""
        handler = _make_session_b()

        with patch("src.realtime.session_b.settings") as mock_settings:
            mock_settings.max_speech_duration_s = 10.0  # 긴 타이머 (만료 전에 취소)

            await handler._handle_speech_started({})
            timer = handler._max_speech_timer
            assert timer is not None

            await handler._handle_speech_stopped({})
            await asyncio.sleep(0)  # 이벤트 루프에 제어를 넘겨 cancel 처리
            assert timer.cancelled()
            assert handler._max_speech_timer is None

            # commit_audio는 호출되지 않아야 함 (타이머 만료 전 취소)
            handler.session.commit_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_commit_after_normal_speech(self):
        """정상적인 speech_started → speech_stopped에서는 commit이 호출되지 않는다."""
        handler = _make_session_b()

        with patch("src.realtime.session_b.settings") as mock_settings:
            mock_settings.max_speech_duration_s = 10.0

            await handler._handle_speech_started({})
            await asyncio.sleep(0.05)  # 짧은 발화
            await handler._handle_speech_stopped({})

            handler.session.commit_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_stop_cancels_timer(self):
        """stop() 호출 시 타이머가 정리된다."""
        handler = _make_session_b()

        with patch("src.realtime.session_b.settings") as mock_settings:
            mock_settings.max_speech_duration_s = 10.0

            await handler._handle_speech_started({})
            assert handler._max_speech_timer is not None

            handler.stop()
            assert handler._max_speech_timer is None
