import React from 'react';
import { Text, type TextProps } from 'react-native';

type Props = TextProps & { className?: string };

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

export function Title({ className, ...props }: Props) {
  return <Text className={join('text-2xl font-bold text-neutral-900 dark:text-neutral-50', className)} {...props} />;
}

export function Heading({ className, ...props }: Props) {
  return <Text className={join('text-lg font-semibold text-neutral-900 dark:text-neutral-50', className)} {...props} />;
}

export function Body({ className, ...props }: Props) {
  return <Text className={join('text-base text-neutral-900 dark:text-neutral-100', className)} {...props} />;
}

export function Muted({ className, ...props }: Props) {
  return <Text className={join('text-sm text-neutral-500 dark:text-neutral-400', className)} {...props} />;
}

export function Label({ className, ...props }: Props) {
  return (
    <Text
      className={join('text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400', className)}
      {...props}
    />
  );
}
