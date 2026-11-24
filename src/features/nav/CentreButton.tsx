import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { color, font, Icon, MOTION, shadow, tap, useReducedMotion } from '../../design';
import { useT } from '../../lib/i18n';
import { ACTIONS, arcPositions, hitTest, type QuickAction } from './actions';

const SIZE = 66;
const ITEM = 52;
const RADIUS = 158;
const HOLD_MS = 280;

/**
 * The big indigo button in the middle of the bottom bar: tap to start what you do most;
 * hold to fan out every action in a half circle, slide onto one and let go. The item under
 * your thumb (or mouse) grows.
 */
export function CentreButton({ primary, active }: { primary: QuickAction; active: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  // A wide half circle, lifted a little so the outer items clear the bar.
  const points = useMemo(() => arcPositions(ACTIONS.length, RADIUS, 172, 8).map((p) => ({ x: p.x, y: p.y - 34 })), []);
  const spread = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const hoverRef = useRef(-1);

  const show = () => {
    opened.current = true;
    setOpen(true);
    tap('light');
    if (reduced) spread.setValue(1);
    else Animated.spring(spread, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 7, tension: 90 }).start();
  };
  const hide = () => {
    opened.current = false;
    hoverRef.current = -1;
    setHover(-1);
    if (reduced) {
      spread.setValue(0);
      setOpen(false);
    } else Animated.timing(spread, { toValue: 0, duration: MOTION.fast, useNativeDriver: Platform.OS !== 'web' }).start(() => setOpen(false));
  };
  const go = (a: QuickAction) => {
    tap();
    hide();
    router.push(a.route as never);
  };
  const setHot = (i: number) => {
    if (i !== hoverRef.current) {
      hoverRef.current = i;
      setHover(i);
      if (i >= 0) tap('light');
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          opened.current = false;
          timer.current = setTimeout(show, HOLD_MS);
        },
        onPanResponderMove: (_e, g) => {
          // Sliding up opens the menu straight away, without waiting for the hold.
          if (!opened.current && (Math.abs(g.dy) > 14 || Math.abs(g.dx) > 14)) {
            if (timer.current) clearTimeout(timer.current);
            show();
          }
          if (opened.current) setHot(hitTest(points, g.dx, g.dy));
        },
        onPanResponderRelease: () => {
          if (timer.current) clearTimeout(timer.current);
          if (!opened.current) {
            go(primary);
            return;
          }
          const i = hoverRef.current;
          if (i >= 0) go(ACTIONS[i]);
          // Released without choosing: the menu stays open so you can tap an option.
        },
        onPanResponderTerminate: () => {
          if (timer.current) clearTimeout(timer.current);
        },
      }),
    [points, primary], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <View style={{ width: SIZE + 16, alignItems: 'center' }} pointerEvents="box-none">
      {open && (
        <>
          {/* Dimmed background; tap it to close. */}
          <Pressable onPress={hide} accessibilityLabel="Close actions" style={{ position: 'absolute', bottom: -40, width: 4000, height: 4000, left: -2000 + (SIZE + 16) / 2, backgroundColor: 'rgba(14,14,16,0.45)' }} />
          {ACTIONS.map((a, i) => {
            const p = points[i];
            const hot = hover === i;
            return (
              <Animated.View
                key={a.key}
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: (SIZE + 16) / 2 - ITEM / 2,
                  top: -24 + SIZE / 2 - ITEM / 2,
                  alignItems: 'center',
                  width: ITEM,
                  opacity: spread,
                  transform: [{ translateX: spread.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) }, { translateY: spread.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) }, { scale: hot ? 1.28 : 1 }],
                }}
              >
                <Pressable
                  onPress={() => go(a)}
                  onHoverIn={() => setHot(i)}
                  onHoverOut={() => setHot(-1)}
                  accessibilityRole="button"
                  accessibilityLabel={t(a.label)}
                  style={[{ width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: hot ? color.indigo : color.white, alignItems: 'center', justifyContent: 'center' }, shadow.float]}
                >
                  <Icon name={a.icon} size={24} color={hot ? color.white : color.black} />
                </Pressable>
                <Text numberOfLines={1} style={[{ marginTop: 6, fontSize: 12, color: color.white, width: 80, textAlign: 'center' }, font(hot ? '800' : '600')]}>
                  {t(a.label)}
                </Text>
              </Animated.View>
            );
          })}
        </>
      )}
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t(primary.label)}
        accessibilityHint="Hold to see everything you can do"
        accessibilityState={{ selected: active }}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Show all actions' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? show() : go(primary))}
        style={[
          {
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            marginTop: -24,
            backgroundColor: color.indigo,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            borderWidth: 4,
            borderColor: color.white,
            transform: [{ scale: open ? 0.92 : 1 }],
          },
          shadow.float,
          Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none', touchAction: 'none' } as object) : null,
        ]}
      >
        <Icon name={open ? 'close' : primary.icon} size={24} color={color.white} />
        {!open && <Text style={[{ fontSize: 11, color: color.white }, font('700')]}>{t(primary.label)}</Text>}
      </View>
    </View>
  );
}
