import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { Muted, Screen, Title } from '@/components/ui';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <Title>This screen doesn't exist.</Title>
          <Link href="/" asChild>
            <Text className="text-base font-semibold text-brand-700">Go to the medication list</Text>
          </Link>
          <Muted>If this keeps happening, restart the app.</Muted>
        </View>
      </Screen>
    </>
  );
}
