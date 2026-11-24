import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { type PayMethod, shop, social } from '../../backend/api';
import type { DeliveryMethod } from '../../backend/api/shop';
import { SuccessMark, Button, Card, color, Divider, Emoji, ErrorState, Header, Icon, type IconName, KeyValue, Photo, radius, Screen, Section, Split, T } from '../../design';
import { PayMethodPicker, SellerLine, WaveBackLine } from '../../features/common';
import { money } from '../../lib/format';
import { NONE, useAction, useLive } from '../../lib/hooks';

/** Hayve Shop checkout. Hayve Send appears here, only when the item is shipped. */
export default function Checkout() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [delivery, setDelivery] = useState<DeliveryMethod>('ship');
  const { data: p, error } = useLive(() => shop.getProduct(productId), [productId]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const quote = useLive(() => shop.quote(productId, delivery, addressId ?? undefined), [productId, delivery, addressId]).data;
  const addresses = useLive(() => social.addresses()).data ?? NONE;
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [done, setDone] = useState<{ orderId: string; reference: string; waveBackCents: number } | null>(null);
  const { run, busy } = useAction();

  useEffect(() => {
    if (!addressId && addresses.length) setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
  }, [addresses, addressId]);

  if (error || !p || !quote) return <Screen header={<Header back title="Checkout" />}>{error && <ErrorState message={error.message} />}</Screen>;

  if (done) {
    return (
      <Screen header={<Header title="Order confirmed" />} maxWidth={520}>
        <View style={{ alignItems: 'center', marginTop: 32, gap: 12 }}>
          <SuccessMark size={72} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="title2" center>
              It's yours
            </T>
            <Emoji char="🎉" size={24} />
          </View>
          <T color={color.grey500} center>
            {delivery === 'ship' ? `${p.seller.storeName ?? p.seller.displayName} will ship it with Hayve Send. You'll get a tracking code.` : `Arrange the pickup with ${p.seller.displayName} in Messages.`}
          </T>
          <WaveBackLine cents={done.waveBackCents} />
          <Card style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <KeyValue label="Order" value={done.reference} />
            <KeyValue label="Item" value={p.title} />
            <KeyValue label="Paid" value={money(quote.totalCents)} strong />
          </Card>
          <Button title="View order" size="lg" full onPress={() => router.replace(`/orders/${done.orderId}`)} />
          <Button title="Keep shopping" variant="outline" size="lg" full onPress={() => router.replace('/shop')} />
        </View>
      </Screen>
    );
  }

  const DeliveryOption = ({ k, icon, title, sub, price }: { k: DeliveryMethod; icon: IconName; title: string; sub: string; price: string }) => {
    const on = delivery === k;
    return (
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setDelivery(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: on ? 1.5 : 1, borderColor: on ? color.indigo : color.grey200 }}>
        <Icon name={icon} size={22} color={on ? color.indigo : color.black} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{title}</T>
          <T variant="footnote" color={color.grey500}>
            {sub}
          </T>
        </View>
        <T variant="subhead" weight="700">
          {price}
        </T>
      </Pressable>
    );
  };

  return (
    <Screen
      header={<Header back title="Checkout" fallback={`/product/${p.id}`} />}
      footer={<Button title={busy ? 'Processing payment…' : `Pay ${money(quote.totalCents)}`} size="lg" full loading={busy} disabled={(delivery === 'ship' && !addressId) || !p.available} onPress={() => run(() => shop.checkout(p.id, { addressId: addressId ?? undefined, method, delivery }), { onDone: setDone })} />}
    >
      <Split
        left={
          <View>
            <Section title="Delivery" style={{ marginTop: 8 }}>
              <View style={{ gap: 8 }}>
                <DeliveryOption k="ship" icon="cube-outline" title="Ship with Hayve Send" sub="Tracked parcel, 1–3 working days" price={money(395)} />
                <DeliveryOption k="pickup" icon="hand-left-outline" title="Pick up in person" sub={`Meet the seller in ${p.location}`} price="Free" />
              </View>
            </Section>
            {delivery === 'ship' && (
              <Section title="Ship to" action="Manage" onAction={() => router.push('/settings/addresses')}>
                {addresses.length === 0 ? (
                  <Button title="Add a delivery address" icon="add" variant="outline" onPress={() => router.push('/settings/addresses')} />
                ) : (
                  <View style={{ gap: 8 }}>
                    {addresses.map((a) => (
                      <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ selected: addressId === a.id }} onPress={() => setAddressId(a.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: radius.md, borderWidth: addressId === a.id ? 1.5 : 1, borderColor: addressId === a.id ? color.indigo : color.grey200 }}>
                        <Icon name="location-outline" size={20} />
                        <View style={{ flex: 1 }}>
                          <T variant="headline">{a.label}</T>
                          <T variant="footnote" color={color.grey500}>
                            {a.fullName} · {a.line1}, {a.postcode} {a.city}
                          </T>
                        </View>
                        <Icon name={addressId === a.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={addressId === a.id ? color.indigo : color.grey500} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </Section>
            )}
            <Section title="Pay with">
              <PayMethodPicker value={method} onChange={setMethod} totalCents={quote.totalCents} waveBackCents={quote.waveBackCents} />
            </Section>
          </View>
        }
        right={
          <Section title="Summary" style={{ marginTop: 8 }}>
            <Card>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Photo uri={p.image} style={{ width: 72, height: 88 }} rounded={radius.md} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T variant="headline" numberOfLines={2}>
                    {p.title}
                  </T>
                  <T variant="footnote" color={color.grey500}>
                    {shop.CONDITION_LABEL[p.condition]} · {p.seller.storeName ?? p.seller.displayName}
                  </T>
                  <SellerLine p={p} />
                </View>
              </View>
              <Divider style={{ marginVertical: 16 }} />
              <KeyValue label="Item" value={money(quote.priceCents)} />
              <KeyValue label="Fees" value={money(quote.feeCents)} />
              {delivery === 'ship' && <KeyValue label={quote.shippingZone === 'international' ? 'International shipping · Hayve Send' : quote.shippingZone === 'region' ? 'Cross-border shipping · Hayve Send' : 'Shipping · Hayve Send'} value={money(quote.shippingCents)} />}
              <Divider style={{ marginVertical: 8 }} />
              <KeyValue label="Total" value={money(quote.totalCents)} strong />
            </Card>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Icon name="shield-checkmark-outline" size={18} />
              <T variant="footnote" color={color.grey500} style={{ flex: 1 }}>
                Your payment is held until you confirm the item arrived as described. Refunds go straight back to your Hayve balance.
              </T>
            </View>
          </Section>
        }
      />
    </Screen>
  );
}
