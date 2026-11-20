import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Icon } from './icons';
import { color } from './tokens';

/**
 * Hayve motion. Principles (applied across app and web):
 *  - Nothing starts or stops instantly: ease in and out, springs for physical things.
 *  - Things grow out of what you tapped and come in one after another.
 *  - A small wind-up on press, a little follow-through on release.
 *  - Errors shake, wins celebrate, the pick stands out.
 *  - Frequent actions are instant (tabs, keyboard shortcuts).
 *  - prefers-reduced-motion turns all of it off.
 */
export const MOTION = {
  fast: 160,
  base: 220,
  slow: 320,
  /** Ease out (enter): quick start, soft landing. */
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  /** Ease in-out (move). */
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Ease in (exit). */
  easeIn: Easing.bezier(0.55, 0, 1, 0.45),
} as const;

/** Native driver where it exists (not on web). */
export const ND = Platform.OS !== 'web';

export { useReducedMotion };

/* -------------------------------------------------------------- press -- */

/** Wind-up on press (shrinks slightly) and a soft spring back with a hint of overshoot. */
export function usePressScale(to = 0.97) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    if (reduced) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: ND, speed: 50, bounciness: 0 }).start();
  }, [reduced, scale, to]);
  const onPressOut = useCallback(() => {
    if (reduced) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: ND, speed: 18, bounciness: 7 }).start();
  }, [reduced, scale]);
  return { scale, onPressIn, onPressOut };
}

/* -------------------------------------------------------------- shake -- */

/** A wrong code or password shakes the field, like a real lock. */
export function useShake() {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const shake = useCallback(() => {
    if (reduced) return;
    x.setValue(0);
    const step = (v: number, d: number) => Animated.timing(x, { toValue: v, duration: d, easing: MOTION.easeInOut, useNativeDriver: ND });
    Animated.sequence([step(-10, 50), step(10, 70), step(-8, 60), step(7, 55), step(-4, 50), step(0, 45)]).start();
  }, [reduced, x]);
  return { style: { transform: [{ translateX: x }] }, shake };
}

/** Wraps children and shakes them whenever `trigger` changes to a truthy value. */
export function Shake({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { style: s, shake } = useShake();
  useEffect(() => {
    if (trigger) shake();
  }, [trigger, shake]);
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------- appear -- */

/** Fades and lifts in on mount; `index` staggers lists (first 10 items, 35ms apart). */
export function Appear({ index = 0, children, style, from = 10, pointerEvents }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle>; from?: number; pointerEvents?: 'box-none' | 'auto' }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: MOTION.slow, delay: Math.min(index, 10) * 35, easing: MOTION.easeOut, useNativeDriver: ND }).start();
  }, [v, index, reduced]);
  return <Animated.View pointerEvents={pointerEvents} style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>;
}

/* ------------------------------------------------------- follow-through -- */

