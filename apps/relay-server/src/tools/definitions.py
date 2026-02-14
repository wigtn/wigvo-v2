"""Function Calling 도구 정의 (PRD FR-014).

Agent Mode에서 AI가 자율적으로 호출할 수 있는 함수들을 정의한다.
OpenAI Realtime API의 session.update tools 형식을 따른다.

지원 기능:
  - confirm_reservation: 예약 확인 (예약 번호, 날짜, 시간, 이름 추출)
  - search_location: 장소 검색 (장소명, 주소 추출)
  - collect_info: 정보 수집 (이름, 전화번호, 주소 등)
  - end_call: 통화 종료 판정 (성공/실패 + 사유)
"""

from __future__ import annotations

from typing import Any


# OpenAI Realtime API tool 정의 형식
AGENT_MODE_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "confirm_reservation",
        "description": "예약 확인 정보를 기록한다. 수신자가 예약을 확인했을 때 호출한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "reservation_id": {
                    "type": "string",
                    "description": "예약 번호",
                },
                "date": {
                    "type": "string",
                    "description": "예약 날짜 (YYYY-MM-DD)",
                },
                "time": {
                    "type": "string",
                    "description": "예약 시간 (HH:MM)",
                },
                "name": {
                    "type": "string",
                    "description": "예약자 이름",
                },
                "details": {
                    "type": "string",
                    "description": "추가 세부사항",
                },
                "status": {
                    "type": "string",
                    "enum": ["confirmed", "modified", "cancelled", "pending"],
                    "description": "예약 상태",
                },
            },
            "required": ["status"],
        },
    },
    {
        "type": "function",
        "name": "search_location",
        "description": "장소/업체 정보를 기록한다. 수신자가 위치 정보를 알려줬을 때 호출한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "place_name": {
                    "type": "string",
                    "description": "장소/업체 이름",
                },
                "address": {
                    "type": "string",
                    "description": "주소",
                },
                "phone": {
                    "type": "string",
                    "description": "전화번호",
                },
                "hours": {
                    "type": "string",
                    "description": "영업시간",
                },
                "notes": {
                    "type": "string",
                    "description": "기타 정보",
                },
            },
            "required": ["place_name"],
        },
    },
    {
        "type": "function",
        "name": "collect_info",
        "description": "통화 중 수집된 정보를 기록한다. 수신자가 정보를 제공했을 때 호출한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "info_type": {
                    "type": "string",
                    "enum": ["name", "phone", "address", "email", "price", "schedule", "other"],
                    "description": "정보 유형",
                },
                "value": {
                    "type": "string",
                    "description": "수집된 값",
                },
                "context": {
                    "type": "string",
                    "description": "수집 맥락",
                },
            },
            "required": ["info_type", "value"],
        },
    },
    {
        "type": "function",
        "name": "end_call_judgment",
        "description": "통화 목적 달성 여부를 판정한다. 통화가 자연스럽게 마무리될 때 호출한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "result": {
                    "type": "string",
                    "enum": ["success", "partial_success", "failed", "callback_needed"],
                    "description": "통화 결과",
                },
                "reason": {
                    "type": "string",
                    "description": "판정 사유",
                },
                "summary": {
                    "type": "string",
                    "description": "통화 요약",
                },
                "collected_data": {
                    "type": "object",
                    "description": "수집된 전체 데이터",
                },
            },
            "required": ["result", "reason"],
        },
    },
]


def get_tools_for_mode(call_mode: str) -> list[dict[str, Any]]:
    """통화 모드에 따라 사용할 도구 목록을 반환한다.

    Agent Mode에서만 Function Calling을 활성화한다.
    Relay Mode에서는 빈 목록 반환 (번역만 수행).
    """
    if call_mode == "agent":
        return AGENT_MODE_TOOLS
    return []
