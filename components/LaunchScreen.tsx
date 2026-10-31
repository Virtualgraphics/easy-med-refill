import React from 'react';
import { ActivityIndicator, Image, ImageBackground, Text, View } from 'react-native';

/**
 * Branded launch screen shown while the database and profile load.
 * Composed from the background image, the logo and text so it is sharp on
 * every screen size (the native splash on Android 12+ can only show an icon).
 */
export function LaunchScreen() {
  return (
    <ImageBackground source={require('../assets/images/medi_start_back.jpg')} resizeMode="cover" className="flex-1">
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="items-center justify-center rounded-3xl bg-brand-600"
          style={{ width: 168, height: 168, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          <Image source={require('../assets/images/medic_logo_rounded.png')} style={{ width: 168, height: 168, borderRadius: 24 }} />
        </View>
        <Text className="mt-10 text-center text-3xl font-bold uppercase tracking-wide text-brand-700" style={{ letterSpacing: 1.5 }}>
          Easy Med Refill
        </Text>
        <Text className="mt-4 max-w-xs text-center text-lg text-brand-700">Easily track and refill{'\n'}your prescriptions</Text>
      </View>
      <View className="items-center pb-16">
        <ActivityIndicator color="#0B5CAB" />
      </View>
    </ImageBackground>
  );
}
