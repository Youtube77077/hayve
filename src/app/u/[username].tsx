import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { business, social, wishlist } from '../../backend/api';
import { Avatar, Button, Card, color, EmptyState, ErrorState, Grid, Header, Icon, IconButton, Input, Photo, radius, Rating, Screen, Section, Sheet, Skeleton, T, useLayout, VerifiedMark, type IconName } from '../../design';
import { ProductTile } from '../../features/common';
import { WishlistCard } from '../../features/wishlist';
import { ago, memberSince } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';

/** Public profile / store page. Section order: Listings, Reviews, Wishlist. */
export default function PublicProfile() {
  const { username, w } = useLocalSearchParams<{ username: string; w?: string }>();
  const sessionId = useSessionId();
  const { isWide } = useLayout();
  const { data: profile, error } = useLive(() => social.getPublicProfile(username), [username]);
  const wl = useLive(() => wishlist.getWishlistByUsername(username, w), [username, w]).data;
  const store = useLive(() => (profile?.verified ? business.storeFor(profile.user.id) : null), [profile?.user.id, profile?.verified]).data;
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();

  if (error) return <Screen header={<Header back fallback="/" />}><ErrorState message={error.message} /></Screen>;
  if (!profile) {
    return (
      <Screen header={<Header back fallback="/" />}>
        <View style={{ gap: 16 }}>
          <Skeleton height={88} width={88} radius={44} />
          <Skeleton height={24} width="60%" />
          <Skeleton height={200} />
        </View>
      </Screen>
    );
  }

  const name = store?.name ?? profile.user.displayName;
  const share = () => void Share.share({ message: `${name} on Hayve: https://hayve.app/u/${profile.user.username}` });
  const showWishlist = profile.isMe || (wl?.visible && (profile.wishlistOnProfile || !!w));
  const avatarSize = isWide ? 112 : 88;

  return (
    <Screen header={<Header back fallback="/" right={<IconButton icon="share-outline" label="Share profile" onPress={share} />} />}>
      {store?.banner ? <Photo uri={store.banner} style={{ width: '100%', height: isWide ? 220 : 140 }} rounded={radius.lg} icon="storefront-outline" /> : null}

      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: isWide ? 24 : 16, alignItems: isWide ? 'flex-end' : 'flex-start', marginTop: store?.banner ? -avatarSize / 3 : 8, paddingHorizontal: store?.banner ? 16 : 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, flex: isWide ? 1 : undefined }}>
          <View style={{ borderRadius: avatarSize, borderWidth: store?.banner ? 4 : 0, borderColor: color.white, backgroundColor: color.white }}>
            <Avatar uri={store?.logo ?? profile.user.avatar} name={name} size={avatarSize} />
          </View>
          <View style={{ flex: 1, gap: 4, paddingBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T variant="title2" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
              {profile.verified && <VerifiedMark size={20} />}
            </View>
            <T variant="callout" color={color.textSecondary}>
              @{profile.user.username}{profile.verified ? ' · Verified business' : ''}
            </T>
            <Rating value={profile.rating.average} count={profile.rating.count} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {profile.isMe ? (
            <>
              <Button title="Edit profile" variant="outline" icon="create-outline" onPress={() => router.push('/settings/profile')} />
              <Button title="Manage wishlist" variant="secondary" icon="gift-outline" onPress={() => router.push('/wishlist')} />
            </>
          ) : (
            sessionId && (
              <>
                <Button title="Message" variant="outline" icon="chatbubble-outline" onPress={() => run(() => social.startThread(profile.user.id), { onDone: (id) => router.push(`/messages/${id}`) })} />
                <IconButton icon="flag-outline" label="Report this profile" onPress={() => setReporting(true)} />
              </>
            )
          )}
        </View>
      </View>

      {profile.visible ? (
        <>
          {profile.bio || store?.description ? (
            <T color={color.textSecondary} style={{ marginTop: 16, maxWidth: 640, lineHeight: 24 }}>
              {store?.description || profile.bio}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            {(store?.city ?? profile.user.city) ? <Meta icon="location-outline" text={store?.city ?? profile.user.city} /> : null}
            <Meta icon="calendar-outline" text={`Member since ${memberSince(profile.memberSince)}`} />
            <Meta icon="bag-check-outline" text={`${profile.soldCount} sold`} />
            {store?.kvk ? <Meta icon="briefcase-outline" text={`${store.idLabel} ${store.kvk}`} /> : null}
          </View>

          <Section title="Listings" subtitle={profile.listings.length ? `${profile.listings.length} active` : undefined}>
            {profile.listings.length === 0 ? (
              <EmptyState icon="pricetags-outline" title="No active listings" body={profile.isMe ? 'Items you sell on Hayve Shop show up here.' : undefined} action={profile.isMe ? 'Sell an item' : undefined} onAction={() => router.push('/sell')} />
            ) : (
              <Grid min={isWide ? 200 : 150} gap={16}>
                {profile.listings.map((p, i) => (
                  <ProductTile key={p.id} index={i} p={p} />
                ))}
              </Grid>
            )}
          </Section>

          <Section title="Reviews" subtitle={profile.rating.count ? `★ ${profile.rating.average.toFixed(1)} (${profile.rating.count} reviews)` : undefined}>
            {profile.reviews.length === 0 ? (
              <EmptyState icon="star-outline" title="No reviews yet" />
            ) : (
              <Grid min={320} gap={12}>
                {profile.reviews.map((r) => (
                  <Card key={r.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar uri={r.avatar} name={r.author} size={36} />
                      <View style={{ flex: 1 }}>
                        <T variant="headline">{r.author}</T>
                        <T variant="footnote" color={color.textSecondary}>
                          {ago(r.createdAt)}
                        </T>
                      </View>
                      <Rating value={r.rating} label={false} />
                    </View>
                    <T color={color.textSecondary} style={{ marginTop: 8 }}>
                      {r.text}
                    </T>
                  </Card>
                ))}
              </Grid>
            )}
          </Section>

          {showWishlist && wl ? (
            <Section title="Wishlist" subtitle={profile.isMe ? visibilityLabel(wl.visibility) : undefined} action={profile.isMe ? 'Manage' : undefined} onAction={() => router.push('/wishlist')}>
              {wl.items.length === 0 ? (
                <EmptyState icon="gift-outline" title={profile.isMe ? 'Your wishlist is empty' : 'Nothing here yet'} body={profile.isMe ? 'Tap the heart on any Hayve Shop item to add it.' : undefined} action={profile.isMe ? 'Browse Hayve Shop' : undefined} onAction={() => router.push('/shop')} />
              ) : (
                <>
                  {!profile.isMe && (
                    <Card tone="soft" style={{ marginBottom: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Icon name="gift-outline" size={20} />
                      <T variant="footnote" style={{ flex: 1 }}>
                        <T variant="footnote" weight="700">Gift anonymously. </T>
                        It&apos;s delivered to {profile.user.displayName.split(' ')[0]}, who only sees the item as sold, never who bought it.
                      </T>
                    </Card>
                  )}
                  <Grid min={isWide ? 220 : 160} gap={12}>
                    {wl.items.map((item) => (
                      <WishlistCard key={item.id} item={item} ownerUsername={profile.user.username} ownerView={profile.isMe} token={w} onRemove={() => run(() => wishlist.removeFromWishlist(item.id), { success: 'Removed' })} />
                    ))}
                  </Grid>
                </>
              )}
            </Section>
          ) : null}
        </>
      ) : (
        <EmptyState icon="lock-closed-outline" title="This profile is private" body="Only basic information is visible." />
      )}

      <Sheet visible={reporting} onClose={() => setReporting(false)} title="Report profile" footer={<Button title="Send report" size="lg" full loading={busy} onPress={() => run(() => social.report('user', profile.user.id, reason), { success: 'Thanks, our team will review it', onDone: () => { setReporting(false); setReason(''); } })} />}>
        <View style={{ gap: 12 }}>
          <T color={color.textSecondary}>Tell us what&apos;s wrong. Reports are confidential.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Fake or scam', 'Offensive picture or bio', 'Counterfeit items', 'Harassment'].map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} style={{ borderWidth: 1, borderColor: reason === r ? color.black : color.grey200, backgroundColor: reason === r ? color.black : color.white, borderRadius: 999, paddingHorizontal: 12, height: 36, justifyContent: 'center' }}>
                <T variant="subhead" color={reason === r ? color.white : color.black}>{r}</T>
              </Pressable>
            ))}
          </View>
          <Input label="Details" multiline value={reason} onChangeText={setReason} maxLength={500} />
        </View>
      </Sheet>
    </Screen>
  );
}

function visibilityLabel(v: 'public' | 'link' | 'private' | null) {
  return v === 'public' ? 'Public' : v === 'link' ? 'Anyone with the link' : 'Private';
}

function Meta({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} color={color.grey500} />
      <T variant="footnote" color={color.textSecondary}>
        {text}
      </T>
    </View>
  );
}
