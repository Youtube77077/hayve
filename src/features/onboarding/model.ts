import type { IconName } from '../../design/icons';
import type { OnboardingPrefs, ProductCategory, RideCategory, VehicleType } from '../../backend/types';

/**
 * Onboarding before sign-up (Duolingo style). Pure logic, no React: which steps apply,
 * progress, and where each answer takes you. Every question changes what the person sees;
 * the `changes` line on each step says what.
 */

export type Goal = 'ride' | 'food' | 'shop' | 'sell' | 'stay' | 'car' | 'money' | 'holiday';
export type EarnRole = 'seller' | 'driver' | 'courier' | 'host' | 'car_owner';
export type Company = 'solo' | 'partner' | 'family' | 'friends';
export type Travellers = 1 | 2 | 4;

export interface OnboardingAddress {
  line1: string;
  city: string;
  postcode: string;
  country: string;
  countryCode: string | null;
  lng?: number;
  lat?: number;
}

export interface OnboardingAnswers {
  /** Everything they'd use Hayve for. */
  interests?: Goal[];
  /** The one they'll do most: the big centre button. */
  primary?: Goal;
  /** Kept equal to `primary` (older screens read `goal`). */
  goal?: Goal;
  country?: string;
  address?: OnboardingAddress;
  company?: Company;
  cuisines?: string[];
  shopFor?: ProductCategory[];
  rideType?: RideCategory;
  travellers?: Travellers;
  carType?: VehicleType;
  /** Roles they'd like to earn with. Empty array = "Not now". */
  earn?: EarnRole[];
}

export type StepId = 'intro' | 'interests' | 'primary' | 'location' | 'cuisines' | 'shopFor' | 'sellWhat' | 'rideType' | 'carType' | 'company' | 'earn' | 'done';

export interface StepDef {
  id: StepId;
  /** Skip follow-ups that don't apply to earlier answers. */
  applies: (a: OnboardingAnswers) => boolean;
  /** What this answer changes in the app (kept next to the question on purpose). */
  changes: string;
}

const top = (a: OnboardingAnswers) => a.primary ?? a.interests?.[0];

export const STEPS: StepDef[] = [
  { id: 'intro', applies: () => true, changes: 'Nothing: a quick hello. Counts as the first, already-done step so progress never starts at zero.' },
  { id: 'interests', applies: () => true, changes: 'Which services Home shows first and which actions sit in the centre button menu.' },
  { id: 'primary', applies: (a) => (a.interests?.length ?? 0) > 1, changes: 'The big centre button in the bottom bar and the screen that opens after onboarding.' },
  { id: 'location', applies: () => true, changes: 'Delivery address, ride pickup, nearby restaurants/stays/cars, currency and tax.' },
  { id: 'cuisines', applies: (a) => top(a) === 'food', changes: 'Bites shows "Picked for you" restaurants with these cuisines first.' },
  { id: 'shopFor', applies: (a) => top(a) === 'shop', changes: 'Shop opens on these categories and shows "Picked for you".' },
  { id: 'sellWhat', applies: (a) => top(a) === 'sell', changes: 'The first listing form starts with this category.' },
  { id: 'rideType', applies: (a) => top(a) === 'ride', changes: 'Which ride type is pre-selected when booking.' },
  { id: 'carType', applies: (a) => top(a) === 'car', changes: 'Drive opens filtered to this kind of car.' },
  { id: 'company', applies: () => true, changes: 'Guests for stays and holidays, bigger cars and rides for families, bill splitting offered for friends.' },
  { id: 'earn', applies: () => true, changes: 'Home shows a "Start earning" card for these roles; after sign-up we offer the partner setup.' },
  { id: 'done', applies: () => true, changes: 'Says they are set, then opens the screen for what they do most.' },
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
    case 'interests':
      return !!a.interests?.length;
    case 'primary':
      return !!a.primary && !!a.interests?.includes(a.primary);
    case 'location':
      return !!a.country;
    case 'cuisines':
      return !!a.cuisines?.length;
    case 'shopFor':
    case 'sellWhat':
      return !!a.shopFor?.length;
    case 'rideType':
      return !!a.rideType;
    case 'carType':
      return !!a.carType;
    case 'company':
      return !!a.company;
    case 'earn':
      return Array.isArray(a.earn);
    default:
      return true;
  }
}

/** Picking interests: the first pick is the big button until they choose otherwise. */
export function withInterests(a: OnboardingAnswers, interests: Goal[]): Partial<OnboardingAnswers> {
  const primary = a.primary && interests.includes(a.primary) ? a.primary : interests[0];
  return { interests, primary, goal: primary };
}

/** "Who do you usually do things with?" also sets the guests for stays and holidays. */
export const TRAVELLERS_FOR: Record<Company, Travellers> = { solo: 1, partner: 2, family: 4, friends: 4 };

/** Sending money needs an account from the start; everything else can be browsed first. */
export const needsAccountToStart = (a: OnboardingAnswers) => top(a) === 'money';

/** The first screen after onboarding: what they do most, ready to use. */
export function landingFor(a: OnboardingAnswers): string {
  switch (top(a)) {
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
    case 'holiday':
      return '/holidays';
    default:
      return '/';
  }
}

