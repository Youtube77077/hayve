import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { type PayMethod, ride } from '../../backend/api';
import type { RideCategory } from '../../backend/types';
import { Button, Card, CityMap, color, Input, radius, Screen, Section, Sheet, Split, T, tap, useLayout } from '../../design';
import { PayMethodPicker, StatusPill, TabHeader } from '../../features/common';
import { money, shortDate, time } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const CAR_ICON: Record<RideCategory, React.ComponentProps<typeof Ionicons>['name']> = { go: 'car-outline', green: 'leaf-outline', priority: 'flash-outline', comfort: 'car-sport-outline', xl: 'bus-outline' };

export default function Ride() {
  const { isWide } = useLayout();
  const places = useLive(() => ride.places()).data ?? [];
  const active = useLive(() => ride.activeRide()).data;
  const history = useLive(() => ride.myRides().filter((r) => r.status === 'completed' || r.status === 'cancelled').slice(0, 5)).data ?? [];
  const [pickup, setPickup] = useState('home');
  const [dropoff, setDropoff] = useState<string | null>(null);
  const [picking, setPicking] = useState<'pickup' | 'dropoff' | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<RideCategory>('go');
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [payOpen, setPayOpen] = useState(false);
  const { run, busy } = useAction();

  const options = useLive(() => (dropoff ? ride.quoteRide(pickup, dropoff) : []), [pickup, dropoff]).data ?? [];
  const from = places.find((p) => p.id === pickup);
  const to = places.find((p) => p.id === dropoff);
  const selected = options.find((o) => o.category === category);
  const filtered = useMemo(() => places.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(q.toLowerCase())), [places, q]);

  const request = () =>
    run(() => ride.requestRide(pickup, dropoff!, category, method), {
      success: 'Finding you a driver…',
      onDone: (id) => router.push(`/ride/${id}`),
    });

  const planner = (
    <View>
      <Card style={{ gap: 0, padding: 0 }}>
        <PlaceRow icon="ellipse" label="Pickup" value={from?.name} sub={from?.address} onPress={() => setPicking('pickup')} />
        <View style={{ height: 1, backgroundColor: color.line, marginLeft: 52 }} />
        <PlaceRow icon="square" label="Where to?" value={to?.name} sub={to?.address} onPress={() => setPicking('dropoff')} placeholder />
      </Card>
      {!dropoff && (
        <View style={{ marginTop: 12, gap: 8 }}>
          {places
            .filter((p) => ['work', 'centraal', 'schiphol', 'rijks'].includes(p.id))
            .map((p) => (
              <Pressable key={p.id} onPress={() => setDropoff(p.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: pressed ? color.surfaceSunken : color.surface, borderWidth: 1, borderColor: color.line })}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={p.id === 'work' ? 'briefcase-outline' : p.id === 'schiphol' ? 'airplane-outline' : 'time-outline'} size={18} color={color.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="headline">{p.name}</T>
                  <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
                    {p.address}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
              </Pressable>
            ))}
        </View>
      )}
      {options.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 10 }}>
            <Ionicons name="trending-up" size={16} color={color.textSecondary} />
            <T variant="subhead" color={color.textSecondary}>
              {options[0].durationMin} min trip · fares include all fees
            </T>
          </View>
          <View style={{ gap: 8 }}>
            {options.map((o) => {
              const on = o.category === category;
              return (
                <Pressable
                  key={o.category}
                  onPress={() => {
                    tap();
                    setCategory(o.category);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, borderWidth: on ? 2.5 : 1, borderColor: on ? color.ink : color.line, backgroundColor: color.surface }}
                >
                  <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: on ? color.ink : color.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={CAR_ICON[o.category]} size={26} color={on ? color.lime : color.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T variant="title3">{o.label}</T>
                      <Ionicons name="person" size={13} color={color.textSecondary} />
                      <T variant="footnote" color={color.textSecondary}>
                        {o.seats}
                      </T>
                    </View>
                    <T variant="footnote" color={color.textSecondary}>
                      {time(o.arrivalAt)} arrival · {o.pickupEtaMin} min away
                    </T>
                  </View>
                  <T variant="title3">{money(o.priceCents)}</T>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setPayOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 14, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}>
            <Ionicons name={method === 'wallet' ? 'wallet' : 'card-outline'} size={20} color={color.primary} />
            <T variant="headline" style={{ flex: 1 }}>
              {method === 'wallet' ? 'Hayve Pay balance' : method === 'card' ? 'Visa •••• 4242' : 'Test card (declines)'}
            </T>
            <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
          </Pressable>
          <Button title={`Choose ${selected?.label ?? ''}`} size="lg" variant="dark" full style={{ marginTop: 12 }} loading={busy} onPress={request} />
        </>
      )}
    </View>
  );

  return (
    <Screen header={<TabHeader service="ride" subtitle="Amsterdam · average wait 4–8 min" />}>
      {active && (
        <Card tone="dark" style={{ marginBottom: 14 }} onPress={() => router.push(`/ride/${active.id}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="navigate" size={22} color={color.lime} />
            <View style={{ flex: 1 }}>
              <T variant="headline" color="#fff">
                Trip in progress
              </T>
              <T variant="footnote" color={color.textOnDarkSecondary}>
                To {active.dropoff.name}
              </T>
            </View>
            <StatusPill status={active.status} />
          </View>
        </Card>
      )}
      <Split
        ratio={1}
        left={<CityMap from={from} to={to} height={isWide ? 520 : 240} markers={places.map((p) => ({ x: p.x, y: p.y, icon: 'location' }))} />}
        right={<View style={{ marginTop: isWide ? 0 : 16 }}>{planner}</View>}
      />
      {history.length > 0 && (
        <Section title="Recent trips" action="All" onAction={() => router.push('/orders?tab=rides')}>
          <View style={{ gap: 8 }}>
            {history.map((r) => (
              <Card key={r.id} onPress={() => router.push(`/ride/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="car-outline" size={22} color={color.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="headline">{r.dropoff.name}</T>
                  <T variant="footnote" color={color.textSecondary}>
                    {shortDate(r.createdAt)} · {money(r.priceCents)}
                  </T>
                </View>
                <Button
                  title="Rebook"
                  icon="refresh"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setPickup(r.pickup.id);
                    setDropoff(r.dropoff.id);
                  }}
                />
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Sheet visible={!!picking} onClose={() => setPicking(null)} title={picking === 'pickup' ? 'Pickup location' : 'Where to?'}>
        <Input icon="search" placeholder="Search places" value={q} onChangeText={setQ} autoFocus />
        <View style={{ marginTop: 10 }}>
          {filtered.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                tap();
                if (picking === 'pickup') {
                  setPickup(p.id);
                  if (dropoff === p.id) setDropoff(null);
                } else setDropoff(p.id === pickup ? null : p.id);
                setPicking(null);
                setQ('');
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.md, backgroundColor: pressed ? color.surfaceSunken : 'transparent' })}
            >
              <Ionicons name="location-outline" size={20} color={color.primary} />
              <View style={{ flex: 1 }}>
                <T variant="headline">{p.name}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {p.address}
                </T>
              </View>
            </Pressable>
          ))}
        </View>
      </Sheet>
      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Payment" footer={<Button title="Done" full size="lg" onPress={() => setPayOpen(false)} />}>
        <PayMethodPicker value={method} onChange={setMethod} totalCents={selected?.priceCents ?? 0} />
      </Sheet>
    </Screen>
  );
}

function PlaceRow({ icon, label, value, sub, onPress, placeholder }: { icon: 'ellipse' | 'square'; label: string; value?: string; sub?: string; onPress: () => void; placeholder?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: pressed ? color.surfaceSunken : 'transparent' })}>
      <Ionicons name={icon} size={14} color={color.ink} style={{ marginHorizontal: 5 }} />
      <View style={{ flex: 1 }}>
        {value ? (
          <>
            <T variant="headline">{value}</T>
            <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
              {sub}
            </T>
          </>
        ) : (
          <T variant="title3" color={placeholder ? color.textSecondary : color.text}>
            {label}
          </T>
        )}
      </View>
      <Ionicons name="search" size={18} color={color.textTertiary} />
    </Pressable>
  );
}
