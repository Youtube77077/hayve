import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { bites } from '../../backend/api';
import { media } from '../../backend/media';
import type { MenuItem } from '../../backend/types';
import { Badge, Button, Card, Chip, color, Group, Header, HScroll, Input, ListRow, parseEuro, Photo, radius, Screen, Section, Segmented, Sheet, SwitchRow, T, useLayout } from '../../design';
import { Empty, EarningsCard, MetricRow, RoleGate } from '../../features/business';
import { SimNote, StatusPill } from '../../features/common';
import { money, time, currencySymbol } from '../../lib/format';
import { useAction, NONE, useLive } from '../../lib/hooks';

export default function KitchenDashboard() {
  return (
    <RoleGate role="kitchen" title="Hayve Kitchen" onboarding={<RegisterRestaurant />}>
      <Dashboard />
    </RoleGate>
  );
}

function RegisterRestaurant() {
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [grocery, setGrocery] = useState(false);
  const { run, busy } = useAction();
  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <T variant="title2">Bring your restaurant to Hayve Bites</T>
      <T color={color.textSecondary}>Reach hungry customers nearby. Manage your menu, take live orders and get paid into Hayve Pay.</T>
      <Input label="Restaurant name" value={name} onChangeText={setName} />
      <Input label="Cuisine" placeholder="e.g. Pizza, Italian" value={cuisine} onChangeText={setCuisine} />
      <Input label="Address" icon="location-outline" value={address} onChangeText={setAddress} />
      <Input label="Short description" multiline value={description} onChangeText={setDescription} />
      <Card padded={false}>
        <SwitchRow title="This is a grocery store" value={grocery} onChange={setGrocery} />
      </Card>
      <Button title="Register restaurant" size="lg" full loading={busy} onPress={() => run(() => bites.registerRestaurant({ name, cuisine, address, description, image: media.food.food, isGrocery: grocery }), { success: 'Welcome to Hayve Kitchen! Add your menu, then open.' })} />
    </View>
  );
}

function Dashboard() {
  const { isWide } = useLayout();
  const restaurants = useLive(() => bites.myRestaurants()).data ?? NONE;
  const [rid, setRid] = useState<string | null>(null);
  const [tab, setTab] = useState<'orders' | 'menu' | 'settings'>('orders');
  const [registering, setRegistering] = useState(false);
  useEffect(() => {
    if (!rid && restaurants.length) setRid(restaurants[0].id);
  }, [restaurants, rid]);
  const r = restaurants.find((x) => x.id === rid);
  const orders = useLive(() => (rid ? bites.kitchenOrders(rid) : []), [rid]).data ?? [];
  const { run } = useAction();
  if (!r) return null;
  const live = orders.filter((o) => ['placed', 'accepted', 'preparing', 'ready'].includes(o.status));
  const past = orders.filter((o) => !['placed', 'accepted', 'preparing', 'ready'].includes(o.status));

  return (
    <Screen header={<Header back title="Hayve Kitchen" subtitle={r.name} fallback="/business" right={<Button title="Add restaurant" size="sm" variant="secondary" onPress={() => setRegistering(true)} />} />}>
      {restaurants.length > 1 && (
        <HScroll gap={8} style={{ marginBottom: 14 }}>
          {restaurants.map((x) => (
            <Chip key={x.id} label={x.name} selected={x.id === rid} onPress={() => setRid(x.id)} />
          ))}
        </HScroll>
      )}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: r.isOpen ? color.success : color.danger }} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{r.isOpen ? 'Open for orders' : 'Closed'}</T>
          <T variant="footnote" color={color.textSecondary}>
            {r.isOpen ? 'Customers can order now' : 'Hidden from ordering until you open'}
          </T>
        </View>
        <Button title={r.isOpen ? 'Close' : 'Open now'} variant={r.isOpen ? 'outline' : 'accent'} size="sm" onPress={() => run(() => bites.updateRestaurant(r.id, { isOpen: !r.isOpen }), { success: r.isOpen ? 'Restaurant closed' : 'You are open 🎉' })} />
      </Card>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <EarningsCard role="kitchen" label="Restaurant earnings" />
        </View>
        <View style={{ flex: 1 }}>
          <MetricRow
            items={[
              { label: 'Live orders', value: String(live.length), icon: 'flame-outline' },
              { label: 'Completed', value: String(past.filter((o) => o.status === 'delivered').length), icon: 'checkmark-done-outline' },
              { label: 'Rating', value: r.rating.toFixed(1), icon: 'star-outline' },
              { label: 'Avg prep', value: `${r.etaMin} min`, icon: 'time-outline' },
            ]}
          />
        </View>
      </View>
      <View style={{ marginTop: 20, maxWidth: 480 }}>
        <Segmented value={tab} onChange={setTab} options={[{ key: 'orders', label: `Orders${live.length ? ` · ${live.length}` : ''}` }, { key: 'menu', label: 'Menu' }, { key: 'settings', label: 'Settings' }]} />
      </View>
      {tab === 'orders' && <Orders live={live} past={past} />}
      {tab === 'menu' && <Menu restaurantId={r.id} />}
      {tab === 'settings' && <RestaurantSettings r={r} />}
      <Sheet visible={registering} onClose={() => setRegistering(false)} title="Add another restaurant">
        <RegisterRestaurant />
      </Sheet>
    </Screen>
  );
}

