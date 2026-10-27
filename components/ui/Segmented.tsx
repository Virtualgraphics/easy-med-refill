import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Label } from './Typography';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

interface SegmentedProps<V extends string> {
  label?: string;
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
}

/** Simple single-choice chips. Scrolls horizontally when there are many. */
export function Segmented<V extends string>({ label, options, value, onChange }: SegmentedProps<V>) {
  return (
    <View className="gap-1.5">
      {label ? <Label>{label}</Label> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className={`h-10 justify-center rounded-full border px-4 ${
                selected
                  ? 'border-brand-600 bg-brand-600'
                  : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900'
              }`}>
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-neutral-700 dark:text-neutral-200'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
