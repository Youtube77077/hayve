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
import { Icon } from '../icons';
import { color, font, radius, space, type, type TypeVariant } from '../tokens';
import type { IconName } from '../icons';

/** Visible keyboard focus ring for web (react-native-web). */
export const focusRing = (focused: boolean): ViewStyle =>
  focused && Platform.OS === 'web' ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: color.indigo, outlineOffset: 2 } as ViewStyle) : {};

/* ------------------------------------------------------------------ Text -- */

export interface TProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  center?: boolean;
  weight?: TextStyle['fontWeight'];
}

export function T({ variant = 'body', color: c = color.text, center, weight, style, ...rest }: TProps) {
  return <Text {...rest} style={[type[variant] as TextStyle, { color: c }, center && { textAlign: 'center' }, weight ? font(weight) : null, style]} />;
}

/* ---------------------------------------------------------------- haptics -- */

export function tap(kind: 'light' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
}

/* ---------------------------------------------------------------- Button -- */

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark' | 'glass';

const BUTTON: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.indigo, fg: color.white },
  accent: { bg: color.indigo, fg: color.white },
  dark: { bg: color.black, fg: color.white },
  secondary: { bg: color.grey100, fg: color.black },
  outline: { bg: color.white, fg: color.black, border: color.grey200 },
  ghost: { bg: 'transparent', fg: color.indigo },
  danger: { bg: color.white, fg: color.black, border: color.black },
  glass: { bg: 'rgba(255,255,255,0.14)', fg: color.white },
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
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const h = size === 'lg' ? 52 : size === 'md' ? 44 : 36;
  const fs = size === 'sm' ? 14 : 15;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: radius.md,
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.4 : pressed ? 0.8 : hovered ? 0.9 : 1,
          alignSelf: full ? 'stretch' : 'auto',
        },
        focusRing(focused),
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={fs + 3} color={v.fg} />}
          <Text style={[{ color: v.fg, fontSize: fs, letterSpacing: -0.1 }, font('600')]} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Icon name={iconRight} size={fs + 2} color={v.fg} />}
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
  const [focused, setFocused] = useState(false);
  const bg = { surface: color.white, soft: color.grey100, dark: color.black, clear: 'transparent', lime: color.indigo, glass: color.white }[tone];
  const fg = iconColor ?? (tone === 'dark' || tone === 'lime' ? color.white : color.black);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
          borderWidth: tone === 'surface' ? 1 : 0,
          borderColor: color.grey200,
        },
        tone === 'glass' && {
          shadowColor: color.black,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        focusRing(focused),
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={fg} />
      {!!badge && (
        <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: color.indigo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: color.white }}>
          {typeof badge === 'number' && <Text style={[{ color: color.white, fontSize: 9 }, font('700')]}>{badge > 9 ? '9+' : badge}</Text>}
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
      {label && (
        <T variant="subhead" weight="600">
          {label}
        </T>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: color.white,
          borderRadius: radius.md,
          borderWidth: focused || error ? 1.5 : 1,
          borderColor: error ? color.black : focused ? color.indigo : color.grey200,
          paddingHorizontal: 14,
          minHeight: multiline ? 104 : 48,
          gap: 10,
        }}
      >
        {icon && <Icon name={icon} size={18} color={focused ? color.indigo : color.grey500} style={multiline ? { marginTop: 14 } : undefined} />}
        <TextInput
          ref={ref}
          placeholderTextColor={color.grey500}
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
            { flex: 1, fontSize: 16, color: color.black, paddingVertical: multiline ? 13 : 0, minHeight: multiline ? 100 : 46, textAlignVertical: multiline ? 'top' : 'center' },
            font('400'),
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
            style,
          ]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name="warning-outline" size={14} />
          <T variant="footnote" weight="600">
            {error}
          </T>
        </View>
      ) : hint ? (
        <T variant="footnote" color={color.grey500}>
          {hint}
        </T>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------ Chip/Badge -- */

export function Chip({ label, selected, onPress, icon, style, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; count?: number }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 36,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: selected ? color.black : color.white,
          borderWidth: 1,
          borderColor: selected ? color.black : color.grey200,
          opacity: pressed ? 0.8 : 1,
        },
        focusRing(focused),
        style,
      ]}
    >
      {icon && <Icon name={icon} size={16} color={selected ? color.white : color.black} />}
      <Text style={[{ fontSize: 14, color: selected ? color.white : color.black }, font('600')]}>{label}</Text>
      {count != null && count > 0 && (
        <View style={{ backgroundColor: selected ? color.white : color.grey100, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <Text style={[{ fontSize: 11, color: color.black }, font('700')]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

type BadgeTone = 'neutral' | 'primary' | 'lime' | 'success' | 'warning' | 'danger' | 'dark';
const BADGE: Record<BadgeTone, [string, string]> = {
  neutral: [color.grey100, color.black],
  primary: [color.grey100, color.indigo],
  lime: [color.grey100, color.indigo],
  success: [color.grey100, color.indigo],
  warning: [color.grey100, color.black],
  danger: [color.grey100, color.black],
  dark: [color.black, color.white],
};

export function Badge({ label, tone = 'neutral', icon, style }: { label: string; tone?: BadgeTone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const [bg, fg] = BADGE[tone];
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 8, height: 24 }, style]}>
      {icon && <Icon name={icon} size={13} color={fg} />}
      <Text style={[{ fontSize: 12, color: fg }, font('600')]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Marks money movement and services that are simulated in this preview build. */
export function SimBadge({ style, label = 'Demo' }: { style?: StyleProp<ViewStyle>; label?: string }) {
  return <Badge label={label} tone="neutral" style={style} />;
}

/** Verified Hayve Store business check mark. */
export function VerifiedMark({ size = 16 }: { size?: number }) {
  return <Icon name="verified" size={size} color={color.indigo} />;
}

/* ------------------------------------------------------------------ Card -- */

export function Card({ children, style, onPress, padded = true, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; tone?: 'surface' | 'dark' | 'soft' | 'lime' }) {
  const [focused, setFocused] = useState(false);
  const bg = { surface: color.white, dark: color.black, soft: color.grey100, lime: color.grey100 }[tone];
  const base: StyleProp<ViewStyle> = [
    { backgroundColor: bg, borderRadius: radius.lg, padding: padded ? space.lg : 0, overflow: 'hidden', borderWidth: tone === 'surface' ? 1 : 0, borderColor: color.grey200 },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [base, (pressed || hovered) && tone === 'surface' && { borderColor: color.black }, focusRing(focused)]}>
      {children}
    </Pressable>
  );
}

export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color.grey200, marginLeft: inset }, style]} />;
}

