import Feather from '@expo/vector-icons/Feather';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Muted, Screen, Section } from '@/components/ui';
import { deleteProfile, type ProfileRow, useDb } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';

/**
 * The people whose supply this phone manages. Tap to switch, add a new
 * person, remove one. Caregivers live here; the patient alone never needs it.
 */
export default function PeopleScreen() {
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
  const { profile, profiles, switchProfile, reload } = useProfile();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (p: ProfileRow) => {
    if (p.id === profile.id) return;
    setBusy(p.id);
    try {
      await switchProfile(p.id);
    } finally {
      setBusy(null);
    }
  };

  const remove = (p: ProfileRow) =>
    Alert.alert(t('settings.removePersonTitle', { name: p.display_name }), t('settings.removePersonBody'), [
      { text: t('common.keep'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          setBusy(p.id);
          try {
            await deleteProfile(db, p.id);
            await reload();
          } catch (e) {
            Alert.alert(t('settings.couldNotRemove'), e instanceof Error ? e.message : t('common.unknownError'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('settings.peopleTitle') }} />
      <Section title={t('settings.listsOnPhone')} action={{ label: t('common.add'), onPress: () => router.push('/profile/new') }}>
        <View className="gap-2">
          {profiles.map((p) => {
            const active = p.id === profile.id;
            return (
              <Card key={p.id} onPress={() => choose(p)}>
                <View className="flex-row items-center gap-3">
                  <Feather name={active ? 'check-circle' : 'circle'} size={22} color={active ? '#005BAA' : '#A3A3A3'} />
                  <View className="flex-1 gap-0.5">
                    <Body className="font-semibold">{p.display_name}</Body>
                    <Muted>{p.patient_reference ? t('settings.referenceLine', { ref: p.patient_reference }) : t('settings.noReference')}</Muted>
                  </View>
                  {active ? <Badge text={t('settings.active')} tone="brand" /> : null}
                  {profiles.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.removePerson', { name: p.display_name })}
                      onPress={() => remove(p)}
                      hitSlop={8}
                      disabled={busy === p.id}>
                      <Feather name="trash-2" size={20} color="#A3A3A3" />
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </View>
      </Section>

      <Card className="gap-3">
        <Body className="font-semibold">{t('settings.caringTitle')}</Body>
        <Muted>{t('settings.caringBody')}</Muted>
        <Text className="text-sm text-neutral-600 dark:text-neutral-300">{t('settings.takeOverBody')}</Text>
        <Button title={t('settings.addPerson')} onPress={() => router.push('/profile/new')} />
      </Card>
    </Screen>
  );
}
