"""Spike: OpenAI Realtime API `modalities=['text']` 이벤트 검증.

PRD C-3 Critical 이슈:
  Session B를 modalities=['text']로 설정했을 때
  실제로 어떤 이벤트가 발생하는지 검증한다.

검증 항목:
  1. response.text.delta 이벤트 발생 여부
  2. response.text.done 이벤트 발생 여부
  3. response.text.delta 페이로드 필드명 (delta? text?)
  4. response.audio.delta 이벤트가 발생하지 않는지 확인
  5. input_audio_buffer.speech_started/stopped 이벤트 (server VAD + audio input) 동작 여부
  6. response.done 이벤트의 usage.output_token_details.audio_tokens == 0 확인

실행:
  cd apps/relay-server
  uv run python scripts/tests/spike_text_modality.py
"""

import asyncio
import json
import os
import sys
import time

import websockets

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from scripts.tests.helpers import fail, header, info, ok, print_summary

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"
MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview")
API_KEY = os.getenv("OPENAI_API_KEY", "")

# 수집할 이벤트 타입
EVENTS_OF_INTEREST = {
    "session.created",
    "session.updated",
    "response.text.delta",
    "response.text.done",
    "response.audio.delta",
    "response.audio_transcript.delta",
    "response.audio_transcript.done",
    "response.done",
    "response.created",
    "conversation.item.created",
    "input_audio_buffer.speech_started",
    "input_audio_buffer.speech_stopped",
    "error",
}


