import { useSyncExternalStore } from 'react';
import { session } from '../../backend/api';
import type { OnboardingPrefs } from '../../backend/types';
import { useLive } from '../../lib/hooks';
import { deviceStorage } from '../../lib/storage';
import { type OnboardingAnswers, sanitize } from './model';

/**
 * Onboarding answers live on the device until sign-up, then move to the account
 * (session.signUp({ onboarding })). Signed-in screens read them from the account.
 */
const KEY = 'hayve.onboarding.v1';

interface State {
  answers: OnboardingAnswers;
  /** Finished the questions (they can browse without an account from then on). */
  done: boolean;
  loaded: boolean;
}

let state: State = { answers: {}, done: false, loaded: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  void deviceStorage.setItem(KEY, JSON.stringify({ answers: state.answers, done: state.done })).catch(() => {});
}

/** Reads saved answers at startup (before the first screen decides where to go). */
export async function loadOnboarding() {
  try {
    const raw = await deviceStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as { answers?: unknown; done?: unknown };
      state = { answers: sanitize(j.answers), done: j.done === true, loaded: true };
    } else state = { ...state, loaded: true };
  } catch {
    state = { ...state, loaded: true };
  }
  emit();
}

export const getOnboarding = () => state;

export function setAnswers(patch: Partial<OnboardingAnswers>) {
  state = { ...state, answers: sanitize({ ...state.answers, ...patch }) };
  persist();
  emit();
}

export function completeOnboarding() {
  state = { ...state, done: true };
  persist();
  emit();
}

/** Start over (Settings → "Personalise Hayve again", and tests). */
export function resetOnboarding() {
  state = { answers: {}, done: false, loaded: true };
  persist();
  emit();
}

export function useOnboarding() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/**
 * What to personalise with: the account's answers when signed in, otherwise this device's.
 * Screens use it for defaults only; the person can always change them.
 */
export function usePersonalisation(): OnboardingPrefs & { country?: string } {
  const local = useOnboarding().answers;
  const account = useLive(() => session.myPreferences()).data;
  return account ? { ...account, country: local.country } : local;
}
