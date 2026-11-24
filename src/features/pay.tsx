import { Icon } from '../design/icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { wallet, type PublicUser } from '../backend/api';
import type { TxView } from '../backend/ledger';
import { Avatar, color, type IconName, Input, radius, T, tap } from '../design';
import { ago, money, currencySymbol } from '../lib/format';
import { StatusPill } from './common';
import { useLive } from '../lib/hooks';

const TX_ICON: Record<string, IconName> = {
  deposit: 'add-circle',
  withdrawal: 'arrow-up-circle',
  p2p: 'swap-horizontal',
  purchase: 'bag-handle',
  sale: 'pricetag',
  gift_purchase: 'gift',
  food_order: 'fast-food',
  ride: 'taxi-outline',
  rental: 'car-outline',
  request_payment: 'link-outline',
  stay: 'bed',
  delivery: 'cube',
  earning: 'trending-up',
  refund: 'return-down-back',
  merchant_payment: 'storefront',
  fee: 'receipt',
  wave_back: 'wave',
};

export function TxRow({ t, first }: { t: TxView; first?: boolean }) {
  const failed = t.status === 'failed';
  return (
    <Pressable onPress={() => router.push(`/pay/tx/${t.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderTopColor: color.line, backgroundColor: pressed ? color.surfaceSunken : 'transparent' })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={TX_ICON[t.type] ?? 'ellipse'} size={18} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="headline" numberOfLines={1}>
          {t.type === 'wave_back' ? 'Wave Back' : t.counterparty}
        </T>
        <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
          {t.note ? `${t.note} · ` : ''}
          {ago(t.createdAt)}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <T variant="headline" color={failed ? color.textTertiary : t.direction === 'in' ? color.indigo : color.text} style={failed || t.status === 'refunded' ? { textDecorationLine: 'line-through' } : undefined}>
          {t.direction === 'in' ? '+' : '−'}
          {money(t.amountCents)}
        </T>
        {t.status !== 'completed' && <StatusPill status={t.status} />}
      </View>
    </Pressable>
  );
}



/** Pick a Hayve user to pay or request from. */
export function PersonPicker({ selected, onSelect }: { selected: PublicUser | null; onSelect: (u: PublicUser | null) => void }) {
  const [q, setQ] = useState('');
  const results = useLive(() => (q.trim() ? wallet.searchPeople(q) : wallet.recentContacts()), [q]).data ?? [];
  if (selected) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.black }}>
        <Avatar uri={selected.avatar} name={selected.displayName} size={44} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{selected.displayName}</T>
          <T variant="footnote" color={color.textSecondary}>
            @{selected.username}
          </T>
        </View>
        <Pressable onPress={() => onSelect(null)} hitSlop={8}>
          <T variant="subhead" color={color.black} weight="700">
            Change
          </T>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <Input icon="search" placeholder="Name or @username" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      <T variant="overline" color={color.textTertiary}>
        {q ? 'Results' : 'Recent'}
      </T>
      {results.length === 0 && (
        <T variant="footnote" color={color.textSecondary}>
          No people found. Private profiles can be found by their exact username.
        </T>
      )}
      {results.map((u) => (
        <Pressable
          key={u.id}
          onPress={() => {
            tap();
            onSelect(u);
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: pressed ? color.surfaceSunken : 'transparent' })}
        >
          <Avatar uri={u.avatar} name={u.displayName} size={42} />
          <View style={{ flex: 1 }}>
            <T variant="headline">{u.displayName}</T>
            <T variant="footnote" color={color.textSecondary}>
              @{u.username} · {u.city}
            </T>
          </View>
          <Icon name="chevron-forward" size={18} color={color.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

/** Large amount entry. */
export function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 18, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T weight="800" style={{ fontSize: 44, lineHeight: 52, color: value ? color.black : color.grey500 }}>{currencySymbol()}</T>
        <Input
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^\d.,]/g, '').slice(0, 9))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          // Sized to the amount so the currency sign stays next to the number on every screen width.
          containerStyle={{ width: Math.max(130, (value.length || 4) * 29 + 44), flexGrow: 0, flexShrink: 0 }}
          style={{ fontSize: 44, fontFamily: 'PlusJakartaSans_800ExtraBold', textAlign: 'left', minHeight: 64 }}
          accessibilityLabel={`Amount in ${currencySymbol()}`}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {['5', '10', '25', '50'].map((v) => (
          <Pressable key={v} onPress={() => onChange(v)} style={{ paddingHorizontal: 16, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, justifyContent: 'center' }}>
            <T variant="subhead" weight="700">
              {currencySymbol()}{v}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
