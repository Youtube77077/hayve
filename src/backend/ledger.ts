import { assert, getDb, HayveError, now, uid } from './store';
import type { Account, Cents, EntryStatus, ID, LedgerEntry, Transaction, TxStatus, TxType } from './types';

/**
 * Hayve Pay ledger (simulated money).
 *
 * Balances are NEVER stored. They are derived from immutable ledger entries:
 *   available = Σ posted + Σ held   (held entries are negative)
 *   pending   = Σ pending           (incoming funds not yet released)
 *   reserved  = −Σ held
 *
 * Every money movement is a Transaction with one debit entry and one or more
 * credit entries that sum to zero. External money (bank, card network) enters
 * through system accounts so the books always balance.
 */

export const SYSTEM = {
  bank: 'acc_sys_bank', // simulated bank rail (deposits / withdrawals)
  card: 'acc_sys_card', // simulated card network
  fees: 'acc_sys_fees', // Hayve revenue: fees, shipping, delivery fees
  payouts: 'acc_sys_payouts', // simulated payout rail
} as const;

const SYSTEM_IDS = new Set<string>(Object.values(SYSTEM));

export function systemAccounts(): Account[] {
  return [
    { id: SYSTEM.bank, ownerId: null, kind: 'system', label: 'Bank transfer (simulated)' },
    { id: SYSTEM.card, ownerId: null, kind: 'system', label: 'Card (simulated)' },
    { id: SYSTEM.fees, ownerId: null, kind: 'system', label: 'Hayve' },
    { id: SYSTEM.payouts, ownerId: null, kind: 'system', label: 'Payout (simulated)' },
  ];
}

export function accountIdFor(userId: ID) {
  return `acc_${userId}`;
}

export function ensureAccount(userId: ID): ID {
  const db = getDb();
  const id = accountIdFor(userId);
  if (!db.accounts.some((a) => a.id === id)) {
    db.accounts.push({ id, ownerId: userId, kind: 'user', label: 'Hayve Pay wallet' });
  }
  return id;
}

export interface Balances {
  available: Cents;
  pending: Cents;
  reserved: Cents;
}

export function balancesFor(accountId: ID): Balances {
  const db = getDb();
  let posted = 0;
  let pending = 0;
  let held = 0;
  for (const e of db.entries) {
    if (e.accountId !== accountId) continue;
    if (e.status === 'posted') posted += e.amountCents;
    else if (e.status === 'pending') pending += e.amountCents;
    else if (e.status === 'held') held += e.amountCents;
  }
  return { available: posted + held, pending, reserved: -held };
}

export interface Credit {
  accountId: ID;
  amountCents: Cents;
  /** 'posted' = instantly available, 'pending' = released later (escrow). */
  status?: 'posted' | 'pending';
}

export interface TxInput {
  type: TxType;
  fromAccountId: ID;
  credits: Credit[];
  labelForFrom: string;
  labelForTo: string;
  note?: string;
  ref?: { kind: string; id: ID };
  method: Transaction['method'];
  /** 'capture' moves money now, 'hold' only reserves it from the payer. */
  mode?: 'capture' | 'hold';
}

function addEntry(txId: ID, accountId: ID, amountCents: Cents, status: EntryStatus): LedgerEntry {
  const entry: LedgerEntry = { id: uid('ent'), txId, accountId, amountCents, status, createdAt: now() };
  getDb().entries.push(entry);
  return entry;
}

export function createTransaction(input: TxInput): Transaction {
  const db = getDb();
  const total = input.credits.reduce((s, c) => s + c.amountCents, 0);
  assert(Number.isInteger(total) && total > 0, 'invalid', 'Amount must be greater than zero');
  assert(
    input.credits.every((c) => c.amountCents >= 0 && Number.isInteger(c.amountCents)),
    'invalid',
    'Invalid split',
  );
  assert(
    !input.credits.some((c) => c.accountId === input.fromAccountId),
    'invalid',
    'You cannot pay yourself',
  );

  // External rails (simulated card / bank) have unlimited funds; wallets must cover the amount.
  if (!SYSTEM_IDS.has(input.fromAccountId)) {
    const { available } = balancesFor(input.fromAccountId);
    if (available < total) {
      throw new HayveError('insufficient_funds', 'Not enough Hayve Pay balance. Add money or pay by card.');
    }
  }

  const mode = input.mode ?? 'capture';
  const anyPending = input.credits.some((c) => c.status === 'pending');
  const status: TxStatus = mode === 'hold' ? 'reserved' : anyPending ? 'pending' : 'completed';
  const tx: Transaction = {
    id: uid('tx'),
    type: input.type,
    status,
    amountCents: total,
    fromAccountId: input.fromAccountId,
    toAccountId: input.credits[0].accountId,
    labelForFrom: input.labelForFrom,
    labelForTo: input.labelForTo,
    note: input.note,
    ref: input.ref,
    method: input.method,
    simulated: true,
    createdAt: now(),
  };
  db.transactions.push(tx);

  if (mode === 'hold') {
    addEntry(tx.id, input.fromAccountId, -total, 'held');
    // Credits are recorded as voided until captured, preserving the split.
    for (const c of input.credits) if (c.amountCents > 0) addEntry(tx.id, c.accountId, c.amountCents, 'voided');
  } else {
    addEntry(tx.id, input.fromAccountId, -total, 'posted');
    for (const c of input.credits) if (c.amountCents > 0) addEntry(tx.id, c.accountId, c.amountCents, c.status ?? 'posted');
  }
  return tx;
}

