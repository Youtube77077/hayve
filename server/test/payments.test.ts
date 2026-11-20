import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decideAuthorization, verifyStripeSignature } from '../src/payments.js';

const card = { status: 'active' as const, limits: { dailyCents: 10000, monthlyCents: 50000 }, blocks: { online: false, contactless: false, gambling: true }, autoTopUp: { enabled: true, amountCents: 5000 } };
const base = { card, amountCents: 1240, mcc: '5411', channel: 'contactless' as const, spentTodayCents: 0, spentMonthCents: 0, balanceCents: 2000, bankLinked: true };

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

describe('Hayve Card authorisations', () => {
  it('approves from the balance', () => expect(decideAuthorization(base)).toEqual({ approved: true, reason: 'ok', topUpCents: 0 }));
  it('tops up in batches when the balance is short', () => expect(decideAuthorization({ ...base, amountCents: 9000 }).topUpCents).toBe(10000));
  it('declines frozen cards, blocked channels, gambling and limits', () => {
    expect(decideAuthorization({ ...base, card: { ...card, status: 'frozen' } }).reason).toBe('card_inactive');
    expect(decideAuthorization({ ...base, channel: 'online', card: { ...card, blocks: { ...card.blocks, online: true } } }).reason).toBe('online_blocked');
    expect(decideAuthorization({ ...base, mcc: '7995' }).reason).toBe('gambling_blocked');
    expect(decideAuthorization({ ...base, spentTodayCents: 9500 }).reason).toBe('daily_limit');
    expect(decideAuthorization({ ...base, amountCents: 9000, bankLinked: false }).reason).toBe('insufficient_funds');
  });
});
