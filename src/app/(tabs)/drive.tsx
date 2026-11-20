import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { bookings } from '../../backend/api';
import type { VehicleType } from '../../backend/types';
import { addDays, Button, color, EmptyState, Grid, Icon, type IconName, Photo, prettyDate, radius, RangeCalendar, Screen, Section, Sheet, SkeletonGrid, T, todayISO, useLayout } from '../../design';
import { VehicleCard } from '../../features/cards';
import { StatusPill, TabHeader } from '../../features/common';
import { HayveMap, type LngLat, type MapMarker } from '../../features/map';
import { money } from '../../lib/format';
import { nearby, useMyArea } from '../../features/location';
import { useLive } from '../../lib/hooks';

type Sort = 'recommended' | 'price_asc' | 'price_desc' | 'rating';
type Panel = null | 'dates' | 'location' | 'type' | 'price' | 'seats' | 'transmission' | 'sort';
const prices = () => [{ k: 0, label: 'Any price' }, ...[6000, 9000, 15000].map((k) => ({ k, label: `Up to ${money(k)} / day` }))];
const SEATS = [0, 4, 5, 7];
const SORTS: { k: Sort; label: string }[] = [
  { k: 'recommended', label: 'Recommended' },
  { k: 'price_asc', label: 'Lowest price' },
  { k: 'price_desc', label: 'Highest price' },
  { k: 'rating', label: 'Top rated' },
];

