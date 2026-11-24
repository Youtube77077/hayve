import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { holidays } from '../../backend/api';
import { Button, color, ErrorState, HayveLogo, Screen, Skeleton, T, useLayout } from '../../design';
import { ShareCard, useTripRoutes } from '../../features/holidays/ShareCard';
import type { LngLat } from '../../features/holidays/trip';
import { useLive } from '../../lib/hooks';

/** Public page behind a shared trip (hayve.app/t/CODE): first name, destination, the map. No hotel, no account. */
export default function SharedTrip() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const res = useLive(() => holidays.publicTrip(code), [code]);
  const t = res.data;
  const routes = useTripRoutes(t?.map);
  const { width } = useLayout();
  const w = Math.min(width - 32, 340);
  if (res.error || !t) return <Screen><ErrorState message="This trip link isn’t available." onRetry={() => router.replace('/')} /></Screen>;
  return (
    <Screen maxWidth={480} footer={<Button title={`Plan a trip to ${t.city}`} size="lg" full onPress={() => router.push(`/holidays/${t.packageId}`)} />}>
      <View style={{ alignItems: 'center', gap: 16, paddingTop: 8 }}>
        <HayveLogo height={26} />
        <T variant="title2" center>
          {t.firstName}’s trip to {t.city}
        </T>
        <T color={color.textSecondary} center>
          {t.month} · {t.nights} nights{t.stars ? ` · rated ${t.stars}/5` : ''}
        </T>
        {routes.loading ? (
          <Skeleton width={w} height={w * (16 / 9)} radius={16} />
        ) : (
          <ShareCard width={w} data={{ city: t.city, country: t.country, days: t.map.days, places: t.map.places, km: routes.km, lines: routes.lines, stops: t.map.stops.map((s) => [s.lng, s.lat] as LngLat), code: t.code, photo: null }} />
        )}
        <T color={color.textSecondary} center>
          Flights, hotel, rides and food in one app.
        </T>
      </View>
    </Screen>
  );
}
