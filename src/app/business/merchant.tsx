import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { regions, business, shop } from '../../backend/api';
import { media } from '../../backend/media';
import { Badge, Button, Card, Chip, color, EmptyState, Group, Header, HScroll, Icon, Input, ListRow, Notice, parseEuro, Photo, radius, Screen, Section, Segmented, Sheet, SimQR, Stepper, T, useLayout, useToast, VerifiedMark } from '../../design';
import { EarningsCard } from '../../features/business';
import { StatusPill } from '../../features/common';
import { ago, money, shortDate, currencySymbol } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';
import { useRegion } from '../../features/payments';

/** Hayve Store: verified business accounts. */
export default function StoreDashboard() {
  const biz = useLive(() => business.myBusiness()).data;
  if (biz === undefined) return null;
  if (!biz || biz.status === 'rejected') return <Apply previous={biz} />;
  if (biz.status === 'pending') return <Pending biz={biz} />;
  return <Dashboard />;
}

/* --------------------------------------------------------- application -- */

function Apply({ previous }: { previous: ReturnType<typeof business.myBusiness> }) {
  const reg = useRegion();
  const [f, setF] = useState({
    legalName: previous?.legalName ?? '',
    tradingName: previous?.tradingName ?? '',
    category: previous?.category ?? 'Retail',
    registrationNumber: previous?.registrationNumber ?? '',
    vatNumber: previous?.vatNumber ?? '',
    line1: previous?.address.line1 ?? '',
    postcode: previous?.address.postcode ?? '',
    city: previous?.address.city ?? '',
    website: previous?.website ?? '',
    description: previous?.description ?? '',
  });
  const [idChecked, setIdChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const { run, busy } = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const startIdCheck = () => {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      setIdChecked(true);
    }, 1200);
  };
  return (
    <Screen header={<Header back title="Hayve Store" fallback="/business" />} maxWidth={640} keyboard footer={<Button title="Submit for verification" size="lg" full loading={busy} onPress={() => run(() => business.registerBusiness({ ...f, countryCode: reg.code, address: { line1: f.line1, postcode: f.postcode, city: f.city, country: reg.name }, ownerIdChecked: idChecked }), { success: 'Application submitted' })} />}>
      <T variant="title2" style={{ marginTop: 8 }}>
        Open a verified Hayve Store
      </T>
      <T color={color.grey500} style={{ marginTop: 6 }}>
        For registered businesses. Verified stores get a check mark, a "From verified business" label on every listing, a store page, bulk uploads, stock management and tax invoices.
      </T>
      {previous?.status === 'rejected' && (
        <View style={{ marginTop: 16 }}>
          <Notice icon="warning-outline" title="Your application was not approved" body={previous.rejectionReason ?? ''} />
        </View>
      )}
      <Section title="Company">
        <View style={{ gap: 12 }}>
          <T variant="footnote" color={color.grey500}>
            Registering in {reg.name}. Change your country in Settings.
          </T>
          <Input label="Legal company name" placeholder="Studio North LLC" value={f.legalName} onChangeText={set('legalName')} />
          <Input label="Store name" placeholder="Studio North" value={f.tradingName} onChangeText={set('tradingName')} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Input containerStyle={{ flex: 1 }} label={reg.businessId.label} hint={reg.businessId.hint} placeholder={reg.businessId.placeholder} autoCapitalize="characters" value={f.registrationNumber} onChangeText={set('registrationNumber')} />
            <Input containerStyle={{ flex: 1 }} label={reg.taxId.label} placeholder={reg.taxId.placeholder} autoCapitalize="characters" value={f.vatNumber} onChangeText={set('vatNumber')} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Retail', 'Fashion', 'Electronics', 'Home & interiors', 'Food & drink', 'Other'].map((c) => (
              <Chip key={c} label={c} selected={f.category === c} onPress={() => set('category')(c)} />
            ))}
          </View>
        </View>
      </Section>
      <Section title="Business address">
        <View style={{ gap: 12 }}>
          <Input label="Street and number" value={f.line1} onChangeText={set('line1')} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Input containerStyle={{ flex: 1 }} label={reg.postcodeLabel} value={f.postcode} onChangeText={set('postcode')} />
            <Input containerStyle={{ flex: 1.4 }} label="City" value={f.city} onChangeText={set('city')} />
          </View>
          <Input label="Website (optional)" autoCapitalize="none" keyboardType="url" value={f.website} onChangeText={set('website')} />
        </View>
      </Section>
      <Section title="Owner ID check">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="id-card-outline" size={24} color={idChecked ? color.indigo : color.black} />
          <View style={{ flex: 1 }}>
            <T variant="headline">{idChecked ? 'ID verified' : 'Verify your ID'}</T>
            <T variant="footnote" color={color.grey500}>
              Passport or ID card plus a quick selfie. Simulated in this preview.
            </T>
          </View>
          {idChecked ? <Icon name="checkmark" color={color.indigo} /> : <Button title="Start" size="sm" variant="dark" loading={checking} onPress={startIdCheck} />}
        </Card>
      </Section>
    </Screen>
  );
}

