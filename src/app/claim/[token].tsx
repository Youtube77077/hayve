import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { tap } from '../../backend/api';
import { Button, Card, color, Emoji, ErrorState, Header, HayveLogo, KeyValue, Screen, SuccessMark, T } from '../../design';
import { dateTime, money } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';

/** The QR on a Tap to Pay receipt: "Have Hayve? Scan to get your Wave Back". */
export default function ClaimWaveBack() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const sessionId = useSessionId();
  const { data: r, error } = useLive(() => tap.receipt(token), [token, sessionId]);
  const [claimed, setClaimed] = useState<number | null>(null);
  const { run, busy } = useAction();
  if (error || !r) return <Screen header={<Header back title="Receipt" fallback="/" />}>{error && <ErrorState message={error.message} />}</Screen>;
  return (
    <Screen header={<Header back title="Receipt" fallback="/" />} maxWidth={480}>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <HayveLogo height={28} />
      </View>
      {claimed != null ? (
        <View style={{ alignItems: 'center', gap: 8, marginTop: 32 }}>
          <SuccessMark size={80} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <T variant="title2">{money(claimed)} Wave Back added</T>
            <Emoji char="🎉" size={22} />
          </View>
          <Button title="Open Hayve Pay" size="lg" full style={{ marginTop: 16 }} onPress={() => router.replace('/pay')} />
        </View>
      ) : (
        <>
          <Card style={{ marginTop: 24 }}>
            <KeyValue label="Paid to" value={r.receiver} />
            <KeyValue label="Amount" value={money(r.amountCents)} strong />
            {r.note ? <KeyValue label="Note" value={r.note} /> : null}
            <KeyValue label="Paid with" value={r.method} />
            <KeyValue label="Time" value={dateTime(r.paidAt)} />
          </Card>
          {r.refunded ? (
            <T color={color.textSecondary} center style={{ marginTop: 24 }}>This payment was refunded.</T>
          ) : r.claimable ? (
            <View style={{ marginTop: 24, gap: 12 }}>
              <T variant="title3" center>Get {money(r.waveBackPreviewCents)} Wave Back</T>
              <T color={color.textSecondary} center>Paid with a card or phone wallet? Claim your Wave Back before {dateTime(r.claimUntil)}.</T>
              {sessionId ? (
                <Button title="Claim Wave Back" size="lg" full loading={busy} onPress={() => run(() => tap.claimWaveBack(token), { onDone: (c) => setClaimed(c) })} />
              ) : (
                <Button title="Sign in to claim" size="lg" full onPress={() => router.push('/sign-in')} />
              )}
            </View>
          ) : (
            <T color={color.textSecondary} center style={{ marginTop: 24 }}>{r.claimed ? 'Wave Back for this payment has been claimed.' : 'Wave Back is no longer available for this receipt.'}</T>
          )}
        </>
      )}
    </Screen>
  );
}
