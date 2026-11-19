import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { forwardRef, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { alpha, color, type IconName, radius, shadow, space, type, type TypeVariant } from '../tokens';

/* ------------------------------------------------------------------ Text -- */

export interface TProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  center?: boolean;
  weight?: TextStyle['fontWeight'];
}

export function T({ variant = 'body', color: c = color.text, center, weight, style, ...rest }: TProps) {
  return <Text {...rest} style={[type[variant] as TextStyle, { color: c }, center && { textAlign: 'center' }, weight ? { fontWeight: weight } : null, style]} />;
}

/* ---------------------------------------------------------------- haptics -- */

export function tap(kind: 'light' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
}

/* ---------------------------------------------------------------- Button -- */

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark' | 'glass';

const BUTTON: Record<ButtonVariant, { bg: string; fg: string; border?: string; pressed: string }> = {
  primary: { bg: color.primary, fg: '#fff', pressed: color.primaryPressed },
  accent: { bg: color.lime, fg: color.ink, pressed: color.limePressed },
  dark: { bg: color.ink, fg: '#fff', pressed: color.inkSoft },
  secondary: { bg: color.primarySoft, fg: color.primary, pressed: color.primaryTint },
  outline: { bg: color.surface, fg: color.ink, border: color.lineStrong, pressed: color.surfaceSunken },
  ghost: { bg: 'transparent', fg: color.primary, pressed: color.primarySoft },
  danger: { bg: color.dangerSoft, fg: color.danger, pressed: '#F9D5DA' },
  glass: { bg: 'rgba(255,255,255,0.12)', fg: '#fff', pressed: 'rgba(255,255,255,0.2)' },
};

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', size = 'md', icon, iconRight, loading, full, disabled, style, onPress, ...rest }: ButtonProps) {
  const v = BUTTON[variant];
  const h = size === 'lg' ? 54 : size === 'md' ? 46 : 36;
  const fs = size === 'sm' ? 14 : 16;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: radius.pill,
          backgroundColor: pressed ? v.pressed : v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : 1,
          alignSelf: full ? 'stretch' : 'auto',
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={fs + 3} color={v.fg} />}
          <Text style={{ color: v.fg, fontSize: fs, fontWeight: '700', letterSpacing: -0.1 }} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={fs + 2} color={v.fg} />}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 40,
  tone = 'surface',
  badge,
  label,
  style,
  iconColor,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  tone?: 'surface' | 'soft' | 'dark' | 'clear' | 'lime' | 'glass';
  badge?: number | boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
  iconColor?: string;
}) {
  const bg = { surface: color.surface, soft: color.primarySoft, dark: color.ink, clear: 'transparent', lime: color.lime, glass: 'rgba(255,255,255,0.92)' }[tone];
  const fg = iconColor ?? (tone === 'dark' ? '#fff' : tone === 'soft' ? color.primary : color.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress?.();
      }}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
          borderWidth: tone === 'surface' ? StyleSheet.hairlineWidth : 0,
          borderColor: color.line,
        },
        tone === 'glass' && shadow.card,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={fg} />
      {!!badge && (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: color.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: bg === 'transparent' ? color.bg : bg }}>
          {typeof badge === 'number' && <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>}
        </View>
      )}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Input -- */

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ label, hint, error, icon, right, containerStyle, style, multiline, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label && <T variant="subhead" color={color.textSecondary}>{label}</T>}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: color.surface,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? color.danger : focused ? color.primary : color.line,
          paddingHorizontal: 14,
          minHeight: multiline ? 104 : 50,
          gap: 10,
        }}
      >
        {icon && <Ionicons name={icon} size={19} color={focused ? color.primary : color.textTertiary} style={multiline ? { marginTop: 14 } : undefined} />}
        <TextInput
          ref={ref}
          placeholderTextColor={color.textTertiary}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            { flex: 1, fontSize: 16, color: color.text, paddingVertical: multiline ? 13 : 0, minHeight: multiline ? 100 : 48, textAlignVertical: multiline ? 'top' : 'center' },
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
            style,
          ]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <T variant="footnote" color={color.danger}>
          {error}
        </T>
      ) : hint ? (
        <T variant="footnote" color={color.textTertiary}>
          {hint}
        </T>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------ Chip/Badge -- */

export function Chip({ label, selected, onPress, icon, style, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; count?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 38,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: selected ? color.ink : color.surface,
          borderWidth: 1,
          borderColor: selected ? color.ink : color.line,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={16} color={selected ? color.lime : color.ink} />}
      <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? '#fff' : color.ink }}>{label}</Text>
      {count != null && count > 0 && (
        <View style={{ backgroundColor: selected ? color.lime : color.primarySoft, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: selected ? color.ink : color.primary }}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

type BadgeTone = 'neutral' | 'primary' | 'lime' | 'success' | 'warning' | 'danger' | 'dark';
const BADGE: Record<BadgeTone, [string, string]> = {
  neutral: [color.surfaceSunken, color.textSecondary],
  primary: [color.primarySoft, color.primary],
  lime: [color.lime, color.limeInk],
  success: [color.successSoft, color.success],
  warning: [color.warningSoft, color.warning],
  danger: [color.dangerSoft, color.danger],
  dark: [color.ink, '#fff'],
};

export function Badge({ label, tone = 'neutral', icon, style }: { label: string; tone?: BadgeTone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const [bg, fg] = BADGE[tone];
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, height: 24 }, style]}>
      {icon && <Ionicons name={icon} size={12} color={fg} />}
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Marks money movement and services that are simulated in this build. */
export function SimBadge({ style, label = 'Simulated' }: { style?: StyleProp<ViewStyle>; label?: string }) {
  return <Badge label={label} tone="warning" icon="flask-outline" style={style} />;
}

/* ------------------------------------------------------------------ Card -- */

export function Card({ children, style, onPress, padded = true, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; tone?: 'surface' | 'dark' | 'soft' | 'lime' }) {
  const bg = { surface: color.surface, dark: color.ink, soft: color.primarySoft, lime: color.lime }[tone];
  const base: StyleProp<ViewStyle> = [
    { backgroundColor: bg, borderRadius: radius.lg, padding: padded ? space.lg : 0, overflow: 'hidden', borderWidth: tone === 'surface' ? StyleSheet.hairlineWidth : 0, borderColor: color.line },
    tone === 'surface' && shadow.card,
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] }]}>
      {children}
    </Pressable>
  );
}

