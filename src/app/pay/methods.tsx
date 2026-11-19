import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { wallet } from '../../backend/api';
import { Badge, Button, color, Group, Header, IconButton, Input, ListRow, Screen, Section, Segmented, Sheet } from '../../design';
import { SimNote } from '../../features/common';
import { useAction, useLive } from '../../lib/hooks';

export default function PaymentMethods() {
  const methods = useLive(() => wallet.paymentMethods()).data ?? [];
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'card' | 'bank'>('card');
  const [number, setNumber] = useState('');
  const { run, busy } = useAction();
  return (
    <Screen header={<Header back title="Payment methods" fallback="/pay" right={<Button title="Add" icon="add" size="sm" onPress={() => setOpen(true)} />} />} maxWidth={640}>
      <Section title="Cards & bank accounts" style={{ marginTop: 4 }}>
        <Group>
          {methods.map((m) => (
            <ListRow
              key={m.id}
              icon={m.kind === 'card' ? 'card-outline' : 'business-outline'}
              title={m.kind === 'card' ? `${m.label} •••• ${m.last4}` : m.label}
              subtitle={m.kind === 'card' ? 'Card' : 'Bank account (withdrawals)'}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {m.isDefault && <Badge label="Default" tone="lime" />}
                  <IconButton icon="trash-outline" label="Remove" tone="clear" iconColor={color.danger} onPress={() => run(() => wallet.deletePaymentMethod(m.id), { success: 'Removed' })} />
                </View>
              }
            />
          ))}
          {methods.length === 0 && <ListRow icon="add" title="Add your first payment method" onPress={() => setOpen(true)} />}
        </Group>
      </Section>
      <View style={{ marginTop: 14 }}>
        <SimNote text="Card details are not stored or charged in this build. Only the last four digits are kept for display." />
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Add payment method" footer={<Button title="Save" size="lg" full loading={busy} onPress={() => run(() => wallet.addPaymentMethod({ kind, number }), { success: 'Payment method added', onDone: () => { setOpen(false); setNumber(''); } })} />}>
        <View style={{ gap: 14 }}>
          <Segmented value={kind} onChange={setKind} options={[{ key: 'card', label: 'Card' }, { key: 'bank', label: 'Bank account' }]} />
          <Input label={kind === 'card' ? 'Card number' : 'IBAN'} icon={kind === 'card' ? 'card-outline' : 'business-outline'} placeholder={kind === 'card' ? '4242 4242 4242 4242' : 'NL91 ABNA 0417 1643 00'} value={number} onChangeText={setNumber} keyboardType={kind === 'card' ? 'number-pad' : 'default'} autoCapitalize="characters" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="lock-closed" size={14} color={color.textTertiary} />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
