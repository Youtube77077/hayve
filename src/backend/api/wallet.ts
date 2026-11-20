import { fmtMoney, getDisplayCurrency, region } from '../regions';
import { accountIdFor, balancesFor, createTransaction, SYSTEM, type TxView, viewTransaction } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { ID, MoneyRequest, PaymentMethod } from '../types';
import { audit, displayName, monthStart, notify, publicUser, payoutAccountOf, settings, type PublicUser } from './common';
import { me } from './session';

/**
 * Hayve Pay (simulated). All amounts are integers in euro cents.
 * Production: deposits/withdrawals/cards go through a licensed provider adapter
 * (see docs/PAYMENTS.md); the ledger stays the source of truth.
 */

export const MAX_TRANSFER_CENTS = 1_000_000; // €10,000 per transfer (simulation limit)

export function wallet() {
  const user = me();
  const acc = accountIdFor(user.id);
  return { accountId: acc, ...balancesFor(acc), currency: getDisplayCurrency(), simulated: true as const };
}

export function transactions(filter: { type?: 'all' | 'in' | 'out'; limit?: number } = {}): TxView[] {
  const user = me();
  const acc = accountIdFor(user.id);
  const db = getDb();
  const ids = new Set(db.entries.filter((e) => e.accountId === acc).map((e) => e.txId));
  const funding = new Set(db.transactions.map((t) => t.fundingTxId).filter(Boolean));
  let rows = db.transactions
    .filter((t) => ids.has(t.id))
    .map((t) => viewTransaction(t, acc))
    .filter((v): v is TxView => !!v)
    // Card and bank pass-through funding is represented by the payment it funded.
    .filter((v) => !funding.has(v.id) && !(v.type === 'deposit' && v.method === 'card' && v.counterparty.startsWith('Card payment')))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (filter.type === 'in') rows = rows.filter((r) => r.direction === 'in');
  if (filter.type === 'out') rows = rows.filter((r) => r.direction === 'out');
  return filter.limit ? rows.slice(0, filter.limit) : rows;
}

export function transaction(id: ID): TxView & { reference: string } {
  const user = me();
  const tx = find(getDb().transactions, (t) => t.id === id, 'Transaction');
  const view = viewTransaction(tx, accountIdFor(user.id));
  if (!view) throw new HayveError('not_found', 'Transaction not found');
  return { ...view, reference: `HP-${tx.id.slice(-8).toUpperCase()}` };
}

function validAmount(cents: number) {
  assert(Number.isInteger(cents) && cents >= 100, 'invalid', `Minimum amount is ${fmtMoney(100)}`);
  assert(cents <= MAX_TRANSFER_CENTS, 'invalid', `Maximum amount is ${fmtMoney(1000000)}`);
}

/**
 * Adds money to the Hayve Pay balance. The money is collected by the payment provider's checkout
 * (card, and whatever wallets the provider offers); Hayve only records the result in the ledger.
 * Simulated in this build: no card is charged.
 */
export function addMoney(amountCents: number, _source: 'card' = 'card') {
  const user = me();
  validAmount(amountCents);
  const tx = createTransaction({
    type: 'deposit',
    fromAccountId: SYSTEM.card,
    credits: [{ accountId: accountIdFor(user.id), amountCents }],
    labelForFrom: 'Wallet top-up',
    labelForTo: 'Top-up by card (simulated checkout)',
    method: 'card',
  });
  notify(user.id, 'payment', 'Money added', `${fmtMoney(amountCents)} added to your Hayve Pay balance (simulated).`, `/pay/tx/${tx.id}`);
  commit();
  return tx.id;
}

/** Top-ups stay in Hayve for this long before they can be withdrawn (protects against card fraud and chargebacks). */
export const TOPUP_HOLD_DAYS = 7;

/** What can be withdrawn now: the available balance minus recent card top-ups. */
export function withdrawable() {
  const user = me();
  const db = getDb();
  const acc = accountIdFor(user.id);
  const { available } = balancesFor(acc);
  const since = now() - TOPUP_HOLD_DAYS * 86_400_000;
  const recentTopUps = db.transactions.filter((t) => t.type === 'deposit' && t.toAccountId === acc && t.status === 'completed' && t.createdAt >= since && !db.transactions.some((x) => x.fundingTxId === t.id)).reduce((a, t) => a + t.amountCents, 0);
  return { availableCents: available, withdrawableCents: Math.max(0, available - recentTopUps), heldTopUpsCents: Math.min(available, recentTopUps), holdDays: TOPUP_HOLD_DAYS, payoutAccount: payoutAccountOf(user.id) };
}