/** Hayve Drive: car rental from local hosts (layout follows the rental reference: filters, grid, map). */
export default function Drive() {
  const { isWide, isDesktop } = useLayout();
  const [location, setLocation] = useState('');
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [start, setStart] = useState<string | null>(addDays(todayISO(), 1));
  const [end, setEnd] = useState<string | null>(addDays(todayISO(), 4));
  const [sort, setSort] = useState<Sort>('recommended');
  const [maxPrice, setMaxPrice] = useState(0);
  const [seats, setSeats] = useState(0);
  const [transmission, setTransmission] = useState<'any' | 'automatic' | 'manual'>('any');
  const [panel, setPanel] = useState<Panel>(null);
  const [showMap, setShowMap] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const q = useLive(() => bookings.listVehicles({ location, type, start: start ?? undefined, end: end ?? undefined, sort, maxPerDayCents: maxPrice || undefined, minSeats: seats || undefined, transmission }), [location, type, start, end, sort, maxPrice, seats, transmission]);
  const vehicles = q.data;
  const points = useLive(() => bookings.pickupPoints()).data ?? [];
  const mine = useLive(() => bookings.myRentals().filter((r) => ['requested', 'confirmed', 'active'].includes(r.status))).data ?? [];

  const markers: MapMarker[] = useMemo(() => (vehicles ?? []).map((v) => ({ id: v.id, coord: [v.lng, v.lat] as LngLat, kind: 'price' as const, label: money(v.pricePerDayCents).replace(/[.,]00$/, ''), selected: hover === v.id, onPress: () => router.push(`/drive/${v.id}${start && end ? `?start=${start}&end=${end}` : ''}`) })), [vehicles, hover, start, end]);
  // Open around you: fit the cars near you (and you), not every car in the world.
  const here = useMyArea();
  const fit = useMemo(() => {
    const close = nearby((vehicles ?? []).map((v) => [v.lng, v.lat] as LngLat), here.coord);
    return close.length ? [...close, here.coord] : null;
  }, [vehicles, here.coord]);

  const dateLabel = start && end ? `${prettyDate(start, { day: 'numeric', month: 'short' })} – ${prettyDate(end, { day: 'numeric', month: 'short' })}` : 'Add dates';
  const typeLabel = type === 'all' ? 'Vehicle type' : bookings.VEHICLE_TYPES.find((t) => t.id === type)?.label ?? type;
  const filters = (maxPrice ? 1 : 0) + (seats ? 1 : 0) + (transmission !== 'any' ? 1 : 0) + (type !== 'all' ? 1 : 0);

  const filterBar = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 8 }}>
        <Field icon="location-outline" label="Pickup" value={location || 'Anywhere'} onPress={() => setPanel('location')} flex={isWide ? 1.2 : undefined} />
        <Field icon="calendar-outline" label="Dates" value={dateLabel} onPress={() => setPanel('dates')} flex={isWide ? 1 : undefined} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pill label={typeLabel} active={type !== 'all'} onPress={() => setPanel('type')} />
        <Pill label={maxPrice ? prices().find((p) => p.k === maxPrice)!.label : 'Price'} active={!!maxPrice} onPress={() => setPanel('price')} />
        <Pill label={seats ? `${seats}+ seats` : 'Seats'} active={!!seats} onPress={() => setPanel('seats')} />
        <Pill label={transmission === 'any' ? 'Transmission' : transmission === 'automatic' ? 'Automatic' : 'Manual'} active={transmission !== 'any'} onPress={() => setPanel('transmission')} />
        <Pill label={SORTS.find((s) => s.k === sort)!.label} icon="swap-vertical-outline" active={sort !== 'recommended'} onPress={() => setPanel('sort')} />
        {filters > 0 && <Pill label="Clear" icon="close" onPress={() => { setType('all'); setMaxPrice(0); setSeats(0); setTransmission('any'); }} />}
      </ScrollView>
    </View>
  );

  const list =
    !vehicles ? (
      <SkeletonGrid count={6} />
    ) : vehicles.length === 0 ? (
      <EmptyState icon="car-outline" title="No cars match" body="Try other dates, another pickup point or fewer filters." action="Clear filters" onAction={() => { setType('all'); setMaxPrice(0); setSeats(0); setTransmission('any'); setLocation(''); }} />
    ) : (
      <Grid min={isDesktop ? 400 : 260} gap={24}>
        {vehicles.map((v) => (
          <VehicleCard key={v.id} v={v} start={start ?? undefined} end={end ?? undefined} selected={hover === v.id} onHover={(on) => setHover(on ? v.id : null)} />
        ))}
      </Grid>
    );

  const map = <HayveMap style={{ flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: color.grey200 }} markers={markers} fit={fit} center={here.coord} userLocation={here.real ? here.coord : null} zoom={12} accessibilityLabel="Map of available cars" />;

  return (
    <Screen header={<TabHeader service="drive" subtitle="Rent a car from local hosts" />} maxWidth={isDesktop ? 1400 : undefined}>
      {filterBar}

      {mine.length > 0 && (
        <Section title="Your rentals">
          <View style={{ gap: 8 }}>
            {mine.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/drive/booking/${r.id}`)} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: pressed ? color.black : color.grey200 })}>
                <Photo uri={r.vehicle.images[0]} style={{ width: 64, height: 48 }} rounded={8} icon="car-outline" />
                <View style={{ flex: 1 }}>
                  <T variant="headline">{r.vehicle.make} {r.vehicle.model}</T>
                  <T variant="footnote" color={color.textSecondary}>{prettyDate(r.start)} → {prettyDate(r.end)}</T>
                </View>
                <StatusPill status={r.status} />
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 16 }}>
        <T variant="title3" style={{ flex: 1 }}>{vehicles ? `${vehicles.length} ${vehicles.length === 1 ? 'car' : 'cars'} available` : 'Searching…'}</T>
        {!isDesktop && <Button title={showMap ? 'List' : 'Map'} icon={showMap ? 'list-outline' : 'map-outline'} variant="outline" size="sm" onPress={() => setShowMap((s) => !s)} />}
      </View>

      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.4 }}>{list}</View>
          <View style={[{ flex: 1, height: 640, position: 'sticky' as never, top: 16 }]}>{map}</View>
        </View>
      ) : showMap ? (
        <View style={{ height: 520 }}>{map}</View>
      ) : (
        list
      )}

      <Sheet visible={panel === 'dates'} onClose={() => setPanel(null)} title="Rental dates" footer={<Button title="Apply" size="lg" full disabled={!start || !end} onPress={() => setPanel(null)} />}>
        <RangeCalendar start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} months={isWide ? 2 : 1} />
      </Sheet>
      <OptionSheet open={panel === 'location'} title="Pickup point" onClose={() => setPanel(null)} value={location} options={[{ k: '', label: 'Anywhere' }, ...points.map((p) => ({ k: p, label: p }))]} onPick={setLocation} />
      <OptionSheet open={panel === 'type'} title="Vehicle type" onClose={() => setPanel(null)} value={type} options={[{ k: 'all' as const, label: 'All types' }, ...bookings.VEHICLE_TYPES.map((t) => ({ k: t.id, label: t.label }))]} onPick={setType} />
      <OptionSheet open={panel === 'price'} title="Price per day" onClose={() => setPanel(null)} value={maxPrice} options={prices()} onPick={setMaxPrice} />
      <OptionSheet open={panel === 'seats'} title="Seats" onClose={() => setPanel(null)} value={seats} options={SEATS.map((n) => ({ k: n, label: n ? `${n} or more` : 'Any' }))} onPick={setSeats} />
      <OptionSheet open={panel === 'transmission'} title="Transmission" onClose={() => setPanel(null)} value={transmission} options={[{ k: 'any' as const, label: 'Any' }, { k: 'automatic' as const, label: 'Automatic' }, { k: 'manual' as const, label: 'Manual' }]} onPick={setTransmission} />
      <OptionSheet open={panel === 'sort'} title="Sort by" onClose={() => setPanel(null)} value={sort} options={SORTS} onPick={setSort} />
    </Screen>
  );
}

function Field({ icon, label, value, onPress, flex }: { icon: IconName; label: string; value: string; onPress: () => void; flex?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flex, flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: color.grey100, borderWidth: 1, borderColor: pressed || hovered ? color.black : color.grey100 })}>
      <Icon name={icon} size={20} />
      <View style={{ flex: 1 }}>
        <T variant="caption" color={color.textSecondary}>{label}</T>
        <T variant="headline" numberOfLines={1}>{value}</T>
      </View>
      <Icon name="chevron-down" size={18} color={color.grey500} />
    </Pressable>
  );
}

function Pill({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: active ? color.black : color.white, borderWidth: 1, borderColor: active || hovered ? color.black : color.grey200 })}>
      {icon && <Icon name={icon} size={16} color={active ? color.white : color.black} />}
      <T variant="subhead" weight="600" color={active ? color.white : color.black}>{label}</T>
      {!icon && <Icon name="chevron-down" size={14} color={active ? color.white : color.grey500} />}
    </Pressable>
  );
}

function OptionSheet<K extends string | number>({ open, title, options, value, onPick, onClose }: { open: boolean; title: string; options: { k: K; label: string }[]; value: K; onPick: (k: K) => void; onClose: () => void }) {
  return (
    <Sheet visible={open} onClose={onClose} title={title}>
      <View accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.k === value;
          return (
            <Pressable key={String(o.k)} onPress={() => { onPick(o.k); onClose(); }} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: pressed ? color.grey100 : 'transparent' })}>
              <T variant="headline" style={{ flex: 1 }} weight={on ? '700' : '500'}>{o.label}</T>
              {on && <Icon name="checkmark" size={20} color={color.indigo} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
