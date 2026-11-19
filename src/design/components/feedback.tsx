import { Ionicons } from '@expo/vector-icons';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, type IconName, radius, shadow, space } from '../tokens';
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
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
      }, 3200);
    },
    [anim],
  );

  const icon: Record<ToastKind, IconName> = { success: 'checkmark-circle', error: 'alert-circle', info: 'information-circle' };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            right: 16,
            alignItems: 'center',
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
            zIndex: 1000,
          }}
        >
          <View style={[{ maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: color.ink, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18 }, shadow.float]}>
            <Ionicons name={icon[msg.kind]} size={20} color={msg.kind === 'error' ? '#FF8A95' : color.lime} />
            <T variant="subhead" color="#fff" style={{ flexShrink: 1 }}>
              {msg.text}
            </T>
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- States -- */

export function EmptyState({ icon = 'sparkles-outline', title, body, action, onAction, compact }: { icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 28 : 56, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Ionicons name={icon} size={30} color={color.primary} />
      </View>
      <T variant="title3" center>
        {title}
      </T>
      {body && (
        <T variant="callout" color={color.textSecondary} center style={{ maxWidth: 340 }}>
          {body}
        </T>
      )}
      {action && <Button title={action} onPress={onAction} style={{ marginTop: 8 }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: color.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="cloud-offline-outline" size={30} color={color.danger} />
      </View>
      <T variant="title3" center>
        Something went wrong
      </T>
      <T variant="callout" color={color.textSecondary} center>
        {message}
      </T>
      {onRetry && <Button title="Try again" variant="outline" onPress={onRetry} />}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
      <ActivityIndicator color={color.primary} size="large" />
      {label && <T color={color.textSecondary}>{label}</T>}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: object }) {
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: color.surfaceSunken, opacity: anim }, style]} />;
}

/* ----------------------------------------------------------------- Sheet -- */

/** Bottom sheet on phones, centred dialog on iPad and desktop. */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { isWide, height } = useLayout();
  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: isWide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.overlay }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            {
              width: '100%',
              maxWidth: isWide ? 560 : undefined,
              maxHeight: height * (isWide ? 0.85 : 0.92),
              backgroundColor: color.bg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderBottomLeftRadius: isWide ? 28 : 0,
              borderBottomRightRadius: isWide ? 28 : 0,
              paddingBottom: isWide ? space.lg : Math.max(insets.bottom, space.lg),
              overflow: 'hidden',
            },
            shadow.float,
          ]}
        >
          {!isWide && <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineStrong, marginTop: 8 }} />}
          {title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm }}>
              <T variant="title3" style={{ flex: 1 }}>
                {title}
              </T>
              <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={color.ink} />
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

/** Imperative confirmation dialog. */
export function ConfirmSheet({ visible, title, body, confirm = 'Confirm', destructive, onConfirm, onClose, loading }: { visible: boolean; title: string; body?: string; confirm?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void; loading?: boolean }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {body && (
        <T color={color.textSecondary} style={{ marginBottom: space.lg }}>
          {body}
        </T>
      )}
      <View style={{ gap: 10 }}>
        <Button title={confirm} variant={destructive ? 'danger' : 'primary'} size="lg" full onPress={onConfirm} loading={loading} />
        <Button title="Cancel" variant="ghost" full onPress={onClose} />
      </View>
    </Sheet>
  );
}

/* -------------------------------------------------------------- Notice -- */

export function Notice({ icon = 'information-circle-outline', title, body, tone = 'info', action, onAction }: { icon?: IconName; title: string; body?: string; tone?: 'info' | 'warning' | 'success' | 'danger'; action?: string; onAction?: () => void }) {
  const palette = {
    info: [color.primarySoft, color.primary],
    warning: [color.warningSoft, color.warning],
    success: [color.successSoft, color.success],
    danger: [color.dangerSoft, color.danger],
  }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: palette[0], alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={palette[1]} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="subhead" weight="700" color={color.ink}>
          {title}
        </T>
        {body && (
          <T variant="footnote" color={color.textSecondary}>
            {body}
          </T>
        )}
        {action && (
          <Pressable onPress={onAction} style={{ marginTop: 6 }}>
            <T variant="subhead" weight="700" color={palette[1]}>
              {action} →
            </T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
