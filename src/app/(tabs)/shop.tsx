import { Screen, T } from '../../design';
import { TabHeader } from '../../features/common';

export default function Stub() {
  return (
    <Screen header={<TabHeader service="shop" />}>
      <T>Coming together…</T>
    </Screen>
  );
}