function Orders({ live, past }: { live: ReturnType<typeof bites.kitchenOrders>; past: ReturnType<typeof bites.kitchenOrders> }) {
  const { run } = useAction();
  return (
    <>
      <Section title="Live orders" style={{ marginTop: 16 }}>
        {live.length === 0 ? (
          <Empty text="No live orders right now" />
        ) : (
          <View style={{ gap: 10 }}>
            {live.map((o) => (
              <Card key={o.id} style={{ gap: 10, borderColor: o.status === 'placed' ? color.black : color.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T variant="title3" style={{ flex: 1 }}>
                    {o.reference}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    {time(o.createdAt)}
                  </T>
                  <StatusPill status={o.status} />
                </View>
                <T variant="footnote" color={color.textSecondary}>
                  {o.customerName} · {o.address}
                </T>
                {o.lines.map((l, i) => (
                  <T key={i} variant="callout">
                    {l.qty}× {l.name}
                    {l.options.length ? ` (${l.options.join(', ')})` : ''}
                  </T>
                ))}
                {o.note ? <Badge label={`Note: ${o.note}`} tone="warning" /> : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {o.status === 'placed' && (
                    <>
                      <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => run(() => bites.kitchenUpdate(o.id, 'rejected'), { success: 'Order rejected, customer not charged' })} />
                      <Button title="Accept" variant="accent" style={{ flex: 2 }} onPress={() => run(() => bites.kitchenUpdate(o.id, 'accepted'), { success: 'Order accepted' })} />
                    </>
                  )}
                  {o.status === 'accepted' && <Button title="Start preparing" style={{ flex: 1 }} onPress={() => run(() => bites.kitchenUpdate(o.id, 'preparing'))} />}
                  {o.status === 'preparing' && <Button title="Ready for pickup" variant="accent" style={{ flex: 1 }} onPress={() => run(() => bites.kitchenUpdate(o.id, 'ready'), { success: 'A courier will collect it' })} />}
                  {o.status === 'ready' && <T variant="footnote" color={color.textSecondary}>Waiting for a Hayve Courier to collect…</T>}
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>
      <Section title="Order history" action="Request payment" onAction={() => router.push('/pay/request')}>
        {past.length === 0 ? (
          <Empty text="No past orders" />
        ) : (
          <Group>
            {past.map((o) => (
              <ListRow key={o.id} title={`${o.reference} · ${o.customerName}`} subtitle={`${o.lines.reduce((s, l) => s + l.qty, 0)} items · ${money(o.subtotalCents)}`} right={<StatusPill status={o.status} />} />
            ))}
          </Group>
        )}
      </Section>
      <View style={{ marginTop: 12 }}>
        <SimNote text="Orders placed by customers appear here instantly. Use 'Switch demo account' in Profile to place an order as a customer." />
      </View>
    </>
  );
}

function Menu({ restaurantId }: { restaurantId: string }) {
  const menu = useLive(() => bites.getRestaurant(restaurantId).menu, [restaurantId]).data ?? [];
  const [edit, setEdit] = useState<Partial<MenuItem> | null>(null);
  const [price, setPrice] = useState('');
  const { run, busy } = useAction();
  const open = (m?: MenuItem) => {
    setEdit(m ? { ...m } : { name: '', description: '', category: 'Mains' });
    setPrice(m ? (m.priceCents / 100).toFixed(2) : '');
  };
  const cats = Array.from(new Set(menu.map((m) => m.category)));
  return (
    <Section title={`Menu · ${menu.length} items`} action="Add item" onAction={() => open()} style={{ marginTop: 16 }}>
      {menu.length === 0 && <Empty text="Add your first menu item" />}
      {cats.map((c) => (
        <View key={c} style={{ marginBottom: 14 }}>
          <T variant="overline" color={color.textTertiary} style={{ marginBottom: 6 }}>
            {c}
          </T>
          <Group>
            {menu
              .filter((m) => m.category === c)
              .map((m) => (
                <ListRow
                  key={m.id}
                  left={<Photo uri={m.image} style={{ width: 44, height: 44 }} rounded={radius.sm} icon="fast-food-outline" />}
                  title={m.name}
                  subtitle={`${money(m.priceCents)}${m.available ? '' : ' · Sold out'}`}
                  onPress={() => open(m)}
                  right={
                    <Pressable onPress={() => run(() => bites.upsertMenuItem(restaurantId, { ...m, available: !m.available }), { success: m.available ? 'Marked sold out' : 'Back in stock' })} hitSlop={6}>
                      <Badge label={m.available ? 'Available' : 'Sold out'} tone={m.available ? 'success' : 'danger'} />
                    </Pressable>
                  }
                />
              ))}
          </Group>
        </View>
      ))}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit item' : 'New menu item'} footer={<Button title="Save item" size="lg" full loading={busy} onPress={() => run(() => bites.upsertMenuItem(restaurantId, { ...edit!, name: edit!.name ?? '', category: edit!.category ?? '', priceCents: parseEuro(price) ?? 0 }), { success: 'Menu updated', onDone: () => setEdit(null) })} />}>
        {edit && (
          <View style={{ gap: 12 }}>
            <Input label="Name" value={edit.name} onChangeText={(name) => setEdit({ ...edit, name })} />
            <Input label="Description" multiline value={edit.description} onChangeText={(description) => setEdit({ ...edit, description })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Input containerStyle={{ flex: 1 }} label={`Price (${currencySymbol()})`} keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
              <Input containerStyle={{ flex: 1 }} label="Section" value={edit.category} onChangeText={(category) => setEdit({ ...edit, category })} />
            </View>
            <T variant="subhead" color={color.textSecondary}>
              Photo
            </T>
            <HScroll gap={8}>
              {Object.values(media.food).map((uri) => (
                <Pressable key={uri} onPress={() => setEdit({ ...edit, image: uri })}>
                  <Photo uri={uri} style={{ width: 64, height: 64, borderWidth: edit.image === uri ? 3 : 0, borderColor: color.primary }} rounded={radius.sm} />
                </Pressable>
              ))}
            </HScroll>
            {edit.id && <Button title="Delete item" variant="danger" onPress={() => run(() => bites.deleteMenuItem(restaurantId, edit.id!), { success: 'Item deleted', onDone: () => setEdit(null) })} />}
          </View>
        )}
      </Sheet>
    </Section>
  );
}

function RestaurantSettings({ r }: { r: ReturnType<typeof bites.myRestaurants>[number] }) {
  const [description, setDescription] = useState(r.description);
  const [eta, setEta] = useState(String(r.etaMin));
  const [fee, setFee] = useState((r.deliveryFeeCents / 100).toFixed(2));
  const [min, setMin] = useState((r.minOrderCents / 100).toFixed(2));
  const [promo, setPromo] = useState(r.promo ?? '');
  const { run, busy } = useAction();
  return (
    <Section title="Business settings" style={{ marginTop: 16 }}>
      <View style={{ gap: 12, maxWidth: 560 }}>
        <Photo uri={r.image} style={{ width: '100%', height: 160 }} rounded={radius.lg} icon="restaurant-outline" />
        <HScroll gap={8}>
          {Object.values(media.food).map((uri) => (
            <Pressable key={uri} onPress={() => run(() => bites.updateRestaurant(r.id, { image: uri }), { success: 'Cover photo updated' })}>
              <Photo uri={uri} style={{ width: 64, height: 64 }} rounded={radius.sm} />
            </Pressable>
          ))}
        </HScroll>
        <Input label="Description" multiline value={description} onChangeText={setDescription} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Input containerStyle={{ flex: 1 }} label="Delivery time (min)" keyboardType="number-pad" value={eta} onChangeText={setEta} />
          <Input containerStyle={{ flex: 1 }} label={`Delivery fee (${currencySymbol()})`} keyboardType="decimal-pad" value={fee} onChangeText={setFee} />
        </View>
        <Input label={`Minimum order (${currencySymbol()})`} keyboardType="decimal-pad" value={min} onChangeText={setMin} />
        <Input label="Promotion banner" placeholder="e.g. 2 for 1 on pizzas" value={promo} onChangeText={setPromo} />
        <Button title="Save settings" size="lg" loading={busy} onPress={() => run(() => bites.updateRestaurant(r.id, { description, etaMin: Number(eta) || r.etaMin, deliveryFeeCents: parseEuro(fee) ?? 0, minOrderCents: parseEuro(min) ?? 0, promo: promo.trim() || undefined }), { success: 'Settings saved' })} />
      </View>
    </Section>
  );
}
