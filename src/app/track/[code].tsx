import { useLocalSearchParams } from 'expo-router';
import { shop } from '../../backend/api';
import { Card, color, ErrorState, Header, Screen, T, Timeline } from '../../design';
import { dateTime } from '../../lib/format';
import { useLive } from '../../lib/hooks';

const STEPS = [
  { key: 'label_created', label: 'Label created' },
  { key: 'in_transit', label: 'With Hayve Send' },
  { key: 'delivered', label: 'Delivered' },
];

/** Public Hayve Send tracking: status only, never names or addresses. */
export default function PublicTracking() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data, error } = useLive(() => shop.trackShipment(code), [code]);
  const done = data ? STEPS.filter((s) => data.events.some((e) => e.status === s.key)).length : 0;
  return (
    <Screen header={<Header back title="Track a parcel" fallback="/" />} maxWidth={520}>
      {error ? (
        <ErrorState message={error.message} />
      ) : data ? (
        <Card style={{ gap: 12 }}>
          <T variant="overline" color={color.grey500}>
            {data.carrier}
          </T>
          <T variant="title2">{data.trackingCode}</T>
          <Timeline steps={STEPS.map((s) => ({ ...s, sub: data.events.find((e) => e.status === s.key) ? dateTime(data.events.find((e) => e.status === s.key)!.at) : undefined }))} current={data.delivered ? STEPS.length : done} />
          <T variant="footnote" color={color.grey500}>
            For privacy, public tracking shows the status only.
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}
