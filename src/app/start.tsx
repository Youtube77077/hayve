import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { regions, revenue, session } from '../backend/api';
import { Appear, Button, color, Emoji, font, HayveMark, Icon, MOTION, radius, SuccessMark, T, useReducedMotion } from '../design';
import type { IconName } from '../design';
import {
  CAR_TYPES,
  COMPANY,
  CUISINES,
  EARN,
  GOALS,
  isAnswered,
  landingFor,
  needsAccountToStart,
  nextStep,
  type OnboardingAnswers,
  type Option,
  prevStep,
  progress,
  RIDE_TYPES,
  SHOP_FOR,
  type StepId,
  toPrefs,
  TRAVELLERS_FOR,
  withInterests,
} from '../features/onboarding/model';
import { addressAt, currentPosition } from '../features/address';
import { completeOnboarding, setAnswers, useOnboarding } from '../features/onboarding/store';
import { chooseCountry, detectedCountry } from '../lib/geo';
import { useSessionId } from '../lib/hooks';
import { setReturnTo } from '../lib/returnTo';

/**
 * First open: a few tappable questions before any account (Duolingo style). Each answer changes
 * what the person sees (see `changes` in features/onboarding/model.ts). Answers stay on the device
 * until sign-up, then move to the account.
 */
export default function Start() {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboarding();
  const signedIn = !!useSessionId();
  const [step, setStep] = useState<StepId>('intro');
  const reduced = useReducedMotion();

  // The detected country is the pre-selected (recommended) answer.
  useEffect(() => {
    if (!answers.country) setAnswers({ country: detectedCountry() });
  }, [answers.country]);

  const p = progress(answers, step);
  const bar = useRef(new Animated.Value(p.value)).current;
  useEffect(() => {
    if (reduced) bar.setValue(p.value);
    else Animated.timing(bar, { toValue: p.value, duration: MOTION.slow, easing: MOTION.easeOut, useNativeDriver: false }).start();
  }, [bar, p.value, reduced]);

  const go = (to: StepId) => setStep(to);
  const next = () => go(nextStep(answers, step));
  const back = () => {
    const prev = prevStep(answers, step);
    if (prev) go(prev);
    else if (router.canGoBack()) router.back();
  };

  const finish = (saveSetup: boolean) => {
    completeOnboarding();
    if (signedIn) {
      session.savePreferences(toPrefs(answers));
      router.replace(landingFor(answers) as never);
      return;
    }
    if (saveSetup || needsAccountToStart(answers)) {
      setReturnTo(landingFor(answers));
      router.replace('/sign-up');
    } else router.replace(landingFor(answers) as never);
  };

  const canContinue = isAnswered(answers, step);

  return (
    <View style={{ flex: 1, backgroundColor: color.white, paddingTop: insets.top }}>
      {step !== 'intro' && step !== 'done' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' })}>
            <Icon name="arrow-back" size={24} color={color.grey500} />
          </Pressable>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p.value * 100) }} style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: color.grey100, overflow: 'hidden' }}>
            <Animated.View style={{ height: '100%', borderRadius: 6, backgroundColor: color.indigo, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
          </View>
          {p.label && (
            <T variant="caption" weight="700" color={color.grey500} style={{ minWidth: 72, textAlign: 'right' }}>
              {p.label}
            </T>
          )}
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <StepBody key={step} step={step} answers={answers} signedIn={signedIn} />
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 16, width: '100%', maxWidth: 560, alignSelf: 'center', gap: 4 }}>
        {step === 'done' ? (
          <Button title="Let's go" size="lg" full onPress={() => finish(false)} />        ) : step === 'intro' ? (
          <>
            <Button title="Let's go" size="lg" full onPress={next} />
            {!signedIn && <Button title="I already have an account" variant="ghost" full onPress={() => router.push('/sign-in')} />}
          </>
        ) : (
          <Button title="Continue" size="lg" full disabled={!canContinue} onPress={next} />
        )}
      </View>
    </View>
  );
}

