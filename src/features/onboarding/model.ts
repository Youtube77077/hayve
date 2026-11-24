import type { IconName } from '../../design/icons';
import type { OnboardingPrefs, ProductCategory, RideCategory, VehicleType } from '../../backend/types';

/**
 * Onboarding before sign-up (Duolingo style). Pure logic, no React: which steps apply,
 * progress, and where each answer takes you. Every question changes what the person sees;
 * the `changes` line on each step says what.
 */

export type Goal = 'ride' | 'food' | 'shop' | 'sell' | 'stay' | 'car' | 'money';
export type EarnRole = 'seller' | 'driver' | 'courier' | 'host' | 'car_owner';
export type Travellers = 1 | 2 | 4;

export interface OnboardingAnswers {
  goal?: Goal;
  country?: string;
  cuisines?: string[];
  shopFor?: ProductCategory[];
  rideType?: RideCategory;
  travellers?: Travellers;
  carType?: VehicleType;
  /** Roles they'd like to earn with. Empty array = "Not now". */
  earn?: EarnRole[];
}

export type StepId = 'intro' | 'goal' | 'country' | 'cuisines' | 'shopFor' | 'sellWhat' | 'rideType' | 'travellers' | 'carType' | 'earn' | 'done';

export interface StepDef {
  id: StepId;
  /** Skip follow-ups that don't apply to earlier answers. */
  applies: (a: OnboardingAnswers) => boolean;
  /** What this answer changes in the app (kept next to the question on purpose). */
  changes: string;
}

export const STEPS: StepDef[] = [
  { id: 'intro', applies: () => true, changes: 'Nothing: a quick hello. Counts as the first, already-done step so progress never starts at zero.' },
  { id: 'goal', applies: () => true, changes: 'Which screen opens after onboarding and what Home shows first.' },
  { id: 'country', applies: () => true, changes: 'Currency, local restaurants/stays/cars, map centre, bank and tax details.' },
  { id: 'cuisines', applies: (a) => a.goal === 'food', changes: 'Bites shows "Picked for you" restaurants with these cuisines first.' },
  { id: 'shopFor', applies: (a) => a.goal === 'shop', changes: 'Shop opens on these categories and shows "Picked for you".' },
  { id: 'sellWhat', applies: (a) => a.goal === 'sell', changes: 'The first listing form starts with this category.' },
  { id: 'rideType', applies: (a) => a.goal === 'ride', changes: 'Which ride type is pre-selected when booking.' },
  { id: 'travellers', applies: (a) => a.goal === 'stay', changes: 'Stay search starts with this number of guests.' },
  { id: 'carType', applies: (a) => a.goal === 'car', changes: 'Drive opens filtered to this kind of car.' },
  { id: 'earn', applies: () => true, changes: 'Home shows a "Start earning" card for these roles; after sign-up we offer the partner setup.' },
  { id: 'done', applies: () => true, changes: 'Shows what we set up, then opens the screen for their goal.' },
];

export function stepsFor(a: OnboardingAnswers): StepId[] {
  return STEPS.filter((s) => s.applies(a)).map((s) => s.id);
}

export function nextStep(a: OnboardingAnswers, current: StepId): StepId {
  const steps = stepsFor(a);
  const i = steps.indexOf(current);
  return steps[Math.min(steps.length - 1, i + 1)] ?? 'done';
}

export function prevStep(a: OnboardingAnswers, current: StepId): StepId | null {
  const steps = stepsFor(a);
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1] : null;
}

/**
 * Progress for the bar: never zero (the hello counts as done), and near the end it says what's left.
 * `value` is 0–1; `label` is "2 steps to go" / "Last step" when two or fewer questions remain.
 */
