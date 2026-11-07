import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import React from 'react';

import { brandHeaderOptions } from '@/components/BrandHeader';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useI18n } from '@/lib/i18n';

const ICON_SIZE = 24;

export default function TabLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        ...brandHeaderOptions,
        tabBarActiveTintColor: '#0B5CAB',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        // Disable the static render of the header on web to prevent a hydration error.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('common.tabDashboard'),
          tabBarIcon: ({ color }) => <Feather name="grid" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: t('common.tabMedications'),
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="pill" size={ICON_SIZE + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('common.tabOrders'),
          tabBarIcon: ({ color }) => <Feather name="truck" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('common.tabSettings'),
          tabBarIcon: ({ color }) => <Feather name="settings" size={ICON_SIZE} color={color} />,
        }}
      />
    </Tabs>
  );
}
