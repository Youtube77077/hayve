import { Icon, type IconName } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { bites } from '../../backend/api';
import type { Restaurant } from '../../backend/types';
import { Badge, Chip, color, EmptyState, Grid, HScroll, Input, Photo, radius, Rating, Screen, Section, Segmented, T, useLayout } from '../../design';
import { TabHeader } from '../../features/common';
import { BasketBar } from '../../features/bites';
import { money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

const CUISINE_ICON: Record<string, IconName> = {
  Pizza: 'pizza-outline',
  Burgers: 'fast-food-outline',
  Healthy: 'leaf-outline',
  Thai: 'flame-outline',
  Sushi: 'fish-outline',
  Indian: 'restaurant-outline',
  Bakery: 'cafe-outline',
  Vegan: 'nutrition-outline',
  Breakfast: 'sunny-outline',
  Groceries: 'basket-outline',
};

export function RestaurantCard({ r, wide }: { r: Restaurant; wide?: boolean }) {
  return (
    <Pressable onPress={() => router.push(`/bites/restaurant/${r.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, width: wide ? 280 : undefined })} accessibilityRole="button" accessibilityLabel={r.name}>
      <View>
        <Photo uri={r.image} style={{ width: '100%', height: 160, opacity: r.isOpen ? 1 : 0.5 }} rounded={radius.lg} icon="restaurant-outline" label={r.name} />
        {r.promo && r.isOpen && <Badge label={r.promo} tone="lime" style={{ position: 'absolute', left: 10, top: 10 }} />}
        {!r.isOpen && <Badge label="Closed · opens 17:00" tone="dark" style={{ position: 'absolute', left: 10, top: 10 }} />}
      </View>
      <View style={{ paddingTop: 10, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <T variant="headline" numberOfLines={1} style={{ flex: 1 }}>
            {r.name}
          </T>
          <Rating value={r.rating} count={r.ratingCount} />
        </View>
        <T variant="footnote" color={color.textSecondary}>
          {r.cuisine} · {'€'.repeat(r.priceLevel)}
        </T>
        <T variant="footnote" color={color.textSecondary}>
          {r.deliveryFeeCents ? `${money(r.deliveryFeeCents)} delivery` : 'Free delivery'} · {r.etaMin} min
        </T>
      </View>
    </Pressable>
  );
}

export default function Bites() {
  const params = useLocalSearchParams<{ groceries?: string }>();
  const { isWide } = useLayout();
  const [mode, setMode] = useState<'food' | 'groceries'>(params.groceries ? 'groceries' : 'food');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<'recommended' | 'rating' | 'eta' | 'fee'>('recommended');
  useEffect(() => {
    if (params.groceries) setMode('groceries');
  }, [params.groceries]);

  const list = useLive(() => bites.listRestaurants({ q, tag: tag ?? undefined, sort, groceries: mode === 'groceries' }), [q, tag, sort, mode]).data ?? [];
  const featured = useLive(() => bites.listRestaurants({ openOnly: true }).filter((r) => r.promo)).data ?? [];

  return (
    <Screen header={<TabHeader service="bites" subtitle="Deliver to Cornelis Dirkszoonlaan 51" />}>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setTag(null);
        }}
        options={[
          { key: 'food', label: 'Restaurants', icon: 'restaurant-outline' },
          { key: 'groceries', label: 'Groceries', icon: 'basket-outline' },
        ]}
      />
      <View style={{ marginTop: 12 }}>
        <Input icon="search" placeholder={mode === 'food' ? 'Search restaurants or dishes' : 'Search groceries'} value={q} onChangeText={setQ} returnKeyType="search" />
      </View>

      {mode === 'food' && (
        <HScroll style={{ marginTop: 16 }} gap={14}>
          {bites.CUISINES.filter((c) => c !== 'Groceries').map((c) => (
            <Pressable key={c} onPress={() => setTag(tag === c ? null : c)} style={{ alignItems: 'center', gap: 6, width: 70 }}>
              <View style={{ width: 62, height: 62, borderRadius: 16, backgroundColor: tag === c ? color.black : color.white, borderWidth: 1, borderColor: tag === c ? color.black : color.line, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={CUISINE_ICON[c] ?? 'restaurant-outline'} size={26} color={tag === c ? color.white : color.black} />
              </View>
              <T variant="caption" weight={tag === c ? '800' : '600'}>
                {c}
              </T>
            </Pressable>
          ))}
        </HScroll>
      )}

      {mode === 'food' && !q && !tag && featured.length > 0 && (
        <Section title="Deals near you">
          <HScroll>
            {featured.map((r) => (
              <RestaurantCard key={r.id} r={r} wide />
            ))}
          </HScroll>
        </Section>
      )}

      <Section title={mode === 'food' ? (tag ? tag : 'All restaurants') : 'Grocery stores'}>
        <HScroll gap={8} style={{ marginBottom: 14 }}>
          <Chip label="Recommended" selected={sort === 'recommended'} onPress={() => setSort('recommended')} />
          <Chip label="Top rated" icon="star-outline" selected={sort === 'rating'} onPress={() => setSort('rating')} />
          <Chip label="Fastest" icon="time-outline" selected={sort === 'eta'} onPress={() => setSort('eta')} />
          <Chip label="Lowest fee" icon="bicycle-outline" selected={sort === 'fee'} onPress={() => setSort('fee')} />
        </HScroll>
        {list.length === 0 ? (
          <EmptyState icon="restaurant-outline" title="Nothing matches" body="Try another dish or cuisine." />
        ) : (
          <Grid min={isWide ? 280 : 300} gap={18}>
            {list.map((r) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </Grid>
        )}
      </Section>
      <BasketBar />
    </Screen>
  );
}
