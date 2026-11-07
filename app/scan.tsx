import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Body, Button, Muted, Screen } from '@/components/ui';
import { findMedicationByGtin, useDb } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { useProfile } from '@/lib/profile/ProfileContext';
import { EmediplanParseError, isChTransmissionFormat, looksLikeGs1, parseEmediplan, parseGs1, setPendingImport, toImportCandidates } from '@/lib/scan';

type Mode = 'any' | 'pack';

export default function ScanScreen() {
  const { mode = 'any', medicationId } = useLocalSearchParams<{ mode?: Mode; medicationId?: string }>();
  const router = useRouter();
  const db = useDb();
  const { profile } = useProfile();
  const { t } = useI18n();
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
            Alert.alert(t('scan.planNotPackTitle'), t('scan.planNotPackBody'), [{ text: t('common.ok'), onPress: rearm }]);
            return;
          }
          const doc = parseEmediplan(data);
          if (doc.medicaments.length === 0) {
            Alert.alert(t('scan.emptyPlanTitle'), t('scan.emptyPlanBody'), [{ text: t('common.ok'), onPress: rearm }]);
            return;
          }
          const candidates = toImportCandidates(doc);
          const patient = [doc.patient.firstName, doc.patient.lastName].filter(Boolean).join(' ');
          setPendingImport({
            source: 'emediplan',
            candidates,
            summary: `${doc.medType === 3 ? t('scan.prescriptionSummary') : t('scan.planSummary')} · ${t('scan.entries', { count: candidates.length })}`,
            patientLine: patient
              ? doc.patient.birthDate
                ? t('scan.forPatientBorn', { patient, date: doc.patient.birthDate })
                : t('scan.forPatient', { patient })
              : null,
            warning: null,
          });
          router.replace('/import');
          return;
        }

        if (looksLikeGs1(data)) {
          const pack = parseGs1(data);
          if (!pack.gtin) {
            Alert.alert(t('scan.codeNotReadableTitle'), t('scan.codeNotReadableBody'), [{ text: t('scan.scanAgain'), onPress: rearm }]);
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
          Alert.alert(t('scan.newMedicationTitle'), t('scan.newMedicationBody', { gtin: pack.gtin }), [
            { text: t('common.cancel'), style: 'cancel', onPress: rearm },
            { text: t('common.add'), onPress: () => router.replace({ pathname: '/medication/new', params: { gtin: pack.gtin ?? '' } }) },
          ]);
          return;
        }

        Alert.alert(t('scan.unknownCodeTitle'), t('scan.unknownCodeBody'), [{ text: t('scan.scanAgain'), onPress: rearm }]);
      } catch (e) {
        const message = e instanceof EmediplanParseError ? e.message : t('scan.codeUnreadable');
        Alert.alert(t('scan.couldNotReadCode'), message, [{ text: t('scan.scanAgain'), onPress: rearm }]);
      }
    },
    [db, medicationId, mode, profile.id, router, t],
  );

  if (!permission) {
    return <Screen />;
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('scan.scan') }} />
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Body className="text-center font-semibold">{t('scan.cameraNeeded')}</Body>
          <Muted className="text-center">{t('scan.cameraOnlyHere')}</Muted>
          <Button title={t('scan.allowCamera')} onPress={() => requestPermission()} />
          {!permission.canAskAgain ? <Muted className="text-center">{t('scan.enableCameraSettings')}</Muted> : null}
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ title: mode === 'pack' ? t('scan.scanPack') : t('scan.scan') }} />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'datamatrix'] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />
      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/70 p-5 pb-8">
        <Text className="text-center text-base font-semibold text-white">{mode === 'pack' ? t('scan.pointAtPack') : t('scan.pointAtAny')}</Text>
        <Text className="text-center text-sm text-neutral-300">{busy ? t('scan.reading') : t('scan.holdSteady')}</Text>
        {mode !== 'pack' ? <Button title={t('scan.paperListPrompt')} variant="ghost" onPress={() => router.replace('/photo-import')} /> : null}
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