export function progress(a: OnboardingAnswers, current: StepId): { value: number; label: string | null } {
  if (current === 'done') return { value: 1, label: null };
  const steps: StepId[] = stepsFor(a).filter((s) => s !== 'done');
  const i = Math.max(0, steps.indexOf(current));
  const value = Math.min(0.95, Math.max(0.12, (i + 1) / (steps.length + 1)));
  const remaining = steps.length - i - 1;
  return { value, label: remaining === 0 ? 'Last step' : remaining <= 2 ? `${remaining} step${remaining > 1 ? 's' : ''} to go` : null };
}

export function isAnswered(a: OnboardingAnswers, step: StepId): boolean {
  switch (step) {
    case 'goal':
      return !!a.goal;
    case 'country':
      return !!a.country;
    case 'cuisines':
      return !!a.cuisines?.length;
    case 'shopFor':
    case 'sellWhat':
      return !!a.shopFor?.length;
    case 'rideType':
      return !!a.rideType;
    case 'travellers':
      return !!a.travellers;
    case 'carType':
      return !!a.carType;
    case 'earn':
      return Array.isArray(a.earn);
    default:
      return true;
  }
}

/** Sending money needs an account from the start; everything else can be browsed first. */
export const needsAccountToStart = (a: OnboardingAnswers) => a.goal === 'money';

/** The first screen after onboarding: their goal, ready to use. */
export function landingFor(a: OnboardingAnswers): string {
  switch (a.goal) {
    case 'ride':
      return '/ride';
    case 'food':
      return '/bites';
    case 'shop':
      return a.shopFor?.length === 1 ? `/shop?category=${a.shopFor[0]}` : '/shop';
    case 'sell':
      return '/sell';
    case 'stay':
      return '/stay';
    case 'car':
      return '/drive';
    case 'money':
      return '/pay';
    default:
      return '/';
  }
}

/** The finish button names the benefit, not the work. */
export function landingLabel(a: OnboardingAnswers): string {
  switch (a.goal) {
    case 'ride':
      return 'Find me a ride';
    case 'food':
      return 'Show me food nearby';
    case 'shop':
      return 'Show me things I like';
    case 'sell':
      return 'List my first item';
    case 'stay':
      return 'Find me a place to stay';
    case 'car':
      return 'Show me cars nearby';
    case 'money':
      return 'Set up my Hayve';
    default:
      return 'Take me to Hayve';
  }
}

/* ------------------------------------------------------------ options -- */

export interface Option<K extends string | number> {
  key: K;
  title: string;
  hint?: string;
  icon?: IconName;
}

export const GOALS: Option<Goal>[] = [
  { key: 'food', title: 'Order food', hint: 'Restaurants and groceries', icon: 'fast-food-outline' },
  { key: 'ride', title: 'Get a ride', hint: 'A driver in minutes', icon: 'taxi-outline' },
  { key: 'shop', title: 'Buy things', hint: 'New and second-hand', icon: 'bag-handle-outline' },
  { key: 'sell', title: 'Sell things', hint: 'Earn from what you have', icon: 'pricetag-outline' },
  { key: 'stay', title: 'Book a stay', hint: 'Homes and hotels', icon: 'bed-outline' },
  { key: 'car', title: 'Rent a car', hint: 'By the day', icon: 'car-outline' },
  { key: 'money', title: 'Send money', hint: 'Pay friends, split bills', icon: 'wallet-outline' },
];

export const CUISINES: Option<string>[] = [
  { key: 'Pizza', title: 'Pizza', icon: 'pizza-outline' },
  { key: 'Burgers', title: 'Burgers', icon: 'fast-food-outline' },
  { key: 'Healthy', title: 'Healthy', icon: 'leaf-outline' },
  { key: 'Sushi', title: 'Sushi', icon: 'fish-outline' },
  { key: 'Thai', title: 'Thai and spicy', icon: 'flame-outline' },
  { key: 'Bakery', title: 'Bakery and coffee', icon: 'cafe-outline' },
  { key: 'Groceries', title: 'Groceries', icon: 'basket-outline' },
];

