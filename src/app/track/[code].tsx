import { useLocalSearchParams } from 'expo-router';
import { send } from '../../backend/api';
import { Card, color, ErrorState, Header, Screen, T, Timeline } from '../../design';
import { StatusPill } from '../../features/common';
import { useLive } from '../../lib/hooks';
import { DELIVERY_STEPS } from '../send/[id]';

/** Public parcel tracking by code (shows status only, never names or addresses). */
export default function PublicTracking() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data, error } = useLive(() => send.trackByCode(code), [code]);
  return (
    <Screen header={<Header back title="Track parcel" fallback="/send" />} maxWidth={520}>
      {error ? (
        <ErrorState message={error.message} />
      ) : data ? (
        <Card style={{ gap: 12 }}>
          <T variant="title2">{data.trackingCode}</T>
          <StatusPill status={data.status} />
          <Timeline steps={DELIVERY_STEPS} current={data.status === 'delivered' ? DELIVERY_STEPS.length : DELIVERY_STEPS.findIndex((s) => s.key === data.status) + 1} />
          <T variant="footnote" color={color.textTertiary}>
            For privacy, public tracking shows the status only.
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}
