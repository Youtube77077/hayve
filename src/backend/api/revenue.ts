import { haversineKm, PLACES } from '../places';
import { DEFAULT_GUARDS, DEFAULT_RULES, type Experiment, type PriceBreakdown, type PricedService, type PriceRecord, priceTransaction, type PricingContext, type PricingEvent, type PricingGuards, type PricingRule, simulate, type SimOrder, type Zone } from '../pricing';
import { REGIONS } from '../regions';
import { assert, commit, find, getDb, now, uid } from '../store';
import type { ID } from '../types';
import { audit } from './common';
import { getSessionUserId, requireAdmin } from './session';

/**
 * Revenue intelligence: the pricing engine wired to Hayve's data, admin controls, scenario
 * simulation, experiments and per-transaction audit records.
 */

export interface PricingState {
  version: number;
  rules: PricingRule[];
  guards: PricingGuards;
  events: PricingEvent[];
  experiments: Experiment[];
}

export function pricingState(): PricingState {
  const db = getDb();
  if (!db.pricing) db.pricing = { version: 1, rules: DEFAULT_RULES.map((r) => ({ ...r, updatedAt: now() })), guards: { ...DEFAULT_GUARDS }, events: [], experiments: [] };
  // Add rules introduced in later versions without touching admin edits.
  for (const r of DEFAULT_RULES) if (!db.pricing.rules.some((x) => x.id === r.id)) db.pricing.rules.push({ ...r, updatedAt: now() });
  db.pricing.guards = { ...DEFAULT_GUARDS, ...db.pricing.guards };
  db.priceRecords ??= [];
  return db.pricing;
}

/* ------------------------------------------------------------ context -- */

const AIRPORT = /airport|jfk|lax|lga|heathrow|schiphol|charles de gaulle|pearson/i;
const STATION = /station|terminal|centraal|hauptbahnhof|gare |king's cross|penn/i;
const TOURIST = /times square|louvre|tower bridge|brandenburg|santa monica|central park|rijksmuseum|grafton|hollywood|eiffel/i;

/** Zones around a point (and its name), from the known places nearby. */
export function zonesAt(p: { lng: number; lat: number; name?: string; address?: string }): Zone[] {
  const out = new Set<Zone>();
  const text = `${p.name ?? ''} ${p.address ?? ''}`;
  const near = PLACES.filter((x) => haversineKm(p, x) < 1.2);
  if (AIRPORT.test(text) || near.some((x) => AIRPORT.test(x.name))) out.add('airport');
  if (STATION.test(text) || near.some((x) => STATION.test(x.name) && haversineKm(p, x) < 0.4)) out.add('station');
  if (TOURIST.test(text) || near.some((x) => TOURIST.test(x.name) && haversineKm(p, x) < 0.6)) out.add('tourist');
  const city = REGIONS.map((r) => r.city).find((c) => haversineKm(p, c) < 2.5);
  if (city) out.add('city_centre');
  return [...out];
}

/** Nearest known city and its country (for emergency mode and country rules). */
export function cityAt(p: { lng: number; lat: number }) {
  let best: { name: string; country: string; km: number } | null = null;
  for (const r of REGIONS) {
    const km = haversineKm(p, r.city);
    if (!best || km < best.km) best = { name: r.city.name, country: r.code, km };
  }
  return best && best.km < 80 ? best : null;
}

export function eventsNear(p: { lng: number; lat: number }, at = now()) {
  return pricingState().events.filter((e) => e.startsAt <= at && at <= e.endsAt && haversineKm(p, e) <= e.radiusKm);
}

export interface ContextInput {
  at?: number;
  points?: { lng: number; lat: number; name?: string; address?: string }[];
  demand?: number;
  orderCents?: number;
  distanceKm?: number;
  leadDays?: number;
  supplierCategory?: string;
  crossCurrency?: boolean;
  country?: string | null;
}

export function contextFor(service: PricedService, input: ContextInput = {}): PricingContext {
  const at = input.at ?? now();
  const points = input.points ?? [];
  const zones = [...new Set(points.flatMap((p) => zonesAt(p)))];
  const city = points[0] ? cityAt(points[0]) : null;
  const events = points.flatMap((p) => eventsNear(p, at)).map((e) => e.name);
  return { service, at, country: input.country ?? city?.country ?? null, city: city?.name ?? null, zones, demand: input.demand, eventNames: [...new Set(events)], orderCents: input.orderCents, distanceKm: input.distanceKm, leadDays: input.leadDays, supplierCategory: input.supplierCategory, crossCurrency: input.crossCurrency, bucketKey: getSessionUserId() };
}