function txOrThrow(txId: ID) {
  const tx = getDb().transactions.find((t) => t.id === txId);
  if (!tx) throw new HayveError('not_found', 'Transaction not found');
  return tx;
}

/** Converts a hold into a real payment. */
export function captureHold(txId: ID, creditStatus: 'posted' | 'pending' = 'posted') {
  const db = getDb();
  const tx = txOrThrow(txId);
  assert(tx.status === 'reserved', 'conflict', 'Payment is not on hold');
  for (const e of db.entries) {
    if (e.txId !== txId) continue;
    if (e.accountId === tx.fromAccountId && e.status === 'held') e.status = 'posted';
    else if (e.status === 'voided' && e.amountCents > 0) e.status = creditStatus;
  }
  tx.status = creditStatus === 'pending' ? 'pending' : 'completed';
  return tx;
}

/** Cancels a hold, returning reserved funds to the payer. */
export function voidHold(txId: ID) {
  const db = getDb();
  const tx = txOrThrow(txId);
  if (tx.status !== 'reserved') return tx;
  for (const e of db.entries) if (e.txId === txId) e.status = 'voided';
  tx.status = 'failed';
  return tx;
}

/** Releases escrowed (pending) credits so they become available. */
export function releaseTransaction(txId: ID) {
  const db = getDb();
  const tx = txOrThrow(txId);
  for (const e of db.entries) if (e.txId === txId && e.status === 'pending') e.status = 'posted';
  if (tx.status === 'pending') tx.status = 'completed';
  return tx;
}

/** Fully reverses a captured transaction. */
export function refundTransaction(txId: ID, reason = 'Refund') {
  const db = getDb();
  const tx = txOrThrow(txId);
  assert(tx.status === 'completed' || tx.status === 'pending', 'conflict', 'This payment cannot be refunded');
  const entries = db.entries.filter((e) => e.txId === txId && (e.status === 'posted' || e.status === 'pending'));
  for (const e of entries) {
    if (e.status === 'pending') e.status = 'voided';
    else addEntry(txId, e.accountId, -e.amountCents, 'posted');
  }
  tx.status = 'refunded';
  tx.note = tx.note ? `${tx.note} · ${reason}` : reason;
  return tx;
}

/* ------------------------------------------------------------ Views -- */

export interface TxView {
  id: ID;
  type: TxType;
  direction: 'in' | 'out';
  amountCents: Cents;
  counterparty: string;
  status: 'completed' | 'pending' | 'reserved' | 'failed' | 'refunded';
  note?: string;
  method: Transaction['method'];
  ref?: { kind: string; id: ID };
  createdAt: number;
  simulated: true;
}

/** The transaction as seen by one account holder. */
export function viewTransaction(tx: Transaction, accountId: ID): TxView | null {
  const db = getDb();
  const mine = db.entries.filter(
    (e) => e.txId === tx.id && e.accountId === accountId && (e.status !== 'voided' || tx.fromAccountId === accountId),
  );
  if (mine.length === 0) return null;
  const isPayer = tx.fromAccountId === accountId;
  let amount = 0;
  if (isPayer) amount = tx.amountCents;
  else amount = mine.filter((e) => e.amountCents > 0).reduce((s, e) => s + e.amountCents, 0);

  let status: TxView['status'];
  if (tx.status === 'refunded') status = 'refunded';
  else if (tx.status === 'failed') status = 'failed';
  else if (tx.status === 'reserved') status = isPayer ? 'reserved' : 'pending';
  else if (!isPayer && mine.some((e) => e.status === 'pending')) status = 'pending';
  else status = 'completed';

  return {
    id: tx.id,
    type: tx.type,
    direction: isPayer ? 'out' : 'in',
    amountCents: amount,
    counterparty: isPayer ? tx.labelForFrom : tx.labelForTo,
    status,
    note: tx.note,
    method: tx.method,
    ref: tx.ref,
    createdAt: tx.createdAt,
    simulated: true,
  };
}

/** Double-entry invariant: every non-voided transaction nets to zero. */
export function ledgerIsBalanced() {
  const db = getDb();
  const sums = new Map<ID, number>();
  for (const e of db.entries) {
    if (e.status === 'voided') continue;
    sums.set(e.txId, (sums.get(e.txId) ?? 0) + e.amountCents);
  }
  // Held transactions are intentionally unbalanced until captured (funds reserved, not moved).
  for (const [txId, sum] of sums) {
    const tx = db.transactions.find((t) => t.id === txId);
    if (tx?.status === 'reserved') continue;
    if (sum !== 0) return false;
  }
  return true;
}
