/**
 * Hayve pricing engine: market-wide contextual pricing with full traceability.
 *
 * Every price is: base (set by the supplier or the fare formula) + rules that match the context
 * (where, when, demand, events, order size, distance, lead time…). Each matching rule adds a
 * disclosed line (customer fee/surcharge) or changes the split (commission on the supplier).
 *
 * Guardrails (not optional):
 *  - Only market-wide signals. The engine never receives personal data; the person's id is used
 *    only to place them in an A/B experiment group, never to set their price.
 *  - Every customer-paid line is shown before payment (label + amount).
 *  - Demand pricing is capped (admin cap, default 1.8×) and switched off entirely in a city when an
 *    admin turns on emergency mode (storms, disasters, public-safety incidents).
 *  - Surcharges in total can't exceed a share of the base price (default 35%).
 *  - Every quote and charge is stored as an auditable price record (rules, versions, context).
 */
import type { Cents, ID } from './types';

export type PricedService = 'ride' | 'bites' | 'shop' | 'stay' | 'drive' | 'pay';
export type Zone = 'airport' | 'station' | 'city_centre' | 'tourist';
export type RuleComponent = 'surcharge' | 'service_fee' | 'booking_fee' | 'small_order_fee' | 'delivery_fee' | 'commission' | 'waiting_fee' | 'cancellation_fee' | 'fx_margin' | 'demand'
  /** Customer money that is not Hayve revenue: passed to the supplier, courier or insurer, or tax to remit. */
  | 'pass_through'
  | 'tax';

export interface RuleConditions {
  zones?: Zone[];
  countries?: string[];
  /** 0 = Sunday … 6 = Saturday. */
  days?: number[];
  /** Local hours [from, to), e.g. [7, 10]; wraps past midnight when from > to. */
  hours?: [number, number];
  months?: number[];
  /** Demand ratio (requests ÷ available supply) at or above this. */
  minDemand?: number;
  eventNearby?: boolean;
  minOrderCents?: number;
  maxOrderCents?: number;
  minDistanceKm?: number;
  /** Booking made at most / at least this many days ahead. */
  maxLeadDays?: number;
  minLeadDays?: number;
  /** For example a supplier tier ("new", "standard", "premium") or a restaurant/listing category. */
  supplierCategories?: string[];
  /** Cross-currency payments only (fx_margin). */
  crossCurrency?: boolean;
}

export interface PricingRule {
  id: string;
  name: string;
  service: PricedService;
  component: RuleComponent;
  /** fixed = cents · percent = share of base · multiplier = demand multiplier on the base. */
  amount: { kind: 'fixed' | 'percent' | 'multiplier'; value: number; minCents?: number; maxCents?: number };
  conditions: RuleConditions;
  /** Who pays: the customer (a disclosed line) or the supplier (taken from their payout). */
  payer: 'customer' | 'supplier';
  /** Customer-facing label, e.g. "Airport fee". */
  label: string;
  /** Why the charge exists (shown in admin and in the price explanation). */
  rationale: string;
  enabled: boolean;
  /** When set, the rule applies only to people in this experiment's test group. */
  experimentId?: string;
  priority: number;
  updatedAt: number;
}

export interface PricingEvent {
  id: string;
  name: string;
  lng: number;
  lat: number;
  radiusKm: number;
  startsAt: number;
  endsAt: number;
}

export interface PricingGuards {
  maxDemandMultiplier: number;
  maxSurchargeShare: number;
  /** City names (lower case) where demand pricing and event surcharges are off. */
  emergencyCities: string[];
  /** Estimated card processing cost for net-revenue reporting. */
  processingRate: number;
  processingFixedCents: number;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  /** Share of people in the test group (0–1). */
  share: number;
  status: 'draft' | 'running' | 'stopped';
  startedAt?: number;
  stoppedAt?: number;
}

