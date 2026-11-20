import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { bookings } from '../../backend/api';
import type { PropertyInput, VehicleInput } from '../../backend/api/bookings';
import { media } from '../../backend/media';
import { addDays, Badge, Button, Card, Chip, color, Group, Header, HScroll, Input, ListRow, parseEuro, Photo, prettyDate, radius, Screen, Section, Segmented, Select, Sheet, Stepper, SwitchRow, T, todayISO, useLayout } from '../../design';
import { Empty, EarningsCard, MetricRow, RoleGate } from '../../features/business';
import { StatusPill } from '../../features/common';
import { money, currencySymbol } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';
import { useRegion } from '../../features/payments';

export default function HostDashboard() {
  const { run } = useAction();
  return (
    <RoleGate
      role="host"
      title="Hayve Host"
      onboarding={
        <View style={{ gap: 14, marginTop: 8 }}>
          <T variant="title2">Earn by hosting on Hayve</T>
          <T color={color.textSecondary}>List your home or room on Hayve Stay, or rent out your car on Hayve Drive, all from one dashboard. Payouts go to Hayve Pay after each stay or rental.</T>
          <Button title="Become a Hayve Host" size="lg" full onPress={() => run(() => bookings.becomeHost(), { success: 'Welcome, host! Add your first listing.' })} />
        </View>
      }
    >
      <Dashboard />
    </RoleGate>
  );
}

