/**
 * The minimal payload the server sees, and only once the user approves.
 * No dose history, no other medications, no patient identity beyond the
 * short reference the practice uses to match the request. One payload
 * covers every medication ordered together from the supplier.
 */
import type { ReorderPayload } from '../api/client';
import type { MedicationRow, ProfileRow, ProviderRow, ReorderRequestRow } from '../db/types';

export interface ReorderPayloadItem {
  request: Pick<ReorderRequestRow, 'quantity_packs' | 'units_remaining_at_request' | 'needed_by'>;
  medication: Pick<MedicationRow, 'name' | 'strength' | 'form' | 'gtin' | 'pharmacode'>;
}

export function buildReorderPayload(
  batch: Pick<ReorderRequestRow, 'batch_id' | 'language' | 'message_subject' | 'message_body'>,
  items: ReorderPayloadItem[],
  provider: ProviderRow,
  profile: Pick<ProfileRow, 'patient_reference'>,
): ReorderPayload {
  const neededBy = items.reduce<string | null>((acc, i) => (i.request.needed_by && (!acc || i.request.needed_by < acc) ? i.request.needed_by : acc), null);
  return {
    request_id: batch.batch_id,
    language: batch.language,
    patient_reference: profile.patient_reference,
    provider: { kind: provider.kind, name: provider.name, email: provider.email },
    items: items.map(({ request, medication }) => ({
      medication: {
        name: medication.name,
        strength: medication.strength,
        form: medication.form,
        gtin: medication.gtin,
        pharmacode: medication.pharmacode,
      },
      quantity_packs: request.quantity_packs,
      units_remaining: request.units_remaining_at_request,
      needed_by: request.needed_by,
    })),
    needed_by: neededBy,
    message: { subject: batch.message_subject ?? '', body: batch.message_body ?? '' },
  };
}
