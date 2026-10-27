import { useRouter } from 'expo-router';
import React, { useState } from 'react';

import { Button, Card, Screen, Segmented, TextField } from '@/components/ui';
import { createProvider, DEFAULT_LEAD_TIME_DAYS, parseNumber, type ProviderKind, useDb } from '@/lib/db';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function NewProviderScreen() {
  const router = useRouter();
  const db = useDb();
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
    if (name.trim() === '') next.name = 'Name is required';
    if (email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address';
    if (lead === null || lead < 0 || !Number.isInteger(lead)) next.leadTime = 'Whole number of days';
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
      <Card className="gap-4">
        <Segmented
          label="Type"
          options={[
            { value: 'practice', label: 'Practice' },
            { value: 'pharmacy', label: 'Pharmacy' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Hausarztpraxis Muster" error={errors.name} autoFocus />
        <TextField label="Email" value={email} onChangeText={setEmail} placeholder="Reorder requests are sent here" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        <TextField label="Phone" value={phone} onChangeText={setPhone} placeholder="optional" keyboardType="phone-pad" />
        <TextField label="Address" value={address} onChangeText={setAddress} placeholder="optional" multiline />
        <TextField
          label="Typical lead time (days)"
          value={leadTime}
          onChangeText={setLeadTime}
          keyboardType="number-pad"
          helper="How long a reorder usually takes. The app refines this from real orders."
          error={errors.leadTime}
        />
      </Card>
      <Button title="Add supplier" onPress={submit} loading={saving} />
    </Screen>
  );
}
