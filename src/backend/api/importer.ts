import { ensureAccount } from '../ledger';
import { convert, type CurrencyCode, REGIONS } from '../regions';
import { simHash } from '../store';
import { commit, getDb, now, uid } from '../store';
import type { HolidayBoard, ID, MenuItem, ProductCategory, PropertyType, VehicleType } from '../types';
import { defaultProfile } from '../seed';
import { requireAdmin } from './session';

/**
 * Admin import for demos: turns pages the admin pasted (read on the device or by the Hayve API)
 * into listings in the right service. Everything imported is tagged and can be removed in one go.
 */
export type ImportKind = 'shop' | 'stay' | 'drive' | 'bites' | 'holiday';

export interface ImportItem {
  kind: ImportKind;
  url: string;
  site: string;
  title: string;
  description: string;
  images: string[];
  priceCents: number | null;
  currency: string | null;
  brand?: string;
  /** Where to place it (admin's choice, or from the page). */
  city: string;
  country?: string;
  lat?: number;
  lng?: number;
  cuisine?: string;
  rating?: number;
  reviewCount?: number;
}

const CURRENCIES: CurrencyCode[] = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];
/** Page price → base cents (USD). Unknown currencies are treated as euros, the most common case. */
function toBase(cents: number | null, currency: string | null, fallback: number) {
  if (!cents || cents <= 0) return fallback;
  const c = (CURRENCIES as string[]).includes(currency ?? '') ? (currency as CurrencyCode) : currency ? 'EUR' : 'USD';
  return convert(cents, c, 'USD');
}

/** One seller account per source site (shown as the seller, so the source is clear). */
function sourceAccount(site: string, kind: ImportKind): ID {
  const db = getDb();
  const slug = site.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'import';
  const id = `u_imp_${slug}`;
  if (!db.users.some((u) => u.id === id)) {
    db.users.push({ id, email: `${slug}@import.hayve.invalid`, passwordHash: simHash(uid('x')), roles: ['customer', 'seller', 'host', 'kitchen'], emailVerified: true, createdAt: now() });
    db.profiles.push({ ...defaultProfile(id, `imp_${slug}`.slice(0, 20), site), accountType: 'business', bio: `Listings imported from ${site} for a demo.` });
    ensureAccount(id);
  } else {
    const u = db.users.find((x) => x.id === id)!;
    if (kind === 'bites' && !u.roles.includes('kitchen')) u.roles.push('kitchen');
  }
  return id;
}

const CATEGORY: [RegExp, ProductCategory][] = [
  [/shirt|dress|jacket|coat|jeans|sneaker|shoe|boot|hoodie|sweater|skirt|trousers|pants|top\b/i, 'fashion'],
  [/iphone|phone|laptop|macbook|camera|headphone|console|playstation|xbox|nintendo|tablet|ipad|speaker|watch\b|airpods/i, 'electronics'],
  [/sofa|chair|table|lamp|vase|mirror|rug|plant|kitchen|bed\b|desk/i, 'home'],
  [/bag|wallet|sunglasses|jewel|necklace|ring|belt|scarf/i, 'accessories'],
  [/book|novel|comic/i, 'books'],
  [/bike|bicycle|racket|ball|yoga|golf|ski|surf|fitness/i, 'sport'],
  [/vintage|retro|collect|card|lego|vinyl|record/i, 'collectibles'],
];
const categoryFor = (text: string): ProductCategory => CATEGORY.find(([re]) => re.test(text))?.[1] ?? 'general';

const DISHES: Record<string, [string, number][]> = {
  pizza: [['Margherita', 1200], ['Pepperoni', 1450], ['Garlic bread', 650], ['Tiramisu', 700]],
  sushi: [['Salmon nigiri set', 1600], ['Spicy tuna roll', 1100], ['Miso soup', 450], ['Edamame', 500]],
  burger: [['Classic burger', 1300], ['Cheeseburger', 1400], ['Fries', 500], ['Milkshake', 600]],
  default: [["Chef's special", 1600], ['House salad', 1100], ['Soup of the day', 750], ['Dessert', 700]],
};