export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: inset }, style]} />;
}

/* ---------------------------------------------------------- Photo/Avatar -- */

export function Photo({ uri, style, icon = 'image-outline', label, contentFit = 'cover', rounded, plain }: { uri?: string; style?: StyleProp<ViewStyle>; icon?: IconName; label?: string; contentFit?: 'cover' | 'contain'; rounded?: number; plain?: boolean }) {
  const [failed, setFailed] = useState(false);
  const r = rounded != null ? { borderRadius: rounded, overflow: 'hidden' as const } : null;
  if ((!uri || failed) && plain) return <View style={[{ backgroundColor: color.ink }, r, style]} />;
  if (!uri || failed) {
    return (
      <View style={[{ backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' }, r, style]}>
        <View style={{ position: 'absolute', width: '140%', height: '60%', top: '-20%', left: '-20%', backgroundColor: alpha(color.primary, 0.06), transform: [{ rotate: '-12deg' }] }} />
        <Ionicons name={icon} size={28} color={alpha(color.primary, 0.55)} />
        {label ? (
          <Text style={{ color: alpha(color.primary, 0.7), fontSize: 12, fontWeight: '700', paddingHorizontal: 8, textAlign: 'center' }} numberOfLines={2}>
            {label}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[{ backgroundColor: color.surfaceSunken, overflow: 'hidden' }, r, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={180} onError={() => setFailed(true)} cachePolicy="memory-disk" />
    </View>
  );
}

export function Avatar({ uri, name, size = 40, ring }: { uri?: string; name?: string; size?: number; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: color.lime }}>
      {uri && !failed ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" onError={() => setFailed(true)} cachePolicy="memory-disk" />
      ) : (
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- Rating -- */

export function Rating({ value, count, size = 13, light }: { value: number; count?: number; size?: number; light?: boolean }) {
  if (!value) return <T variant="footnote" color={light ? color.textOnDarkSecondary : color.textTertiary}>New</T>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name="star" size={size} color={light ? color.lime : color.ink} />
      <Text style={{ fontSize: size, fontWeight: '700', color: light ? '#fff' : color.ink }}>{value.toFixed(value >= 4.95 ? 2 : 1)}</Text>
      {count != null && <Text style={{ fontSize: size, color: light ? color.textOnDarkSecondary : color.textTertiary }}>({count})</Text>}
    </View>
  );
}

export function Stars({ value, onChange, size = 30 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} accessibilityLabel={`${i} stars`} hitSlop={4}>
          <Ionicons name={i <= value ? 'star' : 'star-outline'} size={size} color={i <= value ? color.primary : color.lineStrong} />
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------- ServiceIcon -- */

export function ServiceTile({ icon, accent, size = 52, active }: { icon: IconName; accent: string; size?: number; active?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: active ? color.ink : alpha(accent, 0.1), alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.46} color={active ? color.lime : accent} />
    </View>
  );
}
