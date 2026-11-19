import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { business, social } from '../../backend/api';
import { Avatar, color, HayveLogo, layout, radius, SERVICES, type ServiceKey, service, shadow, T, tap } from '../../design';
import { useLive } from '../../lib/hooks';

/** Tab route name → service key. */
const ROUTE_KEY: Record<string, ServiceKey> = {
  index: 'home',
  explore: 'explore',
  shop: 'shop',
  pay: 'pay',
  ride: 'ride',
  bites: 'bites',
  drive: 'drive',
  stay: 'stay',
  send: 'send',
  profile: 'profile',
};

/** Destinations that live directly in the iPhone bottom bar; the rest open from the centre launcher. */
const PHONE_BAR: ServiceKey[] = ['home', 'shop', 'pay', 'profile'];

export function HayveTabBar(props: BottomTabBarProps & { wide: boolean }) {
  return props.wide ? <Sidebar {...props} /> : <BottomBar {...props} />;
}

function useActiveKey({ state }: BottomTabBarProps): ServiceKey {
  const name = state.routes[state.index]?.name;
  return ROUTE_KEY[name] ?? 'home';
}

function go(navigation: BottomTabBarProps['navigation'], key: ServiceKey) {
  const routeName = Object.entries(ROUTE_KEY).find(([, k]) => k === key)?.[0] ?? 'index';
  tap();
  navigation.navigate(routeName as never);
}

/* ------------------------------------------------------------ iPhone -- */

function BottomBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = useActiveKey(props);
  const inLauncher = !PHONE_BAR.includes(active);
  const activeService = service(active);
  const unread = useLive(() => social.unreadNotificationCount()).data ?? 0;

  const item = (key: ServiceKey) => {
    const s = service(key);
    const on = active === key;
    return (
      <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={s.short} onPress={() => go(props.navigation, key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6 }}>
        <View>
          <Ionicons name={on ? s.iconActive : s.icon} size={24} color={on ? color.primary : color.textTertiary} />
          {key === 'profile' && unread > 0 && <View style={{ position: 'absolute', top: -1, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: color.danger, borderWidth: 2, borderColor: color.surface }} />}
        </View>
        <T variant="caption" weight={on ? '700' : '600'} color={on ? color.primary : color.textTertiary}>
          {s.short}
        </T>
      </Pressable>
    );
  };

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom - 6, 8), paddingHorizontal: 12 }}>
      <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: color.surface, borderRadius: 30, height: 68, paddingHorizontal: 6, borderWidth: 1, borderColor: color.line }, shadow.float]}>
        {item('home')}
        {item('shop')}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inLauncher ? `${activeService.name} – all services` : 'All Hayve services'}
          onPress={() => {
            tap();
            router.push('/services');
          }}
          style={{ flex: 1.1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
        >
          <View style={{ width: 50, height: 50, borderRadius: 18, backgroundColor: inLauncher ? color.ink : color.primary, alignItems: 'center', justifyContent: 'center', marginTop: -2 }}>
            <Ionicons name={inLauncher ? activeService.iconActive : 'grid'} size={24} color={inLauncher ? color.lime : '#fff'} />
          </View>
          <T variant="caption" weight="700" color={inLauncher ? color.ink : color.textTertiary} style={{ fontSize: 10 }}>
            {inLauncher ? activeService.short : 'Services'}
          </T>
        </Pressable>
        {item('pay')}
        {item('profile')}
      </View>
    </View>
  );
}

/* ----------------------------------------------------- iPad / desktop -- */

function Sidebar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = useActiveKey(props);
  const me = useLive(() => social.myProfile()).data;
  const unreadN = useLive(() => social.unreadNotificationCount()).data ?? 0;
  const unreadM = useLive(() => social.unreadMessageCount()).data ?? 0;
  const roles = me?.user.roles ?? [];
  const partnerApps = business.PARTNER_APPS.filter((a) => roles.includes(a.role));

  const NavItem = ({ k }: { k: ServiceKey }) => {
    const s = service(k);
    const on = active === k;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => go(props.navigation, k)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          height: 44,
          paddingHorizontal: 12,
          borderRadius: radius.md,
          backgroundColor: on ? color.ink : pressed || hovered ? color.surfaceSunken : 'transparent',
        })}
      >
        <Ionicons name={on ? s.iconActive : s.icon} size={20} color={on ? color.lime : color.textSecondary} />
        <T variant="headline" weight={on ? '700' : '600'} color={on ? '#fff' : color.text}>
          {k === 'home' ? 'Home' : s.name}
        </T>
      </Pressable>
    );
  };

  const Link = ({ icon, label, to, badge }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; to: string; badge?: number }) => (
    <Pressable onPress={() => router.push(to as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 40, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed ? color.surfaceSunken : 'transparent' })}>
      <Ionicons name={icon} size={19} color={color.textSecondary} />
      <T variant="subhead" weight="600" style={{ flex: 1 }}>
        {label}
      </T>
      {!!badge && (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <T variant="caption" color="#fff" weight="800">
            {badge}
          </T>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={{ width: layout.sidebar, backgroundColor: color.surface, borderRightWidth: 1, borderRightColor: color.line, paddingTop: insets.top + 16 }}>
      <View style={{ paddingHorizontal: 22, paddingBottom: 16 }}>
        <HayveLogo height={30} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, gap: 2 }} showsVerticalScrollIndicator={false}>
        {SERVICES.filter((s) => s.key !== 'profile').map((s) => (
          <NavItem key={s.key} k={s.key} />
        ))}
        <View style={{ height: 1, backgroundColor: color.line, marginVertical: 12, marginHorizontal: 8 }} />
        <Link icon="chatbubbles-outline" label="Messages" to="/messages" badge={unreadM} />
        <Link icon="notifications-outline" label="Notifications" to="/notifications" badge={unreadN} />
        <Link icon="receipt-outline" label="Orders & bookings" to="/orders" />
        <Link icon="heart-outline" label="Wishlist" to="/wishlist" />
        <View style={{ height: 1, backgroundColor: color.line, marginVertical: 12, marginHorizontal: 8 }} />
        <T variant="overline" color={color.textTertiary} style={{ paddingHorizontal: 12, marginBottom: 6 }}>
          Partner apps
        </T>
        {partnerApps.map((a) => (
          <Link key={a.role} icon="briefcase-outline" label={a.name} to={a.route} />
        ))}
        <Link icon="add-circle-outline" label="Hayve for Business" to="/business" />
        {roles.includes('admin') && <Link icon="shield-checkmark-outline" label="Admin console" to="/admin" />}
      </ScrollView>
      <Pressable onPress={() => go(props.navigation, 'profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: active === 'profile' ? color.primarySoft : 'transparent' }}>
        <Avatar uri={me?.profile.avatar} name={me?.profile.displayName} size={38} />
        <View style={{ flex: 1 }}>
          <T variant="headline" numberOfLines={1}>
            {me?.profile.displayName ?? 'Profile'}
          </T>
          <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
            @{me?.profile.username}
          </T>
        </View>
        <Ionicons name="settings-outline" size={18} color={color.textTertiary} />
      </Pressable>
    </View>
  );
}
