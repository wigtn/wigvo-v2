import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
}

interface ChatBubbleProps {
  message: ChatMessage;
  fontSize?: number;
}

export function ChatBubble({ message, fontSize = 15 }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={[styles.systemText, { fontSize: fontSize - 2 }]}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? '나' : 'AI'}: ${message.text}`}
    >
      {!isUser && (
        <Text style={styles.roleLabel}>AI</Text>
      )}
      <Text style={[styles.text, isUser ? styles.userText : styles.assistantText, { fontSize }]}>
        {message.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1e3a5f',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a3e',
    borderBottomLeftRadius: 4,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4a90d9',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  text: {
    lineHeight: 22,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#e0e0f0',
  },
  systemContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  systemText: {
    color: '#606080',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
