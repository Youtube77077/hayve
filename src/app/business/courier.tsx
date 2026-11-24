import { useState } from 'react';
import { View } from 'react-native';
import { bites, business, send } from '../../backend/api';
import { router } from 'expo-router';
import type { CourierProfile } from '../../backend/types';
import { Button, Card, color, Group, Header, ListRow, Screen, Section, Segmented, Select, SwitchRow, T, useLayout } from '../../design';
import { Empty, EarningsCard, MetricRow, RoleGate } from '../../features/business';
import { SimNote, StatusPill } from '../../features/common';
import { money, shortDate } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

function IdCheckFirst({ role }: { role: 'driver' | 'courier' }) {
  return (
    <Card style={{ gap: 10, marginTop: 8 }}>
      <T variant="title3">Check your ID in 1 minute</T>
      <T color={color.textSecondary}>{role === 'driver' ? 'Your driving licence, your ID and a quick face check.' : 'Your ID and a quick face check.'} Then add your {role === 'driver' ? 'car' : 'vehicle'}.</T>
      <Button title="Check my ID" size="lg" full onPress={() => router.push(`/verify?role=${role}`)} />
    </Card>
  );
}

export default function CourierDashboard() {
  return (
    <RoleGate role="courier" title="Hayve Courier" onboarding={<RegisterCourier />}>
      <Dashboard />
    </RoleGate>
  );
}

function RegisterCourier() {
  const [vehicle, setVehicle] = useState<CourierProfile['vehicle']>('e-bike');
  const { run, busy } = useAction();
  const kyc = useLive(() => business.identityStatus()).data;
  if (kyc?.status !== 'verified') return <IdCheckFirst role="courier" />;
  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <T variant="title2">Deliver with Hayve</T>
      <T color={color.textSecondary}>Deliver Hayve Bites orders and Hayve Send parcels. Choose your hours and get paid per job.</T>
      <Select
        label="How will you deliver?"
        value={vehicle}
        onChange={setVehicle}
        options={[
          { key: 'bike', label: 'Bicycle' },
          { key: 'e-bike', label: 'E-bike' },
          { key: 'scooter', label: 'Scooter' },
          { key: 'car', label: 'Car' },
          { key: 'van', label: 'Van (XL parcels)' },
        ]}
      />
      <SimNote text="ID checked (demo). Insurance is simulated in this build." />
      <Button title="Register as a courier" size="lg" full loading={busy} onPress={() => run(() => send.registerCourier(vehicle), { success: "You're registered. Go online to get jobs." })} />
    </View>
  );
}

