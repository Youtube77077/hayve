import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { social, wishlist } from '../../backend/api';
import { Avatar, Badge, Button, Card, color, EmptyState, ErrorState, Grid, Header, IconButton, Rating, Screen, Segmented, Skeleton, T, useLayout } from '../../design';
import { ProductTile } from '../../features/common';
import { WishlistCard } from '../../features/wishlist';
import { ago, memberSince } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';

/** Public profile with listings, reviews and the public wishlist. */
export default function PublicProfile() {
  const { username, tab: initialTab } = useLocalSearchParams<{ username: string; tab?: string }>();
  const sessionId = useSessionId();
  const { isWide } = useLayout();
  const { data: profile, error } = useLive(() => social.getPublicProfile(username), [username]);
  const wl = useLive(() => wishlist.getWishlistByUsername(username), [username]).data;
  const [tab, setTab] = useState<'wishlist' | 'listings' | 'reviews'>((initialTab as 'wishlist') ?? 'wishlist');
  const { run } = useAction();

  if (error) return <Screen header={<Header back fallback="/" />}><ErrorState message={error.message} /></Screen>;
  if (!profile) {
    return (
      <Screen header={<Header back fallback="/" />}>
        <View style={{ gap: 12 }}>
          <Skeleton height={80} width={80} radius={40} />
          <Skeleton height={24} width="60%" />
          <Skeleton height={200} />
        </View>
      </Screen>
    );
  }

  const share = () => void Share.share({ message: `${profile.user.displayName}'s wishlist on Hayve: https://hayve.app/u/${profile.user.username}` });
  const available = wl?.items.filter((i) => i.status !== 'sold').length ?? 0;

  return (
    <Screen header={<Header back fallback="/" right={<IconButton icon="share-outline" label="Share profile" onPress={share} />} />}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: isWide ? 24 : 0, alignItems: isWide ? 'center' : 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Avatar uri={profile.user.avatar} name={profile.user.displayName} size={isWide ? 104 : 84} ring />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="title2">{profile.user.displayName}</T>
            <T variant="callout" color={color.textSecondary}>
              @{profile.user.username}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Rating value={profile.rating.average} count={profile.rating.count} />
              {profile.roles.seller && <Badge label="Seller" tone="primary" />}
              {profile.roles.host && <Badge label="Host" tone="primary" />}
              {profile.accountType === 'business' && <Badge label="Business" tone="dark" />}
            </View>
          </View>
        </View>
        {isWide && <View style={{ flex: 1 }} />}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: isWide ? 0 : 16 }}>
          {profile.isMe ? (
            <>
              <Button title="Edit profile" variant="outline" icon="create-outline" onPress={() => router.push('/settings/profile')} />
              <Button title="Manage wishlist" icon="gift-outline" onPress={() => router.push('/wishlist')} />
            </>
          ) : (
            sessionId && (
              <>
                <Button title="Message" variant="outline" icon="chatbubble-outline" onPress={() => run(() => social.startThread(profile.user.id), { onDone: (id) => router.push(`/messages/${id}`) })} />
                <Button title="Send money" icon="paper-plane-outline" onPress={() => router.push(`/pay/send?to=${profile.user.id}`)} />
              </>
            )
          )}
        </View>
      </View>

      {profile.visible ? (
        <>
          {profile.bio ? (
            <T color={color.textSecondary} style={{ marginTop: 16, maxWidth: 640 }}>
              {profile.bio}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
            <Meta icon="location-outline" text={profile.user.city} />
            <Meta icon="calendar-outline" text={`Member since ${memberSince(profile.memberSince)}`} />
            <Meta icon="bag-check-outline" text={`${profile.soldCount} sold`} />
          </View>

          <View style={{ marginTop: 22, maxWidth: 520 }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { key: 'wishlist', label: `Wishlist${wl?.visible ? ` · ${available}` : ''}`, icon: 'gift-outline' },
                { key: 'listings', label: `Listings · ${profile.listings.length}` },
                { key: 'reviews', label: `Reviews · ${profile.reviews.length}` },
              ]}
            />
          </View>

          <View style={{ marginTop: 18 }}>
            {tab === 'wishlist' &&
              (!wl?.visible ? (
                <EmptyState icon="lock-closed-outline" title="This wishlist is private" body={`${profile.user.displayName} has chosen not to share their wishlist.`} />
              ) : wl.items.length === 0 ? (
                <EmptyState icon="gift-outline" title={profile.isMe ? 'Your wishlist is empty' : 'Nothing here yet'} body={profile.isMe ? 'Tap the gift button on any Hayve Shop item to add it.' : `${profile.user.displayName} hasn't added anything yet.`} action={profile.isMe ? 'Browse Hayve Shop' : undefined} onAction={() => router.push('/shop')} />
              ) : (
                <>
                  {!profile.isMe && (
                    <Card tone="soft" style={{ marginBottom: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Ionicons name="gift" size={22} color={color.primary} />
                      <T variant="footnote" color={color.inkSoft} style={{ flex: 1 }}>
                        <T variant="footnote" weight="700">
                          Gift anonymously.{' '}
                        </T>
                        It's delivered to {profile.user.displayName.split(' ')[0]} and they'll only see the item as sold, never who bought it.
                      </T>
                    </Card>
                  )}
                  <Grid min={isWide ? 220 : 160} gap={12}>
                    {wl.items.map((item) => (
                      <WishlistCard key={item.id} item={item} ownerUsername={profile.user.username} ownerView={profile.isMe} onRemove={() => run(() => wishlist.removeFromWishlist(item.id), { success: 'Removed' })} />
                    ))}
                  </Grid>
                </>
              ))}
            {tab === 'listings' &&
              (profile.listings.length === 0 ? (
                <EmptyState icon="pricetags-outline" title="No active listings" />
              ) : (
                <Grid min={isWide ? 190 : 150} gap={14}>
                  {profile.listings.map((p) => (
                    <ProductTile key={p.id} p={p} />
                  ))}
                </Grid>
              ))}
            {tab === 'reviews' &&
              (profile.reviews.length === 0 ? (
                <EmptyState icon="star-outline" title="No reviews yet" />
              ) : (
                <View style={{ gap: 10 }}>
                  {profile.reviews.map((r) => (
                    <Card key={r.id}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Avatar uri={r.avatar} name={r.author} size={34} />
                        <View style={{ flex: 1 }}>
                          <T variant="headline">{r.author}</T>
                          <T variant="footnote" color={color.textTertiary}>
                            {ago(r.createdAt)}
                          </T>
                        </View>
                        <Rating value={r.rating} />
                      </View>
                      <T color={color.textSecondary} style={{ marginTop: 8 }}>
                        {r.text}
                      </T>
                    </Card>
                  ))}
                </View>
              ))}
          </View>
        </>
      ) : (
        <EmptyState icon="lock-closed-outline" title="This profile is private" body="Only basic information is visible." />
      )}
    </Screen>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={16} color={color.textTertiary} />
      <T variant="footnote" color={color.textSecondary}>
        {text}
      </T>
    </View>
  );
}
