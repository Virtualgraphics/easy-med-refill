import type { ShortageEntryInput } from '../db/repo/shortages';

/**
 * Simulated shortage feed for demos and offline use. Mirrors
 * backend/cron/shortages.simulated.json. Codes match the demo seed.
 */
export const SIMULATED_SHORTAGES: ShortageEntryInput[] = [
  {
    source: 'simulated',
    product_code: '7680000000014',
    active_ingredient: 'Tacrolimus',
    status: 'Lieferengpass, voraussichtlich bis 2026-12-15',
  },
  {
    source: 'simulated',
    product_code: '7680000000090',
    active_ingredient: 'Sulfamethoxazole / Trimethoprim',
    status: 'Eingeschränkt lieferbar',
  },
];
