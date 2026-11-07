import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Muted, Screen, TextField, Title } from '@/components/ui';
import { createMedication, listMedications, setDoseSchedule, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';
import { type ImportCandidate, type PendingImport, takePendingImport } from '@/lib/scan';

interface Row extends ImportCandidate {
  name: string;
  include: boolean;
  existingName: string | null;
}

export default function ImportScreen() {
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { t } = useI18n();
  const [payload] = useState<PendingImport | null>(() => takePendingImport());
  const existing = useDbQuery((d) => listMedications(d, profile.id, { includeArchived: true }), [profile.id]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payload || !existing.data || rows !== null) return;
    const byGtin = new Map(existing.data.filter((m) => m.gtin).map((m) => [m.gtin as string, m]));
    const byPharmacode = new Map(existing.data.filter((m) => m.pharmacode).map((m) => [m.pharmacode as string, m]));
    const byName = new Map(existing.data.map((m) => [m.name.trim().toLowerCase(), m]));
    setRows(
      payload.candidates.map((c) => {
        const match =
          (c.gtin && byGtin.get(c.gtin)) ||
          (c.pharmacode && byPharmacode.get(c.pharmacode)) ||
          (!c.gtin && !c.pharmacode && byName.get(c.suggestedName.trim().toLowerCase())) ||
          null;
        return { ...c, name: match?.name ?? c.suggestedName, include: !match, existingName: match?.name ?? null };
      }),
    );
  }, [payload, existing.data, rows]);

  if (!payload) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Title>{t('scan.nothingToImport')}</Title>
          <Muted className="text-center">{t('scan.scanFirst')}</Muted>
          <Button title={t('scan.scan')} onPress={() => router.replace('/scan')} />
        </View>
      </Screen>
    );
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  const selected = rows?.filter((r) => r.include) ?? [];
  const unnamed = selected.filter((r) => r.name.trim() === '');

  const importAll = async () => {
    if (unnamed.length > 0) {
      Alert.alert(t('scan.nameRequiredTitle'), t('scan.nameRequiredBody'));
      return;
    }
    setSaving(true);
    try {
      for (const row of selected) {
        const medication = await createMedication(db, {
          profile_id: profile.id,
          name: row.name,
          gtin: row.gtin,
          pharmacode: row.pharmacode,
          notes: row.notes,
        });
        if (row.dose) {
          await setDoseSchedule(db, medication.id, {
            units_per_intake: row.dose.units_per_intake,
            intakes_per_period: row.dose.intakes_per_period,
            period: row.dose.period,
            is_prn: row.dose.is_prn,
            valid_from: row.dose.valid_from ?? undefined,
            source: payload.source === 'emediplan' ? 'emediplan' : 'manual',
          });
        }
      }
      router.dismissTo('/');
    } finally {
      setSaving(false);
    }
  };

  const photo = payload.source === 'photo';

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: photo ? t('scan.importFromPhoto') : t('scan.importFromEmediplan') }} />
      <Card className="gap-1">
        <Body className="font-semibold">{payload.summary}</Body>
        {payload.patientLine ? <Muted>{payload.patientLine}</Muted> : null}
        <Muted>{t('scan.onlyMedications')}</Muted>
        <Muted>{photo ? t('scan.checkPhotoTranscription') : t('scan.checkCodes')}</Muted>
        {payload.warning ? <Muted className="text-amber-700">{payload.warning}</Muted> : null}
      </Card>

      {rows === null ? (
        <Muted>{t('scan.checkingList')}</Muted>
      ) : (
        rows.map((row) => (
          <Card key={row.key} className="gap-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Muted>
                  {row.gtin
                    ? t('scan.gtinLine', { gtin: row.gtin })
                    : row.pharmacode
                      ? t('scan.pharmacodeLine', { pharmacode: row.pharmacode })
                      : photo
                        ? t('scan.fromPhoto')
                        : t('scan.noProductCode')}
                </Muted>
                <Body>{row.doseSummary}</Body>
                {row.notes ? <Muted>{row.notes}</Muted> : null}
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.include }}
                onPress={() => update(row.key, { include: !row.include })}
                hitSlop={8}
                className={`h-7 w-7 items-center justify-center rounded-md border-2 ${
                  row.include ? 'border-brand-600 bg-brand-600' : 'border-neutral-400 bg-white dark:bg-neutral-900'
                }`}>
                {row.include ? <Text className="text-base font-bold text-white">✓</Text> : null}
              </Pressable>
            </View>
            {row.existingName ? <Badge text={t('scan.alreadyInList', { name: row.existingName })} tone="brand" /> : null}
            {row.include ? (
              <TextField
                label={t('scan.nameLabel')}
                value={row.name}
                onChangeText={(name) => update(row.key, { name })}
                placeholder={t('scan.namePlaceholder')}
                error={row.name.trim() === '' ? t('scan.nameRequired') : null}
              />
            ) : null}
          </Card>
        ))
      )}

      <Button
        title={selected.length === 0 ? t('scan.nothingSelected') : t('scan.importCount', { medications: t('common.medications', { count: selected.length }) })}
        onPress={importAll}
        disabled={selected.length === 0}
        loading={saving}
      />
      <Button title={t('common.cancel')} variant="ghost" onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}
