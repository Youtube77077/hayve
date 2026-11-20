import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { card as cardApi, tap as tapApi } from '../../backend/api';
import { MERCHANTS } from '../../backend/api/card';
import { Appear, Button, Card, color, ConfirmSheet, Group, Header, Icon, type IconName, Input, ListRow, parseEuro, radius, Screen, Section, Segmented, Select, Sheet, SimBadge, Split, SuccessMark, SwitchRow, T, useLayout, useToast } from '../../design';
import { HayveCardVisual } from '../../features/card';
import { ago, money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

const isApple = Platform.OS === 'ios' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent));
const isAndroid = Platform.OS === 'android' || (Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent));

/** Hayve Pay › Card: the Hayve Card (virtual now, physical on request) and all its controls. */
export default function HayveCardScreen() {
  const { isWide } = useLayout();
  const v = useLive(() => cardApi.get()).data;
  const buys = useLive(() => cardApi.purchases()).data ?? [];
  const { run, busy } = useAction();
  const toast = useToast();
  const [details, setDetails] = useState<{ number: string; expiry: string; cvc: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [sheet, setSheet] = useState<null | 'limits' | 'bank' | 'pin' | 'buy' | 'replace' | 'wallet'>(null);
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [holder, setHolder] = useState('');
  const [iban, setIban] = useState('');
  const [method, setMethod] = useState<'ideal_wero' | 'sepa_debit'>('ideal_wero');
  const [pin, setPin] = useState('');
  const [merchant, setMerchant] = useState('ah');
  const [amount, setAmount] = useState('12.40');
  const [bought, setBought] = useState<{ merchant: string; cents: number; wb: number; topped: number } | null>(null);
  const [walletAdded, setWalletAdded] = useState<'apple' | 'google' | null>(null);

  if (!v) return <Screen header={<Header back title="Hayve Card" fallback="/pay" />}>{null}</Screen>;
  const c = v.card;

  /* ----------------------------------------------------------- no card -- */
  if (!c) {
    return (
      <Screen header={<Header back title="Hayve Card" fallback="/pay" right={<SimBadge />} />} maxWidth={560}>
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <HayveCardVisual last4="2026" holder={v.holder || 'YOUR NAME'} width="100%" />
        </View>
        <T variant="title2" style={{ marginTop: 24 }}>Pay anywhere with your Hayve balance</T>
        <T color={color.textSecondary} style={{ marginTop: 8 }}>A Visa debit card in Apple Wallet and Google Wallet. Payments come from your balance, topped up from your bank when needed, and earn Wave Back.</T>
        <View style={{ gap: 12, marginTop: 20 }}>
          {[
            ['tap-to-pay', 'Tap to pay in shops with your phone or watch'],
            ['wave', 'Wave Back at Hayve partners and on Hayve services'],
            ['snow-freeze', 'Freeze it, set limits and block online or gambling payments'],
            ['bank-outline', 'Automatic top-ups from your bank in batches'],
          ].map(([icon, text]) => (
            <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Icon name={icon as IconName} size={20} />
              <T style={{ flex: 1 }}>{text}</T>
            </View>
          ))}
        </View>
        {v.identityVerified ? (
          <Button title="Get my virtual card" size="lg" full style={{ marginTop: 28 }} loading={busy} onPress={() => run(() => cardApi.issue(), { success: 'Your Hayve Card is ready' })} />
        ) : (
          <Button title="Verify my identity" size="lg" full style={{ marginTop: 28 }} loading={busy} onPress={() => run(() => tapApi.verifyIdentity(), { success: 'Identity verified' })} />
        )}
        <T variant="caption" color={color.textSecondary} center style={{ marginTop: 12 }}>Issued by a licensed card partner. Demo: no real card is created.</T>
      </Screen>
    );
  }

  /* -------------------------------------------------------------- card -- */
  const showDetails = async () => {
    if (details) return setDetails(null);
    if (Platform.OS !== 'web') {
      try {
        const has = await LocalAuthentication.hasHardwareAsync();
        if (has) {
          const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Show card details', fallbackLabel: 'Use passcode' });
          if (r.success) return setDetails(cardApi.revealDetails({ biometric: true }));
          return;
        }
      } catch {
        /* fall back to password */
      }
    }
    setPwOpen(true);
  };

  const frozen = c.status === 'frozen';
  const left = (
    <View>
      <Appear>
        <HayveCardVisual last4={c.last4} holder={v.holder} frozen={frozen} width="100%" />
      </Appear>
      {details && (
        <Card style={{ marginTop: 16, gap: 4 }}>
          <KV label="Card number" value={details.number} />
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <KV label="Expiry" value={details.expiry} />
            <KV label="CVC" value={details.cvc} />
          </View>
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <Action icon={details ? 'eye-hide' : 'eye-show'} label={details ? 'Hide details' : 'Show details'} onPress={showDetails} />
        <Action icon="snow-freeze" label={frozen ? 'Unfreeze' : 'Freeze'} active={frozen} onPress={() => run(() => cardApi.setFrozen(!frozen), { success: frozen ? 'Card unfrozen' : 'Card frozen' })} />
        <Action icon="settings-outline" label="Limits" onPress={() => { setDaily((c.limits.dailyCents / 100).toFixed(0)); setMonthly((c.limits.monthlyCents / 100).toFixed(0)); setSheet('limits'); }} />
      </View>
      <View style={{ gap: 8, marginTop: 16 }}>
        {(isApple || Platform.OS === 'web') && !c.wallets.apple && <WalletButton kind="apple" onPress={() => run(() => cardApi.addToWallet('apple'), { onDone: () => { setWalletAdded('apple'); setSheet('wallet'); } })} />}
        {(isAndroid || Platform.OS === 'web') && !c.wallets.google && <WalletButton kind="google" onPress={() => run(() => cardApi.addToWallet('google'), { onDone: () => { setWalletAdded('google'); setSheet('wallet'); } })} />}
        {(c.wallets.apple || c.wallets.google) && (
          <T variant="footnote" color={color.textSecondary}>In {[c.wallets.apple && 'Apple Wallet', c.wallets.google && 'Google Wallet'].filter(Boolean).join(' and ')}</T>
        )}
      </View>
      <Section title="This month">
        <Card>
          <KV label="Spent with the card" value={money(v.spentMonthCents)} />
          <View style={{ height: 6, borderRadius: 3, backgroundColor: color.grey100, overflow: 'hidden', marginTop: 8 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: color.black, width: `${Math.min(100, (v.spentMonthCents / c.limits.monthlyCents) * 100)}%` }} />
          </View>
          <T variant="caption" color={color.textSecondary} style={{ marginTop: 6 }}>
            Limit {money(c.limits.monthlyCents)} a month · {money(c.limits.dailyCents)} a day
          </T>
        </Card>
      </Section>
      <Section title="Card activity" action="Try a purchase" onAction={() => { setBought(null); setSheet('buy'); }}>
        <Card padded={false}>
          {buys.length === 0 ? (
            <T color={color.textSecondary} style={{ padding: 16 }}>No card payments yet.</T>
          ) : (
            buys.slice(0, 12).map((b, i) => (
              <Appear key={b.id} index={i}>
                <Pressable onPress={() => router.push(`/pay/tx/${b.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: color.grey200, backgroundColor: pressed ? color.grey100 : color.white })}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.grey100, alignItems: 'center', justifyContent: 'center' }}>
                    <T weight="800">{b.merchant[0]}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T variant="headline" numberOfLines={1}>{b.merchant}</T>
                    <T variant="footnote" color={color.textSecondary}>{b.category} · {ago(b.createdAt)}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T variant="headline">−{money(b.amountCents)}</T>
                    {b.waveBackCents > 0 && <T variant="caption" color={color.indigo} weight="700">+{money(b.waveBackCents)} Wave Back</T>}
                  </View>
                </Pressable>
              </Appear>
            ))
          )}
        </Card>
      </Section>
    </View>
  );

  const right = (
    <View>
      <Section title="Controls" style={isWide ? { marginTop: 0 } : undefined}>
        <Group>
          <SwitchRow icon="globe-outline" title="Online payments" subtitle={c.blocks.online ? 'Blocked' : 'Allowed'} value={!c.blocks.online} onChange={(on) => run(() => cardApi.setBlocks({ online: !on }))} />
          <SwitchRow icon="tap-to-pay" title="Contactless payments" subtitle={c.blocks.contactless ? 'Blocked' : 'Allowed'} value={!c.blocks.contactless} onChange={(on) => run(() => cardApi.setBlocks({ contactless: !on }))} />
          <SwitchRow icon="shield-outline" title="Block gambling" subtitle="Casinos, betting and lotteries" value={c.blocks.gambling} onChange={(on) => run(() => cardApi.setBlocks({ gambling: on }))} />
        </Group>
      </Section>
      <Section title="Funding">
        <Group>
          <ListRow icon="bank-outline" title={v.bank ? `${v.bank.bank} •••• ${v.bank.ibanLast4}` : 'Link your bank'} subtitle={v.bank ? (v.bank.method === 'ideal_wero' ? 'iDEAL | Wero top-ups' : `SEPA Direct Debit · ${v.bank.mandateRef}`) : 'For automatic top-ups'} onPress={() => { setHolder(v.holder ? v.holder.replace(/\b\w/g, (x) => x) : ''); setSheet('bank'); }} />
          <SwitchRow icon="refresh-outline" title="Auto top-up" subtitle={`Adds ${money(c.autoTopUp.amountCents)} at a time when your balance is too low`} value={c.autoTopUp.enabled} onChange={(on) => run(() => cardApi.setAutoTopUp({ enabled: on }))} />
        </Group>
        {c.autoTopUp.enabled && (
          <View style={{ marginTop: 12 }}>
            <Segmented value={String(c.autoTopUp.amountCents)} onChange={(k) => run(() => cardApi.setAutoTopUp({ enabled: true, amountCents: Number(k) }))} options={[2500, 5000, 10000, 20000].map((n) => ({ key: String(n), label: money(n).replace(/[.,]00$/, '') }))} />
          </View>
        )}
        <T variant="caption" color={color.textSecondary} style={{ marginTop: 8 }}>Card payments use your Hayve balance first ({money(v.balanceCents)} now).</T>
      </Section>
      <Section title="Card">
        <Group>
          <ListRow icon="card-hayve" title={c.physical ? 'Physical card ordered' : 'Order a physical card'} subtitle={c.physical ? `Black Hayve Card · ${c.physical.status}` : 'Black card with the wave-v · free'} onPress={c.physical ? undefined : () => run(() => cardApi.orderPhysical(), { success: 'Physical card ordered' })} />
          <ListRow icon="key-outline" title={c.pinSet ? 'Change PIN' : 'Set PIN'} onPress={() => { setPin(''); setSheet('pin'); }} />
          <ListRow icon="refresh-outline" title="Replace card" subtitle="Lost, stolen or damaged" onPress={() => setSheet('replace')} />
        </Group>
      </Section>
      <T variant="caption" color={color.textSecondary} style={{ marginTop: 16 }}>
        Card issued by a licensed partner. Hayve never stores your full card number. Demo: purchases are simulated.
      </T>
    </View>
  );

  return (
    <Screen header={<Header back title="Hayve Card" fallback="/pay" right={<SimBadge />} />}>
      <Split left={left} right={right} />

      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Confirm it's you" footer={<Button title="Show details" size="lg" full loading={busy} onPress={() => run(() => cardApi.revealDetails({ password: pw }), { onDone: (d) => { setDetails(d); setPwOpen(false); setPw(''); } })} />}>
        <Input label="Password" secureTextEntry value={pw} onChangeText={setPw} autoFocus />
        <T variant="caption" color={color.textSecondary} style={{ marginTop: 8 }}>On iPhone this uses Face ID.</T>
      </Sheet>

      <Sheet visible={sheet === 'limits'} onClose={() => setSheet(null)} title="Spending limits" footer={<Button title="Save limits" size="lg" full loading={busy} onPress={() => run(() => cardApi.setLimits({ dailyCents: parseEuro(daily) ?? 0, monthlyCents: parseEuro(monthly) ?? 0 }), { success: 'Limits saved', onDone: () => setSheet(null) })} />}>
        <View style={{ gap: 12 }}>
          <Input label="Per day (€)" keyboardType="decimal-pad" value={daily} onChangeText={setDaily} />
          <Input label="Per month (€)" keyboardType="decimal-pad" value={monthly} onChangeText={setMonthly} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'bank'} onClose={() => setSheet(null)} title="Link your bank" footer={
        <View style={{ gap: 8 }}>
          <Button title={method === 'ideal_wero' ? 'Continue with iDEAL | Wero' : 'Sign SEPA mandate'} size="lg" full loading={busy} onPress={() => run(() => cardApi.linkBank({ holder, iban, method }), { success: 'Bank linked', onDone: () => setSheet(null) })} />
          {v.bank && <Button title="Unlink bank" variant="ghost" full onPress={() => run(() => cardApi.unlinkBank(), { success: 'Bank unlinked', onDone: () => setSheet(null) })} />}
        </View>
      }>
        <View style={{ gap: 12 }}>
          <Segmented value={method} onChange={setMethod} options={[{ key: 'ideal_wero', label: 'iDEAL | Wero' }, { key: 'sepa_debit', label: 'SEPA Direct Debit' }]} />
          <Input label="Account holder" value={holder} onChangeText={setHolder} />
          <Input label="IBAN" autoCapitalize="characters" placeholder="NL91 ABNA 0417 1643 00" value={iban} onChangeText={setIban} />
          <T variant="caption" color={color.textSecondary}>Top-ups are taken in batches to keep bank costs low. Demo: no bank is contacted.</T>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'pin'} onClose={() => setSheet(null)} title={c.pinSet ? 'Change PIN' : 'Set PIN'} footer={<Button title="Save PIN" size="lg" full loading={busy} onPress={() => run(() => cardApi.changePin(pin), { success: 'PIN saved', onDone: () => setSheet(null) })} />}>
        <Input label="New 4-digit PIN" keyboardType="number-pad" secureTextEntry maxLength={4} value={pin} onChangeText={setPin} />
      </Sheet>

      <ConfirmSheet visible={sheet === 'replace'} title="Replace your card?" body={`Card •••• ${c.last4} stops working right away and you get a new card number. You'll need to add it to your wallet again.`} confirm="Replace card" destructive loading={busy} onClose={() => setSheet(null)} onConfirm={() => run(() => cardApi.replace(), { success: 'New card ready', onDone: () => { setSheet(null); setDetails(null); } })} />

      <Sheet visible={sheet === 'wallet'} onClose={() => setSheet(null)} title="Added to your wallet">
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <SuccessMark size={72} confetti={false} />
          <T center>Your Hayve Card is in {walletAdded === 'apple' ? 'Apple Wallet' : 'Google Wallet'}. Hold your phone near a card reader to pay.</T>
          <T variant="caption" color={color.textSecondary} center>Demo: in the live app this uses Apple and Google in-app provisioning through the card partner.</T>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'buy'} onClose={() => setSheet(null)} title="Try a card purchase" footer={bought ? <Button title="Done" size="lg" full onPress={() => setSheet(null)} /> : <Button title={`Pay ${amount ? money(parseEuro(amount) ?? 0) : ''}`} size="lg" full loading={busy} onPress={() => run(() => cardApi.simulatePurchase({ merchantId: merchant, amountCents: parseEuro(amount) ?? 0, channel: merchant === 'bol' ? 'online' : 'contactless' }), { onDone: (r) => setBought({ merchant: r.merchant, cents: parseEuro(amount) ?? 0, wb: r.waveBackCents, topped: r.toppedUpCents }), onError: (e) => toast(e.message, 'error') })} />}>
        {bought ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <SuccessMark size={72} />
            <T variant="title3" center style={{ marginTop: 8 }}>{money(bought.cents)} at {bought.merchant}</T>
            {bought.wb > 0 && <T weight="700" color={color.indigo}>+{money(bought.wb)} Wave Back</T>}
            {bought.topped > 0 && <T variant="footnote" color={color.textSecondary}>Topped up {money(bought.topped)} from your bank</T>}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Select label="Shop" value={merchant} onChange={setMerchant} options={MERCHANTS.map((m) => ({ key: m.id, label: m.name, sub: m.category }))} />
            <Input label="Amount (€)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
            <T variant="caption" color={color.textSecondary}>Wave Back is higher at Hayve partners and on Hayve services.</T>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: 4 }}>
      <T variant="caption" color={color.textSecondary}>{label}</T>
      <T variant="headline" selectable style={{ letterSpacing: 1 }}>{value}</T>
    </View>
  );
}

function Action({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: active || hovered ? color.black : color.grey200, backgroundColor: active ? color.black : pressed ? color.grey100 : color.white, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Icon name={icon} size={20} color={active ? color.white : color.black} />
      <T variant="caption" weight="700" color={active ? color.white : color.black}>{label}</T>
    </Pressable>
  );
}

/** Wallet buttons in the platforms' own black style. */
function WalletButton({ kind, onPress }: { kind: 'apple' | 'google'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={kind === 'apple' ? 'Add to Apple Wallet' : 'Add to Google Pay'} style={({ pressed }) => ({ height: 48, borderRadius: 12, backgroundColor: color.black, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed ? 0.85 : 1 })}>
      <Icon name="wallet-outline" size={20} color={color.white} />
      <T weight="700" color={color.white}>{kind === 'apple' ? 'Add to Apple Wallet' : 'Add to Google Pay'}</T>
    </Pressable>
  );
}
