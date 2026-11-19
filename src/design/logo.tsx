import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, FONT } from './tokens';

/** The wave-v: one smooth stroke, like a hand waving hello. */
export const WAVE_PATH = 'M12 18 C 22 42, 33 86, 50 86 C 67 86, 74 28, 94 20';

export function WaveV({ size = 24, stroke = color.indigo, weight = 17 }: { size?: number; stroke?: string; weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden>
      <Path d={WAVE_PATH} stroke={stroke} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * The Hayve wordmark: lowercase "hayve" in a heavy geometric sans with tight
 * spacing; the "v" is the indigo wave, the other letters black (or white).
 */
export function HayveLogo({ height = 28, tone = 'dark' }: { height?: number; tone?: 'dark' | 'light' }) {
  const fs = height;
  const ink = tone === 'dark' ? color.black : color.white;
  const textStyle = { fontFamily: FONT.extrabold, fontSize: fs, lineHeight: fs * 1.12, letterSpacing: -fs * 0.055, color: ink } as const;
  const v = fs * 0.62;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Hayve" style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={textStyle}>hay</Text>
      <View style={{ marginHorizontal: -fs * 0.045, marginBottom: fs * 0.22 }}>
        <WaveV size={v} weight={19} />
      </View>
      <Text style={textStyle}>e</Text>
    </View>
  );
}

/** App icon mark: the wave-v on its own. */
export function HayveMark({ size = 40, background = color.black }: { size?: number; background?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <WaveV size={size * 0.62} weight={16} />
    </View>
  );
}
