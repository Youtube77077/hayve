# Hayve Pay: a wallet inside Hayve

Hayve Pay is an internal wallet and balance. It is **not** a bank, card issuer, payment processor or payment network. Real money is collected and paid out by an external payment provider; Hayve keeps a ledger of what each person holds and spends.

## What Hayve Pay does

| Feature | How it works | Where |
|---|---|---|
| Balance | Derived from an append-only double-entry ledger, never stored as a number | `src/backend/ledger.ts`, migration 0002 |
| Add money | Pay by card in the provider's hosted checkout; the balance changes when the provider confirms | `wallet.addMoney`, `server/src/payments.ts` `/wallet/topup` |
| Spend anywhere in Hayve | Shop, Ride, Bites, Drive, Stay, request links | `beginPayment` in `src/backend/api/common.ts` |
| Not enough balance | "Balance + card for the rest": the balance pays what it can, the card pays the rest | `PayMethod = 'wallet_card'` |
| Pay fully by card | The provider's checkout; Hayve never sees card details | `PayMethod = 'card'` |
| History, payments, refunds | Every movement is a ledger transaction; refunds reverse the original entries | `wallet.transactions`, `refundTransaction` |
| Withdraw | Eligible balance to the person's payout account. Money added by card in the last 7 days can be spent but not withdrawn (fraud and chargeback protection) | `wallet.withdrawable/withdraw` |
| Send money to Hayve users | Balance to balance, recorded in the ledger | `wallet.sendMoney` |
| Request money | Links anyone can pay by card or with their balance; splits (N people or "I'm not sure"); 72-hour links; progress visible to the requester only | `src/backend/api/requests.ts` |
| Wave Back | Money back on Hayve purchases paid from the balance | `computeWaveBack` |

Gift cards do not exist in the product yet, so none were added.

## Wave Back (current rates, admin-editable)

- Hayve Shop purchases paid from the balance: **1%**, at most **$5 per purchase**
- Ride, Bites, Drive and Stay paid from the balance: **2%**
- New members, first **30 days**: **5%**, up to **$10** in total
- Never more than **$20 per person per month**
- Only the part paid from the balance earns Wave Back; card payments, top-ups and transfers don't.

## Removed in the simplification

Tap to Pay (phone as a card terminal), the Hayve Card (virtual/physical card, Face ID card details, wallet provisioning, card controls, auto top-up), bank connections (iDEAL | Wero / ACH / open-banking pickers, country bank lists, rails), saved cards, Wave Back boosts for card merchants, the receipt QR "claim" page, Stripe Terminal and Stripe Issuing server routes, the Face ID library (`expo-local-authentication`). Database: migration `0008_simplify_wallet.sql` drops `tap_payments`, `cards`, `linked_banks`, `wave_back_boosts` (never used in production) and keeps the ledger untouched.

## What needs an external provider

| Feature | Provider piece | Notes |
|---|---|---|
| Add money (top-up) | Hosted checkout (e.g. Stripe Checkout) | Card, plus any wallets the provider shows on its own page |
| Card payments at checkout and on request links | PaymentIntent / Checkout | Provider collects the card |
| Withdrawals | Payouts to a verified account (e.g. Stripe Connect payouts, or a licensed wallet partner) | Provider verifies the account holder |
| Holding balances | A licensed partner that can hold customer funds, or Hayve's own licence | See below |

Keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (server env only). The webhook is the only path that records real money (`checkout.session.completed` for top-ups, `payment_intent.*` for request links), once per provider reference.

## Regulatory and cost dependencies (calling it a "balance" does not remove these)

- **Stored value.** Keeping customer money that can be spent across different sellers and withdrawn is usually regulated: e-money in the EU/UK (EMI licence or acting as an agent of an EMI), money transmission in the US (state money transmitter licences, FinCEN MSB registration) unless a licensed partner holds the funds (for example a provider's "stored balances"/connected-account product). Choose the partner before launch; its contract decides who holds the funds and who is liable.
- **Safeguarding.** Customer balances must be kept separate from Hayve's own money (safeguarding accounts or the partner's FBO/trust accounts).
- **KYC/AML.** Identity checks above thresholds set by the partner and the law (withdrawals and larger balances in particular), sanctions screening, transaction monitoring.
- **Refunds and chargebacks.** Card top-ups can be disputed; the 7-day withdrawal hold reduces abuse. Budget for chargeback fees.
- **Dormant balances.** Unclaimed-property (escheatment) rules in US states and dormant-account rules elsewhere apply to long-unused balances; balances cannot simply be kept.
- **Consumer law.** Clear terms, fees shown before payment, refunds and withdrawals as promised.
- **Costs.** Provider card fees on top-ups and card payments (roughly 1.5–3% + a fixed fee depending on region), payout fees, chargeback fees, and the partner's platform fees.

Until a provider and partner are connected, every money movement in the app is simulated and labelled **Demo**.
