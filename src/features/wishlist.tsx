import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { WishlistItemView } from '../backend/api/wishlist';
import { color, Photo, radius, T, tap, useToast } from '../design';
import { money } from '../lib/format';

/**
 * A wishlist item on someone's profile. Two distinct actions:
 *  - Buy: an ordinary purchase for yourself.
 *  - Gift: an anonymous gift delivered to the wishlist owner.
 */
export function WishlistCard({ item, ownerUsername, ownerView, onRemove, onMove, first, last }: { item: WishlistItemView; ownerUsername: string; ownerView?: boolean; onRemove?: () => void; onMove?: (d: -1 | 1) => void; first?: boolean; last?: boolean }) {
  const toast = useToast();
  const sold = item.status === 'sold';
  const unavailable = item.status === 'unavailable';
  const reserved = item.status === 'reserved';
  const dim = sold || unavailable;

  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: color.line }}>
      <Pressable onPress={() => item.product && router.push(`/product/${item.productId}`)} accessibilityLabel={item.title}>
        <Photo uri={item.image} style={{ width: '100%', aspectRatio: 1, opacity: dim ? 0.55 : 1 }} icon="gift-outline" label={item.title} />
        {(sold || unavailable || reserved) && (
          <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: sold ? color.ink : color.surface, borderRadius: radius.pill, paddingHorizontal: 12, height: 28, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {sold && <Ionicons name="checkmark-circle" size={15} color={color.lime} />}
            <T variant="subhead" weight="800" color={sold ? '#fff' : color.textSecondary}>
              {sold ? 'Sold' : unavailable ? 'No longer available' : 'Reserved'}
            </T>
          </View>
        )}
      </Pressable>
      <View style={{ padding: 12, gap: 2 }}>
        <T variant="subhead" weight="600" numberOfLines={1} color={dim ? color.textTertiary : color.text}>
          {item.title}
        </T>
        <T variant="headline" color={dim ? color.textTertiary : color.text} style={sold ? { textDecorationLine: 'line-through' } : undefined}>
          {money(item.priceCents)}
        </T>

        {ownerView ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <SmallBtn icon="chevron-up" label="Move up" disabled={first} onPress={() => onMove?.(-1)} />
            <SmallBtn icon="chevron-down" label="Move down" disabled={last} onPress={() => onMove?.(1)} />
            <View style={{ flex: 1 }} />
            {!sold && <SmallBtn icon="trash-outline" label="Remove" danger onPress={onRemove} />}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Buy ${item.title} for yourself`}
              disabled={!item.canBuy}
              onPress={() => {
                tap();
                router.push(`/checkout/${item.productId}`);
              }}
              style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: pressed ? color.primaryPressed : color.primary, alignItems: 'center', justifyContent: 'center', opacity: item.canBuy ? 1 : 0.35 })}
            >
              <T variant="subhead" weight="800" color="#fff">
                Buy
              </T>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.canGift ? `Gift ${item.title} anonymously` : `Gift unavailable: ${item.giftBlockedReason}`}
              onPress={() => {
                tap();
                if (!item.canGift) {
                  toast(item.giftBlockedReason ?? 'This item cannot be gifted', 'info');
                  return;
                }
                router.push(`/gift/${item.id}?username=${ownerUsername}`);
              }}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: pressed ? color.limePressed : color.lime, alignItems: 'center', justifyContent: 'center', opacity: item.canGift ? 1 : 0.35 })}
            >
              <Ionicons name="gift" size={17} color={color.ink} />
              <T variant="subhead" weight="800">
                Gift
              </T>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function SmallBtn({ icon, label, onPress, disabled, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: danger ? color.dangerSoft : color.surfaceSunken, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}
    >
      <Ionicons name={icon} size={17} color={danger ? color.danger : color.ink} />
    </Pressable>
  );
}
