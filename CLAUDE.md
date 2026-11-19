# Hayve: notes for future development sessions

- Expo SDK 54 / React Native 0.81 / Expo Router 6, TypeScript. Routes live in `src/app/`. Use `npx expo install <pkg>` to add native deps.
- UI must only talk to `src/backend/api/*`. Never import `store.ts` or `getDb()` from screens.
- Read data with `useLive(() => api.x.y())`; mutate with `const { run } = useAction(); run(() => api.x.z(), { success: '…' })`.
- Design tokens/components: `src/design`. Brand: ultraviolet #3A1FD1, dark purple #110D2E, lime #C8F542 (sparingly), lavender #F6F5FF.
- Money is integer cents through the ledger (`src/backend/ledger.ts`). Never store balances. Label simulated money with `<SimBadge />`.
- Anonymous gifting privacy is a hard requirement; see docs/ARCHITECTURE.md. Keep tests green:
  - `npx vitest run` (backend), `bash supabase/tests/run.sh` (PostgreSQL RLS/gifting)
- Before finishing: `npx tsc --noEmit && npx expo lint && npx vitest run && npx expo export --platform web`.
- Bump `DB_VERSION` in `src/backend/seed.ts` when the stored data shape changes (it reseeds local data).
- iOS: pushing to `main`/`claude/**` builds an unsigned IPA via `.github/workflows/ios-ipa.yml` and publishes a pre-release.
- Official logo not yet supplied: see `src/design/brand.ts`.
