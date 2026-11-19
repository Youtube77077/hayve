import { accountIdFor, balancesFor, createTransaction, SYSTEM, type TxView, viewTransaction } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { ID, MoneyRequest, PaymentMethod } from '../types';
import { audit, displayName, notify, publicUser, type PublicUser } from './common';
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
  return { accountId: acc, ...balancesFor(acc), currency: 'EUR' as const, simulated: true as const };
}

export function transactions(filter: { type?: 'all' | 'in' | 'out'; limit?: number } = {}): TxView[] {
  const user = me();
  const acc = accountIdFor(user.id);
  const db = getDb();
  const ids = new Set(db.entries.filter((e) => e.accountId === acc).map((e) => e.txId));
  let rows = db.transactions
    .filter((t) => ids.has(t.id))
    .map((t) => viewTransaction(t, acc))
    .filter((v): v is TxView => !!v)
    // Card pass-through funding is represented by the payment it funded.
    .filter((v) => !(v.type === 'deposit' && v.method === 'card' && v.counterparty.startsWith('Card payment')))
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
  assert(Number.isInteger(cents) && cents >= 100, 'invalid', 'Minimum amount is €1.00');
  assert(cents <= MAX_TRANSFER_CENTS, 'invalid', 'Maximum amount is €10,000.00');
}

export function addMoney(amountCents: number, source: 'card' | 'bank' = 'card') {
  const user = me();
  validAmount(amountCents);
  const tx = createTransaction({
    type: 'deposit',
    fromAccountId: source === 'card' ? SYSTEM.card : SYSTEM.bank,
    credits: [{ accountId: accountIdFor(user.id), amountCents }],
    labelForFrom: 'Wallet top-up',
    labelForTo: source === 'card' ? 'Top-up by card (simulated)' : 'Bank transfer (simulated)',
    method: source,
  });
  notify(user.id, 'payment', 'Money added', `€${(amountCents / 100).toFixed(2)} added to your Hayve Pay balance (simulated).`, `/pay/tx/${tx.id}`);
  commit();
  return tx.id;
}

export function withdraw(amountCents: number) {
  const user = me();
  validAmount(amountCents);
  const db = getDb();
  const bank = db.paymentMethods.find((m) => m.userId === user.id && m.kind === 'bank');
  assert(bank, 'invalid', 'Add a bank account in Payment methods first');
  const tx = createTransaction({
    type: 'withdrawal',
    fromAccountId: accountIdFor(user.id),
    credits: [{ accountId: SYSTEM.payouts, amountCents }],
    labelForFrom: `Withdrawal to ${bank.label}`,
    labelForTo: 'Payout',
    method: 'bank',
  });
  notify(user.id, 'payment', 'Withdrawal started', `€${(amountCents / 100).toFixed(2)} to ${bank.label} (simulated).`, `/pay/tx/${tx.id}`);
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
  notify(toUserId, 'payment', `You received €${(amountCents / 100).toFixed(2)}`, `${displayName(user.id)}${note ? ` · ${note}` : ''}`, `/pay/tx/${tx.id}`);
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
  notify(fromUserId, 'payment', 'Payment request', `${displayName(user.id)} requested €${(amountCents / 100).toFixed(2)}${note ? ` · ${note}` : ''}`, '/pay/requests');
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
      notify(r.requesterId, 'payment', 'Request declined', `${displayName(user.id)} declined your request for €${(r.amountCents / 100).toFixed(2)}`, '/pay/requests');
    }
  } else if (r.requesterId === user.id) {
    assert(!accept && r.status === 'pending', 'conflict', 'Only pending requests can be cancelled');
    r.status = 'cancelled';
  } else throw new HayveError('not_found', 'Request not found');
  commit();
}

export function paymentMethods(): PaymentMethod[] {
  const user = me();
  return getDb().paymentMethods.filter((m) => m.userId === user.id);
}

export function addPaymentMethod(input: { kind: 'card' | 'bank'; number: string; label?: string }) {
  const user = me();
  const digits = input.number.replace(/\s+/g, '');
  if (input.kind === 'card') assert(/^\d{12,19}$/.test(digits), 'invalid', 'Enter a valid card number (simulation: any 16 digits)');
  else assert(/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/i.test(digits), 'invalid', 'Enter a valid IBAN');
  const db = getDb();
  const last4 = digits.slice(-4);
  const brand = input.kind === 'card' ? (digits.startsWith('4') ? 'Visa' : digits.startsWith('5') ? 'Mastercard' : 'Card') : undefined;
  const pm: PaymentMethod = {
    id: uid('pm'),
    userId: user.id,
    kind: input.kind,
    label: input.kind === 'card' ? brand! : `${digits.slice(0, 4).toUpperCase()} •••• ${last4}`,
    brand,
    last4,
    isDefault: !db.paymentMethods.some((m) => m.userId === user.id),
  };
  db.paymentMethods.push(pm);
  commit();
  return pm.id;
}

export function deletePaymentMethod(id: ID) {
  const user = me();
  const db = getDb();
  find(db.paymentMethods, (m) => m.id === id && m.userId === user.id, 'Payment method');
  db.paymentMethods = db.paymentMethods.filter((m) => m.id !== id);
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