async def run_text_modality_spike() -> list[tuple[str, bool]]:
    """modalities=['text'] 세션을 생성하고 이벤트를 수집한다."""
    results: list[tuple[str, bool]] = []

    if not API_KEY:
        fail("OPENAI_API_KEY가 설정되지 않았습니다.")
        results.append(("환경변수 확인", False))
        return results

    url = f"{OPENAI_REALTIME_URL}?model={MODEL}"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "OpenAI-Beta": "realtime=v1",
    }

    collected_events: dict[str, list[dict]] = {}
    response_done_event: dict | None = None

    header("1. OpenAI Realtime API 연결 (modalities=['text'])")

    try:
        async with websockets.connect(url, additional_headers=headers) as ws:
            # session.created 대기
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            event = json.loads(raw)
            if event.get("type") == "session.created":
                ok(f"session.created 수신 (session_id={event.get('session', {}).get('id', '')[:20]}...)")
            else:
                fail(f"예상치 못한 첫 이벤트: {event.get('type')}")

            # session.update: modalities=['text'] 설정
            header("2. session.update (modalities=['text'], server VAD)")
            await ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "instructions": "You are a translator. Translate the user's message from Korean to English. Reply with ONLY the translation.",
                    "input_audio_format": "g711_ulaw",
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "silence_duration_ms": 500,
                        "prefix_padding_ms": 300,
                    },
                },
            }))

            # session.updated 대기
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            event = json.loads(raw)
            if event.get("type") == "session.updated":
                session = event.get("session", {})
                actual_modalities = session.get("modalities", [])
                ok(f"session.updated 수신 (modalities={actual_modalities})")
                results.append(("session.update modalities=['text'] 적용", actual_modalities == ["text"]))
            else:
                fail(f"예상치 못한 이벤트: {event.get('type')}")
                results.append(("session.update 응답", False))

            # 텍스트 입력 전송
            header("3. 텍스트 입력 전송 (conversation.item.create + response.create)")
            await ws.send(json.dumps({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "예약하고 싶은데요"}],
                },
            }))
            await ws.send(json.dumps({"type": "response.create"}))
            info("conversation.item.create + response.create 전송 완료")

            # 이벤트 수집 (response.done이 올 때까지)
            header("4. 이벤트 수집")
            start_time = time.time()
            timeout_s = 15

            while time.time() - start_time < timeout_s:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                    event = json.loads(raw)
                    event_type = event.get("type", "")

                    if event_type in EVENTS_OF_INTEREST:
                        collected_events.setdefault(event_type, []).append(event)
                        info(f"  {event_type}")

                        # delta 이벤트 상세 로깅
                        if event_type == "response.text.delta":
                            delta_val = event.get("delta", "<MISSING>")
                            info(f"    delta field: {repr(delta_val)[:80]}")
                        elif event_type == "response.audio.delta":
                            info("    (audio delta - 이것은 text-only 모드에서 발생하면 안 됨!)")
                        elif event_type == "response.text.done":
                            text_val = event.get("text", "<MISSING>")
                            info(f"    text field: {repr(text_val)[:80]}")
                        elif event_type == "response.done":
                            response_done_event = event
                            break
                        elif event_type == "error":
                            error_msg = event.get("error", {}).get("message", "unknown")
                            fail(f"    Error: {error_msg}")
                except asyncio.TimeoutError:
                    info("  (5초 대기 timeout - 계속 수집)")

            # 5. 오디오 입력 테스트 (VAD speech_started/stopped 확인)
            header("5. 오디오 입력 테스트 (speech_started/stopped 확인)")
            info("g711_ulaw 오디오 청크 전송 (500ms 분량, 고에너지 패턴)")

            # 의미있는 g711_ulaw 오디오 생성 (사인파 유사 패턴 - VAD 트리거용)
            # mu-law에서 높은 에너지: 0x00-0x0F (양수 큰 값), 0x80-0x8F (음수 큰 값)
            import base64
            high_energy_chunk = bytes([0x00, 0x80] * 80)  # 160 bytes = 20ms @ 8kHz
            audio_b64 = base64.b64encode(high_energy_chunk).decode("ascii")

            # 25개 청크 전송 (500ms 분량) — VAD가 감지할 수 있도록
            for _ in range(25):
                await ws.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": audio_b64,
                }))
                await asyncio.sleep(0.02)  # 20ms 간격

            # speech_started/stopped 이벤트 대기
            info("speech_started/stopped 이벤트 대기 (5초)...")
            vad_start_time = time.time()
            while time.time() - vad_start_time < 5:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2)
                    event = json.loads(raw)
                    event_type = event.get("type", "")
                    if event_type in EVENTS_OF_INTEREST:
                        collected_events.setdefault(event_type, []).append(event)
                        info(f"  {event_type}")
                    if event_type == "input_audio_buffer.speech_stopped":
                        break
                except asyncio.TimeoutError:
                    break

            # 세션 종료
            await ws.close()

    except Exception as e:
        fail(f"연결 실패: {e}")
        results.append(("OpenAI Realtime API 연결", False))
        return results

    # === 결과 분석 ===
    header("6. 결과 분석")

    # Test 1: response.text.delta 이벤트 발생
    has_text_delta = "response.text.delta" in collected_events
    if has_text_delta:
        ok("response.text.delta 이벤트 발생")
    else:
        fail("response.text.delta 이벤트 미발생")
    results.append(("response.text.delta 이벤트 발생", has_text_delta))

    # Test 2: response.text.done 이벤트 발생
    has_text_done = "response.text.done" in collected_events
    if has_text_done:
        ok("response.text.done 이벤트 발생")
    else:
        fail("response.text.done 이벤트 미발생")
    results.append(("response.text.done 이벤트 발생", has_text_done))

    # Test 3: response.text.delta 페이로드에 'delta' 필드 존재
    if has_text_delta:
        first_delta = collected_events["response.text.delta"][0]
        has_delta_field = "delta" in first_delta
        if has_delta_field:
            ok(f"response.text.delta에 'delta' 필드 존재 (값: {repr(first_delta['delta'])[:60]})")
        else:
            fail(f"response.text.delta에 'delta' 필드 없음 (실제 키: {list(first_delta.keys())})")
        results.append(("response.text.delta 'delta' 필드 존재", has_delta_field))
    else:
        results.append(("response.text.delta 'delta' 필드 존재", False))

    # Test 4: response.text.done 페이로드에 'text' 필드 존재
    if has_text_done:
        first_done = collected_events["response.text.done"][0]
        has_text_field = "text" in first_done
        if has_text_field:
            ok(f"response.text.done에 'text' 필드 존재 (값: {repr(first_done['text'])[:60]})")
        else:
            fail(f"response.text.done에 'text' 필드 없음 (실제 키: {list(first_done.keys())})")
        results.append(("response.text.done 'text' 필드 존재", has_text_field))
    else:
        results.append(("response.text.done 'text' 필드 존재", False))

    # Test 5: response.audio.delta 이벤트 미발생 (text-only이므로 audio 없어야 함)
    has_audio_delta = "response.audio.delta" in collected_events
    if not has_audio_delta:
        ok("response.audio.delta 이벤트 미발생 (text-only 정상)")
    else:
        fail(f"response.audio.delta 이벤트 {len(collected_events['response.audio.delta'])}개 발생 (text-only에서 audio 출력됨!)")
    results.append(("response.audio.delta 미발생 (text-only)", not has_audio_delta))

    # Test 6: response.audio_transcript.delta 이벤트 미발생
    has_audio_transcript = "response.audio_transcript.delta" in collected_events
    if not has_audio_transcript:
        ok("response.audio_transcript.delta 이벤트 미발생 (text-only 정상)")
    else:
        fail("response.audio_transcript.delta 이벤트 발생 (text-only에서 audio_transcript 발생!)")
    results.append(("response.audio_transcript.delta 미발생 (text-only)", not has_audio_transcript))

    # Test 7: response.done에서 audio_output tokens == 0
    if response_done_event:
        response = response_done_event.get("response", {})
        usage = response.get("usage", {})
        output_details = usage.get("output_token_details", {})
        audio_out = output_details.get("audio_tokens", -1)
        text_out = output_details.get("text_tokens", -1)
        audio_zero = audio_out == 0
        if audio_zero:
            ok(f"audio_output_tokens=0 (text_output_tokens={text_out})")
        else:
            fail(f"audio_output_tokens={audio_out} (0이어야 함, text_output={text_out})")
        results.append(("audio_output_tokens == 0", audio_zero))
    else:
        fail("response.done 이벤트 미수신 — token 검증 불가")
        results.append(("audio_output_tokens == 0", False))

    # Test 8: input_audio_buffer.speech_started 이벤트 (server VAD)
    has_speech_started = "input_audio_buffer.speech_started" in collected_events
    if has_speech_started:
        ok("input_audio_buffer.speech_started 이벤트 발생 (server VAD 동작)")
    else:
        info("input_audio_buffer.speech_started 이벤트 미발생 (VAD가 text-only에서 비활성화될 수 있음)")
    results.append(("input_audio_buffer.speech_started (server VAD)", has_speech_started))

    # === 요약 출력 ===
    header("전체 이벤트 수집 현황")
    for event_type, events in sorted(collected_events.items()):
        count = len(events)
        info(f"{event_type}: {count}건")

    return results


