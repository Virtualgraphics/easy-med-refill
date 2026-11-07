import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, Muted, Screen, TextField } from '@/components/ui';
import { createProfile, useDb } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';

/** Adds a person (a separate medication list) and switches to it. */
export default function NewProfileScreen() {
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
  const { switchProfile } = useProfile();
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert(t('settings.nameLabel'), t('settings.namePrompt'));
    setSaving(true);
    try {
      const profile = await createProfile(db, { display_name: name, patient_reference: reference });
      await switchProfile(profile.id);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('settings.addPersonTitle') }} />
      <Card className="gap-4">
        <TextField label={t('settings.nameLabel')} value={name} onChangeText={setName} placeholder={t('settings.namePlaceholder')} autoFocus />
        <TextField
          label={t('settings.patientReference')}
          value={reference}
          onChangeText={setReference}
          placeholder={t('settings.referencePlaceholder')}
          helper={t('settings.referenceHelperPerson')}
        />
        <Muted>{t('settings.eachPerson')}</Muted>
        <Button title={t('settings.addAndSwitch')} onPress={save} loading={saving} />
      </Card>
    </Screen>
  );
}
