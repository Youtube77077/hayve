import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Pressable, Share, View } from 'react-native';
import { social, wishlist } from '../backend/api';
import type { Profile } from '../backend/types';
import { Button, color, EmptyState, Grid, Header, Icon, IconButton, radius, Screen, Section, T, useLayout, useToast } from '../design';
import { WishlistCard } from '../features/wishlist';
import { useAction, useLive } from '../lib/hooks';

const OPTIONS: { key: Profile['wishlistVisibility']; title: string; body: string }[] = [
  { key: 'public', title: 'Public', body: 'Shown on your profile. Anyone can view it and send you a gift.' },
  { key: 'link', title: 'Anyone with the link', body: 'Hidden from your profile. Only people you share the link with can see it.' },
  { key: 'private', title: 'Private', body: 'Only you can see your wishlist.' },
];

/** Manage your own wishlist: privacy, sharing, order and items. */
export default function MyWishlist() {
  const { isWide } = useLayout();
  const toast = useToast();
  const wl = useLive(() => wishlist.myWishlist()).data;
  const profile = useLive(() => social.myProfile().profile).data;
  const { run } = useAction();
  if (!wl || !profile) return null;
  const visibility = wl.visibility ?? 'public';
  const shareUrl = `https://hayve.app/u/${profile.username}${visibility === 'link' ? `?w=${wl.shareToken}` : ''}`;
  const share = () => {
    if (visibility === 'private') return toast('Your wishlist is private. Choose Public or Anyone with the link to share it.', 'info');
    void Share.share({ message: `My Hayve wishlist: ${shareUrl}` });
  };
  const sold = wl.items.filter((i) => i.status === 'sold').length;

  return (
    <Screen header={<Header back title="My wishlist" fallback="/profile" right={<IconButton icon="share-outline" label="Share wishlist" onPress={share} />} />}>
      <Section title="Who can see it" style={{ marginTop: 4 }}>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          {OPTIONS.map((o) => {
            const on = visibility === o.key;
            return (
              <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => run(() => wishlist.setWishlistVisibility(o.key), { success: `Wishlist: ${o.title}` })} style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: on ? 1.5 : 1, borderColor: on ? color.indigo : color.grey200 }}>
                <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? color.indigo : color.grey500} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <T variant="headline">{o.title}</T>
                  <T variant="footnote" color={color.grey500}>
                    {o.body}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
        {visibility === 'public' && !profile.isPublic && (
          <T variant="footnote" color={color.grey500} style={{ marginTop: 8 }}>
            Your profile is private, so the wishlist is only reachable through your link.
          </T>
        )}
        {visibility !== 'private' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: color.grey100 }}>
            <Icon name="link-outline" size={18} />
            <T variant="footnote" style={{ flex: 1 }} numberOfLines={1}>
              {shareUrl}
            </T>
            <Button
              title="Copy"
              size="sm"
              variant="outline"
              onPress={async () => {
                await Clipboard.setStringAsync(shareUrl);
                toast('Link copied');
              }}
            />
          </View>
        )}
        {visibility === 'link' && (
          <Pressable onPress={() => run(() => wishlist.resetWishlistLink(), { success: 'New link created. The old link no longer works.' })} style={{ marginTop: 8 }} accessibilityRole="button">
            <T variant="footnote" color={color.indigo} weight="600">
              Reset link
            </T>
          </Pressable>
        )}
      </Section>

      <Section title={`Items · ${wl.items.length - sold} wished for${sold ? `, ${sold} sold` : ''}`} action="View as others" onAction={() => router.push(`/u/${profile.username}${visibility === 'link' ? `?w=${wl.shareToken}` : ''}`)}>
        {wl.items.length === 0 ? (
          <EmptyState icon="gift-outline" title="Your wishlist is empty" body="Add items from Hayve Shop. Friends can buy them for you as an anonymous gift." action="Browse Hayve Shop" onAction={() => router.push('/shop')} />
        ) : (
          <Grid min={isWide ? 220 : 160} gap={16}>
            {wl.items.map((item, i) => (
              <WishlistCard
                key={item.id}
                item={item}
                ownerUsername={profile.username}
                ownerView
                first={i === 0}
                last={i === wl.items.length - 1}
                onMove={(d) => run(() => wishlist.moveWishlistItem(item.id, d))}
                onRemove={() => run(() => wishlist.removeFromWishlist(item.id), { success: 'Removed from wishlist' })}
              />
            ))}
          </Grid>
        )}
        <T variant="footnote" color={color.grey500} style={{ marginTop: 16 }}>
          Items bought for you show as Sold. Hayve never tells you who bought a gift.
        </T>
      </Section>
    </Screen>
  );
}
