import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Full width (default) or hug content. */
  compact?: boolean;
}

const container: Record<Variant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  secondary: 'bg-white dark:bg-neutral-900 border border-brand-600 active:bg-brand-50',
  danger: 'bg-status-critical active:opacity-90',
  ghost: 'bg-transparent active:bg-brand-50 dark:active:bg-neutral-800',
};

const label: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-brand-700 dark:text-brand-300',
  danger: 'text-white',
  ghost: 'text-brand-700 dark:text-brand-300',
};

export function Button({ title, onPress, variant = 'primary', disabled, loading, compact }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      onPress={onPress}
      disabled={inactive}
      className={`${container[variant]} ${compact ? 'self-start px-4' : 'px-5'} ${
        inactive ? 'opacity-50' : ''
      } h-12 flex-row items-center justify-center rounded-xl`}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#0B5CAB'} />
      ) : (
        <Text className={`${label[variant]} text-base font-semibold`}>{title}</Text>
      )}
    </Pressable>
  );
}
