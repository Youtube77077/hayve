import { Icon, type IconName } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { bookings, type PayMethod, social } from '../../backend/api';
import { addDays, Avatar, Badge, Button, Card, color, Divider, ErrorState, Gallery, goBack, IconButton, Input, KeyValue, Photo, prettyDate, radius, RangeCalendar, Rating, Screen, Section, Sheet, Split, Stepper, T, todayISO, useLayout, useToast } from '../../design';
import { PayMethodPicker } from '../../features/common';
import { memberSince, money } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';

const AMENITY_ICON: Record<string, IconName> = {
  'Wi-Fi': 'wifi',
  Kitchen: 'restaurant-outline',
  Kitchenette: 'restaurant-outline',
  'Shared kitchen': 'restaurant-outline',
  Washer: 'shirt-outline',
  'Free parking': 'car-outline',
  'Air conditioning': 'snow-outline',
  Pool: 'water-outline',
  Garden: 'leaf-outline',
  Workspace: 'laptop-outline',
  Balcony: 'sunny-outline',
  Terrace: 'sunny-outline',
  Elevator: 'swap-vertical-outline',
  'Sea view': 'boat-outline',
  'River view': 'boat-outline',
  BBQ: 'flame-outline',
  Heating: 'thermometer-outline',
  Bikes: 'bicycle-outline',
  'Coffee maker': 'cafe-outline',
};

