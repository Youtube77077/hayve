import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { color, FONT } from '../../design';

/**
 * "Hayve Shop", "Hayve Pay" … wordmarks for navigation.
 * "Hayve" is bold; the second word carries a small monochrome illustration
 * with a 150–250ms hover animation. The word always stays readable, and
 * motion is skipped when the user prefers reduced motion.
 */
export type ProductKey = 'shop' | 'pay' | 'ride' | 'bites' | 'drive' | 'stay';

const WORD: Record<ProductKey, string> = { shop: 'Shop', pay: 'Pay', ride: 'Ride', bites: 'Bites', drive: 'Drive', stay: 'Stay' };

export function ProductWordmark({ product, active, hovered, size = 16 }: { product: ProductKey; active?: boolean; hovered?: boolean; size?: number }) {
  const ink = active ? color.indigo : color.black;
  const word = { fontFamily: FONT.medium, fontSize: size, lineHeight: size * 1.25, color: ink, letterSpacing: -0.2 } as const;
  return (
    <View accessible accessibilityLabel={`Hayve ${WORD[product]}`} style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }}>
      <Text style={{ fontFamily: FONT.extrabold, fontSize: size, lineHeight: size * 1.25, color: ink, letterSpacing: -0.4 }}>Hayve</Text>
      <SecondWord product={product} hovered={!!hovered} ink={ink} textStyle={word} size={size} />
    </View>
  );
}

function useHover(hovered: boolean) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: hovered ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [hovered, reduce, v]);
  return v;
}

function SecondWord({ product, hovered, ink, textStyle, size }: { product: ProductKey; hovered: boolean; ink: string; textStyle: object; size: number }) {
  const h = useHover(hovered);
  const reduce = useReducedMotion();
  const swing = useRef(new Animated.Value(0)).current;

  // Shop: the price tag swings a little when hovered.
  useEffect(() => {
    if (product !== 'shop' || reduce || !hovered) return;
    Animated.sequence([
      Animated.timing(swing, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(swing, { toValue: -0.6, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(swing, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [hovered, product, reduce, swing]);

  switch (product) {
    case 'shop':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text style={textStyle}>Shop</Text>
          <Animated.View style={{ marginLeft: 1, marginTop: size * 0.62, transformOrigin: 'top center', transform: [{ rotate: swing.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) }] }}>
            <Svg width={size * 0.5} height={size * 0.75} viewBox="0 0 10 15">
              <Line x1={5} y1={0} x2={5} y2={4} stroke={ink} strokeWidth={1} />
              <Path d="M2 4 h6 l1 2 v7 a1 1 0 0 1 -1 1 h-6 a1 1 0 0 1 -1 -1 v-7 z" fill="none" stroke={ink} strokeWidth={1.1} />
              <Circle cx={5} cy={6.6} r={0.9} fill={ink} />
            </Svg>
          </Animated.View>
        </View>
      );
    case 'pay': {
      const flip = h.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={textStyle}>P</Text>
          <Animated.View style={{ width: size * 0.82, height: size * 0.82, borderRadius: size, borderWidth: 1.2, borderColor: ink, alignItems: 'center', justifyContent: 'center', marginHorizontal: 1, transform: [{ perspective: 300 }, { rotateY: flip }] }}>
            <Text style={[textStyle, { fontSize: size * 0.68, lineHeight: size * 0.8, marginTop: -size * 0.04 }]}>a</Text>
          </Animated.View>
          <Text style={textStyle}>y</Text>
        </View>
      );
    }
    case 'ride':
      return (
        <View style={{ alignItems: 'center' }}>
          <View style={{ borderWidth: 1.2, borderColor: ink, borderTopLeftRadius: size * 0.45, borderTopRightRadius: size * 0.45, borderBottomWidth: 0, paddingHorizontal: size * 0.32, paddingTop: 1 }}>
            <Text style={[textStyle, { fontSize: size * 0.88, lineHeight: size * 1.05 }]}>Ride</Text>
          </View>
          <Svg width={size * 2.5} height={size * 0.22} viewBox="0 0 25 2.2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Rect key={i} x={i * 2.1} y={i % 2 ? 1.1 : 0} width={1.05} height={1.1} fill={ink} />
            ))}
            <Rect x={0} y={0} width={25} height={2.2} fill="none" stroke={ink} strokeWidth={0.3} />
          </Svg>
        </View>
      );
    case 'bites':
      return (
        <View>
          <Text style={textStyle}>Bites</Text>
          {/* the bite: a scalloped notch out of the "s" */}
          <View style={{ position: 'absolute', right: -size * 0.12, top: size * 0.14 }}>
            <Svg width={size * 0.42} height={size * 0.42} viewBox="0 0 10 10">
              <Circle cx={6} cy={4} r={3.2} fill={color.white} />
              <Circle cx={3.6} cy={6.6} r={2.2} fill={color.white} />
              <Path d="M2.6 2.2 a3.2 3.2 0 0 1 6.6 1.6" stroke={ink} strokeWidth={0.8} fill="none" />
            </Svg>
          </View>
        </View>
      );
    case 'drive': {
      const roll = h.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.25] });
      return (
        <View style={{ alignItems: 'flex-start' }}>
          <Animated.View style={{ transform: [{ translateX: roll }] }}>
            <Text style={textStyle}>Drive</Text>
            <Svg width={size * 2.6} height={size * 0.42} viewBox="0 0 26 4.2" style={{ marginTop: -size * 0.12 }}>
              <Path d="M1 1.4 h24" stroke={ink} strokeWidth={0.9} strokeLinecap="round" />
              <Circle cx={6} cy={2.7} r={1.3} fill={color.white} stroke={ink} strokeWidth={0.9} />
              <Circle cx={20} cy={2.7} r={1.3} fill={color.white} stroke={ink} strokeWidth={0.9} />
            </Svg>
          </Animated.View>
          <View style={{ width: size * 3.1, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: color.grey500, marginTop: 1 }} />
        </View>
      );
    }
    case 'stay': {
      const lift = h.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.1] });
      return (
        <View style={{ alignItems: 'center' }}>
          <Animated.View style={{ transform: [{ translateY: lift }], marginBottom: -size * 0.12 }}>
            <Svg width={size * 2.4} height={size * 0.4} viewBox="0 0 24 4">
              <Path d="M1 3.6 L12 0.6 L23 3.6" stroke={ink} strokeWidth={1} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          </Animated.View>
          <Text style={textStyle}>Stay</Text>
        </View>
      );
    }
  }
}