export interface PricingContext {
  service: PricedService;
  at: number;
  country?: string | null;
  city?: string | null;
  zones: Zone[];
  demand?: number;
  eventNames?: string[];
  orderCents?: number;
  distanceKm?: number;
  leadDays?: number;
  supplierCategory?: string;
  crossCurrency?: boolean;
  /** Only for experiment groups. Never used to set a personal price. */
  bucketKey?: string | null;
}

export interface PriceLine {
  ruleId: string;
  label: string;
  component: RuleComponent;
  payer: 'customer' | 'supplier';
  cents: Cents;
}

export interface PriceBreakdown {
  service: PricedService;
  baseCents: Cents;
  /** Lines the customer pays on top of the base (all disclosed before payment). */
  customerLines: PriceLine[];
  /** Amounts taken from the supplier's payout (commission etc.). */
  supplierLines: PriceLine[];
  customerTotalCents: Cents;
  supplierPayoutCents: Cents;
  hayveRevenueCents: Cents;
  processingCostCents: Cents;
  netRevenueCents: Cents;
  /** Every rule considered, matched or not, with the reason. */
  trace: { ruleId: string; matched: boolean; reason: string }[];
  guards: string[];
}

export const DEFAULT_GUARDS: PricingGuards = { maxDemandMultiplier: 1.8, maxSurchargeShare: 0.35, emergencyCities: [], processingRate: 0.029, processingFixedCents: 30 };

const t0 = 0;
const rule = (r: Omit<PricingRule, 'updatedAt' | 'priority' | 'enabled'> & Partial<Pick<PricingRule, 'priority' | 'enabled'>>): PricingRule => ({ priority: 50, enabled: true, updatedAt: t0, ...r });

/**
 * Default rules. They encode the fees Hayve already charged (so nothing changes silently) plus
 * new contextual rules, several switched off until an admin turns them on or tests them.
 */
