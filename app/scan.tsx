import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Body, Button, Muted, Screen } from '@/components/ui';
import { findMedicationByGtin, useDb } from '@/lib/db';
import { useProfile } from '@/lib/profile/ProfileContext';
import { EmediplanParseError, isChTransmissionFormat, looksLikeGs1, parseEmediplan, parseGs1 } from '@/lib/scan';
import { setPendingEmediplan } from '@/lib/scan/lastScan';

type Mode = 'any' | 'pack';

export default function ScanScreen() {
  const { mode = 'any', medicationId } = useLocalSearchParams<{ mode?: Mode; medicationId?: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  const rearm = () => {
    handled.current = false;
    setBusy(false);
  };

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (handled.current) return;
      handled.current = true;
      setBusy(true);

      try {
        if (isChTransmissionFormat(data)) {
          if (mode === 'pack') {
            Alert.alert('That is a medication plan', 'Scan the DataMatrix on the pack instead.', [{ text: 'OK', onPress: rearm }]);
            return;
          }
          const doc = parseEmediplan(data);
          if (doc.medicaments.length === 0) {
            Alert.alert('Empty plan', 'This eMediplan contains no medications.', [{ text: 'OK', onPress: rearm }]);
            return;
          }
          setPendingEmediplan(doc);
          router.replace('/import');
          return;
        }

        if (looksLikeGs1(data)) {
          const pack = parseGs1(data);
          if (!pack.gtin) {
            Alert.alert('Code not readable', 'The pack code has no valid GTIN.', [{ text: 'Scan again', onPress: rearm }]);
            return;
          }
          const packParams = { gtin: pack.gtin, batch: pack.batch ?? '', expiry: pack.expiry ?? '' };
          if (medicationId) {
            router.replace({ pathname: '/medication/[id]/pack', params: { id: medicationId, ...packParams } });
            return;
          }
          const existing = await findMedicationByGtin(db, profile.id, pack.gtin);
          if (existing) {
            router.replace({ pathname: '/medication/[id]/pack', params: { id: existing.id, ...packParams } });
            return;
          }
          Alert.alert('New medication', `No medication with GTIN ${pack.gtin} yet. Add it now?`, [
            { text: 'Cancel', style: 'cancel', onPress: rearm },
            { text: 'Add', onPress: () => router.replace({ pathname: '/medication/new', params: { gtin: pack.gtin ?? '' } }) },
          ]);
          return;
        }

        Alert.alert('Unknown code', 'Point the camera at an eMediplan QR code or the DataMatrix on a medicine pack.', [
          { text: 'Scan again', onPress: rearm },
        ]);
      } catch (e) {
        const message = e instanceof EmediplanParseError ? e.message : 'The code could not be read.';
        Alert.alert('Could not read code', message, [{ text: 'Scan again', onPress: rearm }]);
      }
    },
    [db, medicationId, mode, profile.id, router],
  );

  if (!permission) {
    return <Screen />;
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Scan' }} />
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Body className="text-center font-semibold">Camera access is needed to scan codes.</Body>
          <Muted className="text-center">The camera is used only while this screen is open. Nothing is uploaded.</Muted>
          <Button title="Allow camera" onPress={() => requestPermission()} />
          {!permission.canAskAgain ? <Muted className="text-center">Enable the camera for Easy MedRefill in the system settings.</Muted> : null}
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ title: mode === 'pack' ? 'Scan pack' : 'Scan' }} />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'datamatrix'] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />
      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/70 p-5 pb-8">
        <Text className="text-center text-base font-semibold text-white">
          {mode === 'pack' ? 'Point at the DataMatrix on the pack' : 'eMediplan QR code or the DataMatrix on a pack'}
        </Text>
        <Text className="text-center text-sm text-neutral-300">
          {busy ? 'Reading…' : 'Hold steady; the code is read automatically.'}
        </Text>
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
