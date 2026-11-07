import React from 'react';
import { View } from 'react-native';

import { Body, Button, Card, Muted, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

interface AiConsentScreenProps {
  onAllow: () => void;
  onDecline: () => void;
}

/**
 * Shown before the first photo import. The photo leaves the Swiss-hosted
 * setup and is read by an external AI service, so the user decides.
 */
export function AiConsentScreen({ onAllow, onDecline }: AiConsentScreenProps) {
  const { t } = useI18n();
  return (
    <Screen scroll>
      <View className="gap-4 pt-4">
        <Title>{t('scan.consentTitle')}</Title>
        <Card className="gap-3">
          <Body>{t('scan.consentBody')}</Body>
          <Muted>{t('scan.consentMeta')}</Muted>
          <Body>{t('scan.consentAlternative')}</Body>
        </Card>
        <Button title={t('scan.allowContinue')} onPress={onAllow} />
        <Button title={t('scan.useQrOrManual')} variant="secondary" onPress={onDecline} />
        <Muted className="text-center">{t('scan.changeAnytime')}</Muted>
      </View>
    </Screen>
  );
}
