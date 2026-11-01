import React from 'react';
import { View } from 'react-native';

import { Body, Button, Card, Muted, Screen, Title } from '@/components/ui';

interface AiConsentScreenProps {
  onAllow: () => void;
  onDecline: () => void;
}

/**
 * Shown before the first photo import. The photo leaves the Swiss-hosted
 * setup and is read by an external AI service, so the user decides.
 */
export function AiConsentScreen({ onAllow, onDecline }: AiConsentScreenProps) {
  return (
    <Screen scroll>
      <View className="gap-4 pt-4">
        <Title>Read your list with AI?</Title>
        <Card className="gap-3">
          <Body>
            To turn a photo of your medication list into entries, we send the photo to an external AI service. It's used only to read your list,
            and you'll check every entry before anything is saved.
          </Body>
          <Muted>The photo is processed by Meta's AI service outside Switzerland and is not stored, neither by us nor as part of your data.</Muted>
          <Body>Prefer to keep everything local? Scan your eMediplan QR code or the packs instead, or enter medications by hand.</Body>
        </Card>
        <Button title="Allow and continue" onPress={onAllow} />
        <Button title="Use QR or manual entry" variant="secondary" onPress={onDecline} />
        <Muted className="text-center">You can change this anytime in Settings.</Muted>
      </View>
    </Screen>
  );
}
