import { Icon } from '../../design/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { business, type PayMethod } from '../../backend/api';
import { Button, Card, color, ErrorState, HayveLogo, Header, Notice, Screen, T } from '../../design';
import { PayMethodPicker } from '../../features/common';
import { money } from '../../lib/format';
import { useAction, useLive, useSessionId } from '../../lib/hooks';

/** Public Hayve Pay checkout for payment links and QR codes. */
export default function PayLinkCheckout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = useSessionId();
  const { data: c, error } = useLive(() => business.getCheckout(id), [id]);
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [paid, setPaid] = useState<string | null>(null);
  const { run, busy } = useAction();
  if (error || !c) return <Screen header={<Header back title="Checkout" fallback="/" />}>{error && <ErrorState message={error.message} />}</Screen>;

  return (
    <Screen header={<Header back fallback="/" />} maxWidth={480}>
      <View style={{ alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <HayveLogo height={26} />
        <T variant="footnote" color={color.textSecondary}>
          Secure checkout
        </T>
      </View>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
        <T variant="callout" color={color.textSecondary}>
          {c.merchant}
          {c.verified ? ' ✓' : ''}
        </T>
        <T style={{ fontSize: 44, lineHeight: 44 + 8, fontWeight: '800', letterSpacing: -1, color: color.ink }}>{money(c.amountCents)}</T>
        <T variant="headline">{c.title}</T>
      </Card>
      {paid ? (
        <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkmark" size={36} color={color.indigo} />
          </View>
          <T variant="title2">Paid</T>
          <Button title="View receipt" variant="outline" full onPress={() => router.replace(`/pay/tx/${paid}`)} />
        </View>
      ) : !c.active ? (
        <View style={{ marginTop: 16 }}>
          <Notice tone="warning" title="This payment link is no longer active" />
        </View>
      ) : c.isOwner ? (
        <View style={{ marginTop: 16 }}>
          <Notice title="This is your payment link" body="Share it with customers. You can't pay your own business." />
        </View>
      ) : !sessionId ? (
        <View style={{ gap: 10, marginTop: 20 }}>
          <Button title="Sign in to pay with Hayve" size="lg" full onPress={() => router.push('/sign-in')} />
          <Button title="Create a Hayve account" variant="ghost" full onPress={() => router.push('/sign-up')} />
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 20 }}>
          <PayMethodPicker value={method} onChange={setMethod} totalCents={c.amountCents} />
          <Button title={`Pay ${money(c.amountCents)}`} size="lg" full loading={busy} onPress={() => run(() => business.payCheckout(c.id, method), { success: `Paid ${c.merchant}`, onDone: setPaid })} />
        </View>
      )}
    </Screen>
  );
}
