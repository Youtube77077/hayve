import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { requests } from '../../../backend/api';
import { Appear, Bump, Button, Card, color, ConfirmSheet, ErrorState, Group, Header, Icon, KeyValue, ListRow, ProgressBar, Screen, Section, SimBadge, SimQR, SuccessMark, T } from '../../../design';
import { StatusPill } from '../../../features/common';
import { ShareRow } from '../../../features/payments';
import { money, shortDate } from '../../../lib/format';
import { useAction, useLive } from '../../../lib/hooks';
import { requestLink } from '../../../lib/links';

const KIND_LABEL = { personal: 'Payment request', split: 'Split bill', business: 'Business request', deposit: 'Authorised deposit' } as const;

/** One request link: share it, see who paid, and manage it. */
export default function RequestDetail() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const { data: r, error } = useLive(() => requests.get(id), [id]);
  const [qr, setQr] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { run, busy } = useAction();
  if (error || !r) return <Screen header={<Header back title="Request" fallback="/pay/requests" />}>{error && <ErrorState message={error.message} />}</Screen>;

  const url = requestLink(r.id);
  const open = r.status === 'pending';
  const message = r.kind === 'split' ? `Your share of ${r.title} is ${money(r.amountCents)}. Pay with Hayve:` : r.kind === 'deposit' ? `Deposit for ${r.title}: ${money(r.amountCents)}. Authorise it here:` : `${r.title}: ${money(r.amountCents)}. Pay me with Hayve:`;
  const progress = r.expectedCount ? r.paidCount / r.expectedCount : 0;

  return (
    <Screen header={<Header back title={KIND_LABEL[r.kind]} fallback="/pay/requests" right={<SimBadge />} />} maxWidth={560}>
      {isNew && open && (
        <Appear style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <SuccessMark size={56} />
          <T variant="title3">Your link is ready</T>
          <T variant="footnote" color={color.textSecondary} center>
            Share it with anyone. They don't need Hayve to pay.
          </T>
        </Appear>
      )}

      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 22 }}>
        <StatusPill status={r.status} />
        <T style={{ fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -1, color: color.ink }}>{money(r.amountCents)}</T>
        <T variant="headline" center>
          {r.title}
        </T>
        <T variant="footnote" color={color.textSecondary} center>
          {r.kind === 'split' && r.split ? (r.split.people ? `Each person pays · ${money(r.split.totalCents ?? 0)} split between ${r.split.people} people` : 'Each person pays · open to anyone with the link') : r.reusable ? 'Reusable link' : 'Single-use link'}
          {r.business ? ` · Invoice ${r.business.invoiceNumber}` : ''}
        </T>
        {r.ref && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Icon name="link-outline" size={14} color={color.grey500} />
            <T variant="caption" color={color.grey500}>
              {r.ref.label}
            </T>
          </View>
        )}
        {r.expectedCount !== null && (
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 12 }}>
            <ProgressBar value={progress} />
            <Bump value={r.paidCount} style={{ alignSelf: 'center' }}>
              <T variant="footnote" color={color.textSecondary} center>
                {r.paidCount} of {r.expectedCount} paid
              </T>
            </Bump>
          </View>
        )}
        {r.expectedCount === null && r.split && (
          <Bump value={r.paidCount} style={{ alignSelf: 'center', marginTop: 12 }}>
            <T variant="headline" center>
              {r.paidCount} {r.paidCount === 1 ? 'person has' : 'people have'} paid · {money(r.collectedCents)}
            </T>
          </Bump>
        )}
        <T variant="caption" color={color.grey500} center style={{ marginTop: 8 }}>
          Only you can see who paid.
        </T>
      </Card>

      {open && (
        <Section title="Share">
          <Card style={{ gap: 14 }}>
            <ShareRow url={url} message={message} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: color.grey100 }}>
              <Icon name="link-outline" size={16} color={color.grey500} />
              <T variant="footnote" numberOfLines={1} style={{ flex: 1 }} selectable>
                {url}
              </T>
            </View>
            <Button title={qr ? 'Hide QR code' : 'Show QR code'} icon="qr-code-outline" variant="secondary" full onPress={() => setQr((v) => !v)} />
            {qr && (
              <Appear style={{ alignItems: 'center', gap: 8 }}>
                <SimQR value={url} size={200} />
                <T variant="footnote" color={color.textSecondary}>
                  Scan with any phone camera to pay
                </T>
              </Appear>
            )}
          </Card>
        </Section>
      )}

      {r.split && open && (
        <Button title="Someone paid me in cash" icon="cash-outline" variant="ghost" style={{ alignSelf: 'center', marginTop: 8 }} onPress={() => run(() => requests.markCashPaid(r.id), { success: 'Counted as paid' })} />
      )}

      <Section title={r.kind === 'deposit' ? 'Deposit' : 'Payments'}>
        {r.payments.length === 0 ? (
          <Card>
            <T color={color.textSecondary}>No payments yet. You'll get a notification the moment someone pays.</T>
          </Card>
        ) : (
          <Group>
            {r.payments.map((p, i) => (
              <Appear key={p.id} index={i}>
              <ListRow
                icon={p.method === 'card' ? 'card-outline' : 'wallet-outline'}
                title={p.payerName}
                subtitle={`${p.methodLabel} · ${shortDate(p.at)}${p.feeCents ? ` · Fees ${money(p.feeCents)}` : ''}${p.payerId ? '' : ' · no Hayve account'}`}
                chevron={false}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <T variant="headline">{money(p.amountCents - p.feeCents)}</T>
                    {p.status === 'held' ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Button title="Release" size="sm" variant="outline" onPress={() => run(() => requests.releaseDeposit(r.id, p.id), { success: 'Deposit released to the guest' })} />
                        <Button title="Claim" size="sm" onPress={() => run(() => requests.captureDeposit(r.id, p.id), { success: 'Deposit claimed' })} />
                      </View>
                    ) : p.status === 'paid' ? (
                      <Button title="Refund" size="sm" variant="ghost" onPress={() => run(() => requests.refund(r.id, p.id), { success: `Refunded ${p.payerName}` })} />
                    ) : (
                      <StatusPill status={p.status} />
                    )}
                  </View>
                }
              />
              </Appear>
            ))}
          </Group>
        )}
      </Section>

      <Section title="Details">
        <Card>
          <KeyValue label="Received" value={money(r.collectedCents)} strong />
          {r.heldCents > 0 && <KeyValue label="Held (deposit)" value={money(r.heldCents)} />}
          {r.feesCents > 0 && <KeyValue label="Fees" value={money(r.feesCents)} />}
          <KeyValue label="Created" value={shortDate(r.createdAt)} />
          <KeyValue label={r.status === 'expired' ? 'Expired' : 'Expires'} value={shortDate(r.expiresAt)} />
        </Card>
      </Section>

      {open && <Button title="Cancel request" variant="ghost" full style={{ marginTop: 12 }} onPress={() => setConfirmCancel(true)} />}
      <Button title="New request" icon="add" variant="secondary" full style={{ marginTop: 8 }} onPress={() => router.push('/pay/request')} />

      <ConfirmSheet visible={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this request?" body="The link stops working. Payments already made stay with you." confirm="Cancel request" destructive loading={busy} onConfirm={() => run(() => requests.cancel(r.id), { success: 'Request cancelled', onDone: () => setConfirmCancel(false) })} />
    </Screen>
  );
}
