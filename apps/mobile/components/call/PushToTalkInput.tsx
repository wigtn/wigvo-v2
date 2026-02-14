import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";

type InputMode = "voice" | "text";

interface PushToTalkInputProps {
  onSendText: (text: string) => void;
  /** Current input mode */
  inputMode?: InputMode;
  /** Whether currently recording (voice mode) */
  isRecording?: boolean;
  /** Toggle recording on/off (voice mode) */
  onToggleRecording?: () => void;
  disabled?: boolean;
}

export function PushToTalkInput({
  onSendText,
  inputMode = "text",
  isRecording = false,
  onToggleRecording,
  disabled = false,
}: PushToTalkInputProps) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    Vibration.vibrate(30);
  };

  const handleToggleRecording = () => {
    if (disabled) return;
    Vibration.vibrate(isRecording ? 30 : 50);
    onToggleRecording?.();
  };

  if (inputMode === "voice") {
    return (
      <View style={styles.container}>
        <Pressable
          style={[
            styles.voiceButton,
            isRecording && styles.voiceButtonRecording,
            disabled && styles.buttonDisabled,
          ]}
          onPress={handleToggleRecording}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? "Stop listening" : "Start listening"}
          accessibilityHint={
            isRecording
              ? "Tap to stop voice recording"
              : "Tap to start voice recording"
          }
        >
          <Text style={styles.voiceButtonText}>
            {isRecording ? "Tap to Stop" : "Tap to Start Listening"}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Text mode (existing behavior)
  return (
    <View style={styles.container}>
      <View style={styles.textRow}>
        <TextInput
          style={[styles.input, disabled && styles.inputDisabled]}
          placeholder="Type your message..."
          placeholderTextColor="#9CA3AF"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!disabled}
          multiline={false}
          accessibilityLabel="Message input"
          accessibilityHint="Type a message to send to the recipient"
        />
        <Pressable
          style={[styles.sendButton, disabled && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={disabled || !text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityHint="Sends your typed message"
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 8,
  },
  textRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    minHeight: 48,
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  sendButton: {
    backgroundColor: "#4F46E5",
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 48,
    minHeight: 48,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  voiceButton: {
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  voiceButtonRecording: {
    backgroundColor: "#EF4444",
  },
  voiceButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
