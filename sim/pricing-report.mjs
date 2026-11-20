/**
 * Price analysis from the 1,000-person simulation: everything customers paid above the base price,
 * which rule added it, why it applied, and who received it.
 *   node sim/pricing-report.mjs <outDir>   (reads sim/out/pricing.json, written by the simulation)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'out', 'pricing');
const q = JSON.parse(readFileSync(join(here, 'out', 'pricing.json'), 'utf8'));
const O = q.priced;
const SERVICE = { shop: 'Hayve Shop', bites: 'Hayve Bites', ride: 'Hayve Ride', stay: 'Hayve Stay', drive: 'Hayve Drive', pay: 'Hayve Pay' };
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const RULE = Object.fromEntries(q.rules.map((r) => [r.id, r]));

function when(r) {
  const c = r?.conditions ?? {};
  const p = [];
  if (c.zones) p.push(`pickup or drop-off at ${c.zones.join('/').replace('_', ' ')}`);
  if (c.hours) p.push(`between ${String(c.hours[0]).padStart(2, '0')}:00 and ${String(c.hours[1]).padStart(2, '0')}:00`);
  if (c.days) p.push(c.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', '));
  if (c.minDemand) p.push(`at least ${c.minDemand} ride requests per free driver nearby`);
  if (c.eventNearby) p.push('an event is on nearby');
  if (c.maxOrderCents) p.push(`basket under ${usd(c.maxOrderCents)}`);
  if (c.minDistanceKm) p.push(`${c.minDistanceKm}+ km`);
  if (c.maxLeadDays != null) p.push(`booked ${c.maxLeadDays} days ahead or less`);
  return p.length ? p.join(', ') : 'every order';
}
const amountText = (r) => (!r ? '' : r.amount.kind === 'fixed' ? usd(r.amount.value) + (r.component === 'waiting_fee' ? '/min' : '') : r.amount.kind === 'multiplier' ? `${r.amount.value}× the fare` : `${Math.round(r.amount.value * 1000) / 10}%${r.amount.maxCents ? ` (max ${usd(r.amount.maxCents)})` : ''}`);
const zone = (c) => (c >= 1800 ? 'international' : c >= 800 ? 'nearby country' : 'domestic');
const SPECIAL = {
  send_shipping: { name: 'Shipping (Hayve Send)', amount: '$3.95 / $8.95 / $18.95', when: 'every shipped item: domestic, nearby country or international', why: 'Pays the carrier. Further away costs more.', to: 'Hayve, which pays the carrier' },
  restaurant_delivery: { name: 'Restaurant delivery fee', amount: "set by each restaurant", when: 'restaurants that charge delivery', why: 'Set by the restaurant and paid to the courier.', to: 'The courier' },
  host_cleaning: { name: 'Cleaning fee', amount: 'set by each host', when: 'stays with a cleaning fee', why: 'Set by the host and paid to the host (Hayve takes its 15% on it too).', to: 'The host' },
  stay_taxes: { name: 'Taxes (stays)', amount: '7% of the stay', when: 'every stay', why: 'Collected to pass on to the tax authority. Currently a flat 7% in every country.', to: 'Tax authority (collected by Hayve)' },
  drive_insurance: { name: 'Trip insurance', amount: '$12.00 per day', when: 'every rental', why: 'Covers the car during the trip.', to: 'The insurer (held by Hayve in this demo)' },
  shop_buyer_fee: { name: 'Buyer fee (Shop)', amount: 'tiered, shown as "Fees"', when: 'every purchase', why: 'Buyer protection and payments. Sellers pay nothing and keep their full price.', to: 'Hayve' },
};
function reasonFor(o, l) {
  switch (l.ruleId) {
    case 'ride_demand': return `Busy: ${o.demand?.toFixed(1)} riders per free driver nearby`;
    case 'ride_airport': return 'Airport pickup or drop-off';
    case 'ride_night': return `Late-night ride (${o.time})`;
    case 'ride_event': return `Event nearby: ${o.events[0] ?? 'event'}`;
    case 'bites_small_order': return `Basket under ${usd(RULE.bites_small_order?.conditions.maxOrderCents ?? 1500)}`;
    case 'send_shipping': return `Shipping, ${zone(l.cents)}`;
    case 'restaurant_delivery': return 'Restaurant delivery fee, to the courier';
    case 'host_cleaning': return "Host's cleaning fee, to the host";
    case 'stay_taxes': return 'Taxes, passed to the tax authority';
    case 'drive_insurance': return 'Trip insurance, to the insurer';
    default: return 'Applies to every order';
  }
}

const base = sum(O, (o) => o.baseCents);
const onTop = sum(O, (o) => o.totalCents - o.baseCents);
const extras = sum(q.extras, (x) => x.cents);
const commission = sum(O, (o) => sum(o.supplierLines, (l) => l.cents));
const hayve = sum(O, (o) => o.hayveCents);
const line = (id) => sum(O, (o) => sum(o.customerLines.filter((l) => l.ruleId === id), (l) => l.cents));
const toCourier = line('restaurant_delivery');
const PASS = new Set(['pass_through', 'tax']);
const engine = (o) => o.customerLines.filter((l) => !PASS.has(l.component));
const receipt = {
  everyOrder: sum(O, (o) => sum(engine(o).filter((l) => l.component === 'service_fee' || l.component === 'booking_fee'), (l) => l.cents)),
  situational: sum(O, (o) => sum(engine(o).filter((l) => ['surcharge', 'demand', 'small_order_fee'].includes(l.component)), (l) => l.cents)),
  shipping: line('send_shipping'),
  delivery: toCourier,
  cleaning: line('host_cleaning'),
  taxes: line('stay_taxes'),
  insurance: line('drive_insurance'),
  driverExtras: sum(q.extras, (x) => x.cents),
  supplierPayout: sum(O, (o) => o.supplierCents),
};
const ordersBy = {};
for (const o of O) ordersBy[o.service] = (ordersBy[o.service] ?? 0) + 1;

// Every extra on top of the base price, by rule.
const byRule = {};
for (const o of O)
  for (const l of o.customerLines) {
    const x = (byRule[l.ruleId] ??= { ruleId: l.ruleId, service: SERVICE[o.service], label: l.label, component: l.component, n: 0, cents: 0, people: new Set() });
    x.n += 1;
    x.cents += l.cents;
    x.people.add(o.person);
  }
const rules = Object.values(byRule)
  .map((x) => {
    const r = RULE[x.ruleId];
    const s = SPECIAL[x.ruleId];
    return { ruleId: x.ruleId, service: x.service, name: s?.name ?? r?.name ?? x.label, label: x.label, amount: s?.amount ?? amountText(r), when: s?.when ?? when(r), why: s?.why ?? r?.rationale ?? '', to: s?.to ?? 'Hayve', n: x.n, people: x.people.size, cents: x.cents, share: x.n / ordersBy[Object.keys(SERVICE).find((k) => SERVICE[k] === x.service)] };
  })
  .sort((a, b) => b.cents - a.cents);
const extraGroups = Object.values(q.extras.reduce((m, x) => {
  const k = x.label.startsWith('Waiting') ? 'Waiting time' : 'Late cancellation';
  const g = (m[k] ??= { name: k, n: 0, cents: 0, why: x.why });
  g.n += 1;
  g.cents += x.cents;
  return m;
}, {}));

// What suppliers received after Hayve's commission.
const suppliers = Object.keys(SERVICE).filter((k) => ordersBy[k]).map((k) => {
  const os = O.filter((o) => o.service === k);
  const c = sum(os, (o) => sum(o.supplierLines, (l) => l.cents));
  const b = sum(os, (o) => o.baseCents);
  return { key: SERVICE[k], who: { shop: 'Sellers', bites: 'Restaurants', ride: 'Drivers', stay: 'Hosts', drive: 'Car owners' }[k], orders: os.length, baseCents: b, commissionCents: c, receivedCents: b - c, rate: b ? c / b : 0 };
});

// Rides by hour: why the same trip costs more at some times.
const rides = O.filter((o) => o.service === 'ride');
const hourOf = (t) => Number(t.slice(0, 2)) % 24;
const byHour = Array.from({ length: 24 }, (_, h) => {
  const rs = rides.filter((o) => hourOf(o.time) === h);
  const up = rs.map((o) => sum(o.customerLines.filter((l) => l.ruleId !== 'ride_booking_fee'), (l) => l.cents));
  return { key: String(h).padStart(2, '0'), n: rs.length, busy: rs.filter((o) => o.customerLines.some((l) => l.ruleId === 'ride_demand')).length, avgExtraCents: rs.length ? Math.round(sum(up, (x) => x) / rs.length) : 0 };
});
const byDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => {
  const rs = rides.filter((o) => o.weekday === d);
  return { key: d, n: rs.length, busy: rs.filter((o) => o.customerLines.some((l) => l.ruleId === 'ride_demand')).length };
});
const busy = rides.filter((o) => o.customerLines.some((l) => l.ruleId === 'ride_demand'));
const events = Object.values(rides.filter((o) => o.events.length).reduce((m, o) => {
  const g = (m[o.events[0]] ??= { name: o.events[0], rides: 0, feeCents: 0 });
  g.rides += 1;
  g.feeCents += sum(o.customerLines.filter((l) => l.ruleId === 'ride_event'), (l) => l.cents);
  return m;
}, {}));

// Safety checks.
const surchargeShare = O.map((o) => sum(o.customerLines.filter((l) => l.component === 'surcharge' || l.component === 'demand'), (l) => l.cents) / o.baseCents);
const groups = {};
for (const o of O) {
  // Only the rules' own charges: amounts set by the restaurant, host or insurer and shipping zones vary by listing.
  const own = engine(o).filter((l) => l.ruleId !== 'send_shipping');
  const k = [o.service, o.baseCents, own.map((l) => l.ruleId).sort().join('+'), o.events.join(), o.zones.slice().sort().join()].join('|');
  (groups[k] ??= new Set()).add(sum(own, (l) => l.cents));
}
const inconsistent = Object.values(groups).filter((s) => s.size > 1).length;
const checks = {
  maxSurchargeShare: Math.max(...surchargeShare),
  cap: q.guards.maxSurchargeShare,
  demandCap: q.guards.maxDemandMultiplier,
  demandApplied: RULE.ride_demand?.amount.value,
  maxDemandRatio: Math.max(...rides.map((o) => o.demand ?? 0)),
  emergencyCities: q.guards.emergencyCities,
  identicalGroups: Object.keys(groups).length,
  inconsistent,
  guardHits: O.filter((o) => o.guards.length).length,
};

// Per person.
const perPerson = Object.values(O.reduce((m, o) => {
  const x = (m[o.person] ??= { person: o.person, name: o.name, city: o.city, age: o.age, income: o.income, orders: 0, baseCents: 0, onTopCents: 0, reasons: {} });
  x.orders += 1;
  x.baseCents += o.baseCents;
  x.onTopCents += o.totalCents - o.baseCents;
  for (const l of o.customerLines) x.reasons[l.label] = (x.reasons[l.label] ?? 0) + l.cents;
  return m;
}, {}));
for (const x of q.extras) {
  const p = perPerson.find((y) => y.person === x.person);
  if (p) {
    p.onTopCents += x.cents;
    p.reasons[x.label.split(' ·')[0]] = (p.reasons[x.label.split(' ·')[0]] ?? 0) + x.cents;
  }
}
const pBands = [['$0–5', 0, 500], ['$5–10', 500, 1000], ['$10–25', 1000, 2500], ['$25–50', 2500, 5000], ['$50–100', 5000, 10000], ['$100–250', 10000, 25000], ['$250+', 25000, Infinity]];
const shareBands = [['0–5%', 0, 0.05], ['5–10%', 0.05, 0.1], ['10–15%', 0.1, 0.15], ['15–20%', 0.15, 0.2], ['20–35%', 0.2, 0.35], ['35%+', 0.35, Infinity]];
const feeOnly = (o) => sum(engine(o).filter((l) => l.component !== 'delivery_fee'), (l) => l.cents);

const summary = {
  n: new Set(O.map((o) => o.person)).size,
  orders: O.length,
  baseCents: base,
  onTopCents: onTop,
  extrasCents: extras,
  paidCents: base + onTop + extras,
  commissionCents: commission,
  hayveCents: hayve,
  toCourierCents: toCourier,
  receipt,
  shippingCents: sum(O, (o) => sum(o.customerLines.filter((l) => l.ruleId === 'send_shipping'), (l) => l.cents)),
  rules,
  extraGroups,
  suppliers,
  byHour,
  byDay,
  busy: { n: busy.length, rides: rides.length, cents: sum(busy, (o) => sum(o.customerLines.filter((l) => l.ruleId === 'ride_demand'), (l) => l.cents)) },
  events,
  eventList: q.events,
  checks,
  personBands: pBands.map(([key, lo, hi]) => ({ key, n: perPerson.filter((p) => p.onTopCents >= lo && p.onTopCents < hi).length })),
  shareBands: shareBands.map(([key, lo, hi]) => ({ key, n: O.filter((o) => feeOnly(o) / o.baseCents >= lo && feeOnly(o) / o.baseCents < hi).length })),
  topPeople: perPerson.sort((a, b) => b.onTopCents - a.onTopCents).slice(0, 10).map((p) => ({ ...p, reasons: Object.entries(p.reasons).sort((a, b) => b[1] - a[1]) })),
  topMarkups: [...O].filter((o) => feeOnly(o) > 0).sort((a, b) => feeOnly(b) / b.baseCents - feeOnly(a) / a.baseCents).slice(0, 10).map((o) => ({ name: o.name, city: o.city, when: `${o.weekday} ${o.time}`, service: SERVICE[o.service], item: o.item, base: o.baseCents, total: o.totalCents, lines: o.customerLines.map((l) => [l.label, l.cents, reasonFor(o, l)]) })),
  topShipping: [...O].filter((o) => o.service === 'shop').sort((a, b) => (b.totalCents - b.baseCents) / b.baseCents - (a.totalCents - a.baseCents) / a.baseCents).slice(0, 5).map((o) => ({ name: o.name, city: o.city, item: o.item, base: o.baseCents, total: o.totalCents, lines: o.customerLines.map((l) => [l.label, l.cents, reasonFor(o, l)]) })),
};
const orders = O.map((o) => [o.person, o.name, o.city, `${o.weekday} ${o.time}`, SERVICE[o.service], o.item, o.baseCents, o.totalCents - o.baseCents, o.customerLines.map((l) => [l.label, l.cents, reasonFor(o, l)]), sum(o.supplierLines, (l) => l.cents), o.hayveCents]);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'orders.json'), '[\n' + orders.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n');
const tpl = readFileSync(join(here, 'pricing.template.html'), 'utf8');
writeFileSync(join(out, 'index.html'), tpl.replace('/*SUMMARY*/null', () => JSON.stringify(summary).replace(/</g, '\\u003c')));
console.log(`pricing report → ${out}`);
