# Hayve

**One account. One wallet. Everything connected.**

Hayve is a consumer super app and business ecosystem: marketplace shopping, payments, rides, food delivery, car rentals and stays, plus the partner tools that power them.

| Product | What it does | Partner app |
|---|---|---|
| **Hayve Shop** | Buy and sell anything, wishlists, anonymous gifting, verified **Hayve Store** businesses | Hayve Seller · Hayve Store |
| **Hayve Pay** | Your Hayve balance: add money, spend across Hayve, send, request and split, withdraw, **Wave Back** | Hayve Business |
| **Hayve Ride** | Rides on a live map with route, driver tracking and ETA | Hayve Driver |
| **Hayve Bites** | Restaurants and groceries with order tracking | Hayve Kitchen · Hayve Courier |
| **Hayve Drive** | Car rentals from local hosts | Hayve Host |
| **Hayve Stay** | Apartments, rooms and holiday homes | Hayve Host |

**International, US first.** Every account has a country (United States by default, also Canada, the UK, Ireland, the Netherlands, Germany, France, Belgium, Spain, Italy, Portugal and Australia). The country sets the currency ($, CA$, £, €, A$), how people pay by bank (ACH in the US, pay by bank in the UK, SEPA in the euro area, iDEAL | Wero only in the Netherlands), the banks offered, business IDs (EIN, Companies House number, CRO, KVK, SIREN…) and tax on invoices. Ride works anywhere. See `src/backend/regions.ts`.

**Hayve Send** (shipping) only appears inside the Shop checkout as "Ship with Hayve Send", with labels and tracking on the order page. There is also an **admin panel** for verifications, users, moderation, fees and Wave Back settings, with an audit log.

> **Preview build.** Money, cards, payouts, rides, rentals, stays and deliveries are **simulated** and labelled **Demo**. No real money or services are involved. See [docs/PAYMENTS.md](docs/PAYMENTS.md).

---

## Install on your iPhone (sideloading)

Every push to `main` or a `claude/**` branch builds an **unsigned `.ipa`** with Xcode on GitHub Actions (`.github/workflows/ios-ipa.yml`) and publishes it as a pre-release.

1. Open **Releases** on GitHub and pick the newest `Hayve iOS build N`.
2. Download `Hayve.ipa` and open it with your sideloading app (AltStore, SideStore, Sideloadly, Feather…).
3. Sign in with a demo account, e.g. **sam@hayve.app / hayve123**.

Details: [docs/IOS_BUILD.md](docs/IOS_BUILD.md).

## Run locally

```bash
npm install
npm run web                    # website at http://localhost:8081
npm test                       # app backend tests (fees, Wave Back, gifting privacy, ledger…)
npx tsc --noEmit && npx expo lint
bash supabase/tests/run.sh     # PostgreSQL schema, RLS, gifting privacy, admin and fee rules
cd server && npm install && npm test   # API: unit + integration tests on a real PostgreSQL
```

## Maps

Maps use **Mapbox** (GL JS on the web, the Maps SDK on iOS/Android, Geocoding and Directions) with one custom Hayve style. On iPhone without a Mapbox key the app uses **Apple Maps** with Apple's routes, addresses and search (free, no key). The website without a key shows a built-in map preview. Save your public Mapbox token (`pk.…`) as the GitHub secret `MAPBOX_PUBLIC_TOKEN` (iPhone app and CI), as `EXPO_PUBLIC_MAPBOX_TOKEN` in DigitalOcean (website) and in `.env.local` on your computer. Step by step: [docs/MAPS.md](docs/MAPS.md#where-to-save-your-mapbox-token).

## Hosting (DigitalOcean)

`.do/app.yaml` deploys the **website** (static), the **API** (`server/`) and **Managed PostgreSQL** on App Platform, with migrations as a pre-deploy job. Pictures go to **Spaces + CDN**; the database only stores URLs. See [docs/HOSTING.md](docs/HOSTING.md).

## Demo accounts (password `hayve123`)

| Email | Who |
|---|---|
| sam@hayve.app | Customer and private seller (main demo account) |
| noor@hayve.app | Public wishlist, so you can send her a gift |
| lucas@hayve.app | Verified Hayve Store business (Groove Records) |
| eva@hayve.app | Private seller with a Store application pending |
| marco@hayve.app | Hayve Kitchen |
| mila@hayve.app | Hayve Host (stays and cars) |
| daan@hayve.app | Hayve Driver |
| yara@hayve.app | Hayve Courier |

**Admin:** there is no demo admin. The owner account (`rojyarzakholi@gmail.com`) gets the admin role when it signs up. Admin tools also need a verified email and two-step verification (in the preview both codes are `246810`). Only an admin can add another admin.

## Tech stack

- **Expo SDK 54, React Native 0.81, Expo Router 6**, TypeScript. One codebase for iPhone, iPad and the website.
- **Simulated backend** in `src/backend/` used by the app today: permissions, a double-entry ledger, the gifting privacy model, fees, Wave Back and every service flow.
- **PostgreSQL schema** in `supabase/migrations/` with row level security, tested by `supabase/tests/run.sh`.
- **API server** in `server/` (Fastify): argon2id passwords, sessions with two-factor level, TOTP, email verification, Spaces uploads, admin and GDPR endpoints. It runs every request under row level security.

## Project layout

```
src/
  app/            Screens (Expo Router)
  backend/        Simulated backend: config (fees, Wave Back), ledger, seed data, api/*
  design/         Tokens, icons (Lucide), logo, emoji, components
  features/       Shared features: map (Mapbox), ride, nav, cards, wishlist, pay
server/           API for DigitalOcean (src, sql, tests)
supabase/         PostgreSQL migrations and database tests
.do/app.yaml      DigitalOcean App Platform spec
docs/             Architecture, hosting, maps, iOS builds, payments, checklist
```

## Brand

Indigo `#4F46E5` · Black `#0E0E10` · White `#FFFFFF` · Greys `#F4F4F6` `#E5E6EA` `#6B6E78`. One font (Plus Jakarta Sans), one outline icon set (Lucide), 8 px grid. The logo is lowercase **hayve** built from the font's own outlines with a bold, wave-shaped indigo **v** that sits on the baseline (`scripts/build-logo.py`, `src/design/logo.tsx`). The app icon is the indigo wave-v on white.

Motion follows a small set of rules (`src/design/motion.tsx`): press wind-up, error shake, staggered lists, springy sheets you can interrupt, a heart burst, cards that tilt toward the cursor on the web, a success check with confetti, and keyboard shortcuts (`/` to search, `Esc` to close). Reduced motion turns it all off.
