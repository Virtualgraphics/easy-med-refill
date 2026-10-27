import React, { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Muted, Segmented, SwitchRow, TextField } from '@/components/ui';
import { defaultSafetyBufferDays, type MedicationRow, parseNumber, type ProviderRow } from '@/lib/db';

export interface MedicationFormValues {
  name: string;
  active_ingredient: string | null;
  strength: string | null;
  form: string | null;
  gtin: string | null;
  pharmacode: string | null;
  is_critical: boolean;
  safety_buffer_days: number;
  preferred_provider_id: string | null;
  notes: string | null;
}

interface MedicationFormProps {
  initial?: MedicationRow;
  providers: ProviderRow[];
  submitLabel: string;
  onSubmit: (values: MedicationFormValues) => Promise<void>;
}

const orEmpty = (v: string | null | undefined) => v ?? '';
const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export function MedicationForm({ initial, providers, submitLabel, onSubmit }: MedicationFormProps) {
  const [name, setName] = useState(orEmpty(initial?.name));
  const [activeIngredient, setActiveIngredient] = useState(orEmpty(initial?.active_ingredient));
  const [strength, setStrength] = useState(orEmpty(initial?.strength));
  const [form, setForm] = useState(orEmpty(initial?.form));
  const [gtin, setGtin] = useState(orEmpty(initial?.gtin));
  const [pharmacode, setPharmacode] = useState(orEmpty(initial?.pharmacode));
  const [isCritical, setIsCritical] = useState(initial?.is_critical === 1);
  const [buffer, setBuffer] = useState(String(initial?.safety_buffer_days ?? defaultSafetyBufferDays(false)));
  const [bufferTouched, setBufferTouched] = useState(initial !== undefined);
  const [providerId, setProviderId] = useState<string>(initial?.preferred_provider_id ?? 'none');
  const [notes, setNotes] = useState(orEmpty(initial?.notes));
  const [errors, setErrors] = useState<{ name?: string; buffer?: string; gtin?: string }>({});
  const [saving, setSaving] = useState(false);

  const toggleCritical = (value: boolean) => {
    setIsCritical(value);
    if (!bufferTouched) {
      setBuffer(String(defaultSafetyBufferDays(value)));
    }
  };

  const submit = async () => {
    const bufferDays = parseNumber(buffer);
    const next: typeof errors = {};
    if (name.trim() === '') next.name = 'Name is required';
    if (bufferDays === null || bufferDays < 0 || !Number.isInteger(bufferDays)) next.buffer = 'Whole number of days';
    if (gtin.trim() !== '' && !/^\d{8,14}$/.test(gtin.trim())) next.gtin = 'GTIN is 8 to 14 digits';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        active_ingredient: orNull(activeIngredient),
        strength: orNull(strength),
        form: orNull(form),
        gtin: orNull(gtin),
        pharmacode: orNull(pharmacode),
        is_critical: isCritical,
        safety_buffer_days: bufferDays as number,
        preferred_provider_id: providerId === 'none' ? null : providerId,
        notes: orNull(notes),
      });
    } finally {
      setSaving(false);
    }
  };

  const providerOptions = [
    { value: 'none', label: 'None' },
    ...providers.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <View className="gap-4">
      <Card className="gap-4">
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Tacrolimus 1 mg" error={errors.name} autoFocus={!initial} />
        <TextField label="Active ingredient" value={activeIngredient} onChangeText={setActiveIngredient} placeholder="optional" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Strength" value={strength} onChangeText={setStrength} placeholder="1 mg" />
          </View>
          <View className="flex-1">
            <TextField label="Form" value={form} onChangeText={setForm} placeholder="capsule" />
          </View>
        </View>
      </Card>

      <Card className="gap-4">
        <SwitchRow
          label="Critical medication"
          helper="Immunosuppressants and similar. Reorders start earlier."
          value={isCritical}
          onValueChange={toggleCritical}
        />
        <TextField
          label="Safety buffer (days)"
          value={buffer}
          onChangeText={(v) => {
            setBuffer(v);
            setBufferTouched(true);
          }}
          keyboardType="number-pad"
          helper="Reorder when supply drops to this many days."
          error={errors.buffer}
        />
        <Segmented label="Preferred supplier" options={providerOptions} value={providerId} onChange={setProviderId} />
        {providers.length === 0 ? <Muted>Add practices and pharmacies under Settings.</Muted> : null}
      </Card>

      <Card className="gap-4">
        <TextField label="GTIN" value={gtin} onChangeText={setGtin} placeholder="7680…" keyboardType="number-pad" error={errors.gtin} />
        <TextField label="Pharmacode" value={pharmacode} onChangeText={setPharmacode} placeholder="optional" keyboardType="number-pad" />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="optional" multiline />
      </Card>

      <Button title={submitLabel} onPress={submit} loading={saving} />
    </View>
  );
}
