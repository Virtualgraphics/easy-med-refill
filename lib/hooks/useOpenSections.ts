import { useCallback, useEffect, useState } from 'react';

import { getSetting, setSetting, useDb } from '@/lib/db';

/**
 * Which collapsible sections the user keeps open on the medication page.
 * Persisted in app settings so the choice survives restarts.
 */
export function useOpenSections(defaultOpen: string[] = []) {
  const db = useDb();
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getSetting(db, 'detail_sections_open').then((value) => {
      if (!active) return;
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) setOpen(new Set(parsed.filter((v): v is string => typeof v === 'string')));
        } catch {
          // Ignore a corrupt value; defaults apply.
        }
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [db]);

  const toggle = useCallback(
    (key: string) => {
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSetting(db, 'detail_sections_open', JSON.stringify([...next])).catch(() => undefined);
        return next;
      });
    },
    [db],
  );

  return { isOpen: (key: string) => open.has(key), toggle, loaded };
}
