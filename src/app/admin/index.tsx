import { router } from 'expo-router';
import { useState } from 'react';
import { RevenuePanel } from '../../features/admin/RevenuePanel';
import { Pressable, View } from 'react-native';
import { admin, session } from '../../backend/api';
import type { FeeTier, PayRequestSettings, RideSettings, WaveBackSettings } from '../../backend/config';
import { Avatar, Badge, Button, Card, Chip, color, EmptyState, Group, Header, HScroll, Icon, Input, ListRow, Photo, radius, Screen, Section, Sheet, T, useLayout, VerifiedMark } from '../../design';
import { StatusPill } from '../../features/common';
import { ago, money, shortDate } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

type Tab = 'overview' | 'revenue' | 'verifications' | 'users' | 'reports' | 'content' | 'settings' | 'audit';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['revenue', 'Revenue & pricing'],
  ['verifications', 'Verifications'],
  ['users', 'Users'],
  ['reports', 'Reports'],
  ['content', 'Content'],
  ['settings', 'Fees & Wave Back'],
  ['audit', 'Audit log'],
];

/** Admin panel: only visible to admins with a verified email and two-step verification. */
export default function AdminPanel() {
  const status = useLive(() => session.adminSetupStatus()).data;
  if (!status) return null;
  if (!status.isAdmin) {
    return (
      <Screen header={<Header back title="Admin" fallback="/" />}>
        <EmptyState icon="lock-closed-outline" title="Restricted area" body="Only Hayve administrators can open the admin panel." />
      </Screen>
    );
  }
  if (!status.emailVerified || !status.twoFactor) {
    return (
      <Screen header={<Header back title="Admin" fallback="/" />} maxWidth={560}>
        <T variant="title2" style={{ marginTop: 8 }}>
          Secure your admin account
        </T>
        <T color={color.grey500} style={{ marginTop: 6, marginBottom: 20 }}>
          Admin tools need a verified email and two-step verification.
        </T>
        <Group>
          <ListRow icon="mail-outline" title="Verify your email" right={status.emailVerified ? <Icon name="checkmark" color={color.indigo} /> : undefined} onPress={status.emailVerified ? undefined : () => router.push('/settings')} />
          <ListRow icon="shield-checkmark-outline" title="Turn on two-step verification" right={status.twoFactor ? <Icon name="checkmark" color={color.indigo} /> : undefined} onPress={status.twoFactor ? undefined : () => router.push('/settings')} />
        </Group>
      </Screen>
    );
  }
  return <Panel />;
}

function Panel() {
  const [tab, setTab] = useState<Tab>('overview');
  const o = useLive(() => admin.overview()).data;
  return (
    <Screen header={<Header back title="Admin" subtitle="Hayve operations" fallback="/" />}>
      <HScroll gap={8}>
        {TABS.map(([k, label]) => (
          <Chip key={k} label={label} selected={tab === k} onPress={() => setTab(k)} count={k === 'verifications' ? o?.pendingVerifications : k === 'reports' ? o?.openReports : undefined} />
        ))}
      </HScroll>
      <View style={{ marginTop: 20 }}>
        {tab === 'overview' && <Overview />}
        {tab === 'revenue' && <RevenuePanel />}
        {tab === 'verifications' && <Verifications />}
        {tab === 'users' && <Users />}
        {tab === 'reports' && <Reports />}
        {tab === 'content' && <Content />}
        {tab === 'settings' && <Settings />}
        {tab === 'audit' && <Audit />}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 180, gap: 4 }}>
      <T variant="footnote" color={color.grey500}>
        {label}
      </T>
      <T variant="title2">{value}</T>
    </Card>
  );
}

