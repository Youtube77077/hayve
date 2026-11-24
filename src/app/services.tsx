import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { business, social } from '../backend/api';
import { color, Icon, type IconName, radius, shadow, T, tap } from '../design';
import { ProductWordmark } from '../features/nav/Wordmarks';
import { useLive } from '../lib/hooks';

/** "More" sheet on phones: the remaining products and account shortcuts. */
export default function MoreSheet() {
  const insets = useSafeAreaInsets();
  const roles = useLive(() => social.myProfile().user.roles).data ?? [];
  const unreadN = useLive(() => social.unreadNotificationCount()).data ?? 0;
  const unreadM = useLive(() => social.unreadMessageCount()).data ?? 0;
  const partner = business.PARTNER_APPS.filter((a) => roles.includes(a.role));
  const open = (route: string) => {
    tap();
    router.back();
    setTimeout(() => router.navigate(route as never), 10);
  };
  const Row = ({ icon, label, to, badge }: { icon: IconName; label: string; to: string; badge?: number }) => (
    <Pressable onPress={() => open(to)} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={21} />
      <T variant="headline" weight="500" style={{ flex: 1 }}>
        {label}
      </T>
      {!!badge && (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: color.indigo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <T variant="caption" color={color.white} weight="700">
            {badge}
          </T>
        </View>
      )}
      <Icon name="chevron-forward" size={18} color={color.grey500} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: color.overlay }} onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={[{ backgroundColor: color.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: insets.bottom + 12, maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center' }, shadow.float]}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.grey200 }} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
          {(['pay', 'drive', 'stay'] as const).map((p) => (
            <Pressable key={p} onPress={() => open(`/${p}`)} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 56, borderBottomWidth: 1, borderBottomColor: color.grey200, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flex: 1 }}>
                <ProductWordmark product={p} size={18} />
              </View>
              <Icon name="chevron-forward" size={18} color={color.grey500} />
            </Pressable>
          ))}
          <Pressable onPress={() => open('/holidays')} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, borderBottomWidth: 1, borderBottomColor: color.grey200, opacity: pressed ? 0.6 : 1 })}>
            <T style={{ flex: 1, fontSize: 18 }}>
              <T style={{ fontSize: 18 }} weight="800">Hayve</T> Holidays
            </T>
            <Icon name="chevron-forward" size={18} color={color.grey500} />
          </Pressable>
          <View style={{ height: 12 }} />
          <Row icon="search-outline" label="Search" to="/explore" />
          <Row icon="receipt-outline" label="Activity" to="/orders" />
          <Row icon="chatbubble-outline" label="Messages" to="/messages" badge={unreadM} />
          <Row icon="notifications-outline" label="Notifications" to="/notifications" badge={unreadN} />
          <Row icon="person-outline" label="Profile and settings" to="/profile" />
          {(partner.length > 0 || roles.includes('admin')) && (
            <T variant="overline" color={color.grey500} style={{ marginTop: 16, marginBottom: 4 }}>
              For business
            </T>
          )}
          {partner.map((a) => (
            <Row key={a.role} icon="briefcase-outline" label={a.name} to={a.route} />
          ))}
          {roles.includes('admin') && <Row icon="shield-checkmark-outline" label="Admin" to="/admin" />}
          <Pressable onPress={() => open('/business')} style={{ marginTop: 16, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: color.grey200 }}>
            <T variant="headline">Earn with Hayve</T>
            <T variant="footnote" color={color.grey500}>
              Sell, host, drive, deliver, or open a verified Hayve Store
            </T>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
