import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type PayMethod, ride, social } from '../../backend/api';
import type { RideCategory } from '../../backend/types';
import { Avatar, Button, color, ConfirmSheet, Emoji, font, Icon, type IconName, IconButton, radius, Rating, shadow, Sheet, SimBadge, Stars, T, tap, useLayout, useToast } from '../../design';
import { PayMethodPicker, WaveBackLine } from '../../features/common';
import { along, directions, driverStart, HayveMap, type HayveMapHandle, type LngLat, type MapCar, type MapMarker, type PlaceResult, reverseGeocode, type RouteResult, searchPlaces, toLngLat } from '../../features/map';
import { ProductWordmark } from '../../features/nav/Wordmarks';
import { BottomSheet } from '../../features/ride/BottomSheet';
import { nearestEta, useNearbyCars, useUserLocation } from '../../features/ride/hooks';
import { money, time } from '../../lib/format';
import { NONE, useAction, useLive } from '../../lib/hooks';

const CAR_ICON: Record<RideCategory, IconName> = { go: 'car-outline', green: 'leaf-outline', priority: 'flash-outline', comfort: 'car-sport-outline', xl: 'bus-outline' };
/** Simulated dispatch timings (ms) per status. */
const STEP_MS = { requested: 4000, accepted: 9000, arriving: 6000, in_progress: 16000 } as const;
const PANEL_W = 400;

type Mode = 'pickup' | 'choose' | 'finding' | 'arriving' | 'trip' | 'done';

