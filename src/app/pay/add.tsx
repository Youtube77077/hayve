import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Button, Card, Header, KeyValue, parseEuro, Screen, Segmented } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput } from '../../features/pay';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function AddMoney() {
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'card' | 'bank'>('card');
  const w = useLive(() => wallet.wallet()).data;
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;
  return (
    <Screen header={<Header back title="Add money" fallback="/pay" />} maxWidth={520} keyboard footer={<Button title={cents ? `Add ${money(cents)}` : 'Add money'} size="lg" variant="accent" full loading={busy} disabled={cents < 100} onPress={() => run(() => wallet.addMoney(cents, source), { success: `${money(cents)} added`, onDone: () => router.replace('/pay') })} />}>
      <Segmented
        value={source}
        onChange={setSource}
        options={[
          { key: 'card', label: 'Card', icon: 'card-outline' },
          { key: 'bank', label: 'Bank transfer', icon: 'business-outline' },
        ]}
      />
      <AmountInput value={amount} onChange={setAmount} />
      <Card>
        <KeyValue label="From" value={source === 'card' ? 'Visa •••• 4242' : 'iDEAL / SEPA transfer'} />
        <KeyValue label="Arrives" value="Instantly" />
        <KeyValue label="Fee" value="Free" />
        <KeyValue label="New balance" value={money((w?.available ?? 0) + cents)} strong />
      </Card>
      <View style={{ marginTop: 12 }}>
        <SimNote text="Top-ups are simulated. A licensed payment provider will process real deposits in production." />
      </View>
    </Screen>
  );
}
