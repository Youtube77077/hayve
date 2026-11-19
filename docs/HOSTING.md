# Hosting on DigitalOcean

```
            ┌────────────── App Platform (HTTPS, auto-deploy on push) ──────────────┐
 browser ──▶│  web   static site (expo export)                     /               │
 iPhone  ──▶│  api   Node / Fastify (server/)                      /api            │
            │  migrate  pre-deploy job: server/sql + supabase/migrations           │
            └───────────────┬──────────────────────────────┬───────────────────────┘
                            ▼                              ▼
              Managed PostgreSQL 16            Spaces bucket + CDN
              (daily backups, RLS)             (profile pictures; DB stores URLs only)
```

## What is in the repo

- `.do/app.yaml`: the App Platform spec (web, api, migrate job, database).
- `server/`: the API. `npm run build && npm start`. Health check: `GET /health`.
- `server/sql/000_platform.sql`: the `auth` schema and request roles for plain PostgreSQL (Supabase is not required).
- `supabase/migrations/*.sql`: the Hayve schema with row level security. The API runs each request as role `authenticated` with `auth.uid()` set, so the database enforces privacy itself.

## One-time setup (you need a DigitalOcean account)

1. **Spaces:** create a bucket `hayve-media` in `ams3` with the CDN on. Create a Spaces access key. Add a CORS rule allowing `POST` from your website origin (uploads go straight from the app to Spaces with a presigned form).
2. **App:** `doctl apps create --spec .do/app.yaml` (or *Create App → Import spec* in the dashboard). Connect the GitHub repository and choose the branch to deploy.
3. **Secrets** (App settings → Environment variables): `JWT_SECRET` (`openssl rand -base64 48`), `SPACES_KEY`, `SPACES_SECRET`, `POSTMARK_TOKEN` (verification emails), `EXPO_PUBLIC_MAPBOX_TOKEN`.
4. **Database:** the spec creates a production Managed PostgreSQL cluster; daily backups are included. The migrate job applies the schema on every deploy.
5. **Domain:** add your domain in App Platform; HTTPS certificates are automatic.

## Security model

| Requirement | How |
|---|---|
| Passwords | argon2id (`server/src/security.ts`), never stored or logged in plain text |
| Owner admin | `rojyarzakholi@gmail.com` gets the admin role on sign-up (database trigger). No password is stored anywhere. |
| Admin access | Role + verified email + two-step verification (TOTP, session level `aal2`). Checked by the API and again by `is_admin()` in the database. |
| New admins | Only an existing admin can grant the role (enforced by a database trigger). |
| Audit | Every admin action is written to `admin_audit_log` (append-only). |
| Secrets | Environment variables only (`.env.example` lists them). |
| Uploads | Presigned POST limited to JPG/PNG/WEBP and 5 MB, then the API checks the real bytes, square-crops and resizes to 400×400 and 96×96, strips metadata and stores CDN URLs. |
| GDPR | `GET /me/export` (download data), `DELETE /me` (delete account; legally required payment records stay, anonymised). Privacy policy at `/privacy`. |
| Sessions | Short-lived JWTs with a version counter, so password changes, suspension and "sign out everywhere" revoke them. Login is rate limited and locks after repeated failures. |

## Status

The API foundation, schema and tests are complete and run in CI. The app itself still uses the simulated backend in `src/backend/` (that is what the IPA and website run today). Connecting the screens to the API means adding an HTTP adapter behind `src/backend/api/*` (the UI already only talks to that layer) and moving the remaining service flows (orders, rides, bookings, payouts) into API routes.
