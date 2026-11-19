import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { shop } from '../../backend/api';
import type { ProductSort } from '../../backend/api/shop';
import type { ProductCategory, ProductCondition } from '../../backend/types';
import { Button, Chip, color, EmptyState, Grid, HScroll, IconButton, Input, parseEuro, radius, Screen, Sheet, T, useLayout } from '../../design';
import { ProductTile, TabHeader } from '../../features/common';
import { useLive } from '../../lib/hooks';

const SORTS: { key: ProductSort; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'newest', label: 'Newest first' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
  { key: 'popular', label: 'Most favourited' },
];

export default function Shop() {
  const params = useLocalSearchParams<{ category?: string; q?: string; sort?: string }>();
  const { isWide } = useLayout();
  const [category, setCategory] = useState<ProductCategory | 'all'>((params.category as ProductCategory) ?? 'all');
  const [q, setQ] = useState(params.q ?? '');
  const [sort, setSort] = useState<ProductSort>((params.sort as ProductSort) ?? 'recommended');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [conditions, setConditions] = useState<ProductCondition[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (params.category) setCategory(params.category as ProductCategory);
    if (params.q != null) setQ(params.q);
    if (params.sort) setSort(params.sort as ProductSort);
  }, [params.category, params.q, params.sort]);

  const minCents = parseEuro(min) ?? undefined;
  const maxCents = parseEuro(max) ?? undefined;
  const products = useLive(() => shop.listProducts({ q, category, sort, minCents, maxCents, condition: conditions }), [q, category, sort, minCents, maxCents, conditions.join()]).data ?? [];
  const activeFilters = (minCents ? 1 : 0) + (maxCents ? 1 : 0) + conditions.length + (sort !== 'recommended' ? 1 : 0);

  return (
    <Screen
      header={
        <TabHeader
          service="shop"
          right={
            <>
              <IconButton icon="heart-outline" label="Favourites" onPress={() => router.push('/favourites')} />
              {isWide && <Button title="Sell an item" icon="add" size="sm" onPress={() => router.push('/sell')} />}
            </>
          }
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input icon="search" placeholder="Search for items or members" value={q} onChangeText={setQ} returnKeyType="search" autoCorrect={false} />
        </View>
        <Pressable onPress={() => setFiltersOpen(true)} accessibilityLabel="Filters and sorting" style={{ height: 50, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: activeFilters ? color.ink : color.surface, borderWidth: 1.5, borderColor: activeFilters ? color.ink : color.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="options-outline" size={20} color={activeFilters ? color.lime : color.ink} />
          {activeFilters > 0 && (
            <T variant="subhead" color="#fff" weight="700">
              {activeFilters}
            </T>
          )}
        </Pressable>
      </View>
      <HScroll style={{ marginTop: 14 }} gap={8}>
        <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
        {(Object.keys(shop.CATEGORY_LABEL) as ProductCategory[]).map((c) => (
          <Chip key={c} label={shop.CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </HScroll>

      {!isWide && (
        <Pressable onPress={() => router.push('/sell')} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.primary }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera" size={20} color={color.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="headline" color="#fff">
              Sell an item
            </T>
            <T variant="footnote" color={color.primaryTint}>
              Snap, price, list. Earnings land in Hayve Pay.
            </T>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
        <T variant="subhead" color={color.textSecondary}>
          {products.length} {products.length === 1 ? 'item' : 'items'}
        </T>
        <Pressable onPress={() => setFiltersOpen(true)} hitSlop={8}>
          <T variant="subhead" color={color.primary} weight="700">
            {SORTS.find((s) => s.key === sort)?.label}
          </T>
        </Pressable>
      </View>

      {products.length === 0 ? (
        <EmptyState icon="bag-handle-outline" title="No items found" body="Try removing filters or searching for something else." action="Clear filters" onAction={() => { setQ(''); setCategory('all'); setMin(''); setMax(''); setConditions([]); setSort('recommended'); }} />
      ) : (
        <Grid min={isWide ? 190 : 150} gap={14}>
          {products.map((p) => (
            <ProductTile key={p.id} p={p} />
          ))}
        </Grid>
      )}

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter & sort" footer={<Button title={`Show ${products.length} items`} size="lg" full onPress={() => setFiltersOpen(false)} />}>
        <T variant="headline" style={{ marginBottom: 10 }}>
          Sort by
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </View>
        <T variant="headline" style={{ marginTop: 22, marginBottom: 10 }}>
          Price
        </T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Input containerStyle={{ flex: 1 }} placeholder="Min €" keyboardType="decimal-pad" value={min} onChangeText={setMin} />
          <Input containerStyle={{ flex: 1 }} placeholder="Max €" keyboardType="decimal-pad" value={max} onChangeText={setMax} />
        </View>
        <T variant="headline" style={{ marginTop: 22, marginBottom: 10 }}>
          Condition
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(shop.CONDITION_LABEL) as ProductCondition[]).map((c) => (
            <Chip key={c} label={shop.CONDITION_LABEL[c]} selected={conditions.includes(c)} onPress={() => setConditions((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))} />
          ))}
        </View>
        <Button
          title="Reset filters"
          variant="ghost"
          style={{ marginTop: 18, alignSelf: 'flex-start' }}
          onPress={() => {
            setMin('');
            setMax('');
            setConditions([]);
            setSort('recommended');
          }}
        />
      </Sheet>
    </Screen>
  );
}
