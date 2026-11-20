import { money } from '../../lib/format';
import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { bookings } from '../../backend/api';
import type { PropertyType } from '../../backend/types';
import { addDays, Button, Chip, color, EmptyState, Grid, HScroll, Input, prettyDate, radius, RangeCalendar, Screen, Section, Sheet, Stepper, T, todayISO, useLayout } from '../../design';
import { PropertyCard } from '../../features/cards';
import { StatusPill, TabHeader } from '../../features/common';
import { useLive } from '../../lib/hooks';

export default function Stay() {
  const params = useLocalSearchParams<{ destination?: string }>();
  const { isWide } = useLayout();
  const [destination, setDestination] = useState(params.destination ?? '');
  const [checkIn, setCheckIn] = useState<string | null>(addDays(todayISO(), 14));
  const [checkOut, setCheckOut] = useState<string | null>(addDays(todayISO(), 17));
  const [guests, setGuests] = useState(2);
  const [type, setType] = useState<PropertyType | 'all'>('all');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc' | 'rating'>('recommended');
  const [datesOpen, setDatesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    if (params.destination) setDestination(params.destination);
  }, [params.destination]);

  const saved = useLive(() => bookings.savedPropertyIds()).data ?? [];
  const list = useLive(
    () => bookings.listProperties({ destination, checkIn: checkIn ?? undefined, checkOut: checkOut ?? undefined, guests, type, amenities, maxPerNightCents: maxPrice, sort }),
    [destination, checkIn, checkOut, guests, type, amenities.join(), maxPrice, sort],
  ).data ?? [];
  const upcoming = useLive(() => bookings.myStays().filter((b) => b.status === 'confirmed' || b.status === 'requested')).data ?? [];
  const shown = savedOnly ? list.filter((p) => saved.includes(p.id)) : list;
  const query = checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}` : '';

  return (
    <Screen header={<TabHeader service="stay" subtitle="Homes, rooms and holiday places" />}>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.xl, padding: 8, borderWidth: 1, borderColor: color.line, flexDirection: isWide ? 'row' : 'column', gap: 6 }}>
        <View style={{ flex: isWide ? 1.4 : undefined }}>
          <Input icon="search" placeholder="Where to? New York, London, Paris…" value={destination} onChangeText={setDestination} containerStyle={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flex: isWide ? 2 : undefined }}>
          <Pressable onPress={() => setDatesOpen(true)} style={{ flex: 1, borderRadius: radius.md, backgroundColor: color.surfaceSunken, padding: 10 }}>
            <T variant="caption" color={color.textTertiary}>
              Check in
            </T>
            <T variant="headline">{checkIn ? prettyDate(checkIn) : 'Add dates'}</T>
          </Pressable>
          <Pressable onPress={() => setDatesOpen(true)} style={{ flex: 1, borderRadius: radius.md, backgroundColor: color.surfaceSunken, padding: 10 }}>
            <T variant="caption" color={color.textTertiary}>
              Check out
            </T>
            <T variant="headline">{checkOut ? prettyDate(checkOut) : 'Add dates'}</T>
          </Pressable>
          <Pressable onPress={() => setGuestsOpen(true)} style={{ flex: 0.8, borderRadius: radius.md, backgroundColor: color.surfaceSunken, padding: 10 }}>
            <T variant="caption" color={color.textTertiary}>
              Guests
            </T>
            <T variant="headline">{guests}</T>
          </Pressable>
        </View>
      </View>

      {upcoming.length > 0 && (
        <Section title="Your upcoming stays">
          <HScroll>
            {upcoming.map((b) => (
              <Pressable key={b.id} onPress={() => router.push(`/stay/booking/${b.id}`)} style={{ width: 280, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line }}>
                <Icon name="bed-outline" size={22} />
                <View style={{ flex: 1 }}>
                  <T variant="headline" numberOfLines={1}>
                    {b.property.city}
                  </T>
                  <T variant="footnote" color={color.textOnDarkSecondary}>
                    {prettyDate(b.checkIn)} – {prettyDate(b.checkOut)}
                  </T>
                </View>
                <StatusPill status={b.status} />
              </Pressable>
            ))}
          </HScroll>
        </Section>
      )}

      <HScroll gap={8} style={{ marginTop: 18 }}>
        <Chip label="Filters" icon="options-outline" count={amenities.length + (maxPrice ? 1 : 0)} onPress={() => setFiltersOpen(true)} />
        <Chip label="Saved" icon="heart-outline" selected={savedOnly} onPress={() => setSavedOnly(!savedOnly)} count={saved.length} />
        <Chip label="All types" selected={type === 'all'} onPress={() => setType('all')} />
        {bookings.PROPERTY_TYPES.map((t) => (
          <Chip key={t.id} label={t.label} selected={type === t.id} onPress={() => setType(t.id)} />
        ))}
      </HScroll>

      <Section title={`${shown.length} ${shown.length === 1 ? 'place' : 'places'}${destination ? ` in “${destination}”` : ''}`} subtitle={checkIn && checkOut ? `${prettyDate(checkIn)} – ${prettyDate(checkOut)} · ${guests} guests · available for your dates` : undefined}>
        {shown.length === 0 ? (
          <EmptyState icon="bed-outline" title="No places match" body="Try different dates, fewer guests or remove filters." />
        ) : (
          <Grid min={isWide ? 260 : 300} gap={20}>
            {shown.map((p) => (
              <PropertyCard key={p.id} p={p} saved={saved.includes(p.id)} query={query} />
            ))}
          </Grid>
        )}
      </Section>

      <Sheet visible={datesOpen} onClose={() => setDatesOpen(false)} title="When are you going?" footer={<Button title="Apply" size="lg" full disabled={!checkIn || !checkOut} onPress={() => setDatesOpen(false)} />}>
        <RangeCalendar start={checkIn} end={checkOut} onChange={(a, b) => { setCheckIn(a); setCheckOut(b); }} months={isWide ? 2 : 1} />
      </Sheet>
      <Sheet visible={guestsOpen} onClose={() => setGuestsOpen(false)} title="Guests" footer={<Button title="Done" size="lg" full onPress={() => setGuestsOpen(false)} />}>
        <Stepper label="Guests" sub="Adults and children" value={guests} min={1} max={16} onChange={setGuests} />
      </Sheet>
      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" footer={<Button title={`Show ${list.length} places`} size="lg" full onPress={() => setFiltersOpen(false)} />}>
        <T variant="headline" style={{ marginBottom: 10 }}>
          Sort
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Recommended" selected={sort === 'recommended'} onPress={() => setSort('recommended')} />
          <Chip label="Price: low to high" selected={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
          <Chip label="Price: high to low" selected={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
          <Chip label="Top rated" selected={sort === 'rating'} onPress={() => setSort('rating')} />
        </View>
        <T variant="headline" style={{ marginTop: 20, marginBottom: 10 }}>
          Max price per night
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[undefined, 10000, 15000, 25000, 40000].map((v) => (
            <Chip key={String(v)} label={v ? `Up to ${money(v)}` : 'Any'} selected={maxPrice === v} onPress={() => setMaxPrice(v)} />
          ))}
        </View>
        <T variant="headline" style={{ marginTop: 20, marginBottom: 10 }}>
          Amenities
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {bookings.AMENITIES.map((a) => (
            <Chip key={a} label={a} selected={amenities.includes(a)} onPress={() => setAmenities((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))} />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
