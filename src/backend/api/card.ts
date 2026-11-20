import { HAYVE_CARD } from '../config';
import { accountIdFor, balancesFor, createTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, simHash, uid } from '../store';
import type { HayveCard, ID, LinkedBank } from '../types';
import { audit, creditWaveBack, displayName, notify } from './common';
import { me } from './session';

/**
 * Hayve Card: a Visa debit card on the Hayve balance (simulated).
 *
 * Production: issued by a licensed partner (Stripe Issuing, Adyen Issuing or Marqeta) after the
 * partner's KYC. In-app provisioning adds it to Apple Wallet / Google Wallet. Card authorisations
 * arrive as partner webhooks; Hayve approves them against the balance (auto top-up from the
 * linked bank in batches) and the controls below. Full card numbers never touch Hayve servers:
 * "Show details" uses the issuer's secure display (ephemeral key) behind Face ID / PIN.
 */

export interface Merchant {
  id: string;
  name: string;
  category: string;
  mcc: string;
  /** Hayve Business partner or Hayve's own service (higher Wave Back). */
  partner: boolean;
}

/** Demo merchants for trying the card. */
export const MERCHANTS: Merchant[] = [
  { id: 'ah', name: 'Albert Heijn', category: 'Groceries', mcc: '5411', partner: false },
  { id: 'ns', name: 'NS', category: 'Trains', mcc: '4112', partner: false },
  { id: 'bol', name: 'bol', category: 'Online shop', mcc: '5999', partner: false },
  { id: 'coffee', name: 'Coffee Company', category: 'Café', mcc: '5814', partner: false },
  { id: 'napoli', name: 'Napoli Forno', category: 'Hayve Business partner', mcc: '5812', partner: true },
  { id: 'groove', name: 'Groove Supply', category: 'Hayve Business partner', mcc: '5735', partner: true },
  { id: 'hayve', name: 'Hayve Ride', category: 'Hayve service', mcc: '4121', partner: true },
  { id: 'casino', name: 'Holland Casino', category: 'Gambling', mcc: '7995', partner: false },
];

export function cardForUser(userId: ID): HayveCard | undefined {
  return getDb().cards.find((c) => c.userId === userId && c.status !== 'replaced');
}

function myCard() {
  const user = me();
  const card = cardForUser(user.id);
  assert(card, 'not_found', 'You do not have a Hayve Card yet');
  return card;
}

function newLast4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export interface CardView {
  card: HayveCard | null;
  holder: string;
  identityVerified: boolean;
  bank: LinkedBank | null;
  spentTodayCents: number;
  spentMonthCents: number;
  balanceCents: number;
}

function spent(userId: ID, since: number) {
  const acc = accountIdFor(userId);
  return getDb()
    .transactions.filter((t) => t.type === 'card_purchase' && t.fromAccountId === acc && t.status === 'completed' && t.createdAt >= since)
    .reduce((a, t) => a + t.amountCents, 0);
}

