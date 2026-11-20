import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { requests, wallet } from '../../backend/api';
import { Appear, Avatar, Button, Card, color, ErrorState, HayveLogo, Header, Icon, Input, Notice, Photo, radius, Screen, Sheet, SimBadge, SuccessMark, T, tap, VerifiedMark } from '../../design';
import type { IconName } from '../../design/icons';
import { BankPicker, CardForm, type CardResult, SecureNote, useBankApproval } from '../../features/payments';
import { money } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';
import { setReturnTo } from '../../lib/returnTo';

type Step = null | 'bank' | 'card' | 'hayve';

/**
 * The page someone opens from a shared payment link. Works without a Hayve account:
 * pay by bank (iDEAL | Wero), debit or credit card, or with Hayve Pay.
 */
export default function PayRequestPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = useSessionId();
  const { data: r, error } = useLive(() => requests.publicView(id), [id]);
  const balance = useLive(() => (sessionId ? wallet.wallet().available : null), [sessionId]).data ?? null;
  const [step, setStep] = useState<Step>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bank, setBank] = useState<string | null>(null);
  const [card, setCard] = useState<CardResult | null>(null);
  const onCard = useCallback((c: CardResult | null) => setCard(c), []);
  const [done, setDone] = useState<{ signedIn: boolean } | null>(null);
  const { approving, approve } = useBankApproval();
  const { run, busy } = useAction();

  if (error || !r) return <Screen header={<Header back title="Payment request" fallback="/" />}>{error && <ErrorState message="This payment link doesn't exist or was removed." />}</Screen>;

  const who = r.business?.name ?? r.requester.firstName;
  const needsName = !sessionId && !r.shares;
  const nameOk = !needsName || name.trim().length >= 2;
  const canPay = r.status === 'pending' && !r.isOwner && (!r.shares || !!shareId);
  const pay = (method: 'bank' | 'card' | 'hayve') =>
    run(() => requests.pay(r.id, { method, payerName: name || undefined, shareId: shareId ?? undefined, bank: bank ?? undefined, card: card ? { brand: card.brand, last4: card.last4 } : undefined }), {
      onDone: (res) => {
        setStep(null);
        setDone({ signedIn: res.signedIn });
      },
    });

  const header = (
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
  );

  return (
    <Screen header={<Header back fallback="/" />} maxWidth={480}>
      {header}
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
              {r.kind === 'deposit' ? 'Deposit request' : r.kind === 'split' ? 'Split bill' : r.business ? 'Business request' : 'Payment request'}
            </T>
          </View>
          <View style={{ borderWidth: 1, borderColor: color.indigo, borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: 'center' }}>
            <T variant="caption" weight="700" color={color.indigo}>
              {r.status === 'pending' ? 'Open' : r.status === 'paid' ? 'Paid' : r.status === 'expired' ? 'Expired' : 'Cancelled'}
            </T>
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 4, marginTop: 20 }}>
          <T style={{ fontSize: 48, lineHeight: 56, fontWeight: '800', letterSpacing: -1.2, color: color.ink }}>{money(r.amountCents)}</T>
          <T variant="subhead" color={color.textSecondary}>
            {r.kind === 'split' ? 'Your share' : `Requested by ${who}`}
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
            {r.kind === 'deposit' ? `${money(r.amountCents)} is held for ${who}.` : `${money(r.amountCents)} sent to ${who}. They've been told.`}
          </T>
          {!done.signedIn && (
            <Card style={{ alignSelf: 'stretch', gap: 10, marginTop: 16 }}>
              <T variant="headline">Like how easy that was?</T>
              <T variant="footnote" color={color.textSecondary}>
                With a free Hayve account you can request money, split bills and pay friends in seconds.
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
          {r.shares && (
            <Card style={{ gap: 10 }}>
              <T variant="headline">Who are you?</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {r.shares.map((s) => {
                  const on = shareId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      disabled={s.paid}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: s.paid }}
                      onPress={() => {
                        tap();
                        setShareId(s.id);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 999, borderWidth: on ? 1.5 : 1, borderColor: on ? color.indigo : color.grey200, opacity: s.paid ? 0.5 : 1 }}
                    >
                      {s.paid && <Icon name="checkmark" size={14} />}
                      <T variant="subhead" weight="600" color={on ? color.indigo : color.black} style={s.paid ? { textDecorationLine: 'line-through' } : undefined}>
                        {s.name}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
              {r.splitTotalCents ? (
                <T variant="footnote" color={color.textSecondary}>
                  {money(r.splitTotalCents)} total, split between {r.shares.length + 1} people
                </T>
              ) : null}
            </Card>
          )}

          {needsName && <Input label="Your name" icon="person-outline" placeholder={`So ${who} knows who paid`} value={name} onChangeText={setName} maxLength={60} autoComplete="name" />}

          <View style={{ borderRadius: radius.lg, backgroundColor: color.grey100, padding: 6 }}>
            <T variant="headline" style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
              How would you like to pay?
            </T>
            <Method icon="bank-outline" title="Bank payment" sub="iDEAL | Wero" disabled={!canPay || !nameOk} onPress={() => setStep('bank')} />
            <Method icon="card-outline" title="Debit or credit card" sub="Visa, Mastercard, Maestro, Amex" disabled={!canPay || !nameOk} onPress={() => setStep('card')} />
            <Method
              icon="wallet-outline"
              title="Hayve Pay"
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
          {r.shares && !shareId && (
            <T variant="footnote" color={color.grey500} center>
              Pick your name first
            </T>
          )}
          <T variant="caption" color={color.grey500} center>
            No fees for you. You don't need a Hayve account. Preview build: no real money moves.
          </T>
        </View>
      )}

      <Sheet
        visible={step === 'bank'}
        onClose={() => setStep(null)}
        title="Pay with your bank"
        footer={<Button title={approving ? 'Approve in your bank app…' : bank ? `Pay ${money(r.amountCents)} with ${bank}` : 'Choose your bank'} size="lg" full loading={approving || busy} disabled={!bank} onPress={() => approve(() => pay('bank'))} />}
      >
        <View style={{ gap: 14 }}>
          <T variant="footnote" color={color.textSecondary}>
            iDEAL | Wero: choose your bank, then approve the payment in your bank app.
          </T>
          <BankPicker value={bank} onChange={setBank} />
          <SecureNote text="You approve in your own bank app. Hayve never sees your bank login." />
        </View>
      </Sheet>

      <Sheet visible={step === 'card'} onClose={() => setStep(null)} title="Pay by card" footer={<Button title={`Pay ${money(r.amountCents)}`} size="lg" full loading={busy} disabled={!card} onPress={() => pay('card')} />}>
        <CardForm onChange={onCard} />
      </Sheet>

      <Sheet visible={step === 'hayve'} onClose={() => setStep(null)} title="Pay with Hayve Pay" footer={<Button title={`Pay ${money(r.amountCents)}`} size="lg" full loading={busy} disabled={(balance ?? 0) < r.amountCents} onPress={() => pay('hayve')} />}>
        <View style={{ gap: 10 }}>
          <T>
            From your Hayve balance ({money(balance ?? 0)} available) to {who}.
          </T>
          {(balance ?? 0) < r.amountCents && <Notice title="Not enough balance" body="Pay by bank or card instead, or add money first." />}
        </View>
      </Sheet>
    </Screen>
  );
}

function Method({ icon, title, sub, onPress, disabled, last }: { icon: IconName; title: string; sub: string; onPress: () => void; disabled?: boolean; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed || hovered ? color.white : 'transparent', borderBottomWidth: last ? 0 : 1, borderBottomColor: color.grey200, opacity: disabled ? 0.45 : 1 })}
    >
      <Icon name={icon} size={22} />
      <View style={{ flex: 1 }}>
        <T variant="headline">{title}</T>
        <T variant="footnote" color={color.grey500}>
          {sub}
        </T>
      </View>
      <Icon name="chevron-forward" size={18} color={color.grey500} />
    </Pressable>
  );
}
