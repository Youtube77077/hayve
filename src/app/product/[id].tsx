import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { shop, social } from '../../backend/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  color,
  ConfirmSheet,
  Divider,
  ErrorState,
  Gallery,
  goBack,
  IconButton,
  KeyValue,
  radius,
  Rating,
  Screen,
  VerifiedMark,
  Section,
  Split,
  T,
  useLayout,
} from '../../design';
import { ProductTile, WishlistToggle } from '../../features/common';
import { money, ago } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWide } = useLayout();
  const sessionId = useSessionId();
  const { data: p, error } = useLive(() => shop.getProduct(id), [id]);
  const more = useLive(() => (p ? shop.listProducts({ sellerId: p.seller.id }).filter((x) => x.id !== p.id).slice(0, 6) : []), [p?.id]).data ?? [];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, busy } = useAction();

  if (error || !p) return <Screen header={<Top />}>{error ? <ErrorState message={error.message} onRetry={() => goBack('/shop')} /> : null}</Screen>;

  const requireAuth = (fn: () => void) => (sessionId ? fn() : router.push('/sign-in'));

  const gallery = (
    <View style={{ marginHorizontal: isWide ? 0 : -16, marginTop: isWide ? 8 : 0 }}>
      <Gallery
        images={p.images}
        aspect={isWide ? 1 : 1 / 1.1}
        rounded={isWide ? radius.xl : 0}
        icon="bag-handle-outline"
        label={p.title}
        overlay={
          !p.available ? (
            <View style={{ position: 'absolute', top: 16, left: 16 }}>
              <Badge label="Sold" tone="dark" />
            </View>
          ) : null
        }
      />
    </View>
  );

  const info = (
    <View style={{ paddingTop: isWide ? 8 : 18, gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {p.fromVerifiedBusiness && <Badge label="From verified business" icon="verified" tone="primary" />}
        <Badge label={shop.CATEGORY_LABEL[p.category]} />
        <Badge label={shop.CONDITION_LABEL[p.condition]} />
        {p.quantity > 1 && p.available && <Badge label={`${p.quantity} available`} />}
      </View>
      <T variant="title2">{p.title}</T>
      {p.brand && (
        <T variant="callout" color={color.textSecondary}>
          {p.brand}
          {p.size ? ` · Size ${p.size}` : ''}
        </T>
      )}
      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <T variant="title1">{money(p.priceCents)}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T variant="subhead" color={color.grey500} weight="600">
            {money(p.priceWithFeesCents)} incl. fees
          </T>

        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        {p.isMine ? (
          <>
            <Button title="Edit listing" icon="create-outline" size="lg" full onPress={() => router.push(`/sell?id=${p.id}`)} />
          </>
        ) : (
          <>
            <Button title={p.available ? 'Buy now' : 'Sold'} size="lg" style={{ flex: 1, minWidth: 160 }} disabled={!p.available} onPress={() => requireAuth(() => router.push(`/checkout/${p.id}`))} />
            <Button
              title="Message"
              icon="chatbubble-outline"
              size="lg"
              variant="outline"
              onPress={() =>
                requireAuth(() =>
                  run(() => social.startThread(p.seller.id, { kind: 'product', id: p.id, title: p.title }), { onDone: (tid) => router.push(`/messages/${tid}`) }),
                )
              }
            />
          </>
        )}
      </View>
      {!p.isMine && sessionId && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <WishlistToggle productId={p.id} onList={p.onMyWishlist} />
          <Pressable
            onPress={() => run(() => shop.toggleFavourite(p.id))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface }}
          >
            <Icon name="heart" size={18} color={p.isFavourite ? color.indigo : color.ink} fill={p.isFavourite ? color.indigo : 'none'} />
            <T variant="subhead" weight="700">
              {p.favouriteCount}
            </T>
          </Pressable>
        </View>
      )}

      <Card style={{ marginTop: 20 }}>
        <T variant="headline" style={{ marginBottom: 6 }}>
          Description
        </T>
        <T color={color.textSecondary}>{p.description}</T>
        <Divider style={{ marginVertical: 12 }} />
        <KeyValue label="Condition" value={shop.CONDITION_LABEL[p.condition]} />
        {p.brand && <KeyValue label="Brand" value={p.brand} />}
        {p.size && <KeyValue label="Size" value={p.size} />}
        <KeyValue label="Location" value={p.location} />
        <KeyValue label="Uploaded" value={ago(p.createdAt)} />
      </Card>

      <Card style={{ marginTop: 12 }} onPress={() => router.push(`/u/${p.seller.username}`)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar uri={p.seller.avatarThumb ?? p.seller.avatar} name={p.seller.displayName} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T variant="headline" weight="700">
                {p.seller.storeName ?? p.seller.displayName}
              </T>
              {p.seller.verified && <VerifiedMark />}
            </View>
            <Rating value={p.sellerRating.average} count={p.sellerRating.count} />
            <T variant="footnote" color={color.grey500}>
              {p.seller.verified ? 'Verified Hayve Store business' : 'Private seller'} · {p.sellerListings} listings
            </T>
          </View>
          <Icon name="chevron-forward" size={18} color={color.textTertiary} />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 16 }}>
        <Icon name="shield-checkmark-outline" size={18} />
        <T variant="footnote" color={color.grey500} style={{ flex: 1 }}>
          Your payment is held until you confirm the item arrived as described. Ships with Hayve Send, or pick it up in person.
        </T>
      </View>
      {!p.isMine && sessionId && (
        <Pressable onPress={() => run(() => social.report('listing', p.id, 'Reported from listing page'), { success: 'Thanks. Our team will review this listing.' })} style={{ marginTop: 16, alignSelf: 'flex-start' }} accessibilityRole="button">
          <T variant="footnote" color={color.grey500} style={{ textDecorationLine: 'underline' }}>
            Report this listing
          </T>
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen header={<Top title={isWide ? p.title : undefined} shareUrl={`/product/${p.id}`} />} padded>
      <Split left={gallery} right={info} ratio={1.1} />
      {more.length > 0 && (
        <Section title={`More from ${p.seller.displayName.split(' ')[0]}`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {more.map((m) => (
              <ProductTile key={m.id} p={m} width={150} />
            ))}
          </ScrollView>
        </Section>
      )}
      <ConfirmSheet
        visible={confirmDelete}
        title="Delete this listing?"
        body="It will be removed from Hayve Shop and from any wishlists."
        confirm="Delete listing"
        destructive
        loading={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          run(() => shop.deleteListing(p.id), {
            success: 'Listing deleted',
            onDone: () => {
              setConfirmDelete(false);
              goBack('/shop');
            },
          })
        }
      />
      {p.isMine && (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Button title="Delete listing" variant="ghost" size="sm" icon="trash-outline" onPress={() => setConfirmDelete(true)} />
        </View>
      )}
    </Screen>
  );
}

function Top({ title, shareUrl }: { title?: string; shareUrl?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 10 }}>
      <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/shop')} />
      <T variant="headline" style={{ flex: 1 }} numberOfLines={1}>
        {title ?? ''}
      </T>
      {shareUrl && <IconButton icon="share-outline" label="Share" onPress={() => void Share.share({ message: `Check this out on Hayve: https://hayve.app${shareUrl}` })} />}
    </View>
  );
}
