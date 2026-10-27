import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, TextField } from '@/components/ui';
import { addPack, getMedication, isIsoDate, parseNumber, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';

export default function AddPackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const medication = useDbQuery((d) => getMedication(d, id), [id]);

  const [size, setSize] = useState('');
  const [remaining, setRemaining] = useState('');
  const [remainingTouched, setRemainingTouched] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [batch, setBatch] = useState('');
  const [gtin, setGtin] = useState('');
  const [errors, setErrors] = useState<{ size?: string; remaining?: string; expiry?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (medication.data?.gtin && gtin === '') setGtin(medication.data.gtin);
  }, [medication.data, gtin]);

  const onSizeChange = (v: string) => {
    setSize(v);
    if (!remainingTouched) setRemaining(v);
  };

  const submit = async () => {
    const s = parseNumber(size);
    const r = parseNumber(remaining);
    const next: typeof errors = {};
    if (s === null || s <= 0) next.size = 'Must be greater than 0';
    if (r === null || r < 0 || (s !== null && r > s)) next.remaining = 'Between 0 and the pack size';
    if (expiry.trim() !== '' && !isIsoDate(expiry.trim())) next.expiry = 'Use YYYY-MM-DD';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await addPack(db, {
        medication_id: id,
        units_per_pack: s as number,
        units_remaining: r as number,
        expiry_date: expiry.trim() || null,
        batch: batch.trim() || null,
        gtin: gtin.trim() || null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Card className="gap-4">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Units in pack" value={size} onChangeText={onSizeChange} keyboardType="decimal-pad" placeholder="e.g. 100" error={errors.size} autoFocus />
          </View>
          <View className="flex-1">
            <TextField
              label="Units left"
              value={remaining}
              onChangeText={(v) => {
                setRemaining(v);
                setRemainingTouched(true);
              }}
              keyboardType="decimal-pad"
              error={errors.remaining}
            />
          </View>
        </View>
        <TextField label="Expiry date" value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" error={errors.expiry} />
        <TextField label="Batch" value={batch} onChangeText={setBatch} placeholder="optional" autoCapitalize="characters" />
        <TextField label="GTIN" value={gtin} onChangeText={setGtin} placeholder="optional" keyboardType="number-pad" />
      </Card>
      <Button title="Add pack" onPress={submit} loading={saving} />
    </Screen>
  );
}