export default function Ride() {
  const { isWide } = useLayout();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const places = useLive(() => ride.places()).data ?? NONE;
  const home = places.find((p) => p.id === 'home');
  const user = useUserLocation(home ? toLngLat(home) : [4.933, 52.362]);
  const active = useLive(() => ride.activeRide()).data;
  const history = useLive(() => ride.myRides().filter((r) => r.status === 'completed').slice(0, 3)).data ?? NONE;
  const mapRef = useRef<HayveMapHandle>(null);
  const { run, busy } = useAction();

  /* ----------------------------------------------------------- state -- */
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pin, setPin] = useState<LngLat>(user.coord);
  const [moving, setMoving] = useState(false);
  const [pickup, setPickup] = useState<PlaceResult | null>(null);
  const [dropoff, setDropoff] = useState<PlaceResult | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [search, setSearch] = useState<null | 'pickup' | 'dropoff'>(null);
  const [category, setCategory] = useState<RideCategory>('go');
  const [method, setMethod] = useState<PayMethod>('wallet');
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(1);
  const [sheetH, setSheetH] = useState(320);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [clock, setClock] = useState(Date.now());

  // Follow the real location once it arrives (only before the user picks anything).
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && user.real) {
      setPin(user.coord);
      mapRef.current?.flyTo(user.coord, 15);
    }
  }, [user.real]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------ live pickup -- */
  const geocodeSeq = useRef(0);
  const resolvePickup = useCallback(async (c: LngLat, byUser: boolean) => {
    const seq = ++geocodeSeq.current;
    try {
      const r = await reverseGeocode(c);
      if (seq !== geocodeSeq.current) return;
      setPickup(r);
      // Snap: ease the pin onto the nearest road/address when it is close by.
      if (byUser && r.snapped && (Math.abs(r.lng - c[0]) > 1e-5 || Math.abs(r.lat - c[1]) > 1e-5)) mapRef.current?.flyTo([r.lng, r.lat]);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void resolvePickup(pin, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ route -- */
  useEffect(() => {
    if (!pickup || !dropoff) return setRoute(null);
    const ctrl = new AbortController();
    directions(toLngLat(pickup), toLngLat(dropoff), ctrl.signal)
      .then(setRoute)
      .catch(() => {});
    return () => ctrl.abort();
  }, [pickup?.lng, pickup?.lat, dropoff?.lng, dropoff?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = route ? { km: route.km, minutes: route.minutes } : undefined;
  const optionsQ = useLive(() => (pickup && dropoff && route ? ride.quoteRide(pickup, dropoff, metrics) : []), [pickup?.id, dropoff?.id, route?.km]);
  const options = optionsQ.data ?? NONE;
  const selected = options.find((o) => o.category === category);

  /* ------------------------------------------------------- active ride -- */
  const lastRide = useLive(() => (doneId ? ride.getRide(doneId) : null), [doneId]).data;
  useEffect(() => {
    if (active) setDoneId(active.id);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mode: Mode = active ? (active.status === 'requested' ? 'finding' : active.status === 'in_progress' ? 'trip' : 'arriving') : lastRide && lastRide.status === 'completed' ? 'done' : dropoff && pickup ? 'choose' : 'pickup';

  // Simulated dispatch: advance the trip like a real driver would.
  useEffect(() => {
    if (!active) return;
    const ms = STEP_MS[active.status as keyof typeof STEP_MS] ?? 5000;
    const t = setTimeout(() => {
      try {
        ride.simulateRideStep(active.id);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }, ms);
    return () => clearTimeout(t);
  }, [active?.id, active?.status, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(t);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Routes for the active trip (driver → pickup, pickup → destination).
  const [tripRoute, setTripRoute] = useState<RouteResult | null>(null);
  const [driverRoute, setDriverRoute] = useState<RouteResult | null>(null);
  useEffect(() => {
    if (!active) {
      setTripRoute(null);
      setDriverRoute(null);
      return;
    }
    const ctrl = new AbortController();
    const p = toLngLat(active.pickup);
    directions(p, toLngLat(active.dropoff), ctrl.signal).then(setTripRoute).catch(() => {});
    const seed = active.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    directions(driverStart(p, seed), p, ctrl.signal).then(setDriverRoute).catch(() => {});
    return () => ctrl.abort();
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusAt = active ? active.timeline[active.timeline.length - 1]?.at ?? active.createdAt : 0;
  const elapsed = Math.max(0, clock - statusAt);
  const assigned: MapCar | null = useMemo(() => {
    if (!active) return null;
    if ((active.status === 'accepted' || active.status === 'arriving') && driverRoute) {
      const t = active.status === 'accepted' ? 0.8 * Math.min(1, elapsed / STEP_MS.accepted) : 0.8 + 0.2 * Math.min(1, elapsed / STEP_MS.arriving);
      const a = along(driverRoute.line, t);
      return { id: 'assigned', coord: a.point, heading: a.heading, assigned: true };
    }
    if (active.status === 'in_progress' && tripRoute) {
      const a = along(tripRoute.line, Math.min(1, elapsed / STEP_MS.in_progress));
      return { id: 'assigned', coord: a.point, heading: a.heading, assigned: true };
    }
    return null;
  }, [active, driverRoute, tripRoute, elapsed]);

  const driverEtaMin = active && driverRoute ? Math.max(1, Math.round(driverRoute.minutes * (1 - (active.status === 'accepted' ? 0.8 * Math.min(1, elapsed / STEP_MS.accepted) : 0.9)))) : null;
  const tripLeftMin = active && tripRoute && active.status === 'in_progress' ? Math.max(1, Math.round(tripRoute.minutes * (1 - Math.min(1, elapsed / STEP_MS.in_progress)))) : null;

  /* -------------------------------------------------------------- map -- */
  const carsCenter = mode === 'pickup' ? pin : pickup ? toLngLat(pickup) : pin;
  const nearby = useNearbyCars(mode === 'trip' || mode === 'done' ? null : carsCenter, mode === 'arriving' ? 4 : 7);
  const pinEta = nearestEta(nearby, pin);

  const padding = isWide ? { top: 24, right: 24, bottom: 24, left: PANEL_W + 48 } : { top: insets.top + 64, right: 0, bottom: sheetH, left: 0 };

  let markers: MapMarker[] = [];
  let mapRoute: LngLat[] | null = null;
  let fit: LngLat[] | null = null;
  if (mode === 'choose' && pickup && dropoff) {
    markers = [
      { id: 'pu', coord: route?.start ?? toLngLat(pickup), kind: 'pickup', label: pinEta ? `${pinEta} min` : undefined },
      { id: 'do', coord: route?.end ?? toLngLat(dropoff), kind: 'dropoff', label: route ? time(Date.now() + ((pinEta ?? 4) + route.minutes) * 60_000) : undefined },
    ];
    mapRoute = route?.line ?? null;
    fit = [toLngLat(pickup), toLngLat(dropoff)];
  } else if (active) {
    const p = toLngLat(active.pickup);
    const d = toLngLat(active.dropoff);
    if (mode === 'finding') {
      markers = [{ id: 'pu', coord: p, kind: 'pickup', label: 'Finding driver' }, { id: 'do', coord: d, kind: 'dropoff' }];
      mapRoute = tripRoute?.line ?? null;
      fit = [p, d];
    } else if (mode === 'arriving') {
      markers = [{ id: 'pu', coord: p, kind: 'pickup', label: driverEtaMin ? `${driverEtaMin} min` : 'Pickup' }];
      mapRoute = driverRoute?.line ?? null;
      fit = driverRoute ? [driverRoute.line[0], p] : [p];
    } else if (mode === 'trip') {
      markers = [{ id: 'do', coord: d, kind: 'dropoff', label: tripLeftMin ? `${tripLeftMin} min` : active.dropoff.name }];
      mapRoute = tripRoute?.line ?? null;
      fit = tripRoute ? [p, d] : [d];
    }
  }
  const cars: MapCar[] = [...(mode === 'trip' ? [] : nearby), ...(assigned ? [assigned] : [])];

  /* ---------------------------------------------------------- actions -- */
  const chooseDropoff = (p: PlaceResult) => {
    touched.current = true;
    setDropoff(p);
    setSearch(null);
    setSheetIndex(1);
  };
  const choosePickup = (p: PlaceResult) => {
    touched.current = true;
    setPickup(p);
    setPin(toLngLat(p));
    setSearch(null);
    if (!dropoff) mapRef.current?.flyTo(toLngLat(p), 15);
  };
  const recenter = () => {
    if (mode === 'pickup') mapRef.current?.flyTo(user.coord, 15);
    else if (fit) mapRef.current?.fitTo(fit);
  };
  const request = () => {
    if (!pickup || !dropoff) return;
    run(() => ride.requestRide(pickup, dropoff, category, method, metrics), {
      onDone: (id) => {
        setDoneId(id);
        setStars(0);
      },
    });
  };
  const finish = () => {
    setDoneId(null);
    setDropoff(null);
    setRoute(null);
    setSheetIndex(1);
  };

  /* ------------------------------------------------------------ sheet -- */
  const content = (
    <SheetContent
      mode={search ? 'search' : mode}
      search={search}
      setSearch={setSearch}
      pickup={pickup}
      dropoff={dropoff}
      moving={moving}
      places={places}
      history={history}
      near={pin}
      route={route}
      options={options}
      category={category}
      setCategory={setCategory}
      method={method}
      openPay={() => setPayOpen(true)}
      selected={selected}
      busy={busy}
      request={request}
      clearDropoff={() => setDropoff(null)}
      chooseDropoff={chooseDropoff}
      choosePickup={choosePickup}
      setOnMap={() => {
        setSearch(null);
        setSheetIndex(0);
      }}
      active={active}
      driverEtaMin={driverEtaMin}
      tripLeftMin={tripLeftMin}
      openCancel={() => setCancelOpen(true)}
      lastRide={lastRide ?? null}
      stars={stars}
      setStars={setStars}
      finish={finish}
      rate={() => lastRide && run(() => ride.rateRide(lastRide.id, stars), { success: 'Thanks for rating' })}
      message={() => active?.driver && run(() => social.startThread(active.driver!.id), { onDone: (tid) => router.push(`/messages/${tid}`) })}
    />
  );

  const H = size.h;
  const snaps = search ? [H * 0.9] : mode === 'pickup' ? [200, Math.min(H * 0.5, 420), H * 0.88] : mode === 'choose' ? [220, Math.min(H * 0.62, 560), H * 0.88] : [200, Math.min(H * 0.48, 400)];
  const idx = Math.min(sheetIndex, snaps.length - 1);

  return (
    <View style={{ flex: 1, backgroundColor: color.white }} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <HayveMap
        ref={mapRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        center={pin}
        zoom={15}
        markers={markers}
        cars={cars}
        route={mapRoute}
        fit={fit}
        padding={padding}
        userLocation={user.coord}
        accessibilityLabel="Ride map. Move the map to set your pickup point."
        onMove={(c) => {
          if (mode !== 'pickup') return;
          setMoving(true);
          setPin(c);
        }}
        onIdle={(c, byUser) => {
          setMoving(false);
          if (mode !== 'pickup') return;
          if (byUser) touched.current = true;
          setPin(c);
          void resolvePickup(c, byUser);
        }}
      />

      {mode === 'pickup' && size.h > 0 && <CenterPin x={padding.left + (size.w - padding.left - padding.right) / 2} y={padding.top + (size.h - padding.top - padding.bottom) / 2} eta={moving ? null : pinEta} moving={moving} />}

      {!isWide && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center' }}>
          <View style={[{ backgroundColor: color.white, borderRadius: radius.pill, paddingHorizontal: 16, height: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }, shadow.float]}>
            <T weight="800" style={{ fontSize: 16 }}>Hayve</T>
            <ProductWordmark product="ride" size={16} />
          </View>
        </View>
      )}

      <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: isWide ? 24 : sheetH + 16 }}>
        <IconButton icon="locate-outline" label={mode === 'pickup' ? 'Go to my location' : 'Show the whole route'} onPress={recenter} tone="surface" style={[{ width: 48, height: 48, borderRadius: 24, backgroundColor: color.white }, shadow.float]} />
      </View>

      {size.h > 0 &&
        (isWide ? (
          <View style={[{ position: 'absolute', top: 24, left: 24, bottom: 24, width: PANEL_W, backgroundColor: color.white, borderRadius: radius.lg, overflow: 'hidden' }, shadow.float]}>
            <View style={{ paddingHorizontal: 24, paddingTop: 24, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T weight="800" style={{ fontSize: 24 }}>Hayve</T>
              <ProductWordmark product="ride" size={24} active />
              <View style={{ flex: 1 }} />
              <SimBadge />
            </View>
            {content}
          </View>
        ) : (
          <BottomSheet snaps={snaps} index={idx} onIndexChange={setSheetIndex} onHeight={setSheetH} maxHeight={H}>
            {content}
          </BottomSheet>
        ))}

      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Pay with">
        <PayMethodPicker value={method} onChange={(m) => { setMethod(m); setPayOpen(false); }} totalCents={selected?.priceCents ?? 0} waveBackCents={selected?.waveBackCents ?? 0} />
      </Sheet>
      <ConfirmSheet visible={cancelOpen} title="Cancel this trip?" body="Your reserved fare is released right away. You are not charged." confirm="Cancel trip" destructive loading={busy} onClose={() => setCancelOpen(false)} onConfirm={() => active && run(() => ride.cancelRide(active.id), { success: 'Trip cancelled', onDone: () => { setCancelOpen(false); setDoneId(null); } })} />
    </View>
  );
}

/* ================================================================ Pin == */

function CenterPin({ x, y, eta, moving }: { x: number; y: number; eta: number | null; moving: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - 60, top: y - 74, width: 120, alignItems: 'center' }} accessibilityLabel="Pickup point">
      <View style={{ minWidth: 52, height: 52, borderRadius: 26, backgroundColor: color.black, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, transform: [{ translateY: moving ? -6 : 0 }] }}>
        {eta ? (
          <>
            <T weight="800" color={color.white} style={{ fontSize: 16, lineHeight: 18 }}>{eta}</T>
            <T weight="600" color={color.grey200} style={{ fontSize: 10, lineHeight: 12 }}>MIN</T>
          </>
        ) : (
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color.white }} />
        )}
      </View>
      <View style={{ width: 3, height: 18, backgroundColor: color.black, transform: [{ translateY: moving ? -6 : 0 }] }} />
      <View style={{ width: moving ? 10 : 6, height: 4, borderRadius: 3, backgroundColor: 'rgba(14,14,16,0.25)' }} />
    </View>
  );
}

/* ============================================================== Sheet == */

type Opt = ReturnType<typeof ride.quoteRide>[number];
type RideV = NonNullable<ReturnType<typeof ride.activeRide>>;

function SheetContent(p: {
  mode: Mode | 'search';
  search: null | 'pickup' | 'dropoff';
  setSearch: (s: null | 'pickup' | 'dropoff') => void;
  pickup: PlaceResult | null;
  dropoff: PlaceResult | null;
  moving: boolean;
  places: readonly PlaceResult[];
  history: readonly RideV[];
  near: LngLat;
  route: RouteResult | null;
  options: readonly Opt[];
  category: RideCategory;
  setCategory: (c: RideCategory) => void;
  method: PayMethod;
  openPay: () => void;
  selected?: Opt;
  busy: boolean;
  request: () => void;
  clearDropoff: () => void;
  chooseDropoff: (p: PlaceResult) => void;
  choosePickup: (p: PlaceResult) => void;
  setOnMap: () => void;
  active: RideV | null | undefined;
  driverEtaMin: number | null;
  tripLeftMin: number | null;
  openCancel: () => void;
  lastRide: RideV | null;
  stars: number;
  setStars: (n: number) => void;
  finish: () => void;
  rate: () => void;
  message: () => void;
}) {
  const pad = { paddingHorizontal: 24, paddingBottom: 32 };

  if (p.mode === 'search') return <SearchPanel which={p.search!} near={p.near} places={p.places} onPick={p.search === 'pickup' ? p.choosePickup : p.chooseDropoff} onClose={() => p.setSearch(null)} onSetOnMap={p.search === 'pickup' ? p.setOnMap : undefined} />;

  if (p.mode === 'pickup') {
    const saved = p.places.filter((x) => ['home', 'work', 'centraal', 'schiphol'].includes(x.id));
    return (
      <ScrollView contentContainerStyle={[pad, { paddingTop: 12, gap: 16 }]} keyboardShouldPersistTaps="handled">
        <T variant="title2">Where to?</T>
        <Pressable onPress={() => p.setSearch('dropoff')} accessibilityRole="search" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: radius.md, backgroundColor: color.grey100, paddingHorizontal: 16, borderWidth: 1, borderColor: pressed ? color.black : color.grey100 })}>
          <Icon name="search" size={20} />
          <T variant="headline" color={color.textSecondary}>Search destination</T>
        </Pressable>
        <Pressable onPress={() => p.setSearch('pickup')} accessibilityRole="button" accessibilityLabel="Change pickup" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color.black }} />
          <View style={{ flex: 1 }}>
            <T variant="caption" color={color.textSecondary}>Pickup</T>
            <T variant="headline" numberOfLines={1}>{p.moving ? 'Moving pin…' : p.pickup?.name ?? 'Locating…'}</T>
          </View>
          <T variant="subhead" weight="700" color={color.indigo}>Edit</T>
        </Pressable>
        <View style={{ height: 1, backgroundColor: color.grey200 }} />
        {saved.map((x) => (
          <PlaceRow key={x.id} icon={x.id === 'home' ? 'home-outline' : x.id === 'work' ? 'briefcase-outline' : x.id === 'schiphol' ? 'airplane-outline' : 'location-outline'} title={x.name} sub={x.address} onPress={() => p.chooseDropoff(x)} />
        ))}
        {p.history.length > 0 && (
          <>
            <T variant="overline" color={color.textSecondary} style={{ marginTop: 8 }}>Recent</T>
            {p.history.map((r) => (
              <PlaceRow key={r.id} icon="time-outline" title={r.dropoff.name} sub={r.dropoff.address} onPress={() => p.chooseDropoff(r.dropoff)} />
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  if (p.mode === 'choose') {
    return (
      <ScrollView contentContainerStyle={[pad, { paddingTop: 12 }]}>
        <View style={{ borderWidth: 1, borderColor: color.grey200, borderRadius: radius.md }}>
          <TripRow dot="circle" label={p.pickup?.name ?? ''} onPress={() => p.setSearch('pickup')} />
          <View style={{ height: 1, backgroundColor: color.grey200, marginLeft: 40 }} />
          <TripRow dot="square" label={p.dropoff?.name ?? ''} onPress={() => p.setSearch('dropoff')} right={<IconButton icon="close" label="Clear destination" size={36} onPress={p.clearDropoff} />} />
        </View>
        <T variant="footnote" color={color.textSecondary} style={{ marginTop: 12, marginBottom: 8 }}>
          {p.route ? `${Math.round(p.route.minutes)} min · ${p.route.km.toFixed(1)} km${p.route.estimated ? ' (estimate)' : ''}` : 'Finding the best route…'}
        </T>
        {p.options.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={color.black} />
          </View>
        ) : (
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {p.options.map((o) => {
              const on = o.category === p.category;
              return (
                <Pressable key={o.category} onPress={() => { tap(); p.setCategory(o.category); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${o.label}, ${money(o.priceCents)}, ${o.pickupEtaMin} minutes away`} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on || hovered ? color.black : color.grey200 })}>
                  <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={CAR_ICON[o.category]} size={28} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <T variant="headline">{o.label}</T>
                      <Icon name="person-outline" size={13} color={color.grey500} />
                      <T variant="footnote" color={color.textSecondary}>{o.seats}</T>
                    </View>
                    <T variant="footnote" color={color.textSecondary}>
                      {time(o.arrivalAt)} · {o.pickupEtaMin} min away
                    </T>
                  </View>
                  <T variant="headline">{money(o.priceCents)}</T>
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable onPress={p.openPay} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: color.grey200, opacity: pressed ? 0.7 : 1 })}>
          <Icon name={p.method === 'wallet' ? 'wallet-outline' : 'card-outline'} size={20} />
          <T variant="headline" style={{ flex: 1 }}>{p.method === 'wallet' ? 'Hayve balance' : p.method === 'card' ? 'Visa •••• 4242' : 'Test card (declines)'}</T>
          <Icon name="chevron-forward" size={18} color={color.grey500} />
        </Pressable>
        {p.selected && p.method !== 'wallet' && p.selected.waveBackCents > 0 && (
          <T variant="footnote" color={color.textSecondary} style={{ marginBottom: 8 }}>
            Pay with your Hayve balance and get {money(p.selected.waveBackCents)} Wave Back
          </T>
        )}
        <Button title={p.selected ? `Request ${p.selected.label} · ${money(p.selected.priceCents)}` : 'Request ride'} size="lg" full loading={p.busy} disabled={!p.selected} onPress={p.request} style={{ marginTop: 8 }} />
        <T variant="caption" color={color.textSecondary} center style={{ marginTop: 8 }}>
          The fare includes all fees. Demo: no real ride is booked.
        </T>
      </ScrollView>
    );
  }

  const a = p.active;
  if (p.mode === 'finding' && a) {
    return (
      <View style={[pad, { paddingTop: 12, gap: 16 }]}>
        <T variant="title2">Finding your driver</T>
        <SearchingBar />
        <T color={color.textSecondary}>{a.categoryLabel} · {money(a.priceCents)} reserved · usually under a minute</T>
        <TripSummary a={a} />
        <Button title="Cancel request" variant="outline" full onPress={p.openCancel} />
      </View>
    );
  }

  if ((p.mode === 'arriving' || p.mode === 'trip') && a) {
    const d = a.driver;
    return (
      <ScrollView contentContainerStyle={[pad, { paddingTop: 12, gap: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T variant="title2">{p.mode === 'trip' ? `Heading to ${a.dropoff.name}` : a.status === 'arriving' ? 'Your driver is almost there' : 'Driver on the way'}</T>
        </View>
        <T color={color.textSecondary}>
          {p.mode === 'trip' ? (p.tripLeftMin ? `Arriving around ${time(Date.now() + p.tripLeftMin * 60_000)} · ${p.tripLeftMin} min left` : 'Calculating…') : p.driverEtaMin ? `Arrives in ${p.driverEtaMin} min · meet at ${a.pickup.name}` : 'Calculating…'}
        </T>
        {d && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: color.grey200 }}>
            <Avatar uri={d.avatarThumb ?? d.avatar} name={d.displayName} size={52} />
            <View style={{ flex: 1 }}>
              <T variant="headline">{d.displayName}</T>
              <Rating value={d.rating} count={d.trips} label="trips" />
              <T variant="footnote" color={color.textSecondary} numberOfLines={1}>
                {d.vehicle.color} {d.vehicle.make} {d.vehicle.model}
              </T>
            </View>
            <View style={{ borderWidth: 2, borderColor: color.black, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <T variant="headline" style={{ letterSpacing: 1 }}>{d.vehicle.plate}</T>
            </View>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Message" icon="chatbubble-outline" variant="secondary" style={{ flex: 1 }} onPress={p.message} />
          {p.mode === 'arriving' && <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={p.openCancel} />}
        </View>
        <TripSummary a={a} />
      </ScrollView>
    );
  }

  if (p.mode === 'done' && p.lastRide) {
    const r = p.lastRide;
    return (
      <ScrollView contentContainerStyle={[pad, { paddingTop: 12, gap: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="title2">You&apos;ve arrived</T>
          <Emoji char="🎉" size={24} />
        </View>
        <T color={color.textSecondary}>{r.dropoff.name} · {money(r.priceCents)} paid</T>
        <WaveBackForRide rideId={r.id} />
        <View style={{ gap: 8 }}>
          <T variant="headline">{r.rating ? 'Thanks for rating' : `How was your ride with ${r.driver?.displayName.split(' ')[0] ?? 'your driver'}?`}</T>
          <Stars value={r.rating ?? p.stars} onChange={(v) => !r.rating && p.setStars(v)} />
        </View>
        {!r.rating && <Button title="Submit rating" variant="secondary" disabled={!p.stars} onPress={p.rate} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Receipt" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/ride/${r.id}`)} />
          <Button title="Done" style={{ flex: 1 }} onPress={p.finish} />
        </View>
      </ScrollView>
    );
  }
  return null;
}

function WaveBackForRide({ rideId }: { rideId: string }) {
  const cents = useLive(() => ride.waveBackForRide(rideId), [rideId]).data ?? 0;
  return cents ? <View style={{ alignItems: 'flex-start' }}><WaveBackLine cents={cents} /></View> : null;
}

function TripSummary({ a }: { a: RideV }) {
  return (
    <View style={{ borderWidth: 1, borderColor: color.grey200, borderRadius: radius.md }}>
      <TripRow dot="circle" label={a.pickup.name} />
      <View style={{ height: 1, backgroundColor: color.grey200, marginLeft: 40 }} />
      <TripRow dot="square" label={a.dropoff.name} />
    </View>
  );
}

function TripRow({ dot, label, onPress, right }: { dot: 'circle' | 'square'; label: string; onPress?: () => void; right?: React.ReactNode }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, minHeight: 52 }}>
      <View style={{ width: 10, height: 10, backgroundColor: color.black, borderRadius: dot === 'circle' ? 5 : 0 }} />
      <T variant="headline" numberOfLines={1} style={{ flex: 1 }}>{label}</T>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

function PlaceRow({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: pressed || hovered ? color.grey100 : 'transparent' })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.grey200, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="headline" numberOfLines={1}>{title}</T>
        {sub ? <T variant="footnote" color={color.textSecondary} numberOfLines={1}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}

function SearchPanel({ which, near, places, onPick, onClose, onSetOnMap }: { which: 'pickup' | 'dropoff'; near: LngLat; places: readonly PlaceResult[]; onPick: (p: PlaceResult) => void; onClose: () => void; onSetOnMap?: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([...places]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      searchPlaces(q, near, ctrl.signal)
        .then((r) => setResults(r))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <IconButton icon="chevron-back" label="Back" onPress={onClose} />
        <T variant="title3">{which === 'pickup' ? 'Pickup' : 'Destination'}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderRadius: radius.md, borderWidth: 2, borderColor: color.black, paddingHorizontal: 16 }}>
        <Icon name="search" size={20} />
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder={which === 'pickup' ? 'Search pickup address' : 'Where to?'} placeholderTextColor={color.grey500} style={[{ flex: 1, fontSize: 16, color: color.black, outlineStyle: 'none' } as object, font('500')]} accessibilityLabel={which === 'pickup' ? 'Search pickup address' : 'Search destination'} returnKeyType="search" />
        {loading && <ActivityIndicator size="small" color={color.grey500} />}
      </View>
      <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        {onSetOnMap && <PlaceRow icon="location-outline" title="Set pickup on the map" onPress={onSetOnMap} />}
        {results.map((r) => (
          <PlaceRow key={r.id} icon={r.id === 'home' ? 'home-outline' : r.id === 'work' ? 'briefcase-outline' : 'location-outline'} title={r.name} sub={r.address} onPress={() => onPick(r)} />
        ))}
        {!loading && results.length === 0 && <T color={color.textSecondary} style={{ marginTop: 16 }}>No places found. Try a street name or landmark.</T>}
      </ScrollView>
    </View>
  );
}

function SearchingBar() {
  const [x, setX] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setX((v) => (v + 4) % 100), 40);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: color.grey100, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityLabel="Searching">
      <View style={{ position: 'absolute', left: `${x - 30}%`, width: '30%', height: 4, borderRadius: 2, backgroundColor: color.black }} />
    </View>
  );
}
