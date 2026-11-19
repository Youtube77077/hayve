import { Icon } from '../design/icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { social } from '../backend/api';
import type { NotificationKind } from '../backend/types';
import { Button, color, EmptyState, Header, radius, Screen, T, type IconName } from '../design';
import { ago } from '../lib/format';
import { useLive } from '../lib/hooks';

const ICON: Record<NotificationKind, IconName> = {
  order: 'bag-check-outline',
  sale: 'pricetag-outline',
  delivery: 'cube-outline',
  ride: 'car-sport-outline',
  rental: 'key-outline',
  stay: 'bed-outline',
  payment: 'wallet-outline',
  refund: 'return-down-back-outline',
  message: 'chatbubble-outline',
  business: 'briefcase-outline',
  security: 'shield-checkmark-outline',
};

export default function Notifications() {
  const list = useLive(() => social.notifications()).data ?? [];
  const unread = list.filter((n) => !n.read).length;
  return (
    <Screen header={<Header back title="Notifications" large fallback="/" right={unread ? <Button title="Mark all read" size="sm" variant="ghost" onPress={() => social.markNotificationsRead()} /> : undefined} />} maxWidth={760}>
      {list.length === 0 ? (
        <EmptyState icon="notifications-outline" title="You're all caught up" />
      ) : (
        <View style={{ gap: 8, marginTop: 4 }}>
          {list.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => {
                social.markNotificationsRead([n.id]);
                if (n.link) router.push(n.link as never);
              }}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: pressed ? color.surfaceSunken : n.read ? color.surface : color.primarySoft, borderWidth: 1, borderColor: n.read ? color.line : color.primaryTint })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: n.read ? color.surfaceSunken : color.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICON[n.kind]} size={20} color={color.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="headline">{n.title}</T>
                <T variant="footnote" color={color.textSecondary}>
                  {n.body}
                </T>
                <T variant="caption" color={color.textTertiary}>
                  {ago(n.createdAt)}
                </T>
              </View>
              {!n.read && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary, marginTop: 6 }} />}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
