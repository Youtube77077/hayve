import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { business, social } from '../../backend/api';
import { Avatar, color, font, HayveLogo, Icon, type IconName, layout, T, tap } from '../../design';
import { useLive } from '../../lib/hooks';
import { PRODUCT_ICON, type ProductKey, ProductWordmark } from './Wordmarks';

/** Tab route name for each destination. */
const ROUTE: Record<string, string> = { home: 'index', shop: 'shop', pay: 'pay', ride: 'ride', bites: 'bites', drive: 'drive', stay: 'stay', explore: 'explore', profile: 'profile' };
const PRODUCTS: ProductKey[] = ['shop', 'pay', 'ride', 'bites', 'drive', 'stay'];

export function HayveTabBar(props: BottomTabBarProps & { wide: boolean }) {
  return props.wide ? <Sidebar {...props} /> : <BottomBar {...props} />;
}

function activeKey({ state }: BottomTabBarProps) {
  const name = state.routes[state.index]?.name ?? 'index';
  return Object.entries(ROUTE).find(([, r]) => r === name)?.[0] ?? 'home';
}

function go(navigation: BottomTabBarProps['navigation'], key: string) {
  tap();
  navigation.navigate((ROUTE[key] ?? 'index') as never);
}

/* -------------------------------------------------------------- Mobile -- */

const MOBILE: { key: string; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'shop', label: 'Shop', icon: 'bag-handle-outline' },
  { key: 'ride', label: 'Ride', icon: 'car-outline' },
  { key: 'bites', label: 'Bites', icon: 'fast-food-outline' },
];

function BottomBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = activeKey(props);
  const inMore = !MOBILE.some((m) => m.key === active);
  const unread = useLive(() => social.unreadNotificationCount() + social.unreadMessageCount()).data ?? 0;

  const Item = ({ k, label, icon, onPress, on, badge }: { k: string; label: string; icon: IconName; onPress: () => void; on: boolean; badge?: boolean }) => (
    <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8, paddingBottom: 4 }}>
      <View>
        <Icon name={icon} size={23} color={on ? color.indigo : color.black} />
        {badge && <View style={{ position: 'absolute', top: -1, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: color.indigo }} />}
      </View>
      <Text style={[{ fontSize: 11, color: on ? color.indigo : color.black }, font(on ? '700' : '500')]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', backgroundColor: color.white, borderTopWidth: 1, borderTopColor: color.grey200, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 4 }}>
      {MOBILE.map((m) => (
        <Item key={m.key} k={m.key} label={m.label} icon={m.icon} on={active === m.key} onPress={() => go(props.navigation, m.key)} />
      ))}
      <Item k="more" label="More" icon="menu" on={inMore} badge={unread > 0} onPress={() => {
        tap();
        router.push('/services');
      }} />
    </View>
  );
}

/* ------------------------------------------------------------- Desktop -- */

function Sidebar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = activeKey(props);
  const me = useLive(() => social.myProfile()).data;
  const unreadN = useLive(() => social.unreadNotificationCount()).data ?? 0;
  const unreadM = useLive(() => social.unreadMessageCount()).data ?? 0;
  const roles = me?.user.roles ?? [];
  const partnerApps = business.PARTNER_APPS.filter((a) => roles.includes(a.role));

  return (
    <View style={{ width: layout.sidebar, backgroundColor: color.white, borderRightWidth: 1, borderRightColor: color.grey200, paddingTop: insets.top + 24 }}>
      <Pressable onPress={() => go(props.navigation, 'home')} accessibilityRole="link" accessibilityLabel="Hayve home" style={{ paddingHorizontal: 24, paddingBottom: 24, alignSelf: 'flex-start' }}>
        <HayveLogo height={30} />
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <SideLink icon="home-outline" label="Home" on={active === 'home'} onPress={() => go(props.navigation, 'home')} />
        <SideLink icon="search-outline" label="Search" on={active === 'explore'} onPress={() => go(props.navigation, 'explore')} />
        <View style={{ height: 16 }} />
        {PRODUCTS.map((p) => (
          <ProductLink key={p} product={p} on={active === p} onPress={() => go(props.navigation, p)} />
        ))}
        <View style={{ height: 1, backgroundColor: color.grey200, marginVertical: 16, marginHorizontal: 12 }} />
        <SideLink icon="receipt-outline" label="Activity" onPress={() => router.push('/orders')} />
        <SideLink icon="chatbubble-outline" label="Messages" badge={unreadM} onPress={() => router.push('/messages')} />
        <SideLink icon="notifications-outline" label="Notifications" badge={unreadN} onPress={() => router.push('/notifications')} />
        {(partnerApps.length > 0 || roles.includes('admin')) && (
          <>
            <T variant="overline" color={color.grey500} style={{ paddingHorizontal: 12, marginTop: 20, marginBottom: 6 }}>
              For business
            </T>
            {partnerApps.map((a) => (
              <SideLink key={a.role} icon="briefcase-outline" label={a.name} onPress={() => router.push(a.route as never)} />
            ))}
            {roles.includes('admin') && <SideLink icon="shield-checkmark-outline" label="Admin" onPress={() => router.push('/admin')} />}
          </>
        )}
      </ScrollView>
      <Pressable onPress={() => go(props.navigation, 'profile')} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: color.grey200, backgroundColor: pressed || active === 'profile' ? color.grey100 : color.white })}>
        <Avatar uri={me?.profile.avatarThumb ?? me?.profile.avatar} name={me?.profile.displayName} size={36} />
        <View style={{ flex: 1 }}>
          <T variant="subhead" weight="700" numberOfLines={1}>
            {me?.profile.displayName ?? 'Profile'}
          </T>
          <T variant="caption" color={color.grey500} numberOfLines={1}>
            @{me?.profile.username}
          </T>
        </View>
        <Icon name="settings-outline" size={18} />
      </Pressable>
    </View>
  );
}

function ProductLink({ product, on, onPress }: { product: ProductKey; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed || hovered || on ? color.grey100 : 'transparent', marginBottom: 2 })}
    >
      <Icon name={PRODUCT_ICON[product]} size={19} color={on ? color.indigo : color.black} />
      <ProductWordmark product={product} active={on} size={15} />
    </Pressable>
  );
}

function SideLink({ icon, label, onPress, on, badge }: { icon: IconName; label: string; onPress: () => void; on?: boolean; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed || hovered ? color.grey100 : 'transparent' })}>
      <Icon name={icon} size={19} color={on ? color.indigo : color.black} />
      <T variant="subhead" weight={on ? '700' : '500'} color={on ? color.indigo : color.black} style={{ flex: 1 }}>
        {label}
      </T>
      {!!badge && (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: color.indigo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <T variant="caption" color={color.white} weight="700">
            {badge}
          </T>
        </View>
      )}
    </Pressable>
  );
}
