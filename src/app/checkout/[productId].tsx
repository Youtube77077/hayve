import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { type PayMethod, shop, social } from '../../backend/api';
import { Button, Card, color, Divider, ErrorState, Header, KeyValue, Photo, radius, Screen, Section, Split, T } from '../../design';
import { PayMethodPicker } from '../../features/common';
import { money } from '../../lib/format';
import { useAction, NONE, useLive } from '../../lib/hooks';

/** Ordinary Hayve Shop purchase: the buyer receives the item themselves. */
export default function Checkout() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { data: p, error } = useLive(() => shop.getProduct(productId), [productId]);
  const quote = useLive(() => shop.quote(productId), [productId]).data;
  const addresses = useLive(() => social.addresses()).data ?? NONE;
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [done, setDone] = useState<{ orderId: string; reference: string } | null>(null);
  const { run, busy } = useAction();

  useEffect(() => {
    if (!addressId && addresses.length) setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
  }, [addresses, addressId]);

  if (error || !p || !quote) return <Screen header={<Header back title="Checkout" />}>{error && <ErrorState message={error.message} />}</Screen>;

  if (done) {
    return (
      <Screen header={<Header title="Order confirmed" />} maxWidth={560}>
        <View style={{ alignItems: 'center', marginTop: 24, gap: 12 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: color.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={44} color={color.ink} />
          </View>
          <T variant="title2" center>
            It's yours!
          </T>
          <T color={color.textSecondary} center>
            {p.seller.displayName} has been notified and will ship within 3 days.
          </T>
          <Card style={{ alignSelf: 'stretch', marginTop: 12 }}>
            <KeyValue label="Order" value={done.reference} />
            <KeyValue label="Item" value={p.title} />
            <KeyValue label="Paid" value={money(quote.totalCents)} strong />
          </Card>
          <Button title="Track order" size="lg" full onPress={() => router.replace(`/orders/${done.orderId}`)} />
          <Button title="Keep shopping" variant="ghost" full onPress={() => router.replace('/shop')} />
        </View>
      </Screen>
    );
  }

  const summary = (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Photo uri={p.image} style={{ width: 72, height: 88 }} rounded={radius.sm} />
        <View style={{ flex: 1 }}>
          <T variant="headline" numberOfLines={2}>
            {p.title}
          </T>
          <T variant="footnote" color={color.textSecondary}>
            {shop.CONDITION_LABEL[p.condition]} · Sold by {p.seller.displayName}
          </T>
        </View>
      </View>
      <Divider style={{ marginVertical: 14 }} />
      <KeyValue label="Item" value={money(quote.priceCents)} />
      <KeyValue label="Buyer Protection" value={money(quote.protectionFeeCents)} />
      <KeyValue label="Shipping (Hayve Send)" value={money(quote.shippingCents)} />
      <Divider style={{ marginVertical: 8 }} />
      <KeyValue label="Total" value={money(quote.totalCents)} strong />
    </Card>
  );

  return (
    <Screen
      header={<Header back title="Checkout" fallback={`/product/${p.id}`} />}
      footer={<Button title={`Pay ${money(quote.totalCents)}`} size="lg" full loading={busy} disabled={!addressId || !p.available} onPress={() => run(() => shop.checkout(p.id, { addressId: addressId!, method }), { onDone: setDone })} />}
    >
      <Split
        left={
          <View>
            <Section title="Deliver to" action="Manage" onAction={() => router.push('/settings/addresses')} style={{ marginTop: 8 }}>
              {addresses.length === 0 ? (
                <Button title="Add a delivery address" icon="add" variant="secondary" onPress={() => router.push('/settings/addresses')} />
              ) : (
                <View style={{ gap: 8 }}>
                  {addresses.map((a) => (
                    <Pressable key={a.id} onPress={() => setAddressId(a.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.md, borderWidth: addressId === a.id ? 2 : 1, borderColor: addressId === a.id ? color.primary : color.line, backgroundColor: color.surface }}>
                      <Ionicons name="location-outline" size={20} color={color.primary} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline">{a.label}</T>
                        <T variant="footnote" color={color.textSecondary}>
                          {a.fullName} · {a.line1}, {a.postcode} {a.city}
                        </T>
                      </View>
                      <Ionicons name={addressId === a.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={addressId === a.id ? color.primary : color.lineStrong} />
                    </Pressable>
                  ))}
                </View>
              )}
            </Section>
            <Section title="Pay with">
              <PayMethodPicker value={method} onChange={setMethod} totalCents={quote.totalCents} />
            </Section>
          </View>
        }
        right={<Section title="Order summary" style={{ marginTop: 8 }}>{summary}</Section>}
      />
    </Screen>
  );
}