/** Prices a transaction with the live rules. */
export function priceFor(service: PricedService, baseCents: number, input: ContextInput = {}): PriceBreakdown {
  const st = pricingState();
  return priceTransaction(baseCents, contextFor(service, input), st.rules, st.guards, st.experiments);
}

export interface ExtraLine {
  ruleId: string;
  label: string;
  cents: number;
  /** Who the money is for. Only the supplier's share counts toward the supplier payout; none of it is Hayve revenue. */
  to: 'supplier' | 'courier' | 'insurer' | 'tax';
  reason: string;
}

/**
 * Completes an engine breakdown with the parts of the customer total the engine doesn't price
 * (cleaning fee, restaurant delivery, insurance, taxes) so the audit record matches what was charged.
 * `commissionCents` replaces the engine commission when the service takes it on a wider base.
 */
export function withExtras(b: PriceBreakdown, extras: ExtraLine[], commissionCents?: number): PriceBreakdown {
  const lines = extras.filter((x) => x.cents > 0);
  const engineCommission = b.supplierLines.reduce((a, l) => a + l.cents, 0);
  const commissionDelta = commissionCents != null && b.supplierLines.length ? commissionCents - engineCommission : 0;
  if (!lines.length && !commissionDelta) return b;
  const g = pricingState().guards;
  const total = b.customerTotalCents + lines.reduce((a, x) => a + x.cents, 0);
  const processing = Math.round(total * g.processingRate + g.processingFixedCents);
  const hayve = b.hayveRevenueCents + commissionDelta;
  return {
    ...b,
    customerLines: [...b.customerLines, ...lines.map((x) => ({ ruleId: x.ruleId, label: x.label, component: x.to === 'tax' ? ('tax' as const) : ('pass_through' as const), payer: 'customer' as const, cents: x.cents }))],
    supplierLines: commissionDelta ? b.supplierLines.map((l, i) => (i === 0 ? { ...l, cents: l.cents + commissionDelta } : l)) : b.supplierLines,
    customerTotalCents: total,
    supplierPayoutCents: b.supplierPayoutCents + lines.filter((x) => x.to === 'supplier').reduce((a, x) => a + x.cents, 0) - commissionDelta,
    hayveRevenueCents: hayve,
    processingCostCents: processing,
    netRevenueCents: hayve - processing,
    trace: [...b.trace, ...lines.map((x) => ({ ruleId: x.ruleId, matched: true, reason: x.reason }))],
  };
}

/** Stores the price of a charged transaction so it can always be explained and audited. */
export function recordPrice(service: PricedService, refId: ID, breakdown: PriceBreakdown, input: ContextInput = {}) {
  const db = getDb();
  const st = pricingState();
  const { bucketKey: _b, ...context } = contextFor(service, input);
  const rec: PriceRecord = { id: uid('pr'), service, refId, kind: 'charge', at: now(), context, breakdown, rulesVersion: st.version };
  db.priceRecords!.push(rec);
  if (db.priceRecords!.length > 5000) db.priceRecords!.splice(0, db.priceRecords!.length - 5000);
  return rec.id;
}

/** The customer-facing lines of a price, for disclosure before payment. */
export const disclosed = (b: PriceBreakdown) => b.customerLines.map((l) => ({ label: l.label, cents: l.cents }));

/* -------------------------------------------------------------- admin -- */

export function rules() {
  requireAdmin();
  return pricingState().rules.slice().sort((a, b) => a.service.localeCompare(b.service) || b.priority - a.priority);
}

function bump(st: PricingState, actor: ID, action: string, target: string) {
  st.version += 1;
  audit(actor, action, target);
  commit();
}

