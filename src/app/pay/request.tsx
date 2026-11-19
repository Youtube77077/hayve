import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { social, wallet, type PublicUser } from '../../backend/api';
import { Button, Card, color, Header, Input, parseEuro, Screen, Section, Segmented, SimQR, T } from '../../design';
import { SimNote } from '../../features/common';
import { AmountInput, PersonPicker } from '../../features/pay';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function RequestMoney() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'request' | 'qr'>(params.mode === 'qr' ? 'qr' : 'request');
  const [person, setPerson] = useState<PublicUser | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const me = useLive(() => social.myProfile().profile).data;
  const { run, busy } = useAction();
  const cents = parseEuro(amount) ?? 0;

  return (
    <Screen
      header={<Header back title="Receive money" fallback="/pay" />}
      maxWidth={560}
      keyboard
      footer={mode === 'request' ? <Button title={cents ? `Request ${money(cents)}` : 'Request'} size="lg" full loading={busy} disabled={!person || cents < 100} onPress={() => run(() => wallet.requestMoney(person!.id, cents, note), { success: `Request sent to ${person!.displayName}`, onDone: () => router.replace('/pay/requests') })} /> : undefined}
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { key: 'request', label: 'Request', icon: 'hand-left-outline' },
          { key: 'qr', label: 'My QR code', icon: 'qr-code-outline' },
        ]}
      />
      {mode === 'request' ? (
        <>
          <Section title="From">
            <PersonPicker selected={person} onSelect={setPerson} />
          </Section>
          {person && (
            <>
              <AmountInput value={amount} onChange={setAmount} />
              <Input icon="chatbubble-outline" placeholder="What's it for?" value={note} onChangeText={setNote} maxLength={140} />
            </>
          )}
        </>
      ) : (
        <View style={{ alignItems: 'center', marginTop: 24, gap: 14 }}>
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24, alignSelf: 'stretch' }}>
            <SimQR value={`hayve:pay:${me?.username}`} size={200} />
            <T variant="title3">@{me?.username}</T>
            <T variant="footnote" color={color.textSecondary} center>
              Friends can scan this with Hayve to pay you.
            </T>
          </Card>
          <Button title="Share payment link" icon="share-outline" variant="secondary" full onPress={() => void Share.share({ message: `Pay me on Hayve: https://hayve.app/u/${me?.username}` })} />
          <SimNote text="QR scanning is simulated in this build. The code identifies your Hayve account." />
        </View>
      )}
    </Screen>
  );
}
