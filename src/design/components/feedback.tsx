import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Emoji, splitEmoji } from '../emoji/Emoji';
import { Icon } from '../icons';
import { color, radius, shadow, space } from '../tokens';
import type { IconName } from '../icons';
import { useLayout } from './layout';
import { Button, T, tap } from './primitives';

/* ----------------------------------------------------------------- Toast -- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
}

const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (text: string, kind: ToastKind = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setMsg({ id: Date.now(), text, kind });
      tap(kind === 'error' ? 'warning' : kind === 'success' ? 'success' : 'light');
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
      }, 3200);
    },
    [anim],
  );

  const icon: Record<ToastKind, IconName> = { success: 'checkmark-circle', error: 'alert-circle', info: 'information-circle' };
  const [text, emoji] = msg ? splitEmoji(msg.text) : ['', null];
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            right: 16,
            alignItems: 'center',
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
            zIndex: 1000,
          }}
        >
          <View style={[{ maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: color.black, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16 }, shadow.float]}>
            {!emoji && <Icon name={icon[msg.kind]} size={18} color={color.white} />}
            <T variant="subhead" color={color.white} style={{ flexShrink: 1 }}>
              {text}
            </T>
            {emoji && <Emoji char={emoji} size={18} />}
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- States -- */

export function EmptyState({ icon = 'sparkles-outline', title, body, action, onAction, compact }: { icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 24 : 48, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Icon name={icon} size={24} />
      </View>
      <T variant="title3" center>
        {title}
      </T>
      {body && (
        <T variant="callout" color={color.grey500} center style={{ maxWidth: 360 }}>
          {body}
        </T>
      )}
      {action && <Button title={action} variant="dark" onPress={onAction} style={{ marginTop: 12 }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Icon name="cloud-offline-outline" size={24} />
      </View>
      <T variant="title3" center>
        Something went wrong
      </T>
      <T variant="callout" color={color.grey500} center>
        {message}
      </T>
      {onRetry && <Button title="Try again" variant="outline" onPress={onRetry} />}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
      <ActivityIndicator color={color.black} />
      {label && <T color={color.grey500}>{label}</T>}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: object }) {
  const anim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.6, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: color.grey100, opacity: anim }, style]} />;
}

/** Placeholder layout for a grid of cards while content loads. */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: 160, gap: 8 }}>
          <Skeleton height={180} radius={16} />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="40%" />
        </View>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------- Sheet -- */

/** Bottom sheet on phones, centred dialog on tablets and desktop. */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { isWide, height } = useLayout();
  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: isWide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.overlay }} onPress={onClose} accessibilityLabel="Close" />
        <View
          accessibilityViewIsModal
          style={[
            {
              width: '100%',
              maxWidth: isWide ? 560 : undefined,
              maxHeight: height * (isWide ? 0.85 : 0.92),
              backgroundColor: color.white,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderBottomLeftRadius: isWide ? 20 : 0,
              borderBottomRightRadius: isWide ? 20 : 0,
              paddingBottom: isWide ? space.lg : Math.max(insets.bottom, space.lg),
              overflow: 'hidden',
            },
            shadow.float,
          ]}
        >
          {!isWide && <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.grey200, marginTop: 8 }} />}
          {title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm }}>
              <T variant="title3" style={{ flex: 1 }}>
                {title}
              </T>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.grey100, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} />
              </Pressable>
            </View>
          )}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.lg, paddingTop: space.sm }}>
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: space.xl, paddingTop: space.sm }}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmSheet({ visible, title, body, confirm = 'Confirm', destructive, onConfirm, onClose, loading }: { visible: boolean; title: string; body?: string; confirm?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void; loading?: boolean }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {body && (
        <T color={color.grey500} style={{ marginBottom: space.lg }}>
          {body}
        </T>
      )}
      <View style={{ gap: 8 }}>
        <Button title={confirm} variant={destructive ? 'dark' : 'primary'} size="lg" full onPress={onConfirm} loading={loading} />
        <Button title="Cancel" variant="outline" size="lg" full onPress={onClose} />
      </View>
    </Sheet>
  );
}

/* -------------------------------------------------------------- Notice -- */

export function Notice({ icon = 'information-circle-outline', title, body, action, onAction }: { icon?: IconName; title: string; body?: string; tone?: 'info' | 'warning' | 'success' | 'danger'; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: color.grey100, alignItems: 'flex-start' }}>
      <Icon name={icon} size={20} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="subhead" weight="700">
          {title}
        </T>
        {body && (
          <T variant="footnote" color={color.grey500}>
            {body}
          </T>
        )}
        {action && (
          <Pressable onPress={onAction} style={{ marginTop: 6 }} accessibilityRole="link">
            <T variant="subhead" weight="600" color={color.indigo}>
              {action}
            </T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
