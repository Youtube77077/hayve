import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { bites, type PayMethod, social } from '../../backend/api';
import { Button, Card, color, Divider, EmptyState, Header, Input, KeyValue, Notice, Screen, Section, Split, Stepper, T } from '../../design';
import { PayMethodPicker } from '../../features/common';
import { cart, useCart } from '../../lib/cart';
import { money } from '../../lib/format';
import { useAction, NONE, useLive } from '../../lib/hooks';

export default function Basket() {
  const c = useCart();
  const priced = useLive(() => (c.restaurantId && c.lines.length ? bites.priceCart(c.restaurantId, c.lines) : null), [c]).data;
  const restaurant = useLive(() => (c.restaurantId ? bites.getRestaurant(c.restaurantId).restaurant : null), [c.restaurantId]).data;
  const addresses = useLive(() => social.addresses()).data ?? NONE;
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PayMethod>('wallet');
  const { run, busy } = useAction();

  useEffect(() => {
    if (!address && addresses.length) {
      const a = addresses.find((x) => x.isDefault) ?? addresses[0];
      setAddress(`${a.line1}, ${a.postcode} ${a.city}`);
    }
  }, [addresses, address]);

  if (!priced || !restaurant) {
    return (
      <Screen header={<Header back title="Basket" fallback="/bites" />}>
        <EmptyState icon="basket-outline" title="Your basket is empty" body="Add something tasty from a restaurant." action="Browse restaurants" onAction={() => router.replace('/bites')} />
      </Screen>
    );
  }

  const place = () =>
    run(() => bites.placeFoodOrder({ restaurantId: restaurant.id, lines: c.lines, address, note, method }), {
      success: 'Order placed 🎉',
      onDone: (id) => {
        cart.clear();
        router.replace(`/bites/order/${id}`);
      },
    });

  return (
    <Screen
      header={<Header back title="Checkout" subtitle={restaurant.name} fallback={`/bites/restaurant/${restaurant.id}`} />}
      keyboard
      footer={<Button title={`Place order · ${money(priced.totalCents)}`} size="lg" full loading={busy} disabled={!priced.meetsMinimum || !restaurant.isOpen} onPress={place} />}
    >
      <Split
        left={
          <View>
            {!restaurant.isOpen && <Notice tone="warning" title={`${restaurant.name} is closed`} body="You can place your order when they open." />}
            <Section title="Your order" style={{ marginTop: 8 }}>
              <Card style={{ gap: 14 }}>
                {priced.lines.map((l, i) => (
                  <View key={c.lines[i].key} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <T variant="headline">{l.name}</T>
                        {l.options.length > 0 && (
                          <T variant="footnote" color={color.textSecondary}>
                            {l.options.join(' · ')}
                          </T>
                        )}
                      </View>
                      <T variant="headline">{money(l.unitCents * l.qty)}</T>
                    </View>
                    <Stepper value={l.qty} min={0} max={20} onChange={(v) => cart.setQty(c.lines[i].key, v)} />
                    {i < priced.lines.length - 1 && <Divider />}
                  </View>
                ))}
              </Card>
              {!priced.meetsMinimum && (
                <T variant="footnote" color={color.danger} style={{ marginTop: 8 }}>
                  Add {money(priced.minOrderCents - priced.subtotalCents)} more to reach the {money(priced.minOrderCents)} minimum.
                </T>
              )}
            </Section>
            <Section title="Delivery">
              <View style={{ gap: 12 }}>
                <Input label="Address" icon="location-outline" value={address} onChangeText={setAddress} />
                <Input label="Note for the restaurant or courier" icon="create-outline" placeholder="Allergies, doorbell, floor…" value={note} onChangeText={setNote} />
                <T variant="footnote" color={color.textSecondary}>
                  Estimated arrival in {restaurant.etaMin}–{restaurant.etaMin + 10} minutes
                </T>
              </View>
            </Section>
          </View>
        }
        right={
          <View>
            <Section title="Pay with" style={{ marginTop: 8 }}>
              <PayMethodPicker value={method} onChange={setMethod} totalCents={priced.totalCents} />
            </Section>
            <Section title="Summary">
              <Card>
                <KeyValue label="Subtotal" value={money(priced.subtotalCents)} />
                <KeyValue label="Delivery fee" value={priced.deliveryFeeCents ? money(priced.deliveryFeeCents) : 'Free'} />
                {priced.fees.map((f) => (
                  <KeyValue key={f.label} label={f.label} value={money(f.cents)} />
                ))}
                {priced.addToAvoidSmallOrderCents > 0 && (
                  <T variant="caption" color={color.textSecondary} style={{ marginTop: 4 }}>
                    Add {money(priced.addToAvoidSmallOrderCents)} more to skip the small order fee.
                  </T>
                )}
                <Divider style={{ marginVertical: 8 }} />
                <KeyValue label="Total" value={money(priced.totalCents)} strong />
              </Card>
            </Section>
          </View>
        }
      />
    </Screen>
  );
}
