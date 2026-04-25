# Admin guide

Login at `/{locale}/admin/login` with the email and password issued by the
owner. Sessions live 24 h.

## First-time bootstrap (one-time)

1. Set `BOOTSTRAP_TOKEN` in GitHub Secrets to a long random string and run
   `Sync .env on VPS` so the value is on the server.
2. From the VPS or your laptop:
   ```bash
   curl -X POST https://<domain>/api/admin/auth/bootstrap \
     -H 'content-type: application/json' \
     -d '{"email":"owner@example.com","password":"<12+ chars>","token":"<BOOTSTRAP_TOKEN>"}'
   ```
3. Login at `/ru/admin/login`.
4. **Clear** `BOOTSTRAP_TOKEN` in GitHub Secrets and re-sync — the endpoint
   becomes permanently unusable.

## Tabs

### 📊 Дашборд
Live status of Phaeton/Sheets/Cloudinary/Telegram, total orders + today.

### 📝 Контент
Edit any localised string from `messages/*.json` overrides. Switch language
with the RU/KK/EN selector. Filter by key (e.g. `home.title`). Hit
**Опубликовать** in the header to flush the cache and apply changes.

### 🖼 Картинки
Each slot (e.g. `hero`, `og-default`) holds a Cloudinary image + multilingual
`alt` text. Drag-and-drop or click "Загрузить" → uploads via signed
`/api/admin/upload`, removes the previous version automatically.

### 🎨 Дизайн
Brand color, dark-mode brand color, accent color, logo text, default theme
(light/dark/system). Colors flow into CSS variables — the entire site
re-skins after **Опубликовать**.

### 💰 Настройки
Markup percentage (10–200%), express delivery price/hours, pickup address/hours,
manager phone/WhatsApp, Telegram chat ID. These never require a redeploy.

### 📦 Заказы
Last 200 orders. Search by phone, name, VIN, or part number. Change status
(Новый → В работе → Выполнен → Отменён) — writes back to `Orders` sheet.

### 👥 Доступы (owner-only)
Add users (manager or owner role), toggle activity, change own password.
Disabling a user immediately blocks login but preserves history.

## Publishing

Most edits are cached for 60 s. The **Опубликовать** button at the top of
the dashboard calls `revalidateTag('content')` / `revalidateTag('images')` /
`revalidateTag('theme')` and pushes changes instantly site-wide.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Admin tab spins forever | `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` missing or sheet not shared with the SA |
| Image upload fails | `CLOUDINARY_*` env vars missing |
| "Сервис недоступен" on a public page | Phaeton IP whitelist not in place — see SECURITY.md / VPS IP |
| Can't log in after pepper rotation | Expected — every user needs a password reset |
