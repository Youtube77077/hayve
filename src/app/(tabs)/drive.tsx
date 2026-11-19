import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { bookings } from '../../backend/api';
import type { VehicleType } from '../../backend/types';
import { addDays, Button, Chip, color, EmptyState, Grid, HScroll, Input, Photo, prettyDate, radius, RangeCalendar, Screen, Section, Sheet, T, todayISO, useLayout } from '../../design';
import { VehicleCard } from '../../features/cards';
import { StatusPill, TabHeader } from '../../features/common';
import { money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

export default function Drive() {
  const { isWide } = useLayout();
  const [location, setLocation] = useState('');
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [start, setStart] = useState<string | null>(addDays(todayISO(), 1));
  const [end, setEnd] = useState<string | null>(addDays(todayISO(), 4));
  const [datesOpen, setDatesOpen] = useState(false);
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc' | 'rating'>('recommended');
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const vehicles = useLive(() => bookings.listVehicles({ location, type, start: start ?? undefined, end: end ?? undefined, sort, maxPerDayCents: maxPrice }), [location, type, start, end, sort, maxPrice]).data ?? [];
  const mine = useLive(() => bookings.myRentals().filter((r) => ['requested', 'confirmed', 'active'].includes(r.status))).data ?? [];

  return (
    <Screen header={<TabHeader service="drive" subtitle="Cars from trusted local hosts" />}>
      <View style={{ backgroundColor: color.ink, borderRadius: radius.xl, padding: 16, gap: 10 }}>
        <Input icon="location-outline" placeholder="Pickup location (e.g. Schiphol, Zuid)" value={location} onChangeText={setLocation} />
        <Pressable onPress={() => setDatesOpen(true)} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: color.surface, borderRadius: radius.md, padding: 12 }}>
            <T variant="caption" color={color.textTertiary}>
              Pickup
            </T>
            <T variant="headline">{start ? prettyDate(start, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Add date'}</T>
          </View>
          <View style={{ flex: 1, backgroundColor: color.surface, borderRadius: radius.md, padding: 12 }}>
            <T variant="caption" color={color.textTertiary}>
              Return
            </T>
            <T variant="headline">{end ? prettyDate(end, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Add date'}</T>
          </View>
        </Pressable>
      </View>

      {mine.length > 0 && (
        <Section title="Your upcoming rentals">
          <View style={{ gap: 8 }}>
            {mine.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/drive/booking/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}>
                <Photo uri={r.vehicle.images[0]} style={{ width: 64, height: 48 }} rounded={10} />
                <View style={{ flex: 1 }}>
                  <T variant="headline">
                    {r.vehicle.make} {r.vehicle.model}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    {prettyDate(r.start)} → {prettyDate(r.end)}
                  </T>
                </View>
                <StatusPill status={r.status} />
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      <HScroll gap={8} style={{ marginTop: 18 }}>
        <Chip label="All cars" selected={type === 'all'} onPress={() => setType('all')} />
        {bookings.VEHICLE_TYPES.map((t) => (
          <Chip key={t.id} label={t.label} selected={type === t.id} onPress={() => setType(t.id)} />
        ))}
      </HScroll>
      <HScroll gap={8} style={{ marginTop: 10 }}>
        <Chip label="Recommended" selected={sort === 'recommended'} onPress={() => setSort('recommended')} />
        <Chip label="Price ↑" selected={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
        <Chip label="Price ↓" selected={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
        <Chip label="Top rated" selected={sort === 'rating'} onPress={() => setSort('rating')} />
        <Chip label="Under €80/day" selected={maxPrice === 8000} onPress={() => setMaxPrice(maxPrice === 8000 ? undefined : 8000)} />
      </HScroll>

      <Section title={`${vehicles.length} cars available`} subtitle={start && end ? `${prettyDate(start)} – ${prettyDate(end)}` : undefined}>
        {vehicles.length === 0 ? (
          <EmptyState icon="car-outline" title="No cars for these filters" body="Try other dates, a different location or vehicle type." />
        ) : (
          <Grid min={isWide ? 280 : 300} gap={14}>
            {vehicles.map((v) => (
              <VehicleCard key={v.id} v={v} start={start ?? undefined} end={end ?? undefined} />
            ))}
          </Grid>
        )}
      </Section>

      <Sheet visible={datesOpen} onClose={() => setDatesOpen(false)} title="Rental dates" footer={<Button title="Apply dates" size="lg" full disabled={!start || !end} onPress={() => setDatesOpen(false)} />}>
        <RangeCalendar
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
          }}
          months={isWide ? 2 : 1}
        />
      </Sheet>
    </Screen>
  );
}
