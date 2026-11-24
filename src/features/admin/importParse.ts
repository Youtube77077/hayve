/**
 * Admin import for demos: reads the preview data a web page publishes about itself (schema.org
 * JSON-LD and Open Graph tags, the same data link previews use) and turns it into a Hayve listing.
 * Pure functions, tested in tests/import.test.ts.
 */
export type ImportKind = 'shop' | 'stay' | 'drive' | 'bites' | 'holiday';

export interface ParsedListing {
  url: string;
  site: string;
  kind: ImportKind;
  title: string;
  description: string;
  images: string[];
  /** Price in the page's currency, in cents (null when the page doesn't say). */
  priceCents: number | null;
  currency: string | null;
  brand?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  cuisine?: string;
  rating?: number;
  reviewCount?: number;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .trim();

export function siteOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const SITE_KIND: [RegExp, ImportKind][] = [
  [/airbnb\.|booking\.com|vrbo\.|expedia\..*hotel|hotels\.com|tripadvisor\..*Hotel/i, 'stay'],
  [/tui\.|jet2holidays|loveholidays|onthebeach|sunweb|corendon|holidaycheck|lastminute/i, 'holiday'],
  [/ubereats|deliveroo|thuisbezorgd|justeat|just-eat|doordash|grubhub|wolt\.|lieferando|opentable|thefork/i, 'bites'],
  [/hertz\.|sixt\.|europcar|enterprise\.|avis\.|budget\.|turo\.|getaround|rentalcars/i, 'drive'],
  [/vinted\.|ebay\.|etsy\.|marktplaats|depop\.|amazon\.|facebook\.com\/marketplace|bol\.com|zalando/i, 'shop'],
];

const TYPE_KIND: [RegExp, ImportKind][] = [
  [/^(Restaurant|FoodEstablishment|CafeOrCoffeeShop|Bakery|BarOrPub|FastFoodRestaurant)$/i, 'bites'],
  [/^(Hotel|LodgingBusiness|VacationRental|Accommodation|Apartment|House|Resort|BedAndBreakfast|Hostel)$/i, 'stay'],
  [/^(TouristTrip|Trip|TravelAction|Vacation|PackageTour)$/i, 'holiday'],
  [/^(Car|Vehicle|AutoRental|RentalCarReservation)$/i, 'drive'],
  [/^(Product|IndividualProduct|ProductModel|Offer)$/i, 'shop'],
];

export function guessKind(url: string, types: string[] = []): ImportKind {
  for (const t of types) for (const [re, k] of TYPE_KIND) if (re.test(t)) return k;
  for (const [re, k] of SITE_KIND) if (re.test(url)) return k;
  return 'shop';
}

type Json = Record<string, unknown>;

function jsonLd(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const v = JSON.parse(m[1].trim());
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === 'object') {
          const o = x as Json;
          if (o['@graph']) walk(o['@graph']);
          out.push(o);
        }
      };
      walk(v);
    } catch {
      /* broken JSON-LD: ignore */
    }
  }
  return out;
}

function meta(html: string, key: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[:.]/g, '\\$&')}["'][^>]*>`, 'gi');
  for (const tag of html.match(re) ?? []) {
    const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (c) out.push(decode(c));
  }
  return out;
}

const types = (o: Json) => (Array.isArray(o['@type']) ? (o['@type'] as string[]) : o['@type'] ? [String(o['@type'])] : []);
const str = (v: unknown) => (typeof v === 'string' ? decode(v) : typeof v === 'number' ? String(v) : undefined);
const imgs = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(imgs) : typeof v === 'string' ? [v] : v && typeof v === 'object' ? [str((v as Json).url) ?? str((v as Json).contentUrl) ?? ''].filter(Boolean) : []);

/** "1.299,00" / "1,299.00" / "€ 45" → cents. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === 'number') return Math.round(v * 100);
  if (typeof v !== 'string') return null;
  const s = v.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let n: number;
  if (lastComma > lastDot) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Reads one listing page. Returns null when the page has no usable title. */
