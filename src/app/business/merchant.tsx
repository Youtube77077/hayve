import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { business } from '../../backend/api';
import { Badge, Button, Card, Chip, color, Group, Header, Input, ListRow, parseEuro, ProgressBar, radius, Screen, Section, Segmented, Sheet, SimQR, T, useLayout, useToast } from '../../design';
import { Empty, EarningsCard, RoleGate } from '../../features/business';
import { SimNote, StatusPill } from '../../features/common';
import { ago, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function MerchantDashboard() {
  return (
    <RoleGate role="merchant" title="Hayve Business" onboarding={<RegisterBusiness />}>
      <Dashboard />
    </RoleGate>
  );
}

function RegisterBusiness() {
  const [legalName, setLegal] = useState('');
  const [tradingName, setTrading] = useState('');
  const [category, setCategory] = useState('Retail');
  const [registrationNumber, setReg] = useState('');
  const [vatNumber, setVat] = useState('');
  const [website, setWebsite] = useState('');
  const { run, busy } = useAction();
  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <T variant="title2">Accept Hayve Pay</T>
      <T color={color.textSecondary}>Get paid online, by link, by QR code or in person, with funds in your Hayve Pay balance. 1.4% + €0.25 per payment.</T>
      <Input label="Legal business name" value={legalName} onChangeText={setLegal} placeholder="Studio Noord B.V." />
      <Input label="Trading name" value={tradingName} onChangeText={setTrading} placeholder="Studio Noord" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['Retail', 'Food & drink', 'Services', 'Online store', 'Events', 'Other'].map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Input label="Chamber of Commerce (KvK) number" keyboardType="number-pad" value={registrationNumber} onChangeText={setReg} />
      <Input label="VAT number (optional)" autoCapitalize="characters" value={vatNumber} onChangeText={setVat} />
      <Input label="Website (optional)" autoCapitalize="none" keyboardType="url" value={website} onChangeText={setWebsite} />
      <Button title="Create business" size="lg" full loading={busy} onPress={() => run(() => business.registerBusiness({ legalName, tradingName, category, country: 'Netherlands', registrationNumber, vatNumber, website }), { success: 'Business created' })} />
    </View>
  );
}

