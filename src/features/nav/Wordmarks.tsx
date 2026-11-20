import { Text, View } from 'react-native';
import { color, FONT, type IconName } from '../../design';

/**
 * "Hayve Shop", "Hayve Pay" … product names. Clean typography only:
 * "Hayve" in extra bold, the product word in semibold, same colour.
 */
export type ProductKey = 'shop' | 'pay' | 'ride' | 'bites' | 'drive' | 'stay';

export const PRODUCT_WORD: Record<ProductKey, string> = { shop: 'Shop', pay: 'Pay', ride: 'Ride', bites: 'Bites', drive: 'Drive', stay: 'Stay' };

/** One outline icon per product (same set and stroke everywhere). */
export const PRODUCT_ICON: Record<ProductKey, IconName> = {
  shop: 'bag-handle-outline',
  pay: 'wallet-outline',
  ride: 'taxi-outline',
  bites: 'fast-food-outline',
  drive: 'car-outline',
  stay: 'bed-outline',
};

export function ProductWordmark({ product, active, size = 16 }: { product: ProductKey; active?: boolean; hovered?: boolean; size?: number }) {
  const ink = active ? color.indigo : color.black;
  const base = { fontSize: size, lineHeight: Math.round(size * 1.25), color: ink, letterSpacing: -0.2 } as const;
  return (
    <View accessible accessibilityLabel={`Hayve ${PRODUCT_WORD[product]}`} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={[base, { fontFamily: FONT.extrabold, letterSpacing: -0.4 }]}>Hayve</Text>
      <Text style={[base, { fontFamily: FONT.semibold }]}> {PRODUCT_WORD[product]}</Text>
    </View>
  );
}
