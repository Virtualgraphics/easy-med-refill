import React from 'react';
import { Pressable, View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

export function Card({ children, onPress, className = '' }: CardProps) {
  const classes = `rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className}`;
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} className={`${classes} active:bg-brand-50 dark:active:bg-neutral-800`}>
        {children}
      </Pressable>
    );
  }
  return <View className={classes}>{children}</View>;
}
