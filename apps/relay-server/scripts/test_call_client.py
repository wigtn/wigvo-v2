#!/usr/bin/env python3
"""양방향 통화 테스트 클라이언트.

User(앱) 역할을 시뮬레이션한다:
1. REST API로 통화 시작
2. WebSocket으로 릴레이 서버에 연결
3. 터미널에서 텍스트 입력 → Session A로 전달 (번역 → Twilio → 수신자)
4. 수신자 발화 → Session B 번역 → 터미널에 자막 표시

사용법:
  uv run python scripts/test_call_client.py --phone +821092659103 --scenario restaurant
  uv run python scripts/test_call_client.py --phone +821092659103 --scenario restaurant --auto  # LLM 자동 대화
"""

import argparse
import asyncio
import json
import os
import sys
import time

import httpx
import websockets
from dotenv import load_dotenv
from openai import AsyncOpenAI

# .env 로드 (relay-server 루트 기준)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# --- 시나리오 정의 ---

SCENARIOS = {
    "restaurant": {
        "description": "식당 예약 전화",
        "target_name": "맛있는 식당",
        "goal": (
            "You are calling a Korean restaurant to make a dinner reservation. "
            "Your goal: reserve a table for 2 people tonight around 7 PM. "
            "Your name is Kim. You prefer a window seat if available. "
            "Be flexible — if they suggest alternatives, consider them."
        ),
        "lines": [
            "Hello, I'd like to make a reservation for dinner tonight.",
            "For two people, around 7 PM please.",
            "My name is Kim. K-I-M.",
            "Do you have any window seats available?",
            "That sounds perfect. Thank you very much!",
            "Goodbye.",
        ],
    },
    "hospital": {
        "description": "병원 예약 전화",
        "target_name": "서울 병원",
        "goal": (
            "You are calling a hospital to schedule an appointment. "
            "You've been having headaches for the past week. "
            "You prefer Friday afternoon. Your name is Kim, born January 15, 1990."
        ),
        "lines": [
            "Hello, I'd like to schedule an appointment.",
            "I've been having headaches for the past week.",
            "Is there availability this Friday afternoon?",
            "My name is Kim, date of birth January 15, 1990.",
            "Thank you, I'll be there at 2 PM.",
            "Goodbye.",
        ],
    },
    "delivery": {
        "description": "배달 문의 전화",
        "target_name": "배달 업체",
        "goal": (
            "You are calling about a delivery order #12345. "
            "It was supposed to arrive an hour ago. "
            "You want to check the status and estimated arrival time."
        ),
        "lines": [
            "Hi, I'm calling about my delivery order.",
            "The order number is 12345.",
            "It was supposed to arrive an hour ago. Is there an update?",
            "Can you check the current location of the driver?",
            "Okay, thank you for checking.",
            "Goodbye.",
        ],
    },
    "free": {
        "description": "자유 대화 (직접 입력)",
        "target_name": "상대방",
        "goal": "Free conversation.",
        "lines": [],
    },
}


# --- LLM 기반 자동 응답 ---

LLM_SYSTEM_PROMPT = """\
You are simulating a phone caller who speaks English.
You are calling through an AI translation service — your words will be translated and spoken to the recipient.

{goal}

Rules:
- Respond with ONE short sentence at a time (like a real phone call).
- React naturally to what the recipient says. If they say something is unavailable, ask about alternatives.
- Do NOT repeat or paraphrase what the recipient just said.
- Do NOT ask for confirmation of things the recipient already confirmed or is already doing.
- Do NOT ask unnecessary questions. If the recipient is handling things, just answer what they ask.
- When the recipient asks for your information (name, number, etc.), just give it directly.
- When the conversation goal is achieved, say "Goodbye." to end the call.
- Keep responses minimal and direct — avoid filler words and redundant confirmations.
- Respond ONLY with the sentence to say. No quotes, no explanations."""


async def generate_next_utterance(
    openai_client: AsyncOpenAI,
    scenario_goal: str,
    conversation_history: list[dict[str, str]],
) -> str:
    """LLM을 사용하여 대화 맥락에 맞는 다음 발화를 생성한다."""
    messages = [
        {"role": "system", "content": LLM_SYSTEM_PROMPT.format(goal=scenario_goal)},
    ]
    for turn in conversation_history:
        if turn["role"] == "user":
            messages.append({"role": "assistant", "content": turn["text"]})
        else:
            messages.append({"role": "user", "content": f"[Recipient says]: {turn['text']}"})

    # 대화 시작 시 첫 발화 요청
    if not conversation_history or conversation_history[-1]["role"] == "recipient":
        messages.append({"role": "user", "content": "[Your turn to speak. What do you say?]"})

    resp = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=100,
        temperature=0.7,
    )
    return resp.choices[0].message.content.strip().strip('"')


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


