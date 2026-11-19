import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { business, shop } from '../../backend/api';
import { Button, Card, color, Grid, Header, Photo, radius, Screen, Section, Segmented, T, useLayout } from '../../design';
import { Empty, EarningsCard, MetricRow, RoleGate } from '../../features/business';
import { StatusPill } from '../../features/common';
import { money, shortDate } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function SellerDashboard() {
  const { run } = useAction();
  return (
    <RoleGate
      role="seller"
      title="Hayve Seller"
      onboarding={
        <View style={{ gap: 14, marginTop: 12 }}>
          <T variant="title2">Start selling on Hayve Shop</T>
          <T color={color.textSecondary}>No listing fees. Buyers pay a small fee on top, and you keep the full item price. Earnings arrive in Hayve Pay when the buyer confirms delivery.</T>
          <Button title="Activate Hayve Seller" size="lg" full onPress={() => run(() => business.becomeSeller(), { success: 'Hayve Seller activated' })} />
        </View>
      }
    >
      <Dashboard />
    </RoleGate>
  );
}

function Dashboard() {
  const { isWide } = useLayout();
  const [tab, setTab] = useState<'orders' | 'listings'>('orders');
  const listings = useLive(() => shop.myListings()).data ?? [];
  const sales = useLive(() => shop.listSales()).data ?? [];
  const toShip = sales.filter((s) => s.status === 'paid');
  return (
    <Screen header={<Header back title="Hayve Seller" subtitle="Your shop dashboard" fallback="/business" right={<Button title="New listing" icon="add" size="sm" onPress={() => router.push('/sell')} />} />}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <EarningsCard role="seller" label="Sales revenue" />
        </View>
        <View style={{ flex: 1 }}>
          <MetricRow
            items={[
              { label: 'Active listings', value: String(listings.filter((l) => l.available).length), icon: 'pricetags-outline' },
              { label: 'To ship', value: String(toShip.length), icon: 'cube-outline' },
              { label: 'Total orders', value: String(sales.length), icon: 'receipt-outline' },
              { label: 'Favourites', value: String(listings.reduce((s, l) => s + l.favouriteCount, 0)), icon: 'heart-outline' },
            ]}
          />
        </View>
      </View>
      <View style={{ marginTop: 20, maxWidth: 420 }}>
        <Segmented value={tab} onChange={setTab} options={[{ key: 'orders', label: `Orders · ${sales.length}` }, { key: 'listings', label: `Listings · ${listings.length}` }]} />
      </View>
      {tab === 'orders' ? (
        <Section title={toShip.length ? `${toShip.length} to ship` : 'Incoming orders'} style={{ marginTop: 16 }}>
          {sales.length === 0 ? (
            <Empty text="No orders yet" />
          ) : (
            <View style={{ gap: 8 }}>
              {sales.map((o) => (
                <Card key={o.id} onPress={() => router.push(`/orders/${o.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Photo uri={o.product.image} style={{ width: 54, height: 54 }} rounded={radius.sm} />
                  <View style={{ flex: 1 }}>
                    <T variant="headline" numberOfLines={1}>
                      {o.product.title}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {o.reference} · {o.counterparty} · {shortDate(o.createdAt)}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <T variant="headline">{money(o.amountCents)}</T>
                    <StatusPill status={o.status} />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </Section>
      ) : (
        <Section title="Your listings" style={{ marginTop: 16 }}>
          {listings.length === 0 ? (
            <Empty text="No listings yet" />
          ) : (
            <Grid min={isWide ? 260 : 300} gap={10}>
              {listings.map((l) => (
                <Pressable key={l.id} onPress={() => router.push(`/product/${l.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}>
                  <Photo uri={l.image} style={{ width: 60, height: 72 }} rounded={radius.sm} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="headline" numberOfLines={1}>
                      {l.title}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {money(l.priceCents)} · {l.quantity} in stock · ♥ {l.favouriteCount}
                    </T>
                    <StatusPill status={l.available ? 'active' : 'sold'} />
                  </View>
                  <Button title="Edit" size="sm" variant="secondary" onPress={() => router.push(`/sell?id=${l.id}`)} />
                </Pressable>
              ))}
            </Grid>
          )}
        </Section>
      )}
    </Screen>
  );
}
