import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { holidays, type PayMethod } from '../../backend/api';
import { Button, Card, Chip, color, ErrorState, Gallery, Header, HScroll, Icon, KeyValue, prettyDate, Rating, Screen, Section, Sheet, Stepper, T } from '../../design';
import { PayMethodPicker } from '../../features/common';
import { usePersonalisation } from '../../features/onboarding/store';
import { celebrate } from '../../features/celebrate';
import { money } from '../../lib/format';
import { useAction, useLive } from '../../lib/hooks';

export default function HolidayDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const res = useLive(() => holidays.getHoliday(id), [id]);
  const h = res.data;
  const prefs = usePersonalisation();
  const [departure, setDeparture] = useState<string | null>(null);
  const [travellers, setTravellers] = useState(prefs.travellers ?? 2);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PayMethod>('card');
  const { run, busy } = useAction();

  // The first available date is pre-selected (the recommended option).
  useEffect(() => {
    if (h && !departure) setDeparture(h.departures[0] ?? null);
  }, [h, departure]);

  if (res.error || !h) return <Screen header={<Header back fallback="/holidays" />}><ErrorState message={res.error?.message ?? 'This trip is no longer available.'} onRetry={() => router.replace('/holidays')} /></Screen>;
  const q = departure ? holidays.quoteHoliday(h.id, departure, travellers) : null;

  return (
    <Screen
      header={<Header back fallback="/holidays" />}
      footer={
        <Button title={q ? `Book for ${money(q.totalCents)}` : 'Pick a date'} size="lg" full disabled={!q} onPress={() => setPayOpen(true)} />
      }
    >
      <Gallery images={h.images} aspect={1.5} rounded={16} icon="airplane-outline" label={h.city} />
      <View style={{ marginTop: 16, gap: 4 }}>
        <T variant="title1">{h.title}</T>
        <T color={color.textSecondary}>
          {h.hotel} · {h.city}, {h.country}
        </T>
        <Rating value={h.rating} count={h.reviewCount} size={14} />
        <T variant="footnote" color={color.textSecondary} style={{ marginTop: 4 }}>
          Sold by {h.partnerName}, a Hayve travel partner
        </T>
      </View>

      <Section title="What's included" style={{ marginTop: 24 }}>
        <Card style={{ gap: 10 }}>
          {[`${h.nights} nights · ${h.boardLabel}`, ...h.includes].map((x) => (
            <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="checkmark" size={18} />
              <T>{x}</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Why people love it">
        <View style={{ gap: 6 }}>
          {h.highlights.map((x) => (
            <T key={x} color={color.textSecondary}>
              · {x}
            </T>
          ))}
        </View>
      </Section>

      <Section title="When">
        {h.departures.length === 0 ? (
          <T color={color.textSecondary}>No departures left for now. Check back soon.</T>
        ) : (
          <HScroll gap={8}>
            {h.departures.map((d) => (
              <Chip key={d} label={prettyDate(d)} selected={departure === d} onPress={() => setDeparture(d)} />
            ))}
          </HScroll>
        )}
        <View style={{ marginTop: 16 }}>
          <Stepper label="Travellers" sub="Adults and children over 2" value={travellers} onChange={setTravellers} min={1} max={9} />
        </View>
      </Section>

      {q && (
        <Card style={{ gap: 4, marginTop: 8 }}>
          <KeyValue label={`${travellers} × ${money(q.perPersonCents)}`} value={money(q.baseCents)} />
          <KeyValue label="Fees" value={money(q.feesCents)} />
          <KeyValue label="Total" value={money(q.totalCents)} strong />
          <T variant="footnote" color={color.textSecondary} style={{ marginTop: 6 }}>
            Back home on {prettyDate(q.returnDate)}. Free changes up to 14 days before you fly.
          </T>
        </Card>
      )}

      <Sheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pay for your trip"
        footer={
          <Button
            title={busy ? 'Processing payment…' : q ? `Pay ${money(q.totalCents)}` : 'Pay'}
            size="lg"
            full
            loading={busy}
            disabled={!q || busy}
            onPress={() =>
              run(() => holidays.bookHoliday({ packageId: h.id, departure: departure!, travellers, method }), {
                onDone: (tripId) => {
                  setPayOpen(false);
                  celebrate({ title: `You're going to ${h.city}!`, body: 'Your trip is booked. Everything is in one place in Hayve.' });
                  router.replace(`/holidays/trip/${tripId}`);
                },
              })
            }
          />
        }
      >
        {q && <PayMethodPicker value={method} onChange={setMethod} totalCents={q.totalCents} />}
      </Sheet>
    </Screen>
  );
}
