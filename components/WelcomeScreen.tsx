import React from 'react';
import { Image, ImageBackground, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
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
          <Text className="text-2xl font-bold text-brand-700 dark:text-brand-300">{t('common.appName')}</Text>
          <Text className="mb-1 text-center text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.welcomeStart')}</Text>
          <View className="w-full gap-3">
            <Button title={t('dashboard.welcomeScan')} onPress={onScan} />
            <Button title={t('dashboard.welcomePhoto')} variant="secondary" onPress={onPhoto} />
            <Button title={t('dashboard.welcomeManual')} variant="ghost" onPress={onAddManually} />
            <Button title={t('dashboard.welcomeDemo')} variant="ghost" onPress={onLoadDemo} loading={loadingDemo} />
          </View>
          <Text className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            {t('dashboard.welcomeFooter')}
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
