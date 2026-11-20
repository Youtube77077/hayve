import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { type Config, paymentsConfigured } from './config.js';
import { asSystem, asUser, type Db } from './db.js';
import { ApiError, bad, forbidden, notFound } from './errors.js';

/**
 * Payment partner connection (Stripe). Hayve never sees or stores card numbers:
 *  - Tap to Pay: Stripe Terminal "Tap to Pay on iPhone/Android". The app gets a connection token,
 *    the API creates a card_present PaymentIntent with the receiver fee as application fee, and only
 *    the signed webhook (payment_intent.succeeded) marks the payment as paid.
 *  - Hayve Card: Stripe Issuing (virtual + physical Visa). Card details are shown with an ephemeral
 *    key through Stripe's secure elements; authorisations are approved by `decideAuthorization`.
 * Balances and card issuing need an e-money licence or a licensed partner (EMI); this module is
 * the seam where that partner connects. All keys come from environment variables.
 */

const STRIPE = 'https://api.stripe.com/v1';

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
export function decideAuthorization(input: { card: CardState; amountCents: number; mcc: string; channel: 'online' | 'contactless' | 'chip'; spentTodayCents: number; spentMonthCents: number; balanceCents: number; bankLinked: boolean }) {
  const { card, amountCents } = input;
  const no = (reason: string) => ({ approved: false as const, reason, topUpCents: 0 });
  if (card.status !== 'active') return no('card_inactive');
  if (input.channel === 'online' && card.blocks.online) return no('online_blocked');
  if (input.channel === 'contactless' && card.blocks.contactless) return no('contactless_blocked');
  if (card.blocks.gambling && GAMBLING_MCC.includes(input.mcc)) return no('gambling_blocked');
  if (input.spentTodayCents + amountCents > card.limits.dailyCents) return no('daily_limit');
  if (input.spentMonthCents + amountCents > card.limits.monthlyCents) return no('monthly_limit');
  if (input.balanceCents >= amountCents) return { approved: true as const, reason: 'ok', topUpCents: 0 };
  if (!card.autoTopUp.enabled || !input.bankLinked) return no('insufficient_funds');
  const batches = Math.ceil((amountCents - input.balanceCents) / card.autoTopUp.amountCents);
  return { approved: true as const, reason: 'auto_top_up', topUpCents: batches * card.autoTopUp.amountCents };
}

/** Live balance and card spending from the ledger (for authorisations). */
async function cardTotals(db: Db, userId: string) {
  const acc = (await db.query('select id from public.ledger_accounts where owner_id = $1', [userId])).rows[0]?.id;
  if (!acc) return { balanceCents: 0, spentTodayCents: 0, spentMonthCents: 0 };
  const bal = (await db.query('select available_cents from public.wallet_balances($1)', [acc])).rows[0];
  const spent = (
    await db.query(
      "select coalesce(sum(amount_cents) filter (where created_at >= date_trunc('day', now())), 0) d, coalesce(sum(amount_cents) filter (where created_at >= date_trunc('month', now())), 0) m from public.transactions where from_account = $1 and type = 'card_purchase' and status = 'completed'",
      [acc],
    )
  ).rows[0];
  return { balanceCents: Number(bal?.available_cents ?? 0), spentTodayCents: Number(spent.d), spentMonthCents: Number(spent.m) };
}

/* --------------------------------------------------------------- routes -- */