/** Card titles on Home name the benefit, not the work. */
export function landingLabel(a: OnboardingAnswers): string {
  switch (top(a)) {
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
      return 'Send money to a friend';
    case 'holiday':
      return 'Show me holidays';
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
  { key: 'food', title: 'Ordering food', hint: 'Restaurants and groceries', icon: 'fast-food-outline' },
  { key: 'ride', title: 'Getting around', hint: 'Rides in minutes', icon: 'taxi-outline' },
  { key: 'shop', title: 'Finding good deals', hint: 'New and second-hand', icon: 'bag-handle-outline' },
  { key: 'sell', title: 'Selling my stuff', hint: 'Turn it into money', icon: 'pricetag-outline' },
  { key: 'holiday', title: 'Going on holiday', hint: 'Flights and hotel', icon: 'airplane-outline' },
  { key: 'stay', title: 'Weekend trips', hint: 'Homes and hotels', icon: 'bed-outline' },
  { key: 'car', title: 'Road trips', hint: 'Rent a car', icon: 'car-outline' },
  { key: 'money', title: 'Paying friends back', hint: 'Send and split', icon: 'wallet-outline' },
];

export const COMPANY: Option<Company>[] = [
  { key: 'solo', title: 'Mostly just me', icon: 'person-outline' },
  { key: 'partner', title: 'Me and my partner', icon: 'people-outline' },
  { key: 'family', title: 'The whole family', icon: 'home-outline' },
  { key: 'friends', title: 'A group of friends', icon: 'people-outline' },
];

export const CUISINES: Option<string>[] = [
  { key: 'Pizza', title: 'Pizza', icon: 'pizza-outline' },
  { key: 'Burgers', title: 'Burgers', icon: 'fast-food-outline' },
  { key: 'Healthy', title: 'Healthy', icon: 'leaf-outline' },
  { key: 'Sushi', title: 'Sushi', icon: 'fish-outline' },
  { key: 'Thai', title: 'Spicy', icon: 'flame-outline' },
  { key: 'Bakery', title: 'Coffee and cake', icon: 'cafe-outline' },
  { key: 'Groceries', title: 'Groceries', icon: 'basket-outline' },
];

export const SHOP_FOR: Option<ProductCategory>[] = [
  { key: 'fashion', title: 'Clothes and shoes', icon: 'shirt-outline' },
  { key: 'electronics', title: 'Tech', icon: 'phone-portrait-outline' },
  { key: 'home', title: 'Home', icon: 'home-outline' },
  { key: 'accessories', title: 'Bags and watches', icon: 'watch-outline' },
  { key: 'books', title: 'Books', icon: 'book-outline' },
  { key: 'sport', title: 'Sport', icon: 'barbell-outline' },
  { key: 'collectibles', title: 'Collectibles', icon: 'star-outline' },
];

export const RIDE_TYPES: Option<RideCategory>[] = [
  { key: 'go', title: 'Cheapest', icon: 'car-outline' },
  { key: 'comfort', title: 'Comfy', icon: 'car-sport-outline' },
  { key: 'green', title: 'Electric', icon: 'leaf-outline' },
  { key: 'xl', title: 'Big car', icon: 'people-outline' },
];

export const CAR_TYPES: Option<VehicleType>[] = [
  { key: 'compact', title: 'Small and cheap', icon: 'car-outline' },
  { key: 'suv', title: 'Room for everyone', icon: 'car-sport-outline' },
  { key: 'electric', title: 'Electric', icon: 'flash-outline' },
  { key: 'van', title: 'Moving stuff', icon: 'bus-outline' },
];

export const TRAVELLERS: Option<Travellers>[] = [
  { key: 1, title: 'Just me', icon: 'person-outline' },
  { key: 2, title: 'Two of us', icon: 'people-outline' },
  { key: 4, title: 'Family or friends', icon: 'home-outline' },
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

const inOpts = <T extends string | number>(v: unknown, allowed: Option<T>[]): v is T => allowed.some((o) => o.key === v);

/** Keeps only known values (answers come from device storage). */
export function sanitize(raw: unknown): OnboardingAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pickArr = <T extends string | number>(v: unknown, allowed: Option<T>[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => inOpts(x, allowed)))].slice(0, 8) : undefined);
  const interests = pickArr(r.interests, GOALS);
  const primary = inOpts(r.primary, GOALS) ? r.primary : inOpts(r.goal, GOALS) ? r.goal : undefined;
  const ad = r.address as Record<string, unknown> | undefined;
  const address =
    ad && typeof ad.line1 === 'string' && typeof ad.city === 'string'
      ? { line1: ad.line1.slice(0, 120), city: ad.city.slice(0, 80), postcode: String(ad.postcode ?? '').slice(0, 16), country: String(ad.country ?? '').slice(0, 60), countryCode: typeof ad.countryCode === 'string' ? ad.countryCode : null, lng: typeof ad.lng === 'number' ? ad.lng : undefined, lat: typeof ad.lat === 'number' ? ad.lat : undefined }
      : undefined;
  return {
    interests,
    primary,
    goal: primary,
    country: typeof r.country === 'string' && /^[A-Z]{2}$/.test(r.country) ? r.country : undefined,
    address,
    company: inOpts(r.company, COMPANY) ? r.company : undefined,
    cuisines: pickArr(r.cuisines, CUISINES),
    shopFor: pickArr(r.shopFor, SHOP_FOR),
    rideType: inOpts(r.rideType, RIDE_TYPES) ? r.rideType : undefined,
    travellers: inOpts(r.travellers, TRAVELLERS) ? r.travellers : undefined,
    carType: inOpts(r.carType, CAR_TYPES) ? r.carType : undefined,
    earn: pickArr(r.earn, EARN),
  };
}

/** The part of the answers stored on the account at sign-up (address and country go to the profile). */
export function toPrefs(a: OnboardingAnswers): OnboardingPrefs {
  const { country: _c, address: _a, ...rest } = sanitize(a);
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as OnboardingPrefs;
}
