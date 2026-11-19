import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { wallet, type PublicUser } from '../../backend/api';
import { publicUser } from '../../backend/api/common';
import { Button, Card, color, Header, Input, KeyValue, parseEuro, Screen, Section, T } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput, PersonPicker } from '../../features/pay';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function SendMoney() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  const [person, setPerson] = useState<PublicUser | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const w = useLive(() => wallet.wallet()).data;
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;

  useEffect(() => {
    if (to) {
      try {
        setPerson(publicUser(to));
      } catch {}
    }
  }, [to]);

  if (done && person) {
    return (
      <Screen header={<Header title="Sent" />} maxWidth={520}>
        <View style={{ alignItems: 'center', gap: 12, marginTop: 32 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: color.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="paper-plane" size={38} color={color.ink} />
          </View>
          <T variant="title2" center>
            {money(cents)} sent to {person.displayName.split(' ')[0]}
          </T>
          <T color={color.textSecondary} center>
            It's already in their Hayve Pay balance.
          </T>
          <Button title="View receipt" variant="outline" full onPress={() => router.replace(`/pay/tx/${done}`)} />
          <Button title="Done" size="lg" full onPress={() => router.replace('/pay')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={<Header back title="Send money" fallback="/pay" />} maxWidth={560} keyboard footer={<Button title={cents ? `Send ${money(cents)}` : 'Send'} size="lg" full loading={busy} disabled={!person || cents < 100} onPress={() => run(() => wallet.sendMoney(person!.id, cents, note), { onDone: setDone })} />}>
      <Section title="To" style={{ marginTop: 4 }}>
        <PersonPicker selected={person} onSelect={setPerson} />
      </Section>
      {person && (
        <>
          <AmountInput value={amount} onChange={setAmount} />
          <Input icon="chatbubble-outline" placeholder="What's it for? (optional)" value={note} onChangeText={setNote} maxLength={140} />
          <Card style={{ marginTop: 14 }}>
            <KeyValue label="From" value="Hayve Pay balance" />
            <KeyValue label="Available" value={money(w?.available ?? 0)} tone={cents > (w?.available ?? 0) ? color.danger : undefined} />
            <KeyValue label="Fee" value="Free" />
          </Card>
          <View style={{ marginTop: 12 }}>
            <SimNote text="Person-to-person transfers move simulated money between Hayve wallets." />
          </View>
        </>
      )}
    </Screen>
  );
}
