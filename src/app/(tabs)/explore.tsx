import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, type TextInput, View } from 'react-native';
import { bites, bookings, shop } from '../../backend/api';
import { media } from '../../backend/media';
import { useHotkey, Chip, color, EmptyState, Grid, HScroll, Input, Photo, radius, Rating, Screen, Section, T, tap, type IconName } from '../../design';
import { ProductTile, TabHeader } from '../../features/common';
import { money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

const CATEGORIES: { label: string; icon: IconName; to: string }[] = [
  { label: 'Shopping', icon: 'bag-handle', to: '/shop' },
  { label: 'Fashion', icon: 'shirt', to: '/shop?category=fashion' },
  { label: 'Electronics', icon: 'headset', to: '/shop?category=electronics' },
  { label: 'Home & furniture', icon: 'home', to: '/shop?category=home' },
  { label: 'Restaurants', icon: 'restaurant', to: '/bites' },
  { label: 'Groceries', icon: 'basket', to: '/bites?groceries=1' },
  { label: 'Rides', icon: 'car-sport', to: '/ride' },
  { label: 'Car rentals', icon: 'car-outline', to: '/drive' },
  { label: 'Accommodation', icon: 'bed', to: '/stay' },
  { label: 'Local businesses', icon: 'storefront', to: '/business/merchant' },
  { label: 'Pay & transfer', icon: 'wallet', to: '/pay' },
];

const DESTINATIONS = [
  { city: 'New York', image: media.city.newYork },
  { city: 'Los Angeles', image: media.stays.beach },
  { city: 'London', image: media.city.london },
  { city: 'Paris', image: media.stays.paris },
  { city: 'Lisbon', image: media.stays.lisbon },
  { city: 'Barcelona', image: media.stays.barcelona },
  { city: 'Amsterdam', image: media.city.amsterdam2 },
];

type Scope = 'all' | 'products' | 'food' | 'stays' | 'cars';

export default function Explore() {
  const params = useLocalSearchParams<{ q?: string }>();
  const inputRef = useRef<TextInput>(null);
  useHotkey('/', () => inputRef.current?.focus());
  const [q, setQ] = useState(params.q ?? '');
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended');
  const term = q.trim();

  const products = useLive(() => (term ? shop.listProducts({ q: term, sort: sort === 'recommended' ? 'recommended' : sort }) : []), [term, sort]).data ?? [];
  const restaurants = useLive(() => (term ? bites.listRestaurants({ q: term }) : []), [term]).data ?? [];
  const stays = useLive(() => (term ? bookings.listProperties({ destination: term, sort: sort === 'recommended' ? 'recommended' : sort }) : []), [term, sort]).data ?? [];
  const cars = useLive(() => (term ? bookings.listVehicles({ location: term, sort: sort === 'recommended' ? 'recommended' : sort }) : []), [term, sort]).data ?? [];
  const trending = useLive(() => shop.listProducts({ sort: 'popular', limit: 10 })).data ?? [];
  const nearby = useLive(() => bites.listRestaurants({ sort: 'eta', openOnly: true }).slice(0, 4)).data ?? [];

  const total = products.length + restaurants.length + stays.length + cars.length;
  const show = (s: Scope) => scope === 'all' || scope === s;

  return (
    <Screen header={<TabHeader service="explore" subtitle="Discover everything on Hayve" />}>
      <Input ref={inputRef} icon="search" placeholder="Try 'camera', 'pizza', 'Lisbon' or 'Tesla'" value={q} onChangeText={setQ} returnKeyType="search" autoCorrect={false} right={q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8}><Icon name="close-circle" size={20} color={color.grey500} /></Pressable> : null} />

      {term ? (
        <>
          <HScroll style={{ marginTop: 14 }} gap={8}>
            {(
              [
                ['all', 'All', total],
                ['products', 'Shop', products.length],
                ['food', 'Bites', restaurants.length],
                ['stays', 'Stay', stays.length],
                ['cars', 'Drive', cars.length],
              ] as [Scope, string, number][]
            ).map(([k, label, n]) => (
              <Chip key={k} label={label} count={n} selected={scope === k} onPress={() => setScope(k)} />
            ))}
            <View style={{ width: 1, backgroundColor: color.line, marginHorizontal: 4 }} />
            <Chip label="Recommended" selected={sort === 'recommended'} onPress={() => setSort('recommended')} />
            <Chip label="Lowest price" selected={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
            <Chip label="Highest price" selected={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
          </HScroll>
          {total === 0 && <EmptyState icon="search-outline" title={`No results for “${term}”`} body="Try a different word, a city or a category below." />}
          {show('products') && products.length > 0 && (
            <Section title="Hayve Shop" subtitle={`${products.length} listings`} action="Open Shop" onAction={() => router.push(`/shop?q=${encodeURIComponent(term)}`)}>
              <Grid min={160}>
                {products.slice(0, 8).map((p, i) => (
                  <ProductTile key={p.id} index={i} p={p} />
                ))}
              </Grid>
            </Section>
          )}
          {show('food') && restaurants.length > 0 && (
            <Section title="Hayve Bites">
              <View style={{ gap: 10 }}>
                {restaurants.map((r) => (
                  <Pressable key={r.id} onPress={() => router.push(`/bites/restaurant/${r.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: color.surface, borderRadius: radius.lg, padding: 10, borderWidth: 1, borderColor: color.line }}>
                    <Photo uri={r.image} style={{ width: 64, height: 64 }} rounded={12} icon="restaurant-outline" />
                    <View style={{ flex: 1 }}>
                      <T variant="headline">{r.name}</T>
                      <T variant="footnote" color={color.textSecondary}>
                        {r.cuisine} · {r.etaMin} min
                      </T>
                    </View>
                    <Rating value={r.rating} />
                  </Pressable>
                ))}
              </View>
            </Section>
          )}
          {show('stays') && stays.length > 0 && (
            <Section title="Hayve Stay">
              <Grid min={240}>
                {stays.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(`/stay/${p.id}`)}>
                    <Photo uri={p.images[0]} style={{ width: '100%', height: 160 }} rounded={radius.lg} icon="bed-outline" />
                    <T variant="headline" style={{ marginTop: 8 }} numberOfLines={1}>
                      {p.title}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {p.city} · {money(p.pricePerNightCents)} / night
                    </T>
                  </Pressable>
                ))}
              </Grid>
            </Section>
          )}
          {show('cars') && cars.length > 0 && (
            <Section title="Hayve Drive">
              <Grid min={240}>
                {cars.map((v) => (
                  <Pressable key={v.id} onPress={() => router.push(`/drive/${v.id}`)}>
                    <Photo uri={v.images[0]} style={{ width: '100%', height: 150 }} rounded={radius.lg} icon="car-outline" />
                    <T variant="headline" style={{ marginTop: 8 }}>
                      {v.make} {v.model}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {v.location} · {money(v.pricePerDayCents)} / day
                    </T>
                  </Pressable>
                ))}
              </Grid>
            </Section>
          )}
        </>
      ) : (
        <>
          <Section title="Browse by category">
            <Grid min={150} gap={10}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.label}
                  onPress={() => {
                    tap();
                    router.push(c.to as never);
                  }}
                  style={({ pressed }) => ({ backgroundColor: color.surface, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: pressed ? color.black : color.line, minHeight: 104, justifyContent: 'space-between' })}
                >
                  <Icon name={c.icon} size={24} />
                  <T variant="headline">{c.label}</T>
                </Pressable>
              ))}
            </Grid>
          </Section>

          <Section title="Trending on Hayve Shop" action="See all" onAction={() => router.push('/shop?sort=popular')}>
            <HScroll>
              {trending.map((p, i) => (
                <ProductTile key={p.id} index={i} p={p} width={150} />
              ))}
            </HScroll>
          </Section>

          <Section title="Popular destinations">
            <HScroll>
              {DESTINATIONS.map((d) => (
                <Pressable key={d.city} onPress={() => router.push(`/stay?destination=${d.city}`)} style={{ width: 160 }}>
                  <Photo uri={d.image} style={{ width: 160, height: 200 }} rounded={radius.lg} icon="location-outline" label={d.city} />
                  <View style={{ position: 'absolute', left: 12, bottom: 12, backgroundColor: color.white, borderRadius: radius.pill, paddingHorizontal: 12, height: 30, justifyContent: 'center' }}>
                    <T variant="subhead" weight="700">
                      {d.city}
                    </T>
                  </View>
                </Pressable>
              ))}
            </HScroll>
          </Section>

          <Section title="Fast near you" subtitle="Delivered in 25 minutes or less">
            <Grid min={260}>
              {nearby.map((r) => (
                <Pressable key={r.id} onPress={() => router.push(`/bites/restaurant/${r.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Photo uri={r.image} style={{ width: 72, height: 72 }} rounded={14} icon="restaurant-outline" />
                  <View style={{ flex: 1 }}>
                    <T variant="headline">{r.name}</T>
                    <T variant="footnote" color={color.textSecondary}>
                      {r.cuisine}
                    </T>
                    <T variant="footnote" weight="700">
                      {r.etaMin} min · {r.deliveryFeeCents ? money(r.deliveryFeeCents) : 'Free'} delivery
                    </T>
                  </View>
                </Pressable>
              ))}
            </Grid>
          </Section>
        </>
      )}
    </Screen>
  );
}
