# Hayve prompt pack (roadmap)

The owner's prompts for building Hayve, in the order they're meant to run: 0 → 1 → 2 → 16 → 3 … 14 → 15.
The shared rules are also in `CLAUDE.md`, so every session follows them. Status per prompt is tracked at the bottom.

## Shared rules

- Hayve is one app, one account, one balance: Hayve Pay, Shop, Rides, Eats, Stays, Rentals, plus partner apps (Hayve Seller, drivers, couriers, restaurants, hosts, rental owners).
- Brand: white interface, indigo accent, black text and black line icons. No coloured or tinted service tiles. Clean, calm, lots of whitespace.
- Fees are shown to buyers only as a "Fees" amount, never as a percentage. Money back on payments is real balance money and is never called "cashback".
- Before changing anything: read the codebase, find the relevant files, and tell me in a short list what exists, what's broken and what you'll change.
- Don't rewrite working features from scratch. Refactor step by step and keep the app running after each step.
- Every new feature needs: loading states, empty states, error states with a retry, and mobile-first layout.
- Never hard-code API keys. Put them in .env and add them to .env.example with a placeholder.
- Write tests for logic (money, statuses, timers, route maths). Run the tests and the build before you say you're done.
- At the end, give me: what you changed (files), how to test it by hand, and anything you couldn't finish.
- UX rules for every screen (full version in Prompt 16): one obvious primary action per screen; the primary button is full width, in the bottom third, in indigo, and is the only indigo element; hide advanced options until needed; never put two equally important buttons next to each other; delete/cancel buttons smaller and away from the primary button.
- Every tap responds instantly (pressed state, then "Processing payment…" etc.); skeleton loaders instead of blank screens; progress for long tasks; confirm success; error messages say how to fix the problem.

## Prompt 0: Audit the whole app first
1. Map the project: framework(s), folder structure, backend, database, auth, payments, map library, hosting config (DigitalOcean).
2. For each service (Pay, Shop, Rides, Eats, Stays, Rentals, business/partner side) list: which screens exist, what works, what's fake/placeholder/mock data, and what's broken.
3. List all UI inconsistencies: different button styles, spacing, fonts, colours outside indigo/white/black, coloured service tiles, duplicated components.
4. List technical debt: duplicated logic, missing types, no error handling, secrets in code, missing tests.
5. Write everything to docs/HAYVE_AUDIT.md with a prioritised fix list (P0 = broken or unsafe, P1 = core experience, P2 = polish).
Don't change any code in this session. Only produce the audit.

## Prompt 1: Maps and routing overhaul (Uber-level)
Phase 1, research (docs/MAP_RESEARCH.md): how Uber picks pickup/destination (autocomplete, recent/saved places, fixed centre pin, reverse geocoding, snapped pickup points); routing engine + polyline + separate ETA + alternatives; map-matching, interpolation and bearing for the car; re-routing and the route shrinking; muted base map, route casing, camera padding for the bottom sheet; H3. Compare hosted APIs (Mapbox, Google, HERE, TomTom) vs self-hosted OSM on DigitalOcean (OSRM/Valhalla/GraphHopper + Nominatim/Photon/Pelias + MapLibre). Recommend one setup for launch and one for scale.
Phase 2, build: MapProvider / RoutingProvider / GeocodingProvider / MapMatchingProvider abstraction; routes only from the routing engine, never straight lines (error + retry on failure); indigo route with darker casing, travelled part greyed, ETA bubble; camera fit with sheet padding, recentre button; pickup/destination selection with debounced autocomplete, recent/saved places, centre pin, snapped pickup and suggested points, fares/ETA per ride type; live trip with map-matching, ~60fps interpolation, bearing, deviation detection (>~50 m for >~10 s) and re-route, live ETA, deviation log; same map system for Eats tracking, Stays price pins with clustering, Rentals pickup/return, Shop approximate area only; light muted style; caching, debouncing, clustering, rate limits; tests (polyline decoding, deviation, bearing, interpolation, caching).
Phase 3, verify: simulate a full trip incl. one off-route; remove every straight-line route; summary.

