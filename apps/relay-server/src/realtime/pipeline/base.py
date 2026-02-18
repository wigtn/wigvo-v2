"""BasePipeline ABC — 모든 파이프라인의 공통 인터페이스.

AudioRouter가 CommunicationMode에 따라 적절한 Pipeline 구현체에 위임한다.
"""

from abc import ABC, abstractmethod

from src.types import ActiveCall


class BasePipeline(ABC):
    """파이프라인 공통 인터페이스 (Strategy 패턴).

    모든 파이프라인은 동일한 메서드 시그니처를 제공하여
    AudioRouter가 모드에 상관없이 동일한 인터페이스로 호출할 수 있다.
    """

    def __init__(self, call: ActiveCall):
        self.call = call

    @abstractmethod
    async def start(self) -> None:
        """파이프라인을 시작한다."""

    @abstractmethod
    async def stop(self) -> None:
        """파이프라인을 중지하고 리소스를 정리한다."""

    @abstractmethod
    async def handle_user_audio(self, audio_b64: str) -> None:
        """User 앱에서 받은 오디오를 처리한다."""

    @abstractmethod
    async def handle_user_audio_commit(self) -> None:
        """Client VAD 발화 종료 → 오디오 커밋."""

    @abstractmethod
    async def handle_user_text(self, text: str) -> None:
        """User 텍스트 입력을 처리한다."""

    @abstractmethod
    async def handle_twilio_audio(self, audio_bytes: bytes) -> None:
        """Twilio에서 받은 수신자 오디오를 처리한다."""
