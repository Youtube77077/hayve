import { Icon } from '../../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { bites, ride } from '../../../backend/api';
import type { FoodOrderStatus } from '../../../backend/types';
import { Button, Card, color, Divider, ErrorState, Header, KeyValue, Photo, radius, Screen, Split, Stars, SwitchRow, T, Timeline, useLayout, useToast } from '../../../design';
import { RouteMap } from '../../../features/map';
import { SimNote, StatusPill } from '../../../features/common';
import { dateTime, money, time } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';

const STEPS: { key: FoodOrderStatus; label: string }[] = [
  { key: 'placed', label: 'Order sent to restaurant' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing your food' },
  { key: 'ready', label: 'Ready for pickup' },
  { key: 'picked_up', label: 'Courier on the way' },
  { key: 'delivered', label: 'Delivered' },
];
const PROGRESS: Partial<Record<FoodOrderStatus, number>> = { ready: 0, picked_up: 0.5, delivered: 1 };

export default function FoodOrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWide } = useLayout();
  const toast = useToast();
  const { data: o, error } = useLive(() => bites.getFoodOrder(id), [id]);
  const [auto, setAuto] = useState(true);
  const [stars, setStars] = useState(0);
  const { run } = useAction();
  const live = o && !['delivered', 'rejected', 'cancelled'].includes(o.status);
  const placeList = useLive(() => ride.places()).data;
  const route = { from: placeList?.find((p) => p.id === 'pijp'), to: placeList?.find((p) => p.id === 'home') };
  const mine = useLive(() => bites.myFoodOrders().some((x) => x.id === id), [id]).data;

  useEffect(() => {
    if (!live || !auto || !mine) return;
    const t = setTimeout(() => {
      try {
        bites.simulateFoodStep(id);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [live, auto, mine, o?.status, id, toast]);

  if (error || !o) return <Screen header={<Header back title="Order" fallback="/bites" />}>{error && <ErrorState message={error.message} />}</Screen>;
  const idx = STEPS.findIndex((s) => s.key === o.status);
  const eta = o.createdAt + (o.restaurant.etaMin + 5) * 60_000;
  const failed = o.status === 'rejected' || o.status === 'cancelled';

  return (
    <Screen header={<Header back title={o.restaurant.name} subtitle={`Order ${o.reference}`} fallback="/bites" />}>
      <Split
        ratio={1}
        left={
          <View>
            <Card tone={failed ? 'surface' : 'dark'}>
              {failed ? (
                <>
                  <StatusPill status={o.status} />
                  <T variant="title3" style={{ marginTop: 8 }}>
                    {o.status === 'rejected' ? `${o.restaurant.name} couldn't take your order` : 'Order cancelled'}
                  </T>
                  <T color={color.textSecondary}>Your payment reservation was released. You were not charged.</T>
                </>
              ) : (
                <>
                  <T variant="subhead" color={color.textOnDarkSecondary}>
                    {o.status === 'delivered' ? 'Delivered' : 'Estimated arrival'}
                  </T>
                  <T style={{ fontSize: 36, lineHeight: 36 + 8, fontWeight: '800', color: '#fff', letterSpacing: -1 }}>{o.status === 'delivered' ? time(o.timeline[o.timeline.length - 1].at) : time(eta)}</T>
                  <T variant="footnote" color={color.white} weight="700">
                    {STEPS[idx]?.label}
                    {o.courierName && o.status === 'picked_up' ? ` · ${o.courierName} on an e-bike` : ''}
                  </T>
                </>
              )}
            </Card>
            {!failed && (
              <View style={{ marginTop: 12 }}>
                {route.from && route.to && <RouteMap from={route.from} to={route.to} progress={PROGRESS[o.status]} height={isWide ? 300 : 200} />}
              </View>
            )}
            {!failed && (
              <Card style={{ marginTop: 12 }}>
                <Timeline steps={STEPS} current={o.status === 'delivered' ? STEPS.length : idx + 1} />
              </Card>
            )}
          </View>
        }
        right={
          <View style={{ gap: 12, marginTop: isWide ? 0 : 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Photo uri={o.restaurant.image} style={{ width: 48, height: 48 }} rounded={radius.sm} />
                <View style={{ flex: 1 }}>
                  <T variant="headline">{o.restaurant.name}</T>
                  <T variant="footnote" color={color.textSecondary}>
                    {dateTime(o.createdAt)}
                  </T>
                </View>
                <StatusPill status={o.status} />
              </View>
              {o.lines.map((l, i) => (
                <KeyValue key={i} label={`${l.qty} × ${l.name}${l.options.length ? ` (${l.options.join(', ')})` : ''}`} value={money(l.unitCents * l.qty)} />
              ))}
              <Divider style={{ marginVertical: 8 }} />
              <KeyValue label="Delivery" value={o.deliveryFeeCents ? money(o.deliveryFeeCents) : 'Free'} />
              <KeyValue label="Service fee" value={money(o.serviceFeeCents)} />
              <KeyValue label="Total" value={money(o.totalCents)} strong />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <Icon name="location-outline" size={16} color={color.textSecondary} />
                <T variant="footnote" color={color.textSecondary} style={{ flex: 1 }}>
                  {o.address}
                </T>
              </View>
            </Card>
            {o.status === 'delivered' && mine && (
              <Card>
                <T variant="headline" style={{ marginBottom: 8 }}>
                  {o.rating ? 'Thanks for your rating!' : `How was ${o.restaurant.name}?`}
                </T>
                <Stars value={o.rating ?? stars} onChange={(v) => !o.rating && setStars(v)} />
                {!o.rating && <Button title="Submit" style={{ marginTop: 12, alignSelf: 'flex-start' }} disabled={!stars} onPress={() => run(() => bites.rateFoodOrder(o.id, stars), { success: 'Thanks for your feedback' })} />}
              </Card>
            )}
            {live && mine && (
              <>
                <Card padded={false}>
                  <SwitchRow icon="flask-outline" title="Live simulation" subtitle="Advance the order like the restaurant and courier would" value={auto} onChange={setAuto} />
                </Card>
                {o.status === 'placed' && <Button title="Cancel order" variant="danger" onPress={() => run(() => bites.cancelFoodOrder(o.id), { success: 'Order cancelled' })} />}
                <SimNote text="The restaurant can also accept and update this order in Hayve Kitchen; couriers in Hayve Courier." />
              </>
            )}
            {(o.status === 'delivered' || failed) && <Button title="Order again" size="lg" onPress={() => router.push(`/bites/restaurant/${o.restaurant.id}`)} />}
          </View>
        }
      />
    </Screen>
  );
}
