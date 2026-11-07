import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';

import { Body, Button, Card, Muted, Screen, TextField } from '@/components/ui';
import {
  BackupError,
  collectProfileExport,
  decryptBackup,
  encryptBackup,
  parseBackupContainer,
  parseProfileExport,
  pickBackupFile,
  restoreProfileExport,
  shareBackupFile,
} from '@/lib/backup';
import { todayIso, useDb } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';

type Mode = 'export' | 'import';

/**
 * Export the active list as a passphrase-encrypted file, or import one
 * from another phone as a new person. No server is involved either way.
 */
export default function BackupScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = modeParam === 'import' ? 'import' : 'export';
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
  const { profile, switchProfile } = useProfile();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    if (passphrase.length < 6) return Alert.alert(t('settings.passphrase'), t('settings.passphraseMin'));
    if (passphrase !== confirm) return Alert.alert(t('settings.passphrase'), t('settings.passphraseMismatch'));
    setBusy(true);
    try {
      const data = await collectProfileExport(db, profile.id);
      const container = encryptBackup(JSON.stringify(data), passphrase, (n) => Crypto.getRandomBytes(n));
      await shareBackupFile(JSON.stringify(container), profile.display_name, todayIso());
      router.back();
    } catch (e) {
      Alert.alert(t('settings.couldNotExport'), e instanceof Error ? e.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!passphrase) return Alert.alert(t('settings.passphrase'), t('settings.passphraseEnter'));
    setBusy(true);
    try {
      const picked = await pickBackupFile();
      if (!picked) return;
      const container = parseBackupContainer(picked.text);
      const data = parseProfileExport(decryptBackup(container, passphrase));
      const restored = await restoreProfileExport(db, data);
      await switchProfile(restored.id);
      Alert.alert(
        t('settings.imported'),
        t('settings.importedBody', { name: restored.display_name, medications: t('common.medications', { count: data.medications.length }) }),
      );
      router.back();
    } catch (e) {
      const message = e instanceof BackupError ? e.message : e instanceof Error ? e.message : t('common.unknownError');
      Alert.alert(t('settings.couldNotImport'), message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'import') {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: t('settings.importTitle') }} />
        <Card className="gap-4">
          <Body className="font-semibold">{t('settings.importHeading')}</Body>
          <Muted>{t('settings.importBody')}</Muted>
          <TextField label={t('settings.passphrase')} value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" autoFocus />
          <Button title={t('settings.chooseAndImport')} onPress={doImport} loading={busy} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('settings.exportTitle') }} />
      <Card className="gap-4">
        <Body className="font-semibold">{t('settings.exportHeading', { name: profile.display_name })}</Body>
        <Muted>{t('settings.exportBody')}</Muted>
        <TextField
          label={t('settings.passphrase')}
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          autoCapitalize="none"
          helper={t('settings.passphraseHelper')}
          autoFocus
        />
        <TextField label={t('settings.repeatPassphrase')} value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
        <Button title={t('settings.createAndShare')} onPress={doExport} loading={busy} />
      </Card>
    </Screen>
  );
}
