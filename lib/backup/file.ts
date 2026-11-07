/**
 * Moves an encrypted export in and out of the phone: write it to the
 * cache, hand it to the share sheet (AirDrop, Signal, Files, email), and
 * read a picked file back. The cache copy is removed after sharing.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { t } from '../i18n/translate';
import { BACKUP_FILE_EXTENSION } from './crypto';

function safeFileName(displayName: string, date: string): string {
  const base = displayName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'list';
  return `easy-medrefill-${base}-${date}.${BACKUP_FILE_EXTENSION}`;
}

/** Writes the container to a temporary file and opens the share sheet. */
export async function shareBackupFile(containerJson: string, displayName: string, date: string): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No writable folder available on this device.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const uri = dir + safeFileName(displayName, date);
  await FileSystem.writeAsStringAsync(uri, containerJson, { encoding: FileSystem.EncodingType.UTF8 });
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: t('settings.shareDialogTitle'), UTI: 'public.json' });
  } finally {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

/** Lets the user pick an export file; null when they cancel. */
export async function pickBackupFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  return { name: asset.name, text };
}
