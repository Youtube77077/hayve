import { useState } from 'react';
import { View } from 'react-native';
import { ride } from '../../backend/api';
import type { RideCategory } from '../../backend/types';
import { Avatar, Button, Card, CityMap, color, Group, Header, Input, ListRow, Screen, Section, Select, SwitchRow, T, useLayout } from '../../design';
import { Empty, EarningsCard, MetricRow, RoleGate } from '../../features/business';
import { SimNote, StatusPill } from '../../features/common';
import { money, shortDate } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function DriverDashboard() {
  return (
    <RoleGate role="driver" title="Hayve Driver" onboarding={<RegisterDriver />}>
      <Dashboard />
    </RoleGate>
  );
}

function RegisterDriver() {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [plate, setPlate] = useState('');
  const [license, setLicense] = useState('');
  const [category, setCategory] = useState<RideCategory>('go');
  const { run, busy } = useAction();
  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <T variant="title2">Drive with Hayve Ride</T>
      <T color={color.textSecondary}>Set your own hours. You keep 80% of every fare, paid to Hayve Pay after each trip.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input containerStyle={{ flex: 1 }} label="Car make" value={make} onChangeText={setMake} placeholder="Toyota" />
        <Input containerStyle={{ flex: 1 }} label="Model" value={model} onChangeText={setModel} placeholder="Prius" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input containerStyle={{ flex: 1 }} label="Colour" value={colour} onChangeText={setColour} />
        <Input containerStyle={{ flex: 1 }} label="Number plate" autoCapitalize="characters" value={plate} onChangeText={setPlate} placeholder="AB-123-C" />
      </View>
      <Input label="Driving licence number" value={license} onChangeText={setLicense} />
      <Select label="Service level" value={category} onChange={setCategory} options={ride.RIDE_CATEGORIES.map((c) => ({ key: c.id, label: c.label, sub: c.blurb }))} />
      <SimNote text="Background checks, licence verification and insurance are simulated in this build." />
      <Button title="Register as a driver" size="lg" full loading={busy} onPress={() => run(() => ride.registerDriver({ make, model, color: colour, plate, licenseNumber: license, category }), { success: "You're registered. Go online to get trips." })} />
    </View>
  );
}

function Dashboard() {
  const { isWide } = useLayout();
  const profile = useLive(() => ride.driverProfile()).data;
  const queue = useLive(() => ride.driverQueue()).data ?? [];
  const trips = useLive(() => ride.driverTrips()).data ?? [];
  const { run } = useAction();
  const current = trips.find((t) => ['accepted', 'arriving', 'in_progress'].includes(t.status));
  const done = trips.filter((t) => t.status === 'completed');
  if (!profile) return null;
  const next = { accepted: "I've arrived at pickup", arriving: 'Start trip', in_progress: 'Complete trip' } as const;

  return (
    <Screen header={<Header back title="Hayve Driver" subtitle={`${profile.vehicle.color} ${profile.vehicle.make} ${profile.vehicle.model} · ${profile.vehicle.plate}`} fallback="/business" />}>
      <Card padded={false} style={{ marginBottom: 12, backgroundColor: profile.online ? color.limeSoft : color.surface }}>
        <SwitchRow icon="radio-outline" title={profile.online ? "You're online" : "You're offline"} subtitle={profile.online ? 'Receiving ride requests nearby' : 'Go online to receive ride requests'} value={profile.online} onChange={(v) => run(() => ride.setDriverOnline(v), { success: v ? 'Online, looking for trips' : 'Offline' })} />
      </Card>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <EarningsCard role="driver" label="Ride earnings" />
        </View>
        <View style={{ flex: 1 }}>
          <MetricRow
            items={[
              { label: 'Rating', value: profile.rating.toFixed(2), icon: 'star-outline' },
              { label: 'Lifetime trips', value: String(profile.trips), icon: 'speedometer-outline' },
              { label: 'Requests', value: String(queue.length), icon: 'notifications-outline' },
              { label: 'Trips (app)', value: String(done.length), icon: 'checkmark-done-outline' },
            ]}
          />
        </View>
      </View>

      {current && (
        <Section title="Current trip">
          <Card style={{ gap: 12 }}>
            <CityMap from={current.pickup} to={current.dropoff} progress={{ accepted: 0.05, arriving: 0.15, in_progress: 0.6 }[current.status as 'accepted']} height={180} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar uri={current.rider.avatar} name={current.rider.displayName} size={44} />
              <View style={{ flex: 1 }}>
                <T variant="headline">{current.rider.displayName}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {current.pickup.name} → {current.dropoff.name}
                </T>
              </View>
              <T variant="title3">{money(Math.round(current.priceCents * 0.8))}</T>
            </View>
            <StatusPill status={current.status} />
            <Button title={next[current.status as keyof typeof next]} variant="accent" size="lg" full onPress={() => run(() => ride.driverAdvance(current.id), { success: current.status === 'in_progress' ? 'Trip complete, earnings added' : undefined })} />
          </Card>
        </Section>
      )}

      <Section title="Ride requests">
        {!profile.online ? (
          <Empty text="Go online to see requests" />
        ) : queue.length === 0 ? (
          <Empty text="No requests right now" />
        ) : (
          <View style={{ gap: 10 }}>
            {queue.map((r) => (
              <Card key={r.id} style={{ gap: 10, borderWidth: 2, borderColor: color.lime }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar uri={r.rider.avatar} name={r.rider.displayName} size={40} />
                  <View style={{ flex: 1 }}>
                    <T variant="headline">
                      {r.pickup.name} → {r.dropoff.name}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {r.rider.displayName} · {r.categoryLabel} · {r.distanceKm} km · {r.durationMin} min
                    </T>
                  </View>
                  <T variant="title3">{money(Math.round(r.priceCents * 0.8))}</T>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Decline" variant="outline" style={{ flex: 1 }} onPress={() => run(() => ride.driverDecline(r.id))} />
                  <Button title="Accept" variant="accent" style={{ flex: 2 }} disabled={!!current} onPress={() => run(() => ride.driverAccept(r.id), { success: 'Trip accepted, head to pickup' })} />
                </View>
              </Card>
            ))}
          </View>
        )}
        <View style={{ marginTop: 10 }}>
          <SimNote text="Requests come from Hayve Ride customers. Switch to Sam's demo account and book a ride to see one here." />
        </View>
      </Section>

      <Section title="Trip history">
        {done.length === 0 ? (
          <Empty text="No completed trips yet" />
        ) : (
          <Group>
            {done.map((t) => (
              <ListRow key={t.id} icon="car-outline" title={`${t.pickup.name} → ${t.dropoff.name}`} subtitle={`${t.rider.displayName} · ${shortDate(t.createdAt)}`} value={money(Math.round(t.priceCents * 0.8))} />
            ))}
          </Group>
        )}
      </Section>
    </Screen>
  );
}
