import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { card as cardApi, tap as tapApi, wallet, requests as requestsApi } from '../../backend/api';
import { Appear, Avatar, WaveV, BarChart, Card, color, EmptyState, focusRing, Icon, IconButton, radius, Screen, Section, Segmented, SimBadge, Split, T, tap, useLayout, type IconName } from '../../design';
import { TabHeader } from '../../features/common';
import { HayveCardVisual } from '../../features/card';
import { TxRow } from '../../features/pay';
import { money, shortDate } from '../../lib/format';
import { useLive } from '../../lib/hooks';
import { useT } from '../../lib/i18n';

const ACTIONS: { icon: IconName; label: string; to: string }[] = [
  { icon: 'add', label: 'Add money', to: '/pay/add' },
  { icon: 'arrow-up', label: 'Send', to: '/pay/send' },
  { icon: 'arrow-down', label: 'Request', to: '/pay/request' },
  { icon: 'tap-to-pay', label: 'Get paid', to: '/pay/get-paid' },
];

export default function Pay() {
  const t = useT();
  const { isWide } = useLayout();
  const w = useLive(() => wallet.wallet()).data;
  const wb = useLive(() => wallet.waveBackSummary()).data;
  const cardView = useLive(() => cardApi.get()).data;
  const taps = useLive(() => tapApi.history().slice(0, 3)).data ?? [];
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const txs = useLive(() => wallet.transactions({ type: filter }), [filter]).data;
  const spend = useLive(() => wallet.weeklySpend()).data ?? [];
  const requests = useLive(() => wallet.moneyRequests().filter((r) => r.direction === 'incoming' && r.status === 'pending')).data ?? [];
  const openLinks = useLive(() => requestsApi.mine('pending').items).data ?? [];
  const contacts = useLive(() => wallet.recentContacts()).data ?? [];
  const weekTotal = spend.reduce((s, d) => s + d.cents, 0);

  const balance = (
    <View style={{ borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: 24 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T variant="subhead" color={color.textSecondary} weight="600">
          {t('Hayve balance')}
        </T>
        <SimBadge />
      </View>
      <T weight="800" style={{ fontSize: 44, lineHeight: 52, letterSpacing: -1, marginTop: 8 }} accessibilityLabel={`Balance ${money(w?.available ?? 0)}`}>
        {money(w?.available ?? 0)}
      </T>
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
        <Stat label="Pending" value={money(w?.pending ?? 0)} />
        <Stat label="Reserved" value={money(w?.reserved ?? 0)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
        {ACTIONS.map((a, i) => (
          <ActionButton key={a.label} {...a} primary={i === 0} />
        ))}
      </View>
    </View>
  );

  const waveBack = wb && (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="wave" size={20} color={color.indigo} />
        <T variant="headline" style={{ flex: 1 }}>Wave Back</T>
        <T variant="footnote" color={color.textSecondary}>This month</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <T variant="title2">{money(wb.thisMonthCents)}</T>
        <T variant="footnote" color={color.textSecondary}>of {money(wb.monthlyMaxCents)}</T>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color.grey100, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: wb.monthlyMaxCents, now: wb.thisMonthCents }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: color.indigo, width: `${Math.min(100, (wb.thisMonthCents / Math.max(1, wb.monthlyMaxCents)) * 100)}%` }} />
      </View>
      <T variant="footnote" color={color.textSecondary}>
        Pay with your Hayve balance and get money back on Shop, Ride, Bites, Drive and Stay.
        {wb.welcomeActive ? ` Your welcome boost runs until ${shortDate(wb.welcomeEndsAt)} (up to ${money(wb.welcomeLeftCents)} more).` : ''}
      </T>
      <T variant="caption" color={color.textSecondary}>Earned so far: {money(wb.totalCents)}</T>
    </Card>
  );

  return (
    <Screen header={<TabHeader service="pay" right={<IconButton icon="qr-code-outline" label="Receive money" onPress={() => router.push('/pay/request?mode=qr')} />} />}>
      <Split
        left={
          <View>
            {balance}
            {requests.length > 0 && (
              <Pressable onPress={() => router.push('/pay/requests')} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: pressed ? color.black : color.line })}>
                <Icon name="hand-left-outline" size={20} />
                <T variant="headline" style={{ flex: 1 }}>
                  {requests.length} payment {requests.length === 1 ? 'request' : 'requests'} waiting
                </T>
                <Icon name="chevron-forward" size={18} color={color.grey500} />
              </Pressable>
            )}
            {openLinks.length > 0 && (
              <Section title="Waiting for payment" action="All" onAction={() => router.push('/pay/requests')}>
                <Card padded={false}>
                  {openLinks.slice(0, 3).map((l, i) => (
                    <Pressable key={l.id} onPress={() => router.push(`/pay/link/${l.id}`)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: color.line, backgroundColor: pressed ? color.grey100 : color.white })}>
                      <Icon name={l.kind === 'split' ? 'people-outline' : 'link-outline'} size={20} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline" numberOfLines={1}>
                          {l.title}
                        </T>
                        <T variant="footnote" color={color.textSecondary}>
                          {l.expectedCount !== null ? `${l.paidCount} of ${l.expectedCount} paid` : `${l.paidCount} paid`}
                        </T>
                      </View>
                      <T variant="headline">{money(l.amountCents)}</T>
                    </Pressable>
                  ))}
                </Card>
              </Section>
            )}
            {contacts.length > 0 && (
              <Section title="Send again" action="Requests" onAction={() => router.push('/pay/requests')}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {contacts.slice(0, 5).map((c) => (
                    <Pressable key={c.id} onPress={() => router.push(`/pay/send?to=${c.id}`)} accessibilityLabel={`Send money to ${c.displayName}`} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                      <Avatar uri={c.avatarThumb ?? c.avatar} name={c.displayName} size={52} />
                      <T variant="caption" numberOfLines={1}>
                        {c.displayName.split(' ')[0]}
                      </T>
                    </Pressable>
                  ))}
                </View>
              </Section>
            )}
            {!isWide && <View style={{ marginTop: 24 }}>{waveBack}</View>}
            <Section title={t('History')}>
              <View style={{ marginBottom: 12 }}>
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { key: 'all', label: t('All') },
                    { key: 'in', label: t('Money in') },
                    { key: 'out', label: t('Money out') },
                  ]}
                />
              </View>
              <Card padded={false}>
                {!txs ? null : txs.length === 0 ? <EmptyState compact icon="receipt-outline" title="No transactions yet" body="Add money to get started." /> : txs.slice(0, 40).map((t, i) => <Appear key={t.id} index={i}><TxRow t={t} first={i === 0} /></Appear>)}
              </Card>
            </Section>
          </View>
        }
        right={
          <View>
            {isWide && waveBack}
            <Section title="Hayve Card" action={cardView?.card ? 'Manage' : undefined} onAction={() => router.push('/pay/card')}>
              <Pressable onPress={() => router.push('/pay/card')} accessibilityRole="link" accessibilityLabel="Hayve Card">
                {cardView?.card ? (
                  <HayveCardVisual last4={cardView.card.last4} holder={cardView.holder} frozen={cardView.card.status === 'frozen'} width="100%" />
                ) : (
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={{ width: 64, height: 42, borderRadius: 8, backgroundColor: color.black, alignItems: 'center', justifyContent: 'center' }}>
                      <WaveV size={22} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T variant="headline">Get the Hayve Card</T>
                      <T variant="footnote" color={color.textSecondary}>Pay anywhere from your balance and earn Wave Back</T>
                    </View>
                    <Icon name="chevron-forward" size={18} color={color.grey500} />
                  </Card>
                )}
              </Pressable>
            </Section>
            {taps.length > 0 && (
              <Section title="Received with Tap to Pay" action="Get paid" onAction={() => router.push('/pay/get-paid')}>
                <Card padded={false}>
                  {taps.map((t, i) => (
                    <Pressable key={t.id} onPress={() => router.push(`/pay/tap/${t.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: color.grey200, backgroundColor: pressed ? color.grey100 : color.white })}>
                      <Icon name="tap-to-pay" size={20} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline" numberOfLines={1}>{t.note || 'Tap to Pay'}</T>
                        <T variant="footnote" color={color.textSecondary}>{t.cardBrand}{t.last4 ? ` •••• ${t.last4}` : ''} · Fees {money(t.feeCents)}</T>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T variant="headline" color={t.status === 'refunded' ? color.grey500 : color.indigo}>+{money(t.amountCents)}</T>
                        <T variant="caption" color={color.textSecondary}>{t.status === 'available' ? 'Available' : t.status === 'pending' ? 'Pending' : 'Refunded'}</T>
                      </View>
                    </Pressable>
                  ))}
                </Card>
              </Section>
            )}
            <Section title="This week">
              <Card>
                <T variant="title2">{money(weekTotal)}</T>
                <T variant="footnote" color={color.textSecondary} style={{ marginBottom: 16 }}>
                  Spent across Hayve in the last 7 days
                </T>
                <BarChart data={spend} format={money} />
              </Card>
            </Section>
            <Section title="Wallet">
              <Card padded={false}>
                {[
                  { icon: 'card-outline' as IconName, label: 'Cards and banks', to: '/pay/methods' },
                  { icon: 'link-outline' as IconName, label: 'Requests and links', to: '/pay/requests' },
                  { icon: 'people-outline' as IconName, label: 'Split a bill', to: '/pay/request?mode=split' },
                  { icon: 'arrow-redo-outline' as IconName, label: 'Withdraw to bank', to: '/pay/withdraw' },
                  { icon: 'storefront-outline' as IconName, label: 'Accept Hayve Pay', sub: 'For business', to: '/business/merchant' },
                ].map((r, i) => (
                  <Pressable key={r.to} onPress={() => router.push(r.to as never)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: color.line, backgroundColor: pressed ? color.grey100 : color.white })}>
                    <Icon name={r.icon} size={20} />
                    <T variant="headline" style={{ flex: 1 }}>
                      {r.label}
                    </T>
                    {r.sub ? <T variant="footnote" color={color.textSecondary}>{r.sub}</T> : null}
                    <Icon name="chevron-forward" size={18} color={color.grey500} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <T variant="caption" color={color.textSecondary}>
        {label}
      </T>
      <T variant="headline">{value}</T>
    </View>
  );
}

function ActionButton({ icon, label, to, primary }: { icon: IconName; label: string; to: string; primary?: boolean }) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={() => {
        tap();
        router.push(to as never);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={t(label)}
      style={{ flex: 1, alignItems: 'center', gap: 8 }}
    >
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <>
          <View style={[{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? color.indigo : pressed || hovered ? color.grey100 : color.white, borderWidth: primary ? 0 : 1, borderColor: hovered ? color.black : color.line }, focusRing(focused)]}>
            <Icon name={icon} size={22} color={primary ? color.white : color.black} />
          </View>
          <T variant="caption" weight="700" numberOfLines={1}>
            {t(label)}
          </T>
        </>
      )}
    </Pressable>
  );
}
