import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { type Config, paymentsConfigured } from './config.js';
import { asSystem, type Db } from './db.js';
import { ApiError, bad, notFound } from './errors.js';

/**
 * Hayve Pay is an internal wallet. Real money moves only through the payment provider (Stripe):
 *  - Top-ups: a hosted Checkout Session collects the card; the signed webhook records the deposit
 *    in the ledger (once, keyed by the provider reference).
 *  - Payment request links: a card PaymentIntent for people without a Hayve account; the signed
 *    webhook records the payment against the request.
 *  - Payouts (withdrawals) go through the provider's payouts product to the person's verified
 *    account (Stripe Connect or a licensed wallet partner); see docs/PAYMENTS.md.
 * Hayve never sees or stores card numbers. Holding customer balances needs a licensed partner or
 * licence (e-money / money transmission); this module is where that partner connects.
 * All keys come from environment variables.
 */

const STRIPE = 'https://api.stripe.com/v1';

/** Currency per country (mirrors src/backend/regions.ts). */
const CURRENCY: Record<string, string> = { US: 'usd', CA: 'cad', GB: 'gbp', AU: 'aud', NL: 'eur', BE: 'eur', IE: 'eur', DE: 'eur', FR: 'eur', ES: 'eur', IT: 'eur', PT: 'eur' };
export const currencyFor = (country?: string | null) => CURRENCY[country ?? 'US'] ?? 'usd';

function form(obj: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p;
}

export async function stripe<T>(c: Config, method: 'GET' | 'POST', path: string, body?: Record<string, string | number | boolean | undefined>, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders },
    body: body ? form(body) : undefined,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new ApiError(502, 'provider_error', json.error?.message ?? 'Payment provider error');
  return json;
}

/** Verifies a Stripe-Signature header (v1 = HMAC-SHA256 of "t.payload"), with a 5-minute tolerance. */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

/* ------------------------------------------------------- card decisions -- */

export interface CardState {
  status: 'active' | 'frozen' | 'replaced';
  limits: { dailyCents: number; monthlyCents: number };
  blocks: { online: boolean; contactless: boolean; gambling: boolean };
  autoTopUp: { enabled: boolean; amountCents: number };
}

const GAMBLING_MCC = ['7995', '7800', '7801', '7802'];

/**
 * Approve or decline a Hayve Card authorisation. Balance first; if short and auto top-up is on with
 * a linked bank, top up in batches (returned as `topUpCents`).
 */
