import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { holidays } from '../../backend/api';
import type { HolidayBoard } from '../../backend/types';
import { Appear, Chip, color, EmptyState, Grid, Header, HScroll, Input, Photo, radius, Rating, Screen, T, useLayout } from '../../design';
import { money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

const FILTERS: { key: string; label: string; board?: HolidayBoard; tag?: string }[] = [
  { key: 'all', label: 'All trips' },
  { key: 'ai', label: 'All inclusive', board: 'all_inclusive' },
  { key: 'beach', label: 'Beach', tag: 'Beach' },
  { key: 'family', label: 'Family', tag: 'Family' },
  { key: 'city', label: 'City', tag: 'City' },
  { key: 'winter', label: 'Winter sun', tag: 'Winter sun' },
];

/** Hayve Holidays: package trips from travel partners (flights, hotel, transfers, meals). */
export default function Holidays() {
  const { isWide } = useLayout();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const f = FILTERS.find((x) => x.key === filter)!;
  const list = useLive(() => holidays.listHolidays({ q, board: f.board, tag: f.tag }), [q, filter]).data ?? [];

  return (
    <Screen header={<Header back title="Hayve Holidays" subtitle="Flights, hotel and transfers in one booking" fallback="/" />}>
      <Input icon="search" placeholder="Where do you want to go?" value={q} onChangeText={setQ} returnKeyType="search" />
      <HScroll gap={8} style={{ marginTop: 12, marginBottom: 16 }}>
        {FILTERS.map((x) => (
          <Chip key={x.key} label={x.label} selected={filter === x.key} onPress={() => setFilter(x.key)} />
        ))}
      </HScroll>
      {list.length === 0 ? (
        <EmptyState icon="airplane-outline" title="No trips match" body="Try another place or filter." action="Show all trips" onAction={() => { setQ(''); setFilter('all'); }} />
      ) : (
        <Grid min={isWide ? 300 : 320} gap={18}>
          {list.map((h, i) => (
            <Appear key={h.id} index={i}>
              <Pressable onPress={() => router.push(`/holidays/${h.id}`)} accessibilityRole="button" accessibilityLabel={`${h.title}, from ${money(h.pricePerPersonCents)} per person`} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, gap: 10 })}>
                <Photo uri={h.images[0]} style={{ width: '100%', aspectRatio: 1.5 }} rounded={radius.lg} icon="airplane-outline" label={h.city} />
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T variant="headline" numberOfLines={1} style={{ flex: 1 }}>
                      {h.title}
                    </T>
                    <Rating value={h.rating} count={h.reviewCount} />
                  </View>
                  <T variant="footnote" color={color.textSecondary}>
                    {h.hotel} · {h.nights} nights · {holidays.BOARD_LABEL[h.board]}
                  </T>
                  <T variant="subhead" weight="700" style={{ marginTop: 2 }}>
                    {money(h.pricePerPersonCents)} <T variant="footnote" color={color.textSecondary}>per person, flights included</T>
                  </T>
                </View>
              </Pressable>
            </Appear>
          ))}
        </Grid>
      )}
    </Screen>
  );
}
