# Hayve on your DigitalOcean droplet

One server runs everything: the website, the API and the PostgreSQL database, behind Caddy.
It restarts itself after crashes and reboots, installs security updates automatically and
backs up the database every night.

```
 internet ──▶ Caddy :80/:443 ──┬──▶ website (static files)      /
                               └──▶ API (Node)                  /api ──▶ PostgreSQL (private)
```

## 1. Droplet size

Ubuntu 24.04 (or 22.04), at least **2 GB RAM** (Basic, $12/month). 1 GB works too: the script adds
4 GB of swap so the website build doesn't run out of memory, but builds are slower.

## 2. Run the setup (one command)

In the DigitalOcean dashboard open your droplet → **Access** → **Launch Droplet Console**
(or `ssh root@YOUR_IP`), then paste:

```bash
curl -fsSL https://raw.githubusercontent.com/Youtube77077/hayve/main/deploy/droplet/setup.sh | bash
```

The first run takes 5–15 minutes. It ends with `Hayve is live: http://YOUR_IP`. Open that address.

What it does:

- installs Docker, turns on the firewall (only SSH, HTTP and HTTPS are open) and automatic security updates
- downloads Hayve to `/opt/hayve`
- creates `/opt/hayve/deploy/droplet/.env` with a random database password and session secret (only on the first run)
- builds and starts the website, API and database (`restart: always`, so they come back after a reboot)
- backs up the database every night at 03:30 to `/opt/hayve-backups` (14 days kept)

## 3. Update to the newest version

```bash
bash /opt/hayve/deploy/droplet/setup.sh
```

This pulls the latest `main`, rebuilds and restarts. Your database and secrets are kept.

## 4. Add your domain later

1. At your domain registrar (or DigitalOcean → Networking → Domains) add an **A record**
   pointing your domain (for example `hayve.com` or `app.hayve.com`) to the droplet's IP.
2. Wait until it resolves (`ping your-domain` shows the droplet IP), then run:

```bash
bash /opt/hayve/deploy/droplet/setup.sh --domain your-domain.com
```

Caddy gets a free HTTPS certificate and renews it automatically.

## 5. Optional keys

Edit `/opt/hayve/deploy/droplet/.env` (`nano /opt/hayve/deploy/droplet/.env`), fill in what you have, then run
`setup.sh` again:

| Setting | What it turns on |
|---|---|
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Mapbox maps on the website (without it the website uses free OpenStreetMap maps) |
| `POSTMARK_TOKEN`, `EMAIL_FROM` | Verification emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Real card checkout for adding money and paying links |
| `SPACES_*` | Profile pictures stored in DigitalOcean Spaces |

## Useful commands

```bash
cd /opt/hayve/deploy/droplet
docker compose ps                       # what's running
docker compose logs --tail 100 api      # API logs (also: web, db)
docker compose restart                  # restart everything
ls -lh /opt/hayve-backups               # backups
# Restore a backup:
docker compose exec -T db pg_restore -U hayve -d hayve --clean < /opt/hayve-backups/hayve-YYYY-MM-DD.dump
```

## Good to know

- The website and the iPhone app still run on Hayve's built-in simulated backend (demo data, simulated
  money). The API and database run on the server and are ready for when the screens are connected to them.
- The database is never exposed to the internet; only the API can reach it.
- Turn on **Backups** for the droplet in the DigitalOcean dashboard too (weekly snapshots of the whole server, +20%).
- Prefer a managed setup with no server to look after? `.do/app.yaml` deploys the same thing to App Platform (see HOSTING.md).
