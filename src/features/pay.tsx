import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { wallet, type PublicUser } from '../backend/api';
import { Avatar, color, Input, radius, T, tap } from '../design';
import { useLive } from '../lib/hooks';

/** Pick a Hayve user to pay or request from. */
export function PersonPicker({ selected, onSelect }: { selected: PublicUser | null; onSelect: (u: PublicUser | null) => void }) {
  const [q, setQ] = useState('');
  const results = useLive(() => (q.trim() ? wallet.searchPeople(q) : wallet.recentContacts()), [q]).data ?? [];
  if (selected) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 2, borderColor: color.primary }}>
        <Avatar uri={selected.avatar} name={selected.displayName} size={44} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{selected.displayName}</T>
          <T variant="footnote" color={color.textSecondary}>
            @{selected.username}
          </T>
        </View>
        <Pressable onPress={() => onSelect(null)} hitSlop={8}>
          <T variant="subhead" color={color.primary} weight="700">
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
          <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
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
        <T style={{ fontSize: 44, fontWeight: '800', color: value ? color.ink : color.lineStrong }}>€</T>
        <Input
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^\d.,]/g, '').slice(0, 9))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          containerStyle={{ minWidth: 140 }}
          style={{ fontSize: 44, fontWeight: '800', textAlign: 'center', minHeight: 64 }}
          accessibilityLabel="Amount in euros"
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {['5', '10', '25', '50'].map((v) => (
          <Pressable key={v} onPress={() => onChange(v)} style={{ paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: color.primarySoft, justifyContent: 'center' }}>
            <T variant="subhead" weight="700" color={color.primary}>
              €{v}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
