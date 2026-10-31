import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { DATABASE_NAME, DATABASE_OPTIONS, initializeDatabase } from '@/lib/db';
import { configureNotifications } from '@/lib/notifications';
import { ProfileProvider } from '@/lib/profile/ProfileContext';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/theme/ThemeContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
configureNotifications();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} options={DATABASE_OPTIONS} onInit={initializeDatabase}>
      <ProfileProvider>
        <AppThemeProvider>
          <Navigation />
        </AppThemeProvider>
      </ProfileProvider>
    </SQLiteProvider>
  );
}

function Navigation() {
  const { scheme } = useTheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B5CAB' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="medication/new" options={{ title: 'New medication' }} />
        <Stack.Screen name="medication/[id]/index" options={{ title: 'Medication' }} />
        <Stack.Screen name="medication/[id]/edit" options={{ title: 'Edit medication' }} />
        <Stack.Screen name="medication/[id]/dose" options={{ title: 'Prescribed dose' }} />
        <Stack.Screen name="medication/[id]/pack" options={{ title: 'Add pack' }} />
        <Stack.Screen name="medication/[id]/prescription" options={{ title: 'Add prescription' }} />
        <Stack.Screen name="medication/[id]/reorder" options={{ title: 'Reorder' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Reorder request' }} />
        <Stack.Screen name="provider/new" options={{ title: 'New supplier' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan' }} />
        <Stack.Screen name="import" options={{ title: 'Import from eMediplan' }} />
      </Stack>
    </ThemeProvider>
  );
}
