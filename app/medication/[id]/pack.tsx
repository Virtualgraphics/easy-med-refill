import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Muted, Screen, TextField } from '@/components/ui';
import { addPack, getMedication, isIsoDate, parseNumber, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';

export default function AddPackScreen() {
  const params = useLocalSearchParams<{ id: string; gtin?: string; batch?: string; expiry?: string }>();
  const { id } = params;
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
  const medication = useDbQuery((d) => getMedication(d, id), [id]);

  const [size, setSize] = useState('');
  const [remaining, setRemaining] = useState('');
  const [remainingTouched, setRemainingTouched] = useState(false);
  const [expiry, setExpiry] = useState(params.expiry ?? '');
  const [batch, setBatch] = useState(params.batch ?? '');
  const [gtin, setGtin] = useState(params.gtin ?? '');
  const scanned = Boolean(params.gtin);
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
    if (s === null || s <= 0) next.size = t('medication.greaterThanZero');
    if (r === null || r < 0 || (s !== null && r > s)) next.remaining = t('medication.remainingError');
    if (expiry.trim() !== '' && !isIsoDate(expiry.trim())) next.expiry = t('common.dateInvalid');
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
      {scanned ? (
        <Card>
          <Muted>{t('medication.scannedHint')}</Muted>
        </Card>
      ) : (
        <Button
          title={t('medication.scanPackCode')}
          variant="secondary"
          onPress={() => router.replace({ pathname: '/scan', params: { mode: 'pack', medicationId: id } })}
        />
      )}
      <Card className="gap-4">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label={t('medication.unitsInPack')}
              value={size}
              onChangeText={onSizeChange}
              keyboardType="decimal-pad"
              placeholder={t('medication.unitsInPackPlaceholder')}
              error={errors.size}
              autoFocus
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t('medication.unitsLeft')}
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
        <TextField label={t('medication.expiryDate')} value={expiry} onChangeText={setExpiry} placeholder={t('common.dateFormatHint')} error={errors.expiry} />
        <TextField label={t('medication.batch')} value={batch} onChangeText={setBatch} placeholder={t('common.optional')} autoCapitalize="characters" />
        <TextField label={t('medication.gtin')} value={gtin} onChangeText={setGtin} placeholder={t('common.optional')} keyboardType="number-pad" />
      </Card>
      <Button title={t('medication.addPack')} onPress={submit} loading={saving} />
    </Screen>
  );
}
