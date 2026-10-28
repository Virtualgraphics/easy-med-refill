import type { EmediplanDocument } from './emediplan';

/**
 * Hands a parsed eMediplan from the scanner to the import screen without
 * pushing a large payload through route params. Cleared after use.
 */
let pending: EmediplanDocument | null = null;

export function setPendingEmediplan(doc: EmediplanDocument | null): void {
  pending = doc;
}

export function takePendingEmediplan(): EmediplanDocument | null {
  const doc = pending;
  pending = null;
  return doc;
}
