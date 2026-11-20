import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { currencyFor, verifyStripeSignature } from '../src/payments.js';


describe('webhook signatures', () => {
  const secret = 'whsec_test';
  const payload = '{"type":"payment_intent.succeeded"}';
  const sign = (t: number, body = payload) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
  it('accepts a valid, fresh signature', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(payload, sign(t), secret)).toBe(true);
  });
  it('rejects tampered bodies, old timestamps and missing headers', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(payload + ' ', sign(t), secret)).toBe(false);
    expect(verifyStripeSignature(payload, sign(t - 3600), secret)).toBe(false);
    expect(verifyStripeSignature(payload, undefined, secret)).toBe(false);
    expect(verifyStripeSignature(payload, sign(t), 'whsec_other')).toBe(false);
  });
});

describe('currencies', () => {
  it('charges in the account currency', () => {
    expect(currencyFor('US')).toBe('usd');
    expect(currencyFor('GB')).toBe('gbp');
    expect(currencyFor('IE')).toBe('eur');
    expect(currencyFor(null)).toBe('usd');
  });
});
