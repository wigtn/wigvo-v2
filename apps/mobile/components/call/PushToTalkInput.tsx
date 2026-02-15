import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface PushToTalkInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function PushToTalkInput({
  onSend,
  disabled = false,
  placeholder = '메시지를 입력하세요...',
}: PushToTalkInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(trimmed);
    setText('');
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }) => {
    // Enter to send, Shift+Enter for newline (web only)
    if (e.nativeEvent.key === 'Enter' && Platform.OS === 'web') {
      handleSend();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          placeholderTextColor="#606080"
          multiline
          maxLength={500}
          editable={!disabled}
          accessible
          accessibilityLabel="텍스트 입력"
          accessibilityHint="메시지를 입력하고 전송 버튼을 누르세요"
        />
        <Pressable
          style={[
            styles.sendButton,
            (!text.trim() || disabled) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!text.trim() || disabled}
          accessible
          accessibilityRole="button"
          accessibilityLabel="전송"
          accessibilityState={{ disabled: !text.trim() || disabled }}
          // M-7: 최소 48x48dp 터치 영역
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[
            styles.sendButtonText,
            (!text.trim() || disabled) && styles.sendButtonTextDisabled,
          ]}>
            전송
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 16,
    maxHeight: 100,
    minHeight: 44,
  },
  sendButton: {
    // M-7: 최소 48x48dp
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#2a2a3e',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  sendButtonTextDisabled: {
    color: '#606080',
  },
});
