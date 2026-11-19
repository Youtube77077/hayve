import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { social } from '../../backend/api';
import { Avatar, color, ErrorState, goBack, IconButton, layout, radius, T } from '../../design';
import { time } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const CONTEXT_ROUTE = { product: '/product/', property: '/stay/', vehicle: '/drive/', restaurant: '/bites/restaurant/', order: '/orders/', support: '/settings/help' } as const;

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: t, error } = useLive(() => social.thread(id), [id]);
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);
  const { run } = useAction();

  useEffect(() => {
    if (t) {
      try {
        social.markThreadRead(id);
      } catch {}
    }
  }, [t?.messages.length, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorState message={error.message} />;
  if (!t) return null;

  const send = () => {
    const body = text.trim();
    if (!body) return;
    void run(() => social.sendMessage(id, body), { onDone: () => setText('') });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top, backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, maxWidth: layout.maxContent, width: '100%', alignSelf: 'center' }}>
          <IconButton icon="chevron-back" label="Back" tone="clear" onPress={() => goBack('/messages')} />
          <Pressable onPress={() => router.push(`/u/${t.other.username}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar uri={t.other.avatar} name={t.other.displayName} size={40} />
            <View style={{ flex: 1 }}>
              <T variant="headline">{t.other.displayName}</T>
              <T variant="caption" color={color.textTertiary}>
                @{t.other.username}
              </T>
            </View>
          </Pressable>
        </View>
        {t.context && (
          <Pressable onPress={() => router.push(`${CONTEXT_ROUTE[t.context!.kind]}${t.context!.kind === 'support' ? '' : t.context!.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10, maxWidth: layout.maxContent, width: '100%', alignSelf: 'center' }}>
            <Ionicons name="link-outline" size={16} color={color.primary} />
            <T variant="footnote" color={color.primary} weight="700" numberOfLines={1} style={{ flex: 1 }}>
              {t.context.title}
            </T>
            <Ionicons name="chevron-forward" size={14} color={color.primary} />
          </Pressable>
        )}
      </View>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        {t.messages.length === 0 && (
          <T variant="footnote" color={color.textTertiary} center style={{ marginTop: 40 }}>
            Start the conversation. Keep payments on Hayve for Buyer Protection.
          </T>
        )}
        {t.messages.map((m) => (
          <View key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <View style={{ backgroundColor: m.mine ? color.primary : color.surface, borderRadius: radius.lg, borderBottomRightRadius: m.mine ? 6 : radius.lg, borderBottomLeftRadius: m.mine ? radius.lg : 6, paddingVertical: 10, paddingHorizontal: 14, borderWidth: m.mine ? 0 : 1, borderColor: color.line }}>
              <T color={m.mine ? '#fff' : color.text}>{m.body}</T>
            </View>
            <T variant="caption" color={color.textTertiary} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', marginTop: 2 }}>
              {time(m.createdAt)}
              {m.mine ? (m.read ? ' · Read' : ' · Sent') : ''}
            </T>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingBottom: Math.max(insets.bottom, 10), paddingTop: 10, paddingHorizontal: 12, backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={color.textTertiary}
            multiline
            style={[{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: color.surfaceSunken, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
            onSubmitEditing={send}
            blurOnSubmit={false}
            accessibilityLabel="Message"
          />
          <Pressable onPress={send} disabled={!text.trim()} accessibilityLabel="Send message" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? color.primary : color.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
