import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CaptionData } from "../../lib/types";

export interface CaptionEntry {
  id: string;
  text: string;
  speaker: "user" | "recipient";
  language: string;
  isFinal: boolean;
  timestamp: number;
  /** Caption stage: 1 = original STT, 2 = translated */
  stage?: 1 | 2;
}

interface LiveCaptionPanelProps {
  /** Current font scale multiplier (1.0 = normal, 1.5 = large, 2.0 = extra large) */
  fontScale: number;
}

/** Ref handle for external caption control */
export interface LiveCaptionPanelHandle {
  addCaption: (data: CaptionData) => void;
  clear: () => void;
}

/**
 * Realtime caption display panel.
 * Renders user and recipient captions as chat bubbles with auto-scroll.
 */
export const LiveCaptionPanel = React.forwardRef<LiveCaptionPanelHandle, LiveCaptionPanelProps>(
  function LiveCaptionPanel({ fontScale }, ref) {
    const [captions, setCaptions] = useState<CaptionEntry[]>([]);
    const flatListRef = useRef<FlatList<CaptionEntry>>(null);

    const addCaption = useCallback((data: CaptionData) => {
      setCaptions((prev) => {
        const now = Date.now();
        // If this is an interim update, replace the last interim for the same speaker
        if (!data.isFinal) {
          const interimId = `interim_${data.speaker}`;
          const lastIdx = prev.findLastIndex(
            (c) => c.id === interimId
          );
          if (lastIdx >= 0) {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              text: data.text,
              timestamp: now,
            };
            return updated;
          }
          return [
            ...prev,
            {
              id: interimId,
              text: data.text,
              speaker: data.speaker,
              language: data.language,
              isFinal: false,
              timestamp: now,
            },
          ];
        }

        // Final caption — remove any existing interim for this speaker and add final
        const filtered = prev.filter((c) => c.id !== `interim_${data.speaker}`);
        return [
          ...filtered,
          {
            id: `final_${data.speaker}_${now}`,
            text: data.text,
            speaker: data.speaker,
            language: data.language,
            isFinal: true,
            timestamp: now,
          },
        ];
      });
    }, []);

    const clear = useCallback(() => {
      setCaptions([]);
    }, []);

    React.useImperativeHandle(ref, () => ({ addCaption, clear }), [addCaption, clear]);

    // Auto-scroll to bottom on new captions
    useEffect(() => {
      if (captions.length > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    }, [captions.length]);

    const baseFontSize = 15;
    const scaledFont = baseFontSize * fontScale;
    const scaledSpeaker = 11 * fontScale;

    const renderItem = useCallback(
      ({ item }: { item: CaptionEntry }) => {
        const isOriginal = item.stage === 1;
        const speakerLabel = item.speaker === "user" ? "You" : "Recipient";
        const stageLabel = isOriginal ? " (original)" : item.stage === 2 ? " (translated)" : "";

        return (
          <View
            style={[
              styles.bubble,
              item.speaker === "user" ? styles.userBubble : styles.recipientBubble,
              isOriginal && styles.originalBubble,
              !item.isFinal && styles.interimBubble,
            ]}
            accessible
            accessibilityLabel={`${speakerLabel}${stageLabel}: ${item.text}`}
            accessibilityRole="text"
          >
            <Text style={[styles.speaker, { fontSize: scaledSpeaker }]}>
              {speakerLabel}
              {stageLabel ? (
                <Text style={styles.stageLabel}>{stageLabel}</Text>
              ) : null}
            </Text>
            <Text
              style={[
                styles.captionText,
                { fontSize: scaledFont, lineHeight: scaledFont * 1.4 },
                isOriginal && styles.originalText,
                !item.isFinal && styles.interimText,
              ]}
            >
              {item.text}
            </Text>
          </View>
        );
      },
      [scaledFont, scaledSpeaker]
    );

    const keyExtractor = useCallback((item: CaptionEntry) => item.id, []);

    return (
      <View style={styles.container}>
        {captions.length === 0 ? (
          <Text style={styles.placeholder}>Captions will appear here...</Text>
        ) : (
          <FlatList
            ref={flatListRef}
            data={captions}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  placeholder: {
    textAlign: "center",
    color: "#9CA3AF",
    marginTop: 60,
    fontSize: 15,
  },
  bubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    maxWidth: "85%",
  },
  userBubble: {
    backgroundColor: "#EEF2FF",
    alignSelf: "flex-end",
  },
  recipientBubble: {
    backgroundColor: "#F0FDF4",
    alignSelf: "flex-start",
  },
  originalBubble: {
    backgroundColor: "#F3F4F6",
    borderLeftWidth: 3,
    borderLeftColor: "#9CA3AF",
  },
  interimBubble: {
    opacity: 0.7,
  },
  speaker: {
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 2,
  },
  stageLabel: {
    fontWeight: "400",
    fontSize: 10,
    color: "#9CA3AF",
  },
  captionText: {
    color: "#111827",
  },
  originalText: {
    color: "#6B7280",
  },
  interimText: {
    fontStyle: "italic",
  },
});
