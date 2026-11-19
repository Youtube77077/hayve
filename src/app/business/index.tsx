import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { business } from '../../backend/api';
import { Badge, color, Grid, Header, radius, Screen, T, type IconName } from '../../design';
import { useLive } from '../../lib/hooks';

const ICON: Record<string, IconName> = { seller: 'pricetags', kitchen: 'restaurant', host: 'home', driver: 'car-sport', courier: 'bicycle', merchant: 'storefront' };
const BLURB: Record<string, string> = {
  seller: 'List items on Hayve Shop, manage orders and get paid into Hayve Pay.',
  kitchen: 'Put your restaurant on Hayve Bites. Menus, live orders and payouts.',
  host: 'Host stays on Hayve Stay and rent out vehicles on Hayve Drive.',
  driver: 'Drive passengers with Hayve Ride on your own schedule.',
  courier: 'Deliver food and parcels for Hayve Bites and Hayve Send.',
  merchant: 'Accept Hayve Pay online, with payment links, QR codes and in person.',
};

/** Hayve for Business: one account, many roles. */
export default function BusinessHub() {
  const roles = useLive(() => business.myRoles()).data ?? [];
  return (
    <Screen header={<Header back title="Hayve for Business" subtitle="One account. Every way to earn." large fallback="/profile" />}>
      <T color={color.textSecondary} style={{ marginBottom: 18, maxWidth: 640 }}>
        Add as many roles as you like to your Hayve account. Your earnings from every role land in the same Hayve Pay wallet.
      </T>
      <Grid min={300} gap={12}>
        {business.PARTNER_APPS.map((a) => {
          const active = roles.includes(a.role);
          return (
            <Pressable key={a.role} onPress={() => router.push(a.route as never)} style={({ pressed }) => ({ backgroundColor: active ? color.ink : color.surface, borderRadius: radius.xl, padding: 18, gap: 12, borderWidth: 1, borderColor: active ? color.ink : color.line, opacity: pressed ? 0.9 : 1, minHeight: 180 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: active ? color.lime : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICON[a.role]} size={24} color={active ? color.ink : color.primary} />
                </View>
                {active ? <Badge label="Active" tone="lime" /> : <Badge label="Get started" tone="primary" />}
              </View>
              <View style={{ gap: 4 }}>
                <T variant="title3" color={active ? '#fff' : color.text}>
                  {a.name}
                </T>
                <T variant="footnote" color={active ? color.textOnDarkSecondary : color.textSecondary}>
                  {BLURB[a.role]}
                </T>
              </View>
              <T variant="subhead" weight="700" color={active ? color.lime : color.primary}>
                {active ? 'Open dashboard →' : 'Register →'}
              </T>
            </Pressable>
          );
        })}
      </Grid>
    </Screen>
  );
}
