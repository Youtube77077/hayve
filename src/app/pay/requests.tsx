import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { requests, wallet } from '../../backend/api';
import type { PayRequestStatus, PayRequestView } from '../../backend/api/requests';
import { Appear, Avatar, Button, Card, Chip, color, EmptyState, Header, HScroll, Icon, ProgressBar, radius, Screen, Section, T } from '../../design';
import { StatusPill } from '../../features/common';
import { ago, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';
import { celebrate } from '../../features/celebrate';

const FILTERS: { key: PayRequestStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

const KIND = { personal: 'Request', split: 'Split', business: 'Business', deposit: 'Deposit' } as const;

/** Payment tracking: every link you created, plus requests between Hayve users. */
export default function Requests() {
  const [filter, setFilter] = useState<PayRequestStatus | 'all'>('all');
  const links = useLive(() => requests.mine(filter), [filter]).data;
  const direct = useLive(() => wallet.moneyRequests()).data ?? [];
  const { run, busy } = useAction();
  const incoming = direct.filter((r) => r.direction === 'incoming' && r.status === 'pending');
  const outgoing = direct.filter((r) => r.direction === 'outgoing' || r.status !== 'pending');
  const items = links?.items ?? [];

  return (
    <Screen header={<Header back title="Requests" fallback="/pay" right={<Button title="New" icon="add" size="sm" variant="outline" onPress={() => router.push('/pay/request')} />} />} maxWidth={680}>
      {incoming.length > 0 && (
        <Section title="To pay" style={{ marginTop: 4 }}>
          <View style={{ gap: 10 }}>
            {incoming.map((r) => (
              <Card key={r.id} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar uri={r.other.avatar} name={r.other.displayName} size={42} />
                  <View style={{ flex: 1 }}>
                    <T variant="headline">{r.other.displayName} requests</T>
                    <T variant="footnote" color={color.textSecondary}>
                      {r.note || 'No note'} · {ago(r.createdAt)}
                    </T>
                  </View>
                  <T variant="title3">{money(r.amountCents)}</T>
                </View>
                <Button title={busy ? 'Processing payment…' : `Pay ${money(r.amountCents)}`} full loading={busy} onPress={() => run(() => wallet.respondToRequest(r.id, true), { onDone: () => celebrate({ title: `Paid ${r.other.displayName.split(' ')[0]}!`, body: `${money(r.amountCents)} sent from your balance.` }) })} />
                <Button title="Decline" variant="ghost" size="sm" style={{ alignSelf: 'center' }} onPress={() => run(() => wallet.respondToRequest(r.id, false), { success: 'Request declined' })} />
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Section title="Your links" style={{ marginTop: incoming.length ? undefined : 4 }}>
        <HScroll gap={8}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} count={links?.counts[f.key] || undefined} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </HScroll>
        <View style={{ gap: 10, marginTop: 12 }}>
          {items.map((r, i) => (
            <Appear key={r.id} index={i}>
              <LinkRow r={r} />
            </Appear>
          ))}
          {links && items.length === 0 && (
            <EmptyState icon="link-outline" title={filter === 'all' ? 'No payment links yet' : `No ${filter} requests`} body="Paid for dinner? Create a link and share it on WhatsApp, Snapchat or by text. Friends pay without needing Hayve." action="Request money" onAction={() => router.push('/pay/request')} />
          )}
        </View>
      </Section>

      {outgoing.length > 0 && (
        <Section title="Between Hayve users">
          <View style={{ gap: 8 }}>
            {outgoing.map((r) => (
              <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar uri={r.other.avatar} name={r.other.displayName} size={36} />
                <View style={{ flex: 1 }}>
                  <T variant="subhead" weight="600">
                    {r.direction === 'incoming' ? `From ${r.other.displayName}` : `To ${r.other.displayName}`}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    {r.note || 'No note'} · {ago(r.createdAt)}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T variant="headline">{money(r.amountCents)}</T>
                  {r.status === 'pending' && r.direction === 'outgoing' ? (
                    <Pressable onPress={() => run(() => wallet.respondToRequest(r.id, false), { success: 'Request cancelled' })}>
                      <T variant="caption" color={color.grey500}>
                        Cancel
                      </T>
                    </Pressable>
                  ) : (
                    <StatusPill status={r.status === 'paid' ? 'paid' : r.status} />
                  )}
                </View>
              </Card>
            ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}

function LinkRow({ r }: { r: PayRequestView }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/pay/link/${r.id}`)} style={({ hovered, pressed }: { pressed: boolean; hovered?: boolean }) => ({ padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: hovered ? color.black : color.grey200, backgroundColor: pressed ? color.grey100 : color.white, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={r.kind === 'split' ? 'people-outline' : r.kind === 'business' ? 'invoice-outline' : r.kind === 'deposit' ? 'shield-checkmark-outline' : 'link-outline'} size={18} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" numberOfLines={1}>
            {r.title}
          </T>
          <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
            {KIND[r.kind]} · {r.expectedCount !== null ? `${r.paidCount}/${r.expectedCount} paid` : `${r.paidCount} payment${r.paidCount === 1 ? '' : 's'}`} · {ago(r.createdAt)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <T variant="headline">{money(r.amountCents)}</T>
          <StatusPill status={r.status} />
        </View>
      </View>
      {r.expectedCount !== null && r.expectedCount > 1 && r.status === 'pending' && <ProgressBar value={r.paidCount / r.expectedCount} />}
    </Pressable>
  );
}
