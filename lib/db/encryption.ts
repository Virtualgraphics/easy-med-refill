import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * The SQLCipher key for the medication database lives only in the device
 * keychain / keystore and is never exported. Combined with the SQLCipher
 * build of expo-sqlite (see app.json), this keeps the database unreadable
 * in any backup, which is what rule 7 of the project brief requires.
 */
const KEY_NAME = 'emr.db.key.v1';
const KEY_BYTES = 32;

/** Returns the 64-character hex key, generating and storing it on first use. */
export async function getOrCreateDatabaseKeyHex(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) {
    return existing;
  }
  const bytes = await Crypto.getRandomBytesAsync(KEY_BYTES);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, hex, {
    // Readable after first unlock (needed for background notifications) and
    // never migrated to another device via backup/restore.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return hex;
}
