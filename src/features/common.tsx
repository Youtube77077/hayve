import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PAY_METHOD_LABEL, type PayMethod, shop, social, wallet, wishlist } from '../backend/api';
import type { ProductCard } from '../backend/api/shop';
import {
  alpha,
  Avatar,
  color,
  HayveLogo,
  IconButton,
  layout,
  Photo,
  radius,
  SERVICES,
  type ServiceKey,
  service,
  ServiceTile,
  SimBadge,
  T,
  tap,
  useLayout,
  useToast,
} from '../design';
import { money } from '../lib/format';
import { useLive } from '../lib/hooks';

/* ------------------------------------------------------- Tab header -- */

/** Top bar shared by every primary destination. */
export function TabHeader({ service: key, title, subtitle, right, dark }: { service: ServiceKey; title?: string; subtitle?: string; right?: ReactNode; dark?: boolean }) {
  const { gutter, isWide } = useLayout();
  const s = service(key);
  const me = useLive(() => social.myProfile()).data;
  const unreadN = useLive(() => social.unreadNotificationCount()).data ?? 0;
  const unreadM = useLive(() => social.unreadMessageCount()).data ?? 0;
  const fg = dark ? '#fff' : color.ink;
  return (
    <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          {key === 'home' && !isWide ? (
            <HayveLogo height={28} tone={dark ? 'light' : 'dark'} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {key !== 'home' && key !== 'profile' && key !== 'explore' && (
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: dark ? color.lime : color.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={s.iconActive} size={17} color={dark ? color.ink : color.lime} />
                </View>
              )}
              <T variant="title2" color={fg} numberOfLines={1}>
                {title ?? s.name}
              </T>
            </View>
          )}
          {subtitle && (
            <T variant="footnote" color={dark ? color.textOnDarkSecondary : color.textSecondary} style={{ marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </T>
          )}
        </View>
        {right}
        {!isWide && (
          <>
            <IconButton icon="chatbubble-ellipses-outline" label="Messages" badge={unreadM} tone={dark ? 'glass' : 'surface'} onPress={() => router.push('/messages')} />
            <IconButton icon="notifications-outline" label="Notifications" badge={unreadN} tone={dark ? 'glass' : 'surface'} onPress={() => router.push('/notifications')} />
          </>
        )}
        {isWide && key !== 'profile' && (
          <Pressable onPress={() => router.push('/profile')} accessibilityLabel="Profile">
            <Avatar uri={me?.profile.avatar} name={me?.profile.displayName} size={40} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ----------------------------------------------------- Service rail -- */

export function ServiceRail({ exclude = [] as ServiceKey[] }) {
  const items = SERVICES.filter((s) => !['home', 'profile', ...exclude].includes(s.key));
  const { gutter } = useLayout();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 14 }}>
      {items.map((s) => (
        <Pressable
          key={s.key}
          accessibilityRole="button"
          accessibilityLabel={s.name}
          onPress={() => {
            tap();
            router.push(s.route as never);
          }}
          style={({ pressed }) => ({ width: `${100 / 4}%`, alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1, paddingHorizontal: 4 })}
        >
          <ServiceTile icon={s.iconActive} accent={s.accent} size={gutter > 16 ? 64 : 58} />
          <T variant="subhead" weight="600" numberOfLines={1}>
            {s.short}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------------------------------- Product tile -- */

export function ProductTile({ p, width }: { p: ProductCard; width?: number }) {
  const toast = useToast();
  return (
    <Pressable onPress={() => router.push(`/product/${p.id}`)} style={({ pressed }) => ({ width, opacity: pressed ? 0.9 : 1 })} accessibilityRole="button" accessibilityLabel={`${p.title}, ${money(p.priceCents)}`}>
      <View>
        <Photo uri={p.image} style={{ width: '100%', aspectRatio: 0.78 }} rounded={radius.md} icon="bag-handle-outline" label={p.title} />
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
          style={{ position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.pill, paddingHorizontal: 10, height: 32 }}
        >
          <Ionicons name={p.isFavourite ? 'heart' : 'heart-outline'} size={17} color={p.isFavourite ? color.primary : color.ink} />
          <T variant="subhead" weight="600">
            {p.favouriteCount}
          </T>
        </Pressable>
        {!p.available && (
          <View style={{ position: 'absolute', left: 8, top: 8, backgroundColor: color.ink, borderRadius: radius.pill, paddingHorizontal: 10, height: 24, justifyContent: 'center' }}>
            <T variant="caption" color="#fff" weight="700">
              Sold
            </T>
          </View>
        )}
      </View>
      <View style={{ paddingTop: 8, paddingHorizontal: 2, gap: 1 }}>
        <T variant="subhead" color={color.textSecondary} numberOfLines={1}>
          {p.brand ? `${p.brand} · ` : ''}
          {p.title}
        </T>
        <T variant="footnote" color={color.textTertiary} numberOfLines={1}>
          {shop.CONDITION_LABEL[p.condition]}
          {p.size ? ` · ${p.size}` : ''}
        </T>
        <T variant="headline" style={{ marginTop: 4 }}>
          {money(p.priceCents)}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <T variant="footnote" color={color.primary} weight="600">
            {money(p.priceWithProtectionCents)} incl.
          </T>
          <Ionicons name="shield-checkmark-outline" size={13} color={color.primary} />
        </View>
      </View>
    </Pressable>
  );
}

/* ---------------------------------------------------- Pay methods -- */

/** Choose how to pay: Hayve Pay balance or a simulated card (with a decline option for testing). */
export function PayMethodPicker({ value, onChange, totalCents }: { value: PayMethod; onChange: (m: PayMethod) => void; totalCents: number }) {
  const w = useLive(() => wallet.wallet()).data;
  const [showDev, setShowDev] = useState(false);
  const enough = (w?.available ?? 0) >= totalCents;
  const option = (m: PayMethod, icon: React.ComponentProps<typeof Ionicons>['name'], title: string, sub: string, disabled = false) => {
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
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? color.primary : color.line, backgroundColor: color.surface, opacity: disabled ? 0.5 : 1 }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: m === 'wallet' ? color.ink : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={m === 'wallet' ? color.lime : color.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="headline">{title}</T>
          <T variant="footnote" color={disabled ? color.danger : color.textSecondary}>
            {sub}
          </T>
        </View>
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? color.primary : color.lineStrong} />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 10 }}>
      {option('wallet', 'wallet', 'Hayve Pay', enough ? `Balance ${money(w?.available ?? 0)}` : `Balance ${money(w?.available ?? 0)} · not enough`, !enough)}
      {option('card', 'card-outline', 'Visa •••• 4242', PAY_METHOD_LABEL.card)}
      {showDev ? (
        option('card_declined', 'close-circle-outline', 'Test card: declined', 'Simulates a failed payment')
      ) : (
        <Pressable onPress={() => setShowDev(true)} hitSlop={6}>
          <T variant="footnote" color={color.textTertiary}>
            Testing? Show a card that simulates a decline
          </T>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SimBadge />
        <T variant="footnote" color={color.textTertiary} style={{ flex: 1 }}>
          No real money moves in this build. Payments use the Hayve simulated ledger.
        </T>
      </View>
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
            toast('Added to your wishlist 🎁');
          }
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: compact ? 36 : 46, paddingHorizontal: compact ? 12 : 18, borderRadius: radius.pill, backgroundColor: onList ? color.lime : color.surface, borderWidth: onList ? 0 : 1, borderColor: color.lineStrong, opacity: pressed ? 0.8 : 1 })}
    >
      <Ionicons name={onList ? 'gift' : 'gift-outline'} size={18} color={color.ink} />
      <T variant="subhead" weight="700">
        {onList ? 'On wishlist' : 'Wishlist'}
      </T>
    </Pressable>
  );
}

/* --------------------------------------------------------- Status pills -- */

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    paid: ['Paid', color.primarySoft, color.primary],
    shipped: ['Shipped', color.primarySoft, color.primary],
    delivered: ['Delivered', color.successSoft, color.success],
    completed: ['Completed', color.successSoft, color.success],
    refunded: ['Refunded', color.surfaceSunken, color.textSecondary],
    cancelled: ['Cancelled', color.surfaceSunken, color.textSecondary],
    requested: ['Requested', color.warningSoft, color.warning],
    confirmed: ['Confirmed', color.successSoft, color.success],
    declined: ['Declined', color.dangerSoft, color.danger],
    active: ['Active', color.primarySoft, color.primary],
    placed: ['Placed', color.warningSoft, color.warning],
    accepted: ['Accepted', color.primarySoft, color.primary],
    preparing: ['Preparing', color.primarySoft, color.primary],
    ready: ['Ready', color.limeSoft, color.limeInk],
    picked_up: ['Picked up', color.primarySoft, color.primary],
    rejected: ['Rejected', color.dangerSoft, color.danger],
    booked: ['Booked', color.warningSoft, color.warning],
    assigned: ['Courier assigned', color.primarySoft, color.primary],
    in_transit: ['In transit', color.primarySoft, color.primary],
    arriving: ['Arriving', color.primarySoft, color.primary],
    in_progress: ['On trip', color.primarySoft, color.primary],
    pending: ['Pending', color.warningSoft, color.warning],
    reserved: ['Reserved', color.warningSoft, color.warning],
    failed: ['Failed', color.dangerSoft, color.danger],
    sold: ['Sold', color.ink, '#fff'],
    available: ['Available', color.successSoft, color.success],
    unavailable: ['Unavailable', color.surfaceSunken, color.textSecondary],
  };
  const [label, bg, fg] = map[status] ?? [status, color.surfaceSunken, color.textSecondary];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, height: 24, justifyContent: 'center' }}>
      <T variant="caption" weight="700" color={fg}>
        {label}
      </T>
    </View>
  );
}

export function SimNote({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: alpha(color.warning, 0.08) }}>
      <Ionicons name="flask-outline" size={16} color={color.warning} />
      <T variant="footnote" color={color.warning} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}
