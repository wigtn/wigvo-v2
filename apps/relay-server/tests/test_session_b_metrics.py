"""Session B 메트릭 + Whisper anti-hallucination 단위 테스트.

session_b_speech_durations_ms, session_b_processing_latencies_ms,
session_b_stt_after_stop_ms 기록 검증.
Speech-only audio commit 검증.
Korean Whisper append-hallucination 필터 검증.
"""

import asyncio
import base64
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.realtime.sessions.session_b import (
    SessionBHandler,
    _normalize_for_blocklist,
    _STT_HALLUCINATION_BLOCKLIST,
    _KO_WHISPER_APPEND_SUBSTRINGS,
    _KO_TRAILING_FRAGMENT_RE,
    _KO_SENTENCE_ENDINGS,
    _MIN_E2E_MS,
)
from src.types import ActiveCall, CallMetrics, CallMode, CommunicationMode


def _make_call(**overrides) -> ActiveCall:
    defaults = dict(
        call_id="test-call-sb",
        mode=CallMode.RELAY,
        source_language="en",
        target_language="ko",
        communication_mode=CommunicationMode.VOICE_TO_VOICE,
    )
    defaults.update(overrides)
    return ActiveCall(**defaults)


def _make_session_mock():
    """RealtimeSession mock."""
    session = MagicMock()
    session.on = MagicMock()
    session.send_audio = AsyncMock()
    session.clear_input_buffer = AsyncMock()
    session.commit_audio_only = AsyncMock()
    session.create_response = AsyncMock()
    return session


def _make_handler(call=None, use_local_vad=False, **kwargs) -> SessionBHandler:
    """SessionBHandler 생성 (콜백 mock 포함)."""
    if call is None:
        call = _make_call()
    session = _make_session_mock()
    handler = SessionBHandler(
        session=session,
        call=call,
        on_translated_audio=AsyncMock(),
        on_caption=AsyncMock(),
        on_original_caption=AsyncMock(),
        on_recipient_speech_started=AsyncMock(),
        on_recipient_speech_stopped=AsyncMock(),
        on_transcript_complete=AsyncMock(),
        on_caption_done=AsyncMock(),
        use_local_vad=use_local_vad,
        **kwargs,
    )
    return handler


class TestNormalizeForBlocklist:
    """_normalize_for_blocklist 구두점 정규화 검증."""

    def test_strips_exclamation_mark(self):
        """느낌표가 제거되어 블록리스트에 매칭된다."""
        assert _normalize_for_blocklist("시청해주셔서 감사합니다!") == "시청해주셔서 감사합니다"
        assert _normalize_for_blocklist("시청해주셔서 감사합니다!") in _STT_HALLUCINATION_BLOCKLIST

    def test_strips_question_mark(self):
        """물음표가 제거된다."""
        assert _normalize_for_blocklist("MBC 뉴스 이덕영입니다?") == "MBC 뉴스 이덕영입니다"

    def test_strips_fullwidth_punctuation(self):
        """전각 구두점이 제거된다."""
        assert _normalize_for_blocklist("전해드립니다！") == "전해드립니다"
        assert _normalize_for_blocklist("밝혔습니다。") == "밝혔습니다"

    def test_preserves_ascii_period(self):
        """ASCII 마침표는 유지된다 (블록리스트에 . 포함 버전이 별도 등록)."""
        assert _normalize_for_blocklist("밝혔습니다.") == "밝혔습니다."

    def test_normal_text_unchanged(self):
        """일반 텍스트는 변경되지 않는다."""
        assert _normalize_for_blocklist("안녕하세요") == "안녕하세요"
        assert _normalize_for_blocklist("Hello, how are you?") == "Hello, how are you"

    def test_empty_and_whitespace(self):
        """빈 문자열/공백 처리."""
        assert _normalize_for_blocklist("") == ""
        assert _normalize_for_blocklist("  ") == ""