function Pending({ biz }: { biz: NonNullable<ReturnType<typeof business.myBusiness>> }) {
  const bizReg = regions.region(biz.country ?? 'NL');
  return (
    <Screen header={<Header back title="Hayve Store" fallback="/business" />} maxWidth={560}>
      <View style={{ alignItems: 'center', gap: 12, marginTop: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="hourglass-outline" size={26} />
        </View>
        <T variant="title2" center>
          Application under review
        </T>
        <T color={color.grey500} center>
          We're checking {biz.tradingName}'s registration, tax and ID details. This usually takes one business day.
        </T>
        <StatusPill status="pending" />
      </View>
      <Card style={{ marginTop: 24, gap: 8 }}>
        <ListRow title="Legal name" value={biz.legalName} chevron={false} />
        <ListRow title={bizReg.businessId.label} value={biz.registrationNumber} chevron={false} />
        <ListRow title={bizReg.taxName} value={biz.vatNumber || '—'} chevron={false} />
        <ListRow title="Submitted" value={shortDate(biz.submittedAt)} chevron={false} />
      </Card>
    </Screen>
  );
}

/* ----------------------------------------------------------- dashboard -- */

type Tab = 'overview' | 'products' | 'invoices' | 'store' | 'paid';

function Dashboard() {
  const biz = useLive(() => business.myBusiness()).data!;
  const bizReg = regions.region(biz.country ?? 'NL');
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <Screen header={<Header back title={biz.tradingName} subtitle="Hayve Store" fallback="/business" right={<Button title="View store" size="sm" variant="outline" onPress={() => router.push(`/u/${shop.myListings()[0]?.seller.username ?? ''}`)} />} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <VerifiedMark size={18} />
        <T variant="subhead" weight="600">
          Verified business
        </T>
        <T variant="subhead" color={color.grey500}>
          · {bizReg.businessId.label} {biz.registrationNumber}
        </T>
      </View>
      <HScroll gap={8}>
        {(
          [
            ['overview', 'Sales overview'],
            ['products', 'Products & stock'],
            ['invoices', 'Invoices'],
            ['store', 'Store page'],
            ['paid', 'Payment links'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </HScroll>
      <View style={{ marginTop: 20 }}>
        {tab === 'overview' && <Overview />}
        {tab === 'products' && <Products />}
        {tab === 'invoices' && <Invoices />}
        {tab === 'store' && <StorePage />}
        {tab === 'paid' && <PaymentLinks />}
      </View>
    </Screen>
  );
}

function Overview() {
  const { isWide } = useLayout();
  const sales = useLive(() => shop.listSales()).data ?? [];
  const toShip = sales.filter((s) => s.status === 'paid');
  return (
    <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 16 }}>
      <View style={{ flex: 1.2 }}>
        <EarningsCard role="seller" label="Sales" />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="title3" style={{ marginBottom: 12 }}>
          {toShip.length ? `${toShip.length} to ship` : 'Recent orders'}
        </T>
        {sales.length === 0 ? (
          <EmptyState compact icon="receipt-outline" title="No orders yet" />
        ) : (
          <Group>
            {sales.slice(0, 8).map((o) => (
              <ListRow key={o.id} title={o.product.title} subtitle={`${o.reference} · ${o.counterparty}`} right={<StatusPill status={o.status} />} onPress={() => router.push(`/orders/${o.id}`)} />
            ))}
          </Group>
        )}
      </View>
    </View>
  );
}

function Products() {
  const listings = useLive(() => shop.myListings()).data ?? [];
  const [bulk, setBulk] = useState(false);
  const [text, setText] = useState('');
  const toast = useToast();
  const { run, busy } = useAction();
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <Button title="Add product" icon="add" onPress={() => router.push('/sell')} />
        <Button title="Bulk upload" icon="upload-outline" variant="outline" onPress={() => setBulk(true)} />
      </View>
      {listings.length === 0 ? (
        <EmptyState icon="pricetags-outline" title="No products yet" />
      ) : (
        <Group>
          {listings.map((l) => (
            <ListRow key={l.id} left={<Photo uri={l.image} style={{ width: 48, height: 48 }} rounded={radius.sm} />} title={l.title} subtitle={`${money(l.priceCents)} · ${l.quantity > 0 ? `${l.quantity} in stock` : 'Out of stock'}`} right={<Stepper value={l.quantity} min={0} max={9999} onChange={(v) => run(() => shop.setStock(l.id, v))} />} />
          ))}
        </Group>
      )}
      <Sheet
        visible={bulk}
        onClose={() => setBulk(false)}
        title="Bulk upload"
        footer={
          <Button
            title="Upload products"
            size="lg"
            full
            loading={busy}
            onPress={() =>
              run(() => shop.bulkCreateListings(text, media.products.clothes), {
                onDone: (r) => {
                  toast(`${r.created} products added${r.errors.length ? ` · ${r.errors.length} skipped` : ''}`, r.errors.length ? 'info' : 'success');
                  if (!r.errors.length) {
                    setBulk(false);
                    setText('');
                  }
                },
              })
            }
          />
        }
      >
        <T variant="footnote" color={color.grey500} style={{ marginBottom: 12 }}>
          One product per line: Title; price; category; condition; quantity; description. Paste from a spreadsheet exported as text.
        </T>
        <Input multiline value={text} onChangeText={setText} placeholder={'Linen shirt; 39.95; fashion; new with tags; 12; Relaxed fit, 100% linen\nStoneware bowl; 18; home; new with tags; 40'} style={{ minHeight: 160 }} />
      </Sheet>
    </View>
  );
}

function Invoices() {
  const sales = useLive(() => shop.listSales().filter((o) => o.invoiceAvailable)).data ?? [];
  if (sales.length === 0) return <EmptyState icon="document-text-outline" title="No invoices yet" body="Every order from your store gets a VAT invoice." />;
  return (
    <Group>
      {sales.map((o) => (
        <ListRow key={o.id} icon="document-text-outline" title={`${o.reference} · ${o.product.title}`} subtitle={`${shortDate(o.createdAt)} · ${money(o.priceCents + o.shippingCents)} incl. VAT`} onPress={() => router.push(`/invoice/${o.id}`)} />
      ))}
    </Group>
  );
}

function StorePage() {
  const biz = useLive(() => business.myBusiness()).data!;
  const [description, setDescription] = useState(biz.description);
  const { run, busy } = useAction();
  useEffect(() => setDescription(biz.description), [biz.description]);
  const images = Object.values(media.products);
  return (
    <View style={{ gap: 16, maxWidth: 720 }}>
      <View>
        <Photo uri={biz.banner} style={{ width: '100%', height: 160 }} rounded={radius.lg} icon="image-outline" label="Banner" />
        <View style={{ position: 'absolute', left: 16, bottom: -28 }}>
          <View style={{ borderWidth: 3, borderColor: color.white, borderRadius: 40 }}>
            <Photo uri={biz.logo} style={{ width: 72, height: 72 }} rounded={36} icon="storefront-outline" />
          </View>
        </View>
      </View>
      <View style={{ height: 24 }} />
      <T variant="subhead" weight="600">
        Logo
      </T>
      <HScroll gap={8}>
        {images.map((u) => (
          <Pressable key={u} onPress={() => run(() => business.updateStoreProfile({ logo: u }), { success: 'Logo updated' })}>
            <Photo uri={u} style={{ width: 56, height: 56, borderWidth: biz.logo === u ? 2 : 0, borderColor: color.indigo }} rounded={28} />
          </Pressable>
        ))}
      </HScroll>
      <T variant="subhead" weight="600">
        Banner
      </T>
      <HScroll gap={8}>
        {images.map((u) => (
          <Pressable key={u} onPress={() => run(() => business.updateStoreProfile({ banner: u }), { success: 'Banner updated' })}>
            <Photo uri={u} style={{ width: 120, height: 56, borderWidth: biz.banner === u ? 2 : 0, borderColor: color.indigo }} rounded={radius.sm} />
          </Pressable>
        ))}
      </HScroll>
      <Input label="About your store" multiline maxLength={400} value={description} onChangeText={setDescription} hint={`${description.length}/400`} />
      <Button title="Save store page" loading={busy} style={{ alignSelf: 'flex-start' }} onPress={() => run(() => business.updateStoreProfile({ description }), { success: 'Store page saved' })} />
    </View>
  );
}

function PaymentLinks() {
  const links = useLive(() => business.paymentLinks()).data ?? [];
  const payments = useLive(() => business.merchantPayments()).data ?? [];
  const [mode, setMode] = useState<'links' | 'payments'>('links');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const toast = useToast();
  const { run, busy } = useAction();
  const url = (id: string) => `https://hayve.app/paylink/${id}`;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <View style={{ flex: 1, maxWidth: 360 }}>
          <Segmented value={mode} onChange={setMode} options={[{ key: 'links', label: 'Links & QR' }, { key: 'payments', label: `Payments · ${payments.length}` }]} />
        </View>
        <Button title="New link" icon="add" size="sm" onPress={() => setOpen(true)} />
      </View>
      {mode === 'links' ? (
        links.length === 0 ? (
          <EmptyState icon="link-outline" title="No payment links" body="Create a link or QR code customers can pay with Hayve." />
        ) : (
          <Group>
            {links.map((l) => (
              <ListRow
                key={l.id}
                icon="link-outline"
                title={`${l.title} · ${money(l.amountCents)}`}
                subtitle={`${l.payments} payments · ${l.active ? 'Active' : 'Paused'}`}
                onPress={() => router.push(`/paylink/${l.id}`)}
                right={
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    <Pressable onPress={() => setQr(l.id)} hitSlop={6} accessibilityLabel="Show QR code">
                      <Icon name="qr-code-outline" size={20} />
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        await Clipboard.setStringAsync(url(l.id));
                        toast('Link copied');
                      }}
                      hitSlop={6}
                      accessibilityLabel="Copy link"
                    >
                      <Icon name="copy-outline" size={20} />
                    </Pressable>
                    <Pressable onPress={() => run(() => business.setPaymentLinkActive(l.id, !l.active))} hitSlop={6} accessibilityLabel={l.active ? 'Pause link' : 'Activate link'}>
                      <Icon name={l.active ? 'pause-circle-outline' : 'play-circle-outline'} size={20} />
                    </Pressable>
                  </View>
                }
              />
            ))}
          </Group>
        )
      ) : payments.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No payments yet" />
      ) : (
        <Group>
          {payments.map((p) => (
            <ListRow key={p.id} title={`${p.counterparty} · ${money(p.amountCents)}`} subtitle={`${p.note ?? ''} · ${ago(p.createdAt)}`} right={p.status === 'refunded' ? <Badge label="Refunded" /> : <Button title="Refund" size="sm" variant="outline" onPress={() => run(() => business.refundMerchantPayment(p.id), { success: 'Refund sent' })} />} />
          ))}
        </Group>
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="New payment link" footer={<Button title="Create link" size="lg" full loading={busy} onPress={() => run(() => business.createPaymentLink(title, parseEuro(amount) ?? 0), { success: 'Payment link created', onDone: (id) => { setOpen(false); setTitle(''); setAmount(''); setQr(id); } })} />}>
        <View style={{ gap: 12 }}>
          <Input label="What is it for?" placeholder="e.g. Repair deposit" value={title} onChangeText={setTitle} />
          <Input label={`Amount (${currencySymbol()})`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        </View>
      </Sheet>
      <Sheet visible={!!qr} onClose={() => setQr(null)} title="Scan to pay">
        {qr && (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <SimQR value={url(qr)} size={200} />
            <T variant="title3">{links.find((l) => l.id === qr)?.title}</T>
            <T variant="title2">{money(links.find((l) => l.id === qr)?.amountCents ?? 0)}</T>
            <Button title="Share link" icon="share-outline" variant="outline" full onPress={() => void Share.share({ message: url(qr) })} />
          </View>
        )}
      </Sheet>
    </View>
  );
}
