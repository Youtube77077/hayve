import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { regions, session } from '../backend/api';
import { Appear, Button, color, Emoji, font, HayveMark, Icon, MOTION, radius, SuccessMark, T, useReducedMotion } from '../design';
import type { IconName } from '../design';
import {
  CAR_TYPES,
  CUISINES,
  EARN,
  GOALS,
  isAnswered,
  landingFor,
  landingLabel,
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
  TRAVELLERS,
} from '../features/onboarding/model';
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
          <>
            <Button title={landingLabel(answers)} size="lg" full onPress={() => finish(false)} />
            {!signedIn && !needsAccountToStart(answers) && <Button title="Save my setup first" variant="ghost" full onPress={() => finish(true)} />}
          </>
        ) : step === 'intro' ? (
          <>
            <Button title="Get started" size="lg" full onPress={next} />
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

function StepBody({ step, answers, signedIn }: { step: StepId; answers: OnboardingAnswers; signedIn: boolean }) {
  const detected = detectedCountry();
  const countries = useMemo(() => [...regions.REGIONS].sort((a, b) => Number(b.code === detected) - Number(a.code === detected) || a.name.localeCompare(b.name)), [detected]);

  switch (step) {
    case 'intro':
      return (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Guide big text="Hi! I'm Hayve. One account for rides, food, shopping, stays, cars and paying friends." />
          <T color={color.grey500} style={{ textAlign: 'center' }}>
            {signedIn ? 'Answer a few questions and we’ll set Hayve up around you again.' : 'A few quick taps and we’ll set it up around you. No account needed yet.'}
          </T>
        </View>
      );

    // Changes: the screen that opens after onboarding and what Home shows first.
    case 'goal':
      return (
        <>
          <Guide text="What do you want to do first?" />
          <Choices options={GOALS} isOn={(k) => answers.goal === k} onPick={(k) => setAnswers({ goal: k })} />
        </>
      );

    // Changes: currency, local restaurants/stays/cars, map centre, bank and tax details.
    case 'country':
      return (
        <>
          <Guide text="Where are you based?" />
          <Choices
            options={countries.map((r) => ({ key: r.code, title: r.name, hint: r.code === detected ? `Detected · ${r.currency}` : r.currency, icon: 'location-outline' as IconName }))}
            isOn={(k) => answers.country === k}
            onPick={(k) => {
              setAnswers({ country: k });
              chooseCountry(k);
            }}
          />
        </>
      );

    // Changes: Bites shows "Picked for you" with these cuisines first.
    case 'cuisines':
      return (
        <>
          <Guide text="What are you in the mood for? Pick as many as you like." />
          <Choices options={CUISINES} isOn={(k) => !!answers.cuisines?.includes(k)} onPick={(k) => setAnswers({ cuisines: toggle(answers.cuisines, k) })} />
        </>
      );

    // Changes: Shop opens on these categories and shows "Picked for you".
    case 'shopFor':
      return (
        <>
          <Guide text="What do you like to shop for? Pick as many as you like." />
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
          <Guide text="What matters most when you ride?" />
          <Choices options={RIDE_TYPES} isOn={(k) => answers.rideType === k} onPick={(k) => setAnswers({ rideType: k })} />
        </>
      );

    // Changes: Stay search starts with this many guests.
    case 'travellers':
      return (
        <>
          <Guide text="Who's usually coming along?" />
          <Choices options={TRAVELLERS} isOn={(k) => answers.travellers === k} onPick={(k) => setAnswers({ travellers: k })} />
        </>
      );

    // Changes: Drive opens filtered to this kind of car.
    case 'carType':
      return (
        <>
          <Guide text="What kind of car do you need?" />
          <Choices options={CAR_TYPES} isOn={(k) => answers.carType === k} onPick={(k) => setAnswers({ carType: k })} />
        </>
      );

    // Changes: Home shows a "Start earning" card for these roles; after sign-up we offer the partner setup.
    case 'earn':
      return (
        <>
          <Guide text="Do you also want to earn with Hayve? Pick any, or not now." />
          <Choices options={EARN} isOn={(k) => !!answers.earn?.includes(k)} onPick={(k) => setAnswers({ earn: toggle(answers.earn, k) })} />
          <View style={{ marginTop: 10 }}>
            <OptionCard index={EARN.length} title="Not now" icon="close-circle-outline" selected={Array.isArray(answers.earn) && answers.earn.length === 0} onPress={() => setAnswers({ earn: [] })} />
          </View>
        </>
      );

    case 'done':
      return <Done answers={answers} />;
  }
}

/** What we set up, in plain words, so the next screen makes sense. */
function Done({ answers }: { answers: OnboardingAnswers }) {
  const reg = regions.region(answers.country ?? detectedCountry());
  const goal = GOALS.find((g) => g.key === answers.goal);
  const lines: { icon: IconName; text: string }[] = [
    goal && { icon: goal.icon ?? 'sparkles-outline', text: `${goal.title} comes first when you open Hayve` },
    { icon: 'location-outline' as IconName, text: `Prices in ${reg.currency}, places near ${reg.city.name}` },
    answers.cuisines?.length ? { icon: 'restaurant-outline' as IconName, text: `${answers.cuisines.slice(0, 3).join(', ')} picked for you` } : null,
    answers.goal === 'shop' && answers.shopFor?.length ? { icon: 'bag-handle-outline' as IconName, text: `${answers.shopFor.length} categor${answers.shopFor.length > 1 ? 'ies' : 'y'} picked for you` } : null,
    answers.rideType ? { icon: 'taxi-outline' as IconName, text: `${RIDE_TYPES.find((r) => r.key === answers.rideType)?.hint} rides selected by default` } : null,
    answers.travellers ? { icon: 'people-outline' as IconName, text: `Stays for ${answers.travellers} guest${answers.travellers > 1 ? 's' : ''}` } : null,
    answers.carType ? { icon: 'car-outline' as IconName, text: `${CAR_TYPES.find((c) => c.key === answers.carType)?.title} cars first` } : null,
    answers.earn?.length ? { icon: 'cash-outline' as IconName, text: `We’ll help you start earning (${answers.earn.length} way${answers.earn.length > 1 ? 's' : ''})` } : null,
  ].filter(Boolean) as { icon: IconName; text: string }[];

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 20, paddingTop: 32 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <SuccessMark size={88} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="title1" style={{ textAlign: 'center' }}>
            You’re all set
          </T>
          <Emoji char="🎉" size={26} />
        </View>
        <T color={color.grey500} style={{ textAlign: 'center' }}>
          {needsAccountToStart(answers) ? 'Create your account to send and receive money.' : 'Have a look around. You only need an account when you pay, book or sell.'}
        </T>
      </View>
      <View style={{ borderWidth: 2, borderColor: color.grey200, borderRadius: radius.lg, padding: 16, gap: 14 }}>
        {lines.map((l, i) => (
          <Appear key={l.text} index={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={l.icon} size={22} />
              <T style={{ flex: 1 }}>{l.text}</T>
            </View>
          </Appear>
        ))}
      </View>
    </View>
  );
}
