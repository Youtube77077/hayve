# Hayve Pay: what is simulated and how to make it real

## Simulated in this build

- Wallet balances, top-ups, withdrawals and P2P transfers
- Card payments (any card number is accepted; only the last four digits are kept)
- **Tap to Pay** (Hayve Pay › Get paid): identity check, keypad, tap screen, result, receipts, refunds, payer Wave Back and the QR claim. The tap itself is simulated with a demo panel (card, Apple Pay, saved card, Hayve balance, no connection, declined).
- **Hayve Card** (Hayve Pay › Card): virtual card after the identity check, Show details (Face ID or password), Add to Apple Wallet / Google Pay, freeze, limits, online/contactless/gambling blocks, linked bank (iDEAL | Wero or SEPA mandate), auto top-up in batches, physical card, replace, PIN, and demo purchases at partner and other shops.
- Merchant settlements and payout schedules
- Cryptocurrency (not implemented; listed as future scope)

Every money screen shows a **Demo** badge. Nothing connects to a bank, card network or crypto custodian.

## Not offered by design

Gift cards, gift-card resale, gambling, investment products, lending and savings accounts. Hayve Pay is for everyday spending and payments.

## Path to production

Hayve Pay holds customer funds and moves money between users, so in the EU it needs to operate under, or through a partner holding:

- an **EMI (electronic money institution)** or **PI (payment institution)** licence under PSD2. This covers wallets, P2P and merchant acquiring.
- KYC/AML onboarding for users and merchants (identity verification, sanctions screening, transaction monitoring)
- a **card issuing** partner for the Hayve Card, and an **acquirer** for card acceptance and Tap to Pay on iPhone (which also needs an Apple entitlement)

Suggested provider adapters (all have EU coverage and marketplace features):

| Need | Options |
|---|---|
| Marketplace split payments & payouts | Stripe Connect, Adyen for Platforms, Mollie Connect |
| Wallet / e-money | Partner EMI (e.g. via Adyen Issuing, Swan, Treezor) |
| Card issuing | Stripe Issuing, Adyen Issuing, Marqeta |
| KYC | Onfido, Veriff, provider-native KYC |

### Integration approach
The ledger (`ledger_entries` / `transactions`) stays Hayve's internal source of truth. Provider adapters plug in at the system accounts:

- `card` → provider PaymentIntent. Capture on success; the webhook confirms the `deposit` transaction.
- `bank` → SEPA / iDEAL top-ups and payouts.
- `payouts` → provider transfers to connected accounts.

The checkout flows already use **hold → capture / void**, which maps directly onto card authorisation and capture.


## Tap to Pay (production wiring)

1. Apply for Apple's **Tap to Pay on iPhone** entitlement (iPhone XS or newer) and enable Tap to Pay on Android in the Stripe dashboard.
2. Add `@stripe/stripe-terminal-react-native` to the app and configure its Expo plugin. The app calls `POST /api/tap/connection-token`, then `POST /api/tap/charges` (creates a `card_present` PaymentIntent) and hands the client secret to the Terminal SDK, which shows the system "Hold card or phone here" screen.
3. Only the signed webhook `payment_intent.succeeded` (`POST /api/webhooks/stripe`, signature checked) marks the payment as paid. Offline or declined taps never create a payment.
4. Receiver fee: `tap_to_pay.receiverFeeRate` (default 2.5%), shown only as "Fees €X.XX". Monthly limit for personal accounts and refund window are admin settings. Refunds go through `POST /api/tap/charges/:id/refund` and are final when `charge.refunded` arrives.
5. Payer Wave Back: 1% when paying with the Hayve balance or Hayve Card; 0.5% when the card's fingerprint matches a card saved in the payer's Hayve account; otherwise the receipt QR lets the payer claim within 24 hours.

## Hayve Card (production wiring)

1. Card issuing partner: **Stripe Issuing** (alternatives Adyen Issuing, Marqeta) on top of the EMI that holds balances.
2. Cardholder + virtual card are created after the partner's KYC; the physical card is ordered through the same API.
3. "Show details" uses an ephemeral key (`POST /api/card/ephemeral-key`) with the issuer's secure elements behind Face ID / PIN. Hayve never stores the full card number, expiry or CVC (the database has no columns for them).
4. Apple Wallet / Google Pay: in-app push provisioning through the issuer (requires Apple and Google approval).
5. Authorisations (`issuing_authorization.request` webhook) are decided by `decideAuthorization` in `server/src/payments.ts`: frozen, blocked channels, gambling MCCs, daily/monthly limits, balance first, then auto top-up from the linked bank in batches (default €50).
6. Wave Back on the card: 1% at Hayve Business partners and Hayve services, 0.1% elsewhere, plus admin **boosts**; the €20 monthly maximum (all sources) and the exclusions (top-ups, transfers, fees) always apply.

### Later: paying from the app without Apple Wallet

In the EEA, Apple's HCE contactless API (iOS 17.4+, iPhone XS+) allows paying directly from the Hayve app. It needs Apple's HCE entitlement and EEA payment licensing. The card screen and confirmation flow are built so this can be added as another payment surface without a redesign.