## Prompt 2: Design system
One design system (colour tokens, type scale, 4/8 spacing, radius, shadows, one line-icon set); shared components (Button primary/secondary/ghost/destructive, Input, SearchBar, Card, ListItem, BottomSheet, Tabs, Badge incl. "Verified business", PriceRow with "Fees" as an amount, StatusTimeline, EmptyState, ErrorState, Skeleton, Toast); replace one-off styles; no coloured tiles; Home with one search for everything, balance on top, service icons, "continue where you left off"; max 5 bottom tabs (e.g. Home, Activity, Pay, Messages, Account); accessibility (contrast, 44px targets, labels); list every screen changed.

## Prompt 3: One balance (Hayve Pay core)
Double-entry ledger with idempotency keys and immutable history; Available / Pending (with release date) / Reserved (which transaction and why); spend balance anywhere with card for the rest; one searchable activity history with receipts; payout timeline; "Money back" as Available balance; buyers see "Fees", sellers see a full breakdown; PaymentProvider interface (Stripe Connect / Adyen / Mollie), licensed partner holds funds, docs/PAYMENTS_COMPLIANCE.md, sandbox only; fraud basics (velocity, new-account limits, step-up for large withdrawals); tests for every ledger operation incl. refunds, partial refunds, chargebacks, reversing reserved amounts.

## Prompt 4: Hayve Protection (disputes and automatic refunds)
One status timeline per order (Paid & secured → In progress → Delivered/Completed → Funds released) with per-service release rules; evidence-based disputes with deadlines, never assuming either side is right; automatic resolution (Eats late → credit, missing item → instant refund within limits; Rides long route → fare adjustment; Shop no tracking movement for X days → refund; Stays/Rentals provider cancels → instant refund + alternatives); abuse protection (refund rates, outliers to human review); human appeals with plain reasons; admin case panel; tests per rule.

## Prompt 5: Support that answers
One Help screen starting from recent transactions; guided flows per common problem; AI first-line help that can act, always with "Talk to a person" (mandatory for money/account restrictions); cases with status, promised response time and history; in-app chat between both sides with support joining, masked contact details; admin queue with priorities, canned replies, refund/credit/escalate.

## Prompt 6: Trust, verification, one reputation
Verification levels (phone → ID via provider, sandbox → verified business with business-registry check and badge); one reputation profile (transactions, ratings per role, reliability, member since, response time); no sensitive data public, legitimate cancellations don't hurt; payments only inside Hayve (warn on outside links/phone/IBAN in chat); payment status from the ledger ("Payment confirmed by Hayve"); scam pattern warnings.

## Prompt 7: Hayve Rides
Guaranteed fare; options Cheapest / Fastest pickup / Top-rated driver + vehicle types; honest ETAs from real positions; driver reliability and instant priority re-match on driver cancel; rider cancellation fee explained before booking/cancelling; long-route protection; safety (share trip, emergency button, PIN, driver/car photo and plate); scheduled and airport rides with flight tracking; driver side: earnings per trip, destination before accepting, earnings to balance.

## Prompt 8: Hayve Eats
Customer: food, delivery and "Fees" separate, in-store price flag; accurate ETA + tracking stages; late credit and missing-item refund; photo proof, drop-off instructions, map pin; group/scheduled orders, reorder; one chat with restaurant and courier. Restaurant: order screen, prep time, out-of-stock, pause; clear commission and fast payouts; own couriers option. Courier: earnings before accepting, tips, route.

## Prompt 9: Hayve Shop
Buyers: protection on every purchase; verified local collection by QR handover; offers with expiry and minimums, reservations expiring; condition templates with flaw photos; shipping labels and tracking (Hayve Send only for person-to-person). Sellers: AI listing creator (suggestions reviewed before publishing); packing evidence and appeals; earnings dashboard; bulk tools and CSV import; buyer reliability.

## Prompt 10: Hayve Pay, better than Tikkie
Send by username, contact or QR (no links); requests with description, receipt photo, friendly reminders; splits equal/by amount/by item with who paid; groups with "who owes who" and settle-up; QR payments for small businesses; ledger-verified confirmations, refunds to the original transaction.

