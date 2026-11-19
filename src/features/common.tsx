import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { type PayMethod, shop, social, wallet, wishlist } from '../backend/api';
import type { ProductCard } from '../backend/api/shop';
import { Avatar, color, Icon, type IconName, layout, Photo, Rating, radius, service, type ServiceKey, T, tap, useLayout, useToast, VerifiedMark } from '../design';
import { money } from '../lib/format';
import { useLive } from '../lib/hooks';
import { type ProductKey, ProductWordmark } from './nav/Wordmarks';

/* ------------------------------------------------------- Page header -- */

const PRODUCT_KEYS: ServiceKey[] = ['shop', 'pay', 'ride', 'bites', 'drive', 'stay'];

/** Header for the primary destinations: the product wordmark plus actions. */
export function TabHeader({ service: key, title, subtitle, right }: { service: ServiceKey; title?: string; subtitle?: string; right?: ReactNode; dark?: boolean }) {
  const { gutter, isWide } = useLayout();
  const me = useLive(() => social.myProfile()).data;
  const isProduct = PRODUCT_KEYS.includes(key) && !title;
  return (
    <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: isWide ? 24 : 8, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          {isProduct ? <ProductWordmark product={key as ProductKey} size={isWide ? 26 : 22} /> : <T variant="title2">{title ?? service(key).name}</T>}
          {subtitle && (
            <T variant="footnote" color={color.grey500} style={{ marginTop: 4 }} numberOfLines={1}>
              {subtitle}
            </T>
          )}
        </View>
        {right}
        {!isWide && key !== 'profile' && (
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="link" accessibilityLabel="Profile">
            <Avatar uri={me?.profile.avatarThumb ?? me?.profile.avatar} name={me?.profile.displayName} size={36} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------- Service shortcuts -- */

/** Black outline icons with labels on plain white (no tiles, no colour). */
export function ServiceShortcuts({ items = PRODUCT_KEYS }: { items?: ServiceKey[] }) {
  const { isWide } = useLayout();
  return (
    <View accessibilityRole="menu" style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 8 }}>
      {items.map((k) => {
        const s = service(k);
        return (
          <Pressable
            key={k}
            accessibilityRole="link"
            accessibilityLabel={s.name}
            onPress={() => {
              tap();
              router.push(s.route as never);
            }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: isWide ? `${100 / items.length}%` : '33.33%', alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.md, backgroundColor: pressed || hovered ? color.grey100 : 'transparent' })}
          >
            <Icon name={s.icon} size={26} />
            <T variant="subhead" weight="600">
              {s.short}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** @deprecated kept for older screens; use ServiceShortcuts. */
export const ServiceRail = () => <ServiceShortcuts />;

/* ----------------------------------------------------- Product tile -- */

export function SellerLine({ p }: { p: Pick<ProductCard, 'fromVerifiedBusiness' | 'sellerRating' | 'seller'> }) {
  return (
    <View style={{ gap: 2 }}>
      {p.fromVerifiedBusiness && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <VerifiedMark size={13} />
          <T variant="caption" weight="600" color={color.black}>
            From verified business
          </T>
        </View>
      )}
      <Rating value={p.sellerRating.average} count={p.sellerRating.count} size={12} />
    </View>
  );
}

export function ProductTile({ p, width }: { p: ProductCard; width?: number }) {
  const toast = useToast();
  return (
    <Pressable onPress={() => router.push(`/product/${p.id}`)} style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })} accessibilityRole="link" accessibilityLabel={`${p.title}, ${money(p.priceCents)}`}>
      <View>
        <Photo uri={p.image} style={{ width: '100%', aspectRatio: 0.8 }} rounded={radius.md} icon="bag-handle-outline" label={p.title} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={p.isFavourite ? 'Remove favourite' : 'Add favourite'}
          onPress={() => {
            tap();
            try {
              shop.toggleFavourite(p.id);
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
          style={{ position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color.white, borderRadius: radius.pill, paddingHorizontal: 10, height: 30 }}
        >
          <Icon name="heart" size={15} color={p.isFavourite ? color.indigo : color.black} fill={p.isFavourite ? color.indigo : 'none'} />
          <T variant="caption" weight="600">
            {p.favouriteCount}
          </T>
        </Pressable>
        {!p.available && (
          <View style={{ position: 'absolute', left: 8, top: 8, backgroundColor: color.black, borderRadius: radius.sm, paddingHorizontal: 8, height: 24, justifyContent: 'center' }}>
            <T variant="caption" color={color.white} weight="700">
              Sold
            </T>
          </View>
        )}
      </View>
      <View style={{ paddingTop: 10, gap: 2 }}>
        <T variant="subhead" weight="600" numberOfLines={1}>
          {p.title}
        </T>
        <T variant="caption" color={color.grey500} numberOfLines={1}>
          {[p.brand, shop.CONDITION_LABEL[p.condition], p.size].filter(Boolean).join(' · ')}
        </T>
        <T variant="headline" weight="700" style={{ marginTop: 4 }}>
          {money(p.priceCents)}
        </T>
        <T variant="caption" color={color.grey500}>
          {money(p.priceWithFeesCents)} incl. fees
        </T>
        <View style={{ marginTop: 6 }}>
          <SellerLine p={p} />
        </View>
      </View>
    </Pressable>
  );
}

/* ---------------------------------------------------- Pay methods -- */

/** Pay with the Hayve balance (earns Wave Back) or a card. */
export function PayMethodPicker({ value, onChange, totalCents, waveBackCents = 0 }: { value: PayMethod; onChange: (m: PayMethod) => void; totalCents: number; waveBackCents?: number }) {
  const w = useLive(() => wallet.wallet()).data;
  const [showDev, setShowDev] = useState(false);
  const enough = (w?.available ?? 0) >= totalCents;
  const option = (m: PayMethod, icon: IconName, title: string, sub: string, disabled = false) => {
    const on = value === m;
    return (
      <Pressable
        key={m}
        disabled={disabled}
        onPress={() => {
          tap();
          onChange(m);
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: on, disabled }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: on ? 1.5 : 1, borderColor: on ? color.indigo : color.grey200, backgroundColor: color.white, opacity: disabled ? 0.45 : 1 }}
      >
        <Icon name={icon} size={22} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{title}</T>
          <T variant="footnote" color={color.grey500}>
            {sub}
          </T>
        </View>
        <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? color.indigo : color.grey500} />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 10 }}>
      {option('wallet', 'wallet-outline', 'Hayve balance', enough ? `${money(w?.available ?? 0)} available${waveBackCents ? ` · ${money(waveBackCents)} Wave Back` : ''}` : `${money(w?.available ?? 0)} available · not enough`, !enough)}
      {option('card', 'card-outline', 'Visa •••• 4242', 'Card payment')}
      {value !== 'wallet' && waveBackCents > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Icon name="sparkles-outline" size={16} color={color.indigo} />
          <T variant="footnote" color={color.black} style={{ flex: 1 }}>
            Pay with your Hayve balance and get <T variant="footnote" weight="700" color={color.indigo}>{money(waveBackCents)} Wave Back</T>
          </T>
        </View>
      )}
      {showDev ? (
        option('card_declined', 'close-circle-outline', 'Test card: declined', 'Simulates a failed payment')
      ) : (
        <Pressable onPress={() => setShowDev(true)} hitSlop={6} accessibilityRole="button">
          <T variant="footnote" color={color.grey500}>
            Testing? Show a card that gets declined
          </T>
        </Pressable>
      )}
      <T variant="caption" color={color.grey500}>
        Preview build: payments are simulated and no real money moves.
      </T>
    </View>
  );
}

/* ------------------------------------------------------- Wishlist button -- */

export function WishlistToggle({ productId, onList, compact }: { productId: string; onList: boolean; compact?: boolean }) {
  const toast = useToast();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={onList ? 'Remove from wishlist' : 'Add to wishlist'}
      onPress={() => {
        tap();
        try {
          if (onList) {
            wishlist.removeProductFromWishlist(productId);
            toast('Removed from your wishlist', 'info');
          } else {
            wishlist.addToWishlist(productId);
            toast('Added to your wishlist');
          }
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: compact ? 36 : 44, paddingHorizontal: compact ? 12 : 16, borderRadius: radius.md, backgroundColor: color.white, borderWidth: 1, borderColor: onList ? color.indigo : color.grey200, opacity: pressed ? 0.8 : 1 })}
    >
      <Icon name="gift-outline" size={18} color={onList ? color.indigo : color.black} />
      <T variant="subhead" weight="600" color={onList ? color.indigo : color.black}>
        {onList ? 'On your wishlist' : 'Add to wishlist'}
      </T>
    </Pressable>
  );
}

