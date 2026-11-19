import { router } from 'expo-router';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Avatar, Button, Card, color, EmptyState, Header, Screen, Section, T } from '../../design';
import { StatusPill } from '../../features/common';
import { ago, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function Requests() {
  const all = useLive(() => wallet.moneyRequests()).data ?? [];
  const { run, busy } = useAction();
  const incoming = all.filter((r) => r.direction === 'incoming');
  const outgoing = all.filter((r) => r.direction === 'outgoing');
  const Item = ({ r }: { r: (typeof all)[number] }) => (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar uri={r.other.avatar} name={r.other.displayName} size={42} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{r.direction === 'incoming' ? `${r.other.displayName} requests` : `You requested from ${r.other.displayName}`}</T>
          <T variant="footnote" color={color.textSecondary}>
            {r.note || 'No note'} · {ago(r.createdAt)}
          </T>
        </View>
        <T variant="title3">{money(r.amountCents)}</T>
      </View>
      {r.status === 'pending' ? (
        r.direction === 'incoming' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Decline" variant="outline" style={{ flex: 1 }} onPress={() => run(() => wallet.respondToRequest(r.id, false), { success: 'Request declined' })} />
            <Button title={`Pay ${money(r.amountCents)}`} style={{ flex: 1.4 }} loading={busy} onPress={() => run(() => wallet.respondToRequest(r.id, true), { success: `Paid ${r.other.displayName}` })} />
          </View>
        ) : (
          <Button title="Cancel request" variant="ghost" onPress={() => run(() => wallet.respondToRequest(r.id, false), { success: 'Request cancelled' })} />
        )
      ) : (
        <StatusPill status={r.status === 'paid' ? 'completed' : r.status} />
      )}
    </Card>
  );
  return (
    <Screen header={<Header back title="Money requests" fallback="/pay" right={<Button title="New" icon="add" size="sm" onPress={() => router.push('/pay/request')} />} />} maxWidth={640}>
      {all.length === 0 && <EmptyState icon="hand-left-outline" title="No requests" body="Ask friends to pay you back for dinner, tickets or trips." action="Request money" onAction={() => router.push('/pay/request')} />}
      {incoming.length > 0 && (
        <Section title="Incoming" style={{ marginTop: 4 }}>
          <View style={{ gap: 10 }}>
            {incoming.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </View>
        </Section>
      )}
      {outgoing.length > 0 && (
        <Section title="Sent by you">
          <View style={{ gap: 10 }}>
            {outgoing.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}
