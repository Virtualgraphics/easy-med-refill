import React from 'react';
import { Switch, View } from 'react-native';

import { Body, Muted } from './Typography';

interface SwitchRowProps {
  label: string;
  helper?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SwitchRow({ label, helper, value, onValueChange }: SwitchRowProps) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1 gap-0.5">
        <Body className="font-semibold">{label}</Body>
        {helper ? <Muted>{helper}</Muted> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: '#0B5CAB', false: '#D4D4D4' }} thumbColor="#fff" />
    </View>
  );
}
