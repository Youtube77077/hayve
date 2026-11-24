import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../src/backend/api';
import { OWNER_ADMIN_EMAILS, SIM_CODE } from '../src/backend/config';
import { createSeedDatabase } from '../src/backend/seed';
import { attachStorage, getDb } from '../src/backend/store';
import { extractLinks, extractListing, guessKind, parsePrice } from '../src/features/admin/importParse';

beforeEach(() => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
});

const productPage = `<html><head><title>Leather jacket | Vinted</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Vintage leather jacket","image":["https://img.example/1.jpg","https://img.example/2.jpg"],"description":"Size M, worn twice","brand":{"@type":"Brand","name":"Levi's"},"offers":{"@type":"Offer","price":"1.299,00","priceCurrency":"EUR"}}</script>
</head><body></body></html>`;
const ogPage = `<html><head><meta property="og:title" content="Sunny loft in Lisbon &amp; terrace"><meta property="og:image" content="/photos/loft.jpg"><meta property="og:description" content="Two bedrooms"><meta property="og:site_name" content="Airbnb"></head></html>`;
const hotelPage = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite","name":"x"},{"@type":"Hotel","name":"Playa Resort","image":{"url":"https://img.example/h.jpg"},"address":{"addressLocality":"Cancún","addressCountry":"MX"},"geo":{"latitude":21.1,"longitude":-86.75},"aggregateRating":{"ratingValue":"4.6","reviewCount":"1200"}}]}</script>`;
const restaurantPage = `<script type="application/ld+json">{"@type":"Restaurant","name":"Luigi's Pizza","servesCuisine":["Pizza","Italian"],"image":"https://img.example/r.jpg"}</script>`;
const searchPage = `<a href="/items/123-jacket">a</a><a href="/items/456-shoes?ref=x">b</a><a href="/help">c</a><a href="https://other.site/items/9">d</a><a href="/items/123-jacket">dup</a>`;
const listPage = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"url":"https://shop.example/p/one"},{"item":{"url":"/p/two"}}]}</script>`;

describe('reading pages for the admin import', () => {
  it('reads products from schema.org data, with price, currency, brand and photos', () => {
    const p = extractListing(productPage, 'https://www.vinted.com/items/1')!;
    expect(p.title).toBe('Vintage leather jacket');
    expect(p.kind).toBe('shop');
    expect(p.priceCents).toBe(129900);
    expect(p.currency).toBe('EUR');
    expect(p.brand).toBe("Levi's");
    expect(p.images).toEqual(['https://img.example/1.jpg', 'https://img.example/2.jpg']);
  });

  it('falls back to link-preview tags and makes image links absolute', () => {
    const p = extractListing(ogPage, 'https://www.airbnb.com/rooms/42')!;
    expect(p.title).toBe('Sunny loft in Lisbon & terrace');
    expect(p.kind).toBe('stay');
    expect(p.images[0]).toBe('https://www.airbnb.com/photos/loft.jpg');
    expect(p.site).toBe('Airbnb');
    expect(p.priceCents).toBeNull();
  });

  it('reads hotels and restaurants, including location, rating and cuisine', () => {
    const h = extractListing(hotelPage, 'https://example-travel.com/hotel/1')!;
    expect(h.kind).toBe('stay');
    expect(h.city).toBe('Cancún');
    expect(h.lat).toBe(21.1);
    expect(h.rating).toBe(4.6);
    expect(h.reviewCount).toBe(1200);
    const r = extractListing(restaurantPage, 'https://luigis.example')!;
    expect(r.kind).toBe('bites');
    expect(r.cuisine).toBe('Pizza');
    expect(extractListing('<html></html>', 'https://x.example')).toBeNull();
  });

  it('guesses the service from the site when the page doesn’t say', () => {
    expect(guessKind('https://www.tui.co.uk/destinations/spain/hotel')).toBe('holiday');
    expect(guessKind('https://www.sixt.com/rent/x')).toBe('drive');
    expect(guessKind('https://deliveroo.co.uk/menu/x')).toBe('bites');
    expect(guessKind('https://www.ebay.com/itm/1')).toBe('shop');
  });

  it('parses prices written the European or American way', () => {
    expect(parsePrice('1.299,00')).toBe(129900);
    expect(parsePrice('1,299.00')).toBe(129900);
    expect(parsePrice('€ 45')).toBe(4500);
    expect(parsePrice(19.5)).toBe(1950);
    expect(parsePrice('free')).toBeNull();
  });

  it('finds listing links on a search page (same site, no duplicates)', () => {
    expect(extractLinks(searchPage, 'https://www.vinted.com/catalog?q=jacket')).toEqual(['https://www.vinted.com/items/123-jacket', 'https://www.vinted.com/items/456-shoes']);
    expect(extractLinks(listPage, 'https://shop.example/c/all')).toEqual(['https://shop.example/p/one', 'https://shop.example/p/two']);
    expect(extractLinks(searchPage, 'https://www.vinted.com/catalog', 1)).toHaveLength(1);
  });
});

describe('admin import into the app', () => {
  const item = (kind: 'shop' | 'stay' | 'drive' | 'bites' | 'holiday', title: string) => ({ kind, url: `https://source.example/${kind}`, site: 'source.example', title, description: 'From the page', images: ['https://img.example/a.jpg'], priceCents: 5000, currency: 'EUR', city: 'London' });

  it('is admin only', () => {
    expect(() => api.importer.importListings([item('shop', 'Lamp')])).toThrow();
  });

  it('adds listings to every service, findable like any other, and removes them in one go', () => {
    api.session.signUp({ email: OWNER_ADMIN_EMAILS[0], password: 'correct-horse', displayName: 'Hayve Owner', username: 'owner' });
    api.session.verifyEmail(SIM_CODE);
    api.session.enableTwoFactor(SIM_CODE);
    const before = api.shop.listProducts({}).length;
    const c = api.importer.importListings([item('shop', 'Desk lamp'), item('stay', 'Shoreditch loft'), item('drive', 'Tesla Model 3'), item('bites', "Luigi's Pizza"), item('holiday', 'Cancún all inclusive resort')]);
    expect(c).toEqual({ shop: 1, stay: 1, drive: 1, bites: 1, holiday: 1 });
    expect(api.shop.listProducts({}).length).toBe(before + 1);
    const lamp = getDb().products.find((p) => p.title === 'Desk lamp')!;
    expect(lamp.imported?.site).toBe('source.example');
    expect(lamp.priceCents).toBeGreaterThan(0);
    expect(getDb().vehicles.find((v) => v.make === 'Tesla')?.type).toBe('electric');
    expect(getDb().holidays!.find((h) => h.title.startsWith('Cancún'))?.board).toBe('all_inclusive');
    const rest = getDb().restaurants.find((r) => r.name === "Luigi's Pizza")!;
    expect(getDb().menuItems.filter((m) => m.restaurantId === rest.id).length).toBeGreaterThan(0);
    expect(api.importer.importedCounts()).toEqual({ shop: 1, stay: 1, drive: 1, bites: 1, holiday: 1 });
    api.importer.removeImported();
    expect(api.importer.importedCounts()).toEqual({ shop: 0, stay: 0, drive: 0, bites: 0, holiday: 0 });
    expect(getDb().menuItems.some((m) => m.restaurantId === rest.id)).toBe(false);
  });
});