function dayStart() {
  const d = new Date(now());
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function monthStartTs() {
  const d = new Date(now());
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function get(): CardView {
  const user = me();
  const db = getDb();
  const profile = db.profiles.find((p) => p.userId === user.id);
  return {
    card: cardForUser(user.id) ?? null,
    holder: (profile?.displayName ?? '').toUpperCase(),
    identityVerified: profile?.kyc?.status === 'verified',
    bank: db.linkedBanks.find((b) => b.userId === user.id) ?? null,
    spentTodayCents: spent(user.id, dayStart()),
    spentMonthCents: spent(user.id, monthStartTs()),
    balanceCents: balancesFor(accountIdFor(user.id)).available,
  };
}

/** Virtual card instantly after the identity check. */
export function issue() {
  const user = me();
  const db = getDb();
  const profile = find(db.profiles, (p) => p.userId === user.id, 'Profile');
  assert(profile.kyc?.status === 'verified', 'forbidden', 'Verify your identity to get a Hayve Card');
  assert(!cardForUser(user.id), 'conflict', 'You already have a Hayve Card');
  const d = new Date(now());
  const card: HayveCard = {
    id: uid('card'),
    userId: user.id,
    network: HAYVE_CARD.network,
    last4: newLast4(),
    expMonth: d.getMonth() + 1,
    expYear: d.getFullYear() + 4,
    status: 'active',
    kind: 'virtual',
    limits: { dailyCents: HAYVE_CARD.defaultDailyLimitCents, monthlyCents: HAYVE_CARD.defaultMonthlyLimitCents },
    blocks: { online: false, contactless: false, gambling: true },
    autoTopUp: { enabled: true, amountCents: HAYVE_CARD.defaultAutoTopUpCents },
    wallets: { apple: false, google: false },
    pinSet: false,
    issuerRef: `ic_sim_${Math.random().toString(36).slice(2, 12)}`,
    createdAt: now(),
  };
  db.cards.push(card);
  notify(user.id, 'payment', 'Your Hayve Card is ready', 'Add it to Apple Wallet or Google Wallet and start paying.', '/pay/card');
  audit(user.id, 'card.issue', card.id);
  commit();
  return card.id;
}

/**
 * Card details behind Face ID / PIN. In production this returns an issuer ephemeral key and the
 * numbers are rendered by the issuer's secure element; here a test number is derived for display.
 */
export function revealDetails(auth: { biometric: true } | { password: string }) {
  const user = me();
  if ('password' in auth) {
    assert(auth.password.length > 0, 'invalid', 'Enter your password');
    assert(user.passwordHash === simHash(auth.password), 'invalid', 'Password is incorrect');
  }
  const card = myCard();
  const seed = card.id.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1e9, 7);
  const middle = String(seed).padStart(8, '0').slice(0, 8);
  const number = `4000${middle}${card.last4}`;
  audit(user.id, 'card.details_viewed', card.id);
  commit();
  return { number: number.replace(/(.{4})/g, '$1 ').trim(), expiry: `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(2)}`, cvc: String((seed % 900) + 100) };
}

export function setFrozen(frozen: boolean) {
  const card = myCard();
  card.status = frozen ? 'frozen' : 'active';
  audit(card.userId, frozen ? 'card.freeze' : 'card.unfreeze', card.id);
  commit();
}

export function replace() {
  const user = me();
  const db = getDb();
  const old = myCard();
  old.status = 'replaced';
  const card: HayveCard = { ...old, id: uid('card'), last4: newLast4(), status: 'active', wallets: { apple: false, google: false }, pinSet: false, issuerRef: `ic_sim_${Math.random().toString(36).slice(2, 12)}`, createdAt: now(), physical: old.physical ? { orderedAt: now(), status: 'ordered' } : undefined };
  db.cards.push(card);
  notify(user.id, 'security', 'Card replaced', `Your old card •••• ${old.last4} no longer works. New card •••• ${card.last4}.`, '/pay/card');
  audit(user.id, 'card.replace', card.id);
  commit();
}

export function changePin(pin: string) {
  const card = myCard();
  assert(/^\d{4}$/.test(pin), 'invalid', 'A PIN has 4 digits');
  assert(!['0000', '1111', '1234', '4321', '2580'].includes(pin) && !/^(\d)\1{3}$/.test(pin), 'invalid', 'Choose a PIN that is harder to guess');
  card.pinSet = true;
  audit(card.userId, 'card.pin', card.id);
  commit();
}

export function setLimits(limits: { dailyCents: number; monthlyCents: number }) {
  const card = myCard();
  assert(Number.isInteger(limits.dailyCents) && limits.dailyCents >= 1000, 'invalid', 'Daily limit must be at least €10');
  assert(limits.monthlyCents >= limits.dailyCents, 'invalid', 'The monthly limit must be at least the daily limit');
  assert(limits.monthlyCents <= 2_000_000, 'invalid', 'The monthly limit can be at most €20,000');
  card.limits = limits;
  commit();
}

export function setBlocks(blocks: Partial<HayveCard['blocks']>) {
  const card = myCard();
  card.blocks = { ...card.blocks, ...blocks };
  commit();
}

export function setAutoTopUp(auto: { enabled: boolean; amountCents?: number }) {
  const user = me();
  const card = myCard();
  if (auto.enabled) assert(getDb().linkedBanks.some((b) => b.userId === user.id), 'invalid', 'Link a bank account first');
  const amount = auto.amountCents ?? card.autoTopUp.amountCents;
  assert(amount >= 1000 && amount <= 50_000, 'invalid', 'Top-ups can be €10 to €500');
  card.autoTopUp = { enabled: auto.enabled, amountCents: amount };
  commit();
}

export function orderPhysical() {
  const card = myCard();
  assert(!card.physical, 'conflict', 'Your physical card is already on its way');
  card.physical = { orderedAt: now(), status: 'ordered' };
  card.kind = 'physical';
  notify(card.userId, 'payment', 'Physical card ordered', 'Your black Hayve Card arrives in 3 to 5 working days.', '/pay/card');
  audit(card.userId, 'card.order_physical', card.id);
  commit();
}

/** In-app provisioning (simulated). Production: Apple PassKit / Google Push Provisioning via the issuer. */
export function addToWallet(wallet: 'apple' | 'google') {
  const card = myCard();
  assert(card.status === 'active', 'conflict', 'Unfreeze your card first');
  card.wallets = { ...card.wallets, [wallet]: true };
  audit(card.userId, `card.wallet.${wallet}`, card.id);
  commit();
}

/** Links a bank account for top-ups (iDEAL | Wero) or a SEPA Direct Debit mandate (simulated). */
export function linkBank(input: { holder: string; iban: string; method: LinkedBank['method'] }) {
  const user = me();
  const db = getDb();
  const iban = input.iban.replace(/\s+/g, '').toUpperCase();
  assert(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban), 'invalid', 'Enter a valid IBAN');
  assert(input.holder.trim().length >= 2, 'invalid', 'Enter the account holder name');
  const banks: Record<string, string> = { INGB: 'ING', RABO: 'Rabobank', ABNA: 'ABN AMRO', BUNQ: 'bunq', SNSB: 'SNS', TRIO: 'Triodos', KNAB: 'Knab', ASNB: 'ASN Bank', REVO: 'Revolut' };
  db.linkedBanks = db.linkedBanks.filter((b) => b.userId !== user.id);
  db.linkedBanks.push({ userId: user.id, holder: input.holder.trim(), ibanLast4: iban.slice(-4), bank: banks[iban.slice(4, 8)] ?? 'Bank account', method: input.method, mandateRef: `HAYVE-${uid('m').slice(-8).toUpperCase()}`, linkedAt: now() });
  audit(user.id, 'bank.link', iban.slice(-4));
  commit();
}

