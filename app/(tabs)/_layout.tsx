import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import React from 'react';

import { brandHeaderOptions } from '@/components/BrandHeader';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

const ICON_SIZE = 24;

export default function TabLayout() {
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
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Feather name="grid" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: 'Medications',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="pill" size={ICON_SIZE + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => <Feather name="truck" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Feather name="settings" size={ICON_SIZE} color={color} />,
        }}
      />
    </Tabs>
  );
}
