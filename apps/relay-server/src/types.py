from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


# --- Enums ---


class CallMode(str, Enum):
    RELAY = "relay"
    AGENT = "agent"


class CallStatus(str, Enum):
    PENDING = "pending"
    CALLING = "calling"
    CONNECTED = "connected"
    ENDED = "ended"
    FAILED = "failed"


class VadMode(str, Enum):
    CLIENT = "client"
    SERVER = "server"
    PUSH_TO_TALK = "push_to_talk"


# --- Request / Response ---


class CallStartRequest(BaseModel):
    call_id: str
    phone_number: str
    mode: CallMode = CallMode.RELAY
    source_language: str = "en"
    target_language: str = "ko"
    collected_data: dict[str, Any] | None = None
    vad_mode: VadMode = VadMode.CLIENT


class CallStartResponse(BaseModel):
    call_id: str
    call_sid: str
    relay_ws_url: str
    session_ids: dict[str, str]


class CallEndRequest(BaseModel):
    call_id: str
    reason: str = "user_hangup"


# --- WebSocket Messages (App ↔ Relay Server) ---


class WsMessageType(str, Enum):
    # App → Relay
    AUDIO_CHUNK = "audio_chunk"
    TEXT_INPUT = "text_input"
    VAD_STATE = "vad_state"
    END_CALL = "end_call"

    # Relay → App
    CAPTION = "caption"
    RECIPIENT_AUDIO = "recipient_audio"
    CALL_STATUS = "call_status"
    INTERRUPT_ALERT = "interrupt_alert"
    ERROR = "error"


class WsMessage(BaseModel):
    type: WsMessageType
    data: dict[str, Any] = {}


# --- Session Config ---


class SessionConfig(BaseModel):
    session_id: str = ""
    mode: CallMode = CallMode.RELAY
    source_language: str = "en"
    target_language: str = "ko"
    input_audio_format: str = "pcm16"
    output_audio_format: str = "g711_ulaw"
    vad_mode: VadMode = VadMode.SERVER


# --- Twilio Media Stream Events ---


class TwilioMediaEvent(BaseModel):
    event: str
    stream_sid: str | None = None
    sequence_number: str | None = None
    media: dict[str, str] | None = None  # {"payload": base64, "track": "inbound"}
    start: dict[str, Any] | None = None
    stop: dict[str, Any] | None = None


# --- Active Call State ---


class ActiveCall(BaseModel):
    call_id: str
    call_sid: str = ""
    mode: CallMode = CallMode.RELAY
    source_language: str = "en"
    target_language: str = "ko"
    status: CallStatus = CallStatus.PENDING
    stream_sid: str = ""
    session_a_id: str = ""
    session_b_id: str = ""
    collected_data: dict[str, Any] = {}
    started_at: float = 0.0
    first_message_sent: bool = False
