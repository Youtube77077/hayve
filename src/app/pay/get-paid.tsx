import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { tap as tapApi } from '../../backend/api';
import type { TapView } from '../../backend/api/tap';
import { Button, color, Header, Icon, Input, MOTION, ND, Notice, radius, Screen, Sheet, SimBadge, SimQR, SuccessMark, T, tap, useLayout, useReducedMotion, useShake } from '../../design';
import { ContactlessMark } from '../../features/card';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

type Stage = 'amount' | 'tap' | 'done';

/** Hayve Pay › Get paid: the phone becomes a contactless terminal (Tap to Pay). */
export default function GetPaid() {
  const st = useLive(() => tapApi.status()).data;
  const { run, busy } = useAction();
  const [stage, setStage] = useState<Stage>('amount');
  const [digits, setDigits] = useState('');
  const [note, setNote] = useState('');
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [result, setResult] = useState<TapView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [to, setTo] = useState('');
  const shake = useShake();
  const cents = Number(digits || '0');

  if (!st) return <Screen header={<Header back title="Get paid" fallback="/pay" />}>{null}</Screen>;

  if (!st.identityVerified) {
    return (
      <Screen header={<Header back title="Get paid" fallback="/pay" />} maxWidth={560}>
        <View style={{ alignItems: 'center', marginTop: 24, gap: 16 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="tap-to-pay" size={36} />
          </View>
          <T variant="title2" center>Turn your phone into a card terminal</T>
          <T color={color.textSecondary} center style={{ maxWidth: 420 }}>
            People tap their card, phone or watch on your phone and the money lands in your Hayve balance. First, a quick identity check through our payment partner.
          </T>
        </View>
        <View style={{ gap: 8, marginTop: 24 }}>
          {['Takes about two minutes with your ID', 'Hayve never sees or stores card numbers', 'You pay small Fees per payment; the payer pays nothing extra'].map((x) => (
            <View key={x} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Icon name="checkmark" size={18} color={color.indigo} />
              <T>{x}</T>
            </View>
          ))}
        </View>
        <Button title="Verify my identity" size="lg" full style={{ marginTop: 32 }} loading={busy} onPress={() => run(() => tapApi.verifyIdentity(), { success: 'Identity verified' })} />
        <T variant="caption" color={color.textSecondary} center style={{ marginTop: 12 }}>Demo: the check completes instantly.</T>
      </Screen>
    );
  }

  const fee = Math.round(cents * (st.feeExampleCents / 2400));
  const press = (k: string) => {
    tap();
    setError(null);
    if (k === 'del') return setDigits((d) => d.slice(0, -1));
    const next = (digits + k).replace(/^0+/, '');
    if (Number(next) > st.maxPaymentCents) {
      shake.shake();
      return;
    }
    setDigits(next.slice(0, 7));
  };

  const charge = () => {
    if (cents < 50) {
      shake.shake();
      setError('Enter at least €0.50');
      return;
    }
    run(() => tapApi.createCharge(cents, note), {
      onDone: (id) => {
        setChargeId(id);
        setStage('tap');
      },
      onError: (e) => {
        shake.shake();
        setError(e.message);
      },
    });
  };

  const simulate = (payer: Parameters<typeof tapApi.simulateTap>[1]) => {
    if (!chargeId) return;
    try {
      const r = tapApi.simulateTap(chargeId, payer);
      setResult(r);
      setStage('done');
      tap('success');
    } catch (e) {
      setError((e as Error).message);
      tap('warning');
      if (/declined/.test((e as Error).message)) setStage('amount');
    }
  };

  const reset = () => {
    setStage('amount');
    setDigits('');
    setNote('');
    setChargeId(null);
    setResult(null);
    setError(null);
  };

  if (stage === 'tap') {
    return (
      <Screen header={<Header title="Get paid" right={<SimBadge />} />} maxWidth={560} scroll>
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <T variant="title1" weight="800" style={{ fontSize: 44, lineHeight: 52 }}>{money(cents)}</T>
          {note ? <T color={color.textSecondary}>{note}</T> : null}
          <TapRings />
          <T variant="title3" center>Hold card or phone here</T>
          <T color={color.textSecondary} center style={{ marginTop: 4 }}>Contactless cards, Apple Pay, Google Pay and watches</T>
        </View>
        {error && <View style={{ marginTop: 16 }}><Notice icon="alert-circle" title="Payment not taken" body={error} /></View>}
        <View style={{ marginTop: 24, borderWidth: 1, borderColor: color.grey200, borderRadius: radius.lg, padding: 16, gap: 8 }}>
          <T variant="overline" color={color.textSecondary}>Demo: simulate the payer</T>
          <DemoRow label="Visa •••• 4417 (no Hayve account)" onPress={() => simulate({ method: 'card', brand: 'Visa', last4: '4417' })} />
          <DemoRow label="Apple Pay (QR Wave Back claim)" onPress={() => simulate({ method: 'apple_pay', brand: 'Visa', last4: '8821' })} />
          <DemoRow label="Noor · Mastercard saved in Hayve" onPress={() => simulate({ method: 'card', brand: 'Mastercard', last4: '5100', payerUsername: 'noor' })} />
          <DemoRow label="Noor · Hayve balance" onPress={() => simulate({ method: 'hayve_balance', payerUsername: 'noor' })} />
          <DemoRow label="No connection" onPress={() => simulate({ method: 'card', offline: true })} />
          <DemoRow label="Card declined" onPress={() => simulate({ method: 'card', decline: true })} />
        </View>
        <Button title="Cancel" variant="ghost" full style={{ marginTop: 12 }} onPress={() => { if (chargeId) tapApi.cancelCharge(chargeId); reset(); }} />
      </Screen>
    );
  }

  if (stage === 'done' && result) {
    return (
      <Screen header={<Header title="Paid" right={<SimBadge />} />} maxWidth={560}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 24 }}>
          <SuccessMark size={88} />
          <T weight="800" style={{ fontSize: 40, lineHeight: 48, marginTop: 12 }}>{money(result.amountCents)}</T>
          <T variant="headline">Paid by {result.payerMethod === 'apple_pay' || result.payerMethod === 'google_pay' ? `${result.methodLabel} · ` : ''}{result.cardBrand}{result.last4 ? ` •••• ${result.last4}` : ''}</T>
          <T color={color.textSecondary} center>
            {money(result.netCents)} added to your Hayve balance · Pending, available soon
          </T>
        </View>
        <View style={{ marginTop: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.grey200, paddingVertical: 12, gap: 8 }}>
          <Line label="Amount" value={money(result.amountCents)} />
          <Line label="Fees" value={`−${money(result.feeCents)}`} />
          <Line label="You get" value={money(result.netCents)} strong />
        </View>
        {result.waveBackClaimable ? (
          <View style={{ alignItems: 'center', marginTop: 24, gap: 8 }}>
            <SimQR value={result.receiptUrl} size={160} />
            <T variant="headline" center>Have Hayve? Scan to get your Wave Back</T>
            <T variant="footnote" color={color.textSecondary} center>The payer can claim it within 24 hours.</T>
          </View>
        ) : result.waveBackCents ? (
          <T variant="footnote" color={color.indigo} center style={{ marginTop: 16 }}>The payer got {money(result.waveBackCents)} Wave Back</T>
        ) : null}
        <View style={{ gap: 8, marginTop: 24 }}>
          <Button title="Send receipt" icon="mail-outline" variant="secondary" full onPress={() => setReceiptOpen(true)} />
          <Button title="New payment" size="lg" full onPress={reset} />
          <Button title="Done" variant="ghost" full onPress={() => router.replace('/pay')} />
        </View>
        <Sheet visible={receiptOpen} onClose={() => setReceiptOpen(false)} title="Send receipt" footer={<Button title="Send" size="lg" full loading={busy} onPress={() => run(() => tapApi.sendReceipt(result.id, to.includes('@') && !to.startsWith('@') ? { email: to } : { username: to }), { success: 'Receipt sent', onDone: () => { setReceiptOpen(false); setTo(''); } })} />}>
          <Input label="Email or Hayve username" placeholder="name@example.com or @username" autoCapitalize="none" value={to} onChangeText={setTo} />
        </Sheet>
      </Screen>
    );
  }

  return (
    <Screen header={<Header back title="Get paid" fallback="/pay" right={<SimBadge />} />} maxWidth={480} footer={<Button title={cents ? `Charge ${money(cents)}` : 'Enter an amount'} size="lg" full disabled={!cents} loading={busy} onPress={charge} />}>
      {st.monthlyLimitCents != null && (
        <T variant="caption" color={color.textSecondary} center>
          {money(st.monthReceivedCents)} of {money(st.monthlyLimitCents)} received this month
        </T>
      )}
      <Animated.View style={[{ alignItems: 'center', marginTop: 16 }, shake.style]}>
        <T weight="800" style={{ fontSize: 56, lineHeight: 64, letterSpacing: -1.5, color: cents ? color.black : color.grey500 }} accessibilityLiveRegion="polite">
          {money(cents)}
        </T>
        <T variant="footnote" color={color.textSecondary}>{cents ? `Fees ${money(fee)} · you get ${money(cents - fee)}` : 'The payer pays nothing extra'}</T>
      </Animated.View>
      {error && <T variant="footnote" weight="700" center style={{ marginTop: 8 }}>{error}</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 24, rowGap: 8 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'].map((k) => (
          <Key key={k} k={k} onPress={() => press(k)} />
        ))}
      </View>
      <Input containerStyle={{ marginTop: 16 }} placeholder="Add a note (optional), e.g. Concert tickets" value={note} onChangeText={setNote} maxLength={80} />
    </Screen>
  );
}

