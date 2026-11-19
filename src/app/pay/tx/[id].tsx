import { Icon } from '../../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Share, View } from 'react-native';
import { wallet } from '../../../backend/api';
import { Button, Card, color, Divider, ErrorState, Header, KeyValue, Screen, SimBadge, T } from '../../../design';
import { StatusPill } from '../../../features/common';
import { dateTime, money } from '../../../lib/format';
import { useLive } from '../../../lib/hooks';

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Top-up',
  withdrawal: 'Withdrawal',
  p2p: 'Transfer',
  purchase: 'Hayve Shop purchase',
  sale: 'Hayve Shop sale',
  gift_purchase: 'Wishlist gift',
  food_order: 'Hayve Bites order',
  ride: 'Hayve Ride trip',
  rental: 'Hayve Drive rental',
  stay: 'Hayve Stay booking',
  delivery: 'Hayve Send delivery',
  earning: 'Partner earnings',
  refund: 'Refund',
  merchant_payment: 'Hayve Pay checkout',
  fee: 'Fee',
};

const REF_ROUTE: Record<string, string> = { order: '/orders/', food: '/bites/order/', ride: '/ride/', rental: '/drive/booking/', stay: '/stay/booking/', delivery: '/send/' };

/** Payment receipt. */
export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error } = useLive(() => wallet.transaction(id), [id]);
  if (error || !t) return <Screen header={<Header back title="Receipt" fallback="/pay" />}>{error && <ErrorState message={error.message} />}</Screen>;
  const route = t.ref && REF_ROUTE[t.ref.kind];
  return (
    <Screen header={<Header back title="Receipt" fallback="/pay" />} maxWidth={520}>
      <View style={{ alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 20 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.direction === 'in' ? color.limeSoft : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={t.direction === 'in' ? 'arrow-down' : 'arrow-up'} size={28} color={t.direction === 'in' ? color.limeInk : color.primary} />
        </View>
        <T variant="callout" color={color.textSecondary}>
          {t.counterparty}
        </T>
        <T style={{ fontSize: 40, lineHeight: 40 + 8, fontWeight: '800', letterSpacing: -1, color: color.ink }}>
          {t.direction === 'in' ? '+' : '−'}
          {money(t.amountCents)}
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatusPill status={t.status} />
          <SimBadge />
        </View>
      </View>
      <Card>
        <KeyValue label="Type" value={TYPE_LABEL[t.type] ?? t.type} />
        {t.note && <KeyValue label="Description" value={t.note} />}
        <KeyValue label="Method" value={t.method === 'wallet' ? 'Hayve Pay balance' : t.method === 'card' ? 'Card •••• 4242' : t.method === 'bank' ? 'Bank transfer' : 'Hayve'} />
        <KeyValue label="Date" value={dateTime(t.createdAt)} />
        <Divider style={{ marginVertical: 8 }} />
        <KeyValue label="Reference" value={t.reference} />
        <KeyValue label="Currency" value="EUR" />
      </Card>
      {t.status === 'pending' && t.direction === 'in' && (
        <T variant="footnote" color={color.textSecondary} style={{ marginTop: 12 }}>
          Pending funds are released once the order is delivered or the booking is completed.
        </T>
      )}
      {t.status === 'reserved' && (
        <T variant="footnote" color={color.textSecondary} style={{ marginTop: 12 }}>
          These funds are reserved until the partner confirms. If they decline, the reservation is released automatically.
        </T>
      )}
      <View style={{ gap: 10, marginTop: 20 }}>
        {route && <Button title="View details" variant="secondary" full onPress={() => router.push(`${route}${t.ref!.id}` as never)} />}
        <Button title="Share receipt" variant="ghost" icon="share-outline" full onPress={() => void Share.share({ message: `Hayve receipt ${t.reference}: ${money(t.amountCents)} · ${t.counterparty} (simulated)` })} />
      </View>
    </Screen>
  );
}
