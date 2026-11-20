# Hayve architecture

## Decisions

### One Expo codebase for iPhone, iPad and web (instead of Expo + separate Next.js)
The brief suggested React Native + Expo for iOS and Next.js for the website. Instead, the website is the **same Expo Router app rendered with react-native-web**.

- Business logic, data models, design tokens and components are shared **100%**, not just "where possible".
- Every route works on the web as a real URL: `/u/noor`, `/product/:id`, `/paylink/:id`, `/track/:code`.
- The layout adapts. Below 768px you get a bottom bar (Home, Shop, Ride, Bites, More). At 768px and wider (iPad, desktop) you get a sidebar with the logo, Home, Search, the six products and account items.

If SEO-heavy marketing pages are needed later, a small Next.js site can be added for those pages only. It would consume the same Supabase backend.

### Navigation
The products are Hayve Shop, Pay, Ride, Bites, Drive and Stay, plus Home, Search and Profile (`src/app/(tabs)/*`). Each product name uses an illustrated, animated second word (`src/features/nav/Wordmarks.tsx`, 150–250 ms, respects reduced motion). Hayve Send is not a destination: it only exists inside the Shop checkout and order page.

- **iPhone:** Home, Shop, Ride and Bites sit in the bar; **More** (`/services`) opens Pay, Drive, Stay, account items and partner apps.
- **iPad / desktop:** a permanent sidebar (`src/features/nav/TabBar.tsx`). It uses React Navigation's `tabBarPosition: 'left'` with a custom tab bar.
- Detail screens (product, property, checkout, tracking…) are stack routes above the tabs. On wide screens they use two-column `Split` layouts.

### Backend: a simulated server with a real boundary
There are no Supabase credentials yet. To make every workflow genuinely work and persist, the app runs a **simulated backend** in `src/backend/`:

| File | Role |
|---|---|
| `types.ts` | Domain model, mirroring the SQL schema |
| `store.ts` | In-memory DB persisted to AsyncStorage / localStorage, with change subscription |
| `ledger.ts` | Double-entry ledger: holds, captures, escrow release, refunds, derived balances |
| `seed.ts` | Realistic sample data (users, listings, restaurants, cars, stays, history) |
| `api/*.ts` | The API surface. Each function authenticates (`me()`), checks roles, validates and returns **viewer-specific DTOs** |

UI code only imports `src/backend/api`. Screens read data with `useLive(() => api.x())`, which re-renders on any data change. They write through `useAction()`, which shows a loading state and toast feedback.

### Moving to Supabase
`supabase/migrations/` contains the production schema: profiles and roles, the marketplace, the wallet ledger, gifting and every service. RLS is on every table. The adapter work:

1. Create a Supabase project and apply the migrations (`supabase db push`). Configure Auth (email + password), and Storage buckets for `listing-photos`, `avatars`, `property-photos` and `vehicle-photos`.
2. Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
3. Re-implement the `src/backend/api/*` functions with `supabase-js`, keeping the same signatures. Simple reads become table selects that RLS filters. State changes become `rpc()` calls to security definer functions; gifting (`reserve_wishlist_gift`, `confirm_wishlist_gift`, `wishlist_for`, `my_sent_gifts`) is already written and tested.
4. Swap `useLive` to subscribe to Supabase Realtime channels for orders, rides, deliveries and messages.

## Anonymous wishlist gifting: the privacy model

The requirement: the recipient can never find out who bought a gift, through the UI, the API, notifications or the database.

| Rule | Simulated backend | PostgreSQL |
|---|---|---|
| Purchaser identity stored separately | `giftOrders`, `giftReservations` tables | `private.gift_orders`, `private.gift_reservations`. The schema isn't exposed by the API, and API roles have no grants |
| Orders never name the purchaser | `buyerId: null` for gifts | `CHECK (kind = 'gift' AND buyer_id IS NULL)` |
| Recipient has no access path | `listPurchases` filters `kind = 'purchase'`; `viewOrder` returns null for recipients | No RLS policy references `recipient_id` |
| Recipient isn't notified | Only purchaser and seller get notifications | Same, inside `confirm_wishlist_gift` |
| Recipient can't see a checkout in progress | `reserved` is shown as `available` to the owner | Reservations live in the private schema |
| Seller can't identify the purchaser | Order counterparty "Hayve Gift · anonymous buyer". Money flows purchaser → escrow → seller | Same escrow split, so the seller's transactions never reference the purchaser's account |
| Purchaser doesn't get the address | `shipTo: null` in the purchaser's view | `my_sent_gifts()` omits the address; purchasers have no RLS access to the order row |
| Never gifted twice | Synchronous check-and-set + reservation | `SELECT … FOR UPDATE` + `UNIQUE (wishlist_item_id)` |
| Only wishlist items can be gifted | `reserveGift` takes a wishlist item id | Same; verified by tests |
| Failure releases the item | Hold voided, reservation removed | The RPC runs in one transaction, so it rolls back |

Two test suites check this: `tests/backend.test.ts` (Vitest) and `supabase/tests/99_gifting_privacy_test.sql` (real PostgreSQL). Both run in CI.

A caveat for the offline simulation: all sample users' data lives on one device, so someone with a debugger could read the raw storage. That's inherent to an offline demo. The production privacy guarantee comes from the PostgreSQL layer above.

## Money

- All amounts are integer cents in the account's currency (USD, CAD, GBP, EUR or AUD, from the profile's country; see `src/backend/regions.ts`). The preview does not convert between currencies; in production the payment partner handles FX.
- Balances are derived from the ledger: available = posted + held, pending = pending, reserved = −held.
- Checkout flows **hold** funds first, then **capture** once everything else succeeds, or **void** on failure.
- Marketplace sales and host payouts are **pending** until delivery or completion, then **released**.
- Partner earnings (drivers, couriers) are paid from the Hayve fees account after the job completes.
- Card payments pass through the wallet (card → wallet → merchant), so every receipt is in one history.

## Design system

- `src/design/tokens.ts` holds the colours, type scale, spacing, radii, shadows and service metadata.
- Components:
  - Primitives: Button, IconButton, Input, Chip, Badge, Card, Photo with fallback, Avatar, Rating
  - Layout: Screen, Header, Section, Group/ListRow, Grid, Split, HScroll
  - Feedback: Toast, Sheet, ConfirmSheet, EmptyState, ErrorState, Skeleton, Notice
  - Forms: Segmented, Stepper, SwitchRow, Select, RangeCalendar
  - Visuals: Gallery, BarChart, Timeline, SimQR; logo in `logo.tsx`; maps in `src/features/map` (HayveMap, RouteMap)
- Colours are only indigo, black, white and three greys. Indigo marks the primary action, active navigation, links and selected items; everything else is black on white. No gradients or coloured tiles.