export const DEFAULT_RULES: PricingRule[] = [
  // ---- Ride
  rule({ id: 'ride_commission', name: 'Ride commission', service: 'ride', component: 'commission', amount: { kind: 'percent', value: 0.15 }, conditions: {}, payer: 'supplier', label: 'Hayve fee', rationale: 'Platform commission on every fare (drivers keep 85%).' }),
  rule({ id: 'ride_booking_fee', name: 'Booking fee', service: 'ride', component: 'booking_fee', amount: { kind: 'fixed', value: 99 }, conditions: {}, payer: 'customer', label: 'Booking fee', rationale: 'Covers safety features, insurance and support per trip.' }),
  rule({ id: 'ride_airport', name: 'Airport fee', service: 'ride', component: 'surcharge', amount: { kind: 'fixed', value: 350 }, conditions: { zones: ['airport'] }, payer: 'customer', label: 'Airport fee', rationale: 'Airport access fees and longer dead-head trips back to the city.' }),
  rule({ id: 'ride_station', name: 'Station pickup fee', service: 'ride', component: 'surcharge', amount: { kind: 'fixed', value: 100 }, conditions: { zones: ['station'] }, payer: 'customer', label: 'Station pickup fee', rationale: 'Designated pickup areas at stations take extra time.', enabled: false }),
  rule({ id: 'ride_night', name: 'Late-night surcharge', service: 'ride', component: 'surcharge', amount: { kind: 'percent', value: 0.1, maxCents: 500 }, conditions: { hours: [0, 5] }, payer: 'customer', label: 'Late-night fee', rationale: 'Fewer drivers overnight; compensates driving at night.' }),
  rule({ id: 'ride_demand', name: 'Busy-time pricing', service: 'ride', component: 'demand', amount: { kind: 'multiplier', value: 1.25 }, conditions: { minDemand: 1.5 }, payer: 'customer', label: 'Busy-time price', rationale: 'More requests than drivers nearby: a higher price brings more drivers online. Capped, and off in emergencies.' }),
  rule({ id: 'ride_event', name: 'Event surge', service: 'ride', component: 'surcharge', amount: { kind: 'percent', value: 0.15, maxCents: 800 }, conditions: { eventNearby: true }, payer: 'customer', label: 'Event fee', rationale: 'Concert/stadium crowds: extra drivers routed to the venue. Capped, off in emergencies.' }),
  rule({ id: 'ride_waiting', name: 'Waiting time', service: 'ride', component: 'waiting_fee', amount: { kind: 'fixed', value: 35 }, conditions: {}, payer: 'customer', label: 'Waiting time (per minute after 3 free minutes)', rationale: 'Pays the driver for time spent waiting at pickup.' }),
  rule({ id: 'ride_cancel', name: 'Late cancellation', service: 'ride', component: 'cancellation_fee', amount: { kind: 'fixed', value: 500 }, conditions: {}, payer: 'customer', label: 'Cancellation fee (more than 2 minutes after a driver accepted)', rationale: 'Compensates the driver for driving towards the pickup.' }),
  // ---- Bites
  rule({ id: 'bites_commission', name: 'Restaurant commission', service: 'bites', component: 'commission', amount: { kind: 'percent', value: 0.15 }, conditions: {}, payer: 'supplier', label: 'Hayve fee', rationale: 'Platform commission on the food subtotal (restaurants keep 85%).' }),
  rule({ id: 'bites_service', name: 'Service fee', service: 'bites', component: 'service_fee', amount: { kind: 'fixed', value: 149 }, conditions: {}, payer: 'customer', label: 'Service fee', rationale: 'Order handling, support and payment costs.' }),
  rule({ id: 'bites_small_order', name: 'Small order fee', service: 'bites', component: 'small_order_fee', amount: { kind: 'fixed', value: 200 }, conditions: { maxOrderCents: 1500 }, payer: 'customer', label: 'Small order fee', rationale: 'Delivery costs the same for small orders; this keeps them viable. Shown with how much to add to avoid it.' }),
  rule({ id: 'bites_distance', name: 'Long-distance delivery', service: 'bites', component: 'delivery_fee', amount: { kind: 'fixed', value: 150 }, conditions: { minDistanceKm: 5 }, payer: 'customer', label: 'Long-distance delivery', rationale: 'Couriers ride further; paid to the courier.', enabled: false }),
  rule({ id: 'bites_peak', name: 'Dinner rush', service: 'bites', component: 'surcharge', amount: { kind: 'fixed', value: 99 }, conditions: { hours: [18, 21], days: [5, 6] }, payer: 'customer', label: 'Busy-time fee', rationale: 'Friday/Saturday dinner peak: extra courier incentives.', enabled: false }),
  // ---- Shop (the tiered buyer fee lives in config.ts; Send shipping by zone in common.ts)
  rule({ id: 'shop_seller_fee', name: 'Seller transaction fee', service: 'shop', component: 'commission', amount: { kind: 'percent', value: 0.0, minCents: 0 }, conditions: {}, payer: 'supplier', label: 'Seller fee', rationale: 'Off by default: private sellers pay nothing; enable for business sellers via supplier category.', enabled: false }),
  rule({ id: 'shop_business_seller', name: 'Business seller commission', service: 'shop', component: 'commission', amount: { kind: 'percent', value: 0.05 }, conditions: { supplierCategories: ['business'] }, payer: 'supplier', label: 'Hayve Store fee', rationale: 'Verified stores get store pages, invoices and bulk tools.', enabled: false }),
  // ---- Stay
  rule({ id: 'stay_host_commission', name: 'Host commission', service: 'stay', component: 'commission', amount: { kind: 'percent', value: 0.15 }, conditions: {}, payer: 'supplier', label: 'Hayve fee', rationale: 'Platform commission (hosts keep 85%).' }),
  rule({ id: 'stay_service', name: 'Guest service fee', service: 'stay', component: 'service_fee', amount: { kind: 'percent', value: 0.12 }, conditions: {}, payer: 'customer', label: 'Service fee', rationale: 'Booking protection, support and payments.' }),
  rule({ id: 'stay_last_minute', name: 'Last-minute booking', service: 'stay', component: 'booking_fee', amount: { kind: 'percent', value: 0.03, maxCents: 3000 }, conditions: { maxLeadDays: 2 }, payer: 'customer', label: 'Last-minute booking fee', rationale: 'Same-week bookings need faster host confirmation and cleaning turnaround.', enabled: false }),
  rule({ id: 'stay_event', name: 'Event week', service: 'stay', component: 'surcharge', amount: { kind: 'percent', value: 0.05, maxCents: 5000 }, conditions: { eventNearby: true }, payer: 'customer', label: 'High-demand dates', rationale: 'Big events nearby. Hosts can also raise their own prices.', enabled: false }),
  // ---- Drive
  rule({ id: 'drive_host_commission', name: 'Rental commission', service: 'drive', component: 'commission', amount: { kind: 'percent', value: 0.15 }, conditions: {}, payer: 'supplier', label: 'Hayve fee', rationale: 'Platform commission (hosts keep 85%).' }),
  rule({ id: 'drive_service', name: 'Rental service fee', service: 'drive', component: 'service_fee', amount: { kind: 'percent', value: 0.08 }, conditions: {}, payer: 'customer', label: 'Service fee', rationale: 'Trip protection, support and payments.' }),
  rule({ id: 'drive_airport', name: 'Airport collection', service: 'drive', component: 'surcharge', amount: { kind: 'fixed', value: 1500 }, conditions: { zones: ['airport'] }, payer: 'customer', label: 'Airport collection fee', rationale: 'Airport parking and concession fees for handover.' }),
  // ---- Pay
  rule({ id: 'pay_fx', name: 'Currency conversion', service: 'pay', component: 'fx_margin', amount: { kind: 'percent', value: 0.015 }, conditions: { crossCurrency: true }, payer: 'customer', label: 'Currency conversion', rationale: 'Paying in another currency: shown as a separate line before you pay.', enabled: false }),
];

