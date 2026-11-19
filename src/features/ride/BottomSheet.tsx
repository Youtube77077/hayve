import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { color, radius, shadow } from '../../design';

/**
 * Draggable bottom sheet with snap points (heights in px from the bottom).
 * Drag the handle/header; content scrolls inside. Reports the settled height so the
 * map can pad its camera and keep the centre pin above the sheet.
 */
export function BottomSheet({ snaps, index, onIndexChange, onHeight, header, children, maxHeight }: { snaps: number[]; index: number; onIndexChange: (i: number) => void; onHeight?: (h: number) => void; header?: ReactNode; children: ReactNode; maxHeight: number }) {
  const reduced = useReducedMotion();
  const [headerH, setHeaderH] = useState(0);
  const H = maxHeight;
  const height = snaps[Math.min(index, snaps.length - 1)];
  const y = useRef(new Animated.Value(H - height)).current;
  const cur = useRef(H - height);
  const st = useRef({ snaps, index, H, onIndexChange });
  st.current = { snaps, index, H, onIndexChange };

  useEffect(() => {
    const to = H - height;
    cur.current = to;
    if (reduced) y.setValue(to);
    else Animated.spring(y, { toValue: to, useNativeDriver: true, damping: 26, stiffness: 260, mass: 0.9 }).start();
    onHeight?.(height);
  }, [height, H, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => {
          const { snaps: s, H: h } = st.current;
          const min = h - Math.max(...s);
          const max = h - Math.min(...s);
          y.setValue(Math.max(min - 20, Math.min(max + 20, cur.current + g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          const { snaps: s, H: h, index: i, onIndexChange: change } = st.current;
          const pos = cur.current + g.dy + g.vy * 120;
          let best = i;
          let d = Infinity;
          s.forEach((sh, k) => {
            const dd = Math.abs(h - sh - pos);
            if (dd < d) {
              d = dd;
              best = k;
            }
          });
          if (best === i) Animated.spring(y, { toValue: h - s[i], useNativeDriver: true, damping: 26, stiffness: 260 }).start();
          change(best);
        },
      }),
    [y],
  );

  const cycle = () => onIndexChange(index < snaps.length - 1 ? index + 1 : 0);

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: H, transform: [{ translateY: y }], backgroundColor: color.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }, shadow.float]}>
      <View {...pan.panHandlers}>
        <Pressable onPress={cycle} accessibilityRole="adjustable" accessibilityLabel="Resize panel" accessibilityHint="Drag or tap to expand or collapse" style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 8 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: color.grey200 }} />
        </Pressable>
        <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>{header}</View>
      </View>
      {/* Sized to the visible part so footers inside stay on screen. */}
      <View style={{ height: Math.max(0, height - 21 - headerH) }}>{children}</View>
    </Animated.View>
  );
}
