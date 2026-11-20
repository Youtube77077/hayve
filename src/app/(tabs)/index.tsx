import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { bites, bookings, ride, shop, social, wallet } from '../../backend/api';
import { Appear, color, Emoji, font, useHotkey, HScroll, Icon, type IconName, Photo, radius, Rating, Screen, Section, Split, T, tap, useLayout } from '../../design';
import { ServiceShortcuts, StatusPill } from '../../features/common';
import { ago, money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

const HIDE_KEY = 'hayve.hideBalance';

export default function Home() {
  const { isWide, gutter } = useLayout();
  const me = useLive(() => social.myProfile()).data;
  const w = useLive(() => wallet.wallet()).data;
  const [hidden, setHidden] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<TextInput>(null);
  // Web: press / to search from anywhere on Home.
  useHotkey('/', () => searchRef.current?.focus());
  useEffect(() => {
    AsyncStorage.getItem(HIDE_KEY)
      .then((v) => setHidden(v === '1'))
      .catch(() => {});
  }, []);
  const toggleHidden = () => {
    tap();
    setHidden((h) => {
      AsyncStorage.setItem(HIDE_KEY, h ? '0' : '1').catch(() => {});
      return !h;
    });
  };

  // Live state: only shown when something is happening right now.
  const activeRide = useLive(() => ride.activeRide()).data;
  const food = useLive(() => bites.myFoodOrders().filter((o) => !['delivered', 'rejected', 'cancelled'].includes(o.status))).data ?? [];
  const shipped = useLive(() => shop.listPurchases().filter((o) => o.status === 'shipped' || (o.status === 'paid' && o.shipment))).data ?? [];
  const stays = useLive(() => bookings.myStays().filter((b) => b.status === 'confirmed').slice(0, 1)).data ?? [];

  const activity = useLive(() => wallet.transactions({ limit: 5 })).data ?? [];
  const lastFood = useLive(() => bites.myFoodOrders().find((o) => o.status === 'delivered')).data;
  const recentPlaces = useLive(() => {
    const seen = new Set<string>();
    return ride.myRides().filter((r) => r.status === 'completed' && !seen.has(r.dropoff.id) && seen.add(r.dropoff.id)).slice(0, 3);
  }).data ?? [];
  const deals = useLive(() => bites.listRestaurants({ openOnly: true }).filter((r) => r.promo)).data ?? [];
  const picks = useLive(() => shop.listProducts({ sort: 'recommended', limit: 8 })).data ?? [];
  const firstName = me?.profile.displayName.split(' ')[0] ?? '';

  const submitSearch = () => {
    const term = q.trim();
    router.push(term ? `/explore?q=${encodeURIComponent(term)}` : '/explore');
  };

  return (
    <Screen padded={false}>
      <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: isWide ? 32 : 16 }}>
        {/* 1 · greeting + balance pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant={isWide ? 'title1' : 'title2'} weight="500">
              Hey <T variant={isWide ? 'title1' : 'title2'} weight="800">{firstName || 'there'}</T>
            </T>
            <Emoji char="👋" size={isWide ? 28 : 22} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: color.grey200 }}>
            <Pressable onPress={() => router.push('/pay')} accessibilityRole="link" accessibilityLabel={hidden ? 'Hayve Pay balance hidden. Open Hayve Pay' : `Hayve Pay balance ${money(w?.available ?? 0)}. Open Hayve Pay`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 6, height: '100%' }}>
              <Icon name="wallet-outline" size={17} />
              <T variant="subhead" weight="700" color={color.indigo}>
                {hidden ? '€ •••••' : money(w?.available ?? 0)}
              </T>
            </Pressable>
            <Pressable onPress={toggleHidden} accessibilityRole="button" accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'} hitSlop={6} style={{ paddingLeft: 6, paddingRight: 12, height: '100%', justifyContent: 'center' }}>
              <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={17} color={color.grey500} />
            </Pressable>
          </View>
        </View>

        {/* 2 · one big search */}
        <View style={{ marginTop: isWide ? 24 : 20, flexDirection: 'row', alignItems: 'center', gap: 12, height: isWide ? 64 : 56, paddingHorizontal: 20, borderRadius: radius.lg, borderWidth: 1, borderColor: color.grey200, backgroundColor: color.white }}>
          <Icon name="search" size={22} />
          <TextInput
            ref={searchRef}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            placeholder="Where to, or what do you need?"
            placeholderTextColor={color.grey500}
            accessibilityLabel="Search Hayve"
            style={[{ flex: 1, fontSize: isWide ? 18 : 16, color: color.black, height: '100%' }, font('500'), { outlineStyle: 'none' } as object]}
          />
          {q ? (
            <Pressable onPress={submitSearch} accessibilityRole="button" accessibilityLabel="Search" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.indigo, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrow-forward" size={18} color={color.white} />
            </Pressable>
          ) : null}
        </View>
        <HScroll gap={8} style={{ marginTop: 12 }}>
          {['Pizza', 'Airport', 'Vintage jacket', 'Lisbon apartment', 'Electric car'].map((s) => (
            <Pressable key={s} onPress={() => router.push(`/explore?q=${encodeURIComponent(s)}`)} style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.grey100, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <T variant="caption" weight="600">
                {s}
              </T>
            </Pressable>
          ))}
        </HScroll>

        {/* 3 · service shortcuts */}
        <View style={{ marginTop: 24 }}>
          <ServiceShortcuts />
        </View>

        {/* 4 · live cards */}
        {(activeRide || food.length > 0 || shipped.length > 0 || stays.length > 0) && (
          <View style={{ marginTop: 24, gap: 10 }}>
            {activeRide && (
              <LiveCard icon="car-outline" title={activeRide.driver ? `${activeRide.driver.displayName.split(' ')[0]} is ${activeRide.status === 'in_progress' ? 'taking you to' : 'on the way to'} ${activeRide.status === 'in_progress' ? activeRide.dropoff.name : 'you'}` : 'Finding your driver'} sub={activeRide.driver ? `${activeRide.driver.vehicle.color} ${activeRide.driver.vehicle.make} · ${activeRide.driver.vehicle.plate}` : activeRide.categoryLabel} right={<StatusPill status={activeRide.status} />} onPress={() => router.push(`/ride/${activeRide.id}`)} />
            )}
            {food.map((o) => (
              <LiveCard key={o.id} icon="fast-food-outline" title={o.status === 'picked_up' ? 'Your food is on its way' : o.status === 'placed' ? `Waiting for ${o.restaurant.name}` : `${o.restaurant.name} is preparing your food`} sub={`Order ${o.reference}`} right={<StatusPill status={o.status} />} onPress={() => router.push(`/bites/order/${o.id}`)} />
            ))}
            {shipped.map((o) => (
              <LiveCard key={o.id} icon="cube-outline" title={o.status === 'shipped' ? `${o.product.title} is on its way` : `${o.product.title} is ready to ship`} sub={o.shipment ? `Hayve Send · ${o.shipment.trackingCode}` : o.reference} right={<StatusPill status={o.status} />} onPress={() => router.push(`/orders/${o.id}`)} />
            ))}
            {stays.map((b) => (
              <LiveCard key={b.id} icon="bed-outline" title={`Upcoming stay in ${b.property.city}`} sub={`${b.checkIn} → ${b.checkOut}`} right={<StatusPill status={b.status} />} onPress={() => router.push(`/stay/booking/${b.id}`)} />
            ))}
          </View>
        )}

        {/* 5 · activity, reorder, offers */}
        <Split
          ratio={1.2}
          gap={32}
          left={
            <View>
              <Section title="Recent activity" action="See all" onAction={() => router.push('/pay')}>
                {activity.length === 0 ? (
                  <T color={color.grey500}>Nothing yet. Your payments and orders show up here.</T>
                ) : (
                  <View style={{ borderWidth: 1, borderColor: color.grey200, borderRadius: radius.lg }}>
                    {activity.map((t, i) => (
                      <Appear key={t.id} index={i}>
                      <Pressable onPress={() => router.push(`/pay/tx/${t.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: color.grey200, backgroundColor: pressed ? color.grey100 : 'transparent' })}>
                        <Icon name={t.type === 'wave_back' ? 'wave' : t.direction === 'in' ? 'arrow-down' : 'arrow-up'} size={18} color={t.type === 'wave_back' ? color.indigo : color.black} />
                        <View style={{ flex: 1 }}>
                          <T variant="subhead" weight="600" numberOfLines={1}>
                            {t.counterparty}
                          </T>
                          <T variant="caption" color={color.grey500} numberOfLines={1}>
                            {t.note ? `${t.note} · ` : ''}
                            {ago(t.createdAt)}
                          </T>
                        </View>
                        <T variant="subhead" weight="700" color={t.direction === 'in' ? color.indigo : color.black}>
                          {hidden ? '•••' : `${t.direction === 'in' ? '+' : '−'}${money(t.amountCents)}`}
                        </T>
                      </Pressable>
                      </Appear>
                    ))}
                  </View>
                )}
              </Section>
              {(lastFood || recentPlaces.length > 0) && (
                <Section title="Pick up where you left off">
                  <View style={{ gap: 10 }}>
                    {lastFood && (
                      <Pressable onPress={() => router.push(`/bites/restaurant/${lastFood.restaurant.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: pressed ? color.black : color.grey200 })}>
                        <Photo uri={lastFood.restaurant.image} style={{ width: 56, height: 56 }} rounded={radius.md} icon="fast-food-outline" />
                        <View style={{ flex: 1 }}>
                          <T variant="subhead" weight="700">
                            Reorder from {lastFood.restaurant.name}
                          </T>
                          <T variant="caption" color={color.grey500} numberOfLines={1}>
                            {lastFood.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                          </T>
                        </View>
                        <Icon name="refresh-outline" size={18} />
                      </Pressable>
                    )}
                    {recentPlaces.map((r) => (
                      <Pressable key={r.id} onPress={() => router.push(`/ride?to=${r.dropoff.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: pressed ? color.black : color.grey200 })}>
                        <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: color.grey100, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="time-outline" size={22} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <T variant="subhead" weight="700">
                            {r.dropoff.name}
                          </T>
                          <T variant="caption" color={color.grey500} numberOfLines={1}>
                            {r.dropoff.address}
                          </T>
                        </View>
                        <Icon name="car-outline" size={18} />
                      </Pressable>
                    ))}
                  </View>
                </Section>
              )}
            </View>
          }
          right={
            <View>
              <Section title="Offers near you" action="Hayve Bites" onAction={() => router.push('/bites')}>
                <View style={{ gap: 10 }}>
                  {deals.slice(0, 3).map((r) => (
                    <Pressable key={r.id} onPress={() => router.push(`/bites/restaurant/${r.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: pressed ? color.black : color.grey200 })}>
                      <Photo uri={r.image} style={{ width: 56, height: 56 }} rounded={radius.md} icon="restaurant-outline" />
                      <View style={{ flex: 1, gap: 2 }}>
                        <T variant="subhead" weight="700">
                          {r.name}
                        </T>
                        <T variant="caption" color={color.indigo} weight="600">
                          {r.promo}
                        </T>
                        <Rating value={r.rating} count={r.ratingCount} size={12} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </Section>
            </View>
          }
        />

        <Section title="Picked for you on Hayve Shop" action="Browse" onAction={() => router.push('/shop')}>
          <HScroll gap={16}>
            {picks.map((p) => (
              <Pressable key={p.id} onPress={() => router.push(`/product/${p.id}`)} style={{ width: isWide ? 200 : 150 }} accessibilityRole="link" accessibilityLabel={p.title}>
                <Photo uri={p.image} style={{ width: '100%', aspectRatio: 0.85 }} rounded={radius.md} icon="bag-handle-outline" label={p.title} />
                <T variant="subhead" weight="600" numberOfLines={1} style={{ marginTop: 8 }}>
                  {p.title}
                </T>
                <T variant="subhead" weight="700">
                  {money(p.priceCents)}
                </T>
              </Pressable>
            ))}
          </HScroll>
        </Section>
      </View>
    </Screen>
  );
}

function LiveCard({ icon, title, sub, right, onPress }: { icon: IconName; title: string; sub: string; right?: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: pressed || hovered ? color.black : color.indigo, backgroundColor: color.white })}>
      <Icon name={icon} size={24} color={color.indigo} />
      <View style={{ flex: 1 }}>
        <T variant="headline" numberOfLines={1}>
          {title}
        </T>
        <T variant="footnote" color={color.grey500} numberOfLines={1}>
          {sub}
        </T>
      </View>
      {right}
    </Pressable>
  );
}
