import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LOGO_LETTERS, LOGO_VIEWBOX, LOGO_WAVE, MARK_VIEWBOX, MARK_WAVE, WAVE_WEIGHT } from './logoPaths';
import { color } from './tokens';

/**
 * The Hayve wordmark: lowercase "hayve" built from Plus Jakarta Sans ExtraBold outlines
 * (scripts/build-logo.py). The "v" is one indigo wave stroke whose edges sit exactly on the
 * baseline and the x-height, like the other letters. `height` is the cap-to-descender height.
 */
export function HayveLogo({ height = 28, tone = 'dark' }: { height?: number; tone?: 'dark' | 'light' }) {
  const ink = tone === 'dark' ? color.black : color.white;
  const width = (height * LOGO_VIEWBOX.width) / LOGO_VIEWBOX.height;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Hayve">
      <Svg width={width} height={height} viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
        {LOGO_LETTERS.map((d) => (
          <Path key={d.slice(0, 12)} d={d} fill={ink} />
        ))}
        <Path d={LOGO_WAVE} fill="none" stroke={color.indigo} strokeWidth={WAVE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** The wave-v on its own (app icon, favicon, small marks). `size` is the box it is fitted into. */
export function WaveV({ size = 24, stroke = color.indigo }: { size?: number; stroke?: string; weight?: number }) {
  const w = MARK_VIEWBOX.width + WAVE_WEIGHT;
  const h = MARK_VIEWBOX.height + WAVE_WEIGHT;
  return (
    <Svg width={size} height={(size * h) / w} viewBox={`${-WAVE_WEIGHT / 2} ${-WAVE_WEIGHT / 2} ${w} ${h}`} accessibilityElementsHidden>
      <Path d={MARK_WAVE} stroke={stroke} strokeWidth={WAVE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** App icon mark: indigo wave-v on white. */
export function HayveMark({ size = 40, background = color.white, bordered = true }: { size?: number; background?: string; bordered?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: background, alignItems: 'center', justifyContent: 'center', borderWidth: bordered ? 1 : 0, borderColor: color.grey200 }}>
      <WaveV size={size * 0.58} />
    </View>
  );
}
