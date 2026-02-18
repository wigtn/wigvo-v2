#!/usr/bin/env python3
"""양방향 통화 E2E 테스트 클라이언트.

User(앱) 역할을 시뮬레이션한다:
1. REST API로 통화 시작
2. WebSocket으로 릴레이 서버에 연결
3. 터미널에서 텍스트 입력 → Session A로 전달 (번역 → Twilio → 수신자)
4. 수신자 발화 → Session B 번역 → 터미널에 자막 표시

사용법:
  uv run python scripts/tests/run.py --test call --phone +821012345678 --scenario restaurant
  uv run python scripts/tests/run.py --test call --phone +821012345678 --scenario restaurant --auto
"""

import asyncio
import json
import os
import time

import httpx
import websockets
from dotenv import load_dotenv
from openai import AsyncOpenAI

from scripts.tests.e2e.scenarios import SCENARIOS, LLM_SYSTEM_PROMPT

# .env 로드 (relay-server 루트 기준)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))


def print_colored(text: str, color: str) -> None:
    colors = {
        "green": "\033[92m",
        "blue": "\033[94m",
        "yellow": "\033[93m",
        "red": "\033[91m",
        "cyan": "\033[96m",
        "gray": "\033[90m",
        "bold": "\033[1m",
        "reset": "\033[0m",
    }
    print(f"{colors.get(color, '')}{text}{colors['reset']}")


async def generate_next_utterance(
    openai_client: AsyncOpenAI,
    scenario_goal: str,
    conversation_history: list[dict[str, str]],
) -> str:
    """LLM을 사용하여 대화 맥락에 맞는 다음 발화를 생성한다."""
    messages: list[dict[str, str]] = [
        {"role": "system", "content": LLM_SYSTEM_PROMPT.format(goal=scenario_goal)},
    ]
    for turn in conversation_history:
        if turn["role"] == "user":
            messages.append({"role": "assistant", "content": turn["text"]})
        else:
            messages.append({"role": "user", "content": f"[Recipient says]: {turn['text']}"})

    if not conversation_history or conversation_history[-1]["role"] == "recipient":
        messages.append({"role": "user", "content": "[Your turn to speak. What do you say?]"})

    resp = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=100,
        temperature=0.7,
    )
    return resp.choices[0].message.content.strip().strip('"')


