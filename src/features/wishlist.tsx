import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { WishlistItemView } from '../backend/api/wishlist';
import { color, Icon, type IconName, Photo, radius, T, tap, useToast } from '../design';
import { money } from '../lib/format';

/**
 * A wishlist item. Visitors get two distinct actions:
 *  - Buy: an ordinary purchase for themselves.
 *  - Gift: an anonymous gift delivered to the wishlist owner.
 */
export function WishlistCard({ item, ownerUsername, ownerView, onRemove, onMove, first, last, token }: { item: WishlistItemView; ownerUsername: string; ownerView?: boolean; onRemove?: () => void; onMove?: (d: -1 | 1) => void; first?: boolean; last?: boolean; token?: string }) {
  const toast = useToast();
  const sold = item.status === 'sold';
  const unavailable = item.status === 'unavailable';
  const reserved = item.status === 'reserved';
  const dim = sold || unavailable;

  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: color.grey200, backgroundColor: color.white }}>
      <Pressable onPress={() => item.product && router.push(`/product/${item.productId}`)} accessibilityRole="link" accessibilityLabel={item.title}>
        <Photo uri={item.image} style={{ width: '100%', aspectRatio: 1, opacity: dim ? 0.5 : 1 }} icon="gift-outline" label={item.title} />
        {(sold || unavailable || reserved) && (
          <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: sold ? color.black : color.white, borderRadius: radius.sm, paddingHorizontal: 10, height: 26, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: sold ? 0 : 1, borderColor: color.grey200 }}>
            {sold && <Icon name="checkmark" size={14} color={color.white} />}
            <T variant="caption" weight="700" color={sold ? color.white : color.black}>
              {sold ? 'Sold' : unavailable ? 'No longer available' : 'Reserved'}
            </T>
          </View>
        )}
      </Pressable>
      <View style={{ padding: 12, gap: 2 }}>
        <T variant="subhead" weight="600" numberOfLines={1} color={dim ? color.grey500 : color.black}>
          {item.title}
        </T>
        <T variant="headline" weight="700" color={dim ? color.grey500 : color.black} style={sold ? { textDecorationLine: 'line-through' } : undefined}>
          {money(item.priceCents)}
        </T>

        {ownerView ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            <SmallBtn icon="chevron-up" label="Move up" disabled={first || !onMove} onPress={() => onMove?.(-1)} />
            <SmallBtn icon="chevron-down" label="Move down" disabled={last || !onMove} onPress={() => onMove?.(1)} />
            <View style={{ flex: 1 }} />
            {!sold && onRemove && <SmallBtn icon="trash-outline" label="Remove" onPress={onRemove} />}
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
              style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: radius.md, backgroundColor: color.indigo, alignItems: 'center', justifyContent: 'center', opacity: item.canBuy ? (pressed ? 0.8 : 1) : 0.35 })}
            >
              <T variant="subhead" weight="700" color={color.white}>
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
                router.push(`/gift/${item.id}?username=${ownerUsername}${token ? `&w=${token}` : ''}`);
              }}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: color.black, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center', opacity: item.canGift ? (pressed ? 0.7 : 1) : 0.35 })}
            >
              <Icon name="gift-outline" size={17} />
              <T variant="subhead" weight="700">
                Gift
              </T>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function SmallBtn({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}
    >
      <Icon name={icon} size={16} />
    </Pressable>
  );
}
