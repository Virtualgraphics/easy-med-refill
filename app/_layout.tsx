import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense, useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { BrandStackHeader } from '@/components/BrandHeader';
import { LaunchScreen } from '@/components/LaunchScreen';
import { DATABASE_NAME, DATABASE_OPTIONS, initializeDatabase } from '@/lib/db';
import { I18nProvider, useI18n } from '@/lib/i18n';
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
  // Preload the icon fonts so tab icons never flash in late.
  const [loaded, error] = useFonts({
    ...Feather.font,
    ...MaterialCommunityIcons.font,
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
    <Suspense fallback={<LaunchScreen />}>
      <SQLiteProvider databaseName={DATABASE_NAME} options={DATABASE_OPTIONS} onInit={initializeDatabase} useSuspense>
        <I18nProvider fallback={<LaunchScreen />}>
          <ProfileProvider>
            <AppThemeProvider>
              <Navigation />
            </AppThemeProvider>
          </ProfileProvider>
        </I18nProvider>
      </SQLiteProvider>
    </Suspense>
  );
}

function Navigation() {
  const { scheme } = useTheme();
  const { t } = useI18n();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          header: (props) => <BrandStackHeader {...props} />,
          headerTintColor: '#fff',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="medication/new" options={{ title: t('common.titleNewMedication') }} />
        <Stack.Screen name="medication/[id]/index" options={{ title: t('common.titleMedication') }} />
        <Stack.Screen name="medication/[id]/edit" options={{ title: t('common.titleEditMedication') }} />
        <Stack.Screen name="medication/[id]/dose" options={{ title: t('common.titleDose') }} />
        <Stack.Screen name="medication/[id]/pack" options={{ title: t('common.titleAddPack') }} />
        <Stack.Screen name="medication/[id]/prescription" options={{ title: t('common.titleAddPrescription') }} />
        <Stack.Screen name="reorder" options={{ title: t('common.titleNewOrder') }} />
        <Stack.Screen name="order/[id]" options={{ title: t('common.titleOrder') }} />
        <Stack.Screen name="provider/new" options={{ title: t('common.titleNewSupplier') }} />
        <Stack.Screen name="profile/index" options={{ title: t('common.titlePeople') }} />
        <Stack.Screen name="profile/new" options={{ title: t('common.titleAddPerson') }} />
        <Stack.Screen name="backup" options={{ title: t('common.titleBackup') }} />
        <Stack.Screen name="scan" options={{ title: t('common.titleScan') }} />
        <Stack.Screen name="import" options={{ title: t('common.titleImport') }} />
        <Stack.Screen name="photo-import" options={{ title: t('common.titlePhotoImport') }} />
      </Stack>
    </ThemeProvider>
  );
}
