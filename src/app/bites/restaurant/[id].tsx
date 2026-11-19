import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bites, social } from '../../../backend/api';
import type { MenuItem } from '../../../backend/types';
import { Badge, Card, Chip, color, ErrorState, goBack, Grid, HScroll, IconButton, layout, Photo, radius, Rating, Screen, T, useLayout } from '../../../design';
import { BasketBar, MenuItemSheet } from '../../../features/bites';
import { money } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isWide, gutter } = useLayout();
  const { data, error } = useLive(() => bites.getRestaurant(id), [id]);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const { run } = useAction();
  if (error || !data) return <Screen>{error && <ErrorState message={error.message} />}</Screen>;
  const { restaurant: r, menu, categories, reviews } = data;
  const popular = menu.filter((m) => m.popular);
  const shown = section ? categories.filter((c) => c === section) : categories;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Screen edges={[]} padded={false}>
        <View style={{ height: isWide ? 320 : 250 }}>
          <Photo uri={r.image} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} icon="restaurant-outline" label={r.name} />
          <LinearGradient colors={['rgba(17,13,46,0.35)', 'transparent', 'rgba(17,13,46,0.55)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <IconButton icon="chevron-back" label="Back" tone="glass" onPress={() => goBack('/bites')} />
            <IconButton icon="chatbubble-outline" label="Contact restaurant" tone="glass" onPress={() => run(() => social.startThread(r.ownerId, { kind: 'restaurant', id: r.id, title: r.name }), { onDone: (tid) => router.push(`/messages/${tid}`) })} />
          </View>
        </View>
        <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter, marginTop: -36 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: r.logoColor, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="title3" color="#fff">
                  {r.name[0]}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="title2">{r.name}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {r.cuisine} · {r.address}
                </T>
              </View>
            </View>
            <T color={color.textSecondary} style={{ marginTop: 10 }}>
              {r.description}
            </T>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
              <Rating value={r.rating} count={r.ratingCount} size={14} />
              <Info icon="time-outline" text={`${r.etaMin}–${r.etaMin + 10} min`} />
              <Info icon="bicycle-outline" text={r.deliveryFeeCents ? money(r.deliveryFeeCents) : 'Free delivery'} />
              <Info icon="bag-outline" text={`Min. ${money(r.minOrderCents)}`} />
            </View>
            {!r.isOpen && (
              <View style={{ marginTop: 12 }}>
                <Badge label="Closed right now · you can browse the menu" tone="warning" />
              </View>
            )}
            {r.promo && r.isOpen && (
              <View style={{ marginTop: 12 }}>
                <Badge label={r.promo} tone="lime" icon="pricetag" />
              </View>
            )}
          </Card>

          <HScroll gap={8} style={{ marginTop: 18 }}>
            <Chip label="Full menu" selected={!section} onPress={() => setSection(null)} />
            {categories.map((c) => (
              <Chip key={c} label={c} selected={section === c} onPress={() => setSection(c)} />
            ))}
          </HScroll>

          {!section && popular.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <T variant="title3" style={{ marginBottom: 12 }}>
                Popular
              </T>
              <HScroll>
                {popular.map((m) => (
                  <Pressable key={m.id} onPress={() => setItem(m)} style={{ width: 170 }}>
                    <Photo uri={m.image} style={{ width: 170, height: 130 }} rounded={radius.md} icon="fast-food-outline" label={m.name} />
                    <View style={{ position: 'absolute', right: 8, top: 96, width: 30, height: 30, borderRadius: 15, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={20} color={color.ink} />
                    </View>
                    <T variant="headline" style={{ marginTop: 8 }} numberOfLines={1}>
                      {m.name}
                    </T>
                    <T variant="subhead" color={color.textSecondary}>
                      {money(m.priceCents)}
                    </T>
                  </Pressable>
                ))}
              </HScroll>
            </View>
          )}

          {shown.map((cat) => (
            <View key={cat} style={{ marginTop: 26 }}>
              <T variant="title3" style={{ marginBottom: 12 }}>
                {cat}
              </T>
              <Grid min={isWide ? 380 : 400} gap={10}>
                {menu
                  .filter((m) => m.category === cat)
                  .map((m) => (
                    <Pressable key={m.id} onPress={() => setItem(m)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: pressed ? color.surfaceSunken : color.surface, borderWidth: 1, borderColor: color.line, opacity: m.available ? 1 : 0.5 })}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <T variant="headline">{m.name}</T>
                        <T variant="footnote" color={color.textSecondary} numberOfLines={2}>
                          {m.description}
                        </T>
                        <T variant="subhead" weight="700" style={{ marginTop: 4 }}>
                          {money(m.priceCents)}
                          {!m.available ? '  · Sold out' : ''}
                        </T>
                      </View>
                      {m.image ? <Photo uri={m.image} style={{ width: 92, height: 92 }} rounded={radius.md} icon="fast-food-outline" /> : null}
                    </Pressable>
                  ))}
              </Grid>
            </View>
          ))}

          {reviews.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <T variant="title3" style={{ marginBottom: 12 }}>
                Reviews
              </T>
              <View style={{ gap: 10 }}>
                {reviews.map((rv) => (
                  <Card key={rv.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T variant="headline">{rv.author}</T>
                      <Rating value={rv.rating} />
                    </View>
                    <T color={color.textSecondary} style={{ marginTop: 4 }}>
                      {rv.text}
                    </T>
                  </Card>
                ))}
              </View>
            </View>
          )}
          <View style={{ height: 120 }} />
        </View>
      </Screen>
      <BasketBar />
      <MenuItemSheet item={item} restaurantId={r.id} open={!!item} onClose={() => setItem(null)} isOpen={r.isOpen} />
    </View>
  );
}

function Info({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon} size={15} color={color.textSecondary} />
      <T variant="footnote" weight="600">
        {text}
      </T>
    </View>
  );
}