function Dashboard() {
  const { isWide } = useLayout();
  const profile = useLive(() => send.courierProfile()).data;
  const queue = useLive(() => send.courierQueue()).data ?? [];
  const jobs = useLive(() => send.courierJobs()).data ?? [];
  const food = useLive(() => bites.courierFoodJobs()).data ?? [];
  const [tab, setTab] = useState<'parcels' | 'food'>('parcels');
  const { run } = useAction();
  if (!profile) return null;
  const active = jobs.filter((j) => ['assigned', 'picked_up', 'in_transit'].includes(j.status));
  const done = jobs.filter((j) => j.status === 'delivered');
  const nextLabel = { assigned: 'Mark collected', picked_up: 'Start delivery', in_transit: 'Mark delivered' } as const;

  return (
    <Screen header={<Header back title="Hayve Courier" subtitle={`Delivering by ${profile.vehicle}`} fallback="/business" />}>
      <Card padded={false} style={{ marginBottom: 12, borderColor: profile.online ? color.black : color.line }}>
        <SwitchRow icon="radio-outline" title={profile.online ? "You're online" : "You're offline"} subtitle="Go online to receive delivery requests" value={profile.online} onChange={(v) => run(() => send.setCourierOnline(v), { success: v ? 'Online' : 'Offline' })} />
      </Card>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <EarningsCard role="courier" label="Delivery earnings" />
        </View>
        <View style={{ flex: 1 }}>
          <MetricRow
            items={[
              { label: 'Rating', value: profile.rating.toFixed(2), icon: 'star-outline' },
              { label: 'Lifetime jobs', value: String(profile.jobs), icon: 'bicycle-outline' },
              { label: 'Active', value: String(active.length + food.filter((f) => f.courierId).length), icon: 'navigate-outline' },
              { label: 'Open requests', value: String(queue.length + food.filter((f) => !f.courierId).length), icon: 'notifications-outline' },
            ]}
          />
        </View>
      </View>
      <View style={{ marginTop: 20, maxWidth: 420 }}>
        <Segmented value={tab} onChange={setTab} options={[{ key: 'parcels', label: 'Hayve Send' }, { key: 'food', label: 'Hayve Bites' }]} />
      </View>

      {tab === 'parcels' ? (
        <>
          {active.length > 0 && (
            <Section title="Active deliveries" style={{ marginTop: 16 }}>
              <View style={{ gap: 10 }}>
                {active.map((d) => (
                  <Card key={d.id} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <T variant="headline" style={{ flex: 1 }}>
                        {d.trackingCode} · {d.size} parcel
                      </T>
                      <StatusPill status={d.status} />
                    </View>
                    <T variant="footnote" color={color.textSecondary}>
                      Collect: {d.pickup}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      Deliver: {d.dropoff} · {d.recipientName} ({d.recipientPhone})
                    </T>
                    {d.instructions ? <T variant="footnote">Note: {d.instructions}</T> : null}
                    <Button title={nextLabel[d.status as keyof typeof nextLabel]} variant="accent" onPress={() => run(() => send.courierAdvance(d.id), { success: d.status === 'in_transit' ? 'Delivered, earnings added' : undefined })} />
                  </Card>
                ))}
              </View>
            </Section>
          )}
          <Section title="Delivery requests" style={{ marginTop: active.length ? undefined : 16 }}>
            {!profile.online ? (
              <Empty text="Go online to see requests" />
            ) : queue.length === 0 ? (
              <Empty text="No parcel requests right now" />
            ) : (
              <View style={{ gap: 10 }}>
                {queue.map((d) => (
                  <Card key={d.id} style={{ gap: 8, borderWidth: 1, borderColor: color.black }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <T variant="headline" style={{ flex: 1 }}>
                        {d.size} parcel · {d.weightKg} kg · {d.speed.replace('_', ' ')}
                      </T>
                      <T variant="title3">{money(Math.round(d.priceCents * 0.75))}</T>
                    </View>
                    <T variant="footnote" color={color.textSecondary}>
                      {d.pickup} → {d.dropoff}
                    </T>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Decline" variant="outline" style={{ flex: 1 }} onPress={() => run(() => send.courierDecline(d.id))} />
                      <Button title="Accept" variant="accent" style={{ flex: 2 }} onPress={() => run(() => send.courierAccept(d.id), { success: 'Job accepted' })} />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </Section>
          <Section title="History">
            {done.length === 0 ? (
              <Empty text="No deliveries yet" />
            ) : (
              <Group>
                {done.map((d) => (
                  <ListRow key={d.id} icon="cube-outline" title={`${d.trackingCode} · to ${d.recipientName}`} subtitle={shortDate(d.createdAt)} value={money(Math.round(d.priceCents * 0.75))} />
                ))}
              </Group>
            )}
          </Section>
        </>
      ) : (
        <Section title="Food deliveries" style={{ marginTop: 16 }}>
          {food.length === 0 ? (
            <Empty text="No food orders ready for pickup" />
          ) : (
            <View style={{ gap: 10 }}>
              {food.map((o) => (
                <Card key={o.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <T variant="headline" style={{ flex: 1 }}>
                      {o.restaurant.name} · {o.reference}
                    </T>
                    <StatusPill status={o.status} />
                  </View>
                  <T variant="footnote" color={color.textSecondary}>
                    Pickup: {o.restaurant.address} → {o.address}
                  </T>
                  <T variant="footnote">Earn {money(o.deliveryFeeCents + 250)}</T>
                  {!o.courierId && <Button title="Accept job" variant="accent" onPress={() => run(() => bites.courierFoodAction(o.id, 'accept'), { success: 'Head to the restaurant' })} />}
                  {o.courierId && o.status === 'ready' && <Button title="Picked up" onPress={() => run(() => bites.courierFoodAction(o.id, 'pickup'))} />}
                  {o.courierId && o.status === 'picked_up' && <Button title="Delivered" variant="accent" onPress={() => run(() => bites.courierFoodAction(o.id, 'deliver'), { success: 'Delivered, earnings added' })} />}
                </Card>
              ))}
            </View>
          )}
          <View style={{ marginTop: 10 }}>
            <SimNote text="Food orders appear here once the restaurant marks them ready in Hayve Kitchen." />
          </View>
        </Section>
      )}
    </Screen>
  );
}
