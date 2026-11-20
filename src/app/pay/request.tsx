import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { business, requests, social, wallet, type PublicUser } from '../../backend/api';
import { Button, Card, color, Group, Header, Input, parseEuro, Screen, Section, Segmented, Select, SimQR, Stepper, SwitchRow, T } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput, PersonPicker } from '../../features/pay';
import { ShareRow } from '../../features/payments';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';
import { publicUrl } from '../../lib/links';

type Mode = 'link' | 'split' | 'person' | 'qr';

/**
 * Request money: create a payment link anyone can pay (bank, card or Hayve, no account needed),
 * split a bill, ask a Hayve user directly, or show your QR code.
 */
export default function RequestMoney() {
  const params = useLocalSearchParams<{ mode?: string; ref?: string; refKind?: string; deposit?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'qr' ? 'qr' : params.mode === 'split' ? 'split' : params.mode === 'person' ? 'person' : 'link');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState(4);
  // "I'm not sure": no fixed number of people; everyone who opens the link pays the same amount.
  const [unsure, setUnsure] = useState(false);
  const [reusable, setReusable] = useState(false);
  const [expires, setExpires] = useState<'3' | '7' | '14' | '30'>('14');
  const [isBusiness, setIsBusiness] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [refKey, setRefKey] = useState<string | null>(params.ref && params.refKind ? `${params.refKind}:${params.ref}` : null);
  const [deposit, setDeposit] = useState(params.deposit === '1');
  const [person, setPerson] = useState<PublicUser | null>(null);
  const me = useLive(() => social.myProfile().profile).data;
  const biz = useLive(() => business.myBusiness()).data;
  const linkables = useLive(() => requests.linkables()).data ?? [];
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;
  const verified = biz?.status === 'verified';
  const ref = linkables.find((l) => `${l.kind}:${l.id}` === refKey) ?? null;
  const share = mode === 'split' ? (unsure ? cents : people >= 2 ? Math.round(cents / people) : 0) : 0;
  const kind = mode === 'split' ? 'split' : deposit && ref?.depositAllowed ? 'deposit' : isBusiness && verified ? 'business' : 'personal';

  const create = () =>
    run(
      () =>
        requests.create({
          kind,
          title,
          amountCents: mode === 'split' && !unsure ? undefined : cents,
          splitTotalCents: mode === 'split' && !unsure ? cents : undefined,
          people: mode === 'split' && !unsure ? people : undefined,
          reusable: kind === 'personal' || kind === 'business' ? reusable : false,
          expiresInDays: kind === 'business' ? Number(expires) : undefined,
          invoiceNumber: kind === 'business' ? invoice : undefined,
          ref: ref ? { kind: ref.kind, id: ref.id } : undefined,
        }),
      { onDone: (id) => router.replace(`/pay/link/${id}?new=1`) },
    );

  const footer =
    mode === 'link' || mode === 'split' ? (
      <Button title={mode === 'split' ? (share ? `Create link · ${money(share)} each` : 'Create split link') : cents ? `Create link for ${money(cents)}` : 'Create payment link'} size="lg" full loading={busy} disabled={cents < 100 || title.trim().length < 2} onPress={create} />
    ) : mode === 'person' ? (
      <Button title={cents ? `Request ${money(cents)}` : 'Request'} size="lg" full loading={busy} disabled={!person || cents < 100} onPress={() => run(() => wallet.requestMoney(person!.id, cents, title), { success: `Request sent to ${person!.displayName}`, onDone: () => router.replace('/pay/requests') })} />
    ) : undefined;

  return (
    <Screen header={<Header back title="Request money" fallback="/pay" right={<Button title="Track" size="sm" variant="ghost" onPress={() => router.push('/pay/requests')} />} />} maxWidth={560} keyboard footer={footer}>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { key: 'link', label: 'Link', icon: 'link-outline' },
          { key: 'split', label: 'Split', icon: 'people-outline' },
          { key: 'person', label: 'On Hayve', icon: 'at-outline' },
          { key: 'qr', label: 'QR', icon: 'qr-code-outline' },
        ]}
      />

      {mode === 'qr' ? (
        <View style={{ alignItems: 'center', marginTop: 24, gap: 14 }}>
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24, alignSelf: 'stretch' }}>
            <SimQR value={publicUrl(`/u/${me?.username}`)} size={200} />
            <T variant="title3">@{me?.username}</T>
            <T variant="footnote" color={color.textSecondary} center>
              Anyone can scan this to pay you. Personal QR payments are free.
            </T>
          </Card>
          <Card style={{ alignSelf: 'stretch' }}>
            <ShareRow url={publicUrl(`/u/${me?.username}`)} message="Pay me with Hayve:" />
          </Card>
          <SimNote text="Want a QR for a set amount? Create a link: every link has its own QR code." />
        </View>
      ) : mode === 'person' ? (
        <>
          <Section title="From">
            <PersonPicker selected={person} onSelect={setPerson} />
          </Section>
          {person && (
            <>
              <AmountInput value={amount} onChange={setAmount} />
              <Input icon="chatbubble-outline" placeholder="What's it for?" value={title} onChangeText={setTitle} maxLength={140} />
            </>
          )}
          <T variant="footnote" color={color.grey500} style={{ marginTop: 12 }}>
            They get the request in Hayve. For anyone else, use a link.
          </T>
        </>
      ) : (
        <>
          <AmountInput value={amount} onChange={setAmount} />
          {mode === 'split' && (
            <T variant="footnote" color={color.textSecondary} center style={{ marginTop: -10, marginBottom: 12 }}>
              {unsure ? 'What each person pays' : `Total bill${share ? ` · everyone pays ${money(share)}` : ''}`}
            </T>
          )}
          <Input icon="chatbubble-outline" label="Description" placeholder={mode === 'split' ? 'Dinner at Napoli Forno' : 'Dinner'} value={title} onChangeText={setTitle} maxLength={80} />

          {mode === 'split' && (
            <Section title="How many people?">
              <Card style={{ gap: 12 }}>
                <Segmented
                  value={unsure ? 'unsure' : 'count'}
                  onChange={(v) => setUnsure(v === 'unsure')}
                  options={[
                    { key: 'count', label: 'I know how many' },
                    { key: 'unsure', label: "I'm not sure" },
                  ]}
                />
                {!unsure && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <T variant="headline">Splitting between</T>
                      <T variant="footnote" color={color.textSecondary}>
                        Including you
                      </T>
                    </View>
                    <Stepper value={people} min={2} max={20} onChange={setPeople} />
                  </View>
                )}
                <T variant="footnote" color={color.textSecondary}>
                  {unsure
                    ? `Send one link. Everyone who opens it pays ${share ? money(share) : 'the same amount'}; however many pay, pay.`
                    : `Send one link. Everyone pays ${share ? money(share) : 'their share'} and your bar fills up as they pay.`}{' '}
                  Only you can see who paid. Links work for 72 hours.
                </T>
              </Card>
            </Section>
          )}

          {linkables.length > 0 && (
            <Section title="Link to an order or booking">
              <Select
                icon="link-outline"
                value={refKey}
                placeholder="Not linked"
                onChange={(k) => {
                  setRefKey(k === 'none' ? null : k);
                  const l = linkables.find((x) => `${x.kind}:${x.id}` === k);
                  if (l && !title) setTitle(l.label);
                  if (l?.amountCents && !amount) setAmount((l.amountCents / 100).toFixed(2));
                }}
                options={[{ key: 'none', label: 'Not linked' }, ...linkables.map((l) => ({ key: `${l.kind}:${l.id}`, label: l.label, sub: l.sub }))]}
              />
            </Section>
          )}

          {mode === 'link' && (
            <Section title="Options">
              <Group>
                {ref?.depositAllowed && <SwitchRow icon="shield-checkmark-outline" title="Authorised deposit" subtitle="The money is held, not taken. Release it or claim it after the booking." value={deposit} onChange={setDeposit} />}
                {verified && !deposit && <SwitchRow icon="storefront-outline" title="Business request" subtitle={`As ${biz!.tradingName}, with your logo and invoice number`} value={isBusiness} onChange={setIsBusiness} />}
                {!deposit && <SwitchRow icon="refresh-outline" title="Reusable link" subtitle={reusable ? 'Anyone can pay it more than once until it expires' : 'Closes after the first payment'} value={reusable} onChange={setReusable} />}
              </Group>
              {isBusiness && verified && !deposit && <Input containerStyle={{ marginTop: 12 }} icon="invoice-outline" label="Invoice number" placeholder="INV-2026-014" value={invoice} onChangeText={setInvoice} maxLength={30} />}
            </Section>
          )}

          {kind === 'business' ? (
            <Section title="Expires">
              <Segmented
                value={expires}
                onChange={setExpires}
                options={[
                  { key: '3', label: '3 days' },
                  { key: '7', label: '7 days' },
                  { key: '14', label: '14 days' },
                  { key: '30', label: '30 days' },
                ]}
              />
            </Section>
          ) : null}

          <T variant="footnote" color={color.grey500} style={{ marginTop: 12 }}>
            {kind === 'business' ? 'Business requests have a small fee per payment, shown on each payment. The person paying never pays a fee.' : 'Free. Your friends can pay by card or with Hayve, without a Hayve account. The link works for 72 hours.'}
          </T>
        </>
      )}
    </Screen>
  );
}
