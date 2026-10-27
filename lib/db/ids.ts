import { randomUUID } from 'expo-crypto';

/** UUID v4 for new rows. Generated on device so records can merge later. */
export function newId(): string {
  return randomUUID();
}
