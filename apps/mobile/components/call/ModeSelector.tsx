import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type InputMode = "voice" | "text";

interface ModeSelectorProps {
  /** Current input mode */
  mode: InputMode;
  /** Called when mode changes */
  onModeChange: (mode: InputMode) => void;
  /** Whether mode switching is disabled */
  disabled?: boolean;
}

export function ModeSelector({ mode, onModeChange, disabled = false }: ModeSelectorProps) {
  return (
    <View style={styles.container}>
      <Pressable
        style={[
          styles.button,
          mode === "voice" && styles.buttonActive,
          disabled && styles.buttonDisabled,
        ]}
        onPress={() => onModeChange("voice")}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Voice mode"
        accessibilityState={{ selected: mode === "voice" }}
      >
        <Text style={[styles.buttonText, mode === "voice" && styles.buttonTextActive]}>
          Voice
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.button,
          mode === "text" && styles.buttonActive,
          disabled && styles.buttonDisabled,
        ]}
        onPress={() => onModeChange("text")}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Text mode"
        accessibilityState={{ selected: mode === "text" }}
      >
        <Text style={[styles.buttonText, mode === "text" && styles.buttonTextActive]}>
          Text
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  buttonActive: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  buttonTextActive: {
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
