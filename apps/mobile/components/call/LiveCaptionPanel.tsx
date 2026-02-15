import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  AccessibilityInfo,
} from 'react-native';

type Language = 'en' | 'ko';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'recipient';
  text: string;
  language: Language;
  isTranslation: boolean;
  timestamp: number;
}

interface LiveCaptionPanelProps {
  transcripts: TranscriptEntry[];
  fontSize?: number;
  sourceLanguage: Language;
}

export function LiveCaptionPanel({
  transcripts,
  fontSize = 16,
  sourceLanguage,
}: LiveCaptionPanelProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    if (autoScroll) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [transcripts.length, autoScroll]);

  // Group transcripts by turn (consecutive entries with same role)
  const grouped = groupTranscripts(transcripts);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={() => setAutoScroll(false)}
        onMomentumScrollEnd={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          const isAtBottom =
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
          if (isAtBottom) setAutoScroll(true);
        }}
        accessible
        accessibilityRole="list"
        accessibilityLabel="실시간 자막"
      >
        {grouped.map((group) => (
          <CaptionBubble
            key={group.id}
            role={group.role}
            originalText={group.originalText}
            translatedText={group.translatedText}
            isUser={group.role === 'user'}
            fontSize={fontSize}
          />
        ))}

        {transcripts.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { fontSize }]}>
              통화가 시작되면 자막이 여기에 표시됩니다
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface CaptionBubbleProps {
  role: 'user' | 'recipient';
  originalText: string;
  translatedText?: string;
  isUser: boolean;
  fontSize: number;
}

function CaptionBubble({ role, originalText, translatedText, isUser, fontSize }: CaptionBubbleProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translationFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, []);

  // 2-stage caption: translation fades in 500ms after original
  useEffect(() => {
    if (translatedText) {
      translationFade.setValue(0);
      const timer = setTimeout(() => {
        Animated.timing(translationFade, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [translatedText]);

  const roleLabel = isUser ? '나' : '상대방';

  return (
    <Animated.View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.recipientBubble,
        { opacity: fadeAnim },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${roleLabel}: ${translatedText ?? originalText}`}
    >
      <Text style={[styles.roleLabel, isUser ? styles.userRole : styles.recipientRole]}>
        {roleLabel}
      </Text>
      {translatedText && (
        <Animated.Text style={[styles.translatedText, { fontSize, opacity: translationFade }]}>
          {translatedText}
        </Animated.Text>
      )}
      <Text
        style={[
          styles.originalText,
          { fontSize: translatedText ? fontSize - 2 : fontSize },
          translatedText ? styles.originalSmall : undefined,
        ]}
      >
        {originalText}
      </Text>
    </Animated.View>
  );
}

interface GroupedTranscript {
  id: string;
  role: 'user' | 'recipient';
  originalText: string;
  translatedText?: string;
}

function groupTranscripts(transcripts: TranscriptEntry[]): GroupedTranscript[] {
  const result: GroupedTranscript[] = [];
  const pendingOriginals = new Map<string, GroupedTranscript>();

  for (const entry of transcripts) {
    const key = `${entry.role}-${Math.floor(entry.timestamp / 2000)}`; // Group within 2s window

    if (entry.isTranslation) {
      const existing = pendingOriginals.get(key);
      if (existing) {
        existing.translatedText = (existing.translatedText ?? '') + entry.text;
      }
    } else {
      const existing = pendingOriginals.get(key);
      if (existing) {
        existing.originalText += entry.text;
      } else {
        const group: GroupedTranscript = {
          id: entry.id,
          role: entry.role,
          originalText: entry.text,
        };
        pendingOriginals.set(key, group);
        result.push(group);
      }
    }
  }

  return result;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  bubble: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1e3a5f',
  },
  recipientBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a3e',
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userRole: {
    color: '#64b5f6',
  },
  recipientRole: {
    color: '#81c784',
  },
  translatedText: {
    color: '#ffffff',
    lineHeight: 24,
    marginBottom: 4,
  },
  originalText: {
    color: '#b0b0c0',
    lineHeight: 22,
  },
  originalSmall: {
    color: '#8080a0',
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: '#606080',
    textAlign: 'center',
  },
});
