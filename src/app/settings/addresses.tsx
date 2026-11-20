import { useState } from 'react';
import { View } from 'react-native';
import { social } from '../../backend/api';
import type { Address } from '../../backend/types';
import { Badge, Button, color, EmptyState, Group, Header, IconButton, Input, ListRow, Screen, Sheet, SwitchRow } from '../../design';
import { useAction, useLive } from '../../lib/hooks';
import { useRegion } from '../../features/payments';

type Draft = Omit<Address, 'id' | 'userId' | 'isDefault'> & { id?: string; isDefault: boolean };
const EMPTY: Draft = { label: 'Home', fullName: '', line1: '', city: '', postcode: '', country: '', isDefault: false };

export default function Addresses() {
  const list = useLive(() => social.addresses()).data ?? [];
  const reg = useRegion();
  const fresh = (): Draft => ({ ...EMPTY, country: reg.name });
  const [draft, setDraft] = useState<Draft | null>(null);
  const { run, busy } = useAction();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Screen header={<Header back title="Addresses" fallback="/profile" right={<Button title="Add" icon="add" size="sm" onPress={() => setDraft(fresh())} />} />} maxWidth={640}>
      {list.length === 0 ? (
        <EmptyState icon="location-outline" title="No addresses yet" body="Add a delivery address for orders and gifts sent to you." action="Add address" onAction={() => setDraft(fresh())} />
      ) : (
        <Group>
          {list.map((a) => (
            <ListRow
              key={a.id}
              icon="location-outline"
              title={a.label}
              subtitle={`${a.fullName}\n${a.line1}, ${a.postcode} ${a.city}`}
              onPress={() => setDraft({ ...a })}
              right={
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {a.isDefault && <Badge label="Default" tone="lime" />}
                  <IconButton icon="trash-outline" tone="clear" iconColor={color.danger} label="Delete address" onPress={() => run(() => social.deleteAddress(a.id), { success: 'Address deleted' })} />
                </View>
              }
            />
          ))}
        </Group>
      )}
      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit address' : 'New address'} footer={<Button title="Save address" size="lg" full loading={busy} onPress={() => run(() => social.saveAddress(draft!), { success: 'Address saved', onDone: () => setDraft(null) })} />}>
        {draft && (
          <View style={{ gap: 12 }}>
            <Input label="Label" placeholder="Home, Work…" value={draft.label} onChangeText={(label) => set({ label })} />
            <Input label="Full name" value={draft.fullName} onChangeText={(fullName) => set({ fullName })} autoComplete="name" />
            <Input label="Street and number" value={draft.line1} onChangeText={(line1) => set({ line1 })} autoComplete="street-address" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Input containerStyle={{ flex: 1 }} label="Postcode" value={draft.postcode} onChangeText={(postcode) => set({ postcode })} autoComplete="postal-code" />
              <Input containerStyle={{ flex: 1.4 }} label="City" value={draft.city} onChangeText={(city) => set({ city })} />
            </View>
            <Input label="Country" value={draft.country} onChangeText={(country) => set({ country })} />
            <SwitchRow title="Default address" subtitle="Used for checkout and for gifts sent to you" value={draft.isDefault} onChange={(isDefault) => set({ isDefault })} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
