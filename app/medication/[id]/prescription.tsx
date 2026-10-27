import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { Button, Card, Muted, Screen, Segmented, TextField } from '@/components/ui';
import { addDays, createPrescription, getMedication, isIsoDate, listProviders, parseNumber, type PrescriptionType, todayIso, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function AddPrescriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const providers = useDbQuery((d) => listProviders(d, profile.id), [profile.id]);
  const medication = useDbQuery((d) => getMedication(d, id), [id]);

  const [type, setType] = useState<PrescriptionType>('standing');
  const [issued, setIssued] = useState(todayIso());
  const [validUntil, setValidUntil] = useState(addDays(todayIso(), 365));
  const [refills, setRefills] = useState('');
  const [providerId, setProviderId] = useState('none');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<{ issued?: string; validUntil?: string; refills?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (medication.data?.preferred_provider_id && providerId === 'none') {
      setProviderId(medication.data.preferred_provider_id);
    }
  }, [medication.data, providerId]);

  const submit = async () => {
    const r = refills.trim() === '' ? null : parseNumber(refills);
    const next: typeof errors = {};
    if (!isIsoDate(issued)) next.issued = 'Use YYYY-MM-DD';
    if (validUntil.trim() !== '' && !isIsoDate(validUntil.trim())) next.validUntil = 'Use YYYY-MM-DD';
    if (refills.trim() !== '' && (r === null || r < 0 || !Number.isInteger(r))) next.refills = 'Whole number, or leave empty';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await createPrescription(db, {
        medication_id: id,
        provider_id: providerId === 'none' ? null : providerId,
        type,
        issued_at: issued,
        valid_until: validUntil.trim() || null,
        refills_allowed: r,
        reference: reference.trim() || null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Card className="gap-4">
        <Segmented
          label="Type"
          options={[
            { value: 'standing', label: 'Standing (Dauerrezept)' },
            { value: 'single', label: 'Single' },
          ]}
          value={type}
          onChange={setType}
        />
        <TextField label="Issued on" value={issued} onChangeText={setIssued} placeholder="YYYY-MM-DD" error={errors.issued} />
        <TextField
          label="Valid until"
          value={validUntil}
          onChangeText={setValidUntil}
          placeholder="YYYY-MM-DD, empty if none"
          helper="Swiss standing prescriptions are usually valid for a year."
          error={errors.validUntil}
        />
        <TextField label="Refills allowed" value={refills} onChangeText={setRefills} keyboardType="number-pad" placeholder="empty = unlimited" error={errors.refills} />
        <Segmented
          label="Issued by"
          options={[{ value: 'none', label: 'Unknown' }, ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          value={providerId}
          onChange={setProviderId}
        />
        {(providers.data ?? []).length === 0 ? <Muted>Add practices and pharmacies under Settings.</Muted> : null}
        <TextField label="Reference" value={reference} onChangeText={setReference} placeholder="optional, e.g. prescription number" />
      </Card>
      <Button title="Add prescription" onPress={submit} loading={saving} />
    </Screen>
  );
}
