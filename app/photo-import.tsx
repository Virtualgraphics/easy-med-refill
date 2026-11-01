import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';

import { Body, Button, Muted, Screen } from '@/components/ui';
import { ApiError, extractPlanFromPhoto, isStubMode } from '@/lib/api';
import { extractedToCandidates, setPendingImport } from '@/lib/scan';

/** Largest side we send; enough to read a printed list, small enough to upload quickly. */
const TARGET_MAX_SIDE = 2048;

export default function PhotoImportScreen() {
  const router = useRouter();
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
      if (!photo?.base64) throw new Error('No image data');
      setShot({ uri: photo.uri, base64: photo.base64 });
    } catch (e) {
      Alert.alert('Could not take the photo', e instanceof Error ? e.message : 'Unknown error');
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
        Alert.alert('Nothing found', plan.notes ?? 'No medications were recognised. Try a sharper, straighter photo with the whole list in frame.', [
          { text: 'Retake', onPress: () => setShot(null) },
        ]);
        return;
      }
      setPendingImport({
        source: 'photo',
        candidates,
        summary: `Read from a photo · ${candidates.length} ${candidates.length === 1 ? 'entry' : 'entries'}`,
        patientLine: null,
        warning: plan.patient_fields_seen
          ? 'The list carried personal details. They were not transcribed and the photo was not stored.'
          : null,
      });
      router.replace('/import');
    } catch (e) {
      Alert.alert('Could not read the list', e instanceof ApiError ? e.message : 'Unknown error');
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
        <Stack.Screen options={{ title: 'Photograph a list' }} />
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Body className="text-center font-semibold">Reading a paper list needs the server.</Body>
          <Muted className="text-center">Set the server address in the app configuration, then try again.</Muted>
        </View>
      </Screen>
    );
  }

  if (!permission?.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Photograph a list' }} />
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Body className="text-center font-semibold">Camera access is needed to photograph the list.</Body>
          <Button title="Allow camera" onPress={() => requestPermission()} />
        </View>
      </Screen>
    );
  }

  if (shot) {
    return (
      <View className="flex-1 bg-black">
        <Stack.Screen options={{ title: 'Check the photo' }} />
        <Image source={{ uri: shot.uri }} style={{ flex: 1 }} resizeMode="contain" />
        <View className="gap-3 bg-black/80 p-5 pb-8">
          <Text className="text-center text-sm text-neutral-200">
            Readable and the whole list in frame? Reading takes a few seconds.
          </Text>
          <Button title={busy === 'read' ? 'Reading the list…' : 'Read this list'} onPress={read} loading={busy === 'read'} />
          <Button title="Retake" variant="secondary" onPress={() => setShot(null)} disabled={busy === 'read'} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ title: 'Photograph a list' }} />
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" pictureSize={pictureSize} onCameraReady={onCameraReady} />
      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/70 p-5 pb-8">
        <Text className="text-center text-base font-semibold text-white">Lay the list flat, fill the frame, avoid glare.</Text>
        <Text className="text-center text-xs text-neutral-300">
          The photo is sent to the Easy MedRefill server and read by Meta's AI. It is not stored. Cover your name and address if you prefer.
        </Text>
        {busy === 'capture' ? <ActivityIndicator color="#fff" /> : <Button title="Take photo" onPress={capture} />}
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