async def run_client(
    server_url: str,
    phone: str,
    scenario_key: str,
    source_lang: str,
    target_lang: str,
    auto_mode: bool = False,
):
    scenario = SCENARIOS[scenario_key]
    print_colored(f"\n{'='*60}", "bold")
    print_colored(f"  WIGVO 양방향 통화 테스트", "bold")
    print_colored(f"  시나리오: {scenario['description']}", "cyan")
    print_colored(f"  수신자: {phone}", "cyan")
    print_colored(f"  번역: {source_lang} → {target_lang}", "cyan")
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
            return

        data = resp.json()
        ws_url = data["relay_ws_url"]
        print_colored(f"  call_id: {call_id}", "gray")
        print_colored(f"  call_sid: {data['call_sid']}", "gray")

    # 2. WebSocket 연결
    print_colored("[2/3] WebSocket 연결 중...", "yellow")
    async with websockets.connect(ws_url) as ws:
        print_colored("[3/3] 연결 완료! 수신자가 전화를 받기를 기다립니다...\n", "green")

        # 수신 태스크
        line_index = 0
        call_active = True

        # 이벤트 기반 대기
        connected_event = asyncio.Event()
        translation_done_event = asyncio.Event()  # 매 턴마다 리셋
        recipient_responded_event = asyncio.Event()  # 수신자 응답 감지

        # 수신자 번역 텍스트 누적 (스트리밍 델타 → 전체 문장)
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
                        role = data.get("role", "")
                        text = data.get("text", "")
                        direction = data.get("direction", "")
                        if direction == "outbound":
                            print_colored(f"  [번역→수신자] {text}", "blue")

                    elif msg_type == "caption.original":
                        text = data.get("text", "")
                        lang = data.get("language", "")
                        print_colored(f"  [수신자 원문] ({lang}) {text}", "gray")

                    elif msg_type == "caption.translated":
                        text = data.get("text", "")
                        print_colored(f"  [수신자→번역] {text}", "green")
                        recipient_translated_buffer.append(text)
                        recipient_responded_event.set()

                    elif msg_type == "translation.state":
                        state = data.get("state", "")
                        if state == "processing":
                            print_colored("  ⏳ 번역 중...", "yellow")
                        elif state == "done":
                            print_colored("  ✅ 번역 완료", "green")
                            translation_done_event.set()

                    elif msg_type == "interrupt_alert":
                        print_colored("  ⚡ 수신자 발화 감지 — 인터럽트", "red")

                    elif msg_type == "recipient_audio":
                        pass

                    elif msg_type == "error":
                        print_colored(f"  [에러] {data.get('message', '')}", "red")

            except websockets.exceptions.ConnectionClosed:
                print_colored("\n연결 종료됨", "yellow")
            finally:
                call_active = False

        recv_task = asyncio.create_task(receiver())

        # 3. 사용자 입력 루프
        await asyncio.sleep(1)

        lines = scenario["lines"]
        print_colored("─" * 50, "gray")

        if auto_mode:
            # --- 자동 모드: LLM 기반 동적 대화 ---
            openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
            conversation_history: list[dict[str, str]] = []
            max_turns = 10
            scenario_goal = scenario.get("goal", "Have a natural conversation.")

            print_colored("🤖 자동 모드: LLM이 수신자 응답에 맞춰 동적으로 대화합니다.\n", "cyan")

            # 1단계: 전화 받을 때까지 대기
            print_colored("  📞 수신자가 전화를 받기를 기다리는 중...", "yellow")
            try:
                await asyncio.wait_for(connected_event.wait(), timeout=30)
            except asyncio.TimeoutError:
                print_colored("  30초 내 응답 없음 — 종료", "red")
                recv_task.cancel()
                return
            print_colored("  ✅ 수신자 연결됨!", "green")

            # 2단계: AI 인사 TTS 완료 대기
            print_colored("  🎙️ AI 인사 전송 대기 중...", "yellow")
            try:
                await asyncio.wait_for(translation_done_event.wait(), timeout=10)
            except asyncio.TimeoutError:
                print_colored("  ⚠️ AI 인사 타임아웃 — 계속 진행", "yellow")

            # 수신자가 인사를 듣고 응답할 시간
            print_colored("  ⏳ 수신자 응답 대기 (최대 5초)...", "yellow")
            try:
                await asyncio.wait_for(recipient_responded_event.wait(), timeout=5)
                print_colored("  ✅ 수신자 응답 감지!", "green")
                await asyncio.sleep(2)  # 응답 완전히 수신
            except asyncio.TimeoutError:
                print_colored("  ⚠️ 수신자 응답 없음 — 대화 시작", "yellow")

            # 수신자 인사 수집
            if recipient_translated_buffer:
                greeting_text = "".join(recipient_translated_buffer).strip()
                if greeting_text:
                    conversation_history.append({"role": "recipient", "text": greeting_text})
                    print_colored(f"  📝 수신자 인사: \"{greeting_text}\"", "gray")
                recipient_translated_buffer.clear()

            # 3단계: LLM 기반 대화 루프
            for turn_num in range(1, max_turns + 1):
                if not call_active:
                    break

                # 이벤트 리셋
                translation_done_event.clear()
                recipient_responded_event.clear()
                recipient_translated_buffer.clear()

                # LLM으로 다음 발화 생성
                print_colored(f"\n  🧠 LLM 응답 생성 중... (턴 {turn_num}/{max_turns})", "cyan")
                next_line = await generate_next_utterance(
                    openai_client, scenario_goal, conversation_history
                )
                conversation_history.append({"role": "user", "text": next_line})

                print_colored(f"\n[{turn_num}] → \"{next_line}\"", "bold")
                await ws.send(json.dumps({
                    "type": "text_input",
                    "data": {"text": next_line},
                }))

                # "Goodbye" 감지 시 마지막 턴
                is_goodbye = any(w in next_line.lower() for w in ["goodbye", "bye", "thank you and goodbye"])

                # 번역 TTS 완료 대기
                try:
                    await asyncio.wait_for(translation_done_event.wait(), timeout=10)
                except asyncio.TimeoutError:
                    print_colored("  ⚠️ 번역 타임아웃", "yellow")

                if is_goodbye:
                    print_colored("\n✅ 대화 종료. 5초 후 전화를 끊습니다...", "yellow")
                    await asyncio.sleep(5)
                    break

                # 수신자 응답 대기 (최대 10초)
                try:
                    await asyncio.wait_for(recipient_responded_event.wait(), timeout=10)
                    print_colored("  📝 수신자 응답 수신", "gray")
                    await asyncio.sleep(3)  # 응답 완전히 수신될 여유
                except asyncio.TimeoutError:
                    print_colored("  ⏭️ 수신자 응답 없음 — 계속 진행", "gray")

                # 수신자 번역 수집
                if recipient_translated_buffer:
                    recipient_text = "".join(recipient_translated_buffer).strip()
                    if recipient_text:
                        conversation_history.append({"role": "recipient", "text": recipient_text})
                        print_colored(f"  📝 수신자: \"{recipient_text}\"", "gray")
                    recipient_translated_buffer.clear()
            else:
                print_colored(f"\n✅ 최대 턴({max_turns}) 도달. 5초 후 종료합니다...", "yellow")
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

                    print_colored(f"  → 전송: \"{user_input}\"", "bold")

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


def main():
    parser = argparse.ArgumentParser(description="WIGVO 양방향 통화 테스트 클라이언트")
    parser.add_argument("--phone", required=True, help="수신자 전화번호 (E.164)")
    parser.add_argument(
        "--scenario",
        choices=list(SCENARIOS.keys()),
        default="restaurant",
        help="테스트 시나리오",
    )
    parser.add_argument("--server", default="https://eileen-unrationalizing-crystle.ngrok-free.dev", help="릴레이 서버 URL")
    parser.add_argument("--source", default="en", help="User 언어")
    parser.add_argument("--target", default="ko", help="수신자 언어")
    parser.add_argument("--auto", action="store_true", help="자동 모드 (LLM이 수신자 응답에 맞춰 동적 대화)")
    args = parser.parse_args()

    asyncio.run(run_client(
        server_url=args.server,
        phone=args.phone,
        scenario_key=args.scenario,
        source_lang=args.source,
        target_lang=args.target,
        auto_mode=args.auto,
    ))


if __name__ == "__main__":
    main()
