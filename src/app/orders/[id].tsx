import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { shop } from '../../backend/api';
import type { OrderAction } from '../../backend/api/shop';
import { Button, Card, color, ConfirmSheet, Divider, ErrorState, Header, Icon, Input, KeyValue, Notice, Photo, radius, Screen, Section, Split, Stars, T, Timeline } from '../../design';
import { SimNote, StatusPill } from '../../features/common';
import { dateTime, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const STEPS = [
  { key: 'paid', label: 'Paid' },
  { key: 'shipped', label: 'With Hayve Send' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];
const PICKUP_STEPS = [
  { key: 'paid', label: 'Paid' },
  { key: 'delivered', label: 'Picked up' },
  { key: 'completed', label: 'Completed' },
];
const SHIP_EVENTS: Record<string, string> = { label_created: 'Label created', in_transit: 'Handed to Hayve Send', out_for_delivery: 'Out for delivery', delivered: 'Delivered', returned: 'Returned to sender' };

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: o, error } = useLive(() => shop.getOrder(id), [id]);
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState<OrderAction | null>(null);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  if (error || !o) return <Screen header={<Header back title="Order" fallback="/orders" />}>{error && <ErrorState message={error.message} />}</Screen>;

  const steps = o.delivery === 'pickup' ? PICKUP_STEPS : STEPS;
  const idx = steps.findIndex((s) => s.key === o.status);
  const current = o.status === 'completed' ? steps.length : idx + 1;
  const at = (s: string) => o.timeline.find((t) => t.status === s)?.at;
  const roleTitle = o.role === 'seller' ? (o.kind === 'gift' ? 'Hayve Gift sale' : 'Sale') : o.role === 'gift_purchaser' ? 'Gift you sent' : 'Purchase';

  const actionLabel: Record<OrderAction, string> = {
    create_label: 'Create Hayve Send label',
    ship: 'Hand parcel to Hayve Send',
    handover: 'Mark as picked up',
    deliver: 'Mark as delivered (simulate courier)',
    confirm: 'Everything is OK. Release payment',
    cancel: o.role === 'seller' ? 'Cancel and refund buyer' : 'Cancel order',
    fail_delivery: 'Report failed delivery and refund',
  };

  return (
    <Screen header={<Header back title={roleTitle} subtitle={o.reference} fallback="/orders" />}>
      <Split
        left={
          <View>
            <Card style={{ marginTop: 8, flexDirection: 'row', gap: 16, alignItems: 'center' }} onPress={() => router.push(`/product/${o.product.id}`)}>
              <Photo uri={o.product.image} style={{ width: 76, height: 92 }} rounded={radius.md} />
              <View style={{ flex: 1, gap: 6 }}>
                <T variant="headline" numberOfLines={2}>
                  {o.product.title}
                </T>
                <T variant="footnote" color={color.grey500}>
                  {o.role === 'seller' ? 'Buyer' : 'Seller'}: {o.counterparty}
                </T>
                <StatusPill status={o.status} />
              </View>
            </Card>

            {o.kind === 'gift' && o.role === 'seller' && (
              <View style={{ marginTop: 12 }}>
                <Notice icon="gift-outline" title="Anonymous Hayve Gift" body="Ship to the address below. The buyer's identity is protected by Hayve and not shared with you or the recipient. Don't include a packing slip with prices." />
              </View>
            )}
            {o.role === 'gift_purchaser' && (
              <View style={{ marginTop: 12 }}>
                <Notice icon="eye-off-outline" title="Your gift is anonymous" body="The recipient only sees this item as Sold on their wishlist. Their address is kept private from you." />
              </View>
            )}

            <Section title="Progress">
              <Card>
                {o.status === 'refunded' ? (
                  <Notice icon="return-down-back-outline" title="Order refunded" body="The full amount went back to the buyer's Hayve balance." />
                ) : (
                  <Timeline steps={steps.map((s) => ({ ...s, sub: at(s.key) ? dateTime(at(s.key)!) : undefined }))} current={current} />
                )}
              </Card>
            </Section>

            {o.delivery === 'ship' && (
              <Section title="Hayve Send">
                <Card style={{ gap: 12 }}>
                  {o.shipment ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Icon name="cube-outline" size={22} />
                        <View style={{ flex: 1 }}>
                          <T variant="caption" color={color.grey500}>
                            Tracking code
                          </T>
                          <T variant="headline" style={{ letterSpacing: 0.5 }}>
                            {o.shipment.trackingCode}
                          </T>
                        </View>
                        <Button title="Track" size="sm" variant="outline" onPress={() => router.push(`/track/${o.shipment!.trackingCode}`)} />
                      </View>
                      <Divider />
                      {o.shipment.events.map((e, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <T variant="subhead" weight={i === o.shipment!.events.length - 1 ? '700' : '500'}>
                            {SHIP_EVENTS[e.status]}
                          </T>
                          <T variant="footnote" color={color.grey500}>
                            {dateTime(e.at)}
                          </T>
                        </View>
                      ))}
                      {o.role === 'seller' && o.status === 'paid' && (
                        <View style={{ padding: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: color.grey500, gap: 4 }}>
                          <T variant="overline" color={color.grey500}>
                            Shipping label
                          </T>
                          <T variant="subhead" weight="700">
                            {o.shipTo?.fullName}
                          </T>
                          <T variant="footnote">
                            {o.shipTo?.line1}, {o.shipTo?.postcode} {o.shipTo?.city}
                          </T>
                          <T variant="footnote" weight="700" style={{ letterSpacing: 2, marginTop: 4 }}>
                            ||| {o.shipment.trackingCode} |||
                          </T>
                        </View>
                      )}
                    </>
                  ) : (
                    <T color={color.grey500}>{o.role === 'seller' ? 'Create a label, pack the item and drop it at any Hayve Send point.' : 'The seller is preparing your parcel. You will see the tracking code here.'}</T>
                  )}
                </Card>
              </Section>
            )}

            {o.actions.length > 0 && (
              <Section title="Actions">
                <View style={{ gap: 10 }}>
                  {o.actions.map((a) => (
                    <Button key={a} title={actionLabel[a]} variant={a === 'cancel' || a === 'fail_delivery' ? 'outline' : 'primary'} size="lg" full loading={busy} onPress={() => (a === 'cancel' || a === 'fail_delivery' ? setConfirm(a) : run(() => shop.updateOrder(o.id, a), { success: a === 'create_label' ? 'Label created' : 'Order updated' }))} />
                  ))}
                  {o.actions.includes('deliver') && <SimNote text="Courier tracking is simulated in this preview build." />}
                </View>
              </Section>
            )}

            {(o.canReview || o.review) && (
              <Section title={o.review ? 'Your review' : `Rate ${o.counterparty}`}>
                <Card style={{ gap: 12 }}>
                  {o.review ? (
                    <>
                      <Stars value={o.review.rating} onChange={() => {}} size={22} />
                      {o.review.text ? <T color={color.grey500}>{o.review.text}</T> : null}
                    </>
                  ) : (
                    <>
                      <Stars value={stars} onChange={setStars} />
                      <Input placeholder="How was the item and the seller? (optional)" value={review} onChangeText={setReview} multiline maxLength={500} />
                      <Button title="Post review" disabled={!stars} onPress={() => run(() => shop.reviewOrder(o.id, stars, review), { success: 'Thanks for your review' })} style={{ alignSelf: 'flex-start' }} />
                    </>
                  )}
                </Card>
              </Section>
            )}
          </View>
        }
        right={
          <View>
            <Section title="Delivery" style={{ marginTop: 8 }}>
              <Card>
                <T variant="headline">{o.shipToLabel}</T>
                {o.shipTo && o.delivery === 'ship' && (
                  <T color={color.grey500} style={{ marginTop: 4 }}>
                    {o.shipTo.line1}
                    {'\n'}
                    {o.shipTo.postcode} {o.shipTo.city}, {o.shipTo.country}
                  </T>
                )}
              </Card>
            </Section>
            <Section title="Payment" action={o.invoiceAvailable ? 'VAT invoice' : undefined} onAction={() => router.push(`/invoice/${o.id}`)}>
              <Card>
                <KeyValue label="Item" value={money(o.priceCents)} />
                {o.role !== 'seller' && (
                  <>
                    <KeyValue label="Fees" value={money(o.feeCents)} />
                    {o.shippingCents > 0 && <KeyValue label="Shipping · Hayve Send" value={money(o.shippingCents)} />}
                  </>
                )}
                <Divider style={{ marginVertical: 8 }} />
                <KeyValue label={o.role === 'seller' ? 'You earn' : 'Total paid'} value={money(o.amountCents)} strong />
                {o.role === 'seller' && (
                  <T variant="footnote" color={color.grey500} style={{ marginTop: 6 }}>
                    {o.status === 'completed' ? 'Released to your Hayve balance.' : o.status === 'refunded' ? 'Refunded to the buyer.' : 'Held as pending until delivery is confirmed.'}
                  </T>
                )}
                <T variant="footnote" color={color.grey500} style={{ marginTop: 6 }}>
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
        body="The full amount is refunded to the buyer's Hayve balance and the item becomes available again."
        confirm={confirm === 'fail_delivery' ? 'Refund buyer' : 'Cancel order'}
        destructive
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => shop.updateOrder(o.id, confirm!), { success: 'Order refunded', onDone: () => setConfirm(null) })}
      />
    </Screen>
  );
}