class TestSilenceTimeoutAntiHallucination:
    """Silence Timeout 경로의 anti-hallucination 수정 검증."""

    @pytest.mark.asyncio
    async def test_timeout_sets_speech_stopped_at(self):
        """Silence timeout이 _speech_stopped_at을 설정한다."""
        handler = _make_handler(use_local_vad=True)
        handler._speech_started_at = time.time() - 15.0
        handler._silence_timeout_s = 0.01  # 즉시 트리거

        await handler._silence_timeout_handler()

        assert handler._speech_stopped_at > 0

    @pytest.mark.asyncio
    async def test_timeout_clears_buffer_before_commit(self):
        """Silence timeout이 clear_input_buffer → commit_audio_only 순서로 호출한다."""
        handler = _make_handler(use_local_vad=True)
        handler._speech_started_at = time.time() - 15.0
        handler._silence_timeout_s = 0.01

        call_order = []
        handler.session.clear_input_buffer = AsyncMock(
            side_effect=lambda: call_order.append("clear")
        )
        handler.session.commit_audio_only = AsyncMock(
            side_effect=lambda: call_order.append("commit")
        )

        await handler._silence_timeout_handler()

        assert call_order == ["clear", "commit"]

    @pytest.mark.asyncio
    async def test_timeout_not_clear_buffer_for_server_vad(self):
        """Server VAD 모드에서는 clear_input_buffer를 호출하지 않는다."""
        handler = _make_handler(use_local_vad=False)
        handler._speech_started_at = time.time() - 15.0
        handler._silence_timeout_s = 0.01

        await handler._silence_timeout_handler()

        handler.session.clear_input_buffer.assert_not_called()
        handler.session.commit_audio_only.assert_not_called()


class TestSpeechStoppedTimestamp:
    """_speech_stopped_at 타임스탬프 기록 검증."""

    @pytest.mark.asyncio
    async def test_server_vad_sets_speech_stopped_at(self):
        """Server VAD speech_stopped에서 _speech_stopped_at가 설정된다."""
        handler = _make_handler()
        handler._speech_started_at = time.time() - 1.0  # 1초 전 시작
        handler._is_recipient_speaking = True

        await handler._handle_speech_stopped({})

        assert handler._speech_stopped_at > 0

    @pytest.mark.asyncio
    async def test_local_vad_sets_speech_stopped_at(self):
        """Local VAD notify_speech_stopped에서 _speech_stopped_at가 설정된다."""
        handler = _make_handler(use_local_vad=True)
        handler._speech_started_at = time.time() - 1.0
        handler._is_recipient_speaking = True

        await handler.notify_speech_stopped(peak_rms=1000.0)

        assert handler._speech_stopped_at > 0