export const SHOP_FOR: Option<ProductCategory>[] = [
  { key: 'fashion', title: 'Clothes and shoes', icon: 'shirt-outline' },
  { key: 'electronics', title: 'Electronics', icon: 'phone-portrait-outline' },
  { key: 'home', title: 'Home and living', icon: 'home-outline' },
  { key: 'accessories', title: 'Bags and accessories', icon: 'watch-outline' },
  { key: 'books', title: 'Books', icon: 'book-outline' },
  { key: 'sport', title: 'Sport', icon: 'barbell-outline' },
  { key: 'collectibles', title: 'Collectibles', icon: 'star-outline' },
];

export const RIDE_TYPES: Option<RideCategory>[] = [
  { key: 'go', title: 'The cheapest', hint: 'Go', icon: 'car-outline' },
  { key: 'comfort', title: 'More comfort', hint: 'Comfort', icon: 'car-sport-outline' },
  { key: 'green', title: 'Electric only', hint: 'Green', icon: 'leaf-outline' },
  { key: 'xl', title: 'Room for more people', hint: 'XL', icon: 'people-outline' },
];

export const TRAVELLERS: Option<Travellers>[] = [
  { key: 1, title: 'Just me', hint: '1 guest', icon: 'person-outline' },
  { key: 2, title: 'Two of us', hint: '2 guests', icon: 'people-outline' },
  { key: 4, title: 'Family or friends', hint: '4 guests', icon: 'home-outline' },
];

export const CAR_TYPES: Option<VehicleType>[] = [
  { key: 'compact', title: 'Small and cheap', hint: 'Compact', icon: 'car-outline' },
  { key: 'suv', title: 'Room for the family', hint: 'SUV', icon: 'car-sport-outline' },
  { key: 'electric', title: 'Electric', hint: 'EV', icon: 'flash-outline' },
  { key: 'van', title: 'Moving things', hint: 'Van', icon: 'bus-outline' },
];

export const EARN: Option<EarnRole>[] = [
  { key: 'seller', title: 'Sell things', icon: 'pricetag-outline' },
  { key: 'driver', title: 'Drive people', icon: 'taxi-outline' },
  { key: 'courier', title: 'Deliver food', icon: 'bicycle-outline' },
  { key: 'host', title: 'Host a place', icon: 'key-outline' },
  { key: 'car_owner', title: 'Rent out my car', icon: 'car-outline' },
];

/** The partner screen for each role, offered after sign-up. */
export const EARN_ROUTE: Record<EarnRole, string> = { seller: '/business/seller', driver: '/business/driver', courier: '/business/courier', host: '/business/host', car_owner: '/business/host' };

/* --------------------------------------------------------- storage -- */

const isGoal = (x: unknown): x is Goal => GOALS.some((g) => g.key === x);

/** Keeps only known values (answers come from device storage). */
export function sanitize(raw: unknown): OnboardingAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pickArr = <T extends string | number>(v: unknown, allowed: Option<T>[]) => (Array.isArray(v) ? v.filter((x): x is T => allowed.some((o) => o.key === x)).slice(0, 8) : undefined);
  return {
    goal: isGoal(r.goal) ? r.goal : undefined,
    country: typeof r.country === 'string' && /^[A-Z]{2}$/.test(r.country) ? r.country : undefined,
    cuisines: pickArr(r.cuisines, CUISINES),
    shopFor: pickArr(r.shopFor, SHOP_FOR),
    rideType: RIDE_TYPES.some((o) => o.key === r.rideType) ? (r.rideType as RideCategory) : undefined,
    travellers: TRAVELLERS.some((o) => o.key === r.travellers) ? (r.travellers as Travellers) : undefined,
    carType: CAR_TYPES.some((o) => o.key === r.carType) ? (r.carType as VehicleType) : undefined,
    earn: pickArr(r.earn, EARN),
  };
}

/** The part of the answers stored on the account at sign-up. */
export function toPrefs(a: OnboardingAnswers): OnboardingPrefs {
  const { country: _c, ...rest } = sanitize(a);
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as OnboardingPrefs;
}
