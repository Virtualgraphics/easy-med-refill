import React from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { Label, Muted } from './Typography';

interface TextFieldProps extends Omit<TextInputProps, 'className'> {
  label: string;
  helper?: string;
  error?: string | null;
}

export function TextField({ label, helper, error, multiline, ...input }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        className={`rounded-xl border bg-white px-4 text-base text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50 ${
          multiline ? 'min-h-24 py-3' : 'h-12'
        } ${error ? 'border-status-critical' : 'border-neutral-300 dark:border-neutral-700'}`}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
        {...input}
      />
      {error ? <Muted className="text-status-critical">{error}</Muted> : helper ? <Muted>{helper}</Muted> : null}
    </View>
  );
}
