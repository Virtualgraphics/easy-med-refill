import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { Button, Card, Muted, Screen, Segmented, TextField } from '@/components/ui';
import { addDays, createPrescription, getMedication, isIsoDate, listProviders, parseNumber, type PrescriptionType, todayIso, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function AddPrescriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { t } = useI18n();
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
    if (!isIsoDate(issued)) next.issued = t('common.dateInvalid');
    if (validUntil.trim() !== '' && !isIsoDate(validUntil.trim())) next.validUntil = t('common.dateInvalid');
    if (refills.trim() !== '' && (r === null || r < 0 || !Number.isInteger(r))) next.refills = t('medication.refillsError');
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
          label={t('medication.type')}
          options={[
            { value: 'standing', label: t('medication.standingType') },
            { value: 'single', label: t('medication.singleType') },
          ]}
          value={type}
          onChange={setType}
        />
        <TextField label={t('medication.issuedOn')} value={issued} onChangeText={setIssued} placeholder={t('common.dateFormatHint')} error={errors.issued} />
        <TextField
          label={t('medication.validUntil')}
          value={validUntil}
          onChangeText={setValidUntil}
          placeholder={t('medication.validUntilPlaceholder')}
          helper={t('medication.validUntilHelper')}
          error={errors.validUntil}
        />
        <TextField
          label={t('medication.refillsAllowed')}
          value={refills}
          onChangeText={setRefills}
          keyboardType="number-pad"
          placeholder={t('medication.refillsPlaceholder')}
          error={errors.refills}
        />
        <Segmented
          label={t('medication.issuedBy')}
          options={[{ value: 'none', label: t('medication.unknownIssuer') }, ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          value={providerId}
          onChange={setProviderId}
        />
        {(providers.data ?? []).length === 0 ? <Muted>{t('medication.addSuppliersHint')}</Muted> : null}
        <TextField label={t('medication.reference')} value={reference} onChangeText={setReference} placeholder={t('medication.referencePlaceholder')} />
      </Card>
      <Button title={t('medication.addPrescription')} onPress={submit} loading={saving} />
    </Screen>
  );
}