class TestSpeechDurationsMs:
    """session_b_speech_durations_ms 기록 검증."""

    @pytest.mark.asyncio
    async def test_server_vad_records_speech_duration(self):
        """Server VAD에서 발화 길이가 기록된다."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._speech_started_at = time.time() - 1.5  # 1.5초 발화
        handler._is_recipient_speaking = True

        await handler._handle_speech_stopped({})

        assert len(call.call_metrics.session_b_speech_durations_ms) == 1
        duration = call.call_metrics.session_b_speech_durations_ms[0]
        assert 1400 < duration < 1600  # ~1500ms

    @pytest.mark.asyncio
    async def test_local_vad_records_speech_duration(self):
        """Local VAD에서 발화 길이가 기록된다."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)
        handler._speech_started_at = time.time() - 2.0
        handler._is_recipient_speaking = True

        await handler.notify_speech_stopped(peak_rms=1000.0)

        assert len(call.call_metrics.session_b_speech_durations_ms) == 1
        duration = call.call_metrics.session_b_speech_durations_ms[0]
        assert 1900 < duration < 2100

    @pytest.mark.asyncio
    async def test_short_speech_not_recorded(self):
        """최소 발화 길이 미만은 기록되지 않는다."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._speech_started_at = time.time() - 0.1  # 100ms (< min_speech_s)
        handler._is_recipient_speaking = True

        await handler._handle_speech_stopped({})

        assert len(call.call_metrics.session_b_speech_durations_ms) == 0


class TestProcessingLatenciesMs:
    """session_b_processing_latencies_ms 기록 검증."""

    @pytest.mark.asyncio
    async def test_processing_latency_recorded_on_translation_done(self):
        """번역 완료 시 processing latency가 기록된다."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5  # 0.5초 전 speech stopped

        await handler._save_transcript_and_notify("translated text")

        assert len(call.call_metrics.session_b_processing_latencies_ms) == 1
        proc = call.call_metrics.session_b_processing_latencies_ms[0]
        assert 400 < proc < 600  # ~500ms

    @pytest.mark.asyncio
    async def test_processing_latency_not_recorded_without_stop(self):
        """speech_stopped_at 없으면 processing latency 미기록."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = 0.0  # not set

        await handler._save_transcript_and_notify("translated text")

        assert len(call.call_metrics.session_b_processing_latencies_ms) == 0


class TestSttAfterStopMs:
    """session_b_stt_after_stop_ms 기록 검증."""

    @pytest.mark.asyncio
    async def test_stt_after_stop_recorded(self):
        """STT 완료가 speech_stopped 이후에 발생하면 지연이 기록된다."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.3  # 0.3초 전 stop

        await handler._handle_input_transcription_completed({"transcript": "테스트"})

        assert len(call.call_metrics.session_b_stt_after_stop_ms) == 1
        after = call.call_metrics.session_b_stt_after_stop_ms[0]
        assert 200 < after < 400  # ~300ms

    @pytest.mark.asyncio
    async def test_stt_after_stop_not_recorded_without_stop(self):
        """speech_stopped_at 없으면 stt_after_stop 미기록."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = 0.0

        await handler._handle_input_transcription_completed({"transcript": "테스트"})

        assert len(call.call_metrics.session_b_stt_after_stop_ms) == 0


class TestMinE2eFilter:
    """최소 E2E 임계값 필터 검증."""

    @pytest.mark.asyncio
    async def test_fast_response_blocked(self):
        """e2e < _MIN_E2E_MS인 응답은 할루시네이션으로 차단된다."""
        call = _make_call()
        handler = _make_handler(call=call)
        # 100ms 전 시작 → e2e ≈ 100ms < 500ms
        handler._committed_speech_started_at = time.time() - 0.1
        handler._committed_speech_stopped_at = time.time() - 0.05

        await handler._save_transcript_and_notify("hallucinated text")

        assert len(call.call_metrics.session_b_e2e_latencies_ms) == 0
        assert call.call_metrics.hallucinations_blocked == 1

    @pytest.mark.asyncio
    async def test_normal_response_passes(self):
        """e2e >= _MIN_E2E_MS인 응답은 정상 통과한다."""
        call = _make_call()
        handler = _make_handler(call=call)
        # 2초 전 시작 → e2e ≈ 2000ms > 500ms
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._save_transcript_and_notify("translated text")

        assert len(call.call_metrics.session_b_e2e_latencies_ms) == 1
        assert call.call_metrics.hallucinations_blocked == 0


class TestExistingMetricsUnchanged:
    """기존 session_b_e2e_latencies_ms, session_b_stt_latencies_ms 변경 없음."""

    @pytest.mark.asyncio
    async def test_e2e_still_recorded(self):
        """E2E latency는 여전히 기록된다."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._save_transcript_and_notify("translated text")

        assert len(call.call_metrics.session_b_e2e_latencies_ms) == 1

    @pytest.mark.asyncio
    async def test_stt_still_recorded(self):
        """STT latency는 _pending_stt_ms에 임시 저장된다.

        2단계 기록: _handle_input_transcription_completed → _pending_stt_ms 저장,
        _save_transcript_and_notify → session_b_stt_latencies_ms 리스트에 append.
        리스트 인덱스 정합성(E2E ↔ STT)을 위해 동시 기록.
        """
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.3

        await handler._handle_input_transcription_completed({"transcript": "테스트"})

        assert handler._pending_stt_ms > 0


class TestTimestampReset:
    """번역 완료 후 타임스탬프 리셋 검증."""

    @pytest.mark.asyncio
    async def test_timestamps_reset_after_translation(self):
        """_save_transcript_and_notify 후 커밋 타임스탬프가 리셋된다."""
        call = _make_call()
        handler = _make_handler(call=call)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._save_transcript_and_notify("translated text")

        assert handler._committed_speech_started_at == 0.0
        assert handler._committed_speech_stopped_at == 0.0


