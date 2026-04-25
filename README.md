# SCANPART.ASTANA

Production-ready web service for fast auto-parts search in Astana with a
full-featured CMS admin panel. Built on Next.js 14 App Router, TypeScript,
Tailwind. Search runs against the Phaeton.kz wholesale API restricted to
the Astana warehouse, applies a manager-configurable markup, writes every
order to Google Sheets, pings the manager in Telegram and opens WhatsApp
with a pre-filled message for the customer.

- Languages: **RU / KZ / EN** (next-intl, URL-prefixed routing, all texts
  CMS-editable from the admin panel)
- Themes: **auto / day / night** (next-themes, Tailwind `dark:`, brand colors
  driven by CSS variables and editable in admin)
- Search channels: **VIN** (NHTSA vPIC), **part number**, **part name**
- Result set: 1 original + up to 3 analogs, in stock at Astana, sorted by price
- Admin panel with 7 tabs: Dashboard, Content, Images, Theme, Settings, Orders, Users
- Roles: **owner** / **manager**, multi-user, bcrypt + iron-session
- Image hosting: **Cloudinary** (auto WebP/AVIF, CDN)

## Quick start (local dev)

```bash
cp .env.example .env       # fill in real values from password manager
npm install
npm run dev                # http://localhost:3000/ru
```

First-time setup of Google Sheets:

```bash
npm run sheets:bootstrap   # creates Settings/Orders/Users/Content/ContentImages/Theme tabs
npm run seed:content       # migrates messages/*.json into Sheets `Content`
```

Create the first owner via the bootstrap endpoint (see [docs/admin-guide.md](docs/admin-guide.md)).

## Architecture

```
GitHub repo (private)
    │
    ├── Actions: ci.yml      → secrets-scan, lint, typecheck, build (every PR)
    ├── Actions: deploy.yml  → build & push GHCR + SSH deploy (push to main)
    └── Actions: sync-env.yml → push GitHub Secrets to /opt/scanpart/.env (manual)

VPS (Ubuntu + Docker + nginx + certbot, static egress IP for Phaeton whitelist)
    │
    ├── /opt/scanpart/.env (chmod 600, never in git)
    ├── /opt/scanpart/docker-compose.yml
    └── nginx → :3000 (Next.js container from ghcr.io/<org>/scanpart-astana)

External services:
    ├── Phaeton.kz API           — IP-whitelisted server-side calls
    ├── Cloudinary               — image storage + CDN (signed uploads)
    ├── Google Sheets API v4     — Settings, Orders, Users, Content, ContentImages, Theme
    ├── Telegram Bot API (grammY) — manager notifications
    └── NHTSA vPIC               — free public VIN decoder
```

All Phaeton secrets live **server-side only** (`PHAETON_USER_GUID`,
`PHAETON_API_KEY`). Every call is proxied through `/api/search/*` — the
browser never sees them. API responses never reveal the upstream provider.

## Deploy on VPS

### One-time VPS setup

```bash
# As root on a fresh Ubuntu 24.04:
apt update && apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
mkdir -p /opt/scanpart
chown -R $USER:$USER /opt/scanpart

# Copy compose file (or pull from repo):
cat > /opt/scanpart/docker-compose.yml <<'YAML'
services:
  web:
    image: ghcr.io/<your-org>/scanpart-astana:latest
    container_name: scanpart-astana
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
    logging:
      driver: journald
YAML

# Configure nginx as reverse proxy with SSL:
certbot --nginx -d scanpart.kz -d www.scanpart.kz
```

### GitHub Secrets to set

In repo Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `PHAETON_USER_GUID` | from Phaeton manager |
| `PHAETON_API_KEY` | from Phaeton manager |
| `PHAETON_CONTRAGENT_GUID` | from Phaeton manager |
| `PHAETON_ASTANA_WAREHOUSE_ID` | optional override |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | `base64 -w0 service-account.json` |
| `SHEETS_SPREADSHEET_ID` | the spreadsheet ID from its URL |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | from Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | from Cloudinary dashboard |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `IRON_SESSION_PASSWORD` | `openssl rand -base64 48` |
| `BCRYPT_PEPPER` | `openssl rand -base64 32` |
| `BOOTSTRAP_TOKEN` | `openssl rand -base64 24` (delete after first owner) |
| `DEPLOY_SSH_HOST` | VPS IP/hostname |
| `DEPLOY_SSH_USER` | deploy user on VPS |
| `DEPLOY_SSH_KEY` | private key for deploy user |
| `DEPLOY_SSH_PORT` | (optional, defaults 22) |
| `NEXT_PUBLIC_SITE_URL` | https://scanpart.kz |