export function updateRule(id: string, patch: Partial<Pick<PricingRule, 'enabled' | 'amount' | 'conditions' | 'label' | 'name' | 'rationale' | 'experimentId' | 'priority'>>) {
  const admin = requireAdmin();
  const st = pricingState();
  const r = find(st.rules, (x) => x.id === id, 'Rule');
  if (patch.amount) {
    const a = patch.amount;
    assert(a.value >= 0, 'invalid', 'Amounts must be positive');
    if (a.kind === 'percent') assert(a.value <= 0.4, 'invalid', 'Percentages above 40% are not allowed');
    if (a.kind === 'multiplier') assert(a.value >= 1 && a.value <= st.guards.maxDemandMultiplier, 'invalid', `Multipliers must be 1–${st.guards.maxDemandMultiplier}×`);
    if (a.kind === 'fixed') assert(a.value <= 10_000, 'invalid', 'Fixed fees above 100.00 are not allowed');
  }
  if (patch.label != null) assert(patch.label.trim().length >= 3, 'invalid', 'Every fee needs a clear customer-facing name');
  Object.assign(r, patch, { updatedAt: now() });
  bump(st, admin.id, 'pricing.rule.update', `${id} ${JSON.stringify(patch)}`);
}

export function createRule(input: Omit<PricingRule, 'id' | 'updatedAt' | 'priority'> & { priority?: number }) {
  const admin = requireAdmin();
  const st = pricingState();
  assert(input.label.trim().length >= 3 && input.rationale.trim().length >= 10, 'invalid', 'Give the fee a clear name and a reason customers would understand');
  const r: PricingRule = { priority: 40, ...input, id: uid('rule'), updatedAt: now() };
  st.rules.push(r);
  bump(st, admin.id, 'pricing.rule.create', r.id);
  return r.id;
}

export function deleteRule(id: string) {
  const admin = requireAdmin();
  const st = pricingState();
  assert(!DEFAULT_RULES.some((r) => r.id === id), 'invalid', 'Built-in rules can be switched off but not deleted');
  st.rules = st.rules.filter((r) => r.id !== id);
  bump(st, admin.id, 'pricing.rule.delete', id);
}

export function guards() {
  requireAdmin();
  return pricingState().guards;
}

export function updateGuards(patch: Partial<PricingGuards>) {
  const admin = requireAdmin();
  const st = pricingState();
  const next = { ...st.guards, ...patch };
  assert(next.maxDemandMultiplier >= 1 && next.maxDemandMultiplier <= 2.5, 'invalid', 'The demand cap must be 1–2.5×');
  assert(next.maxSurchargeShare >= 0 && next.maxSurchargeShare <= 0.6, 'invalid', 'Surcharges can be at most 60% of the base');
  st.guards = { ...next, emergencyCities: next.emergencyCities.map((c) => c.trim().toLowerCase()).filter(Boolean) };
  bump(st, admin.id, 'pricing.guards', JSON.stringify(st.guards));
}

/** Emergency mode: no demand pricing or event surcharges in a city (storms, disasters, incidents). */
export function setEmergency(city: string, on: boolean) {
  const g = guards();
  const c = city.trim().toLowerCase();
  updateGuards({ emergencyCities: on ? [...new Set([...g.emergencyCities, c])] : g.emergencyCities.filter((x) => x !== c) });
}

export function events() {
  requireAdmin();
  return pricingState().events;
}

export function addEvent(input: Omit<PricingEvent, 'id'>) {
  const admin = requireAdmin();
  const st = pricingState();
  assert(input.name.trim().length >= 3, 'invalid', 'Name the event');
  assert(input.endsAt > input.startsAt, 'invalid', 'The event must end after it starts');
  assert(input.radiusKm > 0 && input.radiusKm <= 10, 'invalid', 'Radius must be up to 10 km');
  const e = { ...input, id: uid('ev') };
  st.events.push(e);
  bump(st, admin.id, 'pricing.event.add', e.name);
  return e.id;
}

export function removeEvent(id: string) {
  const admin = requireAdmin();
  const st = pricingState();
  st.events = st.events.filter((e) => e.id !== id);
  bump(st, admin.id, 'pricing.event.remove', id);
}

/* --------------------------------------------------------- experiments -- */