/** Sends eligible balance to the person's payout account (paid out by the payment provider). */
export function withdraw(amountCents: number) {
  const user = me();
  validAmount(amountCents);
  const w = withdrawable();
  assert(w.payoutAccount, 'invalid', 'Add a payout account first');
  assert(amountCents <= w.withdrawableCents, 'insufficient_funds', w.heldTopUpsCents > 0 ? `You can withdraw up to ${fmtMoney(w.withdrawableCents)} now. Money you added in the last ${TOPUP_HOLD_DAYS} days can be spent in Hayve but not withdrawn yet.` : 'Not enough balance');
  const tx = createTransaction({
    type: 'withdrawal',
    fromAccountId: accountIdFor(user.id),
    credits: [{ accountId: SYSTEM.payouts, amountCents }],
    labelForFrom: `Withdrawal to ${w.payoutAccount!.label}`,
    labelForTo: 'Payout',
    method: 'bank',
  });
  notify(user.id, 'payment', 'Withdrawal started', `${fmtMoney(amountCents)} to ${w.payoutAccount!.label} (simulated).`, `/pay/tx/${tx.id}`);
  commit();
  return tx.id;
}

export function searchPeople(q: string): PublicUser[] {
  const user = me();
  const term = q.trim().toLowerCase().replace(/^@/, '');
  const db = getDb();
  return db.profiles
    .filter((p) => p.userId !== user.id && !db.users.find((u) => u.id === p.userId)?.deletedAt)
    .filter((p) => !term || p.username.includes(term) || p.displayName.toLowerCase().includes(term))
    // Private profiles are only found by exact username.
    .filter((p) => p.isPublic || p.username === term)
    .slice(0, 20)
    .map((p) => publicUser(p.userId));
}

export function recentContacts(): PublicUser[] {
  const user = me();
  const db = getDb();
  const acc = accountIdFor(user.id);
  const seen: ID[] = [];
  const p2p = db.transactions.filter((t) => t.type === 'p2p' && (t.fromAccountId === acc || t.toAccountId === acc)).sort((a, b) => b.createdAt - a.createdAt);
  for (const t of p2p) {
    const other = (t.fromAccountId === acc ? t.toAccountId : t.fromAccountId).replace(/^acc_/, '');
    if (!seen.includes(other)) seen.push(other);
  }
  for (const id of ['u_noor', 'u_lucas', 'u_eva', 'u_ines']) if (id !== user.id && !seen.includes(id) && db.users.some((u) => u.id === id)) seen.push(id);
  return seen.slice(0, 6).map(publicUser);
}

export function sendMoney(toUserId: ID, amountCents: number, note = '') {
  const user = me();
  validAmount(amountCents);
  assert(toUserId !== user.id, 'invalid', "You can't send money to yourself");
  const db = getDb();
  find(db.users, (u) => u.id === toUserId && !u.deletedAt, 'Recipient');
  const tx = createTransaction({
    type: 'p2p',
    fromAccountId: accountIdFor(user.id),
    credits: [{ accountId: accountIdFor(toUserId), amountCents }],
    labelForFrom: displayName(toUserId),
    labelForTo: displayName(user.id),
    note: note.trim().slice(0, 140) || undefined,
    method: 'wallet',
  });
  notify(toUserId, 'payment', `You received ${fmtMoney(amountCents)}`, `${displayName(user.id)}${note ? ` · ${note}` : ''}`, `/pay/tx/${tx.id}`);
  audit(user.id, 'p2p.send', tx.id);
  commit();
  return tx.id;
}

export function requestMoney(fromUserId: ID, amountCents: number, note = '') {
  const user = me();
  validAmount(amountCents);
  assert(fromUserId !== user.id, 'invalid', "You can't request money from yourself");
  const db = getDb();
  const req: MoneyRequest = { id: uid('mr'), requesterId: user.id, payerId: fromUserId, amountCents, note: note.trim().slice(0, 140), status: 'pending', createdAt: now() };
  db.moneyRequests.push(req);
  notify(fromUserId, 'payment', 'Payment request', `${displayName(user.id)} requested ${fmtMoney(amountCents)}${note ? ` · ${note}` : ''}`, '/pay/requests');
  commit();
  return req.id;
}

export interface RequestView {
  id: ID;
  direction: 'incoming' | 'outgoing';
  other: PublicUser;
  amountCents: number;
  note: string;
  status: MoneyRequest['status'];
  createdAt: number;
}

export function moneyRequests(): RequestView[] {
  const user = me();
  return getDb()
    .moneyRequests.filter((r) => r.requesterId === user.id || r.payerId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      direction: r.payerId === user.id ? 'incoming' : 'outgoing',
      other: publicUser(r.payerId === user.id ? r.requesterId : r.payerId),
      amountCents: r.amountCents,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
    }));
}