class TestPostEchoSettlingFilter:
    """P3: Post-echo settling 직후 ≤1단어 STT 차단 검증."""

    @pytest.mark.asyncio
    async def test_post_echo_blocks_short_stt(self):
        """post_echo=True 시 ≤1단어 STT가 차단된다."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started(post_echo=True)

        await handler._handle_input_transcription_completed(
            {"transcript": "Oh"}
        )

        assert handler._stt_blocked is True
        assert call.call_metrics.hallucinations_blocked == 1

    @pytest.mark.asyncio
    async def test_post_echo_allows_longer_stt(self):
        """post_echo=True이어도 >2단어 STT는 통과한다."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started(post_echo=True)

        await handler._handle_input_transcription_completed(
            {"transcript": "I need a reservation for three"}
        )

        assert handler._stt_blocked is False
        assert handler._post_echo is False  # 유효 STT 통과 후 리셋

    @pytest.mark.asyncio
    async def test_post_echo_not_set_by_default(self):
        """post_echo 미지정 시 기본값 False — 필터 미적용."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started()  # post_echo=False (default)

        await handler._handle_input_transcription_completed(
            {"transcript": "Oh yes"}
        )

        # post_echo=False이므로 ≤2단어여도 통과 (EN 필터는 target_language에 의존)
        assert handler._post_echo is False

    @pytest.mark.asyncio
    async def test_post_echo_single_word_blocked(self):
        """post_echo=True 시 단일 단어 STT가 차단된다."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started(post_echo=True)

        await handler._handle_input_transcription_completed(
            {"transcript": "네"}
        )

        assert handler._stt_blocked is True
        assert call.call_metrics.hallucinations_blocked == 1

    @pytest.mark.asyncio
    async def test_post_echo_resets_on_valid_stt(self):
        """유효한 STT(>2단어)가 통과하면 _post_echo가 False로 리셋된다."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started(post_echo=True)
        assert handler._post_echo is True

        await handler._handle_input_transcription_completed(
            {"transcript": "예약을 하고 싶습니다 내일 저녁"}
        )

        assert handler._post_echo is False
        assert handler._stt_blocked is False

    @pytest.mark.asyncio
    async def test_post_echo_two_words_now_passes(self):
        """post_echo=True이어도 2단어 STT는 통과한다 (≤1 threshold)."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started(post_echo=True)

        await handler._handle_input_transcription_completed(
            {"transcript": "Oh yes"}
        )

        assert handler._stt_blocked is False
        assert handler._post_echo is False  # 유효 STT → 리셋

    @pytest.mark.asyncio
    async def test_post_echo_auto_clear_after_3s(self):
        """3초 경과 후 단일 단어도 post-echo 필터를 통과한다."""
        call = _make_call()
        handler = _make_handler(call=call, use_local_vad=True)

        await handler.notify_speech_started(post_echo=True)
        # speech_started_at을 4초 전으로 조정
        handler._speech_started_at = time.time() - 4.0

        await handler._handle_input_transcription_completed(
            {"transcript": "여보세요"}
        )

        assert handler._post_echo is False
        assert handler._stt_blocked is False


class TestCallMetricsFields:
    """CallMetrics 새 필드 존재 확인."""

    def test_new_fields_exist_in_model(self):
        """새 필드가 CallMetrics에 존재한다."""
        m = CallMetrics()
        assert hasattr(m, "session_b_speech_durations_ms")
        assert hasattr(m, "session_b_processing_latencies_ms")
        assert hasattr(m, "session_b_stt_after_stop_ms")
        assert m.session_b_speech_durations_ms == []
        assert m.session_b_processing_latencies_ms == []
        assert m.session_b_stt_after_stop_ms == []

    def test_new_fields_in_model_dump(self):
        """새 필드가 model_dump()에 포함된다."""
        m = CallMetrics()
        d = m.model_dump()
        assert "session_b_speech_durations_ms" in d
        assert "session_b_processing_latencies_ms" in d
        assert "session_b_stt_after_stop_ms" in d


# ─── Fix 1: Speech-Only Audio Commit ───────────────────────────────


