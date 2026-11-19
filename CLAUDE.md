# Hayve: notes for future development sessions

- Expo SDK 54 / React Native 0.81 / Expo Router 6, TypeScript. Routes live in `src/app/`. Use `npx expo install <pkg>` to add native deps. `.npmrc` sets `legacy-peer-deps` (needed for `@rnmapbox/maps` + `mapbox-gl` v3); keep `vite` as an explicit devDependency for vitest.
- UI must only talk to `src/backend/api/*`. Never import `store.ts` or `getDb()` from screens.
- Read data with `useLive(() => api.x.y())`; mutate with `const { run } = useAction(); run(() => api.x.z(), { success: '…' })`.
- Design: `src/design`. Colours ONLY indigo #4F46E5, black #0E0E10, white, greys #F4F4F6/#E5E6EA/#6B6E78. No gradients, no coloured tiles or icons, no tinted backgrounds. Lucide outline icons via `Icon` (indigo only for active/selected). Plus Jakarta Sans via `font()`. 8px grid, 12–16px radius. Logo/wordmarks: `src/design/logo.tsx`, `src/features/nav/Wordmarks.tsx` ("Hayve" always bold).
- Emoji: at most one per screen (home greeting, small confirmations) via `<Emoji>` (native on Apple, Fluent elsewhere).
- Money is integer cents through the ledger (`src/backend/ledger.ts`). Never store balances. Label simulated money with `<SimBadge />` ("Demo").
- Fees and Wave Back values live in `src/backend/config.ts` (admin overrides in `db.settings`). Buyers see one "Fees" line, never a percentage. Never say cashback/points/credits.
- Hayve Send exists only inside the Shop checkout and order page; not in nav or Home.
- Maps: always `HayveMap` from `src/features/map` (Mapbox; keys from env). See docs/MAPS.md.
- Anonymous gifting privacy is a hard requirement; see docs/ARCHITECTURE.md. Keep tests green:
  - `npx vitest run` (app backend), `bash supabase/tests/run.sh` (PostgreSQL), `cd server && npx vitest run` (API)
- Before finishing: `npx tsc --noEmit && npx expo lint && npx vitest run && npx expo export --platform web`.
- Bump `DB_VERSION` in `src/backend/seed.ts` when the stored data shape changes (it reseeds local data).
- Owner admin: `rojyarzakholi@gmail.com` (config.ts and migration 0005). Admin needs verified email + 2FA; only admins add admins. Preview codes: `SIM_CODE` 246810.
- Hosting: DigitalOcean (`.do/app.yaml`, `server/`, docs/HOSTING.md). The app still runs on the simulated backend.
- iOS: pushing to `main`/`claude/**` builds an unsigned IPA via `.github/workflows/ios-ipa.yml` and publishes a pre-release.
