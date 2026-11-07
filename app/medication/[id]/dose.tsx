import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Muted, Screen, Segmented, SwitchRow, TextField } from '@/components/ui';
import { type DosePeriod, formatUnits, getActiveDoseSchedule, isIsoDate, parseNumber, setDoseSchedule, todayIso, useDb } from '@/lib/db';
import { useDbQuery } from '@/lib/hooks/useDbQuery';
import { useI18n } from '@/lib/i18n';

export default function DoseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDb();
  const { t } = useI18n();
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
    const n = parseNumber(times);
    const next: typeof errors = {};
    if (u === null || u <= 0) next.units = t('medication.greaterThanZero');
    if (n === null || n < 0) next.times = t('medication.zeroOrMore');
    if (!isIsoDate(validFrom)) next.validFrom = t('common.dateInvalid');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await setDoseSchedule(db, id, {
        units_per_intake: u as number,
        intakes_per_period: n as number,
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
    const n = parseNumber(times);
    if (u === null || n === null) return null;
    return period === 'week' ? (u * n) / 7 : u * n;
  })();

  return (
    <Screen scroll>
      <Card className="gap-4">
        <Muted>{t('medication.doseIntro')}</Muted>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label={t('medication.unitsPerIntake')} value={units} onChangeText={setUnits} keyboardType="decimal-pad" error={errors.units} />
          </View>
          <View className="flex-1">
            <TextField
              label={period === 'week' ? t('medication.timesPerWeek') : t('medication.timesPerDay')}
              value={times}
              onChangeText={setTimes}
              keyboardType="decimal-pad"
              error={errors.times}
            />
          </View>
        </View>
        <Segmented
          label={t('medication.period')}
          options={[
            { value: 'day', label: t('medication.perDay') },
            { value: 'week', label: t('medication.perWeek') },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <SwitchRow label={t('medication.prnLabel')} helper={t('medication.prnHelper')} value={prn} onValueChange={setPrn} />
        <TextField
          label={t('medication.validFrom')}
          value={validFrom}
          onChangeText={setValidFrom}
          placeholder={t('common.dateFormatHint')}
          helper={t('medication.validFromHelper')}
          error={errors.validFrom}
        />
        {perDay !== null ? <Muted>{t('medication.plannedConsumption', { units: formatUnits(perDay) })}</Muted> : null}
      </Card>
      <Button title={t('medication.saveDose')} onPress={submit} loading={saving} />
    </Screen>
  );
}