function Dashboard() {
  const { isWide } = useLayout();
  const toast = useToast();
  const biz = useLive(() => business.myBusiness()).data;
  const links = useLive(() => business.paymentLinks()).data ?? [];
  const payments = useLive(() => business.merchantPayments()).data ?? [];
  const [tab, setTab] = useState<'accept' | 'payments' | 'developers' | 'settings'>('accept');
  const [newLink, setNewLink] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const { run, busy } = useAction();
  if (!biz) return <Screen header={<Header back title="Hayve Business" fallback="/business" />}><RegisterBusiness /></Screen>;
  const v = biz.verification;
  const steps = [v.details, v.identity, v.bank].filter(Boolean).length;
  const linkUrl = (id: string) => `https://hayve.app/paylink/${id}`;

  return (
    <Screen header={<Header back title={biz.tradingName} subtitle="Hayve Business" fallback="/business" />}>
      {v.status !== 'verified' && (
        <Card style={{ marginBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T variant="headline" style={{ flex: 1 }}>
              Verify your business
            </T>
            <T variant="footnote" color={color.textSecondary}>
              {steps}/3 complete
            </T>
          </View>
          <ProgressBar value={steps / 3} />
          <Group>
            <ListRow icon="business-outline" title="Business details" subtitle={`KvK ${biz.registrationNumber}`} right={<Ionicons name="checkmark-circle" size={22} color={color.success} />} />
            <ListRow icon="id-card-outline" title="Identity of the owner" subtitle="Passport or ID card" right={v.identity ? <Ionicons name="checkmark-circle" size={22} color={color.success} /> : <Button title="Verify" size="sm" onPress={() => run(() => business.completeVerificationStep('identity'), { success: 'Identity verified (simulated)' })} />} />
            <ListRow icon="card-outline" title="Payout bank account" subtitle="IBAN in the business name" right={v.bank ? <Ionicons name="checkmark-circle" size={22} color={color.success} /> : <Button title="Add" size="sm" onPress={() => run(() => business.completeVerificationStep('bank'), { success: 'Bank account added (simulated)' })} />} />
          </Group>
        </Card>
      )}
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.3 }}>
          <EarningsCard role="merchant" label="Revenue" />
        </View>
        <Card style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="headline" style={{ flex: 1 }}>
              Account status
            </T>
            <Badge label={v.status === 'verified' ? 'Verified' : 'Verification needed'} tone={v.status === 'verified' ? 'success' : 'warning'} />
          </View>
          <T variant="footnote" color={color.textSecondary}>
            {biz.legalName} · {biz.category}
          </T>
          <T variant="footnote" color={color.textSecondary}>
            Payouts: {biz.payoutSchedule} to your bank (simulated)
          </T>
          <T variant="footnote" color={color.textSecondary}>
            {payments.length} payments · {links.length} payment links
          </T>
        </Card>
      </View>

      <View style={{ marginTop: 20 }}>
        <Segmented value={tab} onChange={setTab} options={[{ key: 'accept', label: 'Get paid' }, { key: 'payments', label: 'Payments' }, { key: 'developers', label: 'Developers' }, { key: 'settings', label: 'Payouts' }]} />
      </View>

      {tab === 'accept' && (
        <>
          <Section title="Ways to get paid" style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                { icon: 'link-outline' as const, title: 'Payment link', body: 'Share by chat, email or social', onPress: () => setNewLink(true) },
                { icon: 'qr-code-outline' as const, title: 'QR code', body: 'Customers scan and pay with Hayve', onPress: () => (links[0] ? setQr(links[0].id) : setNewLink(true)) },
                { icon: 'phone-portrait-outline' as const, title: 'Tap to Pay', body: 'Accept contactless on iPhone. Coming soon', onPress: () => toast('Tap to Pay on iPhone requires an Apple entitlement and a card acquirer. Coming soon.', 'info') },
                { icon: 'globe-outline' as const, title: 'Online checkout', body: 'Add Hayve Pay to your website', onPress: () => setTab('developers') },
              ].map((w) => (
                <Pressable key={w.title} onPress={w.onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 200, padding: 16, borderRadius: radius.lg, backgroundColor: pressed ? color.surfaceSunken : color.surface, borderWidth: 1, borderColor: color.line, gap: 8 })}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={w.icon} size={21} color={color.primary} />
                  </View>
                  <T variant="headline">{w.title}</T>
                  <T variant="footnote" color={color.textSecondary}>
                    {w.body}
                  </T>
                </Pressable>
              ))}
            </View>
          </Section>
          <Section title="Payment links" action="New link" onAction={() => setNewLink(true)}>
            {links.length === 0 ? (
              <Empty text="Create your first payment link" />
            ) : (
              <Group>
                {links.map((l) => (
                  <ListRow
                    key={l.id}
                    icon="link-outline"
                    title={`${l.title} · ${money(l.amountCents)}`}
                    subtitle={`${l.payments} payments · ${l.active ? 'Active' : 'Disabled'}`}
                    onPress={() => router.push(`/paylink/${l.id}`)}
                    right={
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pressable onPress={() => setQr(l.id)} hitSlop={6}>
                          <Ionicons name="qr-code-outline" size={22} color={color.primary} />
                        </Pressable>
                        <Pressable
                          onPress={async () => {
                            await Clipboard.setStringAsync(linkUrl(l.id));
                            toast('Link copied');
                          }}
                          hitSlop={6}
                        >
                          <Ionicons name="copy-outline" size={22} color={color.primary} />
                        </Pressable>
                        <Pressable onPress={() => run(() => business.setPaymentLinkActive(l.id, !l.active))} hitSlop={6}>
                          <Ionicons name={l.active ? 'pause-circle-outline' : 'play-circle-outline'} size={22} color={color.textSecondary} />
                        </Pressable>
                      </View>
                    }
                  />
                ))}
              </Group>
            )}
          </Section>
        </>
      )}

      {tab === 'payments' && (
        <Section title="Transactions" style={{ marginTop: 16 }}>
          {payments.length === 0 ? (
            <Empty text="No payments yet. Share a payment link to get started." />
          ) : (
            <Group>
              {payments.map((p) => (
                <ListRow
                  key={p.id}
                  icon="storefront-outline"
                  title={`${p.counterparty} · ${money(p.amountCents)}`}
                  subtitle={`${p.note ?? ''} · ${ago(p.createdAt)}`}
                  right={p.status === 'refunded' ? <StatusPill status="refunded" /> : <Button title="Refund" size="sm" variant="danger" onPress={() => run(() => business.refundMerchantPayment(p.id), { success: 'Refund issued' })} />}
                />
              ))}
            </Group>
          )}
        </Section>
      )}

      {tab === 'developers' && (
        <Section title="Hayve Pay for websites & apps" style={{ marginTop: 16 }}>
          <T color={color.textSecondary} style={{ marginBottom: 12 }}>
            Integrate Hayve Pay checkout into your site. The API below is a preview of the planned public interface.
          </T>
          <ScrollView horizontal style={{ backgroundColor: color.ink, borderRadius: radius.lg }} contentContainerStyle={{ padding: 16 }}>
            <T style={{ fontFamily: 'Courier', fontSize: 13, lineHeight: 20, color: color.lime }}>
              {`// Create a checkout session (server side)
POST https://api.hayve.app/v1/checkout/sessions
Authorization: Bearer sk_test_••••••••
{
  "amount": 2500,
  "currency": "EUR",
  "description": "Order #1042",
  "success_url": "https://yourshop.nl/thanks"
}

// Redirect your customer
window.location = session.url;  // hayve.app/paylink/…`}
            </T>
          </ScrollView>
          <View style={{ marginTop: 12, gap: 10 }}>
            <SimNote text="The public API, webhooks and SDKs are on the roadmap. Payment links already work end-to-end in this build." />
            <Card>
              <T variant="headline">Test keys</T>
              <T variant="footnote" color={color.textSecondary}>
                pk_test_hayve_{biz.id.slice(-8)}
              </T>
              <T variant="footnote" color={color.textSecondary}>
                sk_test_•••••••••••••• (shown once at launch)
              </T>
            </Card>
          </View>
        </Section>
      )}

      {tab === 'settings' && (
        <Section title="Payout schedule" style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['daily', 'weekly', 'monthly'] as const).map((s) => (
              <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={biz.payoutSchedule === s} onPress={() => run(() => business.setPayoutSchedule(s), { success: `Payouts set to ${s}` })} />
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <SimNote text="Merchant settlements require a licensed payment institution. Payouts here are simulated." />
          </View>
          <Button title="Withdraw now" variant="secondary" style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => router.push('/pay/withdraw')} />
        </Section>
      )}

      <Sheet visible={newLink} onClose={() => setNewLink(false)} title="New payment link" footer={<Button title="Create link" size="lg" full loading={busy} onPress={() => run(() => business.createPaymentLink(title, parseEuro(amount) ?? 0), { success: 'Payment link created', onDone: (id) => { setNewLink(false); setTitle(''); setAmount(''); setQr(id); } })} />}>
        <View style={{ gap: 12 }}>
          <Input label="What is it for?" placeholder="e.g. Haircut, Deposit, Order #12" value={title} onChangeText={setTitle} />
          <Input label="Amount (€)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        </View>
      </Sheet>
      <Sheet visible={!!qr} onClose={() => setQr(null)} title="Scan to pay">
        {qr && (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <SimQR value={linkUrl(qr)} size={220} />
            <T variant="title3">{links.find((l) => l.id === qr)?.title}</T>
            <T variant="title2">{money(links.find((l) => l.id === qr)?.amountCents ?? 0)}</T>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <Button title="Share link" icon="share-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void Share.share({ message: `Pay ${biz.tradingName} with Hayve: ${linkUrl(qr)}` })} />
              <Button title="Open checkout" style={{ flex: 1 }} onPress={() => { setQr(null); router.push(`/paylink/${qr}`); }} />
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
