import { useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Button, color, Group, Header, IconButton, Input, ListRow, Screen, Section, Sheet, T } from '../../design';
import { SimNote } from '../../features/common';
import { SecureNote, useRegion } from '../../features/payments';
import { useAction, useLive } from '../../lib/hooks';

/**
 * Payout account: where withdrawals go. Adding money and paying by card happen in the payment
 * provider's checkout, so there are no saved cards or bank connections in Hayve.
 */
export default function PayoutAccount() {
  const account = useLive(() => wallet.payoutAccount()).data;
  const reg = useRegion();
  const [open, setOpen] = useState(false);
  const [holder, setHolder] = useState('');
  const [number, setNumber] = useState('');
  const [routing, setRouting] = useState('');
  const { run, busy } = useAction();

  return (
    <Screen header={<Header back title="Payout account" fallback="/pay" />} maxWidth={640}>
      <T color={color.textSecondary}>Where your withdrawals go. To add money or pay by card, you use our payment provider's checkout each time: no cards are stored in Hayve.</T>
      <Section title="Bank account for withdrawals" style={{ marginTop: 16 }}>
        <Group>
          {account ? (
            <ListRow icon="bank-outline" title={account.label} subtitle="Withdrawals are paid here" chevron={false} right={<IconButton icon="trash-outline" label="Remove payout account" tone="clear" onPress={() => run(() => wallet.removePayoutAccount(), { success: 'Payout account removed' })} />} />
          ) : (
            <ListRow icon="add" title="Add a payout account" subtitle={`Your bank account in ${reg.name}`} onPress={() => setOpen(true)} />
          )}
        </Group>
        {account && <Button title="Use a different account" variant="ghost" size="sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => setOpen(true)} />}
      </Section>
      <View style={{ marginTop: 16 }}>
        <SimNote text="Simulated. In the live app our payment provider verifies the account holder and sends payouts." />
      </View>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Payout account"
        footer={<Button title="Save" size="lg" full loading={busy} onPress={() => run(() => wallet.setPayoutAccount({ holder, account: number, routing }), { success: 'Payout account saved', onDone: () => setOpen(false) })} />}
      >
        <View style={{ gap: 12 }}>
          <Input label="Account holder" icon="person-outline" value={holder} onChangeText={setHolder} />
          {reg.account.routingLabel && <Input label={reg.account.routingLabel} icon="bank-outline" placeholder={reg.account.routingPlaceholder} keyboardType="number-pad" value={routing} onChangeText={setRouting} />}
          <Input label={reg.account.label} icon="bank-outline" placeholder={reg.account.placeholder} autoCapitalize="characters" keyboardType={reg.account.routingLabel ? 'number-pad' : 'default'} value={number} onChangeText={setNumber} />
          <SecureNote text="Must be an account in your own name. We keep only the last 4 digits." />
        </View>
      </Sheet>
    </Screen>
  );
}
