import { Platform, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { FLUENT_EMOJI } from './fluent';

/**
 * Emoji policy:
 *  - Apple devices (iPhone, iPad, Mac): native Apple emoji.
 *  - Everything else: Microsoft Fluent Emoji (MIT), bundled as SVG, so emoji
 *    never appear as a mix of system styles.
 */
function isApple() {
  if (Platform.OS === 'ios' || Platform.OS === 'macos') return true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    return /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(ua);
  }
  return false;
}

const APPLE = isApple();

export function Emoji({ char, size = 18 }: { char: string; size?: number }) {
  const svg = FLUENT_EMOJI[char];
  if (APPLE || !svg) {
    return (
      <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: size * 0.95, lineHeight: size * 1.15 }}>
        {char}
      </Text>
    );
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, marginBottom: -size * 0.12 }}>
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  );
}

/** Splits a trailing emoji from a message, e.g. "Order placed 🎉" → ["Order placed", "🎉"]. */
export function splitEmoji(text: string): [string, string | null] {
  const m = text.match(/^(.*?)\s*(\p{Extended_Pictographic}(?:️)?)\s*$/u);
  if (!m) return [text, null];
  return [m[1], m[2]];
}
