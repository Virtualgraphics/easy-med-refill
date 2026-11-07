import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';

import { Button, Card, Screen, Segmented, TextField } from '@/components/ui';
import { createProvider, DEFAULT_LEAD_TIME_DAYS, parseNumber, type ProviderKind, useDb } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function NewProviderScreen() {
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
  const { profile } = useProfile();

  const [kind, setKind] = useState<ProviderKind>('practice');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [leadTime, setLeadTime] = useState(String(DEFAULT_LEAD_TIME_DAYS));
  const [errors, setErrors] = useState<{ name?: string; email?: string; leadTime?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const lead = parseNumber(leadTime);
    const next: typeof errors = {};
    if (name.trim() === '') next.name = t('orders.nameRequired');
    if (email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t('orders.emailInvalid');
    if (lead === null || lead < 0 || !Number.isInteger(lead)) next.leadTime = t('orders.leadTimeWhole');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await createProvider(db, {
        profile_id: profile.id,
        kind,
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        default_lead_time_days: lead as number,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('common.titleNewSupplier') }} />
      <Card className="gap-4">
        <Segmented
          label={t('orders.type')}
          options={[
            { value: 'practice', label: t('common.practice') },
            { value: 'pharmacy', label: t('common.pharmacy') },
          ]}
          value={kind}
          onChange={setKind}
        />
        <TextField label={t('orders.name')} value={name} onChangeText={setName} placeholder={t('orders.namePlaceholder')} error={errors.name} autoFocus />
        <TextField
          label={t('orders.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('orders.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />
        <TextField label={t('orders.phone')} value={phone} onChangeText={setPhone} placeholder={t('common.optional')} keyboardType="phone-pad" />
        <TextField label={t('orders.address')} value={address} onChangeText={setAddress} placeholder={t('common.optional')} multiline />
        <TextField
          label={t('orders.leadTime')}
          value={leadTime}
          onChangeText={setLeadTime}
          keyboardType="number-pad"
          helper={t('orders.leadTimeHelper')}
          error={errors.leadTime}
        />
      </Card>
      <Button title={t('orders.addSupplier')} onPress={submit} loading={saving} />
    </Screen>
  );
}
