import { Icon } from '../../design/icons';
import { View } from 'react-native';
import { social } from '../../backend/api';
import { Button, Card, color, HayveLogo, Header, radius, Screen, T, useToast } from '../../design';
import { useLive } from '../../lib/hooks';

/** Future Hayve Card (physical + virtual debit card linked to Hayve Pay). */
export default function HayveCard() {
  const me = useLive(() => social.myProfile().profile).data;
  const toast = useToast();
  return (
    <Screen header={<Header back title="Hayve Card" fallback="/pay" />} maxWidth={560}>
      <View style={{ backgroundColor: color.black, borderRadius: radius.xl, padding: 22, aspectRatio: 1.586, justifyContent: 'space-between', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <HayveLogo height={28} tone="light" />
          <Icon name="wifi" size={24} color={color.white} style={{ transform: [{ rotate: '90deg' }] }} />
        </View>
        <View>
          <View style={{ width: 46, height: 34, borderRadius: 7, backgroundColor: color.grey200, marginBottom: 18 }} />
          <T variant="title3" color={color.white} style={{ letterSpacing: 3 }}>
            •••• •••• •••• 2026
          </T>
          <T variant="subhead" color={color.textOnDarkSecondary} style={{ marginTop: 6 }}>
            {me?.displayName.toUpperCase()}
          </T>
        </View>
      </View>
      <T variant="title2" style={{ marginTop: 24 }}>
        Spend your Hayve balance anywhere
      </T>
      <T color={color.textSecondary} style={{ marginTop: 6 }}>
        A debit card linked to Hayve Pay, with Apple Pay support, instant notifications and freeze controls.
      </T>
      <View style={{ gap: 10, marginTop: 18 }}>
        {[
          ['flash-outline', 'Instant spending notifications'],
          ['snow-outline', 'Freeze and unfreeze in one tap'],
          ['phone-portrait-outline', 'Apple Pay & Google Pay'],
          ['globe-outline', 'No fees in the eurozone'],
        ].map(([icon, label]) => (
          <Card key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <Icon name={icon as 'flash-outline'} size={20} color={color.primary} />
            <T variant="headline">{label}</T>
          </Card>
        ))}
      </View>
      <Button title="Join the waitlist" variant="accent" size="lg" full style={{ marginTop: 20 }} onPress={() => toast("You're on the Hayve Card waitlist ✨")} />
      <T variant="footnote" color={color.textTertiary} center style={{ marginTop: 10 }}>
        Card issuing requires a licensed card issuer partner and is not active in this build.
      </T>
    </Screen>
  );
}