export function paymentRoutes(app: FastifyInstance, db: Db, c: Config) {
  const need = () => {
    if (!paymentsConfigured(c)) throw new ApiError(503, 'payments_unavailable', 'Payments are not configured');
  };
  const requireVerified = async (userId: string) => {
    const r = await db.query('select kyc_status from public.profiles where id = $1', [userId]);
    if (r.rows[0]?.kyc_status !== 'verified') throw forbidden('Verify your identity first');
  };

  /** Stripe Terminal connection token for the Tap to Pay SDK. */
  app.post('/tap/connection-token', async (req) => {
    const id = requireUser(req);
    need();
    await requireVerified(id);
    const t = await stripe<{ secret: string }>(c, 'POST', '/terminal/connection_tokens', { location: c.STRIPE_TERMINAL_LOCATION });
    return { secret: t.secret, location: c.STRIPE_TERMINAL_LOCATION ?? null };
  });

  /** Creates the charge (waiting for a tap) and its card_present PaymentIntent. */
  app.post('/tap/charges', async (req) => {
    const id = requireUser(req);
    need();
    await requireVerified(id);
    const body = z.object({ amountCents: z.number().int().min(50), note: z.string().max(80).default('') }).parse(req.body);
    const settings = (await db.query('select tap_to_pay from public.app_settings limit 1')).rows[0]?.tap_to_pay ?? {};
    if (body.amountCents > (settings.maxPaymentCents ?? 50000)) throw bad('Amount is above the maximum for one payment');
    const business = (await db.query("select 1 from public.businesses where owner_id = $1 and status = 'verified'", [id])).rowCount;
    if (!business) {
      const month = await db.query("select coalesce(sum(amount_cents), 0) n from public.tap_payments where receiver_id = $1 and status in ('pending', 'available') and paid_at >= date_trunc('month', now())", [id]);
      if (Number(month.rows[0].n) + body.amountCents > (settings.privateMonthlyLimitCents ?? 250000)) throw forbidden('Over the monthly limit for personal accounts. Switch to a business account to receive more.');
    }
    const row = await asUser(db, req.actor, async (tx) => (await tx.query('insert into public.tap_payments (receiver_id, amount_cents, fee_cents, note) values ($1, $2, public.tap_receiver_fee($2), $3) returning id, fee_cents', [id, body.amountCents, body.note])).rows[0]);
    const pi = await stripe<{ id: string; client_secret: string }>(c, 'POST', '/payment_intents', {
      amount: body.amountCents,
      currency: 'eur',
      'payment_method_types[]': 'card_present',
      capture_method: 'automatic',
      'metadata[tap_id]': row.id,
      'metadata[receiver_id]': id,
      description: body.note || 'Hayve Tap to Pay',
    });
    await asSystem(db, (tx) => tx.query('update public.tap_payments set provider_ref = $2 where id = $1', [row.id, pi.id]));
    return { id: row.id, feeCents: row.fee_cents, paymentIntent: pi.id, clientSecret: pi.client_secret };
  });

  app.post('/tap/charges/:id/refund', async (req) => {
    const userId = requireUser(req);
    need();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const t = (await db.query("select provider_ref, status, paid_at, receiver_id from public.tap_payments where id = $1", [id])).rows[0];
    if (!t || t.receiver_id !== userId) throw notFound('Payment not found');
    const settings = (await db.query('select tap_to_pay from public.app_settings limit 1')).rows[0]?.tap_to_pay ?? {};
    const days = settings.refundWindowDays ?? 30;
    if (!['pending', 'available'].includes(t.status) || Date.now() - new Date(t.paid_at).getTime() > days * 86_400_000) throw bad(`Refunds are possible within ${days} days of the payment`);
    // The refund is final only when the provider confirms it (charge.refunded webhook).
    await stripe(c, 'POST', '/refunds', { payment_intent: t.provider_ref, 'metadata[tap_id]': id });
    return { ok: true };
  });

  /** Hayve Card: show details via the issuer's secure elements (ephemeral key), never through Hayve. */
  app.post('/card/ephemeral-key', async (req) => {
    const userId = requireUser(req);
    need();
    const { nonce } = z.object({ nonce: z.string().min(8) }).parse(req.body);
    const card = (await db.query("select issuer_ref from public.cards where user_id = $1 and status <> 'replaced'", [userId])).rows[0];
    if (!card) throw notFound('No card');
    const key = await stripe<{ secret: string }>(c, 'POST', '/ephemeral_keys', { issuing_card: card.issuer_ref, nonce }, { 'Stripe-Version': '2024-06-20' });
    return { secret: key.secret, card: card.issuer_ref };
  });

  app.post('/card/freeze', async (req) => {
    const userId = requireUser(req);
    need();
    const { frozen } = z.object({ frozen: z.boolean() }).parse(req.body);
    const card = (await db.query("select id, issuer_ref from public.cards where user_id = $1 and status <> 'replaced'", [userId])).rows[0];
    if (!card) throw notFound('No card');
    await stripe(c, 'POST', `/issuing/cards/${card.issuer_ref}`, { status: frozen ? 'inactive' : 'active' });
    await asUser(db, req.actor, (tx) => tx.query('update public.cards set status = $2 where id = $1', [card.id, frozen ? 'frozen' : 'active']));
    return { ok: true };
  });

  /** Signed webhooks from the provider: the only path that marks payments paid or refunded. */
  app.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, reply) => {
    need();
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'] as string | undefined, c.STRIPE_WEBHOOK_SECRET!)) return reply.status(400).send({ error: 'invalid_signature' });
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const o = event.data.object;
    if (event.type === 'payment_intent.succeeded' && o.metadata?.tap_id) {
      const card = o.charges?.data?.[0]?.payment_method_details?.card_present ?? o.latest_charge?.payment_method_details?.card_present ?? {};
      await asSystem(db, (tx) =>
        tx.query("update public.tap_payments set status = 'pending', paid_at = now(), settle_at = now() + interval '2 days', card_brand = $2, last4 = $3, payer_method = 'card', wave_back_claimable = true where id = $1 and status = 'awaiting_tap'", [o.metadata.tap_id, card.brand ?? null, card.last4 ?? null]),
      );
    } else if (event.type === 'charge.refunded' && o.metadata?.tap_id) {
      await asSystem(db, (tx) => tx.query("update public.tap_payments set status = 'refunded', refunded_at = now() where id = $1", [o.metadata.tap_id]));
    } else if (event.type === 'payment_intent.payment_failed' && o.metadata?.tap_id) {
      await asSystem(db, (tx) => tx.query("update public.tap_payments set status = 'failed', failure_reason = $2 where id = $1 and status = 'awaiting_tap'", [o.metadata.tap_id, o.last_payment_error?.message ?? 'declined']));
    } else if (event.type === 'issuing_authorization.request') {
      // Real-time authorisation: respond with approved true/false within 2 seconds.
      const card = (await db.query('select c.*, u.id user_id from public.cards c join auth.users u on u.id = c.user_id where c.issuer_ref = $1', [o.card?.id])).rows[0];
      if (!card) return { approved: false };
      const decision = decideAuthorization({
        card: { status: card.status, limits: card.limits, blocks: card.blocks, autoTopUp: card.auto_top_up },
        amountCents: o.pending_request?.amount ?? o.amount ?? 0,
        mcc: o.merchant_data?.category_code ?? '',
        channel: o.authorization_method === 'online' ? 'online' : o.authorization_method === 'contactless' ? 'contactless' : 'chip',
        ...(await cardTotals(db, card.user_id)),
        bankLinked: !!(await db.query('select 1 from public.linked_banks where user_id = $1', [card.user_id])).rowCount,
      });
      return reply.header('Stripe-Version', '2024-06-20').send({ approved: decision.approved, metadata: { reason: decision.reason } });
    }
    return { received: true };
  });
}
