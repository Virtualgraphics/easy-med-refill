import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Muted, Screen, Segmented, SwitchRow, TextField } from '@/components/ui';
import { type DosePeriod, formatUnits, getActiveDoseSchedule, isIsoDate, parseNumber, setDoseSchedule, todayIso, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';

export default function DoseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const current = useDbQuery((d) => getActiveDoseSchedule(d, id), [id]);

  const [units, setUnits] = useState('1');
  const [times, setTimes] = useState('1');
  const [period, setPeriod] = useState<DosePeriod>('day');
  const [prn, setPrn] = useState(false);
  const [validFrom, setValidFrom] = useState(todayIso());
  const [errors, setErrors] = useState<{ units?: string; times?: string; validFrom?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (current.data) {
      setUnits(formatUnits(current.data.units_per_intake));
      setTimes(formatUnits(current.data.intakes_per_period));
      setPeriod(current.data.period);
      setPrn(current.data.is_prn === 1);
    }
  }, [current.data]);

  const submit = async () => {
    const u = parseNumber(units);
    const t = parseNumber(times);
    const next: typeof errors = {};
    if (u === null || u <= 0) next.units = 'Must be greater than 0';
    if (t === null || t < 0) next.times = 'Must be 0 or more';
    if (!isIsoDate(validFrom)) next.validFrom = 'Use YYYY-MM-DD';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await setDoseSchedule(db, id, {
        units_per_intake: u as number,
        intakes_per_period: t as number,
        period,
        is_prn: prn,
        valid_from: validFrom,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const perDay = (() => {
    const u = parseNumber(units);
    const t = parseNumber(times);
    if (u === null || t === null) return null;
    return period === 'week' ? (u * t) / 7 : u * t;
  })();

  return (
    <Screen scroll>
      <Card className="gap-4">
        <Muted>Enter the dose exactly as your doctor prescribed it. Easy MedRefill uses it only to forecast when your supply runs out.</Muted>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Units per intake" value={units} onChangeText={setUnits} keyboardType="decimal-pad" error={errors.units} />
          </View>
          <View className="flex-1">
            <TextField label={`Times per ${period}`} value={times} onChangeText={setTimes} keyboardType="decimal-pad" error={errors.times} />
          </View>
        </View>
        <Segmented
          label="Period"
          options={[
            { value: 'day', label: 'Per day' },
            { value: 'week', label: 'Per week' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <SwitchRow label="As needed (PRN)" helper="Consumption is an upper bound, not a plan." value={prn} onValueChange={setPrn} />
        <TextField
          label="Valid from"
          value={validFrom}
          onChangeText={setValidFrom}
          placeholder="YYYY-MM-DD"
          helper="A future date schedules the change; the current dose stays in force until then."
          error={errors.validFrom}
        />
        {perDay !== null ? <Muted>Planned consumption: {formatUnits(perDay)} units per day</Muted> : null}
      </Card>
      <Button title="Save dose" onPress={submit} loading={saving} />
    </Screen>
  );
}
