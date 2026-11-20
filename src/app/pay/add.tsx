import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Button, Card, Header, KeyValue, parseEuro, Screen, Sheet } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput } from '../../features/pay';
import { CardForm, type CardResult } from '../../features/payments';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

/**
 * Add money to the Hayve Pay balance. The card step is the payment provider's checkout
 * (simulated here); Hayve records the top-up in the ledger once the provider confirms it.
 */
export default function AddMoney() {
  const [amount, setAmount] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [card, setCard] = useState<CardResult | null>(null);
  const onCard = useCallback((c: CardResult | null) => setCard(c), []);
  const w = useLive(() => wallet.wallet()).data;
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;
  return (
    <Screen header={<Header back title="Add money" fallback="/pay" />} maxWidth={520} keyboard footer={<Button title={cents ? `Continue to pay ${money(cents)}` : 'Add money'} size="lg" variant="accent" full disabled={cents < 100} onPress={() => setCheckout(true)} />}>
      <AmountInput value={amount} onChange={setAmount} />
      <Card>
        <KeyValue label="Pay with" value="Debit or credit card" />
        <KeyValue label="Arrives" value="Instantly" />
        <KeyValue label="Fee" value="Free" />
        <KeyValue label="New balance" value={money((w?.available ?? 0) + cents)} strong />
      </Card>
      <View style={{ marginTop: 12 }}>
        <SimNote text="Simulated: no card is charged. In the live app you pay in our payment provider's secure checkout." />
      </View>
      <Sheet visible={checkout} onClose={() => setCheckout(false)} title={`Pay ${money(cents)}`} footer={<Button title={`Pay ${money(cents)}`} size="lg" full loading={busy} disabled={!card} onPress={() => run(() => wallet.addMoney(cents), { success: `${money(cents)} added`, onDone: () => router.replace('/pay') })} />}>
        <CardForm onChange={onCard} />
      </Sheet>
    </Screen>
  );
}
