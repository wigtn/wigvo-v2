# E2E Test Scenarios — Realtime Relay System v3

## Prerequisites
- Relay Server running locally or on staging
- Twilio test credentials configured
- OpenAI API key set
- Supabase test database configured

---

## Scenario 1: Voice-to-Voice (Relay Mode)

### Setup
- Mode: relay
- CallMode: voice-to-voice
- Source: en, Target: ko

### Steps
1. `POST /relay/calls/start` with en→ko voice-to-voice config
2. Connect WebSocket to returned `relayWsUrl`
3. Verify `call.status: calling` received
4. Wait for Twilio call to connect → `call.status: active`
5. Send audio chunks via `audio.chunk` messages
6. Send `audio.commit` to trigger translation
7. Verify `transcript.user` received (STT result)
8. Verify `transcript.user.translated` received (translated text)
9. Verify recipient receives TTS audio via Twilio
10. Simulate recipient speech → verify `transcript.recipient` and `transcript.recipient.translated`
11. Send `call.end` → verify `call.status: completed`

### Expected
- Bidirectional translation works
- VAD state transitions: SILENT → SPEAKING → COMMITTED → SILENT
- Transcripts saved to DB with bilingual content

---

## Scenario 2: Chat-to-Voice (Agent Mode)

### Setup
- Mode: agent
- CallMode: chat-to-voice
- CollectedData: restaurant reservation

### Steps
1. `POST /relay/calls/start` with agent mode + collectedData
2. Connect WebSocket
3. Wait for call active + first message (AI disclosure)
4. Send `text.send` with "I'd like to confirm my reservation"
5. Verify AI speaks to recipient in Korean (Session A TTS)
6. Recipient responds → verify translated transcript for user
7. Send follow-up text messages
8. Verify Function Calling: `record_call_result` triggers
9. End call → verify result in DB

### Expected
- AI acts autonomously with collected data
- Push-to-Talk text input works
- Function calling records call outcome

---

## Scenario 3: Interrupt Handling

### Steps
1. Start voice-to-voice call
2. User sends audio (speaking)
3. While Session A is generating TTS → recipient starts speaking
4. Verify `response.cancel` sent to Session A
5. Verify `interrupt.detected` sent to client
6. Verify recipient speech is processed by Session B
7. Verify user app shows interrupt banner

### Expected
- Priority: recipient > user > AI
- Session A TTS interrupted cleanly
- No audio overlap on Twilio side

---

## Scenario 4: Session Recovery

### Steps
1. Start voice-to-voice call
2. Simulate Session A WebSocket disconnect
3. Verify `session.recovery: recovering` sent to client
4. Verify reconnection attempt with exponential backoff
5. On success: verify `session.recovery: reconnected` with gap info
6. Verify ring buffer catch-up (missed audio processed)
7. If max retries exceeded: verify degraded mode

### Expected
- Automatic reconnection within 5 attempts
- Ring buffer retains 30s of audio for catch-up
- Recovery events logged in DB

---

## Scenario 5: Guardrail System

### Steps
1. Start call with guardrail enabled
2. Trigger Level 1: send normal polite text → auto-pass
3. Trigger Level 2: send text with informal speech → async correction
4. Trigger Level 3: send text with banned words → sync block
5. Verify Level 3 triggers filler phrase
6. Verify GPT-4o-mini fallback correction
7. Verify guardrail events logged

### Expected
- Level 1: no delay, text passes through
- Level 2: text passes, correction logged in background
- Level 3: text blocked, filler sent, corrected text output
- All events in guardrail_events JSONB

---

## Scenario 6: Call Duration Limits

### Steps
1. Start call
2. Wait for 8-minute warning → verify `call.warning` message
3. Wait for 10-minute auto-end → verify `call.status: completed`
4. Test idle timeout: no activity for 30s → verify warning

### Expected
- Warning at 8 minutes (configurable)
- Auto-end at 10 minutes
- Idle timeout warning at 30s

---

## Scenario 7: Accessibility (M-7)

### Steps (Manual testing on device)
1. Enable screen reader (VoiceOver/TalkBack)
2. Verify all buttons have accessibility labels
3. Verify captions are announced
4. Verify font size slider works (14-28px range)
5. Verify vibration feedback on interrupt
6. Verify all touch targets are 48x48dp minimum

### Expected
- Full screen reader compatibility
- Haptic feedback on key events
- Adjustable font sizes

---

## Scenario 8: Cost Tracking

### Steps
1. Complete a call
2. Check DB for cost_tokens JSONB
3. Verify session_a_input, session_a_output counts
4. Verify session_b_input, session_b_output counts
5. If guardrail triggered: verify guardrail_tokens count

### Expected
- Accurate token counts per session
- Guardrail tokens tracked separately
