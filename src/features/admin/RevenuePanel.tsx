import { useState } from 'react';
import { View } from 'react-native';
import { revenue } from '../../backend/api';
import type { PricingRule } from '../../backend/pricing';
import { Badge, Button, Card, Chip, color, Group, HScroll, Input, KeyValue, ListRow, Section, SwitchRow, T } from '../../design';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const SERVICES = ['ride', 'bites', 'stay', 'drive', 'shop', 'pay'] as const;
const NAMES: Record<string, string> = { ride: 'Hayve Ride', bites: 'Hayve Bites', stay: 'Hayve Stay', drive: 'Hayve Drive', shop: 'Hayve Shop', pay: 'Hayve Pay' };

function amountText(r: PricingRule) {
  const a = r.amount;
  if (a.kind === 'fixed') return `${money(a.value)}${r.component === 'waiting_fee' ? '/min' : ''}`;
  if (a.kind === 'multiplier') return `${a.value}×`;
  return `${Math.round(a.value * 1000) / 10}%${a.maxCents ? ` (max ${money(a.maxCents)})` : ''}`;
}

function conditionText(r: PricingRule) {
  const c = r.conditions;
  const parts: string[] = [];
  if (c.zones) parts.push(c.zones.join('/').replace('_', ' '));
  if (c.hours) parts.push(`${c.hours[0]}:00–${c.hours[1]}:00`);
  if (c.days) parts.push(c.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', '));
  if (c.minDemand) parts.push(`demand ≥ ${c.minDemand}`);
  if (c.eventNearby) parts.push('event nearby');
  if (c.maxOrderCents) parts.push(`orders under ${money(c.maxOrderCents)}`);
  if (c.minDistanceKm) parts.push(`${c.minDistanceKm}+ km`);
  if (c.maxLeadDays != null) parts.push(`booked ≤ ${c.maxLeadDays} days ahead`);
  if (c.supplierCategories) parts.push(c.supplierCategories.join('/'));
  if (c.crossCurrency) parts.push('other currency');
  return parts.length ? parts.join(' · ') : 'always';
}

