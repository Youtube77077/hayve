# Hayve audit (Prompt 0)

Date: 24 Nov 2026. Scope: the whole repository at commit `b36f099`. No code was changed for this audit.

## 1. Project map

| Part | What it is |
|---|---|
| App | Expo SDK 54, React Native 0.81, Expo Router 6, TypeScript. One codebase for iPhone/iPad (unsigned IPA from CI) and the website (react-native-web, `expo export`). Routes in `src/app/` (63 screens). |
| Data / backend used by the app | **Simulated** in-app backend in `src/backend/` (in-memory database persisted to AsyncStorage/localStorage, seeded demo data). Screens talk only to `src/backend/api/*`, so a real HTTP backend can be swapped in behind that layer. |
| Money | Double-entry ledger (`src/backend/ledger.ts`), integer cents, balances computed from entries, pending (escrow) entries. Pricing engine with audited price records (`src/backend/pricing.ts`, `api/revenue.ts`). |
| Real API (not yet used by the app) | `server/`: Fastify + PostgreSQL (row-level security), argon2 passwords, JWT sessions, TOTP 2FA for admins, uploads to DigitalOcean Spaces, Stripe checkout/webhook seam (`server/src/payments.ts`). Schema in `supabase/migrations/0001–0009`. |
| Auth | Simulated backend: email + password, preview 2FA code. Server: real email verification and TOTP. |
| Payments | Simulated card checkout in the app. Stripe seam on the server (sandbox only, keys from env). |
| Maps | `src/features/map`: Mapbox (token from env), Apple Maps native module on iPhone without a token, MapLibre + OpenFreeMap on web. Geocoding: Mapbox / Apple / Photon. Routing: Mapbox Directions / Apple / OSRM demo server. |
| Hosting | DigitalOcean: single droplet (`deploy/droplet/`, Docker Compose: Caddy + API + PostgreSQL) or App Platform (`.do/app.yaml`). |
| Tests | 58 app-backend tests (`tests/`), 22 API tests (`server/test/`), 3 PostgreSQL suites (`supabase/tests/`), plus the 1,000-person simulation (`sim/`). |

## 2. Services: what exists, what's mock, what's broken

Every service runs on the simulated backend and demo data. Nothing moves real money or talks to real drivers, restaurants or hosts yet.

| Service (current name) | Screens | Works in the demo | Mock / placeholder | Missing vs. the prompt pack |
|---|---|---|---|---|
| **Pay** | `(tabs)/pay`, `pay/add`, `pay/send`, `pay/request`, `pay/requests`, `pay/link/[id]`, `pay/tx/[id]`, `pay/withdraw`, `pay/methods`, `paylink/[id]`, `r/[id]` | Balance from the ledger, add money (simulated checkout), send to users, request links and splits (72 h), withdraw with a 7-day hold on fresh top-ups, Wave Back | Card checkout and payouts are simulated | Three visible balances (Available / Pending / Reserved with release dates), activity filters per service/date, idempotency keys, fraud limits, groups ("who owes who"), QR merchant payments, send by phone contact |
| **Shop** (+ Hayve Store, Hayve Send) | `(tabs)/shop`, `product/[id]`, `checkout/[productId]`, `sell`, `orders`, `orders/[id]`, `invoice/[orderId]`, `track/[code]`, `favourites`, `wishlist`, `gift/[itemId]`, `business/seller`, `business/merchant` | Listings, search, favourites, buyer fee shown as "Fees", escrowed payment released on delivery, shipping zones, anonymous gifting, verified-business badge | Shipping labels and tracking are simulated | Offers with expiry/minimums, verified local collection by QR, condition photo requirements, AI listing creator, packing evidence, bulk tools, buyer reliability |
| **Ride** (Rides) | `(tabs)/ride`, `ride/[id]`, `business/driver` | Pickup/destination search, centre pin with reverse geocoding, fare per category with disclosed fees, one-driver-at-a-time dispatch, 85/15 split, waiting and late-cancellation fees, ratings | Drivers and their movement are simulated | Map-matching and smooth interpolation, deviation detection and re-routing, PIN to start, share trip, emergency button, scheduled/airport rides, driver reliability, honest pickup ETA from real positions |
| **Bites** (Eats) | `(tabs)/bites`, `bites/restaurant/[id]`, `bites/cart`, `bites/order/[id]`, `business/kitchen`, `business/courier` | Restaurants in your city only, menus with options, service and small-order fees, order stages, courier payout | Restaurants are demo data (New York only in the app); courier simulated | Late-delivery and missing-item auto refunds, proof-of-delivery photo, group/scheduled orders, prep-time control, restaurant pause |
| **Stay** (Stays) | `(tabs)/stay`, `stay/[id]`, `stay/booking/[id]`, `business/host` | Search with dates/guests/filters, total price with cleaning fee and taxes, booking with host escrow | Properties are demo data | Plain-words cancellation timeline, host-cancellation rebooking, iCal sync, cleaning coordination, guest messages, damage claims, map price pins with clustering |
| **Drive** (Rentals) | `(tabs)/drive`, `drive/[id]`, `drive/booking/[id]` | Date search, quote with insurance and deposit, age rules, booking | Cars are demo data; insurance has no insurer | Insurance comparison, deposit shown as Reserved, digital inspection photos, fleet dashboard, maintenance reminders, peer-to-peer listing |
| **Business / partners** | `business/index` + seller, merchant, kitchen, driver, courier, host | Role dashboards with earnings | Mostly demo numbers | One dashboard with role tabs, B2B payments, VAT exports, AI assistant |
| **Support** | `settings/help`, `messages`, `notifications` | Messages between users, notifications, help page | Help is static | Help centre starting from recent transactions, guided flows, cases with response times, admin queue |
| **Trust** | profile pages `u/[username]`, report actions | Ratings, verified business badge | ID verification not implemented | Verification levels, one reputation profile, scam warnings in chat |
| **Travel** | none | — | — | Everything (Prompt 13) |
| **Admin** | `admin/index` | Users, roles (owner admin with verified email + 2FA), fees, Wave Back, Revenue & pricing | — | Disputes and support queues |

