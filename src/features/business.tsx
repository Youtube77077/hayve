import { Icon, type IconName } from '../design/icons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { business } from '../backend/api';
import type { PartnerRole } from '../backend/api/business';
import { BarChart, Card, color, EmptyState, Header, radius, Screen, T } from '../design';
import { money } from '../lib/format';
import { useLive, useSessionId } from '../lib/hooks';

/** Earnings overview shared by every partner dashboard. */
export function EarningsCard({ role, label = 'Earnings' }: { role: PartnerRole; label?: string }) {
  const e = useLive(() => business.earnings(role), [role]).data;
  if (!e) return null;
  return (
    <Card tone="dark">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <T variant="subhead" color={color.textOnDarkSecondary}>
            {label} (settled)
          </T>
          <T weight="800" style={{ fontSize: 34, lineHeight: 42, color: color.white, letterSpacing: -1 }}>{money(e.totalCents)}</T>
        </View>
        <Pressable onPress={() => router.push('/pay/withdraw')} style={{ backgroundColor: color.white, borderRadius: radius.pill, paddingHorizontal: 16, height: 36, justifyContent: 'center' }}>
          <T variant="subhead" weight="800">
            Payout
          </T>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 22, marginTop: 6, marginBottom: 16 }}>
        <Stat label="Pending" value={money(e.pendingCents)} accent />
        <Stat label="Transactions" value={String(e.count)} />
        <Stat label="Wallet balance" value={money(e.wallet.available)} />
      </View>
      <BarChart data={e.series} light height={80} format={money} />
      <T variant="caption" color={color.textOnDarkSecondary} style={{ marginTop: 8 }}>
        Last 7 days · simulated payouts to Hayve Pay
      </T>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View>
      <T variant="caption" color={color.textOnDarkSecondary}>
        {label}
      </T>
      <T variant="headline" color={accent ? color.white : color.grey200}>
        {value}
      </T>
    </View>
  );
}

/** Gate for partner dashboards: shows onboarding when the user lacks the role. */
export function RoleGate({ role, title, children, onboarding }: { role: PartnerRole; title: string; children: ReactNode; onboarding: ReactNode }) {
  const sessionId = useSessionId();
  const roles = useLive(() => business.myRoles(), [sessionId]).data ?? [];
  if (!roles.includes(role)) {
    return (
      <Screen header={<Header back title={title} fallback="/business" />} maxWidth={640} keyboard>
        {onboarding}
      </Screen>
    );
  }
  return <>{children}</>;
}

export function MetricRow({ items }: { items: { label: string; value: string; icon: IconName }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
      {items.map((m) => (
        <Card key={m.label} style={{ flexGrow: 1, flexBasis: 140, gap: 6 }}>
          <Icon name={m.icon} size={20} color={color.black} />
          <T variant="title3">{m.value}</T>
          <T variant="footnote" color={color.textSecondary}>
            {m.label}
          </T>
        </Card>
      ))}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <EmptyState compact icon="file-tray-outline" title={text} />;
}
