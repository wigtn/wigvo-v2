import React from "react";
import { StyleSheet, Text, View } from "react-native";

type VadState = "silent" | "speaking" | "committed";

interface VadIndicatorProps {
  /** Current VAD state */
  vadState: VadState;
  /** Current RMS energy level (0-1) */
  energyLevel: number;
  /** Whether recording is active */
  isRecording: boolean;
}

const STATE_CONFIG: Record<VadState, { color: string; label: string; icon: string }> = {
  silent: { color: "#6B7280", label: "Listening...", icon: "🎤" },
  speaking: { color: "#10B981", label: "Speaking", icon: "🔊" },
  committed: { color: "#3B82F6", label: "Processing...", icon: "⏳" },
};

export function VadIndicator({ vadState, energyLevel, isRecording }: VadIndicatorProps) {
  if (!isRecording) return null;

  const config = STATE_CONFIG[vadState];
  // Clamp energy bar width between 5% and 100%
  const barWidth = Math.max(5, Math.min(100, energyLevel * 100 * 15));

  return (
    <View style={styles.container} accessibilityLabel={`Voice detection: ${config.label}`}>
      <View style={styles.row}>
        <Text style={[styles.icon, { opacity: vadState === "silent" ? 0.5 : 1 }]}>
          {config.icon}
        </Text>
        <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
      </View>
      <View style={styles.barContainer}>
        <View
          style={[
            styles.bar,
            {
              width: `${barWidth}%`,
              backgroundColor: config.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  icon: {
    fontSize: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  barContainer: {
    height: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 2,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 2,
    minWidth: 4,
  },
});