export function unlinkBank() {
  const user = me();
  const db = getDb();
  db.linkedBanks = db.linkedBanks.filter((b) => b.userId !== user.id);
  const card = cardForUser(user.id);
  if (card) card.autoTopUp = { ...card.autoTopUp, enabled: false };
  commit();
}

/**
 * Tops up the balance from the linked bank in batches (default €50) when it cannot cover `amountCents`.
 * Batching keeps bank costs low. Throws when auto top-up is off or no bank is linked.
 */
export function cardTopUpIfNeeded(userId: ID, amountCents: number) {
  const db = getDb();
  const acc = accountIdFor(userId);
  const available = balancesFor(acc).available;
  if (available >= amountCents) return 0;
  const card = cardForUser(userId);
  const bank = db.linkedBanks.find((b) => b.userId === userId);
  if (!card?.autoTopUp.enabled || !bank) throw new HayveError('insufficient_funds', 'Not enough balance on the Hayve Card. Add money or turn on auto top-up.');
  const short = amountCents - available;
  const batches = Math.ceil(short / card.autoTopUp.amountCents);
  const total = batches * card.autoTopUp.amountCents;
  createTransaction({
    type: 'auto_topup',
    fromAccountId: SYSTEM.bank,
    credits: [{ accountId: acc, amountCents: total }],
    labelForFrom: 'Auto top-up',
    labelForTo: `Auto top-up · ${bank.bank} •••• ${bank.ibanLast4}`,
    note: batches > 1 ? `${batches} × €${(card.autoTopUp.amountCents / 100).toFixed(0)}` : undefined,
    method: 'bank',
  });
  return total;
}

