import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';

import { AiConsentScreen } from '@/components/AiConsentScreen';
import { Body, Button, Muted, Screen } from '@/components/ui';
import { ApiError, extractPlanFromPhoto, isStubMode } from '@/lib/api';
import { getBoolSetting, setBoolSetting, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';
import { extractedToCandidates, setPendingImport } from '@/lib/scan';

/** Largest side we send; enough to read a printed list, small enough to upload quickly. */
const TARGET_MAX_SIDE = 2048;

export default function PhotoImportScreen() {
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
  const consent = useDbQuery((d) => getBoolSetting(d, 'ai_photo_consent'), []);
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [shot, setShot] = useState<{ uri: string; base64: string } | null>(null);
  const [busy, setBusy] = useState<'capture' | 'read' | null>(null);

  // Pick a picture size around 2000 px so uploads stay small.
  const onCameraReady = async () => {
    try {
      const sizes = await camera.current?.getAvailablePictureSizesAsync();
      if (!sizes?.length) return;
      const parsed = sizes
        .map((s) => ({ s, w: Number(s.split('x')[0]), h: Number(s.split('x')[1]) }))
        .filter((p) => Number.isFinite(p.w) && Number.isFinite(p.h));
      const fitting = parsed.filter((p) => Math.max(p.w, p.h) <= TARGET_MAX_SIDE).sort((a, b) => b.w * b.h - a.w * a.h);
      setPictureSize((fitting[0] ?? parsed.sort((a, b) => a.w * a.h - b.w * b.h)[0])?.s);
    } catch {
      // Keep the default size.
    }
  };

  const capture = async () => {
    if (!camera.current) return;
    setBusy('capture');
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6, base64: true, skipProcessing: false });
      if (!photo?.base64) throw new Error(t('scan.noImageData'));
      setShot({ uri: photo.uri, base64: photo.base64 });
    } catch (e) {
      Alert.alert(t('scan.couldNotTakePhoto'), e instanceof Error ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  };

  const pickFromGallery = async () => {
    setBusy('capture');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
        allowsEditing: false,
        selectionLimit: 1,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if (!asset.base64) throw new Error(t('scan.noImageData'));
      setShot({ uri: asset.uri, base64: asset.base64 });
    } catch (e) {
      Alert.alert(t('scan.couldNotOpenPhoto'), e instanceof Error ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  };

  const read = async () => {
    if (!shot) return;
    setBusy('read');
    try {
      const plan = await extractPlanFromPhoto(shot.base64, 'image/jpeg');
      const candidates = extractedToCandidates(plan);
      if (candidates.length === 0) {
        Alert.alert(t('scan.nothingFoundTitle'), plan.notes ?? t('scan.nothingFoundBody'), [{ text: t('scan.retake'), onPress: () => setShot(null) }]);
        return;
      }
      setPendingImport({
        source: 'photo',
        candidates,
        summary: `${t('scan.readFromPhoto')} · ${t('scan.entries', { count: candidates.length })}`,
        patientLine: null,
        warning: plan.patient_fields_seen ? t('scan.personalDetailsWarning') : null,
      });
      router.replace('/import');
    } catch (e) {
      Alert.alert(t('scan.couldNotReadList'), e instanceof ApiError ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (isStubMode()) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('scan.photographList') }} />
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Body className="text-center font-semibold">{t('scan.needsServer')}</Body>
          <Muted className="text-center">{t('scan.setServer')}</Muted>
        </View>
      </Screen>
    );
  }

  if (consent.data === null || consent.loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('scan.photographList') }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0B5CAB" />
        </View>
      </Screen>
    );
  }

  if (!consent.data) {
    return (
      <>
        <Stack.Screen options={{ title: t('scan.photographList') }} />
        <AiConsentScreen
          onAllow={async () => {
            await setBoolSetting(db, 'ai_photo_consent', true);
            await consent.reload();
          }}
          onDecline={async () => {
            await setBoolSetting(db, 'ai_photo_consent', false);
            router.replace('/scan');
          }}
        />
      </>
    );
  }

  if (!permission?.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('scan.photographList') }} />
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Body className="text-center font-semibold">{t('scan.cameraNeededPhoto')}</Body>
          <Button title={t('scan.allowCamera')} onPress={() => requestPermission()} />
        </View>
      </Screen>
    );
  }

  if (shot) {
    return (
      <View className="flex-1 bg-black">
        <Stack.Screen options={{ title: t('scan.checkPhoto') }} />
        <Image source={{ uri: shot.uri }} style={{ flex: 1 }} resizeMode="contain" />
        <View className="gap-3 bg-black/80 p-5 pb-8">
          <Text className="text-center text-sm text-neutral-200">{t('scan.readableQuestion')}</Text>
          <Button title={busy === 'read' ? t('scan.readingList') : t('scan.readThisList')} onPress={read} loading={busy === 'read'} />
          <Button title={t('scan.retake')} variant="secondary" onPress={() => setShot(null)} disabled={busy === 'read'} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ title: t('scan.photographList') }} />
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" pictureSize={pictureSize} onCameraReady={onCameraReady} />
      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/70 p-5 pb-8">
        <Text className="text-center text-base font-semibold text-white">{t('scan.layFlat')}</Text>
        <Text className="text-center text-xs text-neutral-300">{t('scan.photoNotice')}</Text>
        {busy === 'capture' ? <ActivityIndicator color="#fff" /> : <Button title={t('scan.takePhoto')} onPress={capture} />}
        <Button title={t('scan.chooseGallery')} variant="secondary" onPress={pickFromGallery} disabled={busy === 'capture'} />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}