/** Admin: revenue by service, pricing rules, guards, events, scenarios and experiments. */
export function RevenuePanel() {
  const [service, setService] = useState<(typeof SERVICES)[number]>('ride');
  const dash = useLive(() => revenue.dashboard()).data ?? {};
  const rules = useLive(() => revenue.rules()).data ?? [];
  const guards = useLive(() => revenue.guards()).data;
  const exps = useLive(() => revenue.experiments()).data ?? [];
  const { run } = useAction();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [sim, setSim] = useState<{ rule: string; value: string } | null>(null);
  const [simResult, setSimResult] = useState<ReturnType<typeof revenue.runScenario> | null>(null);
  const [city, setCity] = useState('');
  const shown = rules.filter((r) => r.service === service);

  const parse = (r: PricingRule, v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return r.amount.kind === 'fixed' ? { ...r.amount, value: Math.round(n * 100) } : r.amount.kind === 'percent' ? { ...r.amount, value: n / 100 } : { ...r.amount, value: n };
  };
  const shownValue = (r: PricingRule) => (r.amount.kind === 'fixed' ? (r.amount.value / 100).toFixed(2) : r.amount.kind === 'percent' ? String(Math.round(r.amount.value * 1000) / 10) : String(r.amount.value));

  return (
    <View style={{ gap: 16 }}>
      <Section title="Revenue by service" subtitle="From audited price records. Amounts in USD, simulated in this build.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {SERVICES.filter((s) => dash[s]).map((s) => (
            <Card key={s} style={{ flexGrow: 1, flexBasis: 220, gap: 2 }}>
              <T variant="headline">{NAMES[s]}</T>
              <KeyValue label="Orders" value={String(dash[s].orders)} />
              <KeyValue label="Customers paid" value={money(dash[s].customerCents)} />
              <KeyValue label="Supplier payouts" value={money(dash[s].supplierCents)} />
              <KeyValue label="Hayve revenue" value={money(dash[s].hayveCents)} />
              <KeyValue label="Processing (est.)" value={money(dash[s].processingCents)} />
              <KeyValue label="Refunds" value={money(dash[s].refundsCents)} />
              <KeyValue label="Net revenue" value={money(dash[s].netCents - dash[s].refundsCents)} strong />
            </Card>
          ))}
          {!Object.keys(dash).length && (
            <T color={color.textSecondary}>No priced orders yet. Book a ride, order food or book a stay to see numbers here.</T>
          )}
        </View>
      </Section>

      <Section title="Pricing rules" subtitle="Every customer fee is shown before payment. Built-in rules can be switched off, not deleted.">
        <HScroll gap={8}>
          {SERVICES.map((s) => (
            <Chip key={s} label={NAMES[s]} selected={service === s} onPress={() => setService(s)} />
          ))}
        </HScroll>
        <Group style={{ marginTop: 12 }}>
          {shown.map((r) => (
            <View key={r.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: color.grey200 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T variant="headline">
                    {r.name} · {amountText(r)}
                  </T>
                  <T variant="footnote" color={color.textSecondary}>
                    {r.payer === 'customer' ? `Customer sees "${r.label}"` : 'Taken from the supplier payout'} · {conditionText(r)}
                  </T>
                </View>
                {r.experimentId && <Badge label="In experiment" tone="primary" />}
                <SwitchRow title="" value={r.enabled} onChange={(on) => run(() => revenue.updateRule(r.id, { enabled: on }), { success: on ? `${r.name} on` : `${r.name} off` })} />
              </View>
              <T variant="caption" color={color.grey500}>
                {r.rationale}
              </T>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <Input containerStyle={{ flex: 1 }} label={r.amount.kind === 'fixed' ? 'Amount (USD)' : r.amount.kind === 'percent' ? 'Percent' : 'Multiplier'} keyboardType="decimal-pad" value={edit[r.id] ?? shownValue(r)} onChangeText={(v) => setEdit((e) => ({ ...e, [r.id]: v }))} />
                <Button title="Save" size="sm" variant="secondary" disabled={edit[r.id] == null} onPress={() => run(() => revenue.updateRule(r.id, { amount: parse(r, edit[r.id])! }), { success: 'Rule saved', onDone: () => setEdit((e) => ({ ...e, [r.id]: undefined as unknown as string })) })} />
                <Button title="Simulate" size="sm" variant="ghost" onPress={() => setSim({ rule: r.id, value: edit[r.id] ?? shownValue(r) })} />
              </View>
            </View>
          ))}
        </Group>
      </Section>

      {sim && (
        <Section title="What if?" subtitle="Re-prices recent orders with the change and estimates how many would still happen. Nothing goes live.">
          <Card style={{ gap: 10 }}>
            <T variant="headline">{rules.find((r) => r.id === sim.rule)?.name}</T>
            <Input label="New value" keyboardType="decimal-pad" value={sim.value} onChangeText={(v) => setSim({ ...sim, value: v })} />
            <Button
              title="Run simulation"
              onPress={() => {
                const r = rules.find((x) => x.id === sim.rule)!;
                run(() => revenue.runScenario([{ ruleId: r.id, patch: { enabled: true, amount: parse(r, sim.value)! } }]), { onDone: setSimResult });
              }}
            />
            {simResult && (
              <View style={{ gap: 2 }}>
                <KeyValue label="Orders (before → after)" value={`${simResult.before.keptOrders} → ${simResult.after.keptOrders} (${simResult.after.conversionChangePct}%)`} />
                <KeyValue label="Hayve revenue" value={`${money(simResult.before.hayveRevenueCents)} → ${money(simResult.after.hayveRevenueCents)}`} />
                <KeyValue label="Net revenue" value={`${money(simResult.before.netRevenueCents)} → ${money(simResult.after.netRevenueCents)}`} strong />
                <KeyValue label="Average order" value={`${money(simResult.before.avgOrderCents)} → ${money(simResult.after.avgOrderCents)}`} />
                <T variant="caption" color={color.grey500}>
                  Estimate from price elasticity per service. Confirm with an experiment before rolling out.
                </T>
              </View>
            )}
          </Card>
        </Section>
      )}

      {guards && (
        <Section title="Safety limits">
          <Card style={{ gap: 6 }}>
            <KeyValue label="Busy-time price cap" value={`${guards.maxDemandMultiplier}×`} />
            <KeyValue label="Surcharges at most" value={`${Math.round(guards.maxSurchargeShare * 100)}% of the base price`} />
            <T variant="footnote" color={color.textSecondary}>
              Emergency mode switches off busy-time pricing and event fees in a city (storms, disasters, incidents).
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {guards.emergencyCities.map((c) => (
                <Chip key={c} label={`${c} ✕`} selected onPress={() => run(() => revenue.setEmergency(c, false), { success: `Emergency mode off in ${c}` })} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Input containerStyle={{ flex: 1 }} label="City" placeholder="New York" value={city} onChangeText={setCity} />
              <Button title="Turn on emergency mode" size="sm" disabled={city.trim().length < 2} onPress={() => run(() => revenue.setEmergency(city, true), { success: `Emergency mode on in ${city}`, onDone: () => setCity('') })} />
            </View>
          </Card>
        </Section>
      )}

      <Section title="Experiments" subtitle="Test a rule on part of the customers; compare with the rest.">
        {exps.length === 0 ? (
          <T color={color.textSecondary}>No experiments yet. Pick a switched-off rule and start one below.</T>
        ) : (
          <Group>
            {exps.map((e) => (
              <ListRow
                key={e.id}
                icon="flask-outline"
                title={`${e.name} · ${Math.round(e.share * 100)}% test group`}
                subtitle={`${e.status} · test ${e.test.orders} orders, ${money(e.test.revenueCents)} · control ${e.control.orders} orders, ${money(e.control.revenueCents)}`}
                chevron={false}
                right={<Button title={e.status === 'running' ? 'Stop' : 'Start'} size="sm" variant="secondary" onPress={() => run(() => revenue.setExperimentStatus(e.id, e.status === 'running' ? 'stopped' : 'running'))} />}
              />
            ))}
          </Group>
        )}
        <Button
          title={`Test "${shown.find((r) => !r.enabled && !r.experimentId)?.name ?? 'a rule'}" on 20% of customers`}
          variant="ghost"
          disabled={!shown.some((r) => !r.enabled && !r.experimentId)}
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
          onPress={() => {
            const r = shown.find((x) => !x.enabled && !x.experimentId)!;
            run(() => {
              const id = revenue.createExperiment({ name: r.name, hypothesis: `${r.name} raises net revenue without lowering orders`, share: 0.2, ruleIds: [r.id] });
              revenue.updateRule(r.id, { enabled: true });
              revenue.setExperimentStatus(id, 'running');
            }, { success: 'Experiment running' });
          }}
        />
      </Section>
    </View>
  );
}