/**
 * Simulates a card authorisation from a merchant: controls → funding (balance, then auto top-up)
 * → capture → Wave Back (partners and Hayve services higher; admin boosts apply).
 */
export function simulatePurchase(input: { merchantId: string; amountCents: number; channel: 'contactless' | 'online' | 'chip' }) {
  const user = me();
  const card = myCard();
  const m = MERCHANTS.find((x) => x.id === input.merchantId);
  assert(m, 'not_found', 'Unknown shop');
  assert(Number.isInteger(input.amountCents) && input.amountCents > 0, 'invalid', 'Enter an amount');
  const decline = (reason: string) => {
    notify(user.id, 'security', 'Card payment declined', `${m.name} · €${(input.amountCents / 100).toFixed(2)} · ${reason}`, '/pay/card');
    commit();
    return new HayveError('payment_failed', reason);
  };
  if (card.status === 'frozen') throw decline('Your card is frozen');
  if (input.channel === 'online' && card.blocks.online) throw decline('Online payments are blocked');
  if (input.channel === 'contactless' && card.blocks.contactless) throw decline('Contactless payments are blocked');
  if (card.blocks.gambling && HAYVE_CARD.gamblingMcc.includes(m.mcc)) throw decline('Gambling payments are blocked');
  if (spent(user.id, dayStart()) + input.amountCents > card.limits.dailyCents) throw decline('Over your daily spending limit');
  if (spent(user.id, monthStartTs()) + input.amountCents > card.limits.monthlyCents) throw decline('Over your monthly spending limit');

  const toppedUp = cardTopUpIfNeeded(user.id, input.amountCents);
  const tx = createTransaction({
    type: 'card_purchase',
    fromAccountId: accountIdFor(user.id),
    credits: [{ accountId: SYSTEM.card, amountCents: input.amountCents }],
    labelForFrom: m.name,
    labelForTo: displayName(user.id),
    note: `Hayve Card •••• ${card.last4}`,
    method: 'card',
  });
  tx.meta = { merchant: { name: m.name, category: m.category, partner: m.partner }, card: { brand: 'Hayve Card', last4: card.last4 } };
  const wb = creditWaveBack(user.id, m.partner ? 'card_partner' : 'card_other', input.amountCents, { paymentTxId: tx.id, note: m.name, merchant: m.name });
  tx.waveBackCents = wb;
  // Push notification for every card payment.
  notify(user.id, 'payment', `€${(input.amountCents / 100).toFixed(2)} at ${m.name}`, wb ? `+€${(wb / 100).toFixed(2)} Wave Back` : 'Hayve Card payment', `/pay/tx/${tx.id}`);
  commit();
  return { txId: tx.id, waveBackCents: wb, toppedUpCents: toppedUp, merchant: m.name };
}

export function purchases() {
  const user = me();
  const acc = accountIdFor(user.id);
  return getDb()
    .transactions.filter((t) => t.type === 'card_purchase' && t.fromAccountId === acc)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => ({ id: t.id, merchant: t.meta?.merchant?.name ?? t.labelForFrom, category: t.meta?.merchant?.category ?? '', amountCents: t.amountCents, waveBackCents: t.waveBackCents ?? 0, status: t.status, createdAt: t.createdAt }));
}
