import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { View as RNView } from 'react-native';
import { holidays } from '../../../backend/api';
import { Badge, Button, Card, color, ErrorState, Header, Icon, Input, KeyValue, ListRow, Group, Photo, prettyDate, radius, Screen, Section, Skeleton, Stars, T, useLayout, useToast } from '../../../design';
import { celebrate } from '../../../features/celebrate';
import { ShareCard, useTripRoutes } from '../../../features/holidays/ShareCard';
import { shareTripCard } from '../../../features/holidays/share';
import type { LngLat } from '../../../features/holidays/trip';
import { money } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';

export default function Trip() {
  const { id, stars: starsParam } = useLocalSearchParams<{ id: string; stars?: string }>();
  const res = useLive(() => holidays.getTrip(id), [id]);
  const t = res.data;
  const { width } = useLayout();
  const toast = useToast();
  const { run, busy } = useAction();
  const [stars, setStars] = useState(Number(starsParam) || 0);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<RNView>(null);
  const map = useLive(() => (t && t.status === 'completed' ? holidays.myTripMap(id) : undefined), [id, t?.status]).data;
  const routes = useTripRoutes(map);

  if (res.error || !t) return <Screen header={<Header back fallback="/holidays" />}><ErrorState message={res.error?.message ?? 'Trip not found'} onRetry={() => router.replace('/holidays')} /></Screen>;
  const p = t.package;
  const done = t.status === 'completed';
  const cardW = Math.min(width - 32, 340);

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
  };

  const share = async () => {
    setSharing(true);
    try {
      const code = holidays.shareTrip(t.id);
      const out = await shareTripCard(cardRef, { ...cardData(code) });
      if (out === 'downloaded') toast('Saved your trip picture. Post it anywhere you like.', 'success');
      if (out === 'unavailable') toast('Sharing isn’t available on this device.', 'error');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Couldn’t share right now. Try again.', 'error');
    } finally {
      setSharing(false);
    }
  };

  const cardData = (code: string | null) => ({
    city: p.city,
    country: p.country,
    days: map?.days ?? p.nights + 1,
    places: map?.places ?? 0,
    km: routes.km,
    lines: routes.lines,
    stops: (map?.stops ?? []).filter((s) => s.kind !== 'hotel').map((s) => [s.lng, s.lat] as LngLat),
    code,
    photo,
  });

  return (
    <Screen header={<Header back title={done ? `Your trip to ${p.city}` : `${p.city} trip`} fallback="/holidays" />}>
      {!done && (
        <>
          <Photo uri={p.images[0]} style={{ width: '100%', aspectRatio: 1.8 }} rounded={radius.lg} icon="airplane-outline" label={p.city} />
          <View style={{ marginTop: 16, gap: 4 }}>
            <Badge label={t.status === 'cancelled' ? 'Cancelled' : 'Booked'} tone="primary" />
            <T variant="title1">{p.title}</T>
            <T color={color.textSecondary}>
              {prettyDate(t.departure)} → {prettyDate(t.returnDate)} · {t.travellers} traveller{t.travellers > 1 ? 's' : ''}
            </T>
          </View>
          <Card style={{ gap: 4, marginTop: 16 }}>
            <KeyValue label="Booking" value={t.reference} />
            <KeyValue label="Hotel" value={p.hotel} />
            <KeyValue label="Meals" value={p.boardLabel} />
            <KeyValue label="Paid" value={money(t.totalCents)} strong />
          </Card>
          <Section title="Add to your trip" subtitle="Everything for this holiday, in one app" style={{ marginTop: 24 }}>
            <Group>
              <ListRow icon="taxi-outline" title="Ride to the airport" subtitle={`On ${prettyDate(t.departure)}`} onPress={() => router.push('/ride')} />
              <ListRow icon="car-outline" title={`Rent a car in ${p.city}`} subtitle="Pick it up at the airport" onPress={() => router.push('/drive')} />
              <ListRow icon="fast-food-outline" title="Food for the journey" subtitle="Delivered before you leave" onPress={() => router.push('/bites')} />
            </Group>
          </Section>
        </>
      )}

      {done && t.needsReview && (
        <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 24 }}>
          <T variant="title2" center>
            How was {p.city}?
          </T>
          <T color={color.textSecondary} center>
            Your rating helps other travellers pick their next trip.
          </T>
          <Stars value={stars} onChange={setStars} size={38} />
          {stars > 0 && <Input containerStyle={{ alignSelf: 'stretch' }} placeholder="What did you love? (optional)" value={comment} onChangeText={setComment} multiline />}
          <Button
            title="Send rating"
            size="lg"
            full
            disabled={!stars}
            loading={busy}
            onPress={() => run(() => holidays.rateTrip(t.id, stars, comment), { onDone: () => celebrate({ title: 'Thanks for rating!', body: stars >= 4 ? 'Glad you had a great time. Here is your trip in one picture.' : 'Thanks for telling us. It helps everyone.', emoji: stars >= 4 ? '🎉' : '👋' }) })}
          />
        </Card>
      )}

      {done && !t.needsReview && (
        <View style={{ gap: 16, alignItems: 'center' }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <T variant="title2" center>
              Your trip in one picture
            </T>
            <T color={color.textSecondary} center>
              Add a photo from your trip and share it to your story.
            </T>
          </View>
          {routes.loading ? (
            <Skeleton width={cardW} height={cardW * (16 / 9)} radius={16} />
          ) : (
            <ShareCard ref={cardRef} width={cardW} data={cardData(t.shareCode ?? null)} />
          )}
          {routes.missing > 0 && !routes.loading && (
            <T variant="footnote" color={color.textSecondary} center>
              Some roads couldn’t be loaded, so part of the route isn’t drawn.
            </T>
          )}
          <Button title={photo ? 'Change photo' : 'Add a photo'} icon="image-outline" variant="outline" onPress={pickPhoto} />
          <View style={{ alignSelf: 'stretch' }}>
            <Button title={sharing ? 'Getting it ready…' : 'Share my trip'} icon="share-outline" size="lg" full loading={sharing} disabled={routes.loading} onPress={share} />
          </View>
          <T variant="footnote" color={color.textSecondary} center>
            The map leaves out the area around your hotel. Your rating: {'★'.repeat(t.review?.stars ?? 0)}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="airplane-outline" size={18} />
            <T variant="subhead" weight="700" onPress={() => router.push('/holidays')} accessibilityRole="link">
              Plan your next trip
            </T>
          </View>
        </View>
      )}
    </Screen>
  );
}
