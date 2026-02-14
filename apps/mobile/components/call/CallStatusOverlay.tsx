import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type RecoveryStatus = "recovering" | "degraded" | "recovered" | null;

interface CallStatusOverlayProps {
  /** Current recovery status from relay server */
  recoveryStatus: RecoveryStatus;
  /** Message from the server */
  recoveryMessage: string;
}

const STATUS_CONFIG: Record<
  Exclude<RecoveryStatus, null>,
  { color: string; bgColor: string; showSpinner: boolean }
> = {
  recovering: {
    color: "#F59E0B",
    bgColor: "#FFFBEB",
    showSpinner: true,
  },
  degraded: {
    color: "#EF4444",
    bgColor: "#FEF2F2",
    showSpinner: false,
  },
  recovered: {
    color: "#10B981",
    bgColor: "#F0FDF4",
    showSpinner: false,
  },
};

/**
 * Overlay banner showing recovery/degraded state.
 * Appears at the top of the call screen when connection issues are detected.
 *
 * PRD 5.3: Recovery 상태를 사용자에게 시각적으로 알림
 */
export function CallStatusOverlay({
  recoveryStatus,
  recoveryMessage,
}: CallStatusOverlayProps) {
  if (!recoveryStatus) return null;

  const config = STATUS_CONFIG[recoveryStatus];

  // Auto-hide "recovered" after display
  if (recoveryStatus === "recovered" && !recoveryMessage) return null;

  return (
    <View
      style={[styles.container, { backgroundColor: config.bgColor }]}
      accessibilityRole="alert"
      accessibilityLabel={`Connection status: ${recoveryMessage}`}
    >
      {config.showSpinner && (
        <ActivityIndicator size="small" color={config.color} />
      )}
      <View
        style={[styles.dot, { backgroundColor: config.color }]}
      />
      <Text style={[styles.text, { color: config.color }]}>
        {recoveryMessage}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
