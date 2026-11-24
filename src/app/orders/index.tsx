import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { bites, bookings, ride, shop, wishlist } from '../../backend/api';
import { Chip, color, EmptyState, Header, HScroll, Photo, radius, Screen, T, type IconName } from '../../design';
import { StatusPill } from '../../features/common';
import { money, shortDate } from '../../lib/format';
import { useLive } from '../../lib/hooks';

type Tab = 'purchases' | 'sales' | 'gifts' | 'food' | 'rides' | 'rentals' | 'stays';

interface RowData {
  id: string;
  title: string;
  sub: string;
  amount: number;
  status: string;
  image?: string;
  icon: IconName;
  to: string;
  at: number;
}

/** Everything you've bought, sold, booked or sent across Hayve. */
export default function Activity() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'purchases');
  const rows = useLive((): RowData[] => {
    switch (tab) {
      case 'purchases':
        return shop.listPurchases().map((o) => ({ id: o.id, title: o.product.title, sub: `${o.reference} · ${o.counterparty}`, amount: o.totalCents, status: o.status, image: o.product.image, icon: 'bag-handle', to: `/orders/${o.id}`, at: o.createdAt }));
      case 'sales':
        return shop.listSales().map((o) => ({ id: o.id, title: o.product.title, sub: `${o.reference} · ${o.counterparty}`, amount: o.amountCents, status: o.status, image: o.product.image, icon: 'pricetag', to: `/orders/${o.id}`, at: o.createdAt }));
      case 'gifts':
        return wishlist.giftsSent().map((g) => ({ id: g.orderId, title: g.productTitle, sub: `Gift for ${g.recipientName} · ${g.reference}`, amount: g.totalCents, status: g.status, image: g.image, icon: 'gift', to: `/orders/${g.orderId}`, at: g.createdAt }));
      case 'food':
        return bites.myFoodOrders().map((o) => ({ id: o.id, title: o.restaurant.name, sub: `${o.reference} · ${o.lines.reduce((s, l) => s + l.qty, 0)} items`, amount: o.totalCents, status: o.status, image: o.restaurant.image, icon: 'fast-food', to: `/bites/order/${o.id}`, at: o.createdAt }));
      case 'rides':
        return ride.myRides().map((r) => ({ id: r.id, title: r.dropoff.name, sub: `${r.categoryLabel} from ${r.pickup.name}`, amount: r.priceCents, status: r.status, icon: 'car-sport', to: `/ride/${r.id}`, at: r.createdAt }));
      case 'rentals':
        return bookings.myRentals().map((r) => ({ id: r.id, title: `${r.vehicle.make} ${r.vehicle.model}`, sub: `${r.reference} · ${r.start} → ${r.end}`, amount: r.totalCents, status: r.status, image: r.vehicle.images[0], icon: 'key', to: `/drive/booking/${r.id}`, at: r.createdAt }));
      case 'stays':
        return bookings.myStays().map((b) => ({ id: b.id, title: b.property.title, sub: `${b.reference} · ${b.checkIn} → ${b.checkOut}`, amount: b.totalCents, status: b.status, image: b.property.images[0], icon: 'bed', to: `/stay/booking/${b.id}`, at: b.createdAt }));
    }
  }, [tab]).data ?? [];

  const TABS: [Tab, string][] = [
    ['purchases', 'Purchases'],
    ['sales', 'Sales'],
    ['gifts', 'Gifts sent'],
    ['food', 'Food'],
    ['rides', 'Rides'],
    ['rentals', 'Rentals'],
    ['stays', 'Stays'],
  ];

  return (
    <Screen header={<Header back title="Orders & bookings" large fallback="/profile" />}>
      <HScroll gap={8}>
        {TABS.map(([k, label]) => (
          <Chip key={k} label={label} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </HScroll>
      <View style={{ marginTop: 16, gap: 10 }}>
        {rows.length === 0 ? (
          <EmptyState icon="receipt-outline" title="Nothing here yet" body="When you buy, sell or book something on Hayve it shows up here." />
        ) : (
          rows.map((r) => (
            <Pressable key={r.id} onPress={() => router.push(r.to as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: pressed ? color.surfaceSunken : color.surface, borderWidth: 1, borderColor: color.line })}>
              {r.image ? (
                <Photo uri={r.image} style={{ width: 56, height: 56 }} rounded={12} icon={r.icon} />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={r.icon} size={24} color={color.black} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="headline" numberOfLines={1}>
                  {r.title}
                </T>
                <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
                  {r.sub}
                </T>
                <T variant="caption" color={color.textTertiary}>
                  {shortDate(r.at)}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <T variant="headline">{money(r.amount)}</T>
                <StatusPill status={r.status} />
              </View>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
