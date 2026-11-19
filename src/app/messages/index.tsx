import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { social } from '../../backend/api';
import { Avatar, color, EmptyState, Header, radius, Screen, T } from '../../design';
import { ago } from '../../lib/format';
import { useLive } from '../../lib/hooks';

const CONTEXT_LABEL = { product: 'Hayve Shop', property: 'Hayve Stay', vehicle: 'Hayve Drive', restaurant: 'Hayve Bites', order: 'Order', support: 'Support' } as const;

export default function Inbox() {
  const threads = useLive(() => social.threads()).data ?? [];
  return (
    <Screen header={<Header back title="Messages" large fallback="/" />} maxWidth={760}>
      {threads.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="No messages yet" body="Message sellers, hosts and restaurants from their pages." />
      ) : (
        <View style={{ gap: 8, marginTop: 4 }}>
          {threads.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/messages/${t.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: pressed ? color.surfaceSunken : color.surface, borderWidth: 1, borderColor: t.unread ? color.primaryTint : color.line })}>
              <Avatar uri={t.other.avatar} name={t.other.displayName} size={50} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T variant="headline" style={{ flex: 1 }} numberOfLines={1}>
                    {t.other.displayName}
                  </T>
                  <T variant="caption" color={color.textTertiary}>
                    {t.lastMessage ? ago(t.lastMessage.createdAt) : ''}
                  </T>
                </View>
                {t.context && (
                  <T variant="caption" color={color.primary} weight="700" numberOfLines={1}>
                    {CONTEXT_LABEL[t.context.kind]} · {t.context.title}
                  </T>
                )}
                <T variant="footnote" color={t.unread ? color.text : color.textSecondary} weight={t.unread ? '600' : '400'} numberOfLines={1}>
                  {t.lastMessage ? `${t.lastMessage.mine ? 'You: ' : ''}${t.lastMessage.body}` : 'Say hello 👋'}
                </T>
              </View>
              {t.unread > 0 && (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <T variant="caption" color="#fff" weight="800">
                    {t.unread}
                  </T>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
