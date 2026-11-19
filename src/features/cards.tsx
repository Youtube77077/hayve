import { Icon, type IconName } from '../design/icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { bookings } from '../backend/api';
import type { Property, RentalVehicle } from '../backend/types';
import { Badge, color, Photo, radius, Rating, T, tap, useToast } from '../design';
import { money } from '../lib/format';

export function Spec({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={14} color={color.textSecondary} />
      <T variant="footnote" color={color.textSecondary} style={{ textTransform: 'capitalize' }}>
        {text}
      </T>
    </View>
  );
}

export function VehicleCard({ v, start, end }: { v: RentalVehicle; start?: string; end?: string }) {
  return (
    <Pressable onPress={() => router.push(`/drive/${v.id}${start && end ? `?start=${start}&end=${end}` : ''}`)} style={({ pressed }) => ({ backgroundColor: color.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: color.line, opacity: pressed ? 0.92 : 1 })}>
      <Photo uri={v.images[0]} style={{ width: '100%', height: 170 }} icon="car-sport-outline" label={`${v.make} ${v.model}`} />
      <View style={{ padding: 14, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T variant="headline" numberOfLines={1}>
              {v.make} {v.model}
            </T>
            <T variant="footnote" color={color.textSecondary}>
              {v.year} · {v.location}
            </T>
          </View>
          <Rating value={v.rating} count={v.trips} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Spec icon="people-outline" text={`${v.seats} seats`} />
          <Spec icon="cog-outline" text={v.transmission === 'automatic' ? 'Automatic' : 'Manual'} />
          <Spec icon={v.fuel === 'electric' ? 'flash-outline' : 'water-outline'} text={v.fuel === 'electric' ? `${v.rangeKm} km range` : v.fuel} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
          <T variant="title3">{money(v.pricePerDayCents)}</T>
          <T variant="footnote" color={color.textSecondary}>
            / day
          </T>
        </View>
      </View>
    </Pressable>
  );
}

export function PropertyCard({ p, saved, query }: { p: Property; saved: boolean; query?: string }) {
  const toast = useToast();
  return (
    <Pressable onPress={() => router.push(`/stay/${p.id}${query ?? ''}`)} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })} accessibilityRole="button" accessibilityLabel={p.title}>
      <View>
        <Photo uri={p.images[0]} style={{ width: '100%', aspectRatio: 1.05 }} rounded={radius.lg} icon="bed-outline" label={p.title} />
        <Pressable
          accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
          hitSlop={8}
          onPress={() => {
            tap();
            try {
              const on = bookings.toggleSavedProperty(p.id);
              toast(on ? 'Saved to favourites' : 'Removed from favourites', 'info');
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
          style={{ position: 'absolute', top: 12, right: 12 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' }}><Icon name="heart" size={18} color={saved ? color.indigo : color.black} fill={saved ? color.indigo : 'none'} /></View>
        </Pressable>
        {p.instantBook && <Badge label="Instant book" icon="flash" style={{ position: 'absolute', left: 12, top: 12, backgroundColor: color.white }} />}
      </View>
      <View style={{ paddingTop: 10, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <T variant="headline" numberOfLines={1} style={{ flex: 1 }}>
            {p.neighbourhood}, {p.city}
          </T>
          <Rating value={p.rating} />
        </View>
        <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
          {p.title}
        </T>
        <T variant="footnote" color={color.textSecondary}>
          {p.guests} guests · {p.bedrooms} bedroom{p.bedrooms === 1 ? '' : 's'} · {p.beds} bed{p.beds === 1 ? '' : 's'}
        </T>
        <T variant="subhead" weight="800" style={{ marginTop: 4 }}>
          {money(p.pricePerNightCents)} <T variant="footnote" color={color.textSecondary}>night</T>
        </T>
      </View>
    </Pressable>
  );
}
