import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { bookings, social } from '../../../backend/api';
import { Button, Card, color, ConfirmSheet, ErrorState, Header, KeyValue, Notice, Photo, prettyDate, radius, Screen, T } from '../../../design';
import { StatusPill } from '../../../features/common';
import { money } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';

export default function StayBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, error } = useLive(() => bookings.getStay(id), [id]);
  const [cancel, setCancel] = useState(false);
  const { run, busy } = useAction();
  if (error || !b) return <Screen header={<Header back title="Reservation" fallback="/stay" />}>{error && <ErrorState message={error.message} />}</Screen>;
  return (
    <Screen header={<Header back title="Your reservation" subtitle={b.reference} fallback="/stay" />} maxWidth={640}>
      <Photo uri={b.property.images[0]} style={{ width: '100%', height: 220 }} rounded={radius.xl} icon="bed-outline" />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T variant="title2">{b.property.title}</T>
          <T color={color.textSecondary}>
            {b.property.neighbourhood}, {b.property.city} · Host {b.hostName}
          </T>
        </View>
        <StatusPill status={b.status} />
      </View>
      <View style={{ marginTop: 14 }}>
        {b.status === 'requested' && <Notice tone="warning" icon="hourglass-outline" title="Waiting for your host" body="Your payment is reserved. If the host declines, it's released automatically." />}
        {b.status === 'confirmed' && <Notice tone="success" icon="checkmark-circle-outline" title="You're going!" body="Check-in instructions and the exact address are shared by your host in Messages." />}
        {b.status === 'declined' && <Notice tone="danger" icon="close-circle-outline" title="Request declined" body="Your reserved payment was released." />}
        {b.status === 'cancelled' && <Notice tone="info" icon="return-down-back-outline" title="Cancelled" body="Refunded to your Hayve Pay balance." />}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1 }}>
          <T variant="caption" color={color.textTertiary}>
            Check-in
          </T>
          <T variant="title3">{prettyDate(b.checkIn, { weekday: 'short', day: 'numeric', month: 'short' })}</T>
          <T variant="footnote" color={color.textSecondary}>
            From 15:00
          </T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T variant="caption" color={color.textTertiary}>
            Checkout
          </T>
          <T variant="title3">{prettyDate(b.checkOut, { weekday: 'short', day: 'numeric', month: 'short' })}</T>
          <T variant="footnote" color={color.textSecondary}>
            Until 11:00
          </T>
        </Card>
      </View>
      <Card style={{ marginTop: 10 }}>
        <KeyValue label="Guests" value={String(b.guests)} />
        <KeyValue label="Nights" value={String(b.nights)} />
        <KeyValue label="Total" value={money(b.totalCents)} strong />
      </Card>
      <View style={{ gap: 10, marginTop: 16 }}>
        <Button title={`Message ${b.hostName.split(' ')[0]}`} variant="secondary" icon="chatbubble-outline" onPress={() => run(() => social.startThread(b.hostId, { kind: 'property', id: b.property.id, title: b.property.title }), { onDone: (t) => router.push(`/messages/${t}`) })} />
        <Button title="Get a ride there" icon="car-sport-outline" variant="outline" onPress={() => router.push('/ride')} />
        {(b.status === 'requested' || b.status === 'confirmed') && b.role === 'guest' && <Button title="Cancel reservation" variant="danger" onPress={() => setCancel(true)} />}
      </View>
      <ConfirmSheet visible={cancel} title="Cancel this reservation?" body="You'll get a full refund to Hayve Pay." confirm="Cancel reservation" destructive loading={busy} onClose={() => setCancel(false)} onConfirm={() => run(() => bookings.cancelStay(b.id), { success: 'Reservation cancelled', onDone: () => setCancel(false) })} />
    </Screen>
  );
}
