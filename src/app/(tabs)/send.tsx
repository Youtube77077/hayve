import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { type PayMethod, send } from '../../backend/api';
import type { Delivery, ParcelSize } from '../../backend/types';
import { Button, Card, color, Divider, Input, KeyValue, radius, Screen, Section, Split, T, tap } from '../../design';
import { PayMethodPicker, StatusPill, TabHeader } from '../../features/common';
import { money, shortDate } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const SIZE_ICON: Record<ParcelSize, React.ComponentProps<typeof Ionicons>['name']> = { S: 'mail-outline', M: 'cube-outline', L: 'archive-outline', XL: 'bus-outline' };

export default function Send() {
  const [pickup, setPickup] = useState('Cornelis Dirkszoonlaan 51, Amsterdam');
  const [dropoff, setDropoff] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [size, setSize] = useState<ParcelSize>('M');
  const [weight, setWeight] = useState('2');
  const [instructions, setInstructions] = useState('');
  const [speed, setSpeed] = useState<Delivery['speed']>('express');
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [code, setCode] = useState('');
  const { run, busy } = useAction();
  const history = useLive(() => send.myDeliveries().slice(0, 5)).data ?? [];
  const kg = Number(weight.replace(',', '.')) || 0;
  const price = kg > 0 ? send.quoteDelivery(size, kg, speed) : 0;

  const book = () =>
    run(() => send.bookDelivery({ pickup, dropoff, recipientName: name, recipientPhone: phone, size, weightKg: kg, instructions, speed, method }), {
      success: 'Parcel booked. Finding a courier…',
      onDone: (id) => router.push(`/send/${id}`),
    });

  return (
    <Screen header={<TabHeader service="send" subtitle="Same-day courier and parcels across the city" />} keyboard>
      <Split
        left={
          <View>
            <Card style={{ gap: 12 }}>
              <Input label="Collect from" icon="arrow-up-circle-outline" value={pickup} onChangeText={setPickup} />
              <Input label="Deliver to" icon="flag-outline" placeholder="Street, number, city" value={dropoff} onChangeText={setDropoff} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Input containerStyle={{ flex: 1 }} label="Recipient" icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} />
                <Input containerStyle={{ flex: 1 }} label="Phone" icon="call-outline" placeholder="+31 6…" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              </View>
            </Card>
            <Section title="Parcel size">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {send.PARCEL_SIZES.map((s) => {
                  const on = s.id === size;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        tap();
                        setSize(s.id);
                      }}
                      style={{ flexGrow: 1, flexBasis: '45%', padding: 14, borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? color.primary : color.line, backgroundColor: color.surface, gap: 6 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name={SIZE_ICON[s.id]} size={22} color={on ? color.primary : color.ink} />
                        <T variant="headline">{s.label}</T>
                        <View style={{ flex: 1 }} />
                        <T variant="footnote" color={color.textSecondary}>
                          ≤ {s.maxKg} kg
                        </T>
                      </View>
                      <T variant="footnote" color={color.textSecondary}>
                        {s.dims}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Input containerStyle={{ flex: 0.6 }} label="Weight (kg)" icon="barbell-outline" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
                <Input containerStyle={{ flex: 1 }} label="Instructions" icon="create-outline" placeholder="Fragile, ring bell 2…" value={instructions} onChangeText={setInstructions} />
              </View>
            </Section>
            <Section title="Delivery speed">
              <View style={{ gap: 8 }}>
                {send.SPEEDS.map((s) => {
                  const on = s.id === speed;
                  const p = kg > 0 ? send.quoteDelivery(size, kg, s.id) : 0;
                  return (
                    <Pressable key={s.id} onPress={() => setSpeed(s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? color.ink : color.line, backgroundColor: color.surface }}>
                      <Ionicons name={s.id === 'same_day' ? 'flash' : s.id === 'express' ? 'rocket-outline' : 'time-outline'} size={22} color={on ? color.primary : color.ink} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline">{s.label}</T>
                        <T variant="footnote" color={color.textSecondary}>
                          {s.eta}
                        </T>
                      </View>
                      <T variant="headline">{p ? money(p) : '—'}</T>
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          </View>
        }
        right={
          <View>
            <Section title="Pay with" style={{ marginTop: 0 }}>
              <PayMethodPicker value={method} onChange={setMethod} totalCents={price} />
            </Section>
            <Card style={{ marginTop: 16 }}>
              <KeyValue label={`${send.PARCEL_SIZES.find((s) => s.id === size)?.label} parcel · ${kg || 0} kg`} value={price ? money(price) : '—'} />
              <KeyValue label="Insurance up to €500" value="Included" />
              <Divider style={{ marginVertical: 6 }} />
              <KeyValue label="Total" value={price ? money(price) : '—'} strong />
              <Button title={price ? `Book courier · ${money(price)}` : 'Book courier'} size="lg" full style={{ marginTop: 12 }} loading={busy} disabled={!price} onPress={book} />
            </Card>
            <Section title="Track a parcel">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Input containerStyle={{ flex: 1 }} icon="barcode-outline" placeholder="HX-XXXXXX" autoCapitalize="characters" value={code} onChangeText={setCode} />
                <Button title="Track" variant="secondary" onPress={() => router.push(`/track/${code.trim()}`)} disabled={code.trim().length < 4} />
              </View>
            </Section>
            {history.length > 0 && (
              <Section title="Your deliveries" action="All" onAction={() => router.push('/orders?tab=parcels')}>
                <View style={{ gap: 8 }}>
                  {history.map((d) => (
                    <Card key={d.id} onPress={() => router.push(`/send/${d.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                      <Ionicons name="cube" size={22} color={color.primary} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline">To {d.recipientName}</T>
                        <T variant="footnote" color={color.textSecondary}>
                          {d.trackingCode} · {shortDate(d.createdAt)}
                        </T>
                      </View>
                      <StatusPill status={d.status} />
                    </Card>
                  ))}
                </View>
              </Section>
            )}
          </View>
        }
      />
    </Screen>
  );
}
