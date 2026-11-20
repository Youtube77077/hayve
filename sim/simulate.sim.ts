/**
 * 1,000-person simulation. Synthetic people (country, age, job, household, income, device, how they
 * found Hayve, interests with strengths, attitudes) use Hayve over several days through the real
 * backend API — the same code the app runs. The simulation adds its own example catalogue
 * (sim/catalog.ts: restaurants, products, cars and stays in every city); the app's data is untouched.
 *
 * Every step is recorded in full: when, what, the outcome (done / blocked / chose not to / error),
 * the items, prices, fees, payment method, Wave Back, balance afterwards and what the person thought.
 * Output: sim/out/results.json → node sim/report.mjs <dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import * as api from '../src/backend/api';
import { accountIdFor, balancesFor, ledgerIsBalanced } from '../src/backend/ledger';
import { REGIONS } from '../src/backend/regions';
import { createSeedDatabase } from '../src/backend/seed';
import { attachStorage, getDb, HayveError } from '../src/backend/store';
import { addExampleCatalog } from './catalog';

const N = Number(process.env.SIM_N ?? 1000);
const OUT = process.env.SIM_OUT ?? 'sim/out/results.json';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261120);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const between = (a: number, b: number) => a + R() * (b - a);
const chance = (p: number) => R() < p;
const round2 = (x: number) => Math.round(x * 100) / 100;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
function weighted<T extends string>(w: Record<T, number>): T {
  const total = Object.values<number>(w).reduce((a, b) => a + b, 0);
  let x = R() * total;
  for (const [k, v] of Object.entries<number>(w)) if ((x -= v) <= 0) return k as T;
  return Object.keys(w)[0] as T;
}

const COUNTRY_MIX: Record<string, number> = { US: 0.42, GB: 0.12, CA: 0.08, DE: 0.07, FR: 0.06, IE: 0.05, NL: 0.05, ES: 0.05, IT: 0.04, AU: 0.04, BE: 0.01, PT: 0.01 };
const FIRST: Record<string, string[]> = {
  US: ['Ava', 'Liam', 'Mia', 'Noah', 'Emma', 'Ethan', 'Sofia', 'Jayden', 'Chloe', 'Mason', 'Zoe', 'Lucas', 'Aaliyah', 'Diego', 'Grace', 'Marcus', 'Priya', 'Tyler', 'Destiny', 'Hannah'],
  GB: ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Poppy', 'Jack', 'Freya', 'Arthur', 'Ivy', 'Amir', 'Leah'],
  CA: ['Liam', 'Olivia', 'Noah', 'Charlotte', 'Benjamin', 'Léa', 'William', 'Emma', 'Raj', 'Chloé'],
  DE: ['Lukas', 'Mia', 'Felix', 'Hannah', 'Leon', 'Emilia', 'Paul', 'Lena', 'Mehmet', 'Clara'],
  FR: ['Gabriel', 'Jade', 'Louis', 'Louise', 'Raphaël', 'Emma', 'Hugo', 'Alice', 'Yasmine', 'Théo'],
  IE: ['Jack', 'Emily', 'James', 'Grace', 'Conor', 'Aoife', 'Seán', 'Niamh'],
  NL: ['Daan', 'Emma', 'Sem', 'Julia', 'Finn', 'Tess', 'Levi', 'Sophie', 'Noor', 'Bram'],
  ES: ['Hugo', 'Lucía', 'Martín', 'Sofía', 'Mateo', 'Martina', 'Pablo', 'Carmen'],
  IT: ['Leonardo', 'Sofia', 'Francesco', 'Aurora', 'Alessandro', 'Giulia', 'Matteo', 'Chiara'],
  AU: ['Oliver', 'Charlotte', 'Jack', 'Amelia', 'William', 'Isla', 'Mia', 'Thomas'],
  BE: ['Noah', 'Olivia', 'Arthur', 'Louise', 'Lucas', 'Elise'],
  PT: ['Francisco', 'Maria', 'Afonso', 'Leonor', 'Tomás', 'Beatriz'],
};
const LAST = ['Smith', 'Johnson', 'Garcia', 'Brown', 'Murphy', 'Müller', 'Martin', 'de Jong', 'Rossi', 'López', 'Kelly', 'Wilson', 'Nguyen', 'Patel', 'Kim', 'Dubois', 'Schmidt', 'Silva', 'Taylor', 'Anderson', 'Okafor', 'Haddad', 'Novak', 'Costa', 'Jansen'];
const NEIGHBOURHOOD: Record<string, string[]> = {
  'New York': ['Astoria', 'Harlem', 'Park Slope', 'Williamsburg', 'Upper West Side', 'Bushwick'],
  Toronto: ['Leslieville', 'The Annex', 'Liberty Village', 'Yorkville'], London: ['Camden', 'Peckham', 'Islington', 'Brixton', 'Hackney'],
  Dublin: ['Rathmines', 'Smithfield', 'Ranelagh'], Amsterdam: ['De Pijp', 'Oost', 'Noord', 'Westerpark'], Berlin: ['Kreuzberg', 'Neukölln', 'Prenzlauer Berg'],
  Paris: ['Belleville', 'Montmartre', 'Bastille'], Brussels: ['Ixelles', 'Saint-Gilles'], Madrid: ['Malasaña', 'Lavapiés', 'Chamberí'], Rome: ['Trastevere', 'Monti', 'Testaccio'],
  Lisbon: ['Alfama', 'Graça', 'Campo de Ourique'], Sydney: ['Surry Hills', 'Bondi', 'Newtown'],
};
const LANGUAGE: Record<string, string> = { US: 'English', GB: 'English', CA: 'English', IE: 'English', AU: 'English', DE: 'German', FR: 'French', NL: 'Dutch', ES: 'Spanish', IT: 'Italian', BE: 'French', PT: 'Portuguese' };
const JOBS = {
  student: ['University student', 'Graduate student', 'Design student'],
  low: ['Barista', 'Retail assistant', 'Warehouse worker', 'Care worker', 'Delivery rider', 'Receptionist'],
  middle: ['Nurse', 'Teacher', 'Software developer', 'Marketing manager', 'Electrician', 'Accountant', 'Graphic designer', 'Project manager', 'Pharmacist'],
  high: ['Product director', 'Surgeon', 'Lawyer', 'Founder', 'Investment analyst', 'Architect', 'Consultant'],
  retired: ['Retired teacher', 'Retired engineer', 'Retired nurse'],
};
const CHANNELS = ["A friend's split link", 'Instagram ad', 'TikTok video', 'App Store search', 'Google search', 'Word of mouth', 'A restaurant flyer', 'Podcast ad'];
const DEVICES = { iphone: ['iPhone 16', 'iPhone 15', 'iPhone 13', 'iPhone SE'], android: ['Pixel 9', 'Galaxy S24', 'Galaxy A55', 'OnePlus 12'], web: ['Laptop (Chrome)', 'Laptop (Safari)', 'Desktop (Edge)'] };
const INTERESTS = ['shopping', 'food', 'groceries', 'rides', 'travel', 'cars', 'payments'] as const;
type Interest = (typeof INTERESTS)[number];
const SHOP_CATS = ['fashion', 'electronics', 'home', 'accessories', 'collectibles', 'books', 'sport', 'general'] as const;
const CUISINE_LIKES = ['Pizza', 'Healthy', 'Burgers', 'Noodles', 'Bakery', 'Vegan', 'Spicy', 'Coffee'];

export interface Step {
  day: number;
  time: string;
  service: string;
  action: string;
  outcome: 'ok' | 'friction' | 'skipped' | 'bug';
  message?: string;
  detail?: Record<string, string | number>;
  spentCents?: number;
  feesCents?: number;
  waveBackCents?: number;
  balanceAfterCents?: number;
  thought?: string;
}

export interface Persona {
  id: string;
  userId?: string;
  name: string;
  age: number;
  country: string;
  countryName: string;
  city: string;
  neighbourhood: string;
  language: string;
  occupation: string;
  household: string;
  income: 'low' | 'middle' | 'high';
  annualIncomeUsd: number;
  monthlyAppBudgetUsd: number;
  device: string;
  platform: 'iphone' | 'android' | 'web';
  channel: string;
  motivation: string;
  bio: string;
  priceSensitivity: number;
  techSavvy: number;
  patience: number;
  loyalty: number;
  interests: Record<Interest, number>;
  topInterests: Interest[];
  shopCategories: string[];
  cuisines: string[];
  sessions: number;
  steps: Step[];
  thoughts: string[];
  topUpCents: number;
  startBalanceCents: number;
  endBalanceCents: number;
  receivedCents: number;
  spentCents: number;
  feesCents: number;
  waveBackCents: number;
  spentByService: Record<string, number>;
  satisfaction: number;
  wouldRecommend: number;
  favouriteService: string;
  verdict: string;
  churnRisk: 'low' | 'medium' | 'high';
}

function near(c: { lng: number; lat: number }, km: number) {
  const a = R() * Math.PI * 2;
  const d = R() * km;
  return { lng: c.lng + (Math.cos(a) * d) / (111 * Math.cos((c.lat * Math.PI) / 180)), lat: c.lat + (Math.sin(a) * d) / 111 };
}
const dateIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function makePersona(i: number): Persona {
  const country = weighted(COUNTRY_MIX);
  const region = REGIONS.find((r) => r.code === country)!;
  const age = Math.round(between(18, 74));
  const student = age < 25 && chance(0.55);
  const retired = age >= 65 && chance(0.7);
  const income: Persona['income'] = student || retired ? (chance(0.7) ? 'low' : 'middle') : chance(0.22) ? 'low' : chance(0.75) ? 'middle' : 'high';
  const occupation = pick(student ? JOBS.student : retired ? JOBS.retired : JOBS[income]);
  const household = student ? pick(['Shares a flat with 3 housemates', 'Lives in student housing', 'Lives with parents']) : age > 30 && chance(0.45) ? pick(['Couple with 1 child', 'Couple with 2 kids', 'Single parent with 1 child']) : pick(['Lives alone', 'Lives with partner', 'Shares a flat with a friend']);
  const annual = Math.round((income === 'low' ? between(14, 32) : income === 'middle' ? between(38, 95) : between(110, 320)) * 1000);
  const platform = weighted({ iphone: country === 'US' || country === 'GB' || country === 'AU' ? 0.55 : 0.35, android: 0.4, web: 0.15 } as Record<Persona['platform'], number>);
  const kids = household.includes('child') || household.includes('kids');
  const w = (base: number) => Math.round(Math.max(0, Math.min(1, base + between(-0.35, 0.35))) * 100) / 100;
  const interests: Record<Interest, number> = {
    shopping: w(age < 40 ? 0.55 : 0.35),
    food: w(student || household === 'Lives alone' ? 0.7 : 0.5),
    groceries: w(kids ? 0.65 : 0.3),
    rides: w(age < 35 ? 0.55 : 0.35),
    travel: w(income === 'high' ? 0.65 : 0.35),
    cars: w(kids ? 0.5 : 0.25),
    payments: w(student ? 0.7 : 0.45),
  };
  const topInterests = [...INTERESTS].sort((a, b) => interests[b] - interests[a]).slice(0, 3);
  const motivation =
    topInterests[0] === 'food' ? 'Wants dinner delivered without juggling five apps'
    : topInterests[0] === 'payments' ? 'Splits bills with friends and housemates every week'
    : topInterests[0] === 'travel' ? 'Plans weekend trips and wants stays and cars in one place'
    : topInterests[0] === 'rides' ? 'Needs reliable rides to work and back at night'
    : topInterests[0] === 'shopping' ? 'Buys and sells second-hand to save money'
    : topInterests[0] === 'groceries' ? 'Orders groceries so weekends are free for the family'
    : 'Rents a car a few times a year for family trips';
  const name = `${pick(FIRST[country])} ${pick(LAST)}`;
  const city = region.city.name;
  const neighbourhood = pick(NEIGHBOURHOOD[city] ?? ['Centre']);
  const priceSensitivity = round2(income === 'low' ? between(0.6, 1) : income === 'middle' ? between(0.3, 0.8) : between(0, 0.45));
  const techSavvy = round2(Math.max(0.05, Math.min(1, 1.1 - age / 85 + between(-0.2, 0.2))));
  const p: Persona = {
    id: `sim${i}`, name, age, country, countryName: region.name, city, neighbourhood, language: LANGUAGE[country] ?? 'English',
    occupation, household, income, annualIncomeUsd: annual, monthlyAppBudgetUsd: Math.round(annual / 12 * (income === 'low' ? 0.06 : 0.09)),
    platform, device: pick(DEVICES[platform]), channel: pick(CHANNELS), motivation, bio: '',
    priceSensitivity, techSavvy, patience: round2(between(0.2, 1)), loyalty: round2(between(0.2, 1)),
    interests, topInterests, shopCategories: SHOP_CATS.filter(() => chance(0.3)).slice(0, 3), cuisines: CUISINE_LIKES.filter(() => chance(0.3)).slice(0, 3),
    sessions: Math.max(1, Math.round(between(1, 3) + (techSavvy > 0.6 ? 1.5 : 0) + interests[topInterests[0]] * 1.5)),
    steps: [], thoughts: [], topUpCents: 0, startBalanceCents: 0, endBalanceCents: 0, receivedCents: 0, spentCents: 0, feesCents: 0, waveBackCents: 0, spentByService: {},
    satisfaction: 7, wouldRecommend: 7, favouriteService: '', verdict: '', churnRisk: 'medium',
  };
  if (!p.shopCategories.length) p.shopCategories.push(pick(SHOP_CATS));
  if (!p.cuisines.length) p.cuisines.push(pick(CUISINE_LIKES));
  p.bio = `${occupation}, ${age}, in ${neighbourhood}, ${city}. ${household}. Found Hayve through ${p.channel.toLowerCase()} on ${/^[AEIOU]/i.test(p.device) && !p.device.startsWith('One') ? 'an' : 'a'} ${p.device}. ${motivation}.`;
  return p;
}

it(`simulates ${N} people`, () => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
  const catalog = addExampleCatalog();
  const people: Persona[] = [];
  const bugs: { persona: string; action: string; message: string; stack?: string }[] = [];
  const invariantFailures: string[] = [];
  const openLinks: { id: string; ownerId: string; ownerName: string; title: string; amountCents: number; left: number }[] = [];
  const t0 = Date.now();

  for (let i = 0; i < N; i++) {
    const p = makePersona(i);
    const region = REGIONS.find((r) => r.code === p.country)!;
    const center = REGIONS.find((r) => r.code === p.country)!.city;
    let day = 1;
    let hour = 9;
    const acc = () => accountIdFor(p.userId!);
    const bal = () => balancesFor(acc()).available;
    const waveBackTotal = () => getDb().transactions.filter((t) => t.type === 'wave_back' && t.toAccountId === acc()).reduce((a, t) => a + t.amountCents, 0);

    const step = (service: string, action: string, fn: () => { detail?: Step['detail']; spentCents?: number; feesCents?: number; thought?: string } | void, at?: number): boolean => {
      if (at != null) hour = at;
      const wb0 = p.userId ? waveBackTotal() : 0;
      const s: Step = { day, time: clock(hour), service, action, outcome: 'ok' };
      try {
        const r = fn() || {};
        Object.assign(s, { detail: r.detail, spentCents: r.spentCents, feesCents: r.feesCents, thought: r.thought });
        p.spentCents += r.spentCents ?? 0;
        p.feesCents += r.feesCents ?? 0;
        if (r.spentCents) p.spentByService[service] = (p.spentByService[service] ?? 0) + r.spentCents;
      } catch (e) {
        if (e instanceof HayveError) s.outcome = 'friction';
        else {
          s.outcome = 'bug';
          bugs.push({ persona: p.id, action, message: (e as Error).message, stack: (e as Error).stack?.split('\n').slice(0, 4).join(' | ') });
        }
        s.message = (e as Error).message;
      }
      if (p.userId) {
        s.waveBackCents = waveBackTotal() - wb0 || undefined;
        s.balanceAfterCents = bal();
      }
      p.steps.push(s);
      hour += between(0.2, 1.5);
      return s.outcome === 'ok';
    };
    const skip = (service: string, action: string, message: string, detail?: Step['detail'], thought?: string) => {
      p.steps.push({ day, time: clock(hour), service, action, outcome: 'skipped', message, detail, thought, balanceAfterCents: p.userId ? bal() : undefined });
      hour += between(0.1, 0.5);
    };
    const method = (total: number): api.PayMethod => (bal() >= total ? 'wallet' : bal() > 0 ? 'wallet_card' : 'card');
    const methodLabel = (m: api.PayMethod) => ({ wallet: 'Hayve balance', wallet_card: 'Balance + card', card: 'Card', card_declined: 'Card (declined)' })[m];
    const budgetLeft = () => p.monthlyAppBudgetUsd * 100 - p.spentCents;

    // Day 1: sign up from the detected country with the address from their location.
    const ok = step('account', 'Sign up', () => {
      api.session.signUp({ email: `${p.id}@example.com`, password: 'password123', displayName: p.name, username: `sim_${i}`, country: p.country, language: undefined, address: { line1: `${100 + i} ${p.neighbourhood} Street`, city: p.city, postcode: '00000', country: region.name } });
      p.userId = getDb().users.find((u) => u.email === `${p.id}@example.com`)!.id;
      return { detail: { Country: region.name, Currency: region.currency, Address: `${100 + i} ${p.neighbourhood} Street, ${p.city}`, Device: p.device, 'Found us via': p.channel }, thought: p.techSavvy < 0.3 ? 'Took me a minute, but the address was already filled in.' : 'Quick sign-up, it knew where I was.' };
    }, between(8, 21));
    if (!ok) {
      people.push(p);
      continue;
    }

    // Top up (or not): tech-savvy and payment-minded people keep a balance.
    if (chance(0.3 + p.techSavvy * 0.3 + p.interests.payments * 0.2)) {
      const amount = Math.round((p.income === 'low' ? between(20, 80) : p.income === 'middle' ? between(50, 250) : between(150, 700))) * 100;
      if (step('pay', 'Add money', () => {
        api.wallet.addMoney(amount);
        return { detail: { Amount: usd(amount), Method: 'Card (simulated checkout)', 'Withdrawable from': dateIn(7) }, thought: p.interests.payments > 0.6 ? 'Keeping a balance means Wave Back on everything.' : undefined };
      })) p.topUpCents += amount;
    }
    p.startBalanceCents = bal();

    const actions: Record<Interest, () => void> = {
      shopping: () => {
        const all = api.shop.listProducts({}).filter((x) => x.seller.id !== p.userId && x.available);
        const liked = all.filter((x) => p.shopCategories.includes(x.category));
        const pool = liked.length ? liked : all;
        if (!pool.length) return skip('shop', 'Browse Shop', 'Nothing left in my categories');
        // Prefer items from my own country (cheaper shipping), like a real shopper would after one look.
        const local = pool.filter((x) => x.location === p.city);
        const prod = chance(0.6) && local.length ? pick(local) : pick(pool);
        const addr = api.social.addresses()[0];
        const q = api.shop.quote(prod.id, 'ship', addr?.id);
        const detail = { Item: prod.title, Brand: prod.brand ?? '—', Condition: prod.condition.replace(/_/g, ' '), 'Ships from': prod.location, Shipping: `${usd(q.shippingCents)} (${q.shippingZone})`, Price: usd(q.priceCents), Fees: usd(q.feeCents), Total: usd(q.totalCents) };
        if (q.shippingZone === 'international' && q.shippingCents / q.priceCents > 0.3 && p.priceSensitivity > 0.5) return skip('shop', 'Buy an item', 'International shipping too expensive', detail, `Shipping from ${prod.location} was ${usd(q.shippingCents)} on a ${usd(q.priceCents)} item. Not worth it.`);
        if (q.totalCents > budgetLeft() + (p.income === 'high' ? 50000 : 0)) return skip('shop', 'Buy an item', 'Over my budget this month', detail, `${prod.title} for ${usd(q.totalCents)} is more than I want to spend right now.`);
        const m = method(q.totalCents);
        step('shop', 'Buy an item', () => {
          api.shop.checkout(prod.id, { addressId: addr?.id, method: m, delivery: 'ship' });
          return { detail: { ...detail, 'Paid with': methodLabel(m) }, spentCents: q.totalCents, feesCents: q.feeCents + q.shippingCents, thought: q.shippingZone === 'domestic' ? pick(['Found exactly what I wanted, checkout was fast.', 'Good price for the condition.', 'Clear total before paying, no surprises.']) : `Ships from ${prod.location}; the extra shipping was shown up front.` };
        });
      },
      food: () => food(false),
      groceries: () => food(true),
      rides: () => {
        const hoods = NEIGHBOURHOOD[p.city] ?? ['Centre'];
        const a = { id: '', name: `${p.neighbourhood}`, address: `${p.neighbourhood}, ${p.city}`, ...near(center, 3) };
        const toName = chance(0.15) ? 'Airport' : pick(hoods.filter((h) => h !== p.neighbourhood).concat(['City centre', 'Train station']));
        const b = { id: '', name: toName, address: `${toName}, ${p.city}`, ...near(center, toName === 'Airport' ? 14 : 8) };
        let opts: ReturnType<typeof api.ride.quoteRide> = [];
        if (!step('ride', 'Get ride prices', () => {
          opts = api.ride.quoteRide(a, b);
          return { detail: Object.fromEntries(opts.map((o) => [o.label, `${usd(o.priceCents)} · pickup ${o.pickupEtaMin} min`])) };
        }, chance(0.5) ? between(7, 9.5) : between(17, 23.5))) return;
        if (!opts.length) return;
        const choice = p.priceSensitivity > 0.6 ? opts[0] : p.income === 'high' && chance(0.5) ? opts[opts.length - 1] : pick(opts);
        const fees = choice.fees.reduce((s, f) => s + f.cents, 0);
        const m = method(choice.priceCents);
        let rideId = '';
        if (!step('ride', 'Book a ride', () => {
          rideId = api.ride.requestRide(a, b, choice.category, m);
          return { detail: { From: a.address, To: b.address, Type: choice.label, Fare: usd(choice.baseCents), ...Object.fromEntries(choice.fees.map((f) => [f.label, usd(f.cents)])), Total: usd(choice.priceCents), 'Paid with': methodLabel(m) }, spentCents: choice.priceCents, feesCents: fees, thought: fees / choice.priceCents > 0.25 ? `Fees were ${Math.round((fees / choice.priceCents) * 100)}% of the price (${choice.fees.map((f) => f.label).join(', ')}).` : undefined };
        })) return;
        for (let k = 0; k < 12 && api.ride.getRide(rideId).status !== 'completed'; k++) api.ride.simulateRideStep(rideId);
        const v = api.ride.getRide(rideId);
        if (v.status !== 'completed') {
          p.steps.push({ day, time: clock(hour), service: 'ride', action: 'Ride', outcome: 'friction', message: `Stuck at ${v.status}`, thought: 'My ride never came.' });
          return;
        }
        const d = v.driver!;
        p.steps.push({ day, time: clock((hour += v.durationMin / 60)), service: 'ride', action: 'Ride completed', outcome: 'ok', detail: { Driver: `${d.displayName} · ★ ${d.rating.toFixed(2)}`, Car: `${d.vehicle.color} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plate}`, Distance: `${v.distanceKm.toFixed(1)} km`, Duration: `${v.durationMin} min`, 'Drivers asked': String(v.matching.contacted), 'Driver declined': String(v.matching.declined) }, thought: v.matching.declined ? 'First driver passed, the next one came quickly.' : pick(['Driver was friendly, car was clean.', 'Smooth ride.', 'Arrived right when the app said.']), balanceAfterCents: bal() });
        if (chance(0.75)) step('ride', 'Rate the driver', () => {
          const stars = p.patience > 0.4 ? 5 : 4;
          api.ride.rateRide(rideId, stars);
          return { detail: { Rating: '★'.repeat(stars) } };
        });
      },
      travel: () => {
        const others = REGIONS.filter((r) => r.code !== p.country);
        const dest = chance(0.3) ? region : chance(0.5) ? REGIONS.find((r) => r.code === p.country && r.city.name !== p.city) ?? pick(others) : pick(others);
        const startIn = Math.round(between(3, 90));
        const nights = Math.round(between(1, 6));
        const guests = p.household.includes('kids') ? 4 : p.household.includes('child') ? 3 : p.household.includes('partner') || p.household.includes('Couple') ? 2 : 1;
        const props = api.bookings.listProperties({ destination: dest.city.name, guests, checkIn: dateIn(startIn), checkOut: dateIn(startIn + nights) });
        if (!props.length) return skip('stay', 'Search stays', `Nothing free in ${dest.city.name} for my dates`, { Destination: dest.city.name, Dates: `${dateIn(startIn)} → ${dateIn(startIn + nights)}`, Guests: guests });
        const wantsHotel = chance(p.income === 'high' ? 0.4 : 0.15);
        const pool = wantsHotel ? props.filter((x) => x.title.toLowerCase().includes('hotel')) : props;
        const prop = (pool.length ? pool : props).sort((x, y) => (p.priceSensitivity > 0.6 ? x.pricePerNightCents - y.pricePerNightCents : y.rating - x.rating))[0];
        const q = api.bookings.quoteStay(prop.id, dateIn(startIn), dateIn(startIn + nights));
        const detail = { Stay: prop.title, City: `${prop.city}, ${prop.country}`, Dates: `${dateIn(startIn)} → ${dateIn(startIn + nights)}`, Nights: q.nights, Guests: guests, 'Per night': usd(prop.pricePerNightCents), Cleaning: usd(q.cleaningFeeCents), Fees: usd(q.serviceFeeCents), Total: usd(q.totalCents) };
        if (q.totalCents > (p.income === 'low' ? 45000 : p.income === 'middle' ? 160000 : 600000)) return skip('stay', 'Book a stay', 'Too expensive for this trip', detail, `${usd(q.totalCents)} for ${q.nights} nights in ${prop.city} is too much for me.`);
        const m = method(q.totalCents);
        step('stay', 'Book a stay', () => {
          api.bookings.bookStay({ propertyId: prop.id, checkIn: dateIn(startIn), checkOut: dateIn(startIn + nights), guests, method: m });
          return { detail: { ...detail, 'Paid with': methodLabel(m) }, spentCents: q.totalCents, feesCents: q.serviceFeeCents, thought: dest.code === p.country && dest.city.name === p.city ? 'A staycation, booked in two minutes.' : `Booked ${prop.city} for ${q.nights} nights. ${wantsHotel ? 'Glad I could pick a hotel room.' : 'Liked seeing the full price per stay.'}` };
        });
      },
      cars: () => {
        const startIn = Math.round(between(2, 60));
        const days = Math.round(between(1, 6));
        const list = api.bookings.listVehicles({ start: dateIn(startIn), end: dateIn(startIn + days) });
        const local = list.filter((v) => v.location.includes(p.city) && v.requirements.minAge <= p.age);
        if (!local.length) return skip('drive', 'Rent a car', list.length ? 'No car near me fits my age' : 'No cars free for those dates', { City: p.city, Dates: `${dateIn(startIn)} → ${dateIn(startIn + days)}` });
        const v = p.household.includes('kids') ? local.find((x) => x.seats >= 5 && (x.type === 'suv' || x.type === 'van')) ?? local[0] : p.priceSensitivity > 0.6 ? [...local].sort((x, y) => x.pricePerDayCents - y.pricePerDayCents)[0] : pick(local);
        const q = api.bookings.quoteRental(v.id, dateIn(startIn), dateIn(startIn + days));
        const m = method(q.totalCents);
        step('drive', 'Rent a car', () => {
          api.bookings.bookRental({ vehicleId: v.id, start: dateIn(startIn), end: dateIn(startIn + days), pickupLocation: v.location, returnLocation: v.location, method: m, driverAge: p.age });
          return { detail: { Car: `${v.make} ${v.model} (${v.type})`, Pickup: v.location, Dates: `${dateIn(startIn)} → ${dateIn(startIn + days)}`, Days: q.days, Rental: usd(q.baseCents - q.discountCents), Insurance: usd(q.insuranceCents), Fees: usd(q.feesCents), Total: usd(q.totalCents), Deposit: `${usd(q.depositCents)} (held, refunded)`, 'Paid with': methodLabel(m) }, spentCents: q.totalCents, feesCents: q.feesCents, thought: p.household.includes('kids') ? 'Room for the kids and the luggage.' : 'Picked it up around the corner.' };
        });
      },
      payments: () => {
        const r = R();
        if (r < 0.45) {
          const unsure = chance(0.3);
          const title = pick(['Dinner', 'Groceries', 'Rent top-up', 'Birthday gift', 'Concert tickets', 'Utilities', 'Taxi home']);
          step('pay', 'Split a bill', () => {
            const total = Math.round(between(30, 180)) * 100;
            const people = Math.round(between(2, 6));
            const id = unsure ? api.requests.create({ kind: 'split', title, amountCents: Math.round(between(10, 40)) * 100 }) : api.requests.create({ kind: 'split', title, splitTotalCents: total, people });
            const req = api.requests.get(id);
            openLinks.push({ id, ownerId: p.userId!, ownerName: p.name, title, amountCents: req.amountCents, left: unsure ? 99 : people - 1 });
            const detail: Record<string, string | number> = unsure ? { For: title, 'Each pays': usd(req.amountCents), People: 'Not sure yet', 'Link active': '72 hours' } : { For: title, Total: usd(total), People: people, 'Each pays': usd(req.amountCents), 'Link active': '72 hours' };
            return { detail, thought: unsure ? 'Not sure who is coming, so I just set an amount each.' : 'Sent the link to the group chat.' };
          });
        } else if (r < 0.8) {
          const l = [...openLinks].reverse().find((x) => x.ownerId !== p.userId && x.left > 0);
          if (!l) return skip('pay', 'Pay a link', 'No open links from friends');
          const m = bal() >= l.amountCents ? 'hayve' : 'card';
          step('pay', 'Pay a friend’s link', () => {
            api.requests.pay(l.id, m === 'hayve' ? { method: 'hayve' } : { method: 'card', card: { brand: 'Visa', last4: '4242' } });
            l.left -= 1;
            return { detail: { To: l.ownerName, For: l.title, Amount: usd(l.amountCents), 'Paid with': m === 'hayve' ? 'Hayve balance' : 'Card' }, spentCents: l.amountCents, thought: 'Two taps and done.' };
          });
        } else {
          const friend = people.filter((x) => x.userId)[Math.floor(R() * Math.max(1, people.length))];
          if (!friend?.userId) return skip('pay', 'Send money', 'No friends on Hayve yet');
          const amount = Math.round(between(5, 50)) * 100;
          if (bal() < amount) return skip('pay', 'Send money', 'Balance too low to send', { To: friend.name, Amount: usd(amount) }, 'Wanted to send money but my balance was empty.');
          step('pay', 'Send money', () => {
            api.wallet.sendMoney(friend.userId!, amount);
            return { detail: { To: friend.name, Amount: usd(amount) }, spentCents: amount };
          });
        }
      },
    };
    function food(groceries: boolean) {
      const list = api.bites.listRestaurants({ groceries }).filter((r) => r.isOpen);
      if (!list.length) return skip('bites', groceries ? 'Order groceries' : 'Order food', 'Nothing open nearby');
      const liked = list.filter((r) => r.tags.some((t) => p.cuisines.includes(t)));
      const r = pick(liked.length ? liked : list);
      const full = api.bites.getRestaurant(r.id);
      const items = full.menu.filter((m) => m.available);
      const household = p.household.includes('kids') ? 3 : p.household.includes('child') || p.household.includes('partner') || p.household.includes('Couple') ? 2 : 1;
      const shuffled = [...items].sort(() => R() - 0.5);
      const lines = Array.from({ length: Math.min(items.length, Math.ceil(between(1, 2.5 + household))) }, (_, k) => {
        const m = shuffled[k];
        return { key: `${k}`, menuItemId: m.id, qty: chance(0.2) ? 2 : 1, options: m.options.filter((o) => o.required).map((o) => pick(o.choices).label) };
      });
      let priced = api.bites.priceCart(r.id, lines);
      if (!priced.meetsMinimum) {
        lines.push({ key: 'x', menuItemId: items[0].id, qty: Math.ceil((r.minOrderCents - priced.subtotalCents) / items[0].priceCents) + 0, options: items[0].options.filter((o) => o.required).map((o) => o.choices[0].label) });
        priced = api.bites.priceCart(r.id, lines);
      }
      const names = lines.map((l) => `${l.qty}× ${items.find((m) => m.id === l.menuItemId)!.name}${l.options.length ? ` (${l.options.join(', ')})` : ''}`).join(', ');
      const m = method(priced.totalCents);
      let orderId = '';
      const done = step('bites', groceries ? 'Order groceries' : 'Order food', () => {
        orderId = api.bites.placeFoodOrder({ restaurantId: r.id, lines, address: api.social.addresses()[0]?.line1 ?? `${p.neighbourhood} Street 1`, method: m });
        return {
          detail: { From: `${r.name} (${r.cuisine})`, Items: names, Subtotal: usd(priced.subtotalCents), ...Object.fromEntries(priced.fees.map((f) => [f.label, usd(f.cents)])), Total: usd(priced.totalCents), 'Delivery estimate': `${r.etaMin} min`, 'Paid with': methodLabel(m) },
          spentCents: priced.totalCents,
          feesCents: priced.totalCents - priced.subtotalCents,
          thought: priced.addToAvoidSmallOrderCents > 0 && p.priceSensitivity > 0.6 ? 'Small-order fee on a small basket feels petty.' : groceries ? 'Groceries at the door before the kids got home.' : pick(['Food arrived hot.', 'Easy reorder from my favourite place.', 'Delivery fee shown before I paid, good.']),
        };
      }, groceries ? between(10, 18) : chance(0.4) ? between(12, 14) : between(18, 21.5));
      if (done) {
        let status = '';
        for (let k = 0; k < 8 && status !== 'delivered'; k++) status = api.bites.simulateFoodStep(orderId);
        p.steps.push({ day, time: clock((hour += r.etaMin / 60)), service: 'bites', action: status === 'delivered' ? 'Delivered' : 'Delivery', outcome: status === 'delivered' ? 'ok' : 'friction', message: status === 'delivered' ? undefined : `Order stuck at ${status}`, detail: { Status: status, Restaurant: r.name }, balanceAfterCents: bal() });
      }
    }

    // Several days of use, each session doing what this person cares about most.
    for (let s = 0; s < p.sessions; s++) {
      day = 1 + s * Math.max(1, Math.round(between(1, 4)));
      hour = between(7, 20);
      const n = Math.ceil(between(0.5, 2.5));
      for (let k = 0; k < n; k++) {
        const what = weighted(p.interests);
        if (chance(Math.max(0.15, p.interests[what]))) actions[what]();
      }
    }
    // Some try to withdraw.
    if (chance(0.1)) {
      step('pay', 'Set payout account', () => {
        api.wallet.setPayoutAccount(region.account.label === 'IBAN' ? { holder: p.name, account: 'DE89370400440532013000' } : { holder: p.name, account: '000123456789', routing: '110000000' });
        return { detail: { Account: region.account.label } };
      });
      const w = api.wallet.withdrawable();
      if (w.withdrawableCents >= 100) step('pay', 'Withdraw', () => {
        api.wallet.withdraw(Math.min(w.withdrawableCents, 5000));
        return { detail: { Amount: usd(Math.min(w.withdrawableCents, 5000)), 'Arrives in': '1–2 business days' } };
      });
      else skip('pay', 'Withdraw', w.heldTopUpsCents > 0 ? 'Added money is withdrawable after 7 days' : 'Nothing to withdraw', { 'Held for 7 days': usd(w.heldTopUpsCents) }, w.heldTopUpsCents > 0 ? 'Makes sense, but I wish the date was shown where I add money.' : undefined);
    }
    people.push(p);
    api.session.signOut();
  }

  // Final pass: money received from others arrives after a person's own session, so settle at the end.
  for (const p of people) {
    if (!p.userId) continue;
    const acc = accountIdFor(p.userId);
    p.endBalanceCents = balancesFor(acc).available;
    p.receivedCents = getDb().transactions.filter((t) => t.toAccountId === acc && (t.type === 'p2p' || t.type === 'request_payment')).reduce((a, t) => a + t.amountCents, 0);
    p.waveBackCents = getDb().transactions.filter((t) => t.type === 'wave_back' && t.toAccountId === acc).reduce((a, t) => a + t.amountCents, 0);
    const s = p.steps;
    const oks = s.filter((x) => x.outcome === 'ok').length;
    const frictions = s.filter((x) => x.outcome === 'friction').length;
    const skips = s.filter((x) => x.outcome === 'skipped').length;
    const bugsHere = s.filter((x) => x.outcome === 'bug').length;
    const feeShare = p.spentCents ? p.feesCents / p.spentCents : 0;
    p.satisfaction = Math.max(1, Math.min(10, Math.round(6.5 + Math.min(oks, 12) * 0.25 - frictions * (1.2 - p.patience * 0.6) - skips * 0.3 * p.priceSensitivity - bugsHere * 3 - Math.max(0, feeShare - 0.15) * 8 * p.priceSensitivity + (p.waveBackCents > 0 ? 0.5 : 0) + (p.receivedCents > 0 ? 0.3 : 0))));
    p.wouldRecommend = Math.max(0, Math.min(10, Math.round(p.satisfaction + between(-1.5, 1.5) + (p.loyalty - 0.5))));
    const svc = Object.entries(p.spentByService).sort((a, b) => b[1] - a[1])[0]?.[0];
    const NAMES: Record<string, string> = { shop: 'Hayve Shop', bites: 'Hayve Bites', ride: 'Hayve Ride', stay: 'Hayve Stay', drive: 'Hayve Drive', pay: 'Hayve Pay', account: 'Hayve' };
    p.favouriteService = svc ? NAMES[svc] : s.some((x) => x.service === 'pay' && x.outcome === 'ok') ? 'Hayve Pay' : '—';
    p.churnRisk = p.satisfaction >= 8 ? 'low' : p.satisfaction >= 6 ? 'medium' : 'high';
    if (p.waveBackCents > 0) p.thoughts.push(`Earned ${usd(p.waveBackCents)} Wave Back by paying from my balance.`);
    if (p.receivedCents > 0) p.thoughts.push(`Friends paid me ${usd(p.receivedCents)} through my links.`);
    for (const x of s) if (x.thought) p.thoughts.push(x.thought);
    for (const x of s.filter((y) => y.outcome === 'friction')) p.thoughts.push(`Blocked: ${x.message}`);
    p.verdict =
      p.satisfaction >= 9 ? `Loves it. ${p.favouriteService} is now the default for me.`
      : p.satisfaction >= 7 ? `Useful, will keep using ${p.favouriteService !== '—' ? p.favouriteService : 'it'}.`
      : p.satisfaction >= 5 ? 'Fine, but not sure I need it every week.'
      : 'Too many things didn’t work for me. Probably won’t come back.';
  }

  if (!ledgerIsBalanced()) invariantFailures.push('Ledger out of balance');
  const negative = getDb().accounts.filter((a) => a.kind === 'user' && balancesFor(a.id).available < 0).length;
  if (negative) invariantFailures.push(`${negative} wallets with a negative balance`);
  const crossCity = getDb().foodOrders.filter((o) => {
    const r = getDb().restaurants.find((x) => x.id === o.restaurantId);
    const prof = getDb().profiles.find((x) => x.userId === o.customerId);
    return r && prof?.city && api.bites.metro(r.city) !== api.bites.metro(prof.city);
  }).length;
  if (crossCity) invariantFailures.push(`${crossCity} food orders delivered across cities`);

  const revenueByService: Record<string, { orders: number; customerCents: number; hayveCents: number; supplierCents: number; netCents: number }> = {};
  for (const r of getDb().priceRecords ?? []) {
    const x = (revenueByService[r.service] ??= { orders: 0, customerCents: 0, hayveCents: 0, supplierCents: 0, netCents: 0 });
    x.orders += 1;
    x.customerCents += r.breakdown.customerTotalCents;
    x.hayveCents += r.breakdown.hayveRevenueCents;
    x.supplierCents += r.breakdown.supplierPayoutCents;
    x.netCents += r.breakdown.netRevenueCents;
  }
  mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), n: N, ms: Date.now() - t0, catalog, people, bugs, invariantFailures, revenueByService }));
  console.log(`done ${N} in ${Date.now() - t0}ms · bugs ${bugs.length} · invariant failures ${invariantFailures.length}`);
});
