import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

interface ScreenProps {
  children: React.ReactNode;
  /** Scrollable with padding; use for forms and detail pages. */
  scroll?: boolean;
}

export function Screen({ children, scroll = false }: ScreenProps) {
  if (!scroll) {
    return <View className="flex-1 bg-accent-50 dark:bg-neutral-950">{children}</View>;
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <ScrollView
        className="flex-1 bg-accent-50 dark:bg-neutral-950"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
