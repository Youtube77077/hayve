import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Children, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, type IconName, layout, radius, space } from '../tokens';
import { Divider, IconButton, T, tap } from './primitives';

/* ---------------------------------------------------------- responsive -- */

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= layout.wide;
  const isDesktop = width >= layout.desktop;
  const contentWidth = Math.min(width - (isWide ? layout.sidebar : 0), layout.maxContent);
  const gutter = isWide ? space.xxl : space.lg;
  const columns = (min: number) => Math.max(2, Math.floor((contentWidth - gutter * 2 + 12) / (min + 12)));
  return { width, height, isWide, isDesktop, contentWidth, gutter, columns, isPhone: !isWide };
}

/* ---------------------------------------------------------------- Screen -- */

export interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Fixed content shown above the scroll area (e.g. a header). */
  header?: ReactNode;
  /** Fixed content pinned to the bottom (e.g. a checkout bar). */
  footer?: ReactNode;
  bg?: string;
  maxWidth?: number;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
  keyboard?: boolean;
}

export function Screen({ children, scroll = true, padded = true, header, footer, bg = color.bg, maxWidth = layout.maxContent, onRefresh, edges = ['top'], keyboard, contentContainerStyle, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { gutter, isWide } = useLayout();
  const inner: StyleProp<ViewStyle> = [{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: padded ? gutter : 0 }];
  const bottomPad = (footer ? 16 : isWide ? 40 : 110) + (edges.includes('bottom') ? insets.bottom : 0);

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ paddingBottom: bottomPad }, contentContainerStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={color.primary} /> : undefined}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      <View style={inner}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, inner]}>{children}</View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: edges.includes('top') ? insets.top : 0 }}>
      {header}
      {body}
      {footer && (
        <View style={{ backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line, paddingBottom: Math.max(insets.bottom, 12), paddingTop: 12 }}>
          <View style={[inner]}>{footer}</View>
        </View>
      )}
    </View>
  );
  if (keyboard && Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }
  return content;
}

/* ---------------------------------------------------------------- Header -- */

export function goBack(fallback = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

export function Header({
  title,
  subtitle,
  back,
  right,
  large,
  fallback,
  transparent,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  large?: boolean;
  fallback?: string;
  transparent?: boolean;
}) {
  const { gutter } = useLayout();
  return (
    <View style={{ backgroundColor: transparent ? 'transparent' : color.bg }}>
      <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: 6, paddingBottom: large ? 4 : 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 }}>
          {back && <IconButton icon="chevron-back" label="Back" onPress={() => goBack(fallback)} />}
          {!large && title ? (
            <View style={{ flex: 1 }}>
              <T variant="title3" numberOfLines={1}>
                {title}
              </T>
              {subtitle ? (
                <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
                  {subtitle}
                </T>
              ) : null}
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{right}</View>}
        </View>
        {large && title ? (
          <View style={{ marginTop: back ? 8 : 0 }}>
            <T variant="title1">{title}</T>
            {subtitle ? (
              <T variant="callout" color={color.textSecondary} style={{ marginTop: 2 }}>
                {subtitle}
              </T>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- Section -- */

export function Section({ title, action, onAction, children, style, subtitle }: { title?: string; subtitle?: string; action?: string; onAction?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.xxl }, style]}>
      {(title || action) && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.md, gap: 12 }}>
          <View style={{ flex: 1 }}>
            {title && <T variant="title3">{title}</T>}
            {subtitle && (
              <T variant="footnote" color={color.textSecondary} style={{ marginTop: 2 }}>
                {subtitle}
              </T>
            )}
          </View>
          {action && (
            <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
              <T variant="subhead" color={color.primary} weight="700">
                {action}
              </T>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

/* -------------------------------------------------------------- ListRow -- */

export function ListRow({
  icon,
  iconTint = color.primary,
  title,
  subtitle,
  value,
  onPress,
  left,
  right,
  danger,
  chevron = true,
}: {
  icon?: IconName;
  iconTint?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingVertical: 13, paddingHorizontal: space.lg };
  const content = (
    <>
      {left}
      {icon && !left && (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: danger ? color.dangerSoft : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={danger ? color.danger : iconTint} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="headline" color={danger ? color.danger : color.text} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T variant="footnote" color={color.textSecondary} numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="subhead" color={color.textSecondary}>
          {value}
        </T>
      ) : null}
      {right}
      {onPress && chevron && !right && <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />}
    </>
  );
  // Rows without their own action render as a plain View so that buttons inside them stay interactive.
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => ({ ...rowStyle, backgroundColor: pressed ? color.surfaceSunken : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

/** A white rounded group of rows separated by hairlines (iOS grouped list). */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: color.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: color.line }, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={space.lg} />}
          {child}
        </View>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------- Grid -- */

export function Grid({ children, min = 160, gap = 12, style }: { children: ReactNode; min?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  const { columns } = useLayout();
  const cols = columns(min);
  const items = Children.toArray(children).filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={[{ gap }, style]}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((child, c) => (
            <View key={c} style={{ flex: 1, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {Array.from({ length: cols - row.length }).map((_, k) => (
            <View key={`f${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function HScroll({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const { gutter } = useLayout();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -gutter }, style]} contentContainerStyle={{ paddingHorizontal: gutter, gap }}>
      {children}
    </ScrollView>
  );
}

export function KeyValue({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 }}>
      <T variant={strong ? 'headline' : 'callout'} color={strong ? color.text : color.textSecondary} style={{ flexShrink: 1 }}>
        {label}
      </T>
      <T variant={strong ? 'headline' : 'callout'} color={tone ?? color.text} weight={strong ? '800' : '500'}>
        {value}
      </T>
    </View>
  );
}

export function Row({ children, gap = 8, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Split({ left, right, ratio = 1.15, gap = 24 }: { left: ReactNode; right: ReactNode; ratio?: number; gap?: number }) {
  const { isWide } = useLayout();
  if (!isWide) {
    return (
      <View style={{ gap: 0 }}>
        {left}
        {right}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      <View style={{ flex: ratio, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
    </View>
  );
}
