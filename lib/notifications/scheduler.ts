/**
 * Local notification plumbing around expo-notifications. Everything here
 * is calculated on the device; no server is involved.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { todayIso } from '../db/clock';
import type { IsoDate } from '../db/types';
import type { SupplyForecast } from '../supply/forecast';
import { planReminders, REMINDER_TITLE, reminderBody } from './plan';

const CHANNEL_ID = 'supply-reminders';

/** Local hour at which reminders fire. */
export const REMINDER_HOUR = 9;

/** Call once at app start. Safe to call again. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Supply reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Reminders when a reorder or prescription renewal is due.',
    }).catch(() => undefined);
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (await hasNotificationPermission()) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

function atLocalHour(date: IsoDate, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

/**
 * Replaces all scheduled reminders with a fresh plan from the forecasts.
 * Returns how many reminders are now scheduled.
 */
export async function syncReminders(forecasts: SupplyForecast[], today: IsoDate = todayIso()): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const plan = planReminders(forecasts, today);
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: REMINDER_TITLE, body: reminderBody(reminder) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: atLocalHour(reminder.date, REMINDER_HOUR),
        channelId: CHANNEL_ID,
      },
    });
  }
  return plan.length;
}

export async function clearReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