/* --------------------------------------------------------------- utils -- */

/** Stable 0–1 hash for experiment groups. */
export function bucket(key: string, experimentId: string) {
  let h = 2166136261;
  for (const ch of `${experimentId}:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function inHours(hour: number, [from, to]: [number, number]) {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

function matches(r: PricingRule, ctx: PricingContext, guards: PricingGuards, experiments: Experiment[]): { ok: boolean; reason: string } {
  if (!r.enabled) return { ok: false, reason: 'rule is off' };
  if (r.service !== ctx.service) return { ok: false, reason: 'other service' };
  const c = r.conditions;
  const d = new Date(ctx.at);
  const emergency = !!ctx.city && guards.emergencyCities.includes(ctx.city.toLowerCase());
  if ((r.component === 'demand' || c.eventNearby) && emergency) return { ok: false, reason: `emergency mode in ${ctx.city}` };
  if (r.experimentId) {
    const e = experiments.find((x) => x.id === r.experimentId);
    if (!e || e.status !== 'running') return { ok: false, reason: 'experiment not running' };
    if (!ctx.bucketKey || bucket(ctx.bucketKey, e.id) >= e.share) return { ok: false, reason: 'control group' };
  }
  if (c.zones && !c.zones.some((z) => ctx.zones.includes(z))) return { ok: false, reason: `not in ${c.zones.join('/')}` };
  if (c.countries && (!ctx.country || !c.countries.includes(ctx.country))) return { ok: false, reason: 'other country' };
  if (c.days && !c.days.includes(d.getDay())) return { ok: false, reason: 'other day' };
  if (c.hours && !inHours(d.getHours(), c.hours)) return { ok: false, reason: 'outside hours' };
  if (c.months && !c.months.includes(d.getMonth() + 1)) return { ok: false, reason: 'other month' };
  if (c.minDemand != null && (ctx.demand ?? 0) < c.minDemand) return { ok: false, reason: `demand ${(ctx.demand ?? 0).toFixed(2)} below ${c.minDemand}` };
  if (c.eventNearby && !(ctx.eventNames ?? []).length) return { ok: false, reason: 'no event nearby' };
  if (c.minOrderCents != null && (ctx.orderCents ?? 0) < c.minOrderCents) return { ok: false, reason: 'order below minimum' };
  if (c.maxOrderCents != null && (ctx.orderCents ?? 0) >= c.maxOrderCents) return { ok: false, reason: 'order above threshold' };
  if (c.minDistanceKm != null && (ctx.distanceKm ?? 0) < c.minDistanceKm) return { ok: false, reason: 'shorter distance' };
  if (c.maxLeadDays != null && (ctx.leadDays ?? 999) > c.maxLeadDays) return { ok: false, reason: 'booked further ahead' };
  if (c.minLeadDays != null && (ctx.leadDays ?? 0) < c.minLeadDays) return { ok: false, reason: 'booked too late' };
  if (c.supplierCategories && (!ctx.supplierCategory || !c.supplierCategories.includes(ctx.supplierCategory))) return { ok: false, reason: 'other supplier category' };
  if (c.crossCurrency && !ctx.crossCurrency) return { ok: false, reason: 'same currency' };
  return { ok: true, reason: 'matched' };
}

function amountOf(r: PricingRule, base: number) {
  const a = r.amount;
  let cents = a.kind === 'fixed' ? a.value : a.kind === 'percent' ? Math.round(base * a.value) : 0;
  if (a.minCents != null) cents = Math.max(cents, a.minCents);
  if (a.maxCents != null) cents = Math.min(cents, a.maxCents);
  return Math.max(0, Math.round(cents));
}

/** Components priced at checkout (waiting and cancellation fees apply later, when they happen). */
const AT_CHECKOUT = new Set<RuleComponent>(['surcharge', 'service_fee', 'booking_fee', 'small_order_fee', 'delivery_fee', 'commission', 'fx_margin', 'demand']);

/**
 * Prices one transaction. `baseCents` is the supplier price or the fare before rules.
 * Commission lines reduce the supplier payout; customer lines add to what the customer pays.
 */
export function priceTransaction(baseCents: number, ctx: PricingContext, rules: PricingRule[], guards: PricingGuards = DEFAULT_GUARDS, experiments: Experiment[] = []): PriceBreakdown {
  const trace: PriceBreakdown['trace'] = [];
  const notes: string[] = [];
  const customerLines: PriceLine[] = [];
  const supplierLines: PriceLine[] = [];
  const sorted = rules.filter((r) => r.service === ctx.service).sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (!AT_CHECKOUT.has(r.component)) {
      trace.push({ ruleId: r.id, matched: false, reason: 'charged only when it happens' });
      continue;
    }
    const m = matches(r, ctx, guards, experiments);
    trace.push({ ruleId: r.id, matched: m.ok, reason: m.reason });
    if (!m.ok) continue;
    if (r.component === 'demand') {
      const mult = Math.min(r.amount.value, guards.maxDemandMultiplier);
      if (mult < r.amount.value) notes.push(`demand multiplier capped at ${guards.maxDemandMultiplier}×`);
      const cents = Math.round(baseCents * (mult - 1));
      if (cents > 0) customerLines.push({ ruleId: r.id, label: r.label, component: r.component, payer: 'customer', cents });
      continue;
    }
    const cents = amountOf(r, baseCents);
    if (cents <= 0) continue;
    (r.payer === 'customer' ? customerLines : supplierLines).push({ ruleId: r.id, label: r.label, component: r.component, payer: r.payer, cents });
  }
  // Cap discretionary surcharges (demand, surcharges, booking/small-order fees) to a share of the base.
  const discretionary = customerLines.filter((l) => l.component === 'surcharge' || l.component === 'demand');
  const cap = Math.round(baseCents * guards.maxSurchargeShare);
  const sum = discretionary.reduce((a, l) => a + l.cents, 0);
  if (sum > cap && sum > 0) {
    const f = cap / sum;
    for (const l of discretionary) l.cents = Math.round(l.cents * f);
    notes.push(`surcharges capped at ${Math.round(guards.maxSurchargeShare * 100)}% of the base price`);
  }
  const customerExtra = customerLines.reduce((a, l) => a + l.cents, 0);
  const commission = supplierLines.reduce((a, l) => a + l.cents, 0);
  const customerTotalCents = baseCents + customerExtra;
  // Delivery lines go to the courier, not Hayve.
  const passThrough = customerLines.filter((l) => l.component === 'delivery_fee').reduce((a, l) => a + l.cents, 0);
  const hayveRevenueCents = customerExtra - passThrough + commission;
  const processingCostCents = customerTotalCents > 0 ? Math.round(customerTotalCents * guards.processingRate) + guards.processingFixedCents : 0;
  return {
    service: ctx.service,
    baseCents,
    customerLines,
    supplierLines,
    customerTotalCents,
    supplierPayoutCents: baseCents - commission,
    hayveRevenueCents,
    processingCostCents,
    netRevenueCents: hayveRevenueCents - processingCostCents,
    trace,
    guards: notes,
  };
}

/* ---------------------------------------------------------- simulator -- */

/** Price elasticity of demand per service (share of orders lost per 1% higher customer price). */
export const ELASTICITY: Record<PricedService, number> = { ride: 0.6, bites: 0.9, shop: 1.2, stay: 1.0, drive: 0.8, pay: 0.4 };

export interface SimOrder {
  service: PricedService;
  baseCents: number;
  ctx: PricingContext;
}

export interface ScenarioResult {
  orders: number;
  keptOrders: number;
  conversionChangePct: number;
  customerSpendCents: number;
  hayveRevenueCents: number;
  netRevenueCents: number;
  supplierPayoutCents: number;
  avgOrderCents: number;
  byService: Record<string, { orders: number; kept: number; revenueCents: number; netCents: number }>;
}

/**
 * Re-prices a set of orders under a rule set and estimates how many would still happen (constant
 * elasticity on the customer total vs. the baseline). Used before any change goes live.
 */
export function simulate(orders: SimOrder[], rules: PricingRule[], baseline: PricingRule[], guards: PricingGuards = DEFAULT_GUARDS): ScenarioResult {
  const byService: ScenarioResult['byService'] = {};
  let kept = 0;
  let spend = 0;
  let rev = 0;
  let net = 0;
  let payout = 0;
  for (const o of orders) {
    const before = priceTransaction(o.baseCents, o.ctx, baseline, guards);
    const after = priceTransaction(o.baseCents, o.ctx, rules, guards);
    const change = before.customerTotalCents ? (after.customerTotalCents - before.customerTotalCents) / before.customerTotalCents : 0;
    const p = Math.max(0, Math.min(1.2, 1 - ELASTICITY[o.service] * change));
    kept += p;
    spend += after.customerTotalCents * p;
    rev += after.hayveRevenueCents * p;
    net += after.netRevenueCents * p;
    payout += after.supplierPayoutCents * p;
    const s = (byService[o.service] ??= { orders: 0, kept: 0, revenueCents: 0, netCents: 0 });
    s.orders += 1;
    s.kept += p;
    s.revenueCents += after.hayveRevenueCents * p;
    s.netCents += after.netRevenueCents * p;
  }
  const round = (n: number) => Math.round(n);
  for (const k of Object.keys(byService)) {
    byService[k].kept = Math.round(byService[k].kept * 10) / 10;
    byService[k].revenueCents = round(byService[k].revenueCents);
    byService[k].netCents = round(byService[k].netCents);
  }
  return { orders: orders.length, keptOrders: Math.round(kept * 10) / 10, conversionChangePct: orders.length ? Math.round(((kept - orders.length) / orders.length) * 1000) / 10 : 0, customerSpendCents: round(spend), hayveRevenueCents: round(rev), netRevenueCents: round(net), supplierPayoutCents: round(payout), avgOrderCents: kept ? round(spend / kept) : 0, byService };
}

export interface PriceRecord {
  id: ID;
  service: PricedService;
  refId?: ID;
  kind: 'quote' | 'charge';
  at: number;
  context: Omit<PricingContext, 'bucketKey'>;
  breakdown: Omit<PriceBreakdown, 'trace'> & { trace: PriceBreakdown['trace'] };
  rulesVersion: number;
}