function Overview() {
  const o = useLive(() => admin.overview()).data;
  const orders = useLive(() => admin.orders().slice(0, 8)).data ?? [];
  if (!o) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="Users" value={String(o.users)} />
        <Stat label="Orders (all products)" value={String(o.orders)} />
        <Stat label="Revenue from fees" value={money(o.feeRevenueCents)} />
        <Stat label="Wave Back paid out" value={money(o.waveBackPaidCents)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="Pending verifications" value={String(o.pendingVerifications)} />
        <Stat label="Open reports" value={String(o.openReports)} />
        <Stat label="Active listings" value={String(o.listings)} />
        <Stat label="Suspended users" value={String(o.suspended)} />
      </View>
      <T variant="footnote" color={color.grey500}>
        Ledger {o.ledgerBalanced ? 'balanced' : 'OUT OF BALANCE'} · amounts are simulated in this preview build.
      </T>
      <Section title="Latest Shop orders" subtitle="Gift purchasers stay sealed, even for admins.">
        <Group>
          {orders.map((x) => (
            <ListRow key={x.id} title={`${x.reference} · ${x.product}`} subtitle={`${x.kind === 'gift' ? 'Gift · ' : ''}Buyer: ${x.buyer} · Seller: ${x.seller} · fee ${money(x.feeCents)}`} right={<StatusPill status={x.status} />} />
          ))}
        </Group>
      </Section>
    </View>
  );
}

