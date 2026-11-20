/**
 * Builds the simulation report from sim/out/results.json.
 *   node sim/report.mjs <outDir>
 * Writes <outDir>/index.html (summary + charts) and <outDir>/people.json (all personas).
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
const COUNTRY = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', DE: 'Germany', FR: 'France', IE: 'Ireland', NL: 'Netherlands', ES: 'Spain', IT: 'Italy', AU: 'Australia', BE: 'Belgium', PT: 'Portugal' };
const SERVICE = { account: 'Sign-up', pay: 'Hayve Pay', shop: 'Hayve Shop', bites: 'Hayve Bites', ride: 'Hayve Ride', stay: 'Hayve Stay', drive: 'Hayve Drive' };

const steps = P.flatMap((p) => p.steps.map((s) => ({ ...s, country: p.country })));
const byService = {};
for (const s of steps) {
  const x = (byService[s.service ?? 'other'] ??= { ok: 0, friction: 0, skipped: 0, bug: 0 });
  x[s.outcome] += 1;
}
const norm = (m) =>
  m
    .replace(/Bites isn't in .* yet/, "Bites isn't in my city yet")
    .replace(/(withdraw up to )\S+/, '$1…')
    .replace(/(Minimum order is )\S+/, '$1…')
    .replace(/(vehicle is )\d+/, '$1…');
const friction = Object.entries(count(steps.filter((s) => s.outcome !== 'ok'), (s) => `${s.action}|${s.outcome}|${norm(s.message ?? '')}`))
  .map(([k, n]) => {
    const [action, outcome, message] = k.split('|');
    return { action, outcome, message, n };
  })
  .sort((a, b) => b.n - a.n);

const themeOf = (t) =>
  t
    .replace(/delivers in .* so far/, 'delivers in [cities] so far')
    .replace(/Ordered from .+, but it's in .*/, 'Ordered from a restaurant in another city')
    .replace(/\d[\d.,]*/g, '#')
    .replace(/in [A-Z][\p{L}]+( [A-Z][\p{L}]+)?/gu, 'in [city]')
    .replace(/to [A-Z][\p{L}]+( [A-Z][\p{L}]+)?\./gu, 'to [city].');
const themes = {};
for (const p of P)
  for (const t of p.thoughts) {
    const k = themeOf(t);
    const x = (themes[k] ??= { n: 0, samples: [] });
    x.n += 1;
    if (x.samples.length < 3 && !x.samples.some((s) => s.text === t)) x.samples.push({ text: t, who: `${p.name}, ${p.age}, ${p.city}` });
  }
const themeList = Object.entries(themes)
  .map(([k, v]) => ({ theme: k, ...v }))
  .sort((a, b) => b.n - a.n)
  // A blocked step also has its own, more natural thought with the same count: keep that one.
  .filter((t, _, all) => !(t.theme.startsWith('Tried to') && all.some((o) => o !== t && o.n === t.n && !o.theme.startsWith('Tried to'))));

const ageBand = (a) => (a < 25 ? '18–24' : a < 35 ? '25–34' : a < 45 ? '35–44' : a < 55 ? '45–54' : a < 65 ? '55–64' : '65+');
const group = (key) =>
  Object.entries(count(P, key)).map(([k, n]) => {
    const g = P.filter((p) => key(p) === k);
    return { key: k, n, satisfaction: avg(g, (p) => p.satisfaction), spentCents: avg(g, (p) => p.spentCents), feesCents: avg(g, (p) => p.feesCents) };
  });
const pro = P.filter((p) => p.wouldRecommend >= 9).length;
const det = P.filter((p) => p.wouldRecommend <= 6).length;
const bands = [
  ['$0', (c) => c === 0],
  ['under $50', (c) => c > 0 && c < 5000],
  ['$50+', (c) => c >= 5000 && c < 10000],
  ['$100+', (c) => c >= 10000 && c < 25000],
  ['$250+', (c) => c >= 25000 && c < 50000],
  ['$500+', (c) => c >= 50000 && c < 100000],
  ['$1k+', (c) => c >= 100000 && c < 250000],
  ['$2.5k+', (c) => c >= 250000],
];

const summary = {
  n: r.n,
  ms: r.ms,
  generatedAt: r.generatedAt,
  bugs: r.bugs.length,
  invariantFailures: r.invariantFailures,
  countries: Object.entries(count(P, (p) => p.country))
    .map(([k, n]) => ({ key: COUNTRY[k] ?? k, n }))
    .sort((a, b) => b.n - a.n),
  interests: Object.entries(count(P.flatMap((p) => p.interests), (x) => x))
    .map(([k, n]) => ({ key: k, n }))
    .sort((a, b) => b.n - a.n),
  satisfaction: Array.from({ length: 10 }, (_, i) => ({ key: String(i + 1), n: P.filter((p) => p.satisfaction === i + 1).length })),
  avgSatisfaction: avg(P, (p) => p.satisfaction),
  nps: Math.round(((pro - det) / P.length) * 100),
  promoters: pro,
  detractors: det,
  services: Object.entries(byService)
    .filter(([k]) => k !== 'account')
    .map(([k, v]) => ({ key: SERVICE[k] ?? k, ...v })),
  friction,
  themes: themeList.slice(0, 24),
  revenue: Object.entries(r.revenueByService)
    .map(([k, v]) => ({ key: SERVICE[k] ?? k, ...v }))
    .sort((a, b) => b.customerCents - a.customerCents),
  totals: {
    spentCents: sum(P, (p) => p.spentCents),
    feesCents: sum(P, (p) => p.feesCents),
    waveBackCents: sum(P, (p) => p.waveBackCents),
    waveBackPeople: P.filter((p) => p.waveBackCents > 0).length,
    toppedUp: P.filter((p) => p.startBalanceCents > 0).length,
    startBalanceCents: sum(P, (p) => p.startBalanceCents),
    endBalanceCents: sum(P, (p) => p.endBalanceCents),
    actions: steps.length,
    ok: steps.filter((s) => s.outcome === 'ok').length,
  },
  byIncome: group((p) => p.income),
  byAge: group((p) => ageBand(p.age)).sort((a, b) => a.key.localeCompare(b.key)),
  byCountry: group((p) => COUNTRY[p.country] ?? p.country).sort((a, b) => b.n - a.n),
  spend: bands.map(([label, f]) => ({ key: label, n: P.filter((p) => f(p.spentCents)).length })),
};

const people = P.map((p) => ({
  id: p.id,
  name: p.name,
  country: COUNTRY[p.country] ?? p.country,
  city: p.city,
  age: p.age,
  income: p.income,
  ps: p.priceSensitivity,
  tech: p.techSavvy,
  patience: p.patience,
  interests: p.interests,
  start: p.startBalanceCents,
  end: p.endBalanceCents,
  spent: p.spentCents,
  fees: p.feesCents,
  wb: p.waveBackCents,
  sat: p.satisfaction,
  rec: p.wouldRecommend,
  steps: p.steps.map((s) => [s.action, s.outcome, s.message ?? '', s.spentCents ?? 0]),
  thoughts: p.thoughts,
}));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'people.json'), '[\n' + people.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n');
const tpl = readFileSync(join(here, 'report.template.html'), 'utf8');
writeFileSync(join(out, 'index.html'), tpl.replace('/*SUMMARY*/null', () => JSON.stringify(summary).replace(/</g, '\\u003c')));
console.log(`report → ${out}`);