/** The Hayve mark with a speech bubble, like a friendly guide. */
function Guide({ text, big }: { text: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'center' : 'flex-start', gap: big ? 20 : 12, marginTop: big ? 48 : 8, marginBottom: 20 }}>
      <HayveMark size={big ? 96 : 64} />
      <View style={{ flex: big ? undefined : 1, borderWidth: 2, borderColor: color.grey200, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 14, alignSelf: big ? 'stretch' : 'auto' }}>
        <T style={{ fontSize: big ? 20 : 17, lineHeight: big ? 28 : 24, ...font('600'), textAlign: big ? 'center' : 'left' }}>{text}</T>
      </View>
    </View>
  );
}

function OptionCard({ title, hint, icon, selected, onPress, index }: { title: string; hint?: string; icon?: IconName; selected: boolean; onPress: () => void; index: number }) {
  return (
    <Appear index={index}>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={hint ? `${title}, ${hint}` : title}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          minHeight: 60,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: radius.md,
          borderWidth: 2,
          borderBottomWidth: selected ? 2 : 4,
          borderColor: selected ? color.indigo : color.grey200,
          backgroundColor: color.white,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {icon && <Icon name={icon} size={24} color={selected ? color.indigo : color.black} />}
        <T variant="headline" color={selected ? color.indigo : color.black} style={{ flex: 1 }}>
          {title}
        </T>
        {hint && (
          <T variant="footnote" color={selected ? color.indigo : color.grey500}>
            {hint}
          </T>
        )}
        {selected && <Icon name="checkmark-circle" size={22} color={color.indigo} />}
      </Pressable>
    </Appear>
  );
}

function Choices<K extends string | number>({ options, isOn, onPick }: { options: Option<K>[]; isOn: (k: K) => boolean; onPick: (k: K) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {options.map((o, i) => (
        <OptionCard key={String(o.key)} index={i} title={o.title} hint={o.hint} icon={o.icon} selected={isOn(o.key)} onPress={() => onPick(o.key)} />
      ))}
    </View>
  );
}

function toggle<T>(list: T[] | undefined, v: T) {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
}

