import { router } from 'expo-router';
import { shop } from '../backend/api';
import { EmptyState, Grid, Header, Screen, useLayout } from '../design';
import { ProductTile } from '../features/common';
import { useLive } from '../lib/hooks';

export default function Favourites() {
  const { isWide } = useLayout();
  const items = useLive(() => shop.myFavourites()).data ?? [];
  return (
    <Screen header={<Header back title="Favourites" fallback="/shop" />}>
      {items.length === 0 ? (
        <EmptyState icon="heart-outline" title="No favourites yet" body="Tap the heart on any item to save it here." action="Browse Hayve Shop" onAction={() => router.push('/shop')} />
      ) : (
        <Grid min={isWide ? 190 : 150} gap={14}>
          {items.map((p, i) => (
            <ProductTile key={p.id} index={i} p={p} />
          ))}
        </Grid>
      )}
    </Screen>
  );
}