/* --------------------------------------------------------- Status pills -- */

const STATUS: Record<string, [string, 'indigo' | 'black' | 'grey']> = {
  paid: ['Paid', 'black'],
  shipped: ['Shipped', 'indigo'],
  delivered: ['Delivered', 'indigo'],
  completed: ['Completed', 'grey'],
  refunded: ['Refunded', 'grey'],
  cancelled: ['Cancelled', 'grey'],
  requested: ['Requested', 'black'],
  confirmed: ['Confirmed', 'indigo'],
  declined: ['Declined', 'grey'],
  active: ['Active', 'indigo'],
  placed: ['Placed', 'black'],
  accepted: ['Accepted', 'indigo'],
  preparing: ['Preparing', 'indigo'],
  ready: ['Ready', 'indigo'],
  picked_up: ['On the way', 'indigo'],
  rejected: ['Rejected', 'grey'],
  booked: ['Booked', 'black'],
  assigned: ['Courier assigned', 'indigo'],
  in_transit: ['In transit', 'indigo'],
  arriving: ['Arriving', 'indigo'],
  in_progress: ['On trip', 'indigo'],
  pending: ['Pending', 'black'],
  reserved: ['Reserved', 'black'],
  failed: ['Failed', 'black'],
  sold: ['Sold', 'black'],
  available: ['Available', 'grey'],
  unavailable: ['Unavailable', 'grey'],
  verified: ['Verified', 'indigo'],
  open: ['Open', 'black'],
  resolved: ['Resolved', 'grey'],
  dismissed: ['Dismissed', 'grey'],
};

export function StatusPill({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status.replace(/_/g, ' '), 'grey'];
  const fg = tone === 'indigo' ? color.indigo : tone === 'black' ? color.black : color.grey500;
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color.grey100, borderRadius: radius.sm, paddingHorizontal: 8, height: 24 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <T variant="caption" weight="600" color={tone === 'grey' ? color.grey500 : color.black}>
        {label}
      </T>
    </View>
  );
}

export function SimNote({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: color.grey100 }}>
      <Icon name="information-circle-outline" size={16} style={{ marginTop: 1 }} />
      <T variant="footnote" color={color.grey500} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

/** "Wave Back added" confirmation line (Hayve's only reward wording). */
export function WaveBackLine({ cents }: { cents: number }) {
  if (!cents) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingHorizontal: 12, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: color.indigo }}>
      <Icon name="sparkles-outline" size={15} color={color.indigo} />
      <T variant="subhead" weight="700" color={color.indigo}>
        {money(cents)} Wave Back added
      </T>
    </View>
  );
}
