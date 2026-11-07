import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { MedicationForm } from '@/components/forms/MedicationForm';
import { Button, Muted, Screen } from '@/components/ui';
import { archiveMedication, deleteMedication, getMedication, listProviders, updateMedication, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function EditMedicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { t } = useI18n();
  const medication = useDbQuery((d) => getMedication(d, id), [id]);
  const providers = useDbQuery((d) => listProviders(d, profile.id), [profile.id]);

  if (!medication.data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {medication.loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>{t('medication.notFound')}</Muted>}
        </View>
      </Screen>
    );
  }

  const archive = () => {
    Alert.alert(t('medication.archiveTitle'), t('medication.archiveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('medication.archive'),
        onPress: async () => {
          await archiveMedication(db, id);
          router.dismissTo('/');
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert(t('medication.deleteTitle'), t('medication.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteMedication(db, id);
          router.dismissTo('/');
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <MedicationForm
        initial={medication.data}
        providers={providers.data ?? []}
        submitLabel={t('medication.saveChanges')}
        onSubmit={async (values) => {
          await updateMedication(db, id, values);
          router.back();
        }}
      />
      <View className="gap-3 pt-4">
        <Button title={t('medication.archiveMedication')} variant="secondary" onPress={archive} />
        <Button title={t('medication.deleteMedication')} variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}
