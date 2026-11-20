import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { requests, wallet } from '../../backend/api';
import { Appear, Avatar, Button, Card, color, ErrorState, HayveLogo, Header, Icon, Input, Notice, Photo, radius, Screen, Sheet, SimBadge, SuccessMark, T, tap, VerifiedMark } from '../../design';
import type { IconName } from '../../design/icons';
import { CardForm, type CardResult, PressScale } from '../../features/payments';
import { money, moneyIn } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';
import { setReturnTo } from '../../lib/returnTo';

type Step = null | 'card' | 'hayve';

/**
 * The page someone opens from a shared payment link. Works without a Hayve account: pay by card
 * (the payment provider's checkout) or, signed in, with the Hayve Pay balance.
 * Payers only see what they pay; progress on a split is visible to the requester only.
 */
export default function PayRequestPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = useSessionId();
  const { data: r, error } = useLive(() => requests.publicView(id), [id]);
  const balance = useLive(() => (sessionId ? wallet.wallet().available : null), [sessionId]).data ?? null;
  const [step, setStep] = useState<Step>(null);
  const [name, setName] = useState('');
  const [card, setCard] = useState<CardResult | null>(null);
  const onCard = useCallback((c: CardResult | null) => setCard(c), []);
  const [done, setDone] = useState<{ signedIn: boolean } | null>(null);
  const { run, busy } = useAction();

  if (error || !r) return <Screen header={<Header back title="Payment request" fallback="/" />}>{error && <ErrorState message="This payment link doesn't exist or was removed." />}</Screen>;

  const who = r.business?.name ?? r.requester.firstName;
  const amt = (c: number) => moneyIn(c, r.currency);
  const canPay = r.status === 'pending' && !r.isOwner;
  const pay = (method: 'card' | 'hayve') =>
    run(() => requests.pay(r.id, { method, payerName: name || undefined, card: card ? { brand: card.brand, last4: card.last4 } : undefined }), {
      onDone: (res) => {
        setStep(null);
        setDone({ signedIn: res.signedIn });
      },
    });
  const hoursLeft = Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 3_600_000));

  return (
    <Screen header={<Header back fallback="/" />} maxWidth={480}>
      <View style={{ alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <HayveLogo height={24} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="lock-closed-outline" size={12} color={color.grey500} />
          <T variant="caption" color={color.grey500}>
            Secure payment page
          </T>
          <SimBadge />
        </View>
      </View>
      <Card style={{ gap: 0, paddingVertical: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {r.business?.logo ? <Photo uri={r.business.logo} style={{ width: 44, height: 44 }} rounded={12} /> : <Avatar uri={r.requester.avatar} name={r.business?.name ?? r.requester.displayName} size={44} />}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T variant="headline" numberOfLines={1}>
                {r.business?.name ?? r.requester.displayName}
              </T>
              {r.business?.verified && <VerifiedMark size={15} />}
            </View>
            <T variant="footnote" color={color.textSecondary}>
              {r.kind === 'deposit' ? 'Deposit request' : r.isSplit ? 'Split bill' : r.business ? 'Business request' : 'Payment request'}
            </T>
          </View>
          <View style={{ borderWidth: 1, borderColor: color.indigo, borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: 'center' }}>
            <T variant="caption" weight="700" color={color.indigo}>
              {r.status === 'pending' ? 'Open' : r.status === 'paid' ? 'Paid' : r.status === 'expired' ? 'Expired' : 'Cancelled'}
            </T>
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 4, marginTop: 20 }}>
          <T style={{ fontSize: 48, lineHeight: 56, fontWeight: '800', letterSpacing: -1.2, color: color.ink }}>{amt(r.amountCents)}</T>
          <T variant="subhead" color={color.textSecondary}>
            {r.isSplit ? 'Your share' : `Requested by ${who}`}
          </T>
          <T variant="title3" center style={{ marginTop: 4 }}>
            {r.title}
          </T>
          {r.business && (
            <T variant="footnote" color={color.textSecondary}>
              Invoice {r.business.invoiceNumber}
            </T>
          )}
          {r.ref && (
            <T variant="caption" color={color.grey500} center>
              {r.ref.label}
            </T>
          )}
          {r.kind === 'deposit' && (
            <T variant="footnote" color={color.textSecondary} center style={{ marginTop: 6 }}>
              This amount is held on your account, not taken. {r.requester.firstName} releases it after your booking.
            </T>
          )}
        </View>
      </Card>

      {done ? (
        <Appear style={{ alignItems: 'center', gap: 10, marginTop: 28 }}>
          <SuccessMark size={76} />
          <T variant="title2">{r.kind === 'deposit' ? 'Deposit authorised' : 'Paid'}</T>
          <T color={color.textSecondary} center>
            {r.kind === 'deposit' ? `${amt(r.amountCents)} is held for ${who}.` : `${amt(r.amountCents)} sent to ${who}. They've been told.`}
          </T>
          {!done.signedIn && (
            <Card style={{ alignSelf: 'stretch', gap: 10, marginTop: 16 }}>
              <T variant="headline">Like how easy that was?</T>
              <T variant="footnote" color={color.textSecondary}>
                With a free Hayve account you can request money, split bills and pay with your balance in seconds.
              </T>
              <Button title="Create a Hayve account" full onPress={() => router.push('/sign-up')} />
            </Card>
          )}
        </Appear>
      ) : r.isOwner ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <Notice title="This is your request" body="Share the link. You'll see each payment as it comes in." />
          <Button title="Manage request" variant="secondary" full onPress={() => router.push(`/pay/link/${r.id}`)} />
        </View>
      ) : r.status !== 'pending' ? (
        <View style={{ marginTop: 16 }}>
          <Notice icon={r.status === 'paid' ? 'checkmark-circle-outline' : 'time-outline'} title={r.status === 'paid' ? 'This request has been paid' : r.status === 'expired' ? 'This payment link has expired' : 'This request was cancelled'} body={r.status === 'paid' ? 'Nothing more to pay.' : `Ask ${who} for a new link.`} />
        </View>
      ) : (
        <View style={{ gap: 16, marginTop: 16 }}>
          {!sessionId && <Input label="Your name (optional)" icon="person-outline" placeholder={`So ${who} knows who paid`} value={name} onChangeText={setName} maxLength={60} autoComplete="name" />}
          <View style={{ borderRadius: radius.lg, backgroundColor: color.grey100, padding: 6 }}>
            <T variant="headline" style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
              How would you like to pay?
            </T>
            <Method icon="card-outline" title="Debit or credit card" sub="Secure checkout by our payment provider" disabled={!canPay} onPress={() => setStep('card')} />
            <Method
              icon="wallet-outline"
              title="Hayve Pay balance"
              sub={sessionId ? `Balance ${money(balance ?? 0)}` : 'Sign in to pay with your balance'}
              disabled={!canPay}
              last
              onPress={() => {
                if (sessionId) setStep('hayve');
                else {
                  setReturnTo(`/r/${r.id}`);
                  router.push('/sign-in');
                }
              }}
            />
          </View>
          <T variant="caption" color={color.grey500} center>
            No fees for you. No Hayve account needed. This link works for {hoursLeft} more hours. Preview build: no real money moves.
          </T>
        </View>
      )}

      <Sheet visible={step === 'card'} onClose={() => setStep(null)} title="Pay by card" footer={<Button title={`Pay ${amt(r.amountCents)}`} size="lg" full loading={busy} disabled={!card} onPress={() => pay('card')} />}>
        <CardForm onChange={onCard} />
      </Sheet>

      <Sheet visible={step === 'hayve'} onClose={() => setStep(null)} title="Pay with Hayve Pay" footer={<Button title={`Pay ${amt(r.amountCents)}`} size="lg" full loading={busy} disabled={(balance ?? 0) < r.amountCents} onPress={() => pay('hayve')} />}>
        <View style={{ gap: 10 }}>
          <T>
            From your Hayve balance ({money(balance ?? 0)} available) to {who}.
          </T>
          {(balance ?? 0) < r.amountCents && <Notice title="Not enough balance" body="Pay by card instead, or add money first." />}
        </View>
      </Sheet>
    </Screen>
  );
}

function Method({ icon, title, sub, onPress, disabled, last }: { icon: IconName; title: string; sub: string; onPress: () => void; disabled?: boolean; last?: boolean }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      to={0.98}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 12, borderRadius: radius.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: color.grey200, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon name={icon} size={22} />
      <View style={{ flex: 1 }}>
        <T variant="headline">{title}</T>
        <T variant="footnote" color={color.grey500}>
          {sub}
        </T>
      </View>
      <Icon name="chevron-forward" size={18} color={color.grey500} />
    </PressScale>
  );
}