async def run_client(
    server_url: str,
    phone: str,
    scenario_key: str,
    source_lang: str,
    target_lang: str,
    auto_mode: bool = False,
) -> bool:
    scenario = SCENARIOS[scenario_key]
    print_colored(f"\n{'='*60}", "bold")
    print_colored("  WIGVO 양방향 통화 테스트", "bold")
    print_colored(f"  시나리오: {scenario['description']}", "cyan")
    print_colored(f"  수신자: {phone}", "cyan")
    print_colored(f"  번역: {source_lang} \u2192 {target_lang}", "cyan")
    print_colored(f"{'='*60}\n", "bold")

    # 1. REST API로 통화 시작
    call_id = f"test-{scenario_key}-{int(time.time())}"
    api_url = server_url.replace("wss://", "https://").replace("ws://", "http://")

    print_colored("[1/3] 통화 시작 중...", "yellow")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{api_url}/relay/calls/start",
            json={
                "call_id": call_id,
                "phone_number": phone,
                "mode": "relay",
                "source_language": source_lang,
                "target_language": target_lang,
                "vad_mode": "client",
            },
        )
        if resp.status_code != 200:
            print_colored(f"통화 시작 실패: {resp.text}", "red")
            return False

        data = resp.json()
        ws_url = data["relay_ws_url"]
        print_colored(f"  call_id: {call_id}", "gray")
        print_colored(f"  call_sid: {data['call_sid']}", "gray")

    # 2. WebSocket 연결
    print_colored("[2/3] WebSocket 연결 중...", "yellow")
    async with websockets.connect(ws_url) as ws:
        print_colored("[3/3] 연결 완료! 수신자가 전화를 받기를 기다립니다...\n", "green")

        line_index = 0
        call_active = True

        connected_event = asyncio.Event()
        translation_done_event = asyncio.Event()
        recipient_responded_event = asyncio.Event()
        recipient_translated_buffer: list[str] = []

        async def receiver():
            nonlocal call_active
            try:
                async for raw in ws:
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")
                    data = msg.get("data", {})

                    if msg_type == "call_status":
                        status = data.get("status", "")
                        message = data.get("message", "")
                        print_colored(f"  [상태] {status}: {message}", "yellow")
                        if status == "connected":
                            connected_event.set()

                    elif msg_type == "caption":
                        text = data.get("text", "")
                        direction = data.get("direction", "")
                        if direction == "outbound":
                            print_colored(f"  [번역\u2192수신자] {text}", "blue")

                    elif msg_type == "caption.original":
                        text = data.get("text", "")
                        lang = data.get("language", "")
                        print_colored(f"  [수신자 원문] ({lang}) {text}", "gray")

                    elif msg_type == "caption.translated":
                        text = data.get("text", "")
                        print_colored(f"  [수신자\u2192번역] {text}", "green")
                        recipient_translated_buffer.append(text)
                        recipient_responded_event.set()

                    elif msg_type == "translation.state":
                        state = data.get("state", "")
                        if state == "processing":
                            print_colored("  \u23f3 번역 중...", "yellow")
                        elif state == "done":
                            print_colored("  \u2705 번역 완료", "green")
                            translation_done_event.set()

                    elif msg_type == "interrupt_alert":
                        print_colored("  \u26a1 수신자 발화 감지 \u2014 인터럽트", "red")

                    elif msg_type == "recipient_audio":
                        pass

                    elif msg_type == "error":
                        print_colored(f"  [에러] {data.get('message', '')}", "red")

            except websockets.exceptions.ConnectionClosed:
                print_colored("\n연결 종료됨", "yellow")
            finally:
                call_active = False

        recv_task = asyncio.create_task(receiver())
        await asyncio.sleep(1)

        lines = scenario["lines"]
        print_colored("\u2500" * 50, "gray")

        if auto_mode:
            # --- 자동 모드: LLM 기반 동적 대화 ---
            openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
            conversation_history: list[dict[str, str]] = []
            max_turns = 10
            scenario_goal = scenario.get("goal", "Have a natural conversation.")

            print_colored("\U0001f916 자동 모드: LLM이 수신자 응답에 맞춰 동적으로 대화합니다.\n", "cyan")

            # 전화 받을 때까지 대기
            print_colored("  \U0001f4de 수신자가 전화를 받기를 기다리는 중...", "yellow")
            try:
                await asyncio.wait_for(connected_event.wait(), timeout=30)
            except asyncio.TimeoutError:
                print_colored("  30초 내 응답 없음 \u2014 종료", "red")
                recv_task.cancel()
                return False
            print_colored("  \u2705 수신자 연결됨!", "green")

            # AI 인사 TTS 완료 대기
            print_colored("  \U0001f399\ufe0f AI 인사 전송 대기 중...", "yellow")
            try:
                await asyncio.wait_for(translation_done_event.wait(), timeout=10)
            except asyncio.TimeoutError:
                print_colored("  \u26a0\ufe0f AI 인사 타임아웃 \u2014 계속 진행", "yellow")

            # 수신자 응답 대기
            print_colored("  \u23f3 수신자 응답 대기 (최대 5초)...", "yellow")
            try:
                await asyncio.wait_for(recipient_responded_event.wait(), timeout=5)
                print_colored("  \u2705 수신자 응답 감지!", "green")
                await asyncio.sleep(2)
            except asyncio.TimeoutError:
                print_colored("  \u26a0\ufe0f 수신자 응답 없음 \u2014 대화 시작", "yellow")

            if recipient_translated_buffer:
                greeting_text = "".join(recipient_translated_buffer).strip()
                if greeting_text:
                    conversation_history.append({"role": "recipient", "text": greeting_text})
                    print_colored(f'  \U0001f4dd 수신자 인사: "{greeting_text}"', "gray")
                recipient_translated_buffer.clear()

            # LLM 기반 대화 루프
            for turn_num in range(1, max_turns + 1):
                if not call_active:
                    break

                translation_done_event.clear()
                recipient_responded_event.clear()
                recipient_translated_buffer.clear()

                print_colored(f"\n  \U0001f9e0 LLM 응답 생성 중... (턴 {turn_num}/{max_turns})", "cyan")
                next_line = await generate_next_utterance(
                    openai_client, scenario_goal, conversation_history
                )
                conversation_history.append({"role": "user", "text": next_line})

                print_colored(f'\n[{turn_num}] \u2192 "{next_line}"', "bold")
                await ws.send(json.dumps({
                    "type": "text_input",
                    "data": {"text": next_line},
                }))

                is_goodbye = any(w in next_line.lower() for w in ["goodbye", "bye", "thank you and goodbye"])

                try:
                    await asyncio.wait_for(translation_done_event.wait(), timeout=10)
                except asyncio.TimeoutError:
                    print_colored("  \u26a0\ufe0f 번역 타임아웃", "yellow")

                if is_goodbye:
                    print_colored("\n\u2705 대화 종료. 5초 후 전화를 끊습니다...", "yellow")
                    await asyncio.sleep(5)
                    break

                try:
                    await asyncio.wait_for(recipient_responded_event.wait(), timeout=10)
                    print_colored("  \U0001f4dd 수신자 응답 수신", "gray")
                    await asyncio.sleep(3)
                except asyncio.TimeoutError:
                    print_colored("  \u23ed\ufe0f 수신자 응답 없음 \u2014 계속 진행", "gray")

                if recipient_translated_buffer:
                    recipient_text = "".join(recipient_translated_buffer).strip()
                    if recipient_text:
                        conversation_history.append({"role": "recipient", "text": recipient_text})
                        print_colored(f'  \U0001f4dd 수신자: "{recipient_text}"', "gray")
                    recipient_translated_buffer.clear()
            else:
                print_colored(f"\n\u2705 최대 턴({max_turns}) 도달. 5초 후 종료합니다...", "yellow")
                await asyncio.sleep(5)

        else:
            # --- 수동 모드 ---
            if lines:
                print_colored("시나리오 대사가 준비되어 있습니다.", "cyan")
                print_colored("Enter = 다음 대사 전송 | 직접 입력도 가능 | 'q' = 종료\n", "cyan")
            else:
                print_colored("자유 대화 모드: 영어로 입력하면 번역되어 수신자에게 전달됩니다.", "cyan")
                print_colored("'q' = 종료\n", "cyan")

            try:
                while call_active:
                    if lines and line_index < len(lines):
                        next_line = lines[line_index]
                        prompt = f"[{line_index+1}/{len(lines)}] \033[90m({next_line[:40]}...)\033[0m > "
                    else:
                        prompt = "User > "

                    loop = asyncio.get_event_loop()
                    try:
                        user_input = await asyncio.wait_for(
                            loop.run_in_executor(None, lambda: input(prompt)),
                            timeout=120,
                        )
                    except asyncio.TimeoutError:
                        print_colored("입력 타임아웃", "yellow")
                        break
                    except EOFError:
                        break

                    if user_input.lower() == "q":
                        break

                    if not user_input and lines and line_index < len(lines):
                        user_input = lines[line_index]
                        line_index += 1

                    if not user_input:
                        continue

                    print_colored(f'  \u2192 전송: "{user_input}"', "bold")

                    await ws.send(json.dumps({
                        "type": "text_input",
                        "data": {"text": user_input},
                    }))

            except KeyboardInterrupt:
                print_colored("\n중단됨", "yellow")

        # 통화 종료
        print_colored("\n통화 종료 중...", "yellow")
        try:
            await ws.send(json.dumps({"type": "end_call", "data": {}}))
        except Exception:
            pass

        recv_task.cancel()
        try:
            await recv_task
        except asyncio.CancelledError:
            pass

    # REST로도 종료
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{api_url}/relay/calls/{call_id}/end",
                json={"call_id": call_id, "reason": "test_complete"},
            )
    except Exception:
        pass

    print_colored("\n통화 종료 완료!", "green")
    return True