function StepBody({ step, answers }: { step: StepId; answers: OnboardingAnswers; signedIn: boolean }) {
  const detected = detectedCountry();
  const countries = useMemo(() => [...regions.REGIONS].sort((a, b) => Number(b.code === detected) - Number(a.code === detected) || a.name.localeCompare(b.name)), [detected]);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied'>('idle');
  const [pickCountry, setPickCountry] = useState(false);

  const locate = async () => {
    setLocating('busy');
    const pos = await currentPosition();
    if (!pos) return setLocating('denied');
    const found = await addressAt(pos);
    // No street address (offline or the lookup failed): still use the nearest city we know.
    const near = found ? null : revenue.cityAt(pos);
    const nearRegion = near ? regions.REGIONS.find((r) => r.code === near.country) : undefined;
    const countryCode = found?.countryCode ?? near?.country ?? null;
    const code = countryCode && regions.REGIONS.some((r) => r.code === countryCode) ? countryCode : null;
    const address = found ? { line1: found.line1, city: found.city, postcode: found.postcode, country: found.country, countryCode: found.countryCode } : near ? { line1: '', city: near.name, postcode: '', country: nearRegion?.name ?? '', countryCode: near.country } : undefined;
    setAnswers({ address: address ? { ...address, lng: pos.lng, lat: pos.lat } : undefined, ...(code ? { country: code } : {}) });
    if (code) chooseCountry(code);
    setLocating(address ? 'idle' : 'denied');
  };

  switch (step) {
    case 'intro':
      return (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Guide big text="Hi! I'm Hayve. Let's set things up." />
        </View>
      );

    // Changes: what Home shows first and the actions in the centre button menu.
    case 'interests':
      return (
        <>
          <Guide text="What would you use Hayve for? Pick all that fit." />
          <Choices options={GOALS} isOn={(k) => !!answers.interests?.includes(k)} onPick={(k) => setAnswers(withInterests(answers, toggle(answers.interests, k)))} />
        </>
      );

    // Changes: the big centre button and the first screen after onboarding.
    case 'primary':
      return (
        <>
          <Guide text="Which one will you do most? It gets the big button." />
          <Choices options={GOALS.filter((g) => answers.interests?.includes(g.key))} isOn={(k) => answers.primary === k} onPick={(k) => setAnswers({ primary: k, goal: k })} />
        </>
      );

    // Changes: delivery address, ride pickup, what's nearby, currency and tax.
    case 'location':
      return (
        <>
          <Guide text="Where are you?" />
          {answers.address ? (
            <OptionCard index={0} title={answers.address.line1 || answers.address.city} hint={answers.address.line1 ? answers.address.city : undefined} icon="location-outline" selected onPress={() => void locate()} />
          ) : (
            <OptionCard index={0} title={locating === 'busy' ? 'Finding you…' : 'Use my location'} hint={locating === 'denied' ? 'Location is off' : undefined} icon="navigate-outline" selected={false} onPress={() => void locate()} />
          )}
          {!pickCountry ? (
            <T variant="subhead" weight="700" style={{ marginTop: 16, textAlign: 'center' }} onPress={() => setPickCountry(true)} accessibilityRole="button">
              {answers.address ? 'Not right? Pick your country' : 'Or pick your country'}
            </T>
          ) : (
            <View style={{ marginTop: 16 }}>
              <Choices
                options={countries.map((r) => ({ key: r.code, title: r.name, hint: r.currency, icon: 'flag-outline' as IconName }))}
                isOn={(k) => answers.country === k}
                onPick={(k) => {
                  setAnswers({ country: k, address: undefined });
                  chooseCountry(k);
                }}
              />
            </View>
          )}
        </>
      );

    // Changes: Bites shows "Picked for you" with these cuisines first.
    case 'cuisines':
      return (
        <>
          <Guide text="Favourite food? Pick as many as you like." />
          <Choices options={CUISINES} isOn={(k) => !!answers.cuisines?.includes(k)} onPick={(k) => setAnswers({ cuisines: toggle(answers.cuisines, k) })} />
        </>
      );

    // Changes: Shop opens on these categories and shows "Picked for you".
    case 'shopFor':
      return (
        <>
          <Guide text="What do you love to shop for?" />
          <Choices options={SHOP_FOR} isOn={(k) => !!answers.shopFor?.includes(k)} onPick={(k) => setAnswers({ shopFor: toggle(answers.shopFor, k) })} />
        </>
      );

    // Changes: the first listing form starts with this category.
    case 'sellWhat':
      return (
        <>
          <Guide text="What will you sell first?" />
          <Choices options={SHOP_FOR} isOn={(k) => answers.shopFor?.[0] === k} onPick={(k) => setAnswers({ shopFor: [k] })} />
        </>
      );

    // Changes: the ride type pre-selected when booking.
    case 'rideType':
      return (
        <>
          <Guide text="How do you like to ride?" />
          <Choices options={RIDE_TYPES} isOn={(k) => answers.rideType === k} onPick={(k) => setAnswers({ rideType: k })} />
        </>
      );

    // Changes: Drive opens filtered to this kind of car.
    case 'carType':
      return (
        <>
          <Guide text="What kind of car?" />
          <Choices options={CAR_TYPES} isOn={(k) => answers.carType === k} onPick={(k) => setAnswers({ carType: k })} />
        </>
      );

    // Changes: guests for stays and holidays, bigger cars for families, splitting bills for friends.
    case 'company':
      return (
        <>
          <Guide text="Who do you usually do things with?" />
          <Choices options={COMPANY} isOn={(k) => answers.company === k} onPick={(k) => setAnswers({ company: k, travellers: TRAVELLERS_FOR[k] })} />
        </>
      );

    // Changes: Home shows a "Start earning" card for these roles; after sign-up we offer the partner setup.
    case 'earn':
      return (
        <>
          <Guide text="Want to earn with Hayve too?" />
          <Choices options={EARN} isOn={(k) => !!answers.earn?.includes(k)} onPick={(k) => setAnswers({ earn: toggle(answers.earn, k) })} />
          <View style={{ marginTop: 10 }}>
            <OptionCard index={EARN.length} title="Not now" icon="close-circle-outline" selected={Array.isArray(answers.earn) && answers.earn.length === 0} onPress={() => setAnswers({ earn: [] })} />
          </View>
        </>
      );

    case 'done':
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <SuccessMark size={96} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="title1" center>
              You’re all set
            </T>
            <Emoji char="🎉" size={28} />
          </View>
        </View>
      );
  }
}
