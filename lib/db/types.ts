/**
 * Row types mirroring the SQLite schema in ./migrations.ts.
 * Column names are snake_case to match the tables one-to-one.
 */

/** ISO 8601 UTC timestamp, e.g. 2026-10-27T08:00:00.000Z */
export type IsoTimestamp = string;
/** Calendar date, e.g. 2026-10-27 */
export type IsoDate = string;
/** SQLite boolean */
export type SqlBool = 0 | 1;

export type ProviderKind = 'practice' | 'pharmacy';
export type DosePeriod = 'day' | 'week';
export type DoseSource = 'manual' | 'emediplan';
export type PackSource = 'manual' | 'datamatrix';
export type PrescriptionType = 'single' | 'standing';
export type ReorderStatus =
  | 'draft'
  | 'approved'
  | 'sent'
  | 'confirmed'
  | 'received'
  | 'overdue'
  | 'cancelled';
export type ShortageSource = 'drugshortage_ch' | 'bwl' | 'simulated';
export type ReorderLanguage = 'de' | 'en' | 'fr' | 'it';

export interface ProfileRow {
  id: string;
  display_name: string;
  patient_reference: string | null;
  is_default: SqlBool;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ProviderRow {
  id: string;
  profile_id: string;
  kind: ProviderKind;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  default_lead_time_days: number;
  learned_lead_time_days: number | null;
  server_provider_id: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface MedicationRow {
  id: string;
  profile_id: string;
  name: string;
  active_ingredient: string | null;
  strength: string | null;
  form: string | null;
  gtin: string | null;
  pharmacode: string | null;
  is_critical: SqlBool;
  safety_buffer_days: number;
  preferred_provider_id: string | null;
  notes: string | null;
  archived_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface DoseScheduleRow {
  id: string;
  medication_id: string;
  units_per_intake: number;
  intakes_per_period: number;
  period: DosePeriod;
  is_prn: SqlBool;
  valid_from: IsoDate;
  valid_to: IsoDate | null;
  source: DoseSource;
  created_at: IsoTimestamp;
}

export interface PackRow {
  id: string;
  medication_id: string;
  units_per_pack: number;
  units_remaining: number;
  gtin: string | null;
  batch: string | null;
  expiry_date: IsoDate | null;
  opened_at: IsoDate | null;
  depleted_at: IsoTimestamp | null;
  source: PackSource;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface PrescriptionRow {
  id: string;
  medication_id: string;
  provider_id: string | null;
  type: PrescriptionType;
  issued_at: IsoDate;
  valid_until: IsoDate | null;
  refills_allowed: number | null;
  refills_used: number;
  reference: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ReorderRequestRow {
  id: string;
  /** Requests sent together in one message share a batch id. */
  batch_id: string;
  medication_id: string;
  provider_id: string;
  prescription_id: string | null;
  status: ReorderStatus;
  quantity_packs: number;
  units_remaining_at_request: number | null;
  needed_by: IsoDate | null;
  approved_at: IsoTimestamp | null;
  sent_at: IsoTimestamp | null;
  confirmed_at: IsoTimestamp | null;
  received_at: IsoTimestamp | null;
  overdue_at: IsoTimestamp | null;
  cancelled_at: IsoTimestamp | null;
  follow_up_count: number;
  server_reference: string | null;
  note: string | null;
  language: ReorderLanguage;
  message_subject: string | null;
  message_body: string | null;
  /** Expected delivery or confirmation date: sent + supplier lead time. */
  expected_by: IsoDate | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface ShortageEntryRow {
  source: ShortageSource;
  product_code: string;
  active_ingredient: string | null;
  status: string | null;
  fetched_at: IsoTimestamp;
}

export interface ShortageMatchRow {
  id: string;
  medication_id: string;
  source: ShortageSource;
  product_code: string;
  detected_at: IsoTimestamp;
  acknowledged_at: IsoTimestamp | null;
  resolved_at: IsoTimestamp | null;
}
