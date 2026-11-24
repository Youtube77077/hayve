import type { IconName } from '../../design/icons';

/**
 * Everything you can start from the big centre button. Hold it to see them all in a half circle;
 * tap it to start the one you're most likely to use (from onboarding, then from what you do).
 */
export type ActionKey = 'ride' | 'food' | 'shop' | 'sell' | 'stay' | 'car' | 'money' | 'holiday';

export interface QuickAction {
  key: ActionKey;
  label: string;
  icon: IconName;
  route: string;
  /** The bottom-bar tab this action belongs to (so the side tabs don't repeat it). */
  tab: 'ride' | 'bites' | 'shop' | 'stay' | 'drive' | 'pay' | null;
}

export const ACTIONS: QuickAction[] = [
  { key: 'ride', label: 'Ride', icon: 'taxi-outline', route: '/ride', tab: 'ride' },
  { key: 'food', label: 'Food', icon: 'fast-food-outline', route: '/bites', tab: 'bites' },
  { key: 'shop', label: 'Shop', icon: 'bag-handle-outline', route: '/shop', tab: 'shop' },
  { key: 'sell', label: 'Sell', icon: 'pricetag-outline', route: '/sell', tab: null },
  { key: 'stay', label: 'Stay', icon: 'bed-outline', route: '/stay', tab: 'stay' },
  { key: 'car', label: 'Car', icon: 'car-outline', route: '/drive', tab: 'drive' },
  { key: 'money', label: 'Send', icon: 'paper-plane-outline', route: '/pay/send', tab: 'pay' },
  { key: 'holiday', label: 'Holiday', icon: 'airplane-outline', route: '/holidays', tab: null },
];

const BY_GOAL: Record<string, ActionKey> = { ride: 'ride', food: 'food', shop: 'shop', sell: 'sell', stay: 'stay', car: 'car', money: 'money', holiday: 'holiday' };

/** The action for the big button: what they said they'd do most, else their first goal, else Ride. */
export function primaryAction(prefs: { primary?: string; goal?: string } | null | undefined): QuickAction {
  const key = BY_GOAL[prefs?.primary ?? ''] ?? BY_GOAL[prefs?.goal ?? ''] ?? 'ride';
  return ACTIONS.find((a) => a.key === key)!;
}

/** The two side tabs next to the big button: the most used services that aren't the big button. */
export function sideTabs(primary: QuickAction): ('shop' | 'bites' | 'ride' | 'pay' | 'stay' | 'drive')[] {
  const order = ['shop', 'bites', 'ride', 'pay', 'stay', 'drive'] as const;
  return order.filter((t) => t !== primary.tab).slice(0, 2);
}

/** Positions on a half circle above the button (0° = right, 180° = left), in px from its centre. */
export function arcPositions(count: number, radius: number, from = 168, to = 12): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const deg = count === 1 ? 90 : from - ((from - to) * i) / (count - 1);
    const rad = (deg * Math.PI) / 180;
    return { x: Math.round(Math.cos(rad) * radius), y: Math.round(-Math.sin(rad) * radius) };
  });
}

/** Which item the finger (dx, dy from the button centre) is over, or -1. */
export function hitTest(points: { x: number; y: number }[], dx: number, dy: number, within = 40): number {
  let best = -1;
  let bestD = within;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - dx, p.y - dy);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
