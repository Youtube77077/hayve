import { router } from 'expo-router';
import { Share, View } from 'react-native';
import { social, wishlist } from '../backend/api';
import { Button, Card, color, EmptyState, Grid, Group, Header, IconButton, Screen, SwitchRow, T, useLayout } from '../design';
import { WishlistCard } from '../features/wishlist';
import { useAction, useLive } from '../lib/hooks';

/** Manage your own wishlist: reorder, remove, visibility, share. */
export default function MyWishlist() {
  const { isWide } = useLayout();
  const wl = useLive(() => wishlist.myWishlist()).data;
  const profile = useLive(() => social.myProfile().profile).data;
  const { run } = useAction();
  if (!wl || !profile) return null;
  const share = () => void Share.share({ message: `My Hayve wishlist: https://hayve.app/u/${profile.username}?tab=wishlist` });
  const sold = wl.items.filter((i) => i.status === 'sold').length;

  return (
    <Screen header={<Header back title="My wishlist" fallback="/profile" right={<IconButton icon="share-outline" label="Share wishlist" onPress={share} />} />}>
      <Group>
        <SwitchRow
          icon="globe-outline"
          title="Public wishlist"
          subtitle={wl.isPublic && profile.isPublic ? 'Anyone with your profile link can see it and send you a gift.' : profile.isPublic ? 'Only you can see your wishlist.' : 'Your profile is private, so your wishlist is hidden.'}
          value={wl.isPublic}
          onChange={(v) => run(() => wishlist.setWishlistVisibility(v), { success: v ? 'Wishlist is now public' : 'Wishlist is now private' })}
        />
      </Group>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1 }}>
          <T variant="title2">{wl.items.length - sold}</T>
          <T variant="footnote" color={color.textSecondary}>
            Wished for
          </T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T variant="title2">{sold}</T>
          <T variant="footnote" color={color.textSecondary}>
            Sold
          </T>
        </Card>
        <Card style={{ flex: 1.4 }} onPress={() => router.push(`/u/${profile.username}`)}>
          <T variant="headline" color={color.primary}>
            View as others
          </T>
          <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
            hayve.app/u/{profile.username}
          </T>
        </Card>
      </View>
      <View style={{ marginTop: 20 }}>
        {wl.items.length === 0 ? (
          <EmptyState icon="gift-outline" title="Your wishlist is empty" body="Add items from Hayve Shop. Friends can buy them for you as an anonymous gift." action="Browse Hayve Shop" onAction={() => router.push('/shop')} />
        ) : (
          <Grid min={isWide ? 220 : 160} gap={12}>
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
      </View>
      <T variant="footnote" color={color.textTertiary} style={{ marginTop: 20 }}>
        Items bought for you show as “Sold”. Hayve never tells you who bought a gift.
      </T>
      {wl.items.length > 0 && <Button title="Add more from Hayve Shop" variant="secondary" style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => router.push('/shop')} />}
    </Screen>
  );
}
