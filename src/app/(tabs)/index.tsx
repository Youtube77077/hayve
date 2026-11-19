import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { bites, bookings, ride, shop, social, wallet } from '../../backend/api';
import { media } from '../../backend/media';
import {
  Avatar,
  Badge,
  Card,
  color,
  Grid,
  HScroll,
  Photo,
  radius,
  Rating,
  Screen,
  Section,
  SimBadge,
  T,
  tap,
  useLayout,
} from '../../design';
import { ProductTile, ServiceRail, StatusPill, TabHeader } from '../../features/common';
import { ago, greeting, money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

export default function Home() {
  const { isWide, columns } = useLayout();
  const me = useLive(() => social.myProfile()).data;
  const w = useLive(() => wallet.wallet()).data;
  const txs = useLive(() => wallet.transactions({ limit: 4 })).data ?? [];
  const products = useLive(() => shop.listProducts({ sort: 'recommended', limit: 12 })).data ?? [];
  const restaurants = useLive(() => bites.listRestaurants({ openOnly: true }).slice(0, 6)).data ?? [];
  const stays = useLive(() => bookings.listProperties({}).slice(0, 6)).data ?? [];
  const activeRide = useLive(() => ride.activeRide()).data;
  const purchases = useLive(() => shop.listPurchases().slice(0, 2)).data ?? [];
  const food = useLive(() => bites.myFoodOrders().filter((o) => !['delivered', 'rejected', 'cancelled'].includes(o.status))).data ?? [];
  const firstName = me?.profile.displayName.split(' ')[0] ?? '';
  const tileW = isWide ? 210 : 158;

  return (
    <Screen header={<TabHeader service="home" />}>
      {/* Greeting + search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <Pressable onPress={() => router.push('/profile')}>
          <Avatar uri={me?.profile.avatar} name={me?.profile.displayName} size={48} ring />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T variant="footnote" color={color.textSecondary}>
            {greeting()}
          </T>
          <T variant="title2" numberOfLines={1}>
            {firstName ? `Hi ${firstName}` : 'Welcome to Hayve'}
          </T>
        </View>
      </View>
      <Pressable
        onPress={() => router.push('/explore')}
        accessibilityRole="search"
        style={{ marginTop: 16, height: 52, borderRadius: radius.pill, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 10 }}
      >
        <Ionicons name="search" size={20} color={color.textSecondary} />
        <T color={color.textTertiary} style={{ flex: 1 }} numberOfLines={1}>
          Search all of Hayve
        </T>
        <Ionicons name="options-outline" size={20} color={color.textSecondary} />
      </Pressable>

      {/* Active things first */}
      {activeRide && (
        <Card tone="dark" style={{ marginTop: 16 }} onPress={() => router.push(`/ride/${activeRide.id}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="car-sport" size={24} color={color.lime} />
            <View style={{ flex: 1 }}>
              <T variant="headline" color="#fff">
                Your ride to {activeRide.dropoff.name}
              </T>
              <T variant="footnote" color={color.textOnDarkSecondary}>
                {activeRide.driver ? `${activeRide.driver.displayName} · ${activeRide.driver.vehicle.plate}` : 'Finding your driver…'}
              </T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.lime} />
          </View>
        </Card>
      )}
      {food.map((o) => (
        <Card key={o.id} tone="soft" style={{ marginTop: 12 }} onPress={() => router.push(`/bites/order/${o.id}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="fast-food" size={22} color={color.primary} />
            <View style={{ flex: 1 }}>
              <T variant="headline">{o.restaurant.name}</T>
              <T variant="footnote" color={color.textSecondary}>
                Order {o.reference}
              </T>
            </View>
            <StatusPill status={o.status} />
          </View>
        </Card>
      ))}

      {/* Wallet + services */}
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 16, marginTop: 20 }}>
        <Pressable onPress={() => router.push('/pay')} style={{ flex: isWide ? 1 : undefined }} accessibilityRole="button" accessibilityLabel="Hayve Pay wallet">
          <LinearGradient colors={[color.ink, '#251C6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 20, minHeight: 176, justifyContent: 'space-between', overflow: 'hidden' }}>
            <View style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(200,245,66,0.12)' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T variant="subhead" color={color.textOnDarkSecondary} weight="600">
                Hayve Pay balance
              </T>
              <SimBadge />
            </View>
            <View>
              <T style={{ fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1, color: '#fff' }}>{money(w?.available ?? 0)}</T>
              {!!w?.pending && (
                <T variant="footnote" color={color.lime}>
                  + {money(w.pending)} pending
                </T>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { icon: 'arrow-up' as const, label: 'Send', to: '/pay/send' },
                { icon: 'arrow-down' as const, label: 'Request', to: '/pay/request' },
                { icon: 'add' as const, label: 'Add', to: '/pay/add' },
              ].map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    tap();
                    router.push(a.to as never);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: a.label === 'Send' ? color.lime : 'rgba(255,255,255,0.12)', borderRadius: radius.pill, paddingHorizontal: 14, height: 36 }}
                >
                  <Ionicons name={a.icon} size={16} color={a.label === 'Send' ? color.ink : '#fff'} />
                  <T variant="subhead" weight="700" color={a.label === 'Send' ? color.ink : '#fff'}>
                    {a.label}
                  </T>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </Pressable>
        <Card style={{ flex: isWide ? 1.3 : undefined }}>
          <ServiceRail />
        </Card>
      </View>

      {/* Recent activity */}
      {txs.length > 0 && (
        <Section title="Recent activity" action="See all" onAction={() => router.push('/pay')}>
          <Card padded={false}>
            {txs.map((t, i) => (
              <Pressable key={t.id} onPress={() => router.push(`/pay/tx/${t.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.direction === 'in' ? color.limeSoft : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={t.direction === 'in' ? 'arrow-down' : 'arrow-up'} size={18} color={t.direction === 'in' ? color.limeInk : color.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="headline" numberOfLines={1}>
                    {t.counterparty}
                  </T>
                  <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
                    {t.note ?? t.type.replace('_', ' ')} · {ago(t.createdAt)}
                  </T>
                </View>
                <T variant="headline" color={t.direction === 'in' ? color.success : color.text}>
                  {t.direction === 'in' ? '+' : '−'}
                  {money(t.amountCents).replace('€', '€')}
                </T>
              </Pressable>
            ))}
          </Card>
        </Section>
      )}

      {/* Recent purchases */}
      {purchases.length > 0 && (
        <Section title="Your orders" action="All activity" onAction={() => router.push('/orders')}>
          <View style={{ gap: 10 }}>
            {purchases.map((o) => (
              <Card key={o.id} onPress={() => router.push(`/orders/${o.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Photo uri={o.product.image} style={{ width: 52, height: 52 }} rounded={12} />
                <View style={{ flex: 1 }}>
                  <T variant="headline" numberOfLines={1}>
                    {o.product.title}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    {o.reference} · {money(o.totalCents)}
                  </T>
                </View>
                <StatusPill status={o.status} />
              </Card>
            ))}
          </View>
        </Section>
      )}

      {/* Marketplace */}
      <Section title="Picked for you on Hayve Shop" action="Shop" onAction={() => router.push('/shop')}>
        {isWide ? (
          <Grid min={180}>
            {products.slice(0, columns(180) * 2).map((p) => (
              <ProductTile key={p.id} p={p} />
            ))}
          </Grid>
        ) : (
          <HScroll>
            {products.map((p) => (
              <ProductTile key={p.id} p={p} width={tileW} />
            ))}
          </HScroll>
        )}
      </Section>

      {/* Restaurants */}
      <Section title="Popular on Hayve Bites" action="See all" onAction={() => router.push('/bites')}>
        <HScroll>
          {restaurants.map((r) => (
            <Pressable key={r.id} onPress={() => router.push(`/bites/restaurant/${r.id}`)} style={{ width: isWide ? 300 : 260 }}>
              <Photo uri={r.image} style={{ width: '100%', height: 150 }} rounded={radius.lg} icon="restaurant-outline" label={r.name} />
              {r.promo && <Badge label={r.promo} tone="lime" style={{ position: 'absolute', top: 10, left: 10 }} />}
              <View style={{ paddingTop: 10, gap: 2 }}>
                <T variant="headline">{r.name}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Rating value={r.rating} count={r.ratingCount} />
                  <T variant="footnote" color={color.textSecondary}>
                    · {r.etaMin} min · {r.deliveryFeeCents ? `${money(r.deliveryFeeCents)} delivery` : 'Free delivery'}
                  </T>
                </View>
              </View>
            </Pressable>
          ))}
        </HScroll>
      </Section>

      {/* Ride + Drive + Send shortcuts */}
      <Section title="Get around">
        <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
          <Card tone="dark" style={{ flex: 1 }} onPress={() => router.push('/ride')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: color.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="car-sport" size={26} color={color.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="headline" color="#fff">
                  Where to?
                </T>
                <T variant="footnote" color={color.textOnDarkSecondary}>
                  Hayve Ride · drivers 4 min away
                </T>
              </View>
              <Ionicons name="arrow-forward" size={20} color={color.lime} />
            </View>
          </Card>
          <Card style={{ flex: 1 }} onPress={() => router.push('/drive')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Photo uri={media.cars.tesla} style={{ width: 52, height: 52 }} rounded={16} icon="key-outline" />
              <View style={{ flex: 1 }}>
                <T variant="headline">Rent a car</T>
                <T variant="footnote" color={color.textSecondary}>
                  Hayve Drive · from €49/day
                </T>
              </View>
              <Ionicons name="arrow-forward" size={20} color={color.primary} />
            </View>
          </Card>
          <Card style={{ flex: 1 }} onPress={() => router.push('/send')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="cube" size={24} color={color.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="headline">Send a parcel</T>
                <T variant="footnote" color={color.textSecondary}>
                  Hayve Send · from €4.95
                </T>
              </View>
              <Ionicons name="arrow-forward" size={20} color={color.primary} />
            </View>
          </Card>
        </View>
      </Section>

      {/* Stays */}
      <Section title="Stays you might like" action="Hayve Stay" onAction={() => router.push('/stay')}>
        <HScroll>
          {stays.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/stay/${p.id}`)} style={{ width: isWide ? 280 : 240 }}>
              <Photo uri={p.images[0]} style={{ width: '100%', height: 180 }} rounded={radius.lg} icon="bed-outline" label={p.title} />
              <View style={{ paddingTop: 10, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T variant="headline" numberOfLines={1} style={{ flex: 1 }}>
                    {p.neighbourhood}, {p.city}
                  </T>
                  <Rating value={p.rating} />
                </View>
                <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
                  {p.title}
                </T>
                <T variant="subhead" weight="700" style={{ marginTop: 2 }}>
                  {money(p.pricePerNightCents)} <T variant="footnote" color={color.textSecondary}>night</T>
                </T>
              </View>
            </Pressable>
          ))}
        </HScroll>
      </Section>

      {/* Business promo */}
      <Pressable onPress={() => router.push('/business')} style={{ marginTop: 28 }}>
        <View style={{ backgroundColor: color.lime, borderRadius: radius.xl, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="overline" color={color.limeInk}>
              Hayve for Business
            </T>
            <T variant="title3">Earn with one account</T>
            <T variant="footnote" color={color.limeInk}>
              Sell on Shop, host stays and cars, drive, deliver, run a kitchen or accept Hayve Pay.
            </T>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-forward" size={22} color={color.lime} />
          </View>
        </View>
      </Pressable>
    </Screen>
  );
}
