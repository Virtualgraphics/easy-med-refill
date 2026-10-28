import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Muted, Screen, TextField, Title } from '@/components/ui';
import { createMedication, listMedications, setDoseSchedule, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';
import { type EmediplanDocument, type ImportCandidate, toImportCandidates } from '@/lib/scan';
import { takePendingEmediplan } from '@/lib/scan/lastScan';

interface Row extends ImportCandidate {
  name: string;
  include: boolean;
  existingName: string | null;
}

export default function ImportScreen() {
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const [doc] = useState<EmediplanDocument | null>(() => takePendingEmediplan());
  const existing = useDbQuery((d) => listMedications(d, profile.id, { includeArchived: true }), [profile.id]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(() => (doc ? toImportCandidates(doc) : []), [doc]);

  useEffect(() => {
    if (!existing.data || rows !== null) return;
    const byGtin = new Map(existing.data.filter((m) => m.gtin).map((m) => [m.gtin as string, m]));
    const byPharmacode = new Map(existing.data.filter((m) => m.pharmacode).map((m) => [m.pharmacode as string, m]));
    setRows(
      candidates.map((c) => {
        const match = (c.gtin && byGtin.get(c.gtin)) || (c.pharmacode && byPharmacode.get(c.pharmacode)) || null;
        return { ...c, name: match?.name ?? c.suggestedName, include: !match, existingName: match?.name ?? null };
      }),
    );
  }, [candidates, existing.data, rows]);

  if (!doc) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Title>Nothing to import</Title>
          <Muted className="text-center">Scan an eMediplan QR code first.</Muted>
          <Button title="Scan" onPress={() => router.replace('/scan')} />
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
      Alert.alert('Name required', 'Give every selected medication a name, or deselect it.');
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
            source: 'emediplan',
          });
        }
      }
      router.dismissTo('/');
    } finally {
      setSaving(false);
    }
  };

  const patientLine = [doc.patient.firstName, doc.patient.lastName].filter(Boolean).join(' ');

  return (
    <Screen scroll>
      <Card className="gap-1">
        <Body className="font-semibold">
          {doc.medType === 3 ? 'Prescription' : 'Medication plan'} · {candidates.length} {candidates.length === 1 ? 'entry' : 'entries'}
        </Body>
        <Muted>
          {patientLine ? `For ${patientLine}${doc.patient.birthDate ? `, born ${doc.patient.birthDate}` : ''}. ` : ''}
          Only the medications are imported, never the patient details.
        </Muted>
        <Muted>The plan carries product codes, not names. Check each name before importing.</Muted>
      </Card>

      {rows === null ? (
        <Muted>Checking against your list…</Muted>
      ) : (
        rows.map((row) => (
          <Card key={row.key} className="gap-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Muted>
                  {row.gtin ? `GTIN ${row.gtin}` : row.pharmacode ? `Pharmacode ${row.pharmacode}` : 'No product code'}
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
            {row.existingName ? <Badge text={`Already in your list as ${row.existingName}`} tone="brand" /> : null}
            {row.include ? (
              <TextField label="Name" value={row.name} onChangeText={(name) => update(row.key, { name })} placeholder="e.g. Tacrolimus 1 mg" error={row.name.trim() === '' ? 'Name is required' : null} />
            ) : null}
          </Card>
        ))
      )}

      <Button
        title={selected.length === 0 ? 'Nothing selected' : `Import ${selected.length} ${selected.length === 1 ? 'medication' : 'medications'}`}
        onPress={importAll}
        disabled={selected.length === 0}
        loading={saving}
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}
