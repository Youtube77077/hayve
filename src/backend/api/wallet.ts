import { fmtMoney, getDisplayCurrency, region } from '../regions';
import { accountIdFor, balancesFor, createTransaction, SYSTEM, type TxView, viewTransaction } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { ID, MoneyRequest, PaymentMethod } from '../types';
import { audit, displayName, monthStart, notify, publicUser, savedMethodsOf, settings, type PublicUser } from './common';
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

export function addMoney(amountCents: number, source: 'card' | 'bank' = 'card') {
  const user = me();
  validAmount(amountCents);
  const saved = savedMethodsOf(user.id);
  assert(source === 'card' ? saved.card : saved.bank, 'invalid', source === 'card' ? 'Add a debit or credit card first' : 'Connect a bank first');
  const tx = createTransaction({
    type: 'deposit',
    fromAccountId: source === 'card' ? SYSTEM.card : SYSTEM.bank,
    credits: [{ accountId: accountIdFor(user.id), amountCents }],
    labelForFrom: 'Wallet top-up',
    labelForTo: source === 'card' ? `Top-up · ${saved.card!.brand} •••• ${saved.card!.last4} (simulated)` : `Top-up · ${saved.bank!.label} (simulated)`,
    method: source,
  });
  notify(user.id, 'payment', 'Money added', `${fmtMoney(amountCents)} added to your Hayve Pay balance (simulated).`, `/pay/tx/${tx.id}`);
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
  notify(user.id, 'payment', 'Withdrawal started', `${fmtMoney(amountCents)} to ${bank.label} (simulated).`, `/pay/tx/${tx.id}`);
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

export function paymentMethods(): PaymentMethod[] {
  const user = me();
  return getDb().paymentMethods.filter((m) => m.userId === user.id);
}

/**
 * Saves a debit or credit card. The card number is entered in the payment partner's secure form
 * (Stripe in production) and never reaches Hayve: only brand, last four, expiry and funding type.
 */
export function addCard(input: { brand: string; last4: string; expiry: string; funding: 'debit' | 'credit' }) {
  const user = me();
  assert(/^\d{4}$/.test(input.last4), 'invalid', 'Enter a valid card number');
  assert(/^(0[1-9]|1[0-2])\/\d{2}$/.test(input.expiry), 'invalid', 'Enter the expiry date as MM/YY');
  const [mm, yy] = input.expiry.split('/').map(Number);
  const end = new Date(2000 + yy, mm, 1).getTime();
  assert(end > now(), 'invalid', 'This card has expired');
  assert(['Visa', 'Mastercard', 'Maestro', 'American Express', 'Card'].includes(input.brand), 'invalid', 'This card type is not supported');
  const db = getDb();
  const mine = db.paymentMethods.filter((m) => m.userId === user.id && m.kind === 'card');
  assert(!mine.some((m) => m.last4 === input.last4 && m.brand === input.brand), 'conflict', 'This card is already saved');
  assert(mine.length < 5, 'invalid', 'You can save up to 5 cards');
  const pm: PaymentMethod = { id: uid('pm'), userId: user.id, kind: 'card', label: input.brand, brand: input.brand, last4: input.last4, expiry: input.expiry, funding: input.funding, isDefault: mine.length === 0, createdAt: now() };
  db.paymentMethods.push(pm);
  audit(user.id, 'card.add', input.last4);
  commit();
  return pm.id;
}

/**
 * Connects a bank account for payments, top-ups and withdrawals, using the person's local rail:
 * US: ACH (log in to the bank, or routing + account number) · UK: pay by bank / Direct Debit ·
 * Euro area: pay by bank or SEPA mandate (iDEAL | Wero in the Netherlands, Wero in DE/FR/BE) ·
 * Canada: pre-authorized debit · Australia: PayTo.
 * "instant": the person approves in their bank app and the bank shares the account (simulated).
 * "manual": they type their account details and sign a mandate.
 * The connected bank also funds Hayve Card automatic top-ups.
 */
export function connectBank(input: { connection: 'instant' | 'manual'; bank?: string; holder?: string; account?: string; routing?: string; country?: string }) {
  const user = me();
  const db = getDb();
  const profile = db.profiles.find((p) => p.userId === user.id);
  const reg = region(input.country ?? profile?.country);
  let last4: string;
  let bank: string;
  if (input.connection === 'instant') {
    assert(input.bank && reg.banks.includes(input.bank), 'invalid', 'Choose your bank');
    bank = input.bank;
    // The bank returns the account after approval (simulated, stable per user).
    last4 = String(Math.abs([...user.id + bank].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 10000).padStart(4, '0');
  } else {
    const acct = (input.account ?? '').replace(/[\s-]+/g, '').toUpperCase();
    if (reg.account.label === 'IBAN') assert(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(acct), 'invalid', 'Enter a valid IBAN');
    else {
      assert(/^\d{4,17}$/.test(acct), 'invalid', `Enter a valid ${reg.account.label.toLowerCase()}`);
      const routing = (input.routing ?? '').replace(/[\s-]+/g, '');
      assert(/^\d{5,9}$/.test(routing), 'invalid', `Enter a valid ${(reg.account.routingLabel ?? 'routing number').toLowerCase()}`);
    }
    last4 = acct.slice(-4);
    bank = input.bank && reg.banks.includes(input.bank) ? input.bank : 'Bank account';
  }
  const holder = (input.holder ?? '').trim() || displayName(user.id);
  db.paymentMethods = db.paymentMethods.filter((m) => !(m.userId === user.id && m.kind === 'bank'));
  const pm: PaymentMethod = { id: uid('pm'), userId: user.id, kind: 'bank', label: `${bank} •••• ${last4}`, bank, last4, connection: input.connection, rail: reg.bankRail, isDefault: false, createdAt: now() };
  db.paymentMethods.push(pm);
  // Same account funds Hayve Card top-ups.
  db.linkedBanks = db.linkedBanks.filter((b) => b.userId !== user.id);
  db.linkedBanks.push({ userId: user.id, holder, ibanLast4: last4, bank, method: input.connection, rail: reg.bankRail, mandateRef: `HAYVE-${uid('m').slice(-8).toUpperCase()}`, linkedAt: now() });
  audit(user.id, 'bank.connect', last4);
  commit();
  return pm.id;
}

export function setDefaultCard(id: ID) {
  const user = me();
  const db = getDb();
  find(db.paymentMethods, (m) => m.id === id && m.userId === user.id && m.kind === 'card', 'Card');
  for (const m of db.paymentMethods) if (m.userId === user.id && m.kind === 'card') m.isDefault = m.id === id;
  commit();
}

export function deletePaymentMethod(id: ID) {
  const user = me();
  const db = getDb();
  const m = find(db.paymentMethods, (x) => x.id === id && x.userId === user.id, 'Payment method');
  db.paymentMethods = db.paymentMethods.filter((x) => x.id !== id);
  if (m.kind === 'bank') db.linkedBanks = db.linkedBanks.filter((b) => b.userId !== user.id);
  if (m.isDefault && m.kind === 'card') {
    const next = db.paymentMethods.find((x) => x.userId === user.id && x.kind === 'card');
    if (next) next.isDefault = true;
  }
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