export function paymentRoutes(app: FastifyInstance, db: Db, c: Config) {
  const need = () => {
    if (!paymentsConfigured(c)) throw new ApiError(503, 'payments_unavailable', 'Payments are not configured');
  };

  /** Add money: a hosted checkout for the amount. The balance changes only after the webhook. */
  app.post('/wallet/topup', async (req) => {
    const userId = requireUser(req);
    need();
    const body = z.object({ amountCents: z.number().int().min(100).max(1_000_000) }).parse(req.body);
    const country = (await db.query('select country from public.profiles where id = $1', [userId])).rows[0]?.country;
    const origin = c.APP_ORIGINS.split(',')[0];
    const session = await stripe<{ id: string; url: string }>(c, 'POST', '/checkout/sessions', {
      mode: 'payment',
      'line_items[0][price_data][currency]': currencyFor(country),
      'line_items[0][price_data][unit_amount]': body.amountCents,
      'line_items[0][price_data][product_data][name]': 'Hayve Pay balance',
      'line_items[0][quantity]': 1,
      'metadata[topup_user]': userId,
      success_url: `${origin}/pay?topup=done`,
      cancel_url: `${origin}/pay/add`,
    });
    return { checkoutUrl: session.url, sessionId: session.id };
  });

  /**
   * Payment request links: anyone with the link can pay, with or without a Hayve account.
   * Creates a card PaymentIntent in the requester's currency. The provider's own checkout collects
   * the card (and may offer the wallets it supports); Hayve never sees card details.
   * Deposits are authorised only (manual capture) until the requester releases or claims them.
   * Business requests carry the small Hayve fee as the application fee; the payer never pays extra.
   */
  app.post('/requests/:id/checkout', async (req) => {
    need();
    const { id } = z.object({ id: z.string().min(16).max(64) }).parse(req.params);
    const body = z.object({ payerName: z.string().trim().max(60).optional() }).parse(req.body ?? {});
    const r = (await db.query('select * from public.pay_request_public($1)', [id])).rows[0];
    if (!r) throw notFound('Payment request not found');
    if (r.status !== 'pending') throw bad(r.status === 'expired' ? 'This payment link has expired' : r.status === 'paid' ? 'This request has already been paid' : 'This request was cancelled');
    const full = (await db.query('select r.requester_id, r.kind, r.currency, p.country from public.pay_requests r join public.profiles p on p.id = r.requester_id where r.id = $1', [id])).rows[0];
    if (req.actor.userId && req.actor.userId === full.requester_id) throw bad("You can't pay your own request");
    const fee = full.kind === 'business' ? (await db.query('select public.request_business_fee($1) f', [r.amount_cents])).rows[0].f : 0;
    const pi = await stripe<{ id: string; client_secret: string }>(c, 'POST', '/payment_intents', {
      amount: r.amount_cents,
      currency: (full.currency ?? currencyFor(full.country)).toLowerCase(),
      'payment_method_types[]': 'card',
      capture_method: full.kind === 'deposit' ? 'manual' : 'automatic',
      application_fee_amount: fee || undefined,
      description: r.title,
      'metadata[request_id]': id,
      'metadata[payer_name]': body.payerName || 'Guest',
      'metadata[payer_id]': req.actor.userId ?? undefined,
      'metadata[fee_cents]': fee,
    });
    return { paymentIntent: pi.id, clientSecret: pi.client_secret };
  });

  /** Signed webhooks from the provider: the only path that records real money in the ledger. */
  app.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, reply) => {
    need();
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'] as string | undefined, c.STRIPE_WEBHOOK_SECRET!)) return reply.status(400).send({ error: 'invalid_signature' });
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const o = event.data.object;
    if (event.type === 'checkout.session.completed' && o.metadata?.topup_user && o.payment_status === 'paid') {
      // Top-up: card system account → the person's wallet, recorded once per provider reference.
      await asSystem(db, async (tx) => {
        const acc = (await tx.query('select id from public.ledger_accounts where owner_id = $1', [o.metadata.topup_user])).rows[0]?.id;
        const card = (await tx.query("select id from public.ledger_accounts where code = 'card'")).rows[0]?.id;
        if (!acc || !card) return;
        const t = await tx.query(
          "insert into public.transactions (type, status, amount_cents, from_account, to_account, label_for_from, label_for_to, method, simulated, provider_ref) values ('deposit', 'completed', $1, $2, $3, 'Wallet top-up', 'Top-up by card', 'card', false, $4) on conflict (provider_ref) do nothing returning id",
          [o.amount_total, card, acc, o.id],
        );
        if (!t.rowCount) return;
        await tx.query("insert into public.ledger_entries (tx_id, account_id, amount_cents, status) values ($1, $2, $3, 'posted'), ($1, $4, $5, 'posted')", [t.rows[0].id, card, -o.amount_total, acc, o.amount_total]);
      });
    } else if ((event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.amount_capturable_updated') && o.metadata?.request_id) {
      const m = o.metadata;
      const card = o.latest_charge?.payment_method_details?.card ?? {};
      const label = `${card.brand ?? 'Card'} •••• ${card.last4 ?? ''}`.trim();
      const held = event.type === 'payment_intent.amount_capturable_updated';
      await asSystem(db, (tx) =>
        tx.query(
          'insert into public.pay_request_payments (request_id, payer_id, payer_name, method, method_label, amount_cents, fee_cents, status, provider_ref) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (provider_ref) do nothing',
          [m.request_id, m.payer_id || null, m.payer_name || 'Guest', 'card', label, o.amount, Number(m.fee_cents ?? 0), held ? 'held' : 'paid', o.id],
        ),
      );
    }
    return { received: true };
  });
}