export function experiments() {
  requireAdmin();
  const st = pricingState();
  const db = getDb();
  return st.experiments.map((e) => {
    const recs = db.priceRecords!.filter((r) => e.startedAt && r.at >= e.startedAt && (!e.stoppedAt || r.at <= e.stoppedAt));
    const ruleIds = st.rules.filter((r) => r.experimentId === e.id).map((r) => r.id);
    const test = recs.filter((r) => r.breakdown.trace.some((t) => ruleIds.includes(t.ruleId) && t.matched));
    const control = recs.filter((r) => r.breakdown.trace.some((t) => ruleIds.includes(t.ruleId) && t.reason === 'control group'));
    const sum = (rs: PriceRecord[]) => ({ orders: rs.length, revenueCents: rs.reduce((a, r) => a + r.breakdown.hayveRevenueCents, 0), netCents: rs.reduce((a, r) => a + r.breakdown.netRevenueCents, 0), avgOrderCents: rs.length ? Math.round(rs.reduce((a, r) => a + r.breakdown.customerTotalCents, 0) / rs.length) : 0 });
    return { ...e, rules: ruleIds, test: sum(test), control: sum(control) };
  });
}

export function createExperiment(input: { name: string; hypothesis: string; share: number; ruleIds: string[] }) {
  const admin = requireAdmin();
  const st = pricingState();
  assert(input.share > 0 && input.share <= 0.5, 'invalid', 'Test groups can be up to 50% of people');
  assert(input.ruleIds.length > 0, 'invalid', 'Choose at least one rule to test');
  const e: Experiment = { id: uid('exp'), name: input.name.trim(), hypothesis: input.hypothesis.trim(), share: input.share, status: 'draft' };
  st.experiments.push(e);
  for (const id of input.ruleIds) find(st.rules, (r) => r.id === id, 'Rule').experimentId = e.id;
  bump(st, admin.id, 'pricing.experiment.create', e.name);
  return e.id;
}

export function setExperimentStatus(id: string, status: 'running' | 'stopped') {
  const admin = requireAdmin();
  const st = pricingState();
  const e = find(st.experiments, (x) => x.id === id, 'Experiment');
  e.status = status;
  if (status === 'running') e.startedAt = now();
  else e.stoppedAt = now();
  bump(st, admin.id, `pricing.experiment.${status}`, id);
}

/* ------------------------------------------------------- dashboards -- */

/** Revenue by service from audited price records (customer paid, supplier payout, Hayve, costs, net). */
export function dashboard() {
  requireAdmin();
  const db = getDb();
  const out: Record<string, { orders: number; customerCents: number; supplierCents: number; hayveCents: number; processingCents: number; netCents: number; refundsCents: number }> = {};
  for (const r of db.priceRecords!) {
    const s = (out[r.service] ??= { orders: 0, customerCents: 0, supplierCents: 0, hayveCents: 0, processingCents: 0, netCents: 0, refundsCents: 0 });
    s.orders += 1;
    s.customerCents += r.breakdown.customerTotalCents;
    s.supplierCents += r.breakdown.supplierPayoutCents;
    s.hayveCents += r.breakdown.hayveRevenueCents;
    s.processingCents += r.breakdown.processingCostCents;
    s.netCents += r.breakdown.netRevenueCents;
  }
  for (const t of db.transactions.filter((x) => x.type === 'refund')) {
    const kind = t.ref?.kind;
    const svc = kind === 'ride' ? 'ride' : kind === 'food' ? 'bites' : kind === 'stay' ? 'stay' : kind === 'rental' ? 'drive' : kind === 'order' ? 'shop' : null;
    if (svc && out[svc]) out[svc].refundsCents += t.amountCents;
  }
  return out;
}

/** Recent price records (newest first) with their full trace. */
export function records(limit = 50) {
  requireAdmin();
  return getDb().priceRecords!.slice(-limit).reverse();
}

/* --------------------------------------------------------- scenarios -- */

export type ScenarioChange = { ruleId: string; patch: Partial<Pick<PricingRule, 'enabled' | 'amount'>> };

/**
 * "What if": re-prices recent orders (or a supplied sample) with changed rules and estimates
 * orders kept, revenue and net margin. Nothing goes live.
 */
export function runScenario(changes: ScenarioChange[], sample?: SimOrder[]) {
  requireAdmin();
  const st = pricingState();
  const baseline = st.rules;
  const changed = baseline.map((r) => {
    const c = changes.find((x) => x.ruleId === r.id);
    return c ? { ...r, ...c.patch, amount: { ...r.amount, ...(c.patch.amount ?? {}) } } : r;
  });
  const orders = sample ?? getDb().priceRecords!.slice(-2000).map((r) => ({ service: r.service, baseCents: r.breakdown.baseCents, ctx: { ...r.context, bucketKey: null } }));
  return { before: simulate(orders, baseline, baseline, st.guards), after: simulate(orders, changed, baseline, st.guards) };
}
