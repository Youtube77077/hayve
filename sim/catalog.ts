/**
 * Example supply for the simulation ONLY (never shipped in the app): restaurants with menus,
 * products, cars and stays in every Hayve region city, owned by example business accounts.
 * Prices are in base cents (USD), like everything in the ledger.
 */
import * as api from '../src/backend/api';
import { REGIONS } from '../src/backend/regions';
import { getDb } from '../src/backend/store';
import type { MenuItem, Product, ProductCategory, ProductCondition, PropertyType, VehicleType } from '../src/backend/types';

const NEIGHBOURHOODS: Record<string, string[]> = {
  'New York': ['Midtown', 'Harlem', 'Astoria', 'Park Slope', 'Upper West Side'],
  Toronto: ['Kensington Market', 'Yorkville', 'Leslieville', 'The Annex', 'Liberty Village'],
  London: ['Camden', 'Peckham', 'Notting Hill', 'Islington', 'Brixton'],
  Dublin: ['Rathmines', 'Smithfield', 'Ranelagh', 'Portobello', 'Docklands'],
  Amsterdam: ['De Pijp', 'Oost', 'Noord', 'Westerpark', 'Jordaan'],
  Berlin: ['Kreuzberg', 'Prenzlauer Berg', 'Neukölln', 'Mitte', 'Friedrichshain'],
  Paris: ['Belleville', 'Montmartre', 'Bastille', 'Canal Saint-Martin', 'Batignolles'],
  Brussels: ['Ixelles', 'Saint-Gilles', 'Sablon', 'Etterbeek', 'Flagey'],
  Madrid: ['Malasaña', 'Lavapiés', 'Chamberí', 'La Latina', 'Salamanca'],
  Rome: ['Trastevere', 'Monti', 'Testaccio', 'Prati', 'Pigneto'],
  Lisbon: ['Alfama', 'Príncipe Real', 'Cais do Sodré', 'Graça', 'Campo de Ourique'],
  Sydney: ['Surry Hills', 'Bondi', 'Newtown', 'Paddington', 'Manly'],
};

type Dish = [name: string, usd: number, category: string, required?: [string, string[]]];
const KITCHENS: { name: string; cuisine: string; tags: string[]; fee: number; min: number; eta: number; level: 1 | 2 | 3; dishes: Dish[]; grocery?: boolean }[] = [
  { name: 'Forno', cuisine: 'Pizza · Italian', tags: ['Pizza', 'Italian'], fee: 199, min: 1200, eta: 25, level: 2, dishes: [['Margherita', 12, 'Pizza', ['Size', ['Regular', 'Large']]], ['Pepperoni', 14, 'Pizza', ['Size', ['Regular', 'Large']]], ['Burrata salad', 10, 'Starters'], ['Tiramisu', 7, 'Dessert'], ['Lemon soda', 3.5, 'Drinks']] },
  { name: 'Green Bowl', cuisine: 'Bowls · Healthy', tags: ['Healthy', 'Vegan'], fee: 149, min: 1000, eta: 20, level: 2, dishes: [['Harvest bowl', 13.5, 'Bowls', ['Protein', ['Tofu', 'Chicken', 'Salmon']]], ['Falafel wrap', 10, 'Wraps'], ['Kale caesar', 11, 'Salads'], ['Cold-pressed juice', 5.5, 'Drinks']] },
  { name: 'Smash Bros', cuisine: 'Burgers', tags: ['Burgers', 'Fries'], fee: 199, min: 1200, eta: 30, level: 2, dishes: [['Double smash', 13, 'Burgers'], ['Crispy chicken burger', 12, 'Burgers'], ['Loaded fries', 6, 'Sides'], ['Vanilla shake', 5.5, 'Shakes']] },
  { name: 'Noodle House', cuisine: 'Asian · Noodles', tags: ['Noodles', 'Spicy'], fee: 200, min: 1500, eta: 35, level: 2, dishes: [['Pad thai', 15, 'Mains', ['Spice level', ['Mild', 'Medium', 'Hot']]], ['Tonkotsu ramen', 16, 'Mains'], ['Gyoza (6)', 7, 'Starters'], ['Iced tea', 3.5, 'Drinks']] },
  { name: 'Corner Bakery', cuisine: 'Bakery · Coffee', tags: ['Bakery', 'Breakfast', 'Coffee'], fee: 99, min: 800, eta: 15, level: 1, dishes: [['Croissant', 3.5, 'Pastry'], ['Cinnamon bun', 4, 'Pastry'], ['Sourdough loaf', 7, 'Bread'], ['Flat white', 4.2, 'Coffee', ['Milk', ['Dairy', 'Oat']]]] },
  { name: 'Market', cuisine: 'Groceries · 20 min', tags: ['Groceries'], fee: 0, min: 1000, eta: 20, level: 1, grocery: true, dishes: [['Bananas 1kg', 2, 'Fresh'], ['Eggs (12)', 4.5, 'Fresh'], ['Oat milk 1L', 2.5, 'Dairy'], ['Pasta 500g', 2, 'Pantry'], ['Coffee beans', 9.5, 'Pantry']] },
];

