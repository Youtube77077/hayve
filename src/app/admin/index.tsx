import { useState } from 'react';
import { View } from 'react-native';
import { admin, business } from '../../backend/api';
import type { Role } from '../../backend/types';
import { Avatar, Badge, Button, Card, Chip, color, EmptyState, Group, Header, HScroll, ListRow, Photo, radius, Screen, Section, Sheet, T, useLayout } from '../../design';
import { StatusPill } from '../../features/common';
import { ago, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

type Tab = 'overview' | 'users' | 'listings' | 'orders' | 'services' | 'payments' | 'audit';
const ROLES: Role[] = ['seller', 'host', 'driver', 'courier', 'kitchen', 'merchant', 'admin'];

/** Admin console. Requires the admin role, enforced by the backend for every call. */
export default function AdminConsole() {
  const roles = useLive(() => business.myRoles()).data ?? [];
  if (!roles.includes('admin')) {
    return (
      <Screen header={<Header back title="Admin" fallback="/" />}>
        <EmptyState icon="lock-closed-outline" title="Restricted area" body="Only Hayve administrators can open the admin console." />
      </Screen>
    );
  }
  return <Console />;
}

function Console() {
  const { isWide } = useLayout();
  const [tab, setTab] = useState<Tab>('overview');
  const o = useLive(() => admin.overview()).data;
  const users = useLive(() => (tab === 'users' ? admin.users() : []), [tab]).data ?? [];
  const listings = useLive(() => (tab === 'listings' ? admin.listings() : []), [tab]).data ?? [];
  const orders = useLive(() => (tab === 'orders' ? admin.orders() : []), [tab]).data ?? [];
  const txs = useLive(() => (tab === 'payments' ? admin.transactions().slice(0, 100) : []), [tab]).data ?? [];
  const services = useLive(() => (tab === 'services' ? admin.services() : null), [tab]).data;
  const audit = useLive(() => (tab === 'audit' ? admin.auditLog() : []), [tab]).data ?? [];
  const [roleUser, setRoleUser] = useState<(typeof users)[number] | null>(null);
  const { run } = useAction();

  return (
    <Screen header={<Header back title="Admin console" subtitle="Hayve operations" fallback="/" />}>
      <HScroll gap={8}>
        {(['overview', 'users', 'listings', 'orders', 'services', 'payments', 'audit'] as Tab[]).map((t) => (
          <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} selected={tab === t} onPress={() => setTab(t)} />
        ))}
      </HScroll>

      {tab === 'overview' && o && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Card tone="dark">
            <T variant="subhead" color={color.textOnDarkSecondary}>
              Gross volume (simulated)
            </T>
            <T style={{ fontSize: 34, lineHeight: 34 + 8, fontWeight: '800', color: '#fff' }}>{money(o.gmvCents)}</T>
            <Badge label={o.ledgerBalanced ? 'Ledger balanced ✓' : 'Ledger imbalance!'} tone={o.ledgerBalanced ? 'lime' : 'danger'} style={{ marginTop: 6 }} />
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(
              [
                ['Users', o.users],
                ['Businesses', o.businesses],
                ['Active listings', o.listings],
                ['Shop orders', o.orders],
                ['Food orders', o.foodOrders],
                ['Rides', o.rides],
                ['Rentals', o.rentals],
                ['Stays', o.stays],
                ['Deliveries', o.deliveries],
                ['Restaurants', o.restaurants],
                ['Properties', o.properties],
                ['Vehicles', o.vehicles],
                ['Transactions', o.transactions],
              ] as [string, number][]
            ).map(([label, n]) => (
              <Card key={label} style={{ flexGrow: 1, flexBasis: isWide ? 160 : 140 }}>
                <T variant="title2">{n}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {label}
                </T>
              </Card>
            ))}
          </View>
        </View>
      )}

      {tab === 'users' && (
        <Section title={`${users.length} users`} style={{ marginTop: 16 }}>
          <Group>
            {users.map((u) => (
              <ListRow key={u.id} left={<Avatar uri={u.avatar} name={u.displayName} size={36} />} title={`${u.displayName} · @${u.username}`} subtitle={`${u.email} · ${u.roles.join(', ')}${u.deleted ? ' · deleted' : ''}`} onPress={() => setRoleUser(u)} />
            ))}
          </Group>
        </Section>
      )}

      {tab === 'listings' && (
        <Section title="Content moderation" style={{ marginTop: 16 }}>
          <Group>
            {listings.map((l) => (
              <ListRow
                key={l.id}
                left={<Photo uri={l.image} style={{ width: 40, height: 40 }} rounded={radius.xs} />}
                title={l.title}
                subtitle={`${l.seller} · ${money(l.priceCents)} · ${l.status}`}
                right={l.status === 'removed' ? <Button title="Restore" size="sm" variant="secondary" onPress={() => run(() => admin.moderateListing(l.id, 'restore'), { success: 'Listing restored' })} /> : <Button title="Remove" size="sm" variant="danger" onPress={() => run(() => admin.moderateListing(l.id, 'remove'), { success: 'Listing removed' })} />}
              />
            ))}
          </Group>
        </Section>
      )}

      {tab === 'orders' && (
        <Section title="Marketplace orders" subtitle="Gift purchaser identities are sealed and not visible to admins." style={{ marginTop: 16 }}>
          <Group>
            {orders.map((x) => (
              <ListRow key={x.id} title={`${x.reference} · ${x.product}`} subtitle={`${x.kind === 'gift' ? '🎁 ' : ''}Buyer: ${x.buyer} · Seller: ${x.seller} · ${money(x.totalCents)}`} right={<StatusPill status={x.status} />} />
            ))}
          </Group>
        </Section>
      )}

      {tab === 'services' && services && (
        <View style={{ marginTop: 16 }}>
          <Section title="Restaurants" style={{ marginTop: 0 }}>
            <Group>
              {services.restaurants.map((r) => (
                <ListRow key={r.id} icon="restaurant-outline" title={r.name} subtitle={`${r.owner} · ${r.orders} orders`} right={<StatusPill status={r.isOpen ? 'active' : 'cancelled'} />} />
              ))}
            </Group>
          </Section>
          <Section title="Rides">
            <Group>
              {services.rides.length === 0 ? <ListRow title="No rides" /> : services.rides.map((r) => <ListRow key={r.id} icon="car-outline" title={`${r.rider} → driver ${r.driver}`} subtitle={`${money(r.priceCents)} · ${ago(r.createdAt)}`} right={<StatusPill status={r.status} />} />)}
            </Group>
          </Section>
          <Section title="Rentals & stays">
            <Group>
              {[...services.rentals.map((r) => ({ ...r, who: r.renter, icon: 'key-outline' as const })), ...services.stays.map((s) => ({ ...s, who: s.guest, icon: 'bed-outline' as const }))].map((b) => (
                <ListRow key={b.id} icon={b.icon} title={`${b.reference} · ${b.who}`} subtitle={money(b.totalCents)} right={<StatusPill status={b.status} />} />
              ))}
              {services.rentals.length + services.stays.length === 0 && <ListRow title="No bookings" />}
            </Group>
          </Section>
          <Section title="Courier deliveries">
            <Group>
              {services.deliveries.length === 0 ? <ListRow title="No deliveries" /> : services.deliveries.map((d) => <ListRow key={d.id} icon="cube-outline" title={`${d.trackingCode} · ${d.sender}`} subtitle={money(d.priceCents)} right={<StatusPill status={d.status} />} />)}
            </Group>
          </Section>
          <Section title="Accommodation & vehicle listings">
            <Group>
              {services.properties.map((p) => (
                <ListRow key={p.id} icon="home-outline" title={p.title} subtitle={p.host} right={<Badge label={p.listed ? 'Listed' : 'Hidden'} tone={p.listed ? 'success' : 'neutral'} />} />
              ))}
              {services.vehicles.map((v) => (
                <ListRow key={v.id} icon="car-sport-outline" title={v.title} subtitle={v.host} right={<Badge label={v.listed ? 'Listed' : 'Hidden'} tone={v.listed ? 'success' : 'neutral'} />} />
              ))}
            </Group>
          </Section>
          <Section title="Businesses">
            <Group>
              {services.businesses.length === 0 ? <ListRow title="No merchant businesses yet" /> : services.businesses.map((b) => <ListRow key={b.id} icon="storefront-outline" title={b.name} subtitle={b.owner} right={<Badge label={b.status} tone={b.status === 'verified' ? 'success' : 'warning'} />} />)}
            </Group>
          </Section>
        </View>
      )}

      {tab === 'payments' && (
        <Section title="Transactions (latest 100)" style={{ marginTop: 16 }}>
          <Group>
            {txs.map((t) => (
              <ListRow key={t.id} title={`${t.type} · ${money(t.amountCents)}`} subtitle={`${t.from} → ${t.to} · ${t.method} · ${ago(t.createdAt)}`} right={<StatusPill status={t.status} />} />
            ))}
          </Group>
        </Section>
      )}

      {tab === 'audit' && (
        <Section title="Audit log" style={{ marginTop: 16 }}>
          <Group>
            {audit.map((a) => (
              <ListRow key={a.id} icon="document-text-outline" title={a.action} subtitle={`${a.actor} · ${a.target} · ${ago(a.createdAt)}`} />
            ))}
          </Group>
        </Section>
      )}

      <Sheet visible={!!roleUser} onClose={() => setRoleUser(null)} title={roleUser ? `Roles · ${roleUser.displayName}` : ''}>
        {roleUser && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ROLES.map((r) => {
              const has = roleUser.roles.includes(r);
              return (
                <Chip
                  key={r}
                  label={r}
                  selected={has}
                  onPress={() =>
                    run(() => admin.setRole(roleUser.id, r, !has), {
                      success: `${has ? 'Removed' : 'Granted'} ${r}`,
                      onDone: () => setRoleUser({ ...roleUser, roles: has ? roleUser.roles.filter((x) => x !== r) : [...roleUser.roles, r] }),
                    })
                  }
                />
              );
            })}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