## Prompt 11: Hayve Stays
Guests: total price upfront (cleaning, taxes, "Fees"); plain cancellation timeline; verified photos; host-cancellation refund + alternatives + one-tap rebook; check-in instructions at the right time, issue reporting; map price pins. Hosts: multi-property dashboard; iCal sync with Airbnb/Booking.com; automated guest messages; cleaning coordination with checklist, photos and payment from balance; guest verification, house rules, condition photos, damage claims with deposit Reserved; pricing suggestions, last-minute discount; income/expense export.

## Prompt 12: Hayve Rentals
Renters: full price before booking (insurance compared, deposit, mileage, fuel, young-driver fees); deposit as Reserved with release date; digital inspection photos at pickup/return; digital check-in; return reminders; guaranteed class or upgrade/refund. Rental companies: fleet status and calendars, maintenance/document reminders, pricing tools, earnings and deposits. Private owners: verified listing flow, insurance partner required before launch, key handover options.

## Prompt 13: Travel
docs/TRAVEL_OPTIONS.md (booking/ticketing APIs like Duffel or Amadeus vs search-only); real final price incl. bags, self-transfer warnings; no unexplained price changes; one trips screen grouping flights, stays, rentals, rides, food; flight change alerts adjusting rides/rentals/check-in; price tracking and flexible dates; start with search + alerts if booking isn't possible yet, and say so.

## Prompt 14: Hayve for Business
One business account with several roles and one dashboard; earnings overview (Available/Pending/Reserved, fees, payout timeline); B2B payments with invoices; monthly reports and VAT-ready exports; AI business assistant on the business's own data; Hayve Store onboarding with registry check and bulk import; optional transparent promotions.

## Prompt 16: UX, onboarding and growth rules (after Prompt 2)
A. Onboarding first, sign-up after (Duolingo). No account until the user wants to save or do a first real action; only questions that change what the user sees (comment per screen); tappable cards; skip irrelevant follow-ups; personalised first Home; benefit wording; progress bar that never starts at zero and shows what's left near the end; answers stored locally then attached at sign-up; Apple, Google, phone, email sign-up.
B. One primary action, full width, bottom third, only indigo element; advanced options hidden; never two equal buttons side by side; one font family, few sizes.
C. Instant pressed states, "Processing payment…", skeletons, clear success messages, errors that say how to fix, show the work while waiting, live tracking.
D. Max 5 tabs, Home far left, Account far right, settings inside Account, optional centre create action; standard gestures.
E. Open on the most useful screen; pre-select the recommended option; never pre-check opt-ins, subscriptions or paid add-ons.
F. Growth: city-by-city launch, supply first, waitlist with invites; two-sided referrals with abuse limits; shareable cards ("Sold in 2 hours", "Hayve Year"); events/analytics with consent.
G. Legal basics: privacy policy and terms in onboarding and Account, matching reality; cookie banner with equal Reject; unsubscribe links; no fake reviews; honest AI claims; no biometrics without consent, age gate; cancel subscriptions as easily as subscribing.
H. Website checklist: language switcher, dark mode, searchable FAQ, smart search, share, form autosave, password toggle, listing filters, recently viewed, save for later, text size, back to top, own domain.
I. docs/APP_STORE_PLAN.md: first screenshot "One account. One balance. Everything.", custom product pages per audience.
Finish with every screen changed and the new onboarding flow from first open to first action.

## Prompt 15: Final quality pass
All tests, lint and build; click through every main flow as user and each partner; check design system and Prompt 16 rules; search for secrets, user data in logs, straight-line routes, fee percentages to buyers, "cashback"; performance; docs/RELEASE_CHECKLIST.md (ready / mock / needs licence, partner or legal check).

## Status

| Prompt | Status |
|---|---|
| 0 Audit | Done: docs/HAYVE_AUDIT.md |
| 16 A Onboarding | Done: `src/app/start.tsx`, `src/features/onboarding/` (no sign-up wall, personalised first screen). Apple/Google/phone sign-up need the real auth server |
| 1, 2, 3–14, 16 B–I, 15 | Not started (see the audit's fix list) |
