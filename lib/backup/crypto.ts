/**
 * Passphrase-encrypted container for a medication list. Pure JavaScript
 * (audited noble libraries), so it works the same on the phone and in
 * tests. The file reveals nothing without the passphrase: no names, no
 * counts, only the key-derivation parameters and ciphertext.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

export const BACKUP_FORMAT = 'easy-medrefill-backup';
export const BACKUP_FILE_EXTENSION = 'emr';

/** scrypt cost: ~16 MB and well under a second on a current phone. */
const SCRYPT = { N: 2 ** 14, r: 8, p: 1 } as const;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 24;

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: 'xchacha20poly1305';
  nonce: string;
  ciphertext: string;
}

export type RandomBytes = (length: number) => Uint8Array;

export class BackupError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_a_backup' | 'wrong_passphrase' | 'corrupt',
  ) {
    super(message);
  }
}

function deriveKey(passphrase: string, salt: Uint8Array, params: { N: number; r: number; p: number }): Uint8Array {
  return scrypt(utf8ToBytes(passphrase.normalize('NFKC')), salt, { ...params, dkLen: KEY_BYTES });
}

export function encryptBackup(plaintext: string, passphrase: string, random: RandomBytes): EncryptedBackup {
  if (passphrase.length < 6) throw new Error('The passphrase needs at least 6 characters.');
  const salt = random(SALT_BYTES);
  const nonce = random(NONCE_BYTES);
  const key = deriveKey(passphrase, salt, SCRYPT);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(plaintext));
  return {
    format: BACKUP_FORMAT,
    version: 1,
    kdf: { name: 'scrypt', ...SCRYPT, salt: bytesToHex(salt) },
    cipher: 'xchacha20poly1305',
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
  };
}

/** Parses a file's text and checks it is one of ours; throws BackupError otherwise. */
export function parseBackupContainer(text: string): EncryptedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not an Easy MedRefill export.', 'not_a_backup');
  }
  const c = parsed as Partial<EncryptedBackup> | null;
  if (!c || c.format !== BACKUP_FORMAT || c.version !== 1 || c.cipher !== 'xchacha20poly1305' || c.kdf?.name !== 'scrypt') {
    throw new BackupError('This file is not an Easy MedRefill export.', 'not_a_backup');
  }
  if (typeof c.nonce !== 'string' || typeof c.ciphertext !== 'string' || typeof c.kdf.salt !== 'string') {
    throw new BackupError('The export file is damaged.', 'corrupt');
  }
  return c as EncryptedBackup;
}

export function decryptBackup(container: EncryptedBackup, passphrase: string): string {
  const { N, r, p, salt } = container.kdf;
  const key = deriveKey(passphrase, hexToBytes(salt), { N, r, p });
  try {
    const plain = xchacha20poly1305(key, hexToBytes(container.nonce)).decrypt(hexToBytes(container.ciphertext));
    return new TextDecoder().decode(plain);
  } catch {
    throw new BackupError('Wrong passphrase, or the file is damaged.', 'wrong_passphrase');
  }
}
