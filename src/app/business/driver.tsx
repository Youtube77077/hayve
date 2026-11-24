import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { business, ride, social } from '../../backend/api';
import type { RideCategory } from '../../backend/types';
import { Appear, Avatar, Button, Card, color, Group, Header, Input, KeyValue, ListRow, ProgressBar, Screen, Section, Select, SwitchRow, T, useLayout, useToast } from '../../design';
import { RouteMap } from '../../features/map';
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

function IdCheckFirst({ role }: { role: 'driver' | 'courier' }) {
  return (
    <Card style={{ gap: 10, marginTop: 8 }}>
      <T variant="title3">Check your ID in 1 minute</T>
      <T color={color.textSecondary}>{role === 'driver' ? 'Your driving licence, your ID and a quick face check.' : 'Your ID and a quick face check.'} Then add your {role === 'driver' ? 'car' : 'vehicle'}.</T>
      <Button title="Check my ID" size="lg" full onPress={() => router.push(`/verify?role=${role}`)} />
    </Card>
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
  const kyc = useLive(() => business.identityStatus()).data;
  if (kyc?.status !== 'verified') return <IdCheckFirst role="driver" />;
  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <T variant="title2">Drive with Hayve Ride</T>
      <T color={color.textSecondary}>Set your own hours. You keep 85% of every fare, paid to Hayve Pay after each trip. Hayve's fee is 15%.</T>
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
      <SimNote text="ID and licence checked (demo). Background checks and insurance are simulated in this build." />
      <Button title="Register as a driver" size="lg" full loading={busy} onPress={() => run(() => ride.registerDriver({ make, model, color: colour, plate, licenseNumber: license, category }), { success: "You're registered. Go online to get trips." })} />
    </View>
  );
}

/** Shares the phone's GPS position while the driver is online (passengers see the car move). */
function useShareLocation(online: boolean) {
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    if (!online) return setSharing(false);
    let sub: Location.LocationSubscription | null = null;
    let last = 0;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted || cancelled) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 5000 }, (pos) => {
          if (Date.now() - last < 4000) return;
          last = Date.now();
          try {
            ride.driverUpdateLocation(pos.coords.longitude, pos.coords.latitude, pos.coords.heading ?? undefined);
            setSharing(true);
          } catch {
            /* offline or signed out */
          }
        });
      } catch {
        setSharing(false);
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [online]);
  return sharing;
}

function navigateTo(place: { lat: number; lng: number; name: string }) {
  const q = `${place.lat},${place.lng}`;
  const url = Platform.OS === 'ios' ? `maps://?daddr=${q}&dirflg=d` : Platform.OS === 'android' ? `google.navigation:q=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`));
}

