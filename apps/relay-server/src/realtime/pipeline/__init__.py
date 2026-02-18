"""Pipeline 모듈 — CommunicationMode별 오디오 흐름 전략.

Mode → Pipeline 매핑:
  VOICE_TO_VOICE → VoiceToVoicePipeline
  VOICE_TO_TEXT  → VoiceToVoicePipeline(suppress_b_audio=True)
  TEXT_TO_VOICE  → TextToVoicePipeline
  FULL_AGENT     → FullAgentPipeline
"""