/** Bumps its child a beat after `value` changes (badges, counters). */
export function Bump({ value, children, style }: { value: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    Animated.sequence([Animated.delay(60), Animated.timing(s, { toValue: 1.22, duration: 120, easing: MOTION.easeOut, useNativeDriver: ND }), Animated.spring(s, { toValue: 1, useNativeDriver: ND, speed: 14, bounciness: 12 })]).start();
  }, [value, reduced, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

/* -------------------------------------------------------------- heart -- */

/** Heart toggle: pops when turned on, with a small burst backing up the main motion. */
export function HeartButton({ on, onPress, size = 20, label, count }: { on: boolean; onPress: () => void; size?: number; label: string; count?: number }) {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const press = usePressScale(0.9);
  const run = () => {
    const turningOn = !on;
    onPress();
    if (reduced || !turningOn) return;
    pop.setValue(0.6);
    burst.setValue(0);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, useNativeDriver: ND, speed: 14, bounciness: 16 }),
      Animated.timing(burst, { toValue: 1, duration: 420, easing: MOTION.easeOut, useNativeDriver: ND }),
    ]).start();
  };
  const dots = [0, 60, 120, 180, 240, 300];
  return (
    <Pressable onPress={run} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale: Animated.multiply(pop, press.scale) }] }}>
        {dots.map((deg) => {
          const r = (deg * Math.PI) / 180;
          const dist = burst.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.95] });
          return (
            <Animated.View
              key={deg}
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: deg % 120 === 0 ? color.indigo : color.black,
                opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateX: Animated.multiply(dist, Math.cos(r)) }, { translateY: Animated.multiply(dist, Math.sin(r)) }],
              }}
            />
          );
        })}
        <Icon name="heart" size={size} color={on ? color.indigo : color.black} fill={on ? color.indigo : 'none'} />
      </Animated.View>
      {count != null && <Animated.Text style={{ fontSize: 13, color: color.black, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{count}</Animated.Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------------- success -- */

const APath = Animated.createAnimatedComponent(Path);

/** End on a win: the circle grows in, the check draws itself, a small confetti burst follows. */
export function SuccessMark({ size = 88, confetti = true }: { size?: number; confetti?: boolean }) {
  const reduced = useReducedMotion();
  const circle = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const check = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.sequence([Animated.spring(circle, { toValue: 1, useNativeDriver: false, speed: 12, bounciness: 10 }), Animated.timing(check, { toValue: 1, duration: 280, easing: MOTION.easeOut, useNativeDriver: false })]).start();
  }, [circle, check, reduced]);
  const len = 60;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel="Done">
      {confetti && !reduced && <Confetti size={size * 2.6} />}
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.indigo, transform: [{ scale: circle }], alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 48 48">
          <APath d="M10 25 L20 34 L38 14" stroke={color.white} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={`${len}`} strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Brand-colour confetti (black, indigo, grey) that bursts outward in arcs and falls. */
export function Confetti({ size = 220, pieces = 18 }: { size?: number; pieces?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: ND }).start();
  }, [t]);
  const parts = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const a = (-90 + (i / pieces) * 360 + (i % 3) * 9) * (Math.PI / 180);
        const d = size * (0.28 + ((i * 37) % 10) / 40);
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, fall: 30 + (i % 4) * 12, rot: (i % 2 ? 1 : -1) * (180 + i * 20), c: [color.indigo, color.black, color.grey200][i % 3], w: i % 2 ? 6 : 4, h: i % 2 ? 10 : 6 };
      }),
    [pieces, size],
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {parts.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.w,
            height: p.h,
            borderRadius: 1.5,
            backgroundColor: p.c,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              // Curved path: out along the burst direction, then gravity pulls it down.
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.dy * 0.85, p.dy + p.fall] }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/* --------------------------------------------------------------- tilt -- */

/** Gives flat UI some depth on the web: the card tilts toward the cursor. */
export function Tilt({ children, style, max = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; max?: number }) {
  const reduced = useReducedMotion();
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  const ref = useRef<View>(null);
  if (Platform.OS !== 'web' || reduced) return <View style={style}>{children}</View>;
  const to = (x: number, y: number) => {
    Animated.spring(rx, { toValue: x, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
    Animated.spring(ry, { toValue: y, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
  };
  const handlers = {
    onPointerMove: (e: { nativeEvent: { clientX: number; clientY: number } }) => {
      const el = ref.current as unknown as HTMLElement | null;
      if (!el?.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      const px = (e.nativeEvent.clientX - r.left) / r.width - 0.5;
      const py = (e.nativeEvent.clientY - r.top) / r.height - 0.5;
      to(-py * max, px * max);
    },
    onPointerLeave: () => to(0, 0),
  };
  return (
    <Animated.View
      ref={ref as never}
      {...(handlers as object)}
      style={[style, { transform: [{ perspective: 900 }, { rotateX: rx.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) }, { rotateY: ry.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------ keyboard -- */

/** Web keyboard shortcut (skips animation for things people do many times a day). */
export function useHotkey(key: string, fn: () => void, enabled = true) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === key && !e.metaKey && !e.ctrlKey && !e.altKey && (!typing || key === 'Escape')) {
        e.preventDefault();
        cb.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [key, enabled]);
}

/** Animated visibility: keeps children mounted while they animate out (interruptible). */
export function usePresence(visible: boolean, duration: number = MOTION.base) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (visible) setMounted(true);
    if (reduced) {
      v.setValue(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return;
    }
    const anim = visible
      ? Animated.spring(v, { toValue: 1, useNativeDriver: ND, speed: 16, bounciness: 3 })
      : Animated.timing(v, { toValue: 0, duration: duration * 0.8, easing: MOTION.easeIn, useNativeDriver: ND });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, reduced, v, duration]);
  return { mounted, progress: v };
}
