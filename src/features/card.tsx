import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, HayveLogo, T, Tilt } from '../design';

/** Contactless symbol (four arcs). */
export function ContactlessMark({ size = 22, tint = color.white }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {[5, 9, 13, 17].map((x, i) => (
        <Path key={x} d={`M${x} ${6 - i * 0.5} C ${x + 3 + i} 9, ${x + 3 + i} 15, ${x} ${18 + i * 0.5}`} stroke={tint} strokeWidth={1.9} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}

/**
 * The Hayve Card: black, white wordmark with the indigo wave-v, contactless mark, last 4 digits
 * and the cardholder name. It tilts toward the cursor on the web.
 */
export function HayveCardVisual({ last4, holder, frozen, width = 340 }: { last4: string; holder: string; frozen?: boolean; width?: number | '100%' }) {
  return (
    <Tilt max={7} style={{ width, maxWidth: 420 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Hayve Card ending in ${last4}${frozen ? ', frozen' : ''}`}
        style={{ width: '100%', aspectRatio: 1.586, borderRadius: 18, backgroundColor: color.black, padding: 22, justifyContent: 'space-between', overflow: 'hidden', opacity: frozen ? 0.55 : 1 }}
      >
        {/* Subtle wave watermark in the corner, same shape as the logo. */}
        <Svg width={190} height={140} viewBox="0 0 190 140" style={{ position: 'absolute', right: -30, bottom: -38, opacity: 0.12 }}>
          <Path d="M20 20 C 40 80, 60 120, 95 120 C 130 120, 140 50, 170 30" stroke={color.white} strokeWidth={26} strokeLinecap="round" fill="none" />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <HayveLogo height={26} tone="light" />
          <ContactlessMark />
        </View>
        <View>
          <T weight="700" color={color.white} style={{ fontSize: 18, letterSpacing: 2 }}>
            •••• {last4}
          </T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
            <T variant="caption" weight="600" color={color.grey200} numberOfLines={1} style={{ flex: 1, letterSpacing: 1 }}>
              {holder}
            </T>
            <T weight="800" color={color.white} style={{ fontSize: 20, fontStyle: 'italic', letterSpacing: 0.5 }}>
              VISA
            </T>
          </View>
        </View>
        {frozen && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: color.white, borderRadius: 999, paddingHorizontal: 14, height: 32, justifyContent: 'center' }}>
              <T variant="subhead" weight="700">Frozen</T>
            </View>
          </View>
        )}
      </View>
    </Tilt>
  );
}
