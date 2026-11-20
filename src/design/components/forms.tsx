import { fromDisplay } from '../../backend/regions';
import { Icon } from '../icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Switch, View } from 'react-native';
import { MOTION, ND, useReducedMotion } from '../motion';
import { color, radius, space } from '../tokens';
import type { IconName } from '../icons';
import { Sheet } from './feedback';
import { T, tap } from './primitives';

/* ------------------------------------------------------------- Segmented -- */

export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string; icon?: IconName }[]; value: K; onChange: (k: K) => void; dark?: boolean }) {
  const [w, setW] = useState(0);
  const reduced = useReducedMotion();
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const seg = w ? (w - 8) / options.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (!seg) return;
    if (!placed.current || reduced) {
      x.setValue(idx * seg);
      placed.current = true;
      return;
    }
    // Squish and stretch: the pill stretches while it travels, then lands softly.
    Animated.parallel([
      Animated.spring(x, { toValue: idx * seg, useNativeDriver: ND, speed: 14, bounciness: 6 }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.12, duration: 110, easing: MOTION.easeOut, useNativeDriver: ND }),
        Animated.spring(stretch, { toValue: 1, useNativeDriver: ND, speed: 12, bounciness: 10 }),
      ]),
    ]).start();
  }, [idx, seg, reduced, x, stretch]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: color.grey100, borderRadius: radius.pill, padding: 4 }}>
      {seg > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            height: 38,
            width: seg,
            borderRadius: radius.pill,
            backgroundColor: color.white,
            shadowColor: color.black,
            shadowOpacity: 0.08,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            transform: [{ translateX: x }, { scaleX: stretch }, { scaleY: stretch.interpolate({ inputRange: [1, 1.12], outputRange: [1, 0.94] }) }],
          }}
        />
      )}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              tap();
              onChange(o.key);
            }}
            style={{ flex: 1, flexDirection: 'row', gap: 6, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: !seg && active ? color.white : 'transparent' }}
          >
            {o.icon && <Icon name={o.icon} size={16} color={active ? color.black : color.grey500} />}
            <T variant="subhead" weight={active ? '700' : '600'} color={active ? color.black : color.grey500} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------- Stepper -- */

export function Stepper({ value, onChange, min = 0, max = 99, label, sub }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string; sub?: string }) {
  const btn = (icon: IconName, delta: number, disabled: boolean) => (
    <Pressable
      accessibilityLabel={delta > 0 ? 'Increase' : 'Decrease'}
      disabled={disabled}
      onPress={() => {
        tap();
        onChange(value + delta);
      }}
      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: disabled ? color.line : color.lineStrong, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Icon name={icon} size={18} color={color.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {label && (
        <View style={{ flex: 1 }}>
          <T variant="headline">{label}</T>
          {sub && (
            <T variant="footnote" color={color.textSecondary}>
              {sub}
            </T>
          )}
        </View>
      )}
      {btn('remove', -1, value <= min)}
      <T variant="headline" style={{ minWidth: 24, textAlign: 'center' }}>
        {value}
      </T>
      {btn('add', 1, value >= max)}
    </View>
  );
}

/* ------------------------------------------------------------ SwitchRow -- */

export function SwitchRow({ title, subtitle, value, onChange, icon }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: space.lg }}>
      {icon && (
        <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={color.black} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T variant="headline">{title}</T>
        {subtitle && (
          <T variant="footnote" color={color.textSecondary}>
            {subtitle}
          </T>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.indigo, false: color.grey200 }} thumbColor="#fff" ios_backgroundColor={color.grey200} accessibilityLabel={title} {...({ activeThumbColor: '#fff', activeTrackColor: color.indigo } as object)} />
    </View>
  );
}

/* ---------------------------------------------------------------- Select -- */

export function Select<K extends string>({ label, value, options, onChange, placeholder = 'Select', icon }: { label?: string; value: K | null; options: { key: K; label: string; sub?: string }[]; onChange: (k: K) => void; placeholder?: string; icon?: IconName }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <T variant="subhead" weight="600">
          {label}
        </T>
      )}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={{ height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: color.grey200, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}
      >
        {icon && <Icon name={icon} size={19} color={color.textTertiary} />}
        <T style={{ flex: 1 }} color={current ? color.text : color.textTertiary} numberOfLines={1}>
          {current?.label ?? placeholder}
        </T>
        <Icon name="chevron-down" size={18} color={color.textTertiary} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        <View style={{ gap: 6 }}>
          {options.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => {
                tap();
                onChange(o.key);
                setOpen(false);
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: pressed ? color.grey100 : color.white, borderWidth: 1, borderColor: o.key === value ? color.black : color.grey200, gap: 10 })}
            >
              <View style={{ flex: 1 }}>
                <T variant="headline">{o.label}</T>
                {o.sub && (
                  <T variant="footnote" color={color.textSecondary}>
                    {o.sub}
                  </T>
                )}
              </View>
              {o.key === value && <Icon name="checkmark" size={20} color={color.indigo} />}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/* ------------------------------------------------------- Date utilities -- */