function Verifications() {
  const list = useLive(() => admin.verifications()).data ?? [];
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  if (list.length === 0) return <EmptyState icon="storefront-outline" title="No business applications" />;
  return (
    <View style={{ gap: 12 }}>
      {list.map((b) => (
        <Card key={b.id} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar uri={b.logo ?? b.owner.avatar} name={b.tradingName} size={44} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T variant="headline">{b.tradingName}</T>
                {b.status === 'verified' && <VerifiedMark />}
              </View>
              <T variant="footnote" color={color.grey500}>
                {b.legalName} · applied {shortDate(b.submittedAt)}
              </T>
            </View>
            <StatusPill status={b.status} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {[
              ['Registration', `${b.registrationNumber} (${b.country ?? 'NL'})`],
              ['Tax ID', b.vatNumber || '—'],
              ['Address', `${b.address.line1}, ${b.address.postcode} ${b.address.city}`],
              ['Owner', `${b.owner.displayName} · ${b.ownerEmail}`],
              ['Owner ID check', b.ownerIdChecked ? 'Completed' : 'Missing'],
            ].map(([k, v]) => (
              <View key={k} style={{ minWidth: 160 }}>
                <T variant="caption" color={color.grey500}>
                  {k}
                </T>
                <T variant="subhead" weight="600">
                  {v}
                </T>
              </View>
            ))}
          </View>
          {b.status === 'rejected' && b.rejectionReason && (
            <T variant="footnote" color={color.grey500}>
              Rejected: {b.rejectionReason}
            </T>
          )}
          {b.status === 'pending' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Approve" icon="checkmark" onPress={() => run(() => admin.reviewBusiness(b.id, 'approve'), { success: `${b.tradingName} is verified` })} />
              <Button title="Reject" variant="outline" onPress={() => setRejecting(b.id)} />
            </View>
          )}
        </Card>
      ))}
      <Sheet visible={!!rejecting} onClose={() => setRejecting(null)} title="Reject application" footer={<Button title="Reject with reason" variant="dark" size="lg" full loading={busy} onPress={() => run(() => admin.reviewBusiness(rejecting!, 'reject', reason), { success: 'Application rejected', onDone: () => { setRejecting(null); setReason(''); } })} />}>
        <Input label="Reason (sent to the applicant)" multiline value={reason} onChangeText={setReason} placeholder="e.g. The VAT number does not match the KVK record." />
      </Sheet>
    </View>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const list = useLive(() => admin.users(q), [q]).data ?? [];
  const [open, setOpen] = useState<(typeof list)[number] | null>(null);
  const [reason, setReason] = useState('');
  const { run } = useAction();
  const current = open ? list.find((u) => u.id === open.id) ?? open : null;
  return (
    <View>
      <Input icon="search" placeholder="Search by name, username or email" value={q} onChangeText={setQ} />
      <Group style={{ marginTop: 12 }}>
        {list.map((u) => (
          <ListRow key={u.id} left={<Avatar uri={u.avatar} name={u.displayName} size={36} />} title={`${u.displayName} · @${u.username}`} subtitle={`${u.email} · ${u.roles.join(', ')}`} onPress={() => setOpen(u)} right={u.suspended ? <Badge label="Suspended" tone="dark" /> : u.deleted ? <Badge label="Deleted" /> : undefined} />
        ))}
      </Group>
      <Sheet visible={!!current} onClose={() => setOpen(null)} title={current?.displayName}>
        {current && (
          <View style={{ gap: 12 }}>
            <T color={color.grey500}>
              {current.email} · joined {shortDate(current.createdAt)}
            </T>
            {current.bio ? <T>“{current.bio}”</T> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['seller', 'host', 'driver', 'courier', 'kitchen', 'merchant', 'admin'] as const).map((r) => (
                <Chip key={r} label={r} selected={current.roles.includes(r)} onPress={() => run(() => admin.setRole(current.id, r, !current.roles.includes(r)), { success: `${current.roles.includes(r) ? 'Removed' : 'Granted'} ${r}` })} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button title="Remove picture" variant="outline" size="sm" disabled={!current.avatar} onPress={() => run(() => admin.removeAvatar(current.id), { success: 'Picture removed' })} />
              <Button title="Remove bio" variant="outline" size="sm" disabled={!current.bio} onPress={() => run(() => admin.removeBio(current.id), { success: 'Bio removed' })} />
            </View>
            {current.suspended ? (
              <Button title="Lift suspension" onPress={() => run(() => admin.unsuspendUser(current.id), { success: 'Suspension lifted' })} />
            ) : (
              <View style={{ gap: 8 }}>
                <Input placeholder="Reason for suspension" value={reason} onChangeText={setReason} />
                <Button title="Suspend user" variant="dark" onPress={() => run(() => admin.suspendUser(current.id, reason), { success: 'User suspended', onDone: () => setReason('') })} />
              </View>
            )}
            {!current.deleted && <Button title="Delete user" variant="outline" onPress={() => run(() => admin.deleteUser(current.id), { success: 'User deleted', onDone: () => setOpen(null) })} />}
          </View>
        )}
      </Sheet>
    </View>
  );
}

function Reports() {
  const list = useLive(() => admin.reports()).data ?? [];
  const { run } = useAction();
  if (list.length === 0) return <EmptyState icon="flag-outline" title="No reports" body="Reports from users appear here." />;
  return (
    <View style={{ gap: 10 }}>
      {list.map((r) => (
        <Card key={r.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={r.targetKind} />
            <T variant="headline" style={{ flex: 1 }} numberOfLines={1}>
              {r.target}
            </T>
            <StatusPill status={r.status} />
          </View>
          <T color={color.grey500}>
            “{r.reason}” · reported by {r.reporter} · {ago(r.createdAt)}
          </T>
          {r.status === 'open' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={r.targetKind === 'user' ? 'Remove picture and bio' : 'Remove content'} variant="dark" size="sm" onPress={() => run(() => admin.resolveReport(r.id, 'remove_content'), { success: 'Content removed' })} />
              <Button title="Dismiss" variant="outline" size="sm" onPress={() => run(() => admin.resolveReport(r.id, 'dismiss'), { success: 'Report dismissed' })} />
            </View>
          ) : (
            <T variant="footnote" color={color.grey500}>
              {r.resolution}
            </T>
          )}
        </Card>
      ))}
    </View>
  );
}

function Content() {
  const [mode, setMode] = useState<'listings' | 'reviews'>('listings');
  const [q, setQ] = useState('');
  const listings = useLive(() => (mode === 'listings' ? admin.listings(q) : []), [mode, q]).data ?? [];
  const reviews = useLive(() => (mode === 'reviews' ? admin.reviews(q) : []), [mode, q]).data ?? [];
  const { run } = useAction();
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip label="Listings" selected={mode === 'listings'} onPress={() => setMode('listings')} />
        <Chip label="Reviews" selected={mode === 'reviews'} onPress={() => setMode('reviews')} />
      </View>
      <Input icon="search" placeholder={`Search ${mode}`} value={q} onChangeText={setQ} />
      <Group style={{ marginTop: 12 }}>
        {mode === 'listings'
          ? listings.slice(0, 60).map((l) => (
              <ListRow
                key={l.id}
                left={<Photo uri={l.image} style={{ width: 40, height: 40 }} rounded={radius.sm} />}
                title={l.title}
                subtitle={`${l.seller} · ${money(l.priceCents)} · ${l.status}`}
                right={l.status === 'removed' ? <Button title="Restore" size="sm" variant="outline" onPress={() => run(() => admin.moderateListing(l.id, 'restore'), { success: 'Listing restored' })} /> : <Button title="Remove" size="sm" variant="dark" onPress={() => run(() => admin.moderateListing(l.id, 'remove'), { success: 'Listing removed' })} />}
              />
            ))
          : reviews.map((r) => <ListRow key={r.id} title={`★ ${r.rating} · ${r.author} → ${r.target}`} subtitle={r.text} right={<Button title="Remove" size="sm" variant="dark" onPress={() => run(() => admin.removeReview(r.id), { success: 'Review removed' })} />} />)}
      </Group>
    </View>
  );
}

const pct = (r: number) => String(Math.round(r * 10000) / 100);
const eur = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));

