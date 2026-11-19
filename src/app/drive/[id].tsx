import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { bookings, type PayMethod, social } from '../../backend/api';
import { addDays, Avatar, Badge, Button, Card, color, Divider, ErrorState, Gallery, Header, Input, KeyValue, prettyDate, radius, RangeCalendar, Rating, Screen, Section, Sheet, Split, Stepper, T, todayISO, useLayout } from '../../design';
import { PayMethodPicker } from '../../features/common';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';
import { Spec } from '../../features/cards';

export default function VehicleDetail() {
  const params = useLocalSearchParams<{ id: string; start?: string; end?: string }>();
  const { isWide } = useLayout();
  const { data, error } = useLive(() => bookings.getVehicle(params.id), [params.id]);
  const booked = useLive(() => bookings.vehicleBookedDates(params.id), [params.id]).data ?? [];
  const [start, setStart] = useState<string | null>(params.start ?? addDays(todayISO(), 1));
  const [end, setEnd] = useState<string | null>(params.end ?? addDays(todayISO(), 4));
  const [pickup, setPickup] = useState('');
  const [ret, setRet] = useState('');
  const [age, setAge] = useState(30);
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [checkout, setCheckout] = useState(false);
  const { run, busy } = useAction();

  const quote = useLive(() => (start && end && end > start ? bookings.quoteRental(params.id, start, end) : null), [params.id, start, end]).data;
  if (error || !data) return <Screen header={<Header back title="Vehicle" fallback="/drive" />}>{error && <ErrorState message={error.message} />}</Screen>;
  const { vehicle: v, host, hostRating, reviews } = data;
  const conflict = !!start && !!end && booked.some((d) => d >= start && d <= end);

  const book = () =>
    run(() => bookings.bookRental({ vehicleId: v.id, start: start!, end: end!, pickupLocation: pickup, returnLocation: ret, method, driverAge: age }), {
      success: 'Request sent to the host',
      onDone: (id) => {
        setCheckout(false);
        router.replace(`/drive/booking/${id}`);
      },
    });

  return (
    <Screen header={<Header back title={`${v.make} ${v.model}`} subtitle={`${v.year} · ${v.location}`} fallback="/drive" />} footer={!isWide ? <Button title={quote ? `Reserve · ${money(quote.totalCents)}` : 'Choose dates'} size="lg" full disabled={!quote || conflict} onPress={() => setCheckout(true)} /> : undefined}>
      <Split
        left={
          <View>
            <Gallery images={v.images} aspect={1.6} rounded={radius.xl} icon="car-sport-outline" label={`${v.make} ${v.model}`} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Badge label={bookings.VEHICLE_TYPES.find((t) => t.id === v.type)?.label ?? v.type} tone="primary" />
              <Rating value={v.rating} count={v.trips} />
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
              <Spec icon="people-outline" text={`${v.seats} seats`} />
              <Spec icon="car-outline" text={`${v.doors} doors`} />
              <Spec icon="cog-outline" text={v.transmission} />
              <Spec icon={v.fuel === 'electric' ? 'flash-outline' : 'water-outline'} text={v.fuel === 'electric' ? `${v.rangeKm} km range` : v.fuel} />
            </View>
            <Section title="Features">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {v.features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: radius.pill, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}>
                    <Ionicons name="checkmark" size={15} color={color.primary} />
                    <T variant="subhead">{f}</T>
                  </View>
                ))}
              </View>
            </Section>
            <Section title="Rental requirements">
              <Card>
                <KeyValue label="Minimum driver age" value={`${v.requirements.minAge} years`} />
                <KeyValue label="Licence held for" value={`${v.requirements.licenseYears}+ years`} />
                <KeyValue label="Security deposit (refundable)" value={money(v.requirements.depositCents)} />
                <KeyValue label="Mileage" value="200 km / day included" />
              </Card>
            </Section>
            <Section title="Availability" subtitle="Crossed-out dates are already booked">
              <Card>
                <RangeCalendar start={start} end={end} disabled={booked} onChange={(s, e) => { setStart(s); setEnd(e); }} months={1} />
              </Card>
            </Section>
            <Section title="Your host">
              <Card onPress={() => router.push(`/u/${host.username}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar uri={host.avatar} name={host.displayName} size={48} />
                <View style={{ flex: 1 }}>
                  <T variant="headline">{host.displayName}</T>
                  <Rating value={hostRating.average} count={hostRating.count} />
                </View>
                <Button title="Message" size="sm" variant="secondary" onPress={() => run(() => social.startThread(host.id, { kind: 'vehicle', id: v.id, title: `${v.make} ${v.model}` }), { onDone: (tid) => router.push(`/messages/${tid}`) })} />
              </Card>
            </Section>
            {reviews.length > 0 && (
              <Section title="Reviews">
                <View style={{ gap: 10 }}>
                  {reviews.map((r) => (
                    <Card key={r.id}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <T variant="headline">{r.author}</T>
                        <Rating value={r.rating} />
                      </View>
                      <T color={color.textSecondary} style={{ marginTop: 4 }}>
                        {r.text}
                      </T>
                    </Card>
                  ))}
                </View>
              </Section>
            )}
          </View>
        }
        right={
          isWide ? (
            <Card style={{ gap: 4 }}>
              <T variant="title2">
                {money(v.pricePerDayCents)} <T color={color.textSecondary}>/ day</T>
              </T>
              <T variant="footnote" color={color.textSecondary}>
                {start && end ? `${prettyDate(start)} → ${prettyDate(end)}` : 'Select dates in the calendar'}
              </T>
              {quote && <QuoteLines q={quote} />}
              {conflict && (
                <T variant="footnote" color={color.danger}>
                  Those dates overlap an existing booking.
                </T>
              )}
              <Button title="Reserve" size="lg" full style={{ marginTop: 12 }} disabled={!quote || conflict} onPress={() => setCheckout(true)} />
              <T variant="footnote" color={color.textTertiary} center style={{ marginTop: 6 }}>
                You won't be charged until the host confirms.
              </T>
            </Card>
          ) : null
        }
      />
      <Sheet visible={checkout} onClose={() => setCheckout(false)} title="Confirm your rental" footer={<Button title={quote ? `Request booking · ${money(quote.totalCents)}` : 'Request'} size="lg" full loading={busy} onPress={book} />}>
        <View style={{ gap: 12 }}>
          <Card tone="soft">
            <T variant="headline">
              {v.make} {v.model}
            </T>
            <T variant="footnote" color={color.textSecondary}>
              {start && prettyDate(start, { weekday: 'short', day: 'numeric', month: 'short' })} → {end && prettyDate(end, { weekday: 'short', day: 'numeric', month: 'short' })}
            </T>
          </Card>
          <Input label="Pickup location" icon="navigate-outline" placeholder={v.location} value={pickup} onChangeText={setPickup} />
          <Input label="Return location" icon="flag-outline" placeholder={v.location} value={ret} onChangeText={setRet} />
          <Card>
            <Stepper label="Driver age" sub={`Minimum ${v.requirements.minAge}`} value={age} min={18} max={90} onChange={setAge} />
          </Card>
          {quote && (
            <Card>
              <QuoteLines q={quote} />
            </Card>
          )}
          <T variant="headline">Pay with</T>
          <PayMethodPicker value={method} onChange={setMethod} totalCents={quote?.totalCents ?? 0} />
        </View>
      </Sheet>
    </Screen>
  );
}

function QuoteLines({ q }: { q: NonNullable<ReturnType<typeof bookings.quoteRental>> }) {
  return (
    <View style={{ marginTop: 8 }}>
      <KeyValue label={`${q.days} ${q.days === 1 ? 'day' : 'days'}`} value={money(q.baseCents)} />
      {q.discountCents > 0 && <KeyValue label="Multi-day discount" value={`−${money(q.discountCents)}`} tone={color.success} />}
      <KeyValue label="Insurance (basic cover)" value={money(q.insuranceCents)} />
      <KeyValue label="Service fee" value={money(q.serviceFeeCents)} />
      <Divider style={{ marginVertical: 6 }} />
      <KeyValue label="Total" value={money(q.totalCents)} strong />
      <T variant="footnote" color={color.textTertiary}>
        + {money(q.depositCents)} refundable deposit held at pickup (simulated)
      </T>
    </View>
  );
}
