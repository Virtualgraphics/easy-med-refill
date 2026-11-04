import React from 'react';
import { Image, ImageBackground, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';

interface WelcomeScreenProps {
  onScan: () => void;
  onPhoto: () => void;
  onAddManually: () => void;
  onLoadDemo: () => void;
  loadingDemo?: boolean;
}

/**
 * First-launch screen, shown while the medication list is empty.
 * The background image carries the mood; the card holds logo, name and
 * the ways to get a list in. Swap the images in assets/images to restyle.
 */
export function WelcomeScreen({ onScan, onPhoto, onAddManually, onLoadDemo, loadingDemo }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground
      source={require('../assets/images/medi_start_back.jpg')}
      resizeMode="cover"
      className="flex-1"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
      <View className="flex-1 justify-end px-6">
        <View className="w-full items-center gap-3 rounded-3xl bg-white/90 p-5 dark:bg-neutral-900/90">
          <Image
            source={require('../assets/images/medic_logo_rounded.png')}
            style={{ width: 96, height: 96 }}
            accessibilityLabel="Easy MedRefill"
            accessibilityIgnoresInvertColors
          />
          <Text className="text-2xl font-bold text-brand-700 dark:text-brand-300">Easy MedRefill</Text>
          <Text className="mb-1 text-center text-sm text-neutral-600 dark:text-neutral-300">Start with your medication list</Text>
          <View className="w-full gap-3">
            <Button title="Scan eMediplan or pack" onPress={onScan} />
            <Button title="Photograph a paper list" variant="secondary" onPress={onPhoto} />
            <Button title="Add a medication manually" variant="ghost" onPress={onAddManually} />
            <Button title="Explore with demo data" variant="ghost" onPress={onLoadDemo} loading={loadingDemo} />
          </View>
          <Text className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            Everything stays on this phone, encrypted. Nothing is uploaded until you approve a reorder.
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