Then trigger **Sync .env on VPS** workflow once (manually) — it builds the
`.env` from secrets and pushes it to `/opt/scanpart/.env`.

### Operational preconditions

1. **Static egress IP** of the VPS must be whitelisted with Phaeton support.
2. **ContragentGuid** from shop.phaeton.kz manager.
3. **Google Sheets**: share the spreadsheet with the service-account email
   as Editor.
4. **Telegram**: create a bot via @BotFather, add to the manager's chat,
   fetch `chat_id` via `getUpdates`, store in `Settings!telegram_chat_id`.
5. **Manager WhatsApp** in E.164 without `+` (e.g. `77000000000`) into
   `Settings!manager_whatsapp_e164`.

## Security

See [SECURITY.md](SECURITY.md) for:

- Secret rotation playbooks for every credential
- Pre-commit gitleaks hook installation
- Audit log locations

## Admin panel

See [docs/admin-guide.md](docs/admin-guide.md) for:

- First-time owner bootstrap
- Tab-by-tab usage guide
- Publishing (cache flushing) workflow
- Troubleshooting

## Verification checklist

- [ ] CI green on every push (`secrets-scan` + `lint` + `typecheck` + `build`)
- [ ] `curl https://<domain>/api/health` → `{ ok: true, checks: { phaeton: "ok", … } }`
- [ ] `/ru` renders with hero (admin-uploaded), 4 buttons, theme & language switchers
- [ ] VIN search: `2T1BURHE0JC014889` → "TOYOTA Corolla 2018"
- [ ] Article search: real Phaeton article → original + 3 analogs sorted by price
- [ ] Place an Express order → row appears in Google Sheets, manager gets a Telegram message, client sees WhatsApp button
- [ ] Admin login: `/ru/admin/login` → dashboard
- [ ] Admin → Content: edit `home.title`, hit "Опубликовать" → main page reflects within 1 s
- [ ] Admin → Картинки: upload new hero → main page picks it up
- [ ] Admin → Дизайн: change brand color → all `bg-brand` elements re-skin
- [ ] Admin → Доступы (owner-only): add a manager user, log in as them → "Доступы" tab is hidden

## Project layout

```
scanpart-astana/
├── app/                 # App Router pages + API routes
│   ├── [locale]/        # /ru, /kk, /en
│   │   ├── admin/       # admin dashboard (sessions) + login
│   │   ├── search/{vin,article,name}/
│   │   ├── results/, order/{express,pickup}/, info/
│   │   └── layout.tsx   # i18n + theme + ThemeStyle
│   └── api/
│       ├── admin/{auth,content,images,theme,settings,orders,users,upload,revalidate}/
│       ├── search/, vin/, order/, session/, health/
├── components/          # React components
│   ├── admin/           # admin tabs (dashboard, content, images, theme, settings, orders, users)
│   ├── theme-style.tsx  # injects CSS variables from Sheets `Theme`
│   └── …
├── lib/
│   ├── auth/            # users, guards, rate-limit
│   ├── phaeton/         # Phaeton API client + Astana resolver
│   ├── sheets/          # googleapis wrapper (Settings/Orders/Users/Content/ContentImages/Theme)
│   ├── vin/             # NHTSA vPIC + validator
│   ├── cloudinary.ts    # signed image upload
│   ├── content.ts       # cached Sheets content + i18n merge
│   ├── markup.ts        # price markup with [10..200]% clamp
│   └── …
├── messages/            # baseline i18n (overridable from Sheets)
├── scripts/             # tsx CLI: bootstrap-sheets, seed-content
├── .github/workflows/   # ci.yml, deploy.yml, sync-env.yml
├── .pre-commit-config.yaml
├── .gitleaks.toml
├── Dockerfile, docker-compose.yml
├── SECURITY.md, CONTRIBUTING.md, LICENSE, CODEOWNERS, .editorconfig
└── README.md
```

## Licence

Proprietary — see [LICENSE](LICENSE).