function Settings() {
  const { isWide } = useLayout();
  const s = useLive(() => admin.getSettings()).data;
  const [tiers, setTiers] = useState<{ upTo: string; rate: string }[] | null>(null);
  const [wb, setWb] = useState<Record<keyof WaveBackSettings, string> | null>(null);
  const { run } = useAction();
  if (!s) return null;
  const t = tiers ?? s.feeTiers.map((x) => ({ upTo: eur(x.upToCents), rate: pct(x.rate) }));
  const w =
    wb ??
    ({
      shopRate: pct(s.waveBack.shopRate),
      shopMaxPerPurchaseCents: eur(s.waveBack.shopMaxPerPurchaseCents),
      servicesRate: pct(s.waveBack.servicesRate),
      newUserRate: pct(s.waveBack.newUserRate),
      newUserDays: String(s.waveBack.newUserDays),
      newUserMaxTotalCents: eur(s.waveBack.newUserMaxTotalCents),
      monthlyMaxCents: eur(s.waveBack.monthlyMaxCents),
    } as Record<keyof WaveBackSettings, string>);
  const parsedTiers: FeeTier[] = t.map((x) => ({ upToCents: x.upTo.trim() ? Math.round(Number(x.upTo.replace(',', '.')) * 100) : null, rate: Number(x.rate.replace(',', '.')) / 100 }));
  const preview = admin.feePreview(parsedTiers);
  return (
    <View style={{ gap: 24 }}>
    <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
      <Card style={{ flex: 1, gap: 12, alignSelf: 'stretch' }}>
        <T variant="title3">Marketplace fee tiers</T>
        <T variant="footnote" color={color.grey500}>
          Buyers only ever see one "Fees" line with an amount. The fee never drops when the price rises.
        </T>
        {t.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Input containerStyle={{ flex: 1 }} label={i === 0 ? `Up to (USD), empty = and above` : undefined} keyboardType="decimal-pad" value={row.upTo} onChangeText={(v) => setTiers(t.map((x, j) => (j === i ? { ...x, upTo: v } : x)))} />
            <Input containerStyle={{ width: 110 }} label={i === 0 ? 'Rate (%)' : undefined} keyboardType="decimal-pad" value={row.rate} onChangeText={(v) => setTiers(t.map((x, j) => (j === i ? { ...x, rate: v } : x)))} />
          </View>
        ))}
        <View style={{ gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: color.grey100 }}>
          {preview.map((p) => (
            <View key={p.priceCents} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T variant="footnote">Item {money(p.priceCents)}</T>
              <T variant="footnote" weight="700">
                Fees {money(p.feeCents)}
              </T>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Save fee tiers" onPress={() => run(() => admin.updateFeeTiers(parsedTiers), { success: 'Fee tiers saved', onDone: () => setTiers(null) })} />
          <Button title="Reset to defaults" variant="outline" onPress={() => run(() => admin.updateFeeTiers(s.defaults.feeTiers), { success: 'Defaults restored', onDone: () => setTiers(null) })} />
        </View>
      </Card>
      <Card style={{ flex: 1, gap: 12, alignSelf: 'stretch' }}>
        <T variant="title3">Wave Back</T>
        <T variant="footnote" color={color.grey500}>
          Paid as real balance on purchases made with the Hayve balance. Never on top-ups, transfers or fees.
        </T>
        {(
          [
            ['shopRate', 'Shop & Store rate (%)'],
            ['shopMaxPerPurchaseCents', `Shop max per purchase (USD)`],
            ['servicesRate', 'Ride, Bites, Drive, Stay rate (%)'],
            ['newUserRate', 'New member rate (%)'],
            ['newUserDays', 'New member period (days)'],
            ['newUserMaxTotalCents', `New member max total (USD)`],
            ['monthlyMaxCents', `Max per user per month, all sources (USD)`],
          ] as [keyof WaveBackSettings, string][]
        ).map(([k, label]) => (
          <Input key={k} label={label} keyboardType="decimal-pad" value={w[k]} onChangeText={(v) => setWb({ ...w, [k]: v })} />
        ))}
        <Pressable>
          <Button
            title="Save Wave Back settings"
            onPress={() =>
              run(
                () =>
                  admin.updateWaveBack({
                    shopRate: Number(w.shopRate) / 100,
                    shopMaxPerPurchaseCents: Math.round(Number(w.shopMaxPerPurchaseCents) * 100),
                    servicesRate: Number(w.servicesRate) / 100,
                    newUserRate: Number(w.newUserRate) / 100,
                    newUserDays: Math.round(Number(w.newUserDays)),
                    newUserMaxTotalCents: Math.round(Number(w.newUserMaxTotalCents) * 100),
                    monthlyMaxCents: Math.round(Number(w.monthlyMaxCents) * 100),
                  }),
                { success: 'Wave Back settings saved', onDone: () => setWb(null) },
              )
            }
          />
        </Pressable>
      </Card>
    </View>
    <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
      <RideAndRequestSettings ride={s.ride} req={s.payRequests} />
    </View>
    </View>
  );
}


function RideAndRequestSettings({ ride, req }: { ride: RideSettings; req: PayRequestSettings }) {
  const { run } = useAction();
  const init = { commission: pct(ride.commissionRate), offerSeconds: String(ride.offerSeconds), feeRate: pct(req.businessFeeRate), feeFixed: eur(req.businessFeeFixedCents), maxExpiry: String(req.maxExpiryDays) };
  const [f, setF] = useState<typeof init | null>(null);
  const v = f ?? init;
  const field = (k: keyof typeof init, label: string) => <Input key={k} label={label} keyboardType="decimal-pad" value={v[k]} onChangeText={(x) => setF({ ...v, [k]: x })} />;
  return (
    <Card style={{ flex: 1, gap: 12, alignSelf: 'stretch' }}>
      <T variant="title3">Hayve Ride and payment requests</T>
      <T variant="footnote" color={color.grey500}>Drivers keep the fare minus the commission. Personal requests, splits and personal QR codes are always free; business requests pay the fee per payment.</T>
      {field('commission', 'Ride commission (%)')}
      {field('offerSeconds', 'Seconds a driver has to answer')}
      {field('feeRate', 'Business request fee (%)')}
      {field('feeFixed', `Business request fixed fee (USD)`)}
      {field('maxExpiry', 'Longest a link can stay open (days)')}
      <Button
        title="Save"
        onPress={() =>
          run(
            () => {
              admin.updateRide({ commissionRate: Number(v.commission) / 100, offerSeconds: Math.round(Number(v.offerSeconds)) });
              admin.updatePayRequests({ businessFeeRate: Number(v.feeRate) / 100, businessFeeFixedCents: Math.round(Number(v.feeFixed) * 100), maxExpiryDays: Math.round(Number(v.maxExpiry)) });
            },
            { success: 'Settings saved', onDone: () => setF(null) },
          )
        }
      />
    </Card>
  );
}


function Audit() {
  const list = useLive(() => admin.auditLog()).data ?? [];
  return (
    <Group>
      {list.map((a) => (
        <ListRow key={a.id} icon="document-text-outline" title={a.action} subtitle={`${a.actor} · ${a.target} · ${ago(a.createdAt)}`} />
      ))}
    </Group>
  );
}