class TestSpeechOnlyCommit:
    """Fix 1: Speech-only audio commit 검증."""

    @pytest.mark.asyncio
    async def test_commit_clears_and_resends_speech_only(self):
        """speech_end 시 clear → speech 구간만 재전송 → commit."""
        handler = _make_handler(use_local_vad=True)

        # 로컬 버퍼 시뮬레이션: 100 frames (2초), speech는 0.5~1.5초 구간
        now = time.time()
        handler._local_audio_start_time = now - 2.0
        for i in range(100):
            frame_b64 = base64.b64encode(bytes([0x10] * 160)).decode()
            handler._local_audio_frames.append(frame_b64)

        handler._speech_started_at = now - 1.5  # 1.5초 전 speech start
        handler._speech_stopped_at = now - 0.5  # 0.5초 전 speech stop

        call_order = []
        handler.session.clear_input_buffer = AsyncMock(
            side_effect=lambda: call_order.append("clear")
        )
        handler.session.send_audio = AsyncMock(
            side_effect=lambda x: call_order.append("send")
        )
        handler.session.commit_audio_only = AsyncMock(
            side_effect=lambda: call_order.append("commit")
        )

        await handler._commit_speech_only_audio()

        assert call_order == ["clear", "send", "commit"]
        # send_audio가 한 번 호출되어야 함 (단일 blob)
        handler.session.send_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_commit_fallback_when_no_timestamps(self):
        """타임스탬프 없으면 기존 commit 방식 fallback."""
        handler = _make_handler(use_local_vad=True)
        handler._speech_started_at = 0.0
        handler._speech_stopped_at = 0.0

        await handler._commit_speech_only_audio()

        handler.session.commit_audio_only.assert_called_once()
        handler.session.clear_input_buffer.assert_not_called()

    @pytest.mark.asyncio
    async def test_commit_fallback_when_stop_before_start(self):
        """speech_stop이 speech_start보다 이전이면 fallback."""
        handler = _make_handler(use_local_vad=True)
        now = time.time()
        handler._speech_started_at = now
        handler._speech_stopped_at = now - 1.0  # stop이 start보다 이전

        await handler._commit_speech_only_audio()

        handler.session.commit_audio_only.assert_called_once()
        handler.session.clear_input_buffer.assert_not_called()

    @pytest.mark.asyncio
    async def test_speculative_uses_commit_time_as_start(self):
        """speculative 경로: speculative_commit_time부터 speech_stop까지만 전송."""
        handler = _make_handler(use_local_vad=True)

        now = time.time()
        handler._local_audio_start_time = now - 3.0
        for i in range(150):  # 3초 분량
            frame_b64 = base64.b64encode(bytes([0x10] * 160)).decode()
            handler._local_audio_frames.append(frame_b64)

        handler._speech_started_at = now - 2.5
        handler._speech_stopped_at = now - 0.5
        handler._speculative_committed = True
        handler._speculative_commit_time = now - 1.5  # 1.5초 전 speculative commit

        await handler._commit_speech_only_audio()

        # clear → send → commit 순서
        handler.session.clear_input_buffer.assert_called_once()
        handler.session.send_audio.assert_called_once()
        handler.session.commit_audio_only.assert_called_once()

    @pytest.mark.asyncio
    async def test_local_audio_buffer_max_size(self):
        """로컬 버퍼가 500 프레임을 초과하면 오래된 프레임이 제거된다."""
        handler = _make_handler()

        for i in range(510):
            frame_b64 = base64.b64encode(bytes([0x10] * 160)).decode()
            await handler.send_recipient_audio(frame_b64)

        assert len(handler._local_audio_frames) == 500

    @pytest.mark.asyncio
    async def test_buffer_start_time_initialized(self):
        """첫 프레임에서 _local_audio_start_time이 초기화된다."""
        handler = _make_handler()
        assert handler._local_audio_start_time == 0.0

        frame_b64 = base64.b64encode(bytes([0x10] * 160)).decode()
        await handler.send_recipient_audio(frame_b64)

        assert handler._local_audio_start_time > 0


# ─── Fix 2: Korean Whisper Append-Hallucination Filter ──────────────


