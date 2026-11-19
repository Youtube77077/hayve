import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { bookings, social } from '../../../backend/api';
import { Button, Card, color, ConfirmSheet, ErrorState, Header, KeyValue, Notice, Photo, prettyDate, radius, Screen, SimQR, T } from '../../../design';
import { StatusPill } from '../../../features/common';
import { money } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';

export default function RentalBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, error } = useLive(() => bookings.getRental(id), [id]);
  const [cancel, setCancel] = useState(false);
  const { run, busy } = useAction();
  if (error || !r) return <Screen header={<Header back title="Rental" fallback="/drive" />}>{error && <ErrorState message={error.message} />}</Screen>;
  return (
    <Screen header={<Header back title="Your rental" subtitle={r.reference} fallback="/drive" />} maxWidth={640}>
      <Photo uri={r.vehicle.images[0]} style={{ width: '100%', height: 200 }} rounded={radius.xl} icon="car-sport-outline" />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T variant="title2">
            {r.vehicle.make} {r.vehicle.model}
          </T>
          <T color={color.textSecondary}>Hosted by {r.hostName}</T>
        </View>
        <StatusPill status={r.status} />
      </View>
      <View style={{ marginTop: 14 }}>
        {r.status === 'requested' && <Notice tone="warning" icon="hourglass-outline" title="Waiting for the host" body="Your payment is reserved, not charged. If the host declines, it's released automatically." />}
        {r.status === 'confirmed' && <Notice tone="success" icon="checkmark-circle-outline" title="Confirmed" body="Show the code below at pickup. Bring your driving licence and ID." />}
        {r.status === 'declined' && <Notice tone="danger" icon="close-circle-outline" title="Declined by host" body="Your reserved payment was released." />}
      </View>
      <Card style={{ marginTop: 14 }}>
        <KeyValue label="Pickup" value={`${prettyDate(r.start, { weekday: 'short', day: 'numeric', month: 'short' })} · ${r.pickupLocation}`} />
        <KeyValue label="Return" value={`${prettyDate(r.end, { weekday: 'short', day: 'numeric', month: 'short' })} · ${r.returnLocation}`} />
        <KeyValue label="Duration" value={`${r.days} days`} />
        <KeyValue label="Total" value={money(r.totalCents)} strong />
      </Card>
      {r.status === 'confirmed' && (
        <Card style={{ marginTop: 14, alignItems: 'center', gap: 8 }}>
          <SimQR value={r.reference} size={150} />
          <T variant="headline">{r.reference}</T>
          <T variant="footnote" color={color.textSecondary}>
            Digital key & handover code (simulated)
          </T>
        </Card>
      )}
      <View style={{ gap: 10, marginTop: 16 }}>
        <Button title={`Message ${r.hostName.split(' ')[0]}`} variant="secondary" icon="chatbubble-outline" onPress={() => run(() => social.startThread(r.hostId, { kind: 'vehicle', id: r.vehicle.id, title: `${r.vehicle.make} ${r.vehicle.model}` }), { onDone: (t) => router.push(`/messages/${t}`) })} />
        {(r.status === 'requested' || r.status === 'confirmed') && r.role === 'renter' && <Button title="Cancel booking" variant="danger" onPress={() => setCancel(true)} />}
      </View>
      <ConfirmSheet visible={cancel} title="Cancel this rental?" body="You'll receive a full refund to Hayve Pay." confirm="Cancel rental" destructive loading={busy} onClose={() => setCancel(false)} onConfirm={() => run(() => bookings.cancelRental(r.id), { success: 'Rental cancelled', onDone: () => setCancel(false) })} />
    </Screen>
  );
}
