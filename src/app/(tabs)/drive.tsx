import { Screen, T } from '../../design';
import { TabHeader } from '../../features/common';

export default function Stub() {
  return (
    <Screen header={<TabHeader service="drive" />}>
      <T>Coming together…</T>
    </Screen>
  );
}
