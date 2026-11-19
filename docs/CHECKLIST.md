# Development checklist

Status: ✅ done · 🟡 first version / simulated · ⬜ not started

## Foundations
- ✅ Expo SDK 54 project for iPhone, iPad and web (one codebase)
- ✅ Design system: tokens, components, light theme, adaptive layouts
- ✅ Adaptive navigation: iPhone tab bar + All services launcher; iPad/web sidebar
- ✅ Simulated backend with persistence, permissions and viewer-specific DTOs
- ✅ Double-entry ledger with holds, escrow, refunds and derived balances
- ✅ Supabase/PostgreSQL schema with RLS on every table
- ✅ CI: typecheck, lint, Vitest, web build, PostgreSQL privacy tests
- ✅ iOS unsigned IPA build on GitHub Actions + pre-release publishing
- 🟡 Official logo (placeholder wordmark until the asset is supplied)
- ⬜ Supabase adapter for `src/backend/api` (schema ready, see ARCHITECTURE.md)
- ⬜ Image upload to Supabase Storage (local URIs today)
- ⬜ Push notifications (APNs via Expo Notifications)
- ⬜ Dark mode, localisation (NL/FR/DE strings)

## Consumer products
- ✅ Home: wallet, quick actions, activity, orders, recommendations, services
- ✅ Explore: cross-product search, categories, filters, sorting, trending, destinations
- ✅ Shop: browse, search, filter, sort, product detail, favourites, sell/edit/delete, checkout, orders
- ✅ Wishlists: add, remove, reorder, public/private, share link, public view with **Buy** and **Gift**
- ✅ Anonymous gifting: reservation, payment, sold state, privacy, double-gift prevention, failure release, cancellation refund
- ✅ Pay: balance (available/pending/reserved), send, request, accept/decline, add, withdraw, receipts, methods, QR, card preview
- ✅ Ride: places, quotes per category, booking, simulated dispatch, tracking, cancel, rating, history
- ✅ Bites: restaurants & groceries, cuisines, menus with options, basket, checkout, tracking, rating
- ✅ Drive: search, filters, availability calendar, requirements, booking request, booking detail, cancel
- ✅ Stay: destination/dates/guests search, filters, saved places, property detail, calendar, booking, cancel
- ✅ Hayve Send inside Shop checkout: delivery choice, label creation, handover, tracking page
- ✅ Fees: one config file, tiered, never lower for a higher price, one "Fees" line for buyers
- ✅ Wave Back: balance payments only, Shop 1% (max €5), services 2%, new members 5% for 30 days (max €10), €20/month cap, reversed on refunds, admin-editable
- ✅ Hayve Store: KVK/VAT/address/owner ID application, Pending → Verified/Rejected with reason, verified mark, store page, bulk upload, stock, sales, VAT invoices
- ✅ Maps: Mapbox web + iOS with Hayve style, preview fallback without keys; Ride with centre pin, route, gliding cars, bottom sheet states
- ✅ Admin: verifications, users (search, suspend, delete), content moderation, reports, fee and Wave Back settings, overview, audit log; 2FA required
- ✅ Hosting foundation: DigitalOcean app spec, API server, migrations, database and API tests
- ✅ Profile & settings: personal details, avatar, addresses, privacy, security, notifications, language, delete account
- ✅ Messages (buyer/seller, host/guest, restaurant) and notifications
- ✅ Auth: sign up, sign in, sign out, password reset (simulated code), email verification (simulated code)

## Partner products
- ✅ Hayve Seller: dashboard, listings, orders, ship/deliver/refund, earnings
- ✅ Hayve Kitchen: register, open/close, live orders (accept/reject/prepare/ready), menu CRUD, settings, earnings
- ✅ Hayve Host: stays & vehicles, requests (accept/decline/complete), listing forms, availability blocking, earnings
- ✅ Hayve Driver: register, online toggle, request queue, accept/decline, trip progression, earnings
- ✅ Hayve Courier: register, parcels & food jobs, accept/decline, progression, earnings
- ✅ Hayve Business: registration, verification steps, payment links, QR, checkout page, refunds, payouts, developer preview
- ✅ Admin console: overview, users & roles, moderation, orders (sealed gifts), services, transactions, audit log
- 🟡 Real dispatch / maps (stylised vector map + simulated progression)
- ⬜ Real payment provider, KYC, card issuing (see PAYMENTS.md)

## Verified workflows (automated)
`tests/backend.test.ts` (21 tests) · `supabase/tests/99_gifting_privacy_test.sql` (22 checks) · browser E2E run during development:
sign up/in · profile edit · create/edit/delete listing · browse/search/filter · favourites · wishlist management · public wishlist ·
buy wishlist item for yourself · anonymous gift · recipient sees only Sold · purchaser identity unreachable · non-wishlist gifting impossible ·
double gifting impossible · failed payment releases item · marketplace purchase with escrow · food order · ride booking · rental booking ·
stay booking · courier delivery · send/request money · business registration & checkout · seller/kitchen/host/driver/courier flows · admin access control
