import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Body, Button, Card, Muted, Screen, Section, SwitchRow, TextField } from '@/components/ui';
import { getApiBaseUrl, isStubMode } from '@/lib/api';
import { getBoolSetting, listProviders, resetAllData, seedDemoData, setBoolSetting, updateProfile, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { clearReminders, ensureNotificationPermission, REMINDER_HOUR } from '@/lib/notifications';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function SettingsScreen() {
  const router = useRouter();
  const db = useDb();
  const { profile, reload: reloadProfile } = useProfile();
  const providers = useDbQuery((d) => listProviders(d, profile.id), [profile.id]);
  const reminders = useDbQuery((d) => getBoolSetting(d, 'reminders_enabled'), []);

  const toggleReminders = async (value: boolean) => {
    if (value) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert('Notifications are off', 'Allow notifications for Easy MedRefill in the system settings to get reminders.');
      }
      await setBoolSetting(db, 'reminders_enabled', granted);
    } else {
      await setBoolSetting(db, 'reminders_enabled', false);
      await clearReminders();
    }
    await reminders.reload();
  };

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [reference, setReference] = useState(profile.patient_reference ?? '');
  const [busy, setBusy] = useState<'save' | 'seed' | 'reset' | null>(null);

  useEffect(() => {
    setDisplayName(profile.display_name);
    setReference(profile.patient_reference ?? '');
  }, [profile]);

  const save = async () => {
    setBusy('save');
    try {
      await updateProfile(db, profile.id, {
        display_name: displayName.trim() || 'My medications',
        patient_reference: reference.trim() || null,
      });
      await reloadProfile();
    } finally {
      setBusy(null);
    }
  };

  const seed = async () => {
    setBusy('seed');
    try {
      const result = await seedDemoData(db);
      await reloadProfile();
      await providers.reload();
      Alert.alert(result.seeded ? 'Demo data loaded' : 'Nothing to do', result.seeded ? 'Ten anonymised medications were added.' : 'Demo data only loads into an empty list.');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    Alert.alert('Delete all data?', 'Medications, packs, prescriptions and suppliers on this device will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('reset');
          try {
            await resetAllData(db);
            await reloadProfile();
            await providers.reload();
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <Section title="Profile">
        <Card className="gap-4">
          <TextField label="List name" value={displayName} onChangeText={setDisplayName} />
          <TextField
            label="Patient reference"
            value={reference}
            onChangeText={setReference}
            placeholder="e.g. initials and birth year"
            helper="Goes into reorder requests so the practice can match you. Keep it short; it is not your full name."
          />
          <Button title="Save" onPress={save} loading={busy === 'save'} />
        </Card>
      </Section>

      <Section title="Reminders">
        <Card className="gap-3">
          <SwitchRow
            label="Supply reminders"
            helper={`A local notification at ${REMINDER_HOUR}:00 on the day a reorder or renewal is due. Never includes medication names.`}
            value={reminders.data ?? false}
            onValueChange={toggleReminders}
          />
        </Card>
      </Section>

      <Section title="Suppliers" action={{ label: 'Add', onPress: () => router.push('/provider/new') }}>
        {providers.data && providers.data.length > 0 ? (
          <View className="gap-2">
            {providers.data.map((p) => (
              <Card key={p.id}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Body className="font-semibold">{p.name}</Body>
                    <Muted>
                      {p.email ?? 'no email'} · lead time {p.learned_lead_time_days ?? p.default_lead_time_days} days
                    </Muted>
                  </View>
                  <Badge text={p.kind === 'practice' ? 'Practice' : 'Pharmacy'} tone="brand" />
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <Card>
            <Muted>No practices or pharmacies yet. Reorders are sent to these.</Muted>
          </Card>
        )}
      </Section>

      <Section title="Data">
        <Card className="gap-3">
          <Muted>Everything stays in an encrypted database on this phone.</Muted>
          <Muted>{isStubMode() ? 'Server: none configured. Reorders are tracked locally only.' : `Server: ${getApiBaseUrl()}`}</Muted>
          <Button title="Load demo data" variant="secondary" onPress={seed} loading={busy === 'seed'} />
          <Button title="Delete all data" variant="danger" onPress={reset} loading={busy === 'reset'} />
        </Card>
      </Section>
    </Screen>
  );
}
