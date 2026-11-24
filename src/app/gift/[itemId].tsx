import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { type PayMethod, wishlist } from '../../backend/api';
import type { GiftQuote, GiftReceipt } from '../../backend/api/wishlist';
import { SuccessMark, Button, Card, color, Divider, Emoji, Header, KeyValue, Loading, Notice, Photo, radius, Screen, Section, Split, T, tap } from '../../design';
import { PayMethodPicker, WaveBackLine } from '../../features/common';
import { money } from '../../lib/format';

type Phase = { kind: 'reserving' } | { kind: 'ready'; quote: GiftQuote } | { kind: 'paying'; quote: GiftQuote } | { kind: 'done'; receipt: GiftReceipt } | { kind: 'failed'; message: string; canRetry: boolean };

/**
 * Anonymous wishlist gift checkout.
 * 1) reserve the wishlist item (atomic), 2) pay, 3) receipt.
 * The recipient is never told who bought it — their item simply shows "Sold".
 */
export default function GiftCheckout() {
  const { itemId, username, w } = useLocalSearchParams<{ itemId: string; username?: string; w?: string }>();
  const [phase, setPhase] = useState<Phase>({ kind: 'reserving' });
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [now, setNow] = useState(Date.now());
  const reservation = useRef<string | null>(null);
  const completed = useRef(false);

  const reserve = useCallback(() => {
    setPhase({ kind: 'reserving' });
    try {
      const quote = wishlist.reserveGift(itemId, w);
      reservation.current = quote.reservationId;
      setPhase({ kind: 'ready', quote });
    } catch (e) {
      setPhase({ kind: 'failed', message: (e as Error).message, canRetry: false });
    }
  }, [itemId, w]);

  useEffect(() => {
    reserve();
    return () => {
      // Leaving the checkout releases the item so others can gift it.
      if (reservation.current && !completed.current) {
        try {
          wishlist.releaseGift(reservation.current);
        } catch {}
      }
    };
  }, [reserve]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const back = `/u/${username ?? ''}${w ? `?w=${w}` : ''}`;

  if (phase.kind === 'reserving') return <Screen header={<Header back title="Send a gift" fallback={back} />} scroll={false}><Loading label="Reserving this item for you…" /></Screen>;

  if (phase.kind === 'failed') {
    return (
      <Screen header={<Header back title="Send a gift" fallback={back} />} maxWidth={560}>
        <View style={{ alignItems: 'center', marginTop: 32, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={32} />
          </View>
          <T variant="title2" center>
            Gift not completed
          </T>
          <T color={color.textSecondary} center>
            {phase.message}
          </T>
          <T variant="footnote" color={color.textTertiary} center>
            No money was taken. The item has been released back to the wishlist.
          </T>
          {phase.canRetry && <Button title="Try again" size="lg" full onPress={reserve} />}
          <Button title="Back to wishlist" variant="ghost" full onPress={() => router.replace(back as never)} />
        </View>
      </Screen>
    );
  }

  if (phase.kind === 'done') {
    const r = phase.receipt;
    return (
      <Screen header={<Header title="Gift sent" />} maxWidth={560}>
        <View style={{ alignItems: 'center', marginTop: 24, gap: 12 }}>
          <SuccessMark size={72} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="title2" center>
              Your gift is on its way
            </T>
            <Emoji char="🎁" size={24} />
          </View>
          <WaveBackLine cents={r.waveBackCents} />
          <T color={color.textSecondary} center>
            {r.recipientName} will see this item as “Sold” on their wishlist. They won't be told who bought it.
          </T>
          <Card style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <KeyValue label="Order reference" value={r.reference} />
            <KeyValue label="Gift" value={r.productTitle} />
            <KeyValue label="For" value={r.recipientName} />
            <KeyValue label="Status" value="Paid · awaiting shipment" />
            <Divider style={{ marginVertical: 8 }} />
            <KeyValue label="Total paid" value={money(r.totalCents)} strong />
          </Card>
          <Button title="View receipt" variant="outline" full onPress={() => router.push(`/pay/tx/${r.paymentTxId}`)} />
          <Button title="Track gift" size="lg" full onPress={() => router.replace(`/orders/${r.orderId}`)} />
        </View>
      </Screen>
    );
  }

  const q = phase.quote;
  const secondsLeft = Math.max(0, Math.round((q.expiresAt - now) / 1000));
  const expired = secondsLeft === 0;
  const pay = () => {
    tap();
    setPhase({ kind: 'paying', quote: q });
    try {
      const receipt = wishlist.confirmGift(q.reservationId, method);
      completed.current = true;
      reservation.current = null;
      setPhase({ kind: 'done', receipt });
    } catch (e) {
      reservation.current = null; // released by the backend
      setPhase({ kind: 'failed', message: (e as Error).message, canRetry: true });
    }
  };

  return (
    <Screen
      header={<Header back title={`Gift for ${q.recipient.displayName}`} fallback={back} />}
      footer={<Button title={expired ? 'Reservation expired' : `Send gift · ${money(q.totalCents)}`} icon="gift" size="lg" variant="primary" full loading={phase.kind === 'paying'} disabled={expired} onPress={pay} />}
    >
      <Split
        left={
          <View>
            <Card style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <Photo uri={q.product.image} style={{ width: 84, height: 100 }} rounded={radius.md} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="overline" color={color.black}>
                    From {q.recipient.displayName}'s wishlist
                  </T>
                  <T variant="headline" numberOfLines={2}>
                    {q.product.title}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    Sold by {q.product.seller}
                  </T>
                </View>
              </View>
            </Card>
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: color.grey100, borderRadius: radius.pill, paddingHorizontal: 12, height: 32 }}>
              <Icon name="time-outline" size={16} />
              <T variant="subhead" weight="700">
                {expired ? 'Reservation expired' : `Reserved for you · ${Math.floor(secondsLeft / 60)}:${`${secondsLeft % 60}`.padStart(2, '0')}`}
              </T>
            </View>
            <Section title="Delivery">
              <Notice icon="lock-closed-outline" title={`Delivered to ${q.recipient.displayName}'s saved address`} body={`${q.recipient.city}. The address stays private, and your identity is never shared with them.`} />
            </Section>
            <Section title="How anonymous gifting works">
              <View style={{ gap: 10 }}>
                {[
                  ['eye-off-outline', 'They only see “Sold”', 'No notification, name, photo or message is shown to the recipient.'],
                  ['shield-checkmark-outline', 'Buyer Protection included', 'If the parcel is lost, you get a full refund to Hayve Pay.'],
                  ['receipt-outline', 'You get the receipt', 'Track the order and delivery from your activity.'],
                ].map(([icon, t, b]) => (
                  <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
                    <Icon name={icon as 'eye-off-outline'} size={20} color={color.black} />
                    <View style={{ flex: 1 }}>
                      <T variant="headline">{t}</T>
                      <T variant="footnote" color={color.textSecondary}>
                        {b}
                      </T>
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          </View>
        }
        right={
          <View>
            <Section title="Pay with" style={{ marginTop: 8 }}>
              <PayMethodPicker value={method} onChange={setMethod} totalCents={q.totalCents} waveBackCents={q.waveBackCents} />
            </Section>
            <Section title="Summary">
              <Card>
                <KeyValue label="Item" value={money(q.priceCents)} />
                <KeyValue label="Fees" value={money(q.feeCents)} />
                <KeyValue label="Shipping · Hayve Send" value={money(q.shippingCents)} />
                <Divider style={{ marginVertical: 8 }} />
                <KeyValue label="Total" value={money(q.totalCents)} strong />
              </Card>
            </Section>
          </View>
        }
      />
    </Screen>
  );
}
