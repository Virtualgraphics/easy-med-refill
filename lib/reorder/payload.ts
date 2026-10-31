/**
 * The minimal payload the server sees, and only once the user approves.
 * No dose history, no other medications, no patient identity beyond the
 * short reference the practice uses to match the request.
 */
import type { ReorderPayload } from '../api/client';
import type { MedicationRow, ProfileRow, ProviderRow, ReorderRequestRow } from '../db/types';

export function buildReorderPayload(
  request: ReorderRequestRow,
  medication: MedicationRow,
  provider: ProviderRow,
  profile: Pick<ProfileRow, 'patient_reference'>,
): ReorderPayload {
  return {
    request_id: request.id,
    language: request.language,
    patient_reference: profile.patient_reference,
    provider: { kind: provider.kind, name: provider.name, email: provider.email },
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
    message: { subject: request.message_subject ?? '', body: request.message_body ?? '' },
  };
}