type Item = [title: string, category: ProductCategory, condition: ProductCondition, usd: number, brand: string, qty: number];
const ITEMS: Item[] = [
  ['Wireless earbuds', 'electronics', 'very_good', 65, 'Sony', 1], ['Denim jacket', 'fashion', 'good', 40, "Levi's", 1], ['Running shoes', 'sport', 'new_with_tags', 85, 'Asics', 2],
  ['Ceramic plant pot set', 'home', 'new_without_tags', 28, 'Handmade', 5], ['Hardcover cookbook', 'books', 'very_good', 18, 'Ottolenghi', 1], ['Yoga mat', 'sport', 'new_with_tags', 30, 'Manduka', 3],
  ['Retro game console', 'collectibles', 'good', 120, 'Nintendo', 1], ['Linen shirt', 'fashion', 'new_with_tags', 45, 'Arket', 3], ['Desk lamp', 'home', 'very_good', 35, 'IKEA', 1],
  ['Leather wallet', 'accessories', 'new_without_tags', 38, 'Bellroy', 4], ['E-reader', 'electronics', 'very_good', 75, 'Kindle', 1], ['Wool scarf', 'accessories', 'new_with_tags', 32, 'Acne', 2],
  ['Vintage poster', 'collectibles', 'good', 25, 'Vintage', 1], ['Bluetooth speaker', 'electronics', 'good', 50, 'JBL', 1], ['Cotton tote bag', 'accessories', 'new_with_tags', 15, 'Local', 8],
  ['Board game', 'general', 'very_good', 22, 'Catan', 1], ['Winter coat', 'fashion', 'very_good', 95, 'Uniqlo', 1], ['Espresso cups (4)', 'home', 'new_without_tags', 24, 'Hay', 4],
  ['Tennis racket', 'sport', 'good', 55, 'Wilson', 1], ['Novel bundle (5)', 'books', 'good', 20, 'Mixed', 1], ['Smartwatch band', 'accessories', 'new_with_tags', 19, 'Generic', 6],
  ['Film camera', 'electronics', 'good', 140, 'Olympus', 1], ['Sneakers', 'fashion', 'very_good', 60, 'Adidas', 1], ['Throw blanket', 'home', 'new_with_tags', 48, 'Zara Home', 3],
  ['Mechanical keyboard', 'electronics', 'new_without_tags', 90, 'Keychron', 2],
];

type Car = [make: string, model: string, type: VehicleType, usdDay: number, minAge: number, fuel: 'petrol' | 'diesel' | 'hybrid' | 'electric', seats: number];
const CARS: Car[] = [
  ['Toyota', 'Corolla Hybrid', 'compact', 45, 21, 'hybrid', 5], ['Tesla', 'Model Y', 'electric', 85, 23, 'electric', 5], ['Volkswagen', 'Tiguan', 'suv', 70, 23, 'petrol', 5],
  ['Fiat', '500', 'compact', 35, 21, 'petrol', 4], ['BMW', '3 Series', 'sedan', 90, 25, 'hybrid', 5], ['Ford', 'Transit Custom', 'van', 110, 25, 'diesel', 8],
];

type Stay = [title: string, type: PropertyType, usdNight: number, cleaning: number, guests: number, bedrooms: number];
const STAYS: Stay[] = [
  ['Bright apartment near the centre', 'apartment', 140, 45, 4, 2], ['Cosy studio with balcony', 'studio', 95, 30, 2, 1], ['Private room in a shared flat', 'room', 60, 15, 2, 1],
  ['Family house with garden', 'house', 230, 70, 6, 3], ['Boutique hotel double room', 'room', 165, 0, 2, 1], ['Loft with city views', 'apartment', 180, 50, 3, 1],
];

