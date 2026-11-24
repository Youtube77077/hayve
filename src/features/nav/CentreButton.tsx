import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { color, font, Icon, shadow, tap, useReducedMotion } from '../../design';
import { useT } from '../../lib/i18n';
import { ACTIONS, arcPositions, hitTest, type QuickAction } from './actions';

const SIZE = 62;
const ITEM = 48;
const HOT_SCALE = 1.24;
const HOLD_MS = 260;
const SLOT = SIZE + 16;
const LABEL_W = 112;
const native = Platform.OS !== 'web';

/**
 * The raised indigo button in the middle of the bottom bar. Tap: start what you do most.
 * Hold (or slide up): every action fans out in a half circle as icons only. Slide onto one and let
 * go; the one under your thumb grows, turns indigo and shows its name above it.
 */
export function CentreButton({ primary, active }: { primary: QuickAction; active: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const [centerX, setCenterX] = useState(width / 2);
  const slot = useRef<View>(null);

  // As wide as the screen allows, so neighbours never touch, even when one is enlarged.
  const radius = Math.max(130, Math.min(176, width / 2 - ITEM / 2 - 12));
  const points = useMemo(() => arcPositions(ACTIONS.length, radius, 168, 12).map((p) => ({ x: p.x, y: p.y - 30 })), [radius]);

  // One value for the menu, one per item (staggered entrance) and one per item for "under the thumb".
  const menu = useRef(new Animated.Value(0)).current;
  const items = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const hot = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const press = useRef(new Animated.Value(0)).current;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const hoverRef = useRef(-1);
  const wasOpen = useRef(false);
  // Mouse hover only counts once the icons have settled and no finger/mouse is held on the button.
  const holding = useRef(false);
  const settled = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const measure = () => slot.current?.measureInWindow?.((x, _y, w) => Number.isFinite(x) && w && setCenterX(x + w / 2));

  const show = () => {
    if (opened.current) return;
    opened.current = true;
    settled.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => (settled.current = true), reduced ? 0 : 420);
    measure();
    setOpen(true);
    tap('light');
    menu.stopAnimation();
    items.forEach((v) => v.stopAnimation());
    if (reduced) {
      menu.setValue(1);
      items.forEach((v) => v.setValue(1));
      return;
    }
    Animated.timing(menu, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    // Fan out from the middle outwards, like a hand of cards.
    const order = ACTIONS.map((_, i) => i).sort((a, b) => Math.abs(a - (ACTIONS.length - 1) / 2) - Math.abs(b - (ACTIONS.length - 1) / 2));
    Animated.stagger(
      22,
      order.map((i) => Animated.spring(items[i], { toValue: 1, useNativeDriver: native, damping: 16, stiffness: 260, mass: 0.7 })),
    ).start();
  };

  const setHot = (i: number) => {
    const prev = hoverRef.current;
    if (i === prev) return;
    hoverRef.current = i;
    setHover(i);
    if (prev >= 0) Animated.spring(hot[prev], { toValue: 0, useNativeDriver: native, damping: 18, stiffness: 320 }).start();
    if (i >= 0) {
      tap('light');
      if (reduced) hot[i].setValue(1);
      else Animated.spring(hot[i], { toValue: 1, useNativeDriver: native, damping: 14, stiffness: 360, mass: 0.6 }).start();
    }
  };

  const hide = (then?: () => void) => {
    opened.current = false;
    setHot(-1);
    hot.forEach((v) => v.setValue(0));
    if (reduced) {
      menu.setValue(0);
      items.forEach((v) => v.setValue(0));
      setOpen(false);
      then?.();
      return;
    }
    Animated.parallel([
      Animated.timing(menu, { toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
      ...items.map((v) => Animated.timing(v, { toValue: 0, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: native })),
    ]).start(() => setOpen(false));
    then?.();
  };

  const go = (a: QuickAction) => {
    tap();
    hide(() => router.push(a.route as never));
  };

  const pressTo = (v: number) => (reduced ? press.setValue(v) : Animated.spring(press, { toValue: v, useNativeDriver: native, damping: 15, stiffness: 400 }).start());

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          pressTo(1);
          holding.current = true;
          wasOpen.current = opened.current;
          if (opened.current) return;
          timer.current = setTimeout(show, HOLD_MS);
        },
        onPanResponderMove: (_e, g) => {
          // Sliding up opens the menu straight away, without waiting for the hold.
          if (!opened.current && Math.hypot(g.dx, g.dy) > 12) {
            if (timer.current) clearTimeout(timer.current);
            show();
          }
          if (opened.current) setHot(hitTest(points, g.dx, g.dy, 46));
        },
        onPanResponderRelease: (_e, g) => {
          holding.current = false;
          pressTo(0);
          if (timer.current) clearTimeout(timer.current);
          const i = hoverRef.current;
          if (opened.current && i >= 0) return go(ACTIONS[i]);
          // A tap on the button while the menu is open closes it.
          if (wasOpen.current && Math.hypot(g.dx, g.dy) < 10) return hide();
          if (!opened.current) return go(primary);
          // Held and released without choosing: the menu stays open so you can tap an option.
        },
        onPanResponderTerminate: () => {
          holding.current = false;
          pressTo(0);
          if (timer.current) clearTimeout(timer.current);
        },
      }),
    [points, primary, reduced], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <View ref={slot} style={{ width: SLOT, alignItems: 'center' }} pointerEvents="box-none" onLayout={measure}>
      {open && (
        <>
          {/* Dimmed background; tap it to close. */}
          <Animated.View pointerEvents="box-none" style={{ position: 'absolute', bottom: -60, width: 4000, height: 4000, left: -2000 + SLOT / 2, opacity: menu }}>
            <Pressable onPress={() => hide()} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(14,14,16,0.5)' }} />
          </Animated.View>
          {ACTIONS.map((a, i) => {
            const p = points[i];
            const isHot = hover === i;
            const v = items[i];
            const h = hot[i];
            // Keep the name on screen for the outermost icons.
            const itemX = centerX + p.x;
            const shift = Math.max(12 - (itemX - LABEL_W / 2), Math.min(0, width - 12 - (itemX + LABEL_W / 2)));
            return (
              <Animated.View
                key={a.key}
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: SLOT / 2 - ITEM / 2,
                  top: -22 + SIZE / 2 - ITEM / 2,
                  width: ITEM,
                  height: ITEM,
                  opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) },
                    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                  zIndex: isHot ? 2 : 1,
                }}
              >
                {/* Name: only for the icon under your thumb, floating just above it. */}
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: ITEM + 10,
                    left: ITEM / 2 - LABEL_W / 2 + shift,
                    width: LABEL_W,
                    alignItems: 'center',
                    opacity: h,
                    transform: [{ translateY: h.interpolate({ inputRange: [0, 1], outputRange: [6, -ITEM * (HOT_SCALE - 1) * 0.5] }) }, { scale: h.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
                  }}
                >
                  <View style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: color.white }, shadow.float]}>
                    <Text numberOfLines={1} style={[{ fontSize: 14, color: color.black }, font('700')]}>
                      {t(a.label)}
                    </Text>
                  </View>
                </Animated.View>
                <Animated.View style={{ transform: [{ scale: h.interpolate({ inputRange: [0, 1], outputRange: [1, HOT_SCALE] }) }] }}>
                  <Pressable
                    onPress={() => go(a)}
                    onHoverIn={() => !holding.current && settled.current && setHot(i)}
                    onHoverOut={() => !holding.current && hoverRef.current === i && setHot(-1)}
                    onPressIn={() => setHot(i)}
                    accessibilityRole="button"
                    accessibilityLabel={t(a.label)}
                    style={[{ width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: isHot ? color.indigo : color.white, alignItems: 'center', justifyContent: 'center' }, shadow.float]}
                  >
                    <Icon name={a.icon} size={22} color={isHot ? color.white : color.black} />
                  </Pressable>
                </Animated.View>
              </Animated.View>
            );
          })}
        </>
      )}
      <Animated.View
        {...pan.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close' : t(primary.label)}
        accessibilityHint="Hold to see everything you can do"
        accessibilityState={{ selected: active, expanded: open }}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Show everything' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? show() : open ? hide() : go(primary))}
        style={[
          {
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            marginTop: -22,
            backgroundColor: color.indigo,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: color.white,
            transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
          },
          shadow.float,
          Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none', touchAction: 'none' } as object) : null,
        ]}
      >
        {/* The action's icon turns into a close icon as the menu opens. */}
        <Animated.View style={{ position: 'absolute', opacity: menu.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ rotate: menu.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }, { scale: menu.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }] }}>
          <Icon name={primary.icon} size={28} color={color.white} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', opacity: menu, transform: [{ rotate: menu.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }, { scale: menu.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <Icon name="close" size={26} color={color.white} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
