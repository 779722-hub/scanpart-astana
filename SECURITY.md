# Security policy

## Reporting a vulnerability

Please email **security@scanpart.kz** (or the project owner directly via
Telegram/WhatsApp). Do **not** open a public GitHub issue.

We respond within 48 hours and patch critical issues within 7 days.

## Where secrets live

| Layer | Where |
| --- | --- |
| Local dev | `.env` (gitignored, never commit) |
| GitHub Actions | Settings → Secrets and variables → Actions |
| Production VPS | `/opt/scanpart/.env` (chmod 600, owned by deploy user) |
| Synced via | `.github/workflows/sync-env.yml` (manual trigger) |

The `.env` file is **never** in the repository. The `.env.example` is a
template with **empty values only** — never paste real secrets there. CI
runs `gitleaks` on every push to catch accidental commits.

## Rotation playbook

When a secret may be compromised — leaked screenshot, departed contractor,
suspicious account activity — rotate the affected credential **immediately**.

### Phaeton API (`PHAETON_USER_GUID`, `PHAETON_API_KEY`)

1. Contact Phaeton account manager → request new GUID + API key.
2. Update both in **GitHub Secrets** (Settings → Secrets → Actions).
3. Trigger `Sync .env on VPS` workflow → new `.env` lands on the VPS.
4. Verify: `curl https://<domain>/api/health` returns `phaeton: ok`.
5. Old key remains valid until Phaeton revokes it on their side. Confirm
   revocation by trying old key from a third location → expect 401/403.

### Google service account JSON

1. GCP Console → IAM → Service accounts → revoke the leaked key.
2. Generate a new JSON key for the same SA.
3. `base64 -w0 service-account.json` → paste into
   `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` GitHub secret.
4. Run `Sync .env on VPS` workflow.

### Telegram bot token

1. @BotFather → `/revoke` → confirm revocation.
2. Get new token from `/token` → update `TELEGRAM_BOT_TOKEN` secret.
3. Run `Sync .env on VPS`.

### Iron-session password (logs everyone out)

1. Generate: `openssl rand -base64 48` → 48-byte random.
2. Update `IRON_SESSION_PASSWORD` secret → `Sync .env on VPS`.
3. All admin sessions invalidated; admins re-login at `/admin/login`.

### Cloudinary

1. Cloudinary console → Settings → Security → API Keys → revoke leaked.
2. Create new API key → copy `api_key` + `api_secret`.
3. Update `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` secrets.
4. Run `Sync .env on VPS`.

### Bcrypt pepper (forces password reset for all users)

1. Generate new pepper: `openssl rand -base64 32`.
2. **Before** updating, all existing user password hashes will stop matching.
3. Reset every user's password manually (admin tab «Доступы») after the change.
4. Update `BCRYPT_PEPPER` secret → `Sync .env on VPS`.

### Bootstrap token (`BOOTSTRAP_TOKEN`)

After the first owner is created, **clear** this secret in GitHub →
`Sync .env on VPS`. The `/api/admin/auth/bootstrap` endpoint then becomes
permanently dormant (returns 403).

## Pre-commit guard

Install hooks once:

```bash
brew install pre-commit gitleaks   # macOS
# or
pip install pre-commit
pre-commit install
```

After install, every `git commit` runs `gitleaks --redact`, ESLint, and
TypeScript typecheck. Bypass (`--no-verify`) is forbidden by policy except
for hotfix branches with prior owner approval.

## Audit log

Edits to Sheets (`Content`, `ContentImages`, `Users`) record `updated_by` and
`updated_at` columns. Login attempts are rate-limited (5/IP/10min) and
failed attempts surface as 401 — review `journalctl -u docker -n 200` on
the VPS for the past 24 hours when investigating an incident.
