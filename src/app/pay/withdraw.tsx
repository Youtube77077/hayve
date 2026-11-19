import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Button, Card, color, Header, KeyValue, Notice, parseEuro, Screen } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput } from '../../features/pay';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function Withdraw() {
  const [amount, setAmount] = useState('');
  const w = useLive(() => wallet.wallet()).data;
  const bank = useLive(() => wallet.paymentMethods().find((m) => m.kind === 'bank')).data;
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;
  return (
    <Screen header={<Header back title="Withdraw" fallback="/pay" />} maxWidth={520} keyboard footer={<Button title={cents ? `Withdraw ${money(cents)}` : 'Withdraw'} size="lg" full loading={busy} disabled={cents < 100 || !bank} onPress={() => run(() => wallet.withdraw(cents), { success: 'Withdrawal started', onDone: () => router.replace('/pay') })} />}>
      {!bank && <Notice tone="warning" title="Add a bank account first" body="Withdrawals are paid to a bank account in your name." action="Add bank account" onAction={() => router.push('/pay/methods')} />}
      <AmountInput value={amount} onChange={setAmount} />
      <Card>
        <KeyValue label="To" value={bank?.label ?? '—'} />
        <KeyValue label="Available" value={money(w?.available ?? 0)} tone={cents > (w?.available ?? 0) ? color.danger : undefined} />
        <KeyValue label="Arrives" value="1 business day" />
        <KeyValue label="Fee" value="Free" />
      </Card>
      <View style={{ marginTop: 12 }}>
        <SimNote text="Withdrawals are simulated. No bank transfer is made." />
      </View>
    </Screen>
  );
}
