import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Muted } from './Typography';

interface CollapsibleProps {
  title: string;
  /** One line shown while collapsed; keeps the key fact visible. */
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  /** Optional action shown on the right when expanded, e.g. "Add". */
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}

/** A card that shows a summary line and expands on tap. */
export function Collapsible({ title, summary, expanded, onToggle, action, children }: CollapsibleProps) {
  return (
    <View className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        className="flex-row items-center gap-3 px-4 py-3 active:bg-brand-50 dark:active:bg-neutral-800"
        style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: expanded ? 0 : 16, borderBottomRightRadius: expanded ? 0 : 16 }}>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{title}</Text>
          <Muted numberOfLines={expanded ? undefined : 1}>{summary}</Muted>
        </View>
        {expanded && action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8} className="px-1">
            <Text className="text-base font-semibold text-brand-700 dark:text-brand-300">{action.label}</Text>
          </Pressable>
        ) : null}
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#737373" />
      </Pressable>
      {expanded ? <View className="gap-3 border-t border-neutral-100 px-4 pb-4 pt-3 dark:border-neutral-800">{children}</View> : null}
    </View>
  );
}
