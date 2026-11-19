import { Icon } from '../../design/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { wallet } from '../../backend/api';
import { Avatar, BarChart, Card, color, EmptyState, IconButton, radius, Screen, Section, Segmented, SimBadge, Split, T, tap, useLayout, type IconName } from '../../design';
import { TabHeader } from '../../features/common';
import { TxRow } from '../../features/pay';
import { money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

export default function Pay() {
  const { isWide } = useLayout();
  const w = useLive(() => wallet.wallet()).data;
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const txs = useLive(() => wallet.transactions({ type: filter }), [filter]).data ?? [];
  const spend = useLive(() => wallet.weeklySpend()).data ?? [];
  const requests = useLive(() => wallet.moneyRequests().filter((r) => r.direction === 'incoming' && r.status === 'pending')).data ?? [];
  const contacts = useLive(() => wallet.recentContacts()).data ?? [];
  const weekTotal = spend.reduce((s, d) => s + d.cents, 0);

  const actions: { icon: IconName; label: string; to: string }[] = [
    { icon: 'arrow-up', label: 'Send', to: '/pay/send' },
    { icon: 'arrow-down', label: 'Request', to: '/pay/request' },
    { icon: 'add', label: 'Add money', to: '/pay/add' },
    { icon: 'arrow-redo-outline', label: 'Withdraw', to: '/pay/withdraw' },
  ];

  const balanceCard = (
    <LinearGradient colors={[color.ink, '#2A1E7A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 22, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -60, bottom: -80, width: 220, height: 220, borderRadius: 110, borderWidth: 30, borderColor: 'rgba(200,245,66,0.10)' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T variant="subhead" color={color.textOnDarkSecondary} weight="600">
          Available balance
        </T>
        <SimBadge label="Simulated money" />
      </View>
      <T style={{ fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -1.2, color: '#fff', marginTop: 6 }}>{money(w?.available ?? 0)}</T>
      <View style={{ flexDirection: 'row', gap: 22, marginTop: 6 }}>
        <View>
          <T variant="caption" color={color.textOnDarkSecondary}>
            Pending
          </T>
          <T variant="headline" color={color.lime}>
            {money(w?.pending ?? 0)}
          </T>
        </View>
        <View>
          <T variant="caption" color={color.textOnDarkSecondary}>
            Reserved
          </T>
          <T variant="headline" color="#fff">
            {money(w?.reserved ?? 0)}
          </T>
        </View>
        <View>
          <T variant="caption" color={color.textOnDarkSecondary}>
            Currency
          </T>
          <T variant="headline" color="#fff">
            EUR
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            onPress={() => {
              tap();
              router.push(a.to as never);
            }}
            accessibilityRole="button"
            style={{ flex: 1, alignItems: 'center', gap: 6 }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: i === 0 ? color.lime : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={a.icon} size={22} color={i === 0 ? color.ink : '#fff'} />
            </View>
            <T variant="caption" color="#fff" weight="700" numberOfLines={1}>
              {a.label}
            </T>
          </Pressable>
        ))}
      </View>
    </LinearGradient>
  );

  return (
    <Screen header={<TabHeader service="pay" right={<IconButton icon="qr-code-outline" label="Receive money" onPress={() => router.push('/pay/request?mode=qr')} />} />}>
      <Split
        left={
          <View>
            {balanceCard}
            {requests.length > 0 && (
              <Pressable onPress={() => router.push('/pay/requests')} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.limeSoft, borderWidth: 1, borderColor: color.lime }}>
                <Icon name="hand-left-outline" size={20} color={color.limeInk} />
                <T variant="headline" style={{ flex: 1 }}>
                  {requests.length} payment {requests.length === 1 ? 'request' : 'requests'} waiting
                </T>
                <Icon name="chevron-forward" size={18} color={color.limeInk} />
              </Pressable>
            )}
            <Section title="Send again" action="Requests" onAction={() => router.push('/pay/requests')}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {contacts.slice(0, 5).map((c) => (
                  <Pressable key={c.id} onPress={() => router.push(`/pay/send?to=${c.id}`)} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <Avatar uri={c.avatar} name={c.displayName} size={52} />
                    <T variant="caption" numberOfLines={1}>
                      {c.displayName.split(' ')[0]}
                    </T>
                  </Pressable>
                ))}
              </View>
            </Section>
            <Section title="Activity">
              <View style={{ marginBottom: 12 }}>
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { key: 'all', label: 'All' },
                    { key: 'in', label: 'Money in' },
                    { key: 'out', label: 'Money out' },
                  ]}
                />
              </View>
              <Card padded={false}>
                {txs.length === 0 ? <EmptyState compact icon="receipt-outline" title="No transactions yet" /> : txs.slice(0, 40).map((t, i) => <TxRow key={t.id} t={t} first={i === 0} />)}
              </Card>
            </Section>
          </View>
        }
        right={
          <View style={{ marginTop: isWide ? 0 : 0 }}>
            <Section title="This week" style={isWide ? { marginTop: 0 } : undefined}>
              <Card>
                <T variant="title2">{money(weekTotal)}</T>
                <T variant="footnote" color={color.textSecondary} style={{ marginBottom: 16 }}>
                  Spent across Hayve in the last 7 days
                </T>
                <BarChart data={spend} format={money} />
              </Card>
            </Section>
            <Section title="Hayve Card">
              <Pressable onPress={() => router.push('/pay/card')}>
                <LinearGradient colors={[color.primary, '#5B3DF5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: 18, aspectRatio: 1.586, justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T variant="headline" color="#fff" weight="900">
                      hayve
                    </T>
                    <View style={{ backgroundColor: color.lime, borderRadius: radius.pill, paddingHorizontal: 10, height: 24, justifyContent: 'center' }}>
                      <T variant="caption" weight="800">
                        Coming soon
                      </T>
                    </View>
                  </View>
                  <View>
                    <View style={{ width: 40, height: 30, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.35)', marginBottom: 14 }} />
                    <T variant="headline" color="#fff" style={{ letterSpacing: 2 }}>
                      •••• •••• •••• 2026
                    </T>
                  </View>
                </LinearGradient>
              </Pressable>
            </Section>
            <Section title="Wallet">
              <Card padded={false}>
                {[
                  { icon: 'card-outline' as IconName, label: 'Payment methods', to: '/pay/methods' },
                  { icon: 'hand-left-outline' as IconName, label: 'Money requests', to: '/pay/requests' },
                  { icon: 'storefront-outline' as IconName, label: 'Accept Hayve Pay (Business)', to: '/business/merchant' },
                ].map((r, i) => (
                  <Pressable key={r.to} onPress={() => router.push(r.to as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
                    <Icon name={r.icon} size={20} color={color.primary} />
                    <T variant="headline" style={{ flex: 1 }}>
                      {r.label}
                    </T>
                    <Icon name="chevron-forward" size={18} color={color.textTertiary} />
                  </Pressable>
                ))}
              </Card>
            </Section>
          </View>
        }
      />
    </Screen>
  );
}
