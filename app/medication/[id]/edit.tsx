import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { MedicationForm } from '@/components/forms/MedicationForm';
import { Button, Muted, Screen } from '@/components/ui';
import { archiveMedication, deleteMedication, getMedication, listProviders, updateMedication, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function EditMedicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const medication = useDbQuery((d) => getMedication(d, id), [id]);
  const providers = useDbQuery((d) => listProviders(d, profile.id), [profile.id]);

  if (!medication.data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          {medication.loading ? <ActivityIndicator color="#0B5CAB" /> : <Muted>Medication not found.</Muted>}
        </View>
      </Screen>
    );
  }

  const archive = () => {
    Alert.alert('Archive medication?', 'It disappears from the list but its history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: async () => {
          await archiveMedication(db, id);
          router.dismissTo('/');
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert('Delete medication?', 'Packs, prescriptions and dose history are deleted with it. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
        submitLabel="Save changes"
        onSubmit={async (values) => {
          await updateMedication(db, id, values);
          router.back();
        }}
      />
      <View className="gap-3 pt-4">
        <Button title="Archive medication" variant="secondary" onPress={archive} />
        <Button title="Delete medication" variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}
