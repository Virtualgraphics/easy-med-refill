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
 * Swap the images in assets/images to restyle; layout stays the same.
 */
export function WelcomeScreen({ onScan, onPhoto, onAddManually, onLoadDemo, loadingDemo }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground
      source={require('../assets/images/medi_start_back.jpg')}
      resizeMode="cover"
      className="flex-1"
      style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}>
      <View className="flex-1 items-center justify-between px-6">
        <View className="items-center gap-5">
          <Image
            source={require('../assets/images/icon.png')}
            style={{ width: 112, height: 112, borderRadius: 24 }}
            accessibilityIgnoresInvertColors
          />
          <Text className="text-center text-3xl font-bold text-white" style={{ textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6 }}>
            Easy MedRefill
          </Text>
          <Text className="max-w-xs text-center text-base text-white/90" style={{ textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6 }}>
            Your medication supply, never broken. Two runways per medication, reorders through the practice and pharmacy you already use.
          </Text>
        </View>

        <View className="w-full gap-3 rounded-3xl bg-white/90 p-5 dark:bg-neutral-900/90">
          <Text className="text-center text-sm text-neutral-600 dark:text-neutral-300">
            Start with your medication list
          </Text>
          <Button title="Scan eMediplan or pack" onPress={onScan} />
          <Button title="Photograph a paper list" variant="secondary" onPress={onPhoto} />
          <Button title="Add a medication manually" variant="ghost" onPress={onAddManually} />
          <Button title="Explore with demo data" variant="ghost" onPress={onLoadDemo} loading={loadingDemo} />
          <Text className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            Everything stays on this phone, encrypted. Nothing is uploaded until you approve a reorder.
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
