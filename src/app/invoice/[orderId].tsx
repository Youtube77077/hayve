import { useLocalSearchParams } from 'expo-router';
import { Share, View } from 'react-native';
import { shop } from '../../backend/api';
import { Button, Card, color, Divider, ErrorState, Header, HayveLogo, KeyValue, Screen, T } from '../../design';
import { shortDate, money } from '../../lib/format';
import { useLive } from '../../lib/hooks';

/** VAT invoice issued by a verified Hayve Store business. */
export default function InvoiceScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: inv, error } = useLive(() => shop.invoice(orderId), [orderId]);
  if (error || !inv) return <Screen header={<Header back title="Invoice" fallback={`/orders/${orderId}`} />}>{error && <ErrorState message={error.message} />}</Screen>;
  return (
    <Screen header={<Header back title="Invoice" subtitle={inv.number} fallback={`/orders/${orderId}`} />} maxWidth={640}>
      <Card style={{ gap: 16, padding: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2 }}>
            <T variant="title3">{inv.seller.name}</T>
            <T variant="footnote" color={color.grey500}>
              {inv.seller.legalName}
            </T>
            <T variant="footnote" color={color.grey500}>
              {inv.seller.address}
            </T>
            <T variant="footnote" color={color.grey500}>
              {inv.seller.idLabel} {inv.seller.kvk}{inv.seller.vat ? ` · ${inv.seller.taxLabel} ${inv.seller.vat}` : ''}
            </T>
          </View>
          <HayveLogo height={18} />
        </View>
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <T variant="caption" color={color.grey500}>
              Invoice number
            </T>
            <T variant="subhead" weight="700">
              {inv.number}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="caption" color={color.grey500}>
              Date
            </T>
            <T variant="subhead" weight="700">
              {shortDate(inv.issuedAt)}
            </T>
          </View>
        </View>
        <View>
          <T variant="caption" color={color.grey500}>
            Bill to
          </T>
          <T variant="subhead" weight="700">
            {inv.billTo}
          </T>
        </View>
        <Divider />
        {inv.lines.map((l, i) => (
          <View key={i} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T variant="subhead" weight="600" style={{ flex: 1 }}>
                {l.description}
              </T>
              <T variant="subhead" weight="700">
                {money(l.grossCents)}
              </T>
            </View>
            <T variant="caption" color={color.grey500}>
              {money(l.netCents)} excl. {inv.seller.taxLabel} + {money(l.vatCents)} {inv.seller.taxLabel}
            </T>
          </View>
        ))}
        <Divider />
        <KeyValue label="Subtotal excl. VAT" value={money(inv.netCents)} />
        <KeyValue label={inv.vatRateLabel} value={money(inv.vatCents)} />
        <KeyValue label="Total incl. VAT" value={money(inv.grossCents)} strong />
      </Card>
      <Button title="Share invoice" variant="outline" icon="share-outline" style={{ marginTop: 16, alignSelf: 'flex-start' }} onPress={() => void Share.share({ message: `${inv.seller.name} invoice ${inv.number}: ${money(inv.grossCents)} incl. VAT` })} />
    </Screen>
  );
}
