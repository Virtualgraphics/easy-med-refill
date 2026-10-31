import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Heading } from './Typography';

interface SectionProps {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}

export function Section({ title, action, children }: SectionProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Heading className="flex-1">{title}</Heading>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
            <Text className="text-base font-semibold text-brand-700 dark:text-brand-300">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