export default function PropertyDetail() {
  const params = useLocalSearchParams<{ id: string; checkIn?: string; checkOut?: string; guests?: string }>();
  const { isWide } = useLayout();
  const sessionId = useSessionId();
  const toast = useToast();
  const { data, error } = useLive(() => bookings.getProperty(params.id), [params.id]);
  const saved = useLive(() => bookings.savedPropertyIds().includes(params.id), [params.id]).data;
  const [checkIn, setCheckIn] = useState<string | null>(params.checkIn ?? addDays(todayISO(), 14));
  const [checkOut, setCheckOut] = useState<string | null>(params.checkOut ?? addDays(todayISO(), 17));
  const [guests, setGuests] = useState(Number(params.guests ?? 2));
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [message, setMessage] = useState('');
  const [checkout, setCheckout] = useState(false);
  const { run, busy } = useAction();

  const quote = useLive(() => (checkIn && checkOut && checkOut > checkIn ? bookings.quoteStay(params.id, checkIn, checkOut) : null), [params.id, checkIn, checkOut]).data;
  if (error || !data) return <Screen>{error && <ErrorState message={error.message} />}</Screen>;
  const { property: p, host, hostSince, hostListings, reviews, booked } = data;
  const conflict = !!checkIn && !!checkOut && booked.some((d) => d >= checkIn && d < checkOut);
  const canBook = !!quote && !conflict && guests <= p.guests;

  const book = () =>
    run(() => bookings.bookStay({ propertyId: p.id, checkIn: checkIn!, checkOut: checkOut!, guests, method, message }), {
      success: p.instantBook ? 'Reservation confirmed 🎉' : 'Request sent to your host',
      onDone: (id) => {
        setCheckout(false);
        router.replace(`/stay/booking/${id}`);
      },
    });

  return (
    <Screen
      edges={['top']}
      padded
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 10 }}>
          <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/stay')} />
          <View style={{ flex: 1 }} />
          <IconButton icon="share-outline" label="Share" onPress={() => void Share.share({ message: `${p.title} on Hayve Stay: https://hayve.app/stay/${p.id}` })} />
          {sessionId && <IconButton icon={saved ? 'heart' : 'heart-outline'} iconColor={saved ? color.primary : undefined} label="Save" onPress={() => { bookings.toggleSavedProperty(p.id); toast(saved ? 'Removed from favourites' : 'Saved to favourites', 'info'); }} />}
        </View>
      }
      footer={
        !isWide ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T variant="headline">{quote ? money(quote.totalCents) : money(p.pricePerNightCents)}</T>
              <T variant="footnote" color={color.textSecondary}>
                {quote ? `${quote.nights} nights · ${prettyDate(checkIn!)}–${prettyDate(checkOut!)}` : 'per night'}
              </T>
            </View>
            <Button title={p.instantBook ? 'Reserve' : 'Request'} size="lg" disabled={!canBook} onPress={() => (sessionId ? setCheckout(true) : router.push('/sign-in'))} />
          </View>
        ) : undefined
      }
    >
      <View style={{ marginHorizontal: isWide ? 0 : -16 }}>
        <Gallery images={p.images} aspect={isWide ? 2.4 : 1.3} rounded={isWide ? radius.xl : 0} icon="bed-outline" label={p.title} />
      </View>

      <Split
        ratio={1.5}
        left={
          <View style={{ paddingTop: 18 }}>
            <T variant="title1">{p.title}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Rating value={p.rating} count={p.reviewCount} size={14} />
              <T color={color.textSecondary}>
                · {p.neighbourhood}, {p.city}, {p.country}
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {[
                ['people-outline', `${p.guests} guests`],
                ['bed-outline', `${p.bedrooms} bedroom${p.bedrooms === 1 ? '' : 's'}`],
                ['albums-outline', `${p.beds} bed${p.beds === 1 ? '' : 's'}`],
                ['water-outline', `${p.baths} bath${p.baths === 1 ? '' : 's'}`],
              ].map(([icon, label]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}>
                  <Icon name={icon as 'bed-outline'} size={16} color={color.ink} />
                  <T variant="subhead">{label}</T>
                </View>
              ))}
            </View>
            {p.instantBook && (
              <View style={{ marginTop: 14 }}>
                <Badge label="Instant book: confirmed immediately" tone="lime" icon="flash" />
              </View>
            )}

            <Card style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => router.push(`/u/${host.username}`)}>
              <Avatar uri={host.avatar} name={host.displayName} size={52} />
              <View style={{ flex: 1 }}>
                <T variant="headline">Hosted by {host.displayName}</T>
                <T variant="footnote" color={color.textSecondary}>
                  Hosting since {memberSince(hostSince)} · {hostListings} listings
                </T>
              </View>
              {sessionId && <Button title="Contact" size="sm" variant="secondary" onPress={() => run(() => social.startThread(host.id, { kind: 'property', id: p.id, title: p.title }), { onDone: (t) => router.push(`/messages/${t}`) })} />}
            </Card>

            <Section title="About this place">
              <T color={color.textSecondary}>{p.description}</T>
            </Section>
            <Section title="What this place offers">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
                {p.amenities.map((a) => (
                  <View key={a} style={{ width: isWide ? '33%' : '50%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Icon name={AMENITY_ICON[a] ?? 'checkmark-circle-outline'} size={20} color={color.ink} />
                    <T>{a}</T>
                  </View>
                ))}
              </View>
            </Section>
            <Section title="Availability" subtitle="Crossed-out nights are booked">
              <Card>
                <RangeCalendar start={checkIn} end={checkOut} disabled={booked} onChange={(a, b) => { setCheckIn(a); setCheckOut(b); }} months={isWide ? 2 : 1} />
              </Card>
            </Section>
            <Section title="Location">
              <Card tone="soft" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Icon name="location" size={22} color={color.primary} />
                <View style={{ flex: 1 }}>
                  <T variant="headline">
                    {p.neighbourhood}, {p.city}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    Exact address shared after booking. Get there with Hayve Ride.
                  </T>
                </View>
              </Card>
            </Section>
            <Section title={`Reviews · ${p.reviewCount}`}>
              <View style={{ gap: 10 }}>
                {reviews.length === 0 && <T color={color.textSecondary}>No reviews yet.</T>}
                {reviews.map((r) => (
                  <Card key={r.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar uri={r.avatar} name={r.author} size={36} />
                      <T variant="headline" style={{ flex: 1 }}>
                        {r.author}
                      </T>
                      <Rating value={r.rating} />
                    </View>
                    <T color={color.textSecondary} style={{ marginTop: 6 }}>
                      {r.text}
                    </T>
                  </Card>
                ))}
              </View>
            </Section>
          </View>
        }
        right={
          isWide ? (
            <Card style={{ marginTop: 18, gap: 10 }}>
              <T variant="title2">
                {money(p.pricePerNightCents)} <T color={color.textSecondary}>night</T>
              </T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: color.surfaceSunken }}>
                  <T variant="caption" color={color.textTertiary}>
                    Check in
                  </T>
                  <T variant="headline">{checkIn ? prettyDate(checkIn) : '—'}</T>
                </View>
                <View style={{ flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: color.surfaceSunken }}>
                  <T variant="caption" color={color.textTertiary}>
                    Check out
                  </T>
                  <T variant="headline">{checkOut ? prettyDate(checkOut) : '—'}</T>
                </View>
              </View>
              <Stepper label="Guests" sub={`Up to ${p.guests}`} value={guests} min={1} max={p.guests} onChange={setGuests} />
              {quote && <StayQuote q={quote} />}
              {conflict && (
                <T variant="footnote" color={color.danger}>
                  Some of those nights are already booked.
                </T>
              )}
              <Button title={p.instantBook ? 'Reserve' : 'Request to book'} size="lg" full disabled={!canBook} onPress={() => (sessionId ? setCheckout(true) : router.push('/sign-in'))} />
              <T variant="footnote" color={color.textTertiary} center>
                {p.instantBook ? 'Confirmed instantly.' : "You won't be charged until the host accepts."}
              </T>
            </Card>
          ) : null
        }
      />

      <Sheet visible={checkout} onClose={() => setCheckout(false)} title={p.instantBook ? 'Confirm and pay' : 'Request to book'} footer={<Button title={quote ? `${p.instantBook ? 'Pay' : 'Request'} · ${money(quote.totalCents)}` : 'Book'} size="lg" full loading={busy} onPress={book} />}>
        <View style={{ gap: 12 }}>
          <Card tone="soft" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Photo uri={p.images[0]} style={{ width: 64, height: 64 }} rounded={radius.sm} />
            <View style={{ flex: 1 }}>
              <T variant="headline" numberOfLines={1}>
                {p.title}
              </T>
              <T variant="footnote" color={color.textSecondary}>
                {checkIn && prettyDate(checkIn)} → {checkOut && prettyDate(checkOut)} · {guests} guests
              </T>
            </View>
          </Card>
          {!isWide && (
            <Card>
              <Stepper label="Guests" sub={`Up to ${p.guests}`} value={guests} min={1} max={p.guests} onChange={setGuests} />
            </Card>
          )}
          {quote && (
            <Card>
              <StayQuote q={quote} />
            </Card>
          )}
          <Input label={`Message ${host.displayName.split(' ')[0]} (optional)`} placeholder="Say hello and share your plans" value={message} onChangeText={setMessage} multiline />
          <T variant="headline">Pay with</T>
          <PayMethodPicker value={method} onChange={setMethod} totalCents={quote?.totalCents ?? 0} />
          <Pressable>
            <T variant="footnote" color={color.textTertiary}>
              Free cancellation until check-in. Reservations are simulated in this build.
            </T>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  );
}

function StayQuote({ q }: { q: NonNullable<ReturnType<typeof bookings.quoteStay>> }) {
  return (
    <View>
      <KeyValue label={`${money(q.baseCents / q.nights)} × ${q.nights} ${q.nights === 1 ? 'night' : 'nights'}`} value={money(q.baseCents)} />
      {q.discountCents > 0 && <KeyValue label="Weekly discount" value={`−${money(q.discountCents)}`} />}
      <KeyValue label="Fees" value={money(q.feesCents)} />
      <KeyValue label="Taxes" value={money(q.taxesCents)} />
      <Divider style={{ marginVertical: 6 }} />
      <KeyValue label="Total" value={money(q.totalCents)} strong />
    </View>
  );
}