export function importListings(items: ImportItem[]) {
  requireAdmin();
  const db = getDb();
  const at = now();
  const counts: Record<ImportKind, number> = { shop: 0, stay: 0, drive: 0, bites: 0, holiday: 0 };
  for (const it of items.slice(0, 200)) {
    if (!it.title?.trim() || !/^https?:\/\//.test(it.url)) continue;
    const owner = sourceAccount(it.site || 'web', it.kind);
    const region = REGIONS.find((r) => r.city.name.toLowerCase() === it.city.toLowerCase()) ?? REGIONS[0];
    const lat = it.lat ?? region.city.lat + (Math.random() - 0.5) * 0.06;
    const lng = it.lng ?? region.city.lng + (Math.random() - 0.5) * 0.08;
    const tag = { url: it.url, site: it.site, at };
    const title = it.title.trim().slice(0, 120);
    const description = it.description?.trim().slice(0, 600) || title;
    const images = it.images.slice(0, 8);
    if (it.kind === 'shop') {
      db.products.push({ id: uid('p'), sellerId: owner, title, description, priceCents: toBase(it.priceCents, it.currency, 2500), category: categoryFor(`${title} ${description}`), condition: 'very_good', brand: it.brand, images, quantity: 1, status: 'active', location: it.city, createdAt: at, imported: tag });
    } else if (it.kind === 'stay') {
      const type: PropertyType = /room/i.test(title) ? 'room' : /house|villa|cottage|cabin/i.test(title) ? 'house' : /studio/i.test(title) ? 'studio' : 'apartment';
      db.properties.push({ id: uid('st'), hostId: owner, title, type, city: it.city, country: it.country ?? region.name, neighbourhood: it.city, description, pricePerNightCents: toBase(it.priceCents, it.currency, 14000), cleaningFeeCents: 0, guests: type === 'house' ? 6 : type === 'room' ? 2 : 4, bedrooms: type === 'house' ? 3 : 1, beds: type === 'house' ? 4 : 2, baths: 1, amenities: ['Wi-Fi', 'Kitchen', 'Heating'], images, rating: it.rating ?? 4.8, reviewCount: it.reviewCount ?? 24, instantBook: true, listed: true, blockedDates: [], createdAt: at, imported: tag });
    } else if (it.kind === 'drive') {
      const [make, ...rest] = title.split(/\s+/);
      const type: VehicleType = /tesla|electric|ev\b|e-/i.test(title) ? 'electric' : /suv|x5|rav4|tiguan|qashqai/i.test(title) ? 'suv' : /van|transit|vito/i.test(title) ? 'van' : 'compact';
      db.vehicles.push({ id: uid('v'), hostId: owner, make: make ?? 'Car', model: rest.join(' ').slice(0, 40) || title, year: new Date(at).getFullYear() - 1, type, seats: type === 'van' ? 8 : 5, doors: 5, transmission: 'automatic', fuel: type === 'electric' ? 'electric' : 'petrol', pricePerDayCents: toBase(it.priceCents, it.currency, 6000), images, location: it.city, features: ['Bluetooth', 'Navigation'], requirements: { minAge: 21, licenseYears: 1, depositCents: 30000 }, rating: it.rating ?? 4.8, trips: it.reviewCount ?? 12, blockedDates: [], listed: true, createdAt: at, imported: tag });
    } else if (it.kind === 'bites') {
      const id = uid('rs');
      const key = /pizza/i.test(`${title} ${it.cuisine}`) ? 'pizza' : /sushi|japan/i.test(`${title} ${it.cuisine}`) ? 'sushi' : /burger/i.test(`${title} ${it.cuisine}`) ? 'burger' : 'default';
      db.restaurants.push({ id, ownerId: owner, name: title, cuisine: it.cuisine ?? 'Restaurant', description, image: images[0] ?? '', logoColor: '#0E0E10', rating: it.rating ?? 4.6, ratingCount: it.reviewCount ?? 120, deliveryFeeCents: 199, minOrderCents: 1000, etaMin: 30, priceLevel: 2, tags: it.cuisine ? [it.cuisine] : [], address: it.city, city: it.city, isOpen: true, isGrocery: false, createdAt: at, imported: tag });
      DISHES[key].forEach(([name, cents], i) => {
        const m: MenuItem = { id: uid('mi'), restaurantId: id, name, description: '', priceCents: cents, category: i < 2 ? 'Popular' : 'Sides and desserts', available: true, popular: i === 0, options: [] };
        db.menuItems.push(m);
      });
    } else {
      const board: HolidayBoard = /all[- ]?inclusive/i.test(`${title} ${description}`) ? 'all_inclusive' : /half[- ]?board/i.test(`${title} ${description}`) ? 'half_board' : 'breakfast';
      const t0 = new Date(at);
      const departures = [1, 2, 3, 4, 6, 8].map((w) => {
        const d = new Date(t0.getTime() + w * 7 * 86_400_000);
        d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
        return d.toISOString().slice(0, 10);
      });
      (db.holidays ??= []).push({ id: uid('hol'), partnerId: owner, partnerName: it.site, title, hotel: title, city: it.city, country: it.country ?? region.name, lng, lat, airport: { name: `${it.city} Airport`, lng: lng + 0.08, lat: lat + 0.05 }, nights: 7, board, includes: ['Return flights', 'Hotel', 'Airport transfers'], highlights: [description.slice(0, 120)], places: [], pricePerPersonCents: toBase(it.priceCents, it.currency, 89900), departures, images, rating: it.rating ?? 4.6, reviewCount: it.reviewCount ?? 80, tags: board === 'all_inclusive' ? ['Beach'] : [], createdAt: at, imported: tag });
    }
    counts[it.kind] += 1;
  }
  commit();
  return counts;
}

export function importedCounts() {
  requireAdmin();
  const db = getDb();
  return {
    shop: db.products.filter((x) => x.imported).length,
    stay: db.properties.filter((x) => x.imported).length,
    drive: db.vehicles.filter((x) => x.imported).length,
    bites: db.restaurants.filter((x) => x.imported).length,
    holiday: (db.holidays ?? []).filter((x) => x.imported).length,
  };
}

/** Removes every imported listing (and its menu items). Orders already placed stay in the history. */
export function removeImported() {
  requireAdmin();
  const db = getDb();
  const rs = new Set(db.restaurants.filter((r) => r.imported).map((r) => r.id));
  db.products = db.products.filter((x) => !x.imported);
  db.properties = db.properties.filter((x) => !x.imported);
  db.vehicles = db.vehicles.filter((x) => !x.imported);
  db.restaurants = db.restaurants.filter((x) => !x.imported);
  db.menuItems = db.menuItems.filter((m) => !rs.has(m.restaurantId));
  db.holidays = (db.holidays ?? []).filter((x) => !x.imported);
  commit();
}
