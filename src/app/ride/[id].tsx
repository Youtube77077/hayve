import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ride } from '../../backend/api';
import type { RideStatus } from '../../backend/types';
import { Avatar, Button, Card, CityMap, color, ConfirmSheet, ErrorState, Header, KeyValue, Rating, Screen, Split, Stars, SwitchRow, T, Timeline, useLayout, useToast } from '../../design';
import { SimNote, StatusPill } from '../../features/common';
import { dateTime, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const STEPS: { key: RideStatus; label: string }[] = [
  { key: 'requested', label: 'Finding a driver' },
  { key: 'accepted', label: 'Driver on the way' },
  { key: 'arriving', label: 'Driver arriving' },
  { key: 'in_progress', label: 'On the way to destination' },
  { key: 'completed', label: 'Arrived' },
];
const PROGRESS: Partial<Record<RideStatus, number>> = { requested: 0, accepted: 0.05, arriving: 0.12, in_progress: 0.55, completed: 1 };

/** Live trip tracking (simulated dispatch). */
export default function RideTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWide } = useLayout();
  const toast = useToast();
  const { data: r, error } = useLive(() => ride.getRide(id), [id]);
  const [auto, setAuto] = useState(true);
  const [cancel, setCancel] = useState(false);
  const [stars, setStars] = useState(0);
  const { run, busy } = useAction();

  const live = r && r.role === 'rider' && ['requested', 'accepted', 'arriving', 'in_progress'].includes(r.status);
  useEffect(() => {
    if (!live || !auto) return;
    const t = setTimeout(
      () => {
        try {
          ride.simulateRideStep(id);
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      },
      r?.status === 'requested' ? 3500 : 5000,
    );
    return () => clearTimeout(t);
  }, [live, auto, r?.status, id, toast]);

  if (error || !r) return <Screen header={<Header back title="Trip" fallback="/ride" />}>{error && <ErrorState message={error.message} />}</Screen>;
  const idx = STEPS.findIndex((s) => s.key === r.status);

  return (
    <Screen header={<Header back title={r.status === 'completed' ? 'Trip receipt' : 'Your trip'} subtitle={`${r.pickup.name} → ${r.dropoff.name}`} fallback="/ride" />}>
      <Split
        ratio={1}
        left={<CityMap from={r.pickup} to={r.dropoff} progress={PROGRESS[r.status]} height={isWide ? 520 : 260} />}
        right={
          <View style={{ marginTop: isWide ? 0 : 16, gap: 12 }}>
            {r.status === 'cancelled' ? (
              <Card>
                <StatusPill status="cancelled" />
                <T variant="title3" style={{ marginTop: 8 }}>
                  Trip cancelled
                </T>
                <T color={color.textSecondary}>Your reserved payment was released. You were not charged.</T>
              </Card>
            ) : (
              <>
                {r.driver ? (
                  <Card tone="dark">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar uri={r.driver.avatar} name={r.driver.displayName} size={54} ring />
                      <View style={{ flex: 1 }}>
                        <T variant="title3" color="#fff" numberOfLines={1}>
                          {r.driver.displayName}
                        </T>
                        <Rating value={r.driver.rating} count={r.driver.trips} light />
                      </View>
                      <View style={{ backgroundColor: color.lime, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <T variant="headline" style={{ letterSpacing: 1 }}>
                          {r.driver.vehicle.plate}
                        </T>
                      </View>
                    </View>
                    <T variant="footnote" color={color.textOnDarkSecondary} style={{ marginTop: 10 }}>
                      {r.driver.vehicle.color} {r.driver.vehicle.make} {r.driver.vehicle.model}
                    </T>
                  </Card>
                ) : (
                  <Card tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Icon name="radio-outline" size={24} color={color.primary} />
                    <View style={{ flex: 1 }}>
                      <T variant="headline">Matching you with a nearby driver</T>
                      <T variant="footnote" color={color.textSecondary}>
                        {r.categoryLabel} · usually under a minute
                      </T>
                    </View>
                  </Card>
                )}
                <Card>
                  <Timeline steps={STEPS} current={r.status === 'completed' ? STEPS.length : idx} />
                </Card>
              </>
            )}

            {r.status === 'completed' && r.role === 'rider' && (
              <Card>
                <T variant="headline" style={{ marginBottom: 8 }}>
                  {r.rating ? 'Thanks for rating!' : `Rate ${r.driver?.displayName.split(' ')[0] ?? 'your driver'}`}
                </T>
                <Stars value={r.rating ?? stars} onChange={(v) => !r.rating && setStars(v)} />
                {!r.rating && <Button title="Submit rating" style={{ marginTop: 12, alignSelf: 'flex-start' }} disabled={!stars} onPress={() => run(() => ride.rateRide(r.id, stars), { success: 'Rating submitted' })} />}
              </Card>
            )}

            <Card>
              <KeyValue label="Ride" value={r.categoryLabel} />
              <KeyValue label="Distance" value={`${r.distanceKm} km · ${r.durationMin} min`} />
              <KeyValue label="Requested" value={dateTime(r.createdAt)} />
              <KeyValue label={r.status === 'completed' ? 'Paid' : 'Fare (reserved)'} value={money(r.priceCents)} strong />
            </Card>

            {live && (
              <>
                <Card padded={false}>
                  <SwitchRow icon="flask-outline" title="Live simulation" subtitle="Automatically advance the trip like a real driver would" value={auto} onChange={setAuto} />
                </Card>
                {!auto && <Button title="Advance trip (simulation)" variant="secondary" onPress={() => ride.simulateRideStep(r.id)} />}
                {['requested', 'accepted', 'arriving'].includes(r.status) && <Button title="Cancel trip" variant="danger" onPress={() => setCancel(true)} />}
                <SimNote text="Dispatch and vehicle location are simulated. Drivers using Hayve Driver can also accept and update this trip." />
              </>
            )}
            {r.status === 'completed' && <Button title="Book another ride" variant="dark" size="lg" onPress={() => router.replace('/ride')} />}
          </View>
        }
      />
      <ConfirmSheet visible={cancel} title="Cancel this trip?" body="Your reserved fare will be released immediately." confirm="Cancel trip" destructive loading={busy} onClose={() => setCancel(false)} onConfirm={() => run(() => ride.cancelRide(r.id), { success: 'Trip cancelled', onDone: () => setCancel(false) })} />
    </Screen>
  );
}
