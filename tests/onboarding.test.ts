import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../src/backend/api';
import { createSeedDatabase } from '../src/backend/seed';
import { attachStorage, getDb } from '../src/backend/store';
import { guestCanOpen } from '../src/features/onboarding/access';
import { isAnswered, landingFor, landingLabel, needsAccountToStart, nextStep, prevStep, progress, sanitize, STEPS, stepsFor, toPrefs } from '../src/features/onboarding/model';

beforeEach(() => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
});

describe('onboarding steps', () => {
  it('asks only the follow-up that matches the goal', () => {
    expect(stepsFor({})).toEqual(['intro', 'goal', 'country', 'earn', 'done']);
    expect(stepsFor({ goal: 'food' })).toEqual(['intro', 'goal', 'country', 'cuisines', 'earn', 'done']);
    expect(stepsFor({ goal: 'ride' })).toContain('rideType');
    expect(stepsFor({ goal: 'ride' })).not.toContain('cuisines');
    expect(stepsFor({ goal: 'money' })).toEqual(['intro', 'goal', 'country', 'earn', 'done']);
    expect(nextStep({ goal: 'stay' }, 'country')).toBe('travellers');
    expect(prevStep({ goal: 'stay' }, 'earn')).toBe('travellers');
    expect(prevStep({}, 'intro')).toBeNull();
  });

  it('documents what every question changes', () => {
    for (const s of STEPS) expect(s.changes.length).toBeGreaterThan(10);
  });

  it('never starts the progress bar at zero and shows what is left near the end', () => {
    const a = { goal: 'food' as const };
    expect(progress(a, 'intro').value).toBeGreaterThan(0);
    expect(progress(a, 'intro').label).toBeNull();
    const values = stepsFor(a).map((s) => progress(a, s).value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(progress(a, 'cuisines').label).toBe('1 step to go');
    expect(progress(a, 'earn').label).toBe('Last step');
    expect(progress(a, 'done').value).toBe(1);
  });

  it('only lets you continue once the question is answered', () => {
    expect(isAnswered({}, 'goal')).toBe(false);
    expect(isAnswered({ goal: 'shop' }, 'goal')).toBe(true);
    expect(isAnswered({ goal: 'food', cuisines: [] }, 'cuisines')).toBe(false);
    expect(isAnswered({ earn: [] }, 'earn')).toBe(true); // "Not now" is an answer
    expect(isAnswered({}, 'intro')).toBe(true);
  });
});

describe('personalised first screen', () => {
  it('opens the screen for the goal, named by its benefit', () => {
    expect(landingFor({ goal: 'food' })).toBe('/bites');
    expect(landingFor({ goal: 'sell' })).toBe('/sell');
    expect(landingFor({ goal: 'shop', shopFor: ['books'] })).toBe('/shop?category=books');
    expect(landingFor({ goal: 'shop', shopFor: ['books', 'sport'] })).toBe('/shop');
    expect(landingFor({})).toBe('/');
    expect(landingLabel({ goal: 'food' })).toBe('Show me food nearby');
    expect(landingLabel({ goal: 'money' })).toBe('Set up my Hayve');
    expect(needsAccountToStart({ goal: 'money' })).toBe(true);
    expect(needsAccountToStart({ goal: 'ride' })).toBe(false);
  });
});

describe('answers stored on the device', () => {
  it('keeps only known values', () => {
    const a = sanitize({ goal: 'hack', country: 'xx', cuisines: ['Pizza', 'DROP TABLE'], shopFor: ['books', 'weapons'], rideType: 'go', travellers: 99, earn: ['driver', 'admin'] });
    expect(a).toEqual({ goal: undefined, country: undefined, cuisines: ['Pizza'], shopFor: ['books'], rideType: 'go', travellers: undefined, carType: undefined, earn: ['driver'] });
    expect(sanitize(null)).toEqual(sanitize({}));
    expect(toPrefs({ goal: 'food', country: 'GB', cuisines: ['Pizza'] })).toEqual({ goal: 'food', cuisines: ['Pizza'] });
  });
});

describe('sign-up after onboarding', () => {
  it('attaches the answers to the new account and cleans them', () => {
    api.session.signUp({ email: 'new@hayve.app', password: 'supersecret', displayName: 'New Person', username: 'newperson', country: 'GB', onboarding: { goal: 'food', cuisines: ['Pizza', 'Sushi'], earn: ['courier'], rideType: 'nope' as never } });
    expect(api.session.myPreferences()).toEqual({ goal: 'food', cuisines: ['Pizza', 'Sushi'], earn: ['courier'] });
    expect(api.social.myProfile().profile.country).toBe('GB');
    api.session.savePreferences({ goal: 'ride', rideType: 'xl' });
    expect(getDb().profiles.find((p) => p.username === 'newperson')!.onboarding).toEqual({ goal: 'ride', rideType: 'xl' });
    api.session.signOut();
    expect(api.session.myPreferences()).toBeNull();
  });
});

describe('looking around without an account', () => {
  it('lets visitors browse every service but not pay, book or see account pages', () => {
    expect(guestCanOpen(['(tabs)'], '/')).toBe(true);
    for (const t of ['shop', 'bites', 'ride', 'stay', 'drive', 'explore']) expect(guestCanOpen(['(tabs)', t], `/${t}`)).toBe(true);
    expect(guestCanOpen(['(tabs)', 'pay'], '/pay')).toBe(false);
    expect(guestCanOpen(['(tabs)', 'profile'], '/profile')).toBe(false);
    expect(guestCanOpen(['bites', 'restaurant', '[id]'], '/bites/restaurant/rs_napoli')).toBe(true);
    expect(guestCanOpen(['bites', 'order', '[id]'], '/bites/order/fo_1')).toBe(false);
    expect(guestCanOpen(['stay', 'booking', '[id]'], '/stay/booking/b_1')).toBe(false);
    expect(guestCanOpen(['checkout', '[productId]'], '/checkout/p_1')).toBe(false);
    expect(guestCanOpen(['product', '[id]'], '/product/p_1')).toBe(true);
    expect(guestCanOpen(['start'], '/start')).toBe(true);
    expect(guestCanOpen(['settings'], '/settings')).toBe(false);
  });

  it('asks for an account on the first real action', () => {
    expect(() => api.bites.placeFoodOrder({ restaurantId: 'rs_napoli', lines: [], address: '1 Test St', method: 'card' })).toThrow(/sign in/i);
  });
});