def main():
    header("Spike: OpenAI Realtime API modalities=['text'] 이벤트 검증")
    print()
    info(f"Model: {MODEL}")
    info(f"API Key: {'*' * 4}{API_KEY[-4:]}" if API_KEY else "NOT SET")
    print()

    results = asyncio.run(run_text_modality_spike())
    print_summary(results)

    # 핵심 결과 요약
    header("PRD C-3 검증 결론")
    core_tests = results[:6]  # 처음 6개가 핵심 (text.delta, text.done, 필드명, audio 미발생)
    all_core_pass = all(ok_flag for _, ok_flag in core_tests)

    if all_core_pass:
        ok("Session B modalities=['text'] 설정 시 response.text.delta/done 이벤트 정상 발생")
        ok("기존 _handle_transcript_delta 핸들러 재사용 가능 (delta 필드명 동일)")
        ok("PRD Section 5.9 설계 검증 완료 → C-3 Critical 해소")
    else:
        fail("일부 핵심 검증 실패 — PRD 수정 필요")
        for name, ok_flag in core_tests:
            if not ok_flag:
                fail(f"  실패: {name}")

    # VAD 결과 (마지막 테스트)
    vad_result = results[-1] if results and "speech_started" in results[-1][0] else None
    if vad_result:
        if vad_result[1]:
            ok("server VAD가 text-only modality에서도 동작 → Interrupt/FirstMessage 정상")
        else:
            info("server VAD가 text-only modality에서 비활성화됨")
            info("→ TextToVoice/FullAgent에서 Interrupt 처리를 별도로 구현해야 할 수 있음")
            info("→ PRD Section 5.3 Interrupt Handler 행 재검토 필요")

    sys.exit(0 if all_core_pass else 1)


if __name__ == "__main__":
    main()
