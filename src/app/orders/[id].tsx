import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { shop } from '../../backend/api';
import type { OrderView } from '../../backend/api/shop';
import { Button, Card, color, ConfirmSheet, Divider, ErrorState, Header, KeyValue, Notice, Photo, radius, Screen, Section, Split, T, Timeline } from '../../design';
import { SimNote, StatusPill } from '../../features/common';
import { dateTime, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const STEPS = [
  { key: 'paid', label: 'Paid' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: o, error } = useLive(() => shop.getOrder(id), [id]);
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState<OrderView['actions'][number] | null>(null);
  if (error || !o) return <Screen header={<Header back title="Order" fallback="/orders" />}>{error && <ErrorState message={error.message} />}</Screen>;

  const current = o.status === 'refunded' || o.status === 'cancelled' ? -1 : STEPS.findIndex((s) => s.key === o.status);
  const at = (s: string) => o.timeline.find((t) => t.status === s)?.at;
  const roleTitle = o.role === 'seller' ? (o.kind === 'gift' ? 'Hayve Gift sale' : 'Sale') : o.role === 'gift_purchaser' ? 'Gift you sent' : 'Purchase';

  const actionLabel: Record<OrderView['actions'][number], string> = {
    ship: 'Mark as shipped',
    deliver: 'Mark as delivered (simulate courier)',
    confirm: 'Everything is OK — release payment',
    cancel: o.role === 'seller' ? 'Cancel & refund buyer' : 'Cancel order',
    fail_delivery: 'Report failed delivery & refund',
  };

  return (
    <Screen header={<Header back title={roleTitle} subtitle={o.reference} fallback="/orders" />}>
      <Split
        left={
          <View>
            <Card style={{ marginTop: 8, flexDirection: 'row', gap: 14, alignItems: 'center' }} onPress={() => router.push(`/product/${o.product.id}`)}>
              <Photo uri={o.product.image} style={{ width: 76, height: 92 }} rounded={radius.md} />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="headline" numberOfLines={2}>
                  {o.product.title}
                </T>
                <T variant="footnote" color={color.textSecondary}>
                  {o.role === 'seller' ? 'Buyer' : 'Seller'}: {o.counterparty}
                </T>
                <StatusPill status={o.status} />
              </View>
            </Card>

            {o.kind === 'gift' && o.role === 'seller' && (
              <View style={{ marginTop: 12 }}>
                <Notice icon="gift-outline" title="Anonymous Hayve Gift" body="Ship to the address below. The buyer's identity is protected by Hayve and is not shared with you or the recipient. Don't include a packing slip with prices." />
              </View>
            )}
            {o.role === 'gift_purchaser' && (
              <View style={{ marginTop: 12 }}>
                <Notice icon="eye-off-outline" tone="success" title="Your gift is anonymous" body="The recipient only sees this item as Sold on their wishlist. Their address is kept private from you." />
              </View>
            )}

            <Section title="Tracking">
              <Card>
                {current < 0 ? (
                  <Notice tone="warning" icon="return-down-back-outline" title="Order refunded" body="The full amount was returned to the buyer's Hayve Pay balance." />
                ) : (
                  <Timeline steps={STEPS.map((s) => ({ ...s, sub: at(s.key) ? dateTime(at(s.key)!) : undefined }))} current={o.status === 'completed' ? 4 : current + (o.status === 'paid' ? 1 : 1)} />
                )}
              </Card>
            </Section>

            {o.actions.length > 0 && (
              <Section title="Actions">
                <View style={{ gap: 10 }}>
                  {o.actions.map((a) => (
                    <Button key={a} title={actionLabel[a]} variant={a === 'cancel' || a === 'fail_delivery' ? 'danger' : a === 'confirm' ? 'accent' : 'primary'} full loading={busy} onPress={() => (a === 'cancel' || a === 'fail_delivery' ? setConfirm(a) : run(() => shop.updateOrder(o.id, a), { success: 'Order updated' }))} />
                  ))}
                  {o.actions.includes('deliver') && <SimNote text="Courier tracking is simulated. In production Hayve Send updates this automatically." />}
                </View>
              </Section>
            )}
          </View>
        }
        right={
          <View>
            <Section title="Delivery" style={{ marginTop: 8 }}>
              <Card>
                <T variant="headline">{o.shipToLabel}</T>
                {o.shipTo && (
                  <T color={color.textSecondary} style={{ marginTop: 4 }}>
                    {o.shipTo.line1}
                    {'\n'}
                    {o.shipTo.postcode} {o.shipTo.city}, {o.shipTo.country}
                  </T>
                )}
              </Card>
            </Section>
            <Section title="Payment">
              <Card>
                <KeyValue label="Item" value={money(o.priceCents)} />
                {o.role !== 'seller' && (
                  <>
                    <KeyValue label="Buyer Protection" value={money(o.protectionFeeCents)} />
                    <KeyValue label="Shipping" value={money(o.shippingCents)} />
                  </>
                )}
                <Divider style={{ marginVertical: 8 }} />
                <KeyValue label={o.role === 'seller' ? 'You earn' : 'Total paid'} value={money(o.amountCents)} strong />
                {o.role === 'seller' && (
                  <T variant="footnote" color={color.textTertiary} style={{ marginTop: 6 }}>
                    {o.status === 'completed' ? 'Released to your Hayve Pay balance.' : o.status === 'refunded' ? 'Refunded to the buyer.' : 'Held as pending until delivery is confirmed.'}
                  </T>
                )}
                <T variant="footnote" color={color.textTertiary} style={{ marginTop: 6 }}>
                  Ordered {dateTime(o.createdAt)}
                </T>
              </Card>
            </Section>
          </View>
        }
      />
      <ConfirmSheet
        visible={!!confirm}
        title={confirm === 'fail_delivery' ? 'Report failed delivery?' : 'Cancel this order?'}
        body="The full amount is refunded to Hayve Pay and the item becomes available again."
        confirm={confirm === 'fail_delivery' ? 'Refund buyer' : 'Cancel order'}
        destructive
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => shop.updateOrder(o.id, confirm!), { success: 'Order refunded', onDone: () => setConfirm(null) })}
      />
    </Screen>
  );
}
