import { useEffect, useSyncExternalStore } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { color, Emoji, radius, SuccessMark, T, tap } from '../design';

/**
 * Small celebrations for good moments (first listing live, trip booked, sale made, rating sent…).
 * One at a time; tap or wait to close. Uses the app's single emoji on that screen.
 */
export interface Celebration {
  title: string;
  body?: string;
  emoji?: string;
}

let current: Celebration | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function celebrate(c: Celebration) {
  current = c;
  emit();
}

const close = () => {
  current = null;
  emit();
};

export function CelebrationHost() {
  const c = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  useEffect(() => {
    if (!c) return;
    tap('success');
    const t = setTimeout(close, 2600);
    return () => clearTimeout(t);
  }, [c]);
  if (!c) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={`${c.title}. Tap to close`} style={{ flex: 1, backgroundColor: 'rgba(14,14,16,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: color.white, borderRadius: radius.lg, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 }}>
          <SuccessMark size={84} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="title2" center>
              {c.title}
            </T>
            <Emoji char={c.emoji ?? '🎉'} size={24} />
          </View>
          {c.body && (
            <T color={color.textSecondary} center>
              {c.body}
            </T>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}
