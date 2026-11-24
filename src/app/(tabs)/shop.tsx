import { currencySymbol } from '../../lib/format';
import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, type TextInput, View } from 'react-native';
import { shop } from '../../backend/api';
import type { ProductSort } from '../../backend/api/shop';
import type { ProductCategory, ProductCondition } from '../../backend/types';
import { Button, useHotkey, Chip, color, EmptyState, Grid, HScroll, IconButton, Input, parseEuro, radius, Screen, Sheet, T, useLayout } from '../../design';
import { ProductTile, TabHeader } from '../../features/common';
import { useLive } from '../../lib/hooks';
import { usePersonalisation } from '../../features/onboarding/store';

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
  // Onboarding: "What do you like to shop for?" opens Shop on "Picked for you".
  const prefs = usePersonalisation();
  const forYou = prefs.shopFor ?? [];
  const [category, setCategory] = useState<ProductCategory | 'all' | 'for_you'>((params.category as ProductCategory) ?? (forYou.length > 1 ? 'for_you' : 'all'));
  const [q, setQ] = useState(params.q ?? '');
  const inputRef = useRef<TextInput>(null);
  useHotkey('/', () => inputRef.current?.focus());
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
  const products = useLive(() => {
    const rows = shop.listProducts({ q, category: category === 'for_you' ? undefined : category, sort, minCents, maxCents, condition: conditions });
    return category === 'for_you' ? rows.filter((p) => forYou.includes(p.category)) : rows;
  }, [q, category, sort, minCents, maxCents, conditions.join(), forYou.join()]).data ?? [];
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
          <Input ref={inputRef} icon="search" placeholder="Search for items or members" value={q} onChangeText={setQ} returnKeyType="search" autoCorrect={false} />
        </View>
        <Pressable onPress={() => setFiltersOpen(true)} accessibilityLabel="Filters and sorting" style={{ height: 50, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: activeFilters ? color.ink : color.surface, borderWidth: 1, borderColor: activeFilters ? color.ink : color.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="options-outline" size={20} color={activeFilters ? color.white : color.black} />
          {activeFilters > 0 && (
            <T variant="subhead" color="#fff" weight="700">
              {activeFilters}
            </T>
          )}
        </Pressable>
      </View>
      <HScroll style={{ marginTop: 14 }} gap={8}>
        {forYou.length > 1 && <Chip label="Picked for you" icon="sparkles-outline" selected={category === 'for_you'} onPress={() => setCategory('for_you')} />}
        <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
        {(Object.keys(shop.CATEGORY_LABEL) as ProductCategory[]).map((c) => (
          <Chip key={c} label={shop.CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </HScroll>

      {!isWide && (
        <Pressable onPress={() => router.push('/sell')} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: pressed ? color.black : color.line })}>
          <Icon name="camera-outline" size={22} />
          <View style={{ flex: 1 }}>
            <T variant="headline">Sell an item</T>
            <T variant="footnote" color={color.textSecondary}>
              Snap, price, list. Earnings land in Hayve Pay.
            </T>
          </View>
          <Icon name="arrow-forward" size={20} />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
        <T variant="subhead" color={color.textSecondary}>
          {products.length} {products.length === 1 ? 'item' : 'items'}
        </T>
        <Pressable onPress={() => setFiltersOpen(true)} hitSlop={8}>
          <T variant="subhead" color={color.black} weight="700">
            {SORTS.find((s) => s.key === sort)?.label}
          </T>
        </Pressable>
      </View>

      {products.length === 0 ? (
        <EmptyState icon="bag-handle-outline" title="No items found" body="Try removing filters or searching for something else." action="Clear filters" onAction={() => { setQ(''); setCategory('all'); setMin(''); setMax(''); setConditions([]); setSort('recommended'); }} />
      ) : (
        <Grid min={isWide ? 190 : 150} gap={14}>
          {products.map((p, i) => (
            <ProductTile key={p.id} index={i} p={p} />
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
          <Input containerStyle={{ flex: 1 }} placeholder={`Min ${currencySymbol()}`} keyboardType="decimal-pad" value={min} onChangeText={setMin} />
          <Input containerStyle={{ flex: 1 }} placeholder={`Max ${currencySymbol()}`} keyboardType="decimal-pad" value={max} onChangeText={setMax} />
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
