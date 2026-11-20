/**
 * Builds the simulation report from sim/out/results.json.
 *   node sim/report.mjs <outDir>
 * Writes <outDir>/index.html (summary + charts) and <outDir>/people.json (every person, every step).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'out', 'report');
const r = JSON.parse(readFileSync(join(here, 'out', 'results.json'), 'utf8'));
const P = r.people;
const count = (arr, key) => arr.reduce((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const avg = (arr, f) => (arr.length ? sum(arr, f) / arr.length : 0);
const rows = (obj) => Object.entries(obj).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
const SERVICE = { account: 'Sign-up', pay: 'Hayve Pay', shop: 'Hayve Shop', bites: 'Hayve Bites', ride: 'Hayve Ride', stay: 'Hayve Stay', drive: 'Hayve Drive' };
const INTEREST = { shopping: 'Shopping', food: 'Food delivery', groceries: 'Groceries', rides: 'Rides', travel: 'Travel & stays', cars: 'Car rental', payments: 'Paying friends' };

const steps = P.flatMap((p) => p.steps);
const byService = {};
for (const s of steps) {
  if (s.service === 'account') continue;
  const x = (byService[s.service] ??= { ok: 0, friction: 0, skipped: 0, bug: 0 });
  x[s.outcome] += 1;
}
const norm = (m) => m.replace(/Nothing free in .* for my dates/, 'Nothing free in that city for my dates').replace(/(withdraw up to )\S+/, '$1…');
const reasons = rows(count(steps.filter((s) => s.outcome !== 'ok'), (s) => `${s.action}|${s.outcome}|${norm(s.message ?? '')}`)).map(({ key, n }) => {
  const [action, outcome, message] = key.split('|');
  return { action, outcome, message, n };
});

const themeOf = (t) =>
  t
    .replace(/\$[\d.,]+/g, '$…')
    .replace(/Booked .+ for \d+ nights\./, 'Booked a trip.')
    .replace(/Ships from [^;]+;/, 'Ships from another country;')
    .replace(/Shipping from .+ was .+ on a .+ item\./, 'Shipping from abroad cost too much.')
    .replace(/Fees were \d+% of the price .*/, 'Fees were a big part of the ride price.')
    .replace(/\d+ nights in .+ is too much for me\./, 'That stay is too much for me.')
    .replace(/^.+ for \$… is more than I want to spend right now\./, 'More than I want to spend right now.');
const themes = {};
for (const p of P)
  for (const t of p.thoughts) {
    const k = themeOf(t);
    const x = (themes[k] ??= { n: 0, sample: t, who: `${p.name}, ${p.age}, ${p.city}` });
    x.n += 1;
  }

const ageBand = (a) => (a < 25 ? '18–24' : a < 35 ? '25–34' : a < 45 ? '35–44' : a < 55 ? '45–54' : a < 65 ? '55–64' : '65+');
const group = (key) =>
  rows(count(P, key)).map(({ key: k, n }) => {
    const g = P.filter((p) => key(p) === k);
    return { key: k, n, satisfaction: avg(g, (p) => p.satisfaction), spentCents: avg(g, (p) => p.spentCents) };
  });
const pro = P.filter((p) => p.wouldRecommend >= 9).length;
const det = P.filter((p) => p.wouldRecommend <= 6).length;
const bands = [['$0', (c) => c === 0], ['under $50', (c) => c > 0 && c < 5000], ['$50+', (c) => c >= 5000 && c < 10000], ['$100+', (c) => c >= 10000 && c < 25000], ['$250+', (c) => c >= 25000 && c < 50000], ['$500+', (c) => c >= 50000 && c < 100000], ['$1k+', (c) => c >= 100000 && c < 250000], ['$2.5k+', (c) => c >= 250000]];
const spentByService = {};
for (const p of P) for (const [k, v] of Object.entries(p.spentByService)) spentByService[SERVICE[k] ?? k] = (spentByService[SERVICE[k] ?? k] ?? 0) + v;

const summary = {
  n: r.n,
  ms: r.ms,
  catalog: r.catalog,
  bugs: r.bugs.length,
  invariantFailures: r.invariantFailures,
  countries: rows(count(P, (p) => p.countryName)),
  interests: Object.keys(INTEREST).map((k) => ({ key: INTEREST[k], n: Math.round(avg(P, (p) => p.interests[k]) * 100), top: P.filter((p) => p.topInterests[0] === k).length })).sort((a, b) => b.n - a.n),
  platforms: rows(count(P, (p) => ({ iphone: 'iPhone', android: 'Android', web: 'Web browser' })[p.platform])),
  channels: rows(count(P, (p) => p.channel)),
  households: rows(count(P, (p) => p.household)),
  ages: ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'].map((k) => ({ key: k, n: P.filter((p) => ageBand(p.age) === k).length })),
  satisfaction: Array.from({ length: 10 }, (_, i) => ({ key: String(i + 1), n: P.filter((p) => p.satisfaction === i + 1).length })),
  avgSatisfaction: avg(P, (p) => p.satisfaction),
  nps: Math.round(((pro - det) / P.length) * 100),
  churn: ['low', 'medium', 'high'].map((k) => ({ key: { low: 'Likely to stay', medium: 'Might drift', high: 'Likely to leave' }[k], n: P.filter((p) => p.churnRisk === k).length })),
  favourites: rows(count(P.filter((p) => p.favouriteService !== '—'), (p) => p.favouriteService)),
  services: Object.entries(byService).map(([k, v]) => ({ key: SERVICE[k] ?? k, ...v })).sort((a, b) => b.ok + b.friction + b.skipped - (a.ok + a.friction + a.skipped)),
  reasons,
  themes: Object.entries(themes).map(([theme, v]) => ({ theme, ...v })).sort((a, b) => b.n - a.n).slice(0, 18),
  revenue: Object.entries(r.revenueByService).map(([k, v]) => ({ key: SERVICE[k] ?? k, ...v })).sort((a, b) => b.customerCents - a.customerCents),
  spentByService: rows(spentByService),
  totals: {
    spentCents: sum(P, (p) => p.spentCents),
    feesCents: sum(P, (p) => p.feesCents),
    waveBackCents: sum(P, (p) => p.waveBackCents),
    waveBackPeople: P.filter((p) => p.waveBackCents > 0).length,
    topUpCents: sum(P, (p) => p.topUpCents),
    receivedCents: sum(P, (p) => p.receivedCents),
    actions: steps.length,
    ok: steps.filter((s) => s.outcome === 'ok').length,
    blocked: steps.filter((s) => s.outcome === 'friction' || s.outcome === 'bug').length,
    sessions: sum(P, (p) => p.sessions),
  },
  byIncome: group((p) => p.income),
  byAge: group((p) => ageBand(p.age)).sort((a, b) => a.key.localeCompare(b.key)),
  byCountry: group((p) => p.countryName),
  spend: bands.map(([key, f]) => ({ key, n: P.filter((p) => f(p.spentCents)).length })),
};

const people = P.map(({ userId, ...p }) => p);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'people.json'), '[\n' + people.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n');
const tpl = readFileSync(join(here, 'report.template.html'), 'utf8');
writeFileSync(join(out, 'index.html'), tpl.replace('/*SUMMARY*/null', () => JSON.stringify(summary).replace(/</g, '\\u003c')));
console.log(`report → ${out}`);
