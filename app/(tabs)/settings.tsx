import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Body, Button, Card, Muted, Screen, Section, Segmented, SwitchRow, TextField } from '@/components/ui';
import { getApiBaseUrl, isStubMode } from '@/lib/api';
import { type LanguagePreference, LOCALE_NAMES, LOCALES, useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme/ThemeContext';
import { DEFAULT_PROFILE_NAME, getBoolSetting, listProviders, resetAllData, seedDemoData, setBoolSetting, updateProfile, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { clearReminders, ensureNotificationPermission, REMINDER_HOUR } from '@/lib/notifications';
import { useProfile } from '@/lib/profile/ProfileContext';
import { syncShortages } from '@/lib/shortages';

export default function SettingsScreen() {
  const router = useRouter();
  const db = useDb();
  const { profile, profiles, reload: reloadProfile } = useProfile();
  const theme = useTheme();
  const i18n = useI18n();
  const { t } = i18n;
  const providers = useDbQuery((d) => listProviders(d, profile.id), [profile.id]);
  const reminders = useDbQuery((d) => getBoolSetting(d, 'reminders_enabled'), []);
  const aiPhoto = useDbQuery((d) => getBoolSetting(d, 'ai_photo_consent'), []);

  const toggleReminders = async (value: boolean) => {
    if (value) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(t('settings.notificationsOff'), t('settings.notificationsOffBody'));
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
  const [busy, setBusy] = useState<'save' | 'seed' | 'reset' | 'shortages' | null>(null);

  const checkShortages = async () => {
    setBusy('shortages');
    try {
      const result = await syncShortages(db, profile.id, { force: true });
      const origin = result.source === 'server' ? t('settings.originServer') : result.source === 'simulated' ? t('settings.originSimulated') : t('settings.originCache');
      const lines = [
        t('settings.entriesFrom', { count: result.entries, origin }),
        result.newMatches > 0 ? t('settings.newMatches', { count: result.newMatches }) : t('settings.noNewMatches'),
      ];
      if (result.serverRefresh) {
        const r = result.serverRefresh;
        lines.push(t('settings.serverRebuilt', { simulated: r.simulated, federal: r.bwl === null ? t('settings.federalSkipped') : t('settings.federalEntries', { count: r.bwl }) }));
        if (r.bwl_error) lines.push(t('settings.federalError', { error: r.bwl_error }));
      }
      if (result.serverError) lines.push(t('settings.serverError', { error: result.serverError }));
      Alert.alert(t('settings.shortageChecked'), lines.join('\n'));
    } catch (e) {
      Alert.alert(t('settings.couldNotCheck'), e instanceof Error ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    setDisplayName(profile.display_name);
    setReference(profile.patient_reference ?? '');
  }, [profile]);

  const save = async () => {
    setBusy('save');
    try {
      await updateProfile(db, profile.id, {
        display_name: displayName.trim() || DEFAULT_PROFILE_NAME,
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
      const result = await seedDemoData(db, profile.id);
      await reloadProfile();
      await providers.reload();
      Alert.alert(result.seeded ? t('settings.demoLoaded') : t('settings.nothingToDo'), result.seeded ? t('settings.demoLoadedBody') : t('settings.demoOnlyEmpty'));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    Alert.alert(t('settings.deleteAllTitle'), t('settings.deleteAllBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
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
      <Section title={t('settings.profile')}>
        <Card className="gap-4">
          <TextField label={t('settings.listName')} value={displayName} onChangeText={setDisplayName} />
          <TextField
            label={t('settings.patientReference')}
            value={reference}
            onChangeText={setReference}
            placeholder={t('settings.referencePlaceholder')}
            helper={t('settings.referenceHelper')}
          />
          <Button title={t('common.save')} onPress={save} loading={busy === 'save'} />
        </Card>
      </Section>

      <Section title={t('settings.people')} action={{ label: t('settings.manage'), onPress: () => router.push('/profile') }}>
        <Card onPress={() => router.push('/profile')}>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Body className="font-semibold">{t('settings.lists', { count: profiles.length })}</Body>
              <Muted>{t('settings.peopleHint')}</Muted>
            </View>
            <Feather name="chevron-right" size={20} color="#737373" />
          </View>
        </Card>
      </Section>

      <Section title={t('settings.appearance')}>
        <Card className="gap-4">
          <Segmented
            label={t('settings.theme')}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
            value={theme.preference}
            onChange={(value) => theme.setPreference(value)}
          />
          <Segmented
            label={t('settings.language')}
            options={[{ value: 'system', label: t('common.languageSystem') }, ...LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))]}
            value={i18n.preference}
            onChange={(value) => i18n.setPreference(value as LanguagePreference)}
          />
        </Card>
      </Section>

      <Section title={t('settings.aiFeatures')}>
        <Card className="gap-3">
          <SwitchRow
            label={t('settings.photoImportAi')}
            helper={t('settings.photoImportHelper')}
            value={aiPhoto.data ?? false}
            onValueChange={async (value) => {
              await setBoolSetting(db, 'ai_photo_consent', value);
              await aiPhoto.reload();
            }}
          />
          <Muted>{t('settings.neverLeave')}</Muted>
        </Card>
      </Section>

      <Section title={t('settings.reminders')}>
        <Card className="gap-3">
          <SwitchRow
            label={t('settings.supplyReminders')}
            helper={t('settings.remindersHelper', { hour: REMINDER_HOUR })}
            value={reminders.data ?? false}
            onValueChange={toggleReminders}
          />
        </Card>
      </Section>

      <Section title={t('settings.suppliers')} action={{ label: t('common.add'), onPress: () => router.push('/provider/new') }}>
        {providers.data && providers.data.length > 0 ? (
          <View className="gap-2">
            {providers.data.map((p) => (
              <Card key={p.id}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Body className="font-semibold">{p.name}</Body>
                    <Muted>
                      {p.email ?? t('settings.noEmail')} · {t('settings.leadTimeDays', { days: t('common.days', { count: p.learned_lead_time_days ?? p.default_lead_time_days }) })}
                    </Muted>
                  </View>
                  <Badge text={p.kind === 'practice' ? t('common.practice') : t('common.pharmacy')} tone="brand" />
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <Card>
            <Muted>{t('settings.noSuppliers')}</Muted>
          </Card>
        )}
      </Section>

      <Section title={t('settings.data')}>
        <Card className="gap-3">
          <Muted>{t('settings.dataLocal')}</Muted>
          <Muted>{isStubMode() ? t('settings.serverNone') : t('settings.server', { url: getApiBaseUrl() })}</Muted>
          <Button title={t('settings.exportList')} variant="secondary" onPress={() => router.push({ pathname: '/backup', params: { mode: 'export' } })} />
          <Button title={t('settings.importList')} variant="secondary" onPress={() => router.push({ pathname: '/backup', params: { mode: 'import' } })} />
          <Button title={t('settings.checkShortages')} variant="secondary" onPress={checkShortages} loading={busy === 'shortages'} />
          <Button title={t('settings.loadDemo')} variant="secondary" onPress={seed} loading={busy === 'seed'} />
          <Button title={t('settings.deleteAll')} variant="danger" onPress={reset} loading={busy === 'reset'} />
        </Card>
      </Section>
    </Screen>
  );
}
