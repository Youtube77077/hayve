# Hayve Pay: what is simulated and how to make it real

## Simulated in this build

- Wallet balances, top-ups, withdrawals and P2P transfers
- Card payments (any card number is accepted; only the last four digits are kept)
- Apple Pay, Tap to Pay, the Hayve Card (shown as "Coming soon")
- Merchant settlements and payout schedules
- Cryptocurrency (not implemented; listed as future scope)

Every money screen shows a **Simulated** badge. Nothing connects to a bank, card network or crypto custodian.

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
