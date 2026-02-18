"""E2E 통화 테스트 시나리오 정의 및 LLM 프롬프트."""

SCENARIOS: dict[str, dict] = {
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
