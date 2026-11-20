import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { tap } from '../../../backend/api';
import { Button, Card, color, ConfirmSheet, ErrorState, Header, KeyValue, Screen, SimBadge, SimQR, T } from '../../../design';
import { StatusPill } from '../../../features/common';
import { dateTime, money, shortDate } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';

/** A received Tap to Pay payment: details, receipt and refund (within 30 days). */
export default function TapPaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error } = useLive(() => tap.getTap(id), [id]);
  const [confirm, setConfirm] = useState(false);
  const { run, busy } = useAction();
  if (error || !t) return <Screen header={<Header back title="Payment" fallback="/pay" />}>{error && <ErrorState message={error.message} />}</Screen>;
  const status = t.status === 'available' ? 'completed' : t.status;
  return (
    <Screen header={<Header back title="Tap to Pay" fallback="/pay" right={<SimBadge />} />} maxWidth={560}>
      <View style={{ alignItems: 'center', marginTop: 16, gap: 8 }}>
        <T weight="800" style={{ fontSize: 40, lineHeight: 48 }}>{money(t.amountCents)}</T>
        <StatusPill status={status} />
        {t.note ? <T color={color.textSecondary}>{t.note}</T> : null}
      </View>
      <Card style={{ marginTop: 24 }}>
        <KeyValue label="Paid by" value={`${t.cardBrand ?? ''}${t.last4 ? ` •••• ${t.last4}` : ''}`} />
        <KeyValue label="Time" value={dateTime(t.paidAt ?? t.createdAt)} />
        <KeyValue label="Fees" value={money(t.feeCents)} />
        <KeyValue label={t.status === 'pending' ? 'You get (pending)' : 'You got'} value={money(t.netCents)} strong />
        <KeyValue label="Reference" value={t.providerRef} />
      </Card>
      {t.waveBackClaimable && t.status !== 'refunded' && (
        <View style={{ alignItems: 'center', marginTop: 24, gap: 8 }}>
          <SimQR value={t.receiptUrl} size={140} />
          <T variant="subhead" weight="700" center>Have Hayve? Scan to get your Wave Back</T>
          <T variant="caption" color={color.textSecondary}>Until {dateTime(t.claimUntil)}</T>
        </View>
      )}
      {t.canRefund ? (
        <>
          <Button title="Refund to the payer" variant="outline" full style={{ marginTop: 24 }} onPress={() => setConfirm(true)} />
          <T variant="caption" color={color.textSecondary} center style={{ marginTop: 8 }}>Refunds go back to the original card. Possible until {shortDate(t.refundUntil)}.</T>
        </>
      ) : t.status === 'refunded' ? (
        <T color={color.textSecondary} center style={{ marginTop: 24 }}>Refunded {t.refundedAt ? dateTime(t.refundedAt) : ''}</T>
      ) : null}
      <ConfirmSheet visible={confirm} title={`Refund ${money(t.amountCents)}?`} body="The full amount goes back to the payer's card. This can't be undone." confirm="Refund" destructive loading={busy} onClose={() => setConfirm(false)} onConfirm={() => run(() => tap.refund(t.id), { success: 'Refunded', onDone: () => setConfirm(false) })} />
    </Screen>
  );
}
