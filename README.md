# Hayve

**One account. One wallet. One platform. Everything connected.**

Hayve is a consumer super app and business ecosystem. It combines marketplace shopping, payments, rides, food delivery, car rentals, accommodation and parcel delivery, plus the partner tools that power them.

| Consumer product | What it does | Partner app |
|---|---|---|
| **Hayve Shop** | Buy and sell anything, with wishlists and anonymous gifting | Hayve Seller |
| **Hayve Pay** | Wallet, P2P transfers, requests, receipts, merchant checkout | Hayve Business |
| **Hayve Ride** | Passenger transport with live trip tracking | Hayve Driver |
| **Hayve Bites** | Restaurants and groceries with order tracking | Hayve Kitchen · Hayve Courier |
| **Hayve Drive** | Car rentals from local hosts | Hayve Host |
| **Hayve Stay** | Apartments, rooms, houses and holiday homes | Hayve Host |
| **Hayve Send** | Same-day parcels and courier delivery | Hayve Courier |

There is also an **Admin console** with role-based access.

> **Preview build.** Money, cards, payouts, rides, rentals, stays and deliveries are **simulated**. The UI labels them clearly, and no real money or services are involved. See [docs/PAYMENTS.md](docs/PAYMENTS.md).

---

## Install on your iPhone (sideloading)

Every push to `main` or a `claude/**` branch builds an **unsigned `.ipa`** on a GitHub macOS runner with Xcode. The workflow is `.github/workflows/ios-ipa.yml`.

1. Open **Releases** on GitHub and pick the newest `Hayve iOS build N` pre-release.
2. Download `Hayve.ipa` (Safari → Files).
3. Open it with your sideloading app (AltStore, SideStore, Sideloadly, Feather, ESign…). The app re-signs it with your Apple ID or certificate.
4. Sign in with a demo account, e.g. **sam@hayve.app / hayve123**. All demo accounts are listed on the sign-in screen.

Details, including EAS and App Store builds: [docs/IOS_BUILD.md](docs/IOS_BUILD.md).

## Run locally

```bash
npm install
npm run web        # website at http://localhost:8081
npm run ios        # iOS simulator / Expo Go (macOS)
npm test           # backend tests: gifting privacy, ledger, services
npm run typecheck
npm run lint
bash supabase/tests/run.sh   # PostgreSQL schema + RLS privacy tests (needs PostgreSQL 15+)
```

Build the website for hosting: `npm run build:web` → static files in `dist/`. Serve them with SPA fallback to `index.html`.

## Demo accounts

| Email | Who |
|---|---|
| sam@hayve.app | Customer & seller (main demo account) |
| noor@hayve.app | Has a public wishlist, so you can gift to her |
| lucas@hayve.app | Hayve Seller (vinyl, audio, cameras) |
| marco@hayve.app | Hayve Kitchen (Napoli Forno, Green Ritual…) |
| mila@hayve.app | Hayve Host (stays and cars) |
| daan@hayve.app | Hayve Driver |
| yara@hayve.app | Hayve Courier |
| admin@hayve.app | Administrator |

**Profile → Developer tools → Switch demo account** lets you play both sides of a flow. For example: gift Noor an item as Sam, then switch to Noor and see it marked **Sold**, with no hint of who bought it.

## Tech stack

- **Expo SDK 54 + React Native 0.81 + Expo Router 6**, TypeScript. One codebase for iPhone, iPad (sidebar layout) and the website (react-native-web).
- **Simulated backend** in `src/backend/` (persistent on device): permission checks, a double-entry ledger, the gifting privacy model and every service state machine.
- **Supabase/PostgreSQL schema** in `supabase/migrations/`, with row level security and the gifting RPCs. Tested on a real PostgreSQL by `supabase/tests/run.sh`.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design decisions and how to switch the app onto Supabase.

## Project layout

```
src/
  app/            Expo Router screens (tabs, services, partner apps, admin)
  backend/        Simulated backend: types, store, ledger, seed data, api/*
  design/         Design system: tokens, components (primitives, layout, forms, visuals)
  features/       Shared feature components (cards, wishlist, pay, bites, business)
  lib/            Hooks, formatting, storage, basket
supabase/
  migrations/     PostgreSQL schema + RLS + gifting functions
  tests/          Database privacy tests
tests/            Vitest backend tests
docs/             Architecture, iOS builds, payments, development checklist
.github/workflows CI (typecheck, lint, tests, web build, DB tests) + iOS IPA build
```

## Brand

Ultraviolet `#3A1FD1` · Dark purple `#110D2E` · Lime `#C8F542` · Lavender `#F6F5FF`. Tokens live in `src/design/tokens.ts`.

The official Hayve logo was not included in the brief, so the app currently shows a neutral typographic placeholder. To drop in the real artwork, see `src/design/brand.ts` and replace `assets/images/icon.png` and `splash-icon.png`.
