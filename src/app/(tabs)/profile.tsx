import { Icon } from '../../design/icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { business, session, shop, social, wallet, wishlist } from '../../backend/api';
import { resetDemoData } from '../../backend/bootstrap';
import { DEMO_ACCOUNTS } from '../../backend/seed';
import { Avatar, Badge, Button, Card, color, ConfirmSheet, Group, ListRow, radius, Screen, Section, Sheet, Split, T, useLayout, useToast } from '../../design';
import { TabHeader } from '../../features/common';
import { memberSince, money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

export default function Profile() {
  const { isWide } = useLayout();
  const toast = useToast();
  const me = useLive(() => social.myProfile()).data;
  const w = useLive(() => wallet.wallet()).data;
  const counts = useLive(() => ({
    listings: shop.myListings().length,
    wishlist: wishlist.myWishlist().items.length,
    purchases: shop.listPurchases().length,
    sales: shop.listSales().length,
  })).data;
  const [switcher, setSwitcher] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  if (!me) return null;
  const roles = me.user.roles;
  const partnerApps = business.PARTNER_APPS.filter((a) => roles.includes(a.role));

  const header = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar uri={me.profile.avatar} name={me.profile.displayName} size={72} ring />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="title2">{me.profile.displayName}</T>
          <T color={color.textSecondary}>@{me.profile.username}</T>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <Badge label={me.profile.accountType === 'business' ? 'Business account' : 'Personal account'} tone="primary" />
            {!me.user.emailVerified && <Badge label="Email not verified" tone="warning" />}
            {!me.profile.isPublic && <Badge label="Private profile" icon="lock-closed" />}
          </View>
        </View>
      </View>
      <T variant="footnote" color={color.textTertiary} style={{ marginTop: 10 }}>
        Member since {memberSince(me.user.createdAt)} · {me.user.email}
      </T>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button title="View public profile" variant="outline" size="sm" icon="eye-outline" style={{ flex: 1 }} onPress={() => router.push(`/u/${me.profile.username}`)} />
        <Button title="Edit" size="sm" icon="create-outline" onPress={() => router.push('/settings/profile')} />
      </View>
    </Card>
  );

  const stats = (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
      {[
        { label: 'Balance', value: money(w?.available ?? 0), to: '/pay' },
        { label: 'Listings', value: String(counts?.listings ?? 0), to: '/business/seller' },
        { label: 'Wishlist', value: String(counts?.wishlist ?? 0), to: '/wishlist' },
        { label: 'Orders', value: String((counts?.purchases ?? 0) + (counts?.sales ?? 0)), to: '/orders' },
      ].map((s) => (
        <Pressable key={s.label} onPress={() => router.push(s.to as never)} style={{ flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: color.line }}>
          <T variant="headline" numberOfLines={1}>
            {s.value}
          </T>
          <T variant="caption" color={color.textSecondary}>
            {s.label}
          </T>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen header={<TabHeader service="profile" title="Profile" />}>
      <Split
        left={
          <View>
            {header}
            {stats}
            <Section title="Shopping & activity">
              <Group>
                <ListRow icon="gift-outline" title="My wishlist" subtitle="Share it so friends can gift you anonymously" onPress={() => router.push('/wishlist')} />
                <ListRow icon="heart-outline" title="Favourites" onPress={() => router.push('/favourites')} />
                <ListRow icon="bag-handle-outline" title="Purchases" onPress={() => router.push('/orders?tab=purchases')} />
                <ListRow icon="pricetag-outline" title="Sales" onPress={() => router.push('/orders?tab=sales')} />
                <ListRow icon="paper-plane-outline" title="Gifts sent" onPress={() => router.push('/orders?tab=gifts')} />
                <ListRow icon="car-sport-outline" title="Ride history" onPress={() => router.push('/orders?tab=rides')} />
                <ListRow icon="fast-food-outline" title="Food orders" onPress={() => router.push('/orders?tab=food')} />
                <ListRow icon="key-outline" title="Rental history" onPress={() => router.push('/orders?tab=rentals')} />
                <ListRow icon="bed-outline" title="Stay bookings" onPress={() => router.push('/orders?tab=stays')} />
                <ListRow icon="cube-outline" title="Courier history" onPress={() => router.push('/orders?tab=parcels')} />
              </Group>
            </Section>
            <Section title="Inbox">
              <Group>
                <ListRow icon="chatbubbles-outline" title="Messages" onPress={() => router.push('/messages')} />
                <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
              </Group>
            </Section>
          </View>
        }
        right={
          <View style={{ marginTop: isWide ? 0 : 0 }}>
            <Section title="Hayve for Business" style={isWide ? { marginTop: 0 } : undefined}>
              <Group>
                {partnerApps.map((a) => (
                  <ListRow key={a.role} icon="briefcase-outline" title={a.name} subtitle={a.tagline} onPress={() => router.push(a.route as never)} />
                ))}
                <ListRow icon="add-circle-outline" title={partnerApps.length ? 'Add another business role' : 'Start earning with Hayve'} subtitle="Sell, host, drive, deliver, run a kitchen or accept payments" onPress={() => router.push('/business')} />
                {roles.includes('admin') && <ListRow icon="shield-checkmark-outline" title="Admin console" onPress={() => router.push('/admin')} />}
              </Group>
            </Section>
            <Section title="Account & settings">
              <Group>
                <ListRow icon="person-outline" title="Personal details" onPress={() => router.push('/settings/profile')} />
                <ListRow icon="location-outline" title="Addresses" onPress={() => router.push('/settings/addresses')} />
                <ListRow icon="wallet-outline" title="Wallet & payment methods" onPress={() => router.push('/pay/methods')} />
                <ListRow icon="settings-outline" title="Privacy, security & notifications" subtitle="Language, currency, data" onPress={() => router.push('/settings')} />
                <ListRow icon="help-buoy-outline" title="Help & support" onPress={() => router.push('/settings/help')} />
              </Group>
            </Section>
            <Section title="Developer tools" subtitle="For testing multi-user flows in this preview build">
              <Group>
                <ListRow icon="people-outline" title="Switch demo account" subtitle="e.g. view your gift as the recipient" onPress={() => setSwitcher(true)} />
                <ListRow icon="refresh-outline" title="Reset demo data" onPress={() => setConfirmReset(true)} />
              </Group>
            </Section>
            <Button title="Sign out" variant="danger" full style={{ marginTop: 24 }} onPress={() => setConfirmOut(true)} />
            <T variant="caption" color={color.textTertiary} center style={{ marginTop: 12 }}>
              Hayve 0.1.0 · Preview build · Simulated payments
            </T>
          </View>
        }
      />

      <Sheet visible={switcher} onClose={() => setSwitcher(false)} title="Switch demo account">
        <View style={{ gap: 8 }}>
          {DEMO_ACCOUNTS.map((a) => (
            <Pressable
              key={a.email}
              onPress={() => {
                session.switchDemoUser(a.email);
                setSwitcher(false);
                toast(`Signed in as ${a.label}`, 'info');
                router.replace('/');
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: a.email === me.user.email ? color.primarySoft : pressed ? color.surfaceSunken : color.surface, borderWidth: 1, borderColor: color.line })}
            >
              <Icon name="person-circle-outline" size={26} color={color.primary} />
              <View style={{ flex: 1 }}>
                <T variant="headline">{a.label}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {a.hint}
                </T>
              </View>
              {a.email === me.user.email && <Badge label="Current" tone="lime" />}
            </Pressable>
          ))}
        </View>
      </Sheet>
      <ConfirmSheet
        visible={confirmReset}
        title="Reset demo data?"
        body="All listings, orders, bookings and wallet activity go back to the sample dataset, and you'll be signed out."
        confirm="Reset"
        destructive
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          await resetDemoData();
          setConfirmReset(false);
          toast('Demo data restored', 'info');
          session.signOut();
        }}
      />
      <ConfirmSheet visible={confirmOut} title="Sign out of Hayve?" confirm="Sign out" destructive onClose={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); session.signOut(); }} />
    </Screen>
  );
}