export function extractListing(html: string, url: string): ParsedListing | null {
  const ld = jsonLd(html);
  const main = ld.find((o) => types(o).some((t) => TYPE_KIND.some(([re]) => re.test(t)))) ?? null;
  const offer = (main?.offers ? (Array.isArray(main.offers) ? (main.offers[0] as Json) : (main.offers as Json)) : null) ?? ld.find((o) => types(o).includes('Offer')) ?? null;
  const addr = (main?.address as Json | undefined) ?? undefined;
  const geo = (main?.geo as Json | undefined) ?? undefined;
  const rating = (main?.aggregateRating as Json | undefined) ?? undefined;
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = str(main?.name) ?? meta(html, 'og:title')[0] ?? meta(html, 'twitter:title')[0] ?? (titleTag ? decode(titleTag) : undefined);
  if (!title) return null;
  const images = [...new Set([...imgs(main?.image), ...meta(html, 'og:image'), ...meta(html, 'og:image:url'), ...meta(html, 'twitter:image')])]
    .map((i) => {
      try {
        return new URL(i, url).toString();
      } catch {
        return '';
      }
    })
    .filter((i) => /^https?:\/\//.test(i))
    .slice(0, 8);
  const priceCents = parsePrice(offer?.price ?? offer?.lowPrice ?? meta(html, 'product:price:amount')[0] ?? meta(html, 'og:price:amount')[0]);
  const currency = str(offer?.priceCurrency) ?? meta(html, 'product:price:currency')[0] ?? meta(html, 'og:price:currency')[0] ?? null;
  const brand = main?.brand ? str((main.brand as Json).name) ?? str(main.brand) : undefined;
  return {
    url,
    site: str(main?.provider && (main.provider as Json).name) ?? meta(html, 'og:site_name')[0] ?? siteOf(url),
    kind: guessKind(url, main ? types(main) : []),
    title: title.replace(/\s*[|·–-]\s*(Vinted|eBay|Airbnb|TUI|Booking\.com|Etsy|Deliveroo|Uber Eats).*$/i, '').slice(0, 120),
    description: (str(main?.description) ?? meta(html, 'og:description')[0] ?? meta(html, 'description')[0] ?? '').slice(0, 600),
    images,
    priceCents,
    currency: currency ? currency.toUpperCase() : null,
    brand,
    city: str(addr?.addressLocality),
    country: str(addr?.addressCountry && typeof addr.addressCountry === 'object' ? (addr.addressCountry as Json).name : addr?.addressCountry),
    lat: geo ? Number(geo.latitude) || undefined : undefined,
    lng: geo ? Number(geo.longitude) || undefined : undefined,
    cuisine: str(Array.isArray(main?.servesCuisine) ? (main!.servesCuisine as string[])[0] : main?.servesCuisine),
    rating: rating ? Number(rating.ratingValue) || undefined : undefined,
    reviewCount: rating ? Number(rating.reviewCount ?? rating.ratingCount) || undefined : undefined,
  };
}

/** Listing links on a search or category page (so one page link can bring in many listings). */
const LINK_PATTERNS: RegExp[] = [/\/items\/\d+/, /\/itm\/\d+/, /\/rooms\/\d+/, /\/listing\/\d+/, /\/hotel\/[a-z]{2}\//, /\/hotels?\/[\w-]+/, /\/holidays?\/[\w-]+\/[\w-]+/, /\/(menu|store|restaurant)s?\/[\w-]+/, /\/(product|p|dp)\/[\w-]+/];

export function extractLinks(html: string, pageUrl: string, max = 50): string[] {
  const out = new Set<string>();
  for (const o of jsonLd(html)) {
    if (!types(o).includes('ItemList')) continue;
    for (const el of (o.itemListElement as Json[] | undefined) ?? []) {
      const u = str(el.url) ?? str((el.item as Json | undefined)?.url) ?? str(el.item);
      if (u) out.add(new URL(u, pageUrl).toString());
    }
  }
  const host = siteOf(pageUrl);
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (out.size >= max) break;
    let u: URL;
    try {
      u = new URL(decode(m[1]), pageUrl);
    } catch {
      continue;
    }
    if (siteOf(u.toString()) !== host || u.toString() === pageUrl) continue;
    if (LINK_PATTERNS.some((re) => re.test(u.pathname))) out.add(`${u.origin}${u.pathname}`);
  }
  return [...out].slice(0, max);
}
