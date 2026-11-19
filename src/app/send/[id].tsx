import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { send } from '../../backend/api';
import type { DeliveryStatus } from '../../backend/types';
import { Button, Card, CityMap, color, ErrorState, Header, KeyValue, Screen, Split, SwitchRow, T, Timeline, useLayout, useToast } from '../../design';
import { SimNote, StatusPill } from '../../features/common';
import { dateTime, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export const DELIVERY_STEPS: { key: DeliveryStatus; label: string }[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'assigned', label: 'Courier assigned' },
  { key: 'picked_up', label: 'Collected' },
  { key: 'in_transit', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];
const PROGRESS: Partial<Record<DeliveryStatus, number>> = { assigned: 0, picked_up: 0.15, in_transit: 0.6, delivered: 1 };

export default function DeliveryTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWide } = useLayout();
  const toast = useToast();
  const { data: d, error } = useLive(() => send.getDelivery(id), [id]);
  const [auto, setAuto] = useState(true);
  const { run } = useAction();
  const live = d && d.role === 'sender' && !['delivered', 'cancelled'].includes(d.status);

  useEffect(() => {
    if (!live || !auto) return;
    const t = setTimeout(() => {
      try {
        send.simulateDeliveryStep(id);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [live, auto, d?.status, id, toast]);

  if (error || !d) return <Screen header={<Header back title="Parcel" fallback="/send" />}>{error && <ErrorState message={error.message} />}</Screen>;
  const idx = DELIVERY_STEPS.findIndex((s) => s.key === d.status);
  return (
    <Screen header={<Header back title={`Parcel ${d.trackingCode}`} subtitle={`To ${d.recipientName}`} fallback="/send" />}>
      <Split
        ratio={1}
        left={<CityMap from={{ x: 0.62, y: 0.5 }} to={{ x: 0.36, y: 0.38 }} progress={PROGRESS[d.status]} vehicle={d.size === 'XL' ? 'car' : 'bike'} height={isWide ? 480 : 230} />}
        right={
          <View style={{ gap: 12, marginTop: isWide ? 0 : 14 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <T variant="title3" style={{ flex: 1 }}>
                  {d.status === 'cancelled' ? 'Cancelled' : DELIVERY_STEPS[idx]?.label}
                </T>
                <StatusPill status={d.status} />
              </View>
              {d.status !== 'cancelled' && <Timeline steps={DELIVERY_STEPS.map((s) => ({ ...s, sub: d.timeline.find((t) => t.status === s.key) ? dateTime(d.timeline.find((t) => t.status === s.key)!.at) : undefined }))} current={d.status === 'delivered' ? DELIVERY_STEPS.length : idx + 1} />}
              {d.courierName && (
                <T variant="footnote" color={color.textSecondary}>
                  Courier: {d.courierName}
                </T>
              )}
            </Card>
            <Card>
              <KeyValue label="From" value={d.pickup} />
              <KeyValue label="To" value={d.dropoff} />
              <KeyValue label="Recipient" value={`${d.recipientName} · ${d.recipientPhone}`} />
              <KeyValue label="Parcel" value={`${d.size} · ${d.weightKg} kg · ${d.speed.replace('_', ' ')}`} />
              {d.instructions ? <KeyValue label="Instructions" value={d.instructions} /> : null}
              <KeyValue label="Price" value={money(d.priceCents)} strong />
            </Card>
            {live && (
              <>
                <Card padded={false}>
                  <SwitchRow icon="flask-outline" title="Live simulation" subtitle="Advance the parcel like a courier would" value={auto} onChange={setAuto} />
                </Card>
                {(d.status === 'booked' || d.status === 'assigned') && <Button title="Cancel & refund" variant="danger" onPress={() => run(() => send.cancelDelivery(d.id), { success: 'Delivery cancelled and refunded' })} />}
                <SimNote text="Dispatch is simulated. Couriers can also accept and update this parcel in Hayve Courier." />
              </>
            )}
          </View>
        }
      />
    </Screen>
  );
}
