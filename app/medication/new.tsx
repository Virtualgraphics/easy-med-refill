import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import { MedicationForm } from '@/components/forms/MedicationForm';
import { Screen } from '@/components/ui';
import { createMedication, listProviders, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useProfile } from '@/lib/profile/ProfileContext';

export default function NewMedicationScreen() {
  const { gtin } = useLocalSearchParams<{ gtin?: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const providers = useDbQuery((d) => listProviders(d, profile.id), [profile.id]);

  return (
    <Screen scroll>
      <MedicationForm
        defaults={gtin ? { gtin } : undefined}
        providers={providers.data ?? []}
        submitLabel="Add medication"
        onSubmit={async (values) => {
          const created = await createMedication(db, { profile_id: profile.id, ...values });
          router.replace({ pathname: '/medication/[id]', params: { id: created.id } });
        }}
      />
    </Screen>
  );
}
