import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import type { CardData } from './ShareCard';

/** iPhone/iPad: capture the rendered card as a PNG and open the share sheet (Instagram, WhatsApp…). */
export async function shareTripCard(ref: RefObject<View | null>, _data: CardData): Promise<'shared' | 'unavailable' | 'downloaded'> {
  if (!ref.current || !(await Sharing.isAvailableAsync())) return 'unavailable';
  const uri = await captureRef(ref, { format: 'png', quality: 0.95, width: 1080, height: 1920 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your trip', UTI: 'public.png' });
  return 'shared';
}