## 3. UI inconsistencies

- **Sign-up wall.** Signed-out users are always redirected to `/welcome` (`src/app/_layout.tsx`, `AuthGate`). There is no onboarding before sign-up (Prompt 16 A).
- **Navigation.** Phone bar: Home, Shop, Ride, Bites, More (5 slots). Wide layout: 9 destinations in a sidebar (Home, Explore, Shop, Pay, Ride, Bites, Drive, Stay, Profile). Account/Profile isn't far right on phones; Pay sits behind More.
- **Service names** differ from the prompt pack: Bites ↔ Eats, Drive ↔ Rentals, Stay ↔ Stays, Ride ↔ Rides. Needs one decision before more screens are built.
- **Indigo use.** Indigo marks active/selected states, links and badges as well as primary buttons, so the primary button is often not the only indigo element (Prompt 16 rule 8). A `dark` (black) button variant is also used as a primary on some screens (e.g. Welcome "Create account").
- **Two equal buttons side by side** on Welcome (Sign in / Create account) and in some confirmation sheets.
- Colours, fonts and icons are otherwise consistent: one palette in `src/design/tokens.ts` (no off-palette colours found in screens), Plus Jakarta Sans everywhere, line icons via `Icon`. No coloured service tiles remain. Restaurants still carry an unused `logoColor` field in the data.
- Shared components exist (`src/design/components`: Button, Input, Card, ListRow, Chip, Badge, EmptyState, ErrorState, Skeleton, Toast, Segmented, sheets) but several screens still use one-off styled `View`s for cards and rows.
- Loading states: the simulated backend answers synchronously, so most screens have no skeletons; `ErrorState`/`Skeleton` are used in only 19 files.

## 4. Technical debt

- **Simulated backend is the app's only backend.** All data and money live on the device (AsyncStorage/localStorage). Fine for a demo, unsafe for launch: a user can edit their own data. The HTTP adapter to `server/` is not written yet.
- **Fake route fallback.** `estimateRoute()` in `src/features/map/services.ts` draws a right-angle "road-like" line when every routing provider fails. Prompt 1 forbids this: show an error with retry instead.
- **Routing uses the public OSRM demo server** when there is no Mapbox token: rate-limited and not for production.
- **No map-matching, interpolation, deviation detection or route caching.**
- **Stay taxes are a flat 7% in every country**, collected into Hayve's fee account (`quoteStay` in `api/bookings.ts`), instead of regional rates from `regions.ts` passed on to tax authorities.
- **Rental insurance** ($12/day) is collected with no insurer behind it.
- **Preview 2FA code** (`SIM_CODE`) is accepted by the simulated backend; must never ship in a production build (the server uses real TOTP).
- **useLive has no loading state** (synchronous by design). When the HTTP adapter arrives, every screen needs loading and retry states.
- No idempotency keys on simulated payments; no velocity limits.
- No analytics/events layer, no consent banner on the website, no referral system.
- Server: email falls back to `console.log` of the message in development only (throws in production). Good.
- Secrets: none found in the code; keys come from env (`.env.example`).
- Types: strict TypeScript, no `any` hotspots found; lint clean.

## 5. Prioritised fix list

**P0: broken or unsafe**
1. Stop drawing invented routes: replace `estimateRoute` with an error state and retry (Prompt 1).
2. Stay taxes: use regional rates and record them as tax to remit; decide who collects (needs your/legal input).
3. Rental insurance: needs an insurance partner before launch; until then label as demo.
4. Before any real launch: connect the app to the real API (`server/`) and remove the simulated backend and preview codes from production builds.
5. Payments: licensed partner (e-money/payment institution) must hold funds; ledger mirrors it (Prompt 3, `docs/PAYMENTS.md`).

**P1: core experience**
1. Onboarding before sign-up, Duolingo-style, with a personalised first Home (Prompt 16 A). ← doing next
2. Three balances (Available / Pending / Reserved) with release dates (Prompt 3).
3. Hayve Protection: one dispute system and the automatic refund rules (Prompt 4).
4. Maps: provider abstraction, map-matching, smooth driver, deviation + re-route, route caching (Prompt 1).
5. Navigation: 5 tabs with Account far right; primary button the only indigo element (Prompts 2, 16).
6. Support centre starting from recent transactions (Prompt 5).
7. Trust: verification levels and one reputation (Prompt 6).

**P2: polish and growth**
1. Skeletons and retry states everywhere (needed once the HTTP backend exists).
2. Service naming decision (Bites/Eats, Drive/Rentals).
3. Referrals, waitlist, shareable cards, analytics with consent (Prompt 16 F).
4. Website checklist: dark mode, FAQ search, cookie banner, recently viewed (Prompt 16 H).
5. App Store plan (Prompt 16 I), Travel (Prompt 13), Business dashboard (Prompt 14).