/* ---------------------------------------------------------- Photo/Avatar -- */

export function Photo({ uri, style, icon = 'image-outline', label, contentFit = 'cover', rounded, plain }: { uri?: string; style?: StyleProp<ViewStyle>; icon?: IconName; label?: string; contentFit?: 'cover' | 'contain'; rounded?: number; plain?: boolean }) {
  const [failed, setFailed] = useState(false);
  const r = rounded != null ? { borderRadius: rounded, overflow: 'hidden' as const } : null;
  if ((!uri || failed) && plain) return <View style={[{ backgroundColor: color.grey100 }, r, style]} />;
  if (!uri || failed) {
    return (
      <View style={[{ backgroundColor: color.grey100, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' }, r, style]}>
        <Icon name={icon} size={26} color={color.grey500} />
        {label ? (
          <Text style={[{ color: color.grey500, fontSize: 12, paddingHorizontal: 10, textAlign: 'center' }, font('600')]} numberOfLines={2}>
            {label}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[{ backgroundColor: color.grey100, overflow: 'hidden' }, r, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={180} onError={() => setFailed(true)} cachePolicy="memory-disk" />
    </View>
  );
}

export function Avatar({ uri, name, size = 40, ring }: { uri?: string; name?: string; size?: number; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: color.grey200, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: color.white }}
    >
      {uri && !failed ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" onError={() => setFailed(true)} cachePolicy="memory-disk" />
      ) : (
        <Text style={[{ color: color.black, fontSize: size * 0.36 }, font('700')]}>{initials}</Text>
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- Rating -- */

/** "★ 4.8 (132 reviews)" — the standard Hayve rating display. */
export function Rating({ value, count, size = 13, light, label = 'reviews' }: { value: number; count?: number; size?: number; light?: boolean; label?: string | false }) {
  const fg = light ? color.white : color.black;
  if (!value || count === 0) {
    return (
      <Text style={[{ fontSize: size, color: light ? color.grey200 : color.grey500 }, font('500')]}>No reviews yet</Text>
    );
  }
  return (
    <View accessibilityLabel={`Rated ${value.toFixed(1)} out of 5${count != null ? ` from ${count} reviews` : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name="star" size={size} color={fg} fill={fg} />
      <Text style={[{ fontSize: size, color: fg }, font('700')]}>{value.toFixed(1)}</Text>
      {count != null && (
        <Text style={[{ fontSize: size, color: light ? color.grey200 : color.grey500 }, font('500')]}>
          ({count}
          {label ? ` ${count === 1 ? label.replace(/s$/, '') : label}` : ''})
        </Text>
      )}
    </View>
  );
}

export function Stars({ value, onChange, size = 30 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} accessibilityLabel={`${i} stars`} hitSlop={4}>
          <Icon name="star" size={size} color={i <= value ? color.black : color.grey200} fill={i <= value ? color.black : 'none'} />
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------- ServiceIcon -- */

/** Service shortcut glyph: a black outline icon on plain white. */
export function ServiceTile({ icon, size = 52, active }: { icon: IconName; accent?: string; size?: number; active?: boolean }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.5} color={active ? color.indigo : color.black} />
    </View>
  );
}
