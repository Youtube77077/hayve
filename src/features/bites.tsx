import { Icon } from '../design/icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bites } from '../backend/api';
import type { MenuItem } from '../backend/types';
import { Button, color, Photo, radius, shadow, Sheet, Stepper, T, tap, useLayout, useToast } from '../design';
import { cart, useCart } from '../lib/cart';
import { money } from '../lib/format';
import { useLive } from '../lib/hooks';

/** Floating basket summary shown on Bites screens. */
export function BasketBar() {
  const c = useCart();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const priced = useLive(() => (c.restaurantId && c.lines.length ? bites.priceCart(c.restaurantId, c.lines) : null), [c]).data;
  const name = useLive(() => (c.restaurantId ? bites.getRestaurant(c.restaurantId).restaurant.name : ''), [c.restaurantId]).data;
  if (!priced) return null;
  const count = c.lines.reduce((s, l) => s + l.qty, 0);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: isWide ? 24 : insets.bottom + 84, alignItems: 'center', paddingHorizontal: 16 }}>
      <Pressable
        onPress={() => router.push('/bites/cart')}
        style={[{ width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.ink, borderRadius: radius.pill, height: 58, paddingHorizontal: 8 }, shadow.float]}
        accessibilityRole="button"
        accessibilityLabel={`View basket, ${count} items`}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: color.lime, alignItems: 'center', justifyContent: 'center' }}>
          <T variant="headline">{count}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T variant="headline" color="#fff">
            View basket
          </T>
          <T variant="caption" color={color.textOnDarkSecondary} numberOfLines={1}>
            {name}
          </T>
        </View>
        <T variant="headline" color="#fff" style={{ marginRight: 12 }}>
          {money(priced.subtotalCents)}
        </T>
      </Pressable>
    </View>
  );
}

/** Item customisation sheet (sizes, extras, quantity). */
export function MenuItemSheet({ item, restaurantId, open, onClose, isOpen }: { item: MenuItem | null; restaurantId: string; open: boolean; onClose: () => void; isOpen: boolean }) {
  const toast = useToast();
  const c = useCart();
  const [qty, setQty] = useState(1);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setQty(1);
    const init: Record<string, string[]> = {};
    item?.options.forEach((g) => (init[g.name] = g.required ? [g.choices[0].label] : []));
    setChoices(init);
  }, [item]);
  if (!item) return null;
  const extra = item.options.reduce((s, g) => s + g.choices.filter((ch) => choices[g.name]?.includes(ch.label)).reduce((a, ch) => a + ch.priceCents, 0), 0);
  const unit = item.priceCents + extra;
  const add = () => {
    if (c.restaurantId && c.restaurantId !== restaurantId && c.lines.length) {
      cart.clear();
      toast('Started a new basket for this restaurant', 'info');
    }
    cart.add(restaurantId, item.id, Object.values(choices).flat(), qty);
    tap('success');
    toast(`${qty} × ${item.name} added`);
    onClose();
  };
  return (
    <Sheet visible={open} onClose={onClose} footer={<Button title={!isOpen ? 'Restaurant closed' : !item.available ? 'Sold out' : `Add ${qty} · ${money(unit * qty)}`} size="lg" full disabled={!isOpen || !item.available} onPress={add} />}>
      {item.image && <Photo uri={item.image} style={{ width: '100%', height: 200, marginTop: 8 }} rounded={radius.lg} icon="fast-food-outline" />}
      <T variant="title2" style={{ marginTop: 14 }}>
        {item.name}
      </T>
      <T color={color.textSecondary} style={{ marginTop: 4 }}>
        {item.description}
      </T>
      <T variant="headline" style={{ marginTop: 8 }}>
        {money(item.priceCents)}
      </T>
      {item.options.map((g) => (
        <View key={g.name} style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <T variant="headline" style={{ flex: 1 }}>
              {g.name}
            </T>
            <T variant="caption" color={g.required ? color.primary : color.textTertiary}>
              {g.required ? 'Required · choose 1' : 'Optional'}
            </T>
          </View>
          {g.choices.map((ch) => {
            const on = choices[g.name]?.includes(ch.label);
            return (
              <Pressable
                key={ch.label}
                onPress={() => {
                  tap();
                  setChoices((cur) => ({ ...cur, [g.name]: g.required ? [ch.label] : on ? cur[g.name].filter((x) => x !== ch.label) : [...(cur[g.name] ?? []), ch.label] }));
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.line }}
              >
                <Icon name={g.required ? (on ? 'radio-button-on' : 'radio-button-off') : on ? 'checkbox' : 'square-outline'} size={22} color={on ? color.primary : color.lineStrong} />
                <T style={{ flex: 1 }}>{ch.label}</T>
                {ch.priceCents > 0 && (
                  <T variant="subhead" color={color.textSecondary}>
                    +{money(ch.priceCents)}
                  </T>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ marginTop: 20 }}>
        <Stepper label="Quantity" value={qty} min={1} max={20} onChange={setQty} />
      </View>
    </Sheet>
  );
}