class TestWhisperAppendFilter:
    """Fix 2: Korean Whisper append-hallucination 패턴 필터."""

    @pytest.mark.asyncio
    async def test_youtube_creator_name_trimmed(self):
        """'왜 바꾸고 싶으시죠? 영상편집 배혜지' → 할루시네이션 부분 제거."""
        call = _make_call(target_language="ko")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._handle_input_transcription_completed(
            {"transcript": "왜 바꾸고 싶으시죠? 영상편집 배혜지"}
        )

        # 원문이 트리밍된 텍스트로 저장됨
        assert "영상편집" not in handler._last_recipient_stt
        assert "바꾸고" in handler._last_recipient_stt
        assert handler._stt_blocked is False

    @pytest.mark.asyncio
    async def test_broadcast_program_trimmed(self):
        """'안녕하세요 재택 플러스' → 프로그램명 이후 제거."""
        call = _make_call(target_language="ko")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._handle_input_transcription_completed(
            {"transcript": "안녕하세요 재택 플러스"}
        )

        assert "재택" not in handler._last_recipient_stt
        assert handler._last_recipient_stt == "안녕하세요"

    @pytest.mark.asyncio
    async def test_full_hallucination_blocked(self):
        """할루시네이션이 전체 텍스트인 경우 완전 차단."""
        call = _make_call(target_language="ko")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._handle_input_transcription_completed(
            {"transcript": "영상편집 배혜지"}
        )

        assert handler._stt_blocked is True
        assert call.call_metrics.hallucinations_blocked == 1

    @pytest.mark.asyncio
    async def test_trailing_fragment_no_verb_trimmed(self):
        """문장 종결 후 동사 어미 없는 짧은 꼬리 제거."""
        call = _make_call(target_language="ko")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._handle_input_transcription_completed(
            {"transcript": "왜 바꾸고 싶으시죠? 배혜지 감독"}
        )

        # 꼬리 "배혜지 감독"이 제거됨 (동사 어미 없음)
        assert "배혜지" not in handler._last_recipient_stt
        assert handler._stt_blocked is False

    @pytest.mark.asyncio
    async def test_normal_multi_sentence_passes(self):
        """'네, 안녕하세요. 도와드리겠습니다.' → 정상 통과."""
        call = _make_call(target_language="ko")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._handle_input_transcription_completed(
            {"transcript": "네, 안녕하세요. 도와드리겠습니다."}
        )

        assert handler._last_recipient_stt == "네, 안녕하세요. 도와드리겠습니다."
        assert handler._stt_blocked is False

    @pytest.mark.asyncio
    async def test_non_korean_skips_filter(self):
        """target_language=en일 때 한국어 필터 스킵."""
        call = _make_call(target_language="en")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        # 영어 수신자 → 한국어 필터 미적용
        await handler._handle_input_transcription_completed(
            {"transcript": "Hello 영상편집 test"}
        )

        assert handler._last_recipient_stt == "Hello 영상편집 test"
        assert handler._stt_blocked is False

    @pytest.mark.asyncio
    async def test_normal_sentence_ending_passes_trailing_check(self):
        """정상 종결 어미 문장은 trailing fragment 필터를 통과한다."""
        call = _make_call(target_language="ko")
        handler = _make_handler(call=call, use_local_vad=True)
        handler._committed_speech_started_at = time.time() - 2.0
        handler._committed_speech_stopped_at = time.time() - 0.5

        await handler._handle_input_transcription_completed(
            {"transcript": "네 알겠습니다. 확인해드리겠습니다"}
        )

        # "확인해드리겠습니다"는 종결 어미 "습니다"로 끝남 → 정상 통과
        assert "확인해드리겠습니다" in handler._last_recipient_stt

    def test_ko_sentence_endings_regex(self):
        """한국어 종결 어미 정규식 검증."""
        # 정상 종결 어미
        assert _KO_SENTENCE_ENDINGS.search("도와드리겠습니다")
        assert _KO_SENTENCE_ENDINGS.search("감사합니다")
        assert _KO_SENTENCE_ENDINGS.search("예약하겠습니다.")
        assert _KO_SENTENCE_ENDINGS.search("그러시죠")
        assert _KO_SENTENCE_ENDINGS.search("말씀해주세요")

        # 종결 어미 아님 (이름/명사)
        assert not _KO_SENTENCE_ENDINGS.search("배혜지")
        assert not _KO_SENTENCE_ENDINGS.search("영상편집")
        assert not _KO_SENTENCE_ENDINGS.search("방송통신위원회")

    def test_ko_trailing_fragment_regex(self):
        """Trailing fragment 정규식 매칭 검증."""
        # 매칭되어야 하는 케이스
        m = _KO_TRAILING_FRAGMENT_RE.search("그러시죠? 영상편집 배혜지")
        assert m is not None
        assert m.group(1).strip() == "영상편집 배혜지"

        m = _KO_TRAILING_FRAGMENT_RE.search("안녕하세요. 지금까지 재택 플러스")
        assert m is not None

        # 매칭 안 되는 케이스 (문장 종결 부호 없음)
        m = _KO_TRAILING_FRAGMENT_RE.search("안녕하세요 영상편집")
        assert m is None
