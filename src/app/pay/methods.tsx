import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Badge, Button, color, Group, Header, IconButton, Input, ListRow, Screen, Section, Sheet, T } from '../../design';
import { SimNote } from '../../features/common';
import { BankPicker, CardForm, type CardResult, ConnectionChoice, SecureNote, useBankApproval } from '../../features/payments';
import { useAction, useLive } from '../../lib/hooks';

/** Cards and banks: connect a bank (iDEAL | Wero or SEPA mandate) or add a debit/credit card. */
export default function PaymentMethods() {
  const methods = useLive(() => wallet.paymentMethods()).data ?? [];
  const cards = methods.filter((m) => m.kind === 'card');
  const bank = methods.find((m) => m.kind === 'bank');
  const [sheet, setSheet] = useState<null | 'card' | 'bank'>(null);
  const [card, setCard] = useState<CardResult | null>(null);
  const onCard = useCallback((c: CardResult | null) => setCard(c), []);
  const [connection, setConnection] = useState<'ideal_wero' | 'sepa_debit'>('ideal_wero');
  const [bankName, setBankName] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [holder, setHolder] = useState('');
  const { approving, approve } = useBankApproval();
  const { run, busy } = useAction();

  const connect = () =>
    connection === 'ideal_wero'
      ? approve(() => run(() => wallet.connectBank({ connection, bank: bankName! }), { success: `${bankName} connected`, onDone: () => setSheet(null) }))
      : run(() => wallet.connectBank({ connection, iban, holder }), { success: 'Bank connected', onDone: () => setSheet(null) });

  return (
    <Screen header={<Header back title="Cards and banks" fallback="/pay" />} maxWidth={640}>
      <T color={color.textSecondary}>Pay, top up and receive money with your own bank or card. Your Hayve balance is used first where you choose it.</T>

      <Section title="Bank account" style={{ marginTop: 16 }}>
        <Group>
          {bank ? (
            <ListRow
              icon="bank-outline"
              title={bank.label}
              subtitle={bank.connection === 'sepa_debit' ? 'SEPA Direct Debit mandate · payments, top-ups and withdrawals' : 'Connected with iDEAL | Wero · payments, top-ups and withdrawals'}
              chevron={false}
              right={<IconButton icon="trash-outline" label="Disconnect bank" tone="clear" onPress={() => run(() => wallet.deletePaymentMethod(bank.id), { success: 'Bank disconnected' })} />}
            />
          ) : (
            <ListRow icon="bank-outline" title="Connect your bank" subtitle="iDEAL | Wero: approve in your bank app, no IBAN typing" onPress={() => setSheet('bank')} />
          )}
        </Group>
        {bank && <Button title="Connect a different bank" variant="ghost" size="sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => setSheet('bank')} />}
      </Section>

      <Section title="Debit and credit cards">
        <Group>
          {cards.map((m) => (
            <ListRow
              key={m.id}
              icon="card-outline"
              title={`${m.brand ?? 'Card'} •••• ${m.last4}`}
              subtitle={`${m.funding === 'credit' ? 'Credit card' : m.funding === 'debit' ? 'Debit card' : 'Card'}${m.expiry ? ` · expires ${m.expiry}` : ''}`}
              chevron={false}
              onPress={m.isDefault ? undefined : () => run(() => wallet.setDefaultCard(m.id), { success: 'Default card updated' })}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {m.isDefault && <Badge label="Default" tone="primary" />}
                  <IconButton icon="trash-outline" label="Remove card" tone="clear" onPress={() => run(() => wallet.deletePaymentMethod(m.id), { success: 'Card removed' })} />
                </View>
              }
            />
          ))}
          <ListRow icon="add" title="Add a debit or credit card" subtitle="Visa, Mastercard, Maestro, American Express" onPress={() => setSheet('card')} />
        </Group>
      </Section>

      <View style={{ marginTop: 16 }}>
        <SimNote text="Bank connections and cards are simulated in this build. In production they run through our licensed payment partner." />
      </View>

      <Sheet
        visible={sheet === 'card'}
        onClose={() => setSheet(null)}
        title="Add a card"
        footer={<Button title="Save card" size="lg" full loading={busy} disabled={!card} onPress={() => run(() => wallet.addCard(card!), { success: 'Card saved', onDone: () => setSheet(null) })} />}
      >
        <CardForm onChange={onCard} />
      </Sheet>

      <Sheet
        visible={sheet === 'bank'}
        onClose={() => setSheet(null)}
        title="Connect your bank"
        footer={
          <Button
            title={approving ? 'Approve in your bank app…' : connection === 'ideal_wero' ? (bankName ? `Continue to ${bankName}` : 'Choose your bank') : 'Sign mandate'}
            size="lg"
            full
            loading={busy || approving}
            disabled={connection === 'ideal_wero' ? !bankName : iban.replace(/\s/g, '').length < 15}
            onPress={connect}
          />
        }
      >
        <View style={{ gap: 14 }}>
          <ConnectionChoice value={connection} onChange={setConnection} />
          {connection === 'ideal_wero' ? (
            <>
              <BankPicker value={bankName} onChange={setBankName} />
              <SecureNote text="You approve in your own bank app. Hayve never sees your bank login." />
            </>
          ) : (
            <>
              <Input label="IBAN" icon="bank-outline" placeholder="NL91 ABNA 0417 1643 00" autoCapitalize="characters" value={iban} onChangeText={setIban} />
              <Input label="Account holder" icon="person-outline" value={holder} onChangeText={setHolder} />
              <SecureNote text="By signing you allow Hayve's payment partner to collect payments you approve from this account (SEPA Direct Debit)." />
            </>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}