function Dashboard() {
  const { isWide } = useLayout();
  const [tab, setTab] = useState<'bookings' | 'stays' | 'cars'>('bookings');
  const listings = useLive(() => bookings.hostListings()).data;
  const b = useLive(() => bookings.hostBookings()).data;
  const [propForm, setPropForm] = useState(false);
  const [carForm, setCarForm] = useState(false);
  const [calendar, setCalendar] = useState<{ kind: 'property' | 'vehicle'; id: string; title: string } | null>(null);
  const { run } = useAction();
  if (!listings || !b) return null;
  const requests = [...b.stays.filter((x) => x.status === 'requested').map((x) => ({ kind: 'stay' as const, x })), ...b.rentals.filter((x) => x.status === 'requested').map((x) => ({ kind: 'rental' as const, x }))];
  const confirmed = [...b.stays.filter((x) => x.status === 'confirmed').map((x) => ({ kind: 'stay' as const, x })), ...b.rentals.filter((x) => x.status === 'confirmed').map((x) => ({ kind: 'rental' as const, x }))];

  return (
    <Screen header={<Header back title="Hayve Host" subtitle="Stays & vehicles" fallback="/business" />}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <EarningsCard role="host" label="Hosting earnings" />
        </View>
        <View style={{ flex: 1 }}>
          <MetricRow
            items={[
              { label: 'Requests', value: String(requests.length), icon: 'mail-unread-outline' },
              { label: 'Upcoming', value: String(confirmed.length), icon: 'calendar-outline' },
              { label: 'Stays listed', value: String(listings.properties.filter((p) => p.listed).length), icon: 'bed-outline' },
              { label: 'Cars listed', value: String(listings.vehicles.filter((v) => v.listed).length), icon: 'car-outline' },
            ]}
          />
        </View>
      </View>
      <View style={{ marginTop: 20, maxWidth: 480 }}>
        <Segmented value={tab} onChange={setTab} options={[{ key: 'bookings', label: `Bookings${requests.length ? ` · ${requests.length}` : ''}` }, { key: 'stays', label: 'Stays' }, { key: 'cars', label: 'Cars' }]} />
      </View>

      {tab === 'bookings' && (
        <>
          <Section title="Requests to review" style={{ marginTop: 16 }}>
            {requests.length === 0 ? (
              <Empty text="No pending requests" />
            ) : (
              <View style={{ gap: 10 }}>
                {requests.map(({ kind, x }) => (
                  <Card key={x.id} style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Photo uri={kind === 'stay' ? (x as (typeof b.stays)[number]).property.images[0] : (x as (typeof b.rentals)[number]).vehicle.images[0]} style={{ width: 54, height: 54 }} rounded={radius.sm} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline" numberOfLines={1}>
                          {kind === 'stay' ? (x as (typeof b.stays)[number]).property.title : `${(x as (typeof b.rentals)[number]).vehicle.make} ${(x as (typeof b.rentals)[number]).vehicle.model}`}
                        </T>
                        <T variant="footnote" color={color.textSecondary}>
                          {kind === 'stay' ? `${(x as (typeof b.stays)[number]).guestName} · ${prettyDate((x as (typeof b.stays)[number]).checkIn)} → ${prettyDate((x as (typeof b.stays)[number]).checkOut)} · ${(x as (typeof b.stays)[number]).guests} guests` : `${(x as (typeof b.rentals)[number]).renterName} · ${prettyDate((x as (typeof b.rentals)[number]).start)} → ${prettyDate((x as (typeof b.rentals)[number]).end)}`}
                        </T>
                      </View>
                      <T variant="headline">{money(x.totalCents)}</T>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Decline" variant="danger" style={{ flex: 1 }} onPress={() => run(() => bookings.hostRespond(kind, x.id, 'decline'), { success: 'Request declined' })} />
                      <Button title="Accept" variant="accent" style={{ flex: 2 }} onPress={() => run(() => bookings.hostRespond(kind, x.id, 'accept'), { success: 'Booking confirmed' })} />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </Section>
          <Section title="Confirmed & history">
            {b.stays.length + b.rentals.length === 0 ? (
              <Empty text="No bookings yet" />
            ) : (
              <Group>
                {b.stays.map((s) => (
                  <ListRow key={s.id} icon="bed-outline" title={s.property.title} subtitle={`${s.guestName} · ${prettyDate(s.checkIn)} → ${prettyDate(s.checkOut)} · ${money(s.totalCents)}`} right={s.status === 'confirmed' ? <Button title="Complete" size="sm" variant="secondary" onPress={() => run(() => bookings.hostRespond('stay', s.id, 'complete'), { success: 'Stay completed, payout released' })} /> : <StatusPill status={s.status} />} />
                ))}
                {b.rentals.map((r) => (
                  <ListRow key={r.id} icon="car-outline" title={`${r.vehicle.make} ${r.vehicle.model}`} subtitle={`${r.renterName} · ${prettyDate(r.start)} → ${prettyDate(r.end)} · ${money(r.totalCents)}`} right={r.status === 'confirmed' ? <Button title="Complete" size="sm" variant="secondary" onPress={() => run(() => bookings.hostRespond('rental', r.id, 'complete'), { success: 'Rental completed, payout released' })} /> : <StatusPill status={r.status} />} />
                ))}
              </Group>
            )}
            <Button title="Request a deposit or payment" icon="link-outline" variant="secondary" full style={{ marginTop: 12 }} onPress={() => router.push('/pay/request')} />
          </Section>
        </>
      )}

      {tab === 'stays' && (
        <Section title="Your places" action="Add place" onAction={() => setPropForm(true)} style={{ marginTop: 16 }}>
          {listings.properties.length === 0 ? (
            <Empty text="List your first place" />
          ) : (
            <View style={{ gap: 10 }}>
              {listings.properties.map((p) => (
                <Card key={p.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Pressable onPress={() => router.push(`/stay/${p.id}`)}>
                    <Photo uri={p.images[0]} style={{ width: 72, height: 72 }} rounded={radius.md} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="headline" numberOfLines={1}>
                      {p.title}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {p.city} · {money(p.pricePerNightCents)}/night · {p.instantBook ? 'Instant book' : 'Request to book'}
                    </T>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <Pressable onPress={() => run(() => bookings.setPropertyListed(p.id, !p.listed), { success: p.listed ? 'Unlisted' : 'Listed' })}>
                        <Badge label={p.listed ? 'Listed' : 'Unlisted'} tone={p.listed ? 'success' : 'neutral'} />
                      </Pressable>
                      <Pressable onPress={() => setCalendar({ kind: 'property', id: p.id, title: p.title })}>
                        <Badge label="Availability" tone="primary" icon="calendar-outline" />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </Section>
      )}

      {tab === 'cars' && (
        <Section title="Your vehicles" action="Add vehicle" onAction={() => setCarForm(true)} style={{ marginTop: 16 }}>
          {listings.vehicles.length === 0 ? (
            <Empty text="List your first vehicle" />
          ) : (
            <View style={{ gap: 10 }}>
              {listings.vehicles.map((v) => (
                <Card key={v.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Pressable onPress={() => router.push(`/drive/${v.id}`)}>
                    <Photo uri={v.images[0]} style={{ width: 84, height: 64 }} rounded={radius.md} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="headline">
                      {v.make} {v.model}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {v.location} · {money(v.pricePerDayCents)}/day
                    </T>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <Pressable onPress={() => run(() => bookings.setVehicleListed(v.id, !v.listed), { success: v.listed ? 'Unlisted' : 'Listed' })}>
                        <Badge label={v.listed ? 'Listed' : 'Unlisted'} tone={v.listed ? 'success' : 'neutral'} />
                      </Pressable>
                      <Pressable onPress={() => setCalendar({ kind: 'vehicle', id: v.id, title: `${v.make} ${v.model}` })}>
                        <Badge label="Availability" tone="primary" icon="calendar-outline" />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </Section>
      )}

      <PropertyForm open={propForm} onClose={() => setPropForm(false)} />
      <VehicleForm open={carForm} onClose={() => setCarForm(false)} />
      <AvailabilitySheet target={calendar} onClose={() => setCalendar(null)} />
    </Screen>
  );
}

function AvailabilitySheet({ target, onClose }: { target: { kind: 'property' | 'vehicle'; id: string; title: string } | null; onClose: () => void }) {
  const blocked = useLive(() => {
    if (!target) return [] as string[];
    const l = bookings.hostListings();
    return (target.kind === 'property' ? l.properties.find((p) => p.id === target.id) : l.vehicles.find((v) => v.id === target.id))?.blockedDates ?? [];
  }, [target?.id]).data ?? [];
  const days = Array.from({ length: 35 }, (_, i) => addDays(todayISO(), i));
  return (
    <Sheet visible={!!target} onClose={onClose} title="Block dates" footer={<Button title="Done" size="lg" full onPress={onClose} />}>
      <T variant="footnote" color={color.textSecondary} style={{ marginBottom: 12 }}>
        {target?.title}: tap a date to block or unblock it. Blocked dates can't be booked.
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {days.map((d) => {
          const on = blocked.includes(d);
          return (
            <Pressable key={d} onPress={() => target && bookings.toggleBlockedDate(target.kind, target.id, d)} style={{ width: 64, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center', backgroundColor: on ? color.ink : color.surface, borderWidth: 1, borderColor: on ? color.ink : color.line }}>
              <T variant="caption" color={on ? color.grey200 : color.textTertiary}>
                {prettyDate(d, { weekday: 'short' })}
              </T>
              <T variant="headline" color={on ? '#fff' : color.text}>
                {prettyDate(d, { day: 'numeric' })}
              </T>
              <T variant="caption" color={on ? color.textOnDarkSecondary : color.textTertiary}>
                {prettyDate(d, { month: 'short' })}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

function PropertyForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<PropertyInput>({ title: '', type: 'apartment', city: '', country: useRegion().name, neighbourhood: '', description: '', pricePerNightCents: 0, cleaningFeeCents: 3000, guests: 2, bedrooms: 1, beds: 1, baths: 1, amenities: ['Wi-Fi', 'Kitchen'], images: [media.stays.interior], instantBook: true });
  const [price, setPrice] = useState('');
  const { run, busy } = useAction();
  const set = (p: Partial<PropertyInput>) => setF((x) => ({ ...x, ...p }));
  return (
    <Sheet visible={open} onClose={onClose} title="List a place" footer={<Button title="Publish listing" size="lg" full loading={busy} onPress={() => run(() => bookings.upsertProperty({ ...f, pricePerNightCents: parseEuro(price) ?? 0 }), { success: 'Your place is live on Hayve Stay', onDone: onClose })} />}>
      <View style={{ gap: 12 }}>
        <T variant="subhead" color={color.textSecondary}>
          Photos
        </T>
        <HScroll gap={8}>
          {Object.values(media.stays).map((uri) => (
            <Pressable key={uri} onPress={() => set({ images: f.images.includes(uri) ? f.images.filter((x) => x !== uri) : [...f.images, uri] })}>
              <Photo uri={uri} style={{ width: 72, height: 72, borderWidth: f.images.includes(uri) ? 3 : 0, borderColor: color.primary }} rounded={radius.sm} />
            </Pressable>
          ))}
        </HScroll>
        <Input label="Title" value={f.title} onChangeText={(title) => set({ title })} />
        <Select label="Type" value={f.type} onChange={(type) => set({ type })} options={bookings.PROPERTY_TYPES.map((t) => ({ key: t.id, label: t.label }))} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Input containerStyle={{ flex: 1 }} label="City" value={f.city} onChangeText={(city) => set({ city })} />
          <Input containerStyle={{ flex: 1 }} label="Neighbourhood" value={f.neighbourhood} onChangeText={(neighbourhood) => set({ neighbourhood })} />
        </View>
        <Input label="Description" multiline value={f.description} onChangeText={(description) => set({ description })} />
        <Input label={`Price per night (${currencySymbol()})`} keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
        <Card style={{ gap: 12 }}>
          <Stepper label="Guests" value={f.guests} min={1} max={16} onChange={(guests) => set({ guests })} />
          <Stepper label="Bedrooms" value={f.bedrooms} min={0} max={10} onChange={(bedrooms) => set({ bedrooms })} />
          <Stepper label="Beds" value={f.beds} min={1} max={16} onChange={(beds) => set({ beds })} />
          <Stepper label="Bathrooms" value={f.baths} min={0} max={8} onChange={(baths) => set({ baths })} />
        </Card>
        <T variant="subhead" color={color.textSecondary}>
          Amenities
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {bookings.AMENITIES.map((a) => (
            <Chip key={a} label={a} selected={f.amenities.includes(a)} onPress={() => set({ amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] })} />
          ))}
        </View>
        <Card padded={false}>
          <SwitchRow title="Instant book" subtitle="Guests can book without waiting for approval" value={f.instantBook} onChange={(instantBook) => set({ instantBook })} />
        </Card>
      </View>
    </Sheet>
  );
}

function VehicleForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<VehicleInput>({ make: '', model: '', year: 2022, type: 'compact', seats: 5, transmission: 'automatic', fuel: 'petrol', pricePerDayCents: 0, location: '', images: [media.cars.sedan], features: ['Bluetooth'], minAge: 21, depositCents: 30000 });
  const [price, setPrice] = useState('');
  const { run, busy } = useAction();
  const set = (p: Partial<VehicleInput>) => setF((x) => ({ ...x, ...p }));
  return (
    <Sheet visible={open} onClose={onClose} title="List a vehicle" footer={<Button title="Publish vehicle" size="lg" full loading={busy} onPress={() => run(() => bookings.upsertVehicle({ ...f, pricePerDayCents: parseEuro(price) ?? 0 }), { success: 'Your vehicle is live on Hayve Drive', onDone: onClose })} />}>
      <View style={{ gap: 12 }}>
        <HScroll gap={8}>
          {Object.values(media.cars).map((uri) => (
            <Pressable key={uri} onPress={() => set({ images: f.images.includes(uri) ? f.images.filter((x) => x !== uri) : [...f.images, uri] })}>
              <Photo uri={uri} style={{ width: 84, height: 64, borderWidth: f.images.includes(uri) ? 3 : 0, borderColor: color.primary }} rounded={radius.sm} />
            </Pressable>
          ))}
        </HScroll>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Input containerStyle={{ flex: 1 }} label="Make" value={f.make} onChangeText={(make) => set({ make })} />
          <Input containerStyle={{ flex: 1 }} label="Model" value={f.model} onChangeText={(model) => set({ model })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Input containerStyle={{ flex: 1 }} label="Year" keyboardType="number-pad" value={String(f.year)} onChangeText={(t) => set({ year: Number(t) || 0 })} />
          <Input containerStyle={{ flex: 1 }} label={`Price per day (${currencySymbol()})`} keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
        </View>
        <Select label="Type" value={f.type} onChange={(type) => set({ type })} options={bookings.VEHICLE_TYPES.map((t) => ({ key: t.id, label: t.label }))} />
        <Select label="Fuel" value={f.fuel} onChange={(fuel) => set({ fuel })} options={[{ key: 'petrol', label: 'Petrol' }, { key: 'diesel', label: 'Diesel' }, { key: 'hybrid', label: 'Hybrid' }, { key: 'electric', label: 'Electric' }]} />
        <Segmented value={f.transmission} onChange={(transmission) => set({ transmission })} options={[{ key: 'automatic', label: 'Automatic' }, { key: 'manual', label: 'Manual' }]} />
        <Input label="Pickup location" icon="location-outline" value={f.location} onChangeText={(location) => set({ location })} />
        <Card style={{ gap: 12 }}>
          <Stepper label="Seats" value={f.seats} min={2} max={9} onChange={(seats) => set({ seats })} />
          <Stepper label="Minimum driver age" value={f.minAge} min={18} max={30} onChange={(minAge) => set({ minAge })} />
        </Card>
      </View>
    </Sheet>
  );
}
