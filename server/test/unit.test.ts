import * as OTPAuth from 'otpauth';
import { describe, expect, it } from 'vitest';
import { marketplaceFeeCents, validateTiers } from '../src/fees.js';
import { checkAvatarUpload, sniffImageType } from '../src/images.js';
import { hashPassword, newTotpSecret, passwordProblem, readSession, signSession, verifyPassword, verifyTotp } from '../src/security.js';

const TIERS = [
  { upTo: 5000, rate: 0.05 },
  { upTo: 25000, rate: 0.04 },
  { upTo: 100000, rate: 0.03 },
  { upTo: null, rate: 0.02 },
];

describe('fees', () => {
  it('matches the brief', () => {
    expect(marketplaceFeeCents(5000, TIERS)).toBe(250);
    expect(marketplaceFeeCents(25000, TIERS)).toBe(1000);
    expect(marketplaceFeeCents(26000, TIERS)).toBe(1000);
    expect(marketplaceFeeCents(120000, TIERS)).toBe(3000);
  });
  it('never goes down as the price goes up', () => {
    let prev = 0;
    for (let p = 1; p <= 300000; p += 7) {
      const f = marketplaceFeeCents(p, TIERS);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
  it('validates tier tables', () => {
    expect(validateTiers(TIERS)).toBeNull();
    expect(validateTiers([{ upTo: 100, rate: 0.05 }])).toMatch(/last tier/);
  });
});

describe('uploads', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const webp = new TextEncoder().encode('RIFF....WEBPVP8 ');
  it('detects real types from bytes', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
  });
  it('rejects empty, oversized and non-image files', () => {
    expect(checkAvatarUpload(new Uint8Array())).toMatch(/empty/);
    expect(checkAvatarUpload(new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff))).toMatch(/5 MB/);
    expect(checkAvatarUpload(new TextEncoder().encode('%PDF-1.7'))).toMatch(/JPG/);
    expect(checkAvatarUpload(jpeg)).toBeNull();
  });
});

describe('security', () => {
  it('hashes passwords with argon2id', async () => {
    const h = await hashPassword('correct horse 42');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse 42')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });
  it('enforces a password policy', () => {
    expect(passwordProblem('short1')).toBeTruthy();
    expect(passwordProblem('onlyletterslong')).toBeTruthy();
    expect(passwordProblem('letters and 1 number')).toBeNull();
  });
  it('signs and verifies sessions', async () => {
    const secret = 'x'.repeat(40);
    const t = await signSession(secret, { sub: '00000000-0000-0000-0000-000000000001', aal: 'aal2', sv: 3 });
    expect(await readSession(secret, t)).toEqual({ sub: '00000000-0000-0000-0000-000000000001', aal: 'aal2', sv: 3 });
    expect(await readSession('y'.repeat(40), t)).toBeNull();
  });
  it('verifies TOTP codes', () => {
    const s = newTotpSecret();
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s) }).generate();
    expect(verifyTotp(s, code)).toBe(true);
    expect(verifyTotp(s, '000000') && code !== '000000').toBe(false);
    expect(verifyTotp(s, 'abc')).toBe(false);
  });
});
