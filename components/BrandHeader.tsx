import Feather from '@expo/vector-icons/Feather';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';

import { useI18n } from '@/lib/i18n';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Brand gradient: blue top-left to light cyan bottom-right. */
export const BRAND_GRADIENT = ['#005BAA', '#6FDCE7'] as const;

export function BrandHeaderBackground() {
  return <LinearGradient colors={[...BRAND_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />;
}

export function BrandHeaderTitle({ children }: { children?: React.ReactNode }) {
  const title = typeof children === 'string' ? children : '';
  return (
    <View className="flex-row items-center gap-2.5">
      <Image source={require('../assets/images/medi_logo_small.png')} style={{ width: 28, height: 28 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Text className="text-xl font-semibold text-white" numberOfLines={1} style={{ textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 3 }}>
        {title}
      </Text>
    </View>
  );
}

/**
 * Full custom header for native-stack screens, which do not paint
 * headerBackground the way the tab navigator does. Same look as the tabs:
 * gradient, logo, title; plus the back arrow and any headerRight.
 */
export function BrandStackHeader({ navigation, options, route, back }: NativeStackHeaderProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const title = typeof options.title === 'string' ? options.title : route.name;
  const right = options.headerRight?.({ tintColor: '#fff', canGoBack: Boolean(back) });

  return (
    <LinearGradient
      colors={[...BRAND_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ paddingTop: insets.top, height: insets.top + (Platform.OS === 'ios' ? 44 : 56) }}>
      <View className="flex-1 flex-row items-center px-2">
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()} hitSlop={10} className="h-10 w-10 items-center justify-center">
            <Feather name="arrow-left" size={24} color="#fff" />
          </Pressable>
        ) : (
          <View className="w-2" />
        )}
        <View className="flex-1 flex-row items-center gap-2.5 pl-1">
          <Image source={require('../assets/images/medi_logo_small.png')} style={{ width: 26, height: 26 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          <Text className="flex-1 text-xl font-semibold text-white" numberOfLines={1} style={{ textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 3 }}>
            {title}
          </Text>
        </View>
        {right ? <View className="flex-row items-center">{right}</View> : null}
      </View>
    </LinearGradient>
  );
}

/**
 * Header options for the tab navigator. The gradient is painted by
 * headerBackground; the title component adds the logo.
 */
export const brandHeaderOptions = {
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600' as const },
  headerStyle: { backgroundColor: 'transparent' },
  headerShadowVisible: false,
  headerBackground: () => <BrandHeaderBackground />,
  headerTitle: (props: { children?: string }) => <BrandHeaderTitle>{props.children}</BrandHeaderTitle>,
};
