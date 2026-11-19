import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { business, social } from '../backend/api';
import { color, radius, SERVICES, ServiceTile, shadow, T, tap } from '../design';
import { useLive } from '../lib/hooks';

/** The "All services" launcher opened from the centre of the iPhone tab bar. */
export default function ServicesLauncher() {
  const insets = useSafeAreaInsets();
  const roles = useLive(() => social.myProfile().user.roles).data ?? [];
  const partner = business.PARTNER_APPS.filter((a) => roles.includes(a.role));
  const open = (route: string) => {
    tap();
    router.back();
    setTimeout(() => router.navigate(route as never), 10);
  };
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: color.overlay }} onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={[{ backgroundColor: color.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, paddingBottom: insets.bottom + 16, maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center' }, shadow.float]}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineStrong }} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T variant="title2">All of Hayve</T>
              <T variant="footnote" color={color.textSecondary}>
                One account. One wallet. Everything connected.
              </T>
            </View>
            <Pressable onPress={() => router.back()} accessibilityLabel="Close" style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={color.ink} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 10 }}>
            {SERVICES.map((s) => (
              <View key={s.key} style={{ width: '50%', paddingHorizontal: 6 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => open(s.route)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, opacity: pressed ? 0.8 : 1 })}
                >
                  <ServiceTile icon={s.iconActive} accent={s.accent} size={44} />
                  <View style={{ flex: 1 }}>
                    <T variant="headline" numberOfLines={1}>
                      {s.key === 'home' ? 'Home' : s.short}
                    </T>
                    <T variant="caption" color={color.textTertiary} numberOfLines={1}>
                      {s.tagline}
                    </T>
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { icon: 'chatbubbles-outline' as const, label: 'Messages', to: '/messages' },
              { icon: 'receipt-outline' as const, label: 'Activity', to: '/orders' },
              { icon: 'gift-outline' as const, label: 'Wishlist', to: '/wishlist' },
            ].map((l) => (
              <Pressable key={l.to} onPress={() => open(l.to)} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: color.primarySoft }}>
                <Ionicons name={l.icon} size={22} color={color.primary} />
                <T variant="subhead" weight="700" color={color.primary}>
                  {l.label}
                </T>
              </Pressable>
            ))}
          </View>
          <View style={{ gap: 8 }}>
            <T variant="overline" color={color.textTertiary}>
              Partner apps
            </T>
            {partner.map((a) => (
              <Pressable key={a.role} onPress={() => open(a.route)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.ink }}>
                <Ionicons name="briefcase" size={20} color={color.lime} />
                <View style={{ flex: 1 }}>
                  <T variant="headline" color="#fff">
                    {a.name}
                  </T>
                  <T variant="footnote" color={color.textOnDarkSecondary}>
                    {a.tagline}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color.textOnDarkSecondary} />
              </Pressable>
            ))}
            <Pressable onPress={() => open('/business')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: color.lineStrong, borderStyle: 'dashed' }}>
              <Ionicons name="add-circle-outline" size={20} color={color.primary} />
              <T variant="headline" color={color.primary} style={{ flex: 1 }}>
                Earn with Hayve
              </T>
              <T variant="footnote" color={color.textSecondary}>
                Sell, host, drive, deliver
              </T>
            </Pressable>
            {roles.includes('admin') && (
              <Pressable onPress={() => open('/admin')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={color.ink} />
                <T variant="headline">Admin console</T>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
