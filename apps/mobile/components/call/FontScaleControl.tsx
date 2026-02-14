import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface FontScaleControlProps {
  /** Current font scale value */
  fontScale: number;
  /** Called when font scale changes */
  onFontScaleChange: (scale: number) => void;
}

const SCALES = [
  { label: "A", value: 1.0 },
  { label: "A+", value: 1.5 },
  { label: "A++", value: 2.0 },
] as const;

/**
 * Accessibility font scale control (PRD M-7).
 * Allows users to adjust caption font size.
 */
export function FontScaleControl({
  fontScale,
  onFontScaleChange,
}: FontScaleControlProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Font</Text>
      <View style={styles.buttons}>
        {SCALES.map((scale) => (
          <Pressable
            key={scale.value}
            style={[
              styles.button,
              fontScale === scale.value && styles.buttonActive,
            ]}
            onPress={() => onFontScaleChange(scale.value)}
            accessibilityRole="button"
            accessibilityLabel={`Font size ${scale.label}`}
            accessibilityState={{ selected: fontScale === scale.value }}
          >
            <Text
              style={[
                styles.buttonText,
                fontScale === scale.value && styles.buttonTextActive,
              ]}
            >
              {scale.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  buttons: {
    flexDirection: "row",
    gap: 4,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: 36,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonActive: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  buttonTextActive: {
    color: "#fff",
  },
});
