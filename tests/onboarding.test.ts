import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../src/backend/api';
import { createSeedDatabase } from '../src/backend/seed';
import { attachStorage, getDb } from '../src/backend/store';
import { guestCanOpen } from '../src/features/onboarding/access';
import { isAnswered, landingFor, landingLabel, needsAccountToStart, nextStep, prevStep, progress, sanitize, STEPS, stepsFor, toPrefs, withInterests } from '../src/features/onboarding/model';
import { arcPositions, hitTest, primaryAction, sideTabs } from '../src/features/nav/actions';

beforeEach(() => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
});

describe('onboarding steps', () => {
  it('asks which one you do most only when you picked several, and one follow-up for it', () => {
    expect(stepsFor({})).toEqual(['intro', 'interests', 'location', 'company', 'earn', 'done']);
    expect(stepsFor({ interests: ['food'], primary: 'food' })).toEqual(['intro', 'interests', 'location', 'cuisines', 'company', 'earn', 'done']);
    expect(stepsFor({ interests: ['food', 'ride'], primary: 'ride' })).toEqual(['intro', 'interests', 'primary', 'location', 'rideType', 'company', 'earn', 'done']);
    expect(stepsFor({ interests: ['money'] })).not.toContain('cuisines');
    expect(nextStep({ interests: ['car'] }, 'location')).toBe('carType');
    expect(prevStep({}, 'intro')).toBeNull();
  });

  it('makes the first pick the big button until you choose another', () => {
    expect(withInterests({}, ['shop', 'food'])).toEqual({ interests: ['shop', 'food'], primary: 'shop', goal: 'shop' });
    expect(withInterests({ primary: 'food' }, ['shop', 'food']).primary).toBe('food');
    expect(withInterests({ primary: 'food' }, ['shop']).primary).toBe('shop');
  });

  it('documents what every question changes', () => {
    for (const s of STEPS) expect(s.changes.length).toBeGreaterThan(10);
  });

  it('never starts the progress bar at zero and shows what is left near the end', () => {
    const a = { interests: ['food' as const], primary: 'food' as const };
    expect(progress(a, 'intro').value).toBeGreaterThan(0);
    expect(progress(a, 'intro').label).toBeNull();
    const values = stepsFor(a).map((s) => progress(a, s).value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(progress(a, 'company').label).toBe('1 step to go');
    expect(progress(a, 'earn').label).toBe('Last step');
    expect(progress(a, 'done').value).toBe(1);
  });

  it('only lets you continue once the question is answered', () => {
    expect(isAnswered({}, 'interests')).toBe(false);
    expect(isAnswered({ interests: ['shop'] }, 'interests')).toBe(true);
    expect(isAnswered({ interests: ['shop'], primary: 'food' }, 'primary')).toBe(false);
    expect(isAnswered({ country: 'US' }, 'location')).toBe(true);
    expect(isAnswered({ earn: [] }, 'earn')).toBe(true);
    expect(isAnswered({}, 'intro')).toBe(true);
  });
});

describe('personalised first screen', () => {
  it('opens what you do most', () => {
    expect(landingFor({ primary: 'food' })).toBe('/bites');
    expect(landingFor({ primary: 'holiday' })).toBe('/holidays');
    expect(landingFor({ primary: 'sell' })).toBe('/sell');
    expect(landingFor({ primary: 'shop', shopFor: ['books'] })).toBe('/shop?category=books');
    expect(landingFor({})).toBe('/');
    expect(landingLabel({ primary: 'food' })).toBe('Show me food nearby');
    expect(needsAccountToStart({ primary: 'money' })).toBe(true);
    expect(needsAccountToStart({ primary: 'ride' })).toBe(false);
  });

  it('puts what you do most on the big centre button, with the other services beside it', () => {
    expect(primaryAction({ primary: 'food' }).route).toBe('/bites');
    expect(primaryAction({ goal: 'car' }).route).toBe('/drive');
    expect(primaryAction(null).key).toBe('ride');
    expect(sideTabs(primaryAction({ primary: 'food' }))).toEqual(['shop', 'ride']);
    expect(sideTabs(primaryAction({ primary: 'ride' }))).toEqual(['shop', 'bites']);
    const pts = arcPositions(8, 138);
    expect(pts).toHaveLength(8);
    expect(pts.every((p) => p.y < 0)).toBe(true);
    expect(hitTest(pts, pts[3].x + 5, pts[3].y - 5)).toBe(3);
    expect(hitTest(pts, 0, 0)).toBe(-1);
  });
});

describe('answers stored on the device', () => {
  it('keeps only known values', () => {
    const a = sanitize({ goal: 'hack', interests: ['food', 'evil', 'food'], country: 'xx', cuisines: ['Pizza', 'DROP TABLE'], shopFor: ['books', 'weapons'], rideType: 'go', travellers: 99, earn: ['driver', 'admin'], company: 'family' });
    expect(a.interests).toEqual(['food']);
    expect(a.goal).toBeUndefined();
    expect(a.country).toBeUndefined();
    expect(a.cuisines).toEqual(['Pizza']);
    expect(a.shopFor).toEqual(['books']);
    expect(a.travellers).toBeUndefined();
    expect(a.earn).toEqual(['driver']);
    expect(a.company).toBe('family');
    expect(sanitize(null)).toEqual(sanitize({}));
    expect(toPrefs({ primary: 'food', interests: ['food'], country: 'GB', address: { line1: '1 A St', city: 'London', postcode: '', country: 'United Kingdom', countryCode: 'GB' }, cuisines: ['Pizza'] })).toEqual({ primary: 'food', goal: 'food', interests: ['food'], cuisines: ['Pizza'] });
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