function Key({ k, onPress }: { k: string; onPress: () => void }) {
  const { isWide } = useLayout();
  return (
    <View style={{ width: '33.33%', paddingHorizontal: 4 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete' : k} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ height: isWide ? 64 : 68, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? color.grey200 : hovered ? color.grey100 : 'transparent', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        {k === 'del' ? <Icon name="backspace-outline" size={26} /> : <T weight="600" style={{ fontSize: 28 }}>{k}</T>}
      </Pressable>
    </View>
  );
}

function DemoRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed || hovered ? color.grey100 : 'transparent' })}>
      <Icon name="tap-to-pay" size={18} />
      <T variant="subhead" weight="600" style={{ flex: 1 }}>{label}</T>
      <Icon name="chevron-forward" size={16} color={color.grey500} />
    </Pressable>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <T color={strong ? color.black : color.textSecondary} weight={strong ? '700' : '400'}>{label}</T>
      <T weight={strong ? '800' : '600'}>{value}</T>
    </View>
  );
}

/** Pulsing rings around the contactless mark (calm, eases in and out). */
function TapRings() {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: MOTION.easeInOut, useNativeDriver: ND }));
    loop.start();
    return () => loop.stop();
  }, [v, reduced]);
  return (
    <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginVertical: 24 }}>
      {[0, 0.33, 0.66].map((o) => {
        const p = Animated.modulo(Animated.add(v, o), 1);
        return (
          <Animated.View
            key={o}
            style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 2, borderColor: color.indigo, opacity: p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.15, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }] }}
          />
        );
      })}
      <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: color.indigo, alignItems: 'center', justifyContent: 'center' }}>
        <ContactlessMark size={44} />
      </View>
    </View>
  );
}