function Dashboard() {
  const { isWide } = useLayout();
  const toast = useToast();
  const [clock, setClock] = useState(Date.now());
  const profile = useLive(() => ride.driverProfile()).data;
  const queue = useLive(() => ride.driverQueue(), [Math.floor(clock / 1000)]).data ?? [];
  const trips = useLive(() => ride.driverTrips()).data ?? [];
  const { run } = useAction();
  const sharing = useShareLocation(!!profile?.online);
  useEffect(() => {
    if (!queue.length) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [queue.length]);
  const current = trips.find((t) => ['accepted', 'arriving', 'in_progress'].includes(t.status));
  const done = trips.filter((t) => t.status === 'completed');
  const last = done[0];
  if (!profile) return null;
  const next = { accepted: ["I've arrived", 'Tell the passenger you are at the pickup point'], arriving: ['Start ride', 'Once the passenger is in the car'], in_progress: ['Complete ride', 'At the destination: Hayve charges the passenger'] } as const;
  const offer = queue[0];
  const goal = current ? (current.status === 'in_progress' ? current.dropoff : current.pickup) : null;

  return (
    <Screen header={<Header back title="Hayve Driver" subtitle={`${profile.vehicle.color} ${profile.vehicle.make} ${profile.vehicle.model} · ${profile.vehicle.plate}`} fallback="/business" />}>
      <Card padded={false} style={{ marginBottom: 12, borderColor: profile.online ? color.indigo : color.line }}>
        <SwitchRow icon="radio-outline" title={profile.online ? "You're online" : "You're offline"} subtitle={profile.online ? (sharing ? 'Sharing your location · requests come to you one at a time' : 'Receiving ride requests nearby') : 'Go online to receive ride requests'} value={profile.online} onChange={(v) => run(() => ride.setDriverOnline(v), { success: v ? 'Online, looking for trips' : 'Offline' })} />
      </Card>

      {offer && !current && (
        <Appear>
          <Card style={{ gap: 14, borderWidth: 2, borderColor: color.indigo, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T variant="title3">New ride request</T>
              <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: color.indigo, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="headline" color={color.black}>
                  {offer.offerSecondsLeft ?? 0}
                </T>
              </View>
            </View>
            <ProgressBar value={(offer.offerSecondsLeft ?? 0) / 15} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar uri={offer.rider.avatar} name={offer.rider.displayName} size={44} />
              <View style={{ flex: 1 }}>
                <T variant="headline">{offer.rider.displayName.split(' ')[0]}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {offer.categoryLabel} · {offer.distanceKm} km · {offer.durationMin} min trip
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="title2">{money(offer.split.driverCents)}</T>
                <T variant="caption" color={color.textSecondary}>
                  you receive
                </T>
              </View>
            </View>
            <View style={{ borderWidth: 1, borderColor: color.grey200, borderRadius: 12 }}>
              <ListRow icon="radio-button-off" title={offer.pickup.name} subtitle="Pickup" chevron={false} />
              <ListRow icon="square-outline" title={offer.dropoff.name} subtitle="Destination" chevron={false} />
            </View>
            <T variant="footnote" color={color.textSecondary}>
              Fare {money(offer.priceCents)} · Hayve fee {money(offer.split.hayveCents)} ({Math.round(offer.split.commissionRate * 100)}%)
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Decline" variant="outline" style={{ flex: 1 }} onPress={() => run(() => ride.driverDecline(offer.id), { success: 'Declined. It goes to the next driver.' })} />
              <Button title="Accept" size="lg" style={{ flex: 2 }} onPress={() => run(() => ride.driverAccept(offer.id), { success: 'Trip accepted, head to pickup' })} />
            </View>
          </Card>
        </Appear>
      )}

      {current && goal && (
        <Section title={current.status === 'in_progress' ? 'On trip' : 'Picking up'} style={{ marginTop: 0 }}>
          <Card style={{ gap: 12 }}>
            <RouteMap from={current.pickup} to={current.dropoff} progress={{ accepted: 0.05, arriving: 0.15, in_progress: 0.6 }[current.status as 'accepted']} height={200} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar uri={current.rider.avatar} name={current.rider.displayName} size={44} />
              <View style={{ flex: 1 }}>
                <T variant="headline">{current.rider.displayName}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {current.status === 'in_progress' ? `To ${current.dropoff.name}` : `Pick up at ${current.pickup.name}`}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="title3">{money(current.split.driverCents)}</T>
                <T variant="caption" color={color.textSecondary}>
                  you receive
                </T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Navigate" icon="navigate-outline" variant="secondary" style={{ flex: 1 }} onPress={() => navigateTo(goal)} />
              <Button title="Message" icon="chatbubble-outline" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => social.startThread(current.rider.id), { onDone: (tid) => router.push(`/messages/${tid}`) })} />
              <Button title="Call" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => toast(`Calling ${current.rider.displayName.split(' ')[0]} through a private Hayve number (simulated).`, 'info')} />
            </View>
            <StatusPill status={current.status} />
            <Button title={next[current.status as keyof typeof next][0]} size="lg" full onPress={() => run(() => ride.driverAdvance(current.id), { success: current.status === 'in_progress' ? `Ride complete · ${money(current.split.driverCents)} added to Hayve Pay` : undefined })} />
            <T variant="footnote" color={color.textSecondary} center>
              {next[current.status as keyof typeof next][1]}
            </T>
          </Card>
        </Section>
      )}

      {last && !current && last.payout && (
        <Section title="Last trip" style={{ marginTop: 0 }}>
          <Card style={{ gap: 4 }}>
            <T variant="headline">
              {last.pickup.name} → {last.dropoff.name}
            </T>
            <KeyValue label="Passenger paid" value={money(last.priceCents)} />
            <KeyValue label="You receive" value={money(last.payout.driverCents)} strong />
            <KeyValue label={`Hayve fee (${Math.round((last.payout.hayveCents / last.priceCents) * 100)}%)`} value={money(last.payout.hayveCents)} />
          </Card>
        </Section>
      )}

      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <EarningsCard role="driver" label="Ride earnings" />
        </View>
        <View style={{ flex: 1 }}>
          <MetricRow
            items={[
              { label: 'Rating', value: profile.rating.toFixed(2), icon: 'star-outline' },
              { label: 'Lifetime trips', value: String(profile.trips), icon: 'speedometer-outline' },
              { label: 'You keep', value: `${100 - Math.round((offer?.split.commissionRate ?? trips[0]?.split.commissionRate ?? 0.15) * 100)}%`, icon: 'wallet-outline' },
              { label: 'Trips (app)', value: String(done.length), icon: 'checkmark-done-outline' },
            ]}
          />
        </View>
      </View>

      {!offer && !current && (
        <Section title="Ride requests">
          <Empty text={profile.online ? 'Waiting for a request. Hayve offers each trip to the closest free driver.' : 'Go online to get requests'} />
          <View style={{ marginTop: 10 }}>
            <SimNote text="Requests come from Hayve Ride passengers nearby. Switch to Sam's demo account and book a ride to see one here (when you're the closest driver)." />
          </View>
        </Section>
      )}

      <Section title="Trip history">
        {done.length === 0 ? (
          <Empty text="No completed trips yet" />
        ) : (
          <Group>
            {done.map((t) => (
              <ListRow key={t.id} icon="taxi-outline" title={`${t.pickup.name} → ${t.dropoff.name}`} subtitle={`${t.rider.displayName} · ${shortDate(t.createdAt)}`} value={money(t.split.driverCents)} />
            ))}
          </Group>
        )}
      </Section>
    </Screen>
  );
}