export function respondToRequest(id: ID, accept: boolean) {
  const user = me();
  const db = getDb();
  const r = find(db.moneyRequests, (x) => x.id === id, 'Request');
  if (r.payerId === user.id) {
    assert(r.status === 'pending', 'conflict', 'This request was already answered');
    if (accept) {
      sendMoney(r.requesterId, r.amountCents, r.note);
      r.status = 'paid';
    } else {
      r.status = 'declined';
      notify(r.requesterId, 'payment', 'Request declined', `${displayName(user.id)} declined your request for ${fmtMoney(r.amountCents)}`, '/pay/requests');
    }
  } else if (r.requesterId === user.id) {
    assert(!accept && r.status === 'pending', 'conflict', 'Only pending requests can be cancelled');
    r.status = 'cancelled';
  } else throw new HayveError('not_found', 'Request not found');
  commit();
}

/** The payout account used for withdrawals (one per person). */
export function payoutAccount() {
  return payoutAccountOf(me().id);
}

/**
 * Saves the payout account for withdrawals. In production the payment provider collects and
 * verifies these details (its hosted onboarding); Hayve stores only a label and the last 4 digits.
 */
export function setPayoutAccount(input: { holder: string; account: string; routing?: string }) {
  const user = me();
  const db = getDb();
  const reg = region(db.profiles.find((p) => p.userId === user.id)?.country);
  const acct = input.account.replace(/[\s-]+/g, '').toUpperCase();
  if (reg.account.label === 'IBAN') assert(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(acct), 'invalid', 'Enter a valid IBAN');
  else {
    assert(/^\d{4,17}$/.test(acct), 'invalid', `Enter a valid ${reg.account.label.toLowerCase()}`);
    assert(/^\d{5,9}$/.test((input.routing ?? '').replace(/[\s-]+/g, '')), 'invalid', `Enter a valid ${(reg.account.routingLabel ?? 'routing number').toLowerCase()}`);
  }
  assert(input.holder.trim().length >= 2, 'invalid', 'Enter the account holder name');
  db.paymentMethods = db.paymentMethods.filter((m) => !(m.userId === user.id && m.kind === 'bank'));
  const pm: PaymentMethod = { id: uid('pm'), userId: user.id, kind: 'bank', label: `Bank account •••• ${acct.slice(-4)}`, last4: acct.slice(-4), isDefault: true, createdAt: now() };
  db.paymentMethods.push(pm);
  audit(user.id, 'payout.set', acct.slice(-4));
  commit();
  return pm.id;
}

export function removePayoutAccount() {
  const user = me();
  const db = getDb();
  db.paymentMethods = db.paymentMethods.filter((m) => !(m.userId === user.id && m.kind === 'bank'));
  commit();
}

/** Spending summary for the wallet chart: last 7 days of outgoing amounts. */
export function weeklySpend() {
  const rows = transactions({ type: 'out' }).filter((t) => t.status !== 'failed' && t.status !== 'refunded');
  const days: { label: string; cents: number }[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(start.getTime() - i * 86_400_000);
    const next = d.getTime() + 86_400_000;
    const cents = rows.filter((r) => r.createdAt >= d.getTime() && r.createdAt < next && r.type !== 'withdrawal').reduce((s, r) => s + r.amountCents, 0);
    days.push({ label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), cents });
  }
  return days;
}

/** Wave Back earned by the signed-in user (this month, all time) and the limits that apply. */
export function waveBackSummary() {
  const user = me();
  const db = getDb();
  const acc = accountIdFor(user.id);
  const s = settings().waveBack;
  const mine = db.transactions.filter((t) => t.type === 'wave_back' && t.toAccountId === acc && t.status === 'completed');
  const start = monthStart();
  const thisMonthCents = mine.filter((t) => t.createdAt >= start).reduce((a, t) => a + t.amountCents, 0);
  const totalCents = mine.reduce((a, t) => a + t.amountCents, 0);
  const welcomeEnds = user.createdAt + s.newUserDays * 86_400_000;
  const welcomePaid = mine.filter((t) => t.meta?.newUser).reduce((a, t) => a + t.amountCents, 0);
  return {
    thisMonthCents,
    totalCents,
    monthlyMaxCents: s.monthlyMaxCents,
    welcomeActive: now() < welcomeEnds && welcomePaid < s.newUserMaxTotalCents,
    welcomeEndsAt: welcomeEnds,
    welcomeLeftCents: Math.max(0, s.newUserMaxTotalCents - welcomePaid),
  };
}