export const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n));
};
export const todayISO = () => toISO(new Date());
export function prettyDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
}

/* -------------------------------------------------------------- Calendar -- */

/** Range calendar (check-in/out, pickup/return). Disabled dates cannot be selected or spanned. */
export function RangeCalendar({ start, end, onChange, disabled = [], months = 2 }: { start: string | null; end: string | null; onChange: (start: string | null, end: string | null) => void; disabled?: string[]; months?: number }) {
  const [offset, setOffset] = useState(0);
  const today = todayISO();
  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  const monthBlocks = useMemo(() => {
    const now = new Date();
    return Array.from({ length: months }).map((_, i) => {
      const first = new Date(now.getFullYear(), now.getMonth() + offset + i, 1);
      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const lead = (first.getDay() + 6) % 7; // Monday first
      const cells: (string | null)[] = Array.from({ length: lead }, () => null);
      for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(new Date(first.getFullYear(), first.getMonth(), d)));
      return { label: first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), cells };
    });
  }, [offset, months]);

  const pick = (iso: string) => {
    tap();
    if (!start || (start && end) || iso <= start) {
      onChange(iso, null);
      return;
    }
    // Do not allow ranges that cross a booked night.
    let cursor = start;
    while (cursor < iso) {
      if (disabledSet.has(cursor)) {
        onChange(iso, null);
        return;
      }
      cursor = addDays(cursor, 1);
    }
    onChange(start, iso);
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} hitSlop={10} accessibilityLabel="Previous month" style={{ opacity: offset === 0 ? 0.3 : 1 }}>
          <Icon name="chevron-back" size={22} color={color.ink} />
        </Pressable>
        <T variant="footnote" color={color.textSecondary}>
          {start ? `${prettyDate(start)} → ${end ? prettyDate(end) : 'select end date'}` : 'Select a start date'}
        </T>
        <Pressable onPress={() => setOffset(offset + 1)} hitSlop={10} accessibilityLabel="Next month">
          <Icon name="chevron-forward" size={22} color={color.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        {monthBlocks.map((m) => (
          <View key={m.label} style={{ flexGrow: 1, flexBasis: 280, maxWidth: 420 }}>
            <T variant="headline" style={{ marginBottom: 8 }}>
              {m.label}
            </T>
            <View style={{ flexDirection: 'row' }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <T key={i} variant="caption" color={color.textTertiary} center style={{ flex: 1 }}>
                  {d}
                </T>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {m.cells.map((iso, i) => {
                if (!iso) return <View key={i} style={{ width: `${100 / 7}%`, height: 42 }} />;
                const past = iso < today;
                const blocked = disabledSet.has(iso);
                const isStart = iso === start;
                const isEnd = iso === end;
                const inRange = !!start && !!end && iso > start && iso < end;
                const off = past || blocked;
                return (
                  <View key={i} style={{ width: `${100 / 7}%`, height: 42, justifyContent: 'center', backgroundColor: inRange || ((isStart && end) || isEnd ? true : false) ? color.primarySoft : 'transparent', borderTopLeftRadius: isStart ? 21 : 0, borderBottomLeftRadius: isStart ? 21 : 0, borderTopRightRadius: isEnd ? 21 : 0, borderBottomRightRadius: isEnd ? 21 : 0 }}>
                    <Pressable
                      disabled={off}
                      onPress={() => pick(iso)}
                      accessibilityLabel={prettyDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })}
                      style={{ alignSelf: 'center', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: isStart || isEnd ? color.ink : 'transparent' }}
                    >
                      <T variant="subhead" weight={isStart || isEnd ? '800' : '500'} color={isStart || isEnd ? '#fff' : off ? color.lineStrong : color.text} style={blocked && !past ? { textDecorationLine: 'line-through' } : undefined}>
                        {Number(iso.slice(8))}
                      </T>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* --------------------------------------------------------- Money input -- */

/** Parses an amount typed in the person's currency and returns base cents (see regions.ts FX). */
export function parseEuro(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return fromDisplay(Math.round(n * 100));
}

export const parseMoney = parseEuro;
