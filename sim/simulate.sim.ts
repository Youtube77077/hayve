/**
 * 1,000-person simulation. Synthetic people with a country, age, income, interests and attitudes
 * use Hayve through the real backend API (the same code the app runs). Every step is recorded:
 * success, friction (an expected error a real person would hit), or a bug (an unexpected crash or
 * a broken invariant), plus money, fees, Wave Back and what the person would think.
 * Output: sim/out/results.json (read by sim/report.mjs → HTML report).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import * as api from '../src/backend/api';
import { accountIdFor, balancesFor, ledgerIsBalanced } from '../src/backend/ledger';
import { REGIONS } from '../src/backend/regions';
import { createSeedDatabase } from '../src/backend/seed';
import { attachStorage, getDb, HayveError } from '../src/backend/store';

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

const COUNTRY_MIX: [string, number][] = [['US', 0.42], ['GB', 0.12], ['CA', 0.08], ['DE', 0.07], ['FR', 0.06], ['IE', 0.05], ['NL', 0.05], ['ES', 0.05], ['IT', 0.04], ['AU', 0.04], ['BE', 0.01], ['PT', 0.01]];
const FIRST: Record<string, string[]> = {
  US: ['Ava', 'Liam', 'Mia', 'Noah', 'Emma', 'Ethan', 'Sofia', 'Jayden', 'Chloe', 'Mason', 'Zoe', 'Lucas', 'Aaliyah', 'Diego', 'Grace'],
  GB: ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Poppy', 'Jack', 'Freya', 'Arthur', 'Ivy'],
  CA: ['Liam', 'Olivia', 'Noah', 'Charlotte', 'Benjamin', 'Léa', 'William', 'Emma'],
  DE: ['Lukas', 'Mia', 'Felix', 'Hannah', 'Leon', 'Emilia', 'Paul', 'Lena'],
  FR: ['Gabriel', 'Jade', 'Louis', 'Louise', 'Raphaël', 'Emma', 'Hugo', 'Alice'],
  IE: ['Jack', 'Emily', 'James', 'Grace', 'Conor', 'Aoife', 'Seán', 'Niamh'],
  NL: ['Daan', 'Emma', 'Sem', 'Julia', 'Finn', 'Tess', 'Levi', 'Sophie'],
  ES: ['Hugo', 'Lucía', 'Martín', 'Sofía', 'Mateo', 'Martina'],
  IT: ['Leonardo', 'Sofia', 'Francesco', 'Aurora', 'Alessandro', 'Giulia'],
  AU: ['Oliver', 'Charlotte', 'Jack', 'Amelia', 'William', 'Isla'],
  BE: ['Noah', 'Olivia', 'Arthur', 'Louise'],
  PT: ['Francisco', 'Maria', 'Afonso', 'Leonor'],
};
const LAST = ['Smith', 'Johnson', 'Garcia', 'Brown', 'Murphy', 'Müller', 'Martin', 'de Jong', 'Rossi', 'López', 'Kelly', 'Wilson', 'Nguyen', 'Patel', 'Kim', 'Dubois', 'Schmidt', 'Silva', 'Taylor', 'Anderson'];
const INTERESTS = ['shopping', 'food', 'rides', 'travel', 'cars', 'payments'] as const;
type Interest = (typeof INTERESTS)[number];

export interface Step {
  action: string;
  outcome: 'ok' | 'friction' | 'bug' | 'skipped';
  message?: string;
  spentCents?: number;
  feesCents?: number;
  service?: string;
}

export interface Persona {
  id: string;
  name: string;
  country: string;
  city: string;
  age: number;
  income: 'low' | 'middle' | 'high';
  priceSensitivity: number;
  techSavvy: number;
  patience: number;
  interests: Interest[];
  steps: Step[];
  thoughts: string[];
  startBalanceCents: number;
  endBalanceCents: number;
  spentCents: number;
  feesCents: number;
  waveBackCents: number;
  satisfaction: number;
  wouldRecommend: number;
  interestScore: number;
}

function cityFor(country: string) {
  return REGIONS.find((r) => r.code === country)!.city;
}

function near(c: { lng: number; lat: number }, km: number) {
  const a = R() * Math.PI * 2;
  const d = R() * km;
  return { lng: c.lng + (Math.cos(a) * d) / (111 * Math.cos((c.lat * Math.PI) / 180)), lat: c.lat + (Math.sin(a) * d) / 111 };
}

function dateIn(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

it(`simulates ${N} people`, () => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
  const people: Persona[] = [];
  const bugs: { persona: string; action: string; message: string; stack?: string }[] = [];
  const invariantFailures: string[] = [];
  const t0 = Date.now();

  // People who received a split link pay it later (cross-person interaction).
  const openLinks: { id: string; owner: string; amountCents: number; left: number }[] = [];

  for (let i = 0; i < N; i++) {
    let x = R();
    let country = 'US';
    for (const [c, w] of COUNTRY_MIX) {
      if ((x -= w) <= 0) {
        country = c;
        break;
      }
    }
    const age = Math.round(between(18, 72));
    const income = chance(0.25) ? 'low' : chance(0.75) ? 'middle' : 'high';
    const interests = INTERESTS.filter(() => chance(0.45));
    if (!interests.length) interests.push(pick(INTERESTS));
    const name = `${pick(FIRST[country])} ${pick(LAST)}`;
    const city = cityFor(country);
    const p: Persona = {
      id: `sim${i}`,
      name,
      country,
      city: city.name,
      age,
      income,
      priceSensitivity: Math.round((income === 'low' ? between(0.6, 1) : income === 'middle' ? between(0.3, 0.8) : between(0, 0.5)) * 100) / 100,
      techSavvy: Math.round(Math.max(0.05, Math.min(1, 1.1 - age / 90 + between(-0.2, 0.2))) * 100) / 100,
      patience: Math.round(between(0.2, 1) * 100) / 100,
      interests,
      steps: [],
      thoughts: [],
      startBalanceCents: 0,
      endBalanceCents: 0,
      spentCents: 0,
      feesCents: 0,
      waveBackCents: 0,
      satisfaction: 7,
      wouldRecommend: 7,
      interestScore: 0,
    };
    const step = (action: string, service: string | undefined, fn: () => { spentCents?: number; feesCents?: number; note?: string } | void) => {
      try {
        const r = fn() || {};
        p.steps.push({ action, outcome: 'ok', service, spentCents: r.spentCents, feesCents: r.feesCents, message: r.note });
        p.spentCents += r.spentCents ?? 0;
        p.feesCents += r.feesCents ?? 0;
        return true;
      } catch (e) {
        if (e instanceof HayveError) {
          p.steps.push({ action, outcome: 'friction', service, message: e.message });
        } else {
          const err = e as Error;
          p.steps.push({ action, outcome: 'bug', service, message: err.message });
          bugs.push({ persona: p.id, action, message: err.message, stack: err.stack?.split('\n').slice(0, 4).join(' | ') });
        }
        return false;
      }
    };

    // 1. Sign up with the detected country and the address from their location.
    const home = near(city, 6);
    const okSignup = step('Sign up', 'account', () => {
      api.session.signUp({ email: `sim${i}@example.com`, password: 'password123', displayName: name, username: `sim_${i}`, country, address: { line1: `${100 + i} Main Street`, city: city.name, postcode: '00000', country: REGIONS.find((r) => r.code === country)!.name } });
    });
    if (!okSignup) {
      people.push(p);
      continue;
    }
    const me = getDb().users.find((u) => u.email === `sim${i}@example.com`)!;

    // 2. Top up the balance (income decides how much; some people skip and pay by card).
    const wantsBalance = chance(0.4 + p.techSavvy * 0.4);
    const topUpCents = wantsBalance ? Math.round((income === 'low' ? between(20, 80) : income === 'middle' ? between(50, 250) : between(150, 800)) * 100) : 0;
    if (topUpCents) step('Add money', 'pay', () => {
      api.wallet.addMoney(topUpCents);
      return { note: `Added ${topUpCents / 100}` };
    });
    p.startBalanceCents = balancesFor(accountIdFor(me.id)).available;
    // Same choice the checkout picker offers: balance if it covers the total, balance + card if partial, else card.
    const method = (total: number): api.PayMethod => {
      const bal = balancesFor(accountIdFor(me.id)).available;
      return bal >= total ? 'wallet' : bal > 0 ? 'wallet_card' : 'card';
    };

    // 3. Shopping
    if (interests.includes('shopping') || chance(0.3)) {
      const products = api.shop.listProducts({}).filter((x) => x.seller.id !== me.id);
      const prod = products.length ? pick(products) : null;
      if (!prod) {
        p.steps.push({ action: 'Buy an item', outcome: 'friction', service: 'shop', message: 'Everything in Shop was sold out' });
        p.thoughts.push('Shop had nothing left to buy.');
      }
      if (prod) {
        const addr = api.social.addresses()[0];
        const q = api.shop.quote(prod.id, 'ship', addr?.id);
        const shippingShare = q.shippingCents / q.priceCents;
        const tooExpensive = q.totalCents > (income === 'low' ? 6000 : income === 'middle' ? 25000 : 100000);
        if (q.shippingZone === 'international' && shippingShare > 0.3 && p.priceSensitivity > 0.5) {
          p.thoughts.push(`Shipping from abroad was ${(q.shippingCents / 100).toFixed(2)} on a ${(q.priceCents / 100).toFixed(2)} item. Too much, I left.`);
          p.steps.push({ action: 'Buy an item', outcome: 'skipped', service: 'shop', message: 'International shipping too expensive' });
          p.satisfaction -= 1;
        } else if (tooExpensive) {
          p.steps.push({ action: 'Buy an item', outcome: 'skipped', service: 'shop', message: 'Out of budget' });
        } else {
          const ok = step('Buy an item', 'shop', () => {
            api.shop.checkout(prod.id, { addressId: addr?.id, method: method(q.totalCents), delivery: 'ship' });
            return { spentCents: q.totalCents, feesCents: q.feeCents + q.shippingCents };
          });
          if (ok && q.shippingZone !== 'domestic') p.thoughts.push(`Bought from another country; ${q.shippingZone === 'international' ? 'international' : 'cross-border'} shipping was clearly shown.`);
          if (ok) p.interestScore += 2;
        }
      }
    }

    // 4. Food
    if (interests.includes('food') || chance(0.35)) {
      const restaurants = api.bites.listRestaurants({}).filter((r) => r.isOpen);
      const r = restaurants.length ? pick(restaurants) : null;
      if (!r) {
        const cov = api.bites.coverage();
        p.steps.push({ action: 'Order food', outcome: 'friction', service: 'bites', message: cov.served ? 'No restaurants open' : `Bites isn't in ${cov.city} yet` });
        p.thoughts.push(cov.served ? 'Nothing was open.' : `Wanted food, but Bites only delivers in ${cov.cities.join(', ')} so far.`);
        p.satisfaction -= 1;
      } else {
        const full = api.bites.getRestaurant(r.id);
        const items = full.menu.filter((m) => m.available);
        const lines = Array.from({ length: Math.ceil(between(1, 3.9)) }, (_, k) => {
          const m = pick(items);
          return { key: `${k}`, menuItemId: m.id, qty: 1, options: m.options.filter((o) => o.required).map((o) => o.choices[0].label) };
        });
        const priced = api.bites.priceCart(r.id, lines);
        if (priced.addToAvoidSmallOrderCents > 0 && p.priceSensitivity > 0.6) p.thoughts.push(`A small order fee on a ${(priced.subtotalCents / 100).toFixed(2)} order feels petty, but at least it told me how much to add.`);
        const ok = step('Order food', 'bites', () => {
          api.bites.placeFoodOrder({ restaurantId: r.id, lines, address: api.social.addresses()[0]?.line1 ?? 'Main Street 1', method: method(priced.totalCents) });
          return { spentCents: priced.totalCents, feesCents: priced.deliveryFeeCents + priced.serviceFeeCents };
        });
        if (ok) {
          p.interestScore += 2;
          const restCity = (full.restaurant as { city?: string }).city ?? (/Brooklyn|New York|Williamsburg/.test(full.restaurant.address) ? 'New York' : undefined);
          if (restCity && restCity !== p.city) {
            p.thoughts.push(`Ordered from ${full.restaurant.name}, but it's in ${restCity}. That can't be delivered to me in ${p.city}.`);
            invariantFailures.push(`Food order across cities: ${p.city} ← ${restCity}`);
          }
        }
      }
    }

    // 5. Rides
    if (interests.includes('rides') || chance(0.3)) {
      const a = { id: '', name: 'Pickup', address: '', ...near(city, 3) };
      const b = { id: '', name: 'Destination', address: '', ...near(city, 8) };
      let opts: ReturnType<typeof api.ride.quoteRide> = [];
      const quoted = step('Get ride prices', 'ride', () => {
        opts = api.ride.quoteRide(a, b);
      });
      if (quoted && opts.length) {
        const choice = p.priceSensitivity > 0.6 ? opts[0] : pick(opts);
        const feeShare = choice.fees.reduce((s, f) => s + f.cents, 0) / choice.priceCents;
        if (feeShare > 0.25) p.thoughts.push(`Fees were ${(feeShare * 100).toFixed(0)}% of my ride price (${choice.fees.map((f) => f.label).join(', ')}).`);
        let rideId = '';
        const ok = step('Book a ride', 'ride', () => {
          rideId = api.ride.requestRide(a, b, choice.category, method(choice.priceCents));
          return { spentCents: choice.priceCents, feesCents: choice.fees.reduce((s, f) => s + f.cents, 0) };
        });
        if (ok) {
          for (let k = 0; k < 10 && api.ride.getRide(rideId).status !== 'completed'; k++) api.ride.simulateRideStep(rideId);
          const done = api.ride.getRide(rideId);
          if (done.status !== 'completed') {
            p.steps.push({ action: 'Ride completes', outcome: 'friction', service: 'ride', message: `Stuck at ${done.status} (${done.matching.declined} drivers declined)` });
            p.thoughts.push('My ride never arrived.');
            p.satisfaction -= 3;
            try {
              api.ride.cancelRide(rideId);
            } catch {
              /* ignore */
            }
          } else {
            p.interestScore += 2;
            if (done.matching.declined > 0) p.thoughts.push(`One driver declined but the next one came quickly.`);
            if (chance(0.7)) step('Rate the driver', 'ride', () => void api.ride.rateRide(rideId, p.patience > 0.4 ? 5 : 4));
          }
        }
      }
    }

    // 6. Stays
    if (interests.includes('travel') || chance(0.15)) {
      const startIn = Math.round(between(1, 90));
      const nights = Math.round(between(1, 7));
      const props = api.bookings.listProperties({ guests: 2, checkIn: dateIn(startIn), checkOut: dateIn(startIn + nights) });
      const prop = props.length ? (chance(0.6) ? props[0] : pick(props)) : null;
      if (!prop) p.steps.push({ action: 'Book a stay', outcome: 'friction', service: 'stay', message: 'Nothing free for my dates' });
      if (prop) {
        const q = api.bookings.quoteStay(prop.id, dateIn(startIn), dateIn(startIn + nights));
        const budget = income === 'low' ? 40000 : income === 'middle' ? 150000 : 600000;
        if (q.totalCents > budget) p.steps.push({ action: 'Book a stay', outcome: 'skipped', service: 'stay', message: 'Too expensive' });
        else {
          const ok = step('Book a stay', 'stay', () => {
            api.bookings.bookStay({ propertyId: prop.id, checkIn: dateIn(startIn), checkOut: dateIn(startIn + nights), guests: 2, method: method(q.totalCents) });
            return { spentCents: q.totalCents, feesCents: q.serviceFeeCents };
          });
          if (ok) p.interestScore += 3;
          if (prop.country !== REGIONS.find((r) => r.code === country)!.name && prop.city !== p.city) p.thoughts.push(`Booked a trip to ${prop.city}.`);
        }
      }
    }

    // 7. Car rental
    if (interests.includes('cars') || chance(0.1)) {
      const startIn = Math.round(between(2, 60));
      const vehicles = api.bookings.listVehicles({ start: dateIn(startIn), end: dateIn(startIn + 3) });
      const v = vehicles.length ? pick(vehicles) : null;
      if (!v) p.steps.push({ action: 'Rent a car', outcome: 'friction', service: 'drive', message: 'No cars free for those dates' });
      else {
        const q = api.bookings.quoteRental(v.id, dateIn(startIn), dateIn(startIn + 3));
        const ok = step('Rent a car', 'drive', () => {
          api.bookings.bookRental({ vehicleId: v.id, start: dateIn(startIn), end: dateIn(startIn + 3), pickupLocation: v.location, returnLocation: v.location, method: method(q.totalCents), driverAge: age });
          return { spentCents: q.totalCents, feesCents: q.feesCents };
        });
        if (ok) {
          p.interestScore += 2;
          if (!v.location.toLowerCase().includes(p.city.toLowerCase().split(' ')[0])) p.thoughts.push(`The car I rented is in ${v.location}, not near me in ${p.city}.`);
        }
      }
    }

    // 8. Payments between people: split a bill, pay others' links, send money.
    if (interests.includes('payments') || chance(0.4)) {
      if (chance(0.5)) {
        const unsure = chance(0.3);
        step('Split a bill', 'pay', () => {
          const id = unsure ? api.requests.create({ kind: 'split', title: 'Dinner', amountCents: Math.round(between(10, 40)) * 100 }) : api.requests.create({ kind: 'split', title: 'Dinner', splitTotalCents: Math.round(between(40, 160)) * 100, people: Math.round(between(2, 6)) });
          const people = unsure ? 99 : (api.requests.get(id).split?.people ?? 2) - 1;
          openLinks.push({ id, owner: me.id, amountCents: api.requests.get(id).amountCents, left: people });
        });
      }
      // Pay up to two open links from other people.
      for (const l of openLinks.filter((x) => x.owner !== me.id && x.left > 0).slice(-6).filter(() => chance(0.35)).slice(0, 2)) {
        step('Pay a friend’s link', 'pay', () => {
          const m = balancesFor(accountIdFor(me.id)).available >= l.amountCents ? 'hayve' : 'card';
          api.requests.pay(l.id, m === 'hayve' ? { method: 'hayve' } : { method: 'card', card: { brand: 'Visa', last4: '4242' } });
          l.left -= 1;
          return { spentCents: l.amountCents };
        });
      }
      if (chance(0.3) && people.length > 1) {
        const other = pick(people.filter((x) => x.steps[0]?.outcome === 'ok'));
        const otherUser = other && getDb().users.find((u) => u.email === `${other.id}@example.com`);
        if (otherUser && balancesFor(accountIdFor(me.id)).available < 1000) p.steps.push({ action: 'Send money', outcome: 'skipped', service: 'pay', message: 'No balance to send from' });
        else if (otherUser) step('Send money', 'pay', () => {
          api.wallet.sendMoney(otherUser.id, 1000);
          return { spentCents: 1000 };
        });
      }
    }

    // 9. Some people try to withdraw what they added (common confusion with stored balances).
    if (chance(0.12)) {
      step('Set payout account', 'pay', () => {
        const reg = REGIONS.find((r) => r.code === country)!;
        api.wallet.setPayoutAccount(reg.account.label === 'IBAN' ? { holder: name, account: 'DE89370400440532013000' } : { holder: name, account: '000123456789', routing: '110000000' });
      });
      const w = api.wallet.withdrawable();
      const ok = step('Withdraw', 'pay', () => {
        api.wallet.withdraw(Math.max(100, Math.min(w.availableCents, 5000)));
      });
      if (!ok && w.heldTopUpsCents > 0) p.thoughts.push(`I couldn't withdraw money I just added. The 7-day hold was explained, but it surprised me.`);
    }

    // Score how the session felt.
    const s = p.steps;
    const frictions = s.filter((x) => x.outcome === 'friction').length;
    const bugsHere = s.filter((x) => x.outcome === 'bug').length;
    const oks = s.filter((x) => x.outcome === 'ok').length;
    const feeShare = p.spentCents ? p.feesCents / p.spentCents : 0;
    p.waveBackCents = getDb().transactions.filter((t) => t.type === 'wave_back' && t.toAccountId === accountIdFor(me.id)).reduce((a, t) => a + t.amountCents, 0);
    p.endBalanceCents = balancesFor(accountIdFor(me.id)).available;
    p.satisfaction = Math.max(1, Math.min(10, Math.round(p.satisfaction + oks * 0.35 - frictions * (1.2 - p.patience * 0.6) - bugsHere * 3 - Math.max(0, feeShare - 0.12) * 10 * p.priceSensitivity + (p.waveBackCents > 0 ? 0.5 : 0))));
    p.wouldRecommend = Math.max(0, Math.min(10, Math.round(p.satisfaction + between(-1.5, 1.5))));
    if (p.waveBackCents > 0) p.thoughts.push(`Got ${(p.waveBackCents / 100).toFixed(2)} Wave Back for paying with my balance.`);
    if (frictions === 0 && bugsHere === 0 && oks >= 3) p.thoughts.push(pick(['Everything just worked.', 'One app for everything is genuinely handy.', 'Fast checkout, clear prices.']));
    for (const f of s.filter((x) => x.outcome === 'friction')) p.thoughts.push(`Tried to ${f.action.toLowerCase()}: ${(f.message ?? '').replace(/\.$/, '')}.`);
    people.push(p);
    api.session.signOut();
  }

  if (!ledgerIsBalanced()) invariantFailures.push('Ledger out of balance');
  const negative = getDb().accounts.filter((a) => a.kind === 'user' && balancesFor(a.id).available < 0).length;
  if (negative) invariantFailures.push(`${negative} wallets with a negative balance`);

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
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), n: N, ms: Date.now() - t0, people, bugs, invariantFailures, revenueByService }, null, 0));
  console.log(`done ${N} in ${Date.now() - t0}ms · bugs ${bugs.length} · invariant failures ${invariantFailures.length}`);
});