let n = 0;
function account(city: string, kind: string, country: string, name: string) {
  const id = `${kind}_${city.toLowerCase().replace(/\W+/g, '')}`;
  api.session.signUp({ email: `${id}@example.com`, password: 'password123', displayName: name, username: id, country, accountType: 'business' });
  const user = getDb().users.find((u) => u.email === `${id}@example.com`)!;
  api.session.signOut();
  return user.id;
}

/** Adds the example catalogue to the current (simulation) database. Returns counts for the report. */
export function addExampleCatalog() {
  const db = getDb();
  const counts = { cities: 0, restaurants: 0, menuItems: 0, products: 0, cars: 0, stays: 0 };
  for (const region of REGIONS) {
    const city = region.city.name;
    const hoods = NEIGHBOURHOODS[city] ?? ['Centre'];
    counts.cities += 1;
    const kitchen = account(city, 'kitchen', region.code, `${city} Kitchens`);
    const seller = account(city, 'seller', region.code, `${city} Resale`);
    const host = account(city, 'host', region.code, `${city} Stays & Cars`);
    getDb().users.find((u) => u.id === kitchen)!.roles.push('kitchen');
    getDb().users.find((u) => u.id === seller)!.roles.push('seller');
    getDb().users.find((u) => u.id === host)!.roles.push('host');
    KITCHENS.forEach((k, i) => {
      const id = `rs_sim_${++n}`;
      db.restaurants.push({ id, ownerId: kitchen, name: `${k.name} ${hoods[i % hoods.length]}`, cuisine: k.cuisine, description: `Example ${k.cuisine.toLowerCase()} in ${city} (simulation only).`, image: '', logoColor: '#4F46E5', rating: 4.3 + ((i * 7) % 7) / 10, ratingCount: 80 + i * 41, deliveryFeeCents: k.fee, minOrderCents: k.min, etaMin: k.eta, priceLevel: k.level, tags: k.tags, address: `${10 + i * 7} Example Street, ${hoods[i % hoods.length]}`, city, isOpen: i !== 2 || region.code !== 'IT', isGrocery: !!k.grocery, createdAt: Date.now() });
      counts.restaurants += 1;
      k.dishes.forEach(([name, usd, category, req], j) => {
        const item: MenuItem = { id: `mi_sim_${n}_${j}`, restaurantId: id, name, description: '', priceCents: Math.round(usd * 100), category, available: true, popular: j === 0, options: req ? [{ name: req[0], required: true, choices: req[1].map((label, x) => ({ label, priceCents: x === 0 ? 0 : 150 })) }] : [] };
        db.menuItems.push(item);
        counts.menuItems += 1;
      });
    });
    ITEMS.forEach(([title, category, condition, usd, brand, qty], i) => {
      const p: Product = { id: `p_sim_${++n}`, sellerId: seller, title, description: `${title} from ${city} (simulation example).`, priceCents: Math.round(usd * 100 * (0.85 + ((i * 13) % 30) / 100)), category, condition, images: [], quantity: qty, status: 'active', location: city, brand, createdAt: Date.now() };
      db.products.push(p);
      counts.products += 1;
    });
    CARS.forEach(([make, model, type, usd, minAge, fuel, seats], i) => {
      db.vehicles.push({ id: `v_sim_${++n}`, hostId: host, make, model, year: 2022 + (i % 3), type, seats, doors: type === 'van' ? 4 : 5, transmission: 'automatic', fuel, pricePerDayCents: usd * 100, images: [], location: `${hoods[i % hoods.length]}, ${city}`, features: ['Bluetooth', 'Navigation'], requirements: { minAge, licenseYears: 1, depositCents: 30000 }, rating: 4.6 + (i % 4) / 10, trips: 20 + i * 9, blockedDates: [], listed: true, createdAt: Date.now() });
      counts.cars += 1;
    });
    STAYS.forEach(([title, type, usd, cleaning, guests, bedrooms], i) => {
      db.properties.push({ id: `st_sim_${++n}`, hostId: host, title: `${title}, ${hoods[i % hoods.length]}`, type, city, country: region.name, neighbourhood: hoods[i % hoods.length], description: `Example stay in ${city} (simulation only).`, pricePerNightCents: usd * 100, cleaningFeeCents: cleaning * 100, guests, bedrooms, beds: bedrooms, baths: 1, amenities: ['Wi-Fi', 'Heating', ...(type === 'room' && cleaning === 0 ? ['Breakfast', '24h reception'] : ['Kitchen'])], images: [], rating: 4.5 + (i % 5) / 10, reviewCount: 30 + i * 17, instantBook: true, listed: true, blockedDates: [], createdAt: Date.now() });
      counts.stays += 1;
    });
  }
  return counts;
}
