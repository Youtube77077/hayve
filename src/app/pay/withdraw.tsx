import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Button, Card, color, Header, KeyValue, Notice, parseEuro, Screen } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput } from '../../features/pay';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

/** Withdraw eligible balance to your payout account (paid out by the payment provider). */
export default function Withdraw() {
  const [amount, setAmount] = useState('');
  const w = useLive(() => wallet.withdrawable()).data;
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;
  const tooMuch = !!w && cents > w.withdrawableCents;
  return (
    <Screen header={<Header back title="Withdraw" fallback="/pay" />} maxWidth={520} keyboard footer={<Button title={cents ? `Withdraw ${money(cents)}` : 'Withdraw'} size="lg" full loading={busy} disabled={cents < 100 || !w?.payoutAccount || tooMuch} onPress={() => run(() => wallet.withdraw(cents), { success: 'Withdrawal started', onDone: () => router.replace('/pay') })} />}>
      {w && !w.payoutAccount && <Notice title="Add a payout account first" body="Withdrawals are paid to a bank account in your name." action="Add payout account" onAction={() => router.push('/pay/methods')} />}
      <AmountInput value={amount} onChange={setAmount} />
      <Card>
        <KeyValue label="To" value={w?.payoutAccount?.label ?? '—'} />
        <KeyValue label="Can withdraw now" value={money(w?.withdrawableCents ?? 0)} tone={tooMuch ? color.danger : undefined} strong />
        {!!w?.heldTopUpsCents && <KeyValue label={`Added in the last ${w.holdDays} days`} value={money(w.heldTopUpsCents)} />}
        <KeyValue label="Arrives" value="1–3 business days" />
        <KeyValue label="Fee" value="Free" />
      </Card>
      {!!w?.heldTopUpsCents && (
        <View style={{ marginTop: 12 }}>
          <Notice title="Recently added money" body={`Money you add can be spent anywhere in Hayve right away, and withdrawn after ${w.holdDays} days. This protects you and sellers from card fraud.`} />
        </View>
      )}
      <View style={{ marginTop: 12 }}>
        <SimNote text="Withdrawals are simulated. In the live app our payment provider sends the payout to your bank." />
      </View>
    </Screen>
  );
}
