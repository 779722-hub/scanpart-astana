# SCANPART Astana — полный справочник по проекту

> Как всё устроено и работает. Обновлено: 2026-07-19.
> Этот файл — «карта» проекта для быстрого возврата в контекст.

---

## 1. Что это

Интернет-магазин автозапчастей **только по Астане**. Клиент подбирает деталь по
VIN / марке / названию / артикулу, оформляет заказ, получает доставкой (Экспресс)
или самовывозом. Есть админ-панель для управления и **система доставки с
курьерами** (живой GPS, маршруты, оплата).

- **Домен:** scanpart.kz (hoster.kz → Vercel).
- **Хостинг:** Vercel, деплой из GitHub (push в `main` → авто-деплой).
- **Стек:** Next.js 14.2 (App Router), TypeScript, Tailwind 3.4, next-intl
  (ru по умолчанию, + kk, en), iron-session, Google Sheets как БД, Cloudinary
  для картинок.
- **БД:** одна Google-таблица (`SHEETS_SPREADSHEET_ID`), листы описаны ниже.

---

## 2. Поставщики (источники наличия и цен)

| Код | Поставщик | Как ходим |
|-----|-----------|-----------|
| Р1  | Phaeton   | `PHAETON_*` — API `api.phaeton.kz` (apikey + контрагент) + веб-логин `shop.phaeton.kz` (распродажа, фото) |
| М2  | Shate-M   | `SHATEM_*` — торговый apikey-API + Laximo VIN-каталог (cookie-сессия `laximoExtended`) |
| Т3/Т4/Т5 | Autotrade | `AUTOTRADE_*` — JSON-API `/api_proxy.php`, только склады Астаны |

Код источника (Р1/М2/Т3…) — внутренний, покупателю не показывается. Он же
связывает позицию заказа со **складом** (лист Warehouses, поле `source_code`).

---

## 3. Env-переменные (Vercel → Production)

**Ядро:** `SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` (service
account, base64 JSON), `IRON_SESSION_PASSWORD` (пароль сессий), `BCRYPT_PEPPER`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`.

**Cloudinary:** `CLOUDINARY_URL` / `CLOUDINARY_CLOUD_NAME` (dkwsgkysk) /
`CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_FOLDER` /
`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.

**Поставщики:** `PHAETON_API_KEY`, `PHAETON_BASE_URL`, `PHAETON_CONTRAGENT_GUID`,
`PHAETON_ASTANA_WAREHOUSE_ID`, `PHAETON_PROXY_URL`, `PHAETON_SHOP_BASE`,
`PHAETON_SHOP_LOGIN`, `PHAETON_SHOP_PASSWORD`; `SHATEM_API_KEY`,
`SHATEM_BASE_URL`, `SHATEM_ASTANA_LOCATION_CODE`, `SHATEM_SESSION_COOKIE`,
`SHATEM_WEB_*`; `AUTOTRADE_API_KEY`, `AUTOTRADE_BASE`, `AUTOTRADE_LOGIN`,
`AUTOTRADE_PASSWORD`, `AUTOTRADE_SESSION_COOKIE`, `AUTOTRADE_PROXY_URL`.

**Интеграции:** `TELEGRAM_BOT_TOKEN` (уведомления менеджеру), `WHATSAPP_TOKEN` +
`WHATSAPP_PHONE_ID` (код выдачи клиенту), `CRON_SECRET` (крон распродажи),
`BOOTSTRAP_TOKEN` / `DIAG_TOKEN` (служебное).

**Геокодер (опционально, для точности адресов):** `YANDEX_GEOCODER_KEY` — если
задан, адреса определяет Яндекс.Геокодер (точнее для КЗ), иначе — бесплатный
Nominatim (OSM). **Ключа сейчас нет** → работает Nominatim.

VIN-OCR-ключи (Gemini/OpenAI/OpenRouter) и др. хранятся **в настройках (лист
Settings)**, не в env — правятся в админке.

---

## 4. Листы Google-таблицы (схемы)

> Правило: **новые колонки добавляем В КОНЕЦ**, существующие не сдвигаем.
> `ensureSheetStructure()` создаёт недостающие листы/заголовки идемпотентно.
> ⚠️ Локаль таблицы пишет **дробь через запятую** («51,1345») — при чтении
> координат везде делаем `Number(String(v).replace(",", "."))`.

- **Settings** `[key, value]` — все настройки (цены, телефоны, ключи VIN-OCR,
  цвета меток, office_lat/office_lng, sale_* и т.д.).
- **Orders** `[Date, Telegram ID, Имя, VIN, Марка, Запчасть, Парт-номер, Бренд,
  Цена, Кол-во, Тип получения, Адрес, Телефон, WhatsApp, Статус, Склад(источник)]`.
  Одна строка = одна позиция; заказ = группа строк с одним `Date+Телефон`.
- **Users** `[email, password_hash, role(owner|manager), created_at, active]`.
- **Content** `[key, ru, kk, en, updated_at, updated_by, where]` — CMS-перебивки
  текстов (перебивают messages/*.json).
- **ContentImages** `[slot, public_id, alt_*]` — картинки слотов (лого и т.п.).
- **Theme** `[key, value]` — тема/логотип-текст.
- **Customers** `[email, password_hash, name, phone, whatsapp, vins, created_at]`.
- **NameAliases** `[query, make, articles, …]` — словарь синонимов поиска.
- **SearchLog** `[timestamp, query, make, model, vin, offers_count, email]`.
- **Warehouses** `[id, name, address, lat, lng, pickup_minutes, active,
  updated_at, source_code, color, markup]` — точки самовывоза/склады курьера.
  Есть «Офис» (код оР). У каждого склада координаты + код источника.
- **Couriers** `[id, name, phone, login, password_hash, active, created_at,
  whatsapp, rate_per_trip]`. `rate_per_trip` — ставка за один рейс, ₸.
- **CourierLocations** `[courier_id, lat, lng, updated_at]` — последняя позиция.
  Читаем с **A1** (лист может быть без заголовка).
- **Deliveries** `[id, created_at, customer_name, phone, whatsapp, address, lat,
  lng, items, warehouse_ids, courier_id, status, handover_code, delivered_at,
  route_target, note]`.
- **SaleCache** — накопленная распродажа (скрейп shop.phaeton.kz/SaleOut).

---

## 5. Система доставки и курьеров (главная свежая часть)

### 5.1 Роли и сущности
- **Доставка (Delivery)** — один заказ целиком: собрать позиции по нужным
  складам и привезти клиенту (или в офис при самовывозе).
- **Курьер (Courier)** — вход `scanpart.kz/courier` (логин/пароль), своя сессия.
- **Склады (Warehouses)** — точки, где курьер забирает; у каждого координаты +
  код (Р1/М2/Т3), время получения `pickup_minutes`.

### 5.2 Жизненный цикл доставки (статусы)
`new` → `assigned` (назначен курьер) → `accepted` (**Принял, выдвигается**) →
`picking` (Забирает со склада) → `en_route` (В пути к клиенту, выдан код) →
`delivered` (Вручена). Плюс `canceled`. Переходы — `canTransition()` в
`lib/delivery/types.ts`.

Кнопки у курьера по порядку: **Принять доставку** → **Забрал со склада** →
**В путь к клиенту** → ввести код клиента → **Подтвердить выдачу**. Код выдачи
(4 цифры, 1000–9999 без ведущего нуля) отправляется клиенту в WhatsApp при
переходе в `en_route`.

### 5.3 Живой GPS курьера
- Приложение курьера шлёт позицию: `POST /api/courier/location` (watchPosition,
  троттлинг ~30с; + при каждом действии). Пишется в CourierLocations.
- Админка читает: `GET /api/admin/live` (активные курьеры + позиция), карта
  «Доставки» опрашивает каждые 15с.
- **Метка курьера едина** в приложении и у владельца: цвет/форма из настроек
  (`courier_color`, `courier_shape`), серым когда GPS не подтверждён, всегда
  поверх остальных меток (zIndex). `/api/courier/me` отдаёт настройки метки.
- ⚠️ **Исторический баг (решён):** координаты писались с запятой и `Number()`
  давал NaN → курьер не появлялся. Чинится `.replace(",", ".")` при чтении.

### 5.4 Маршрут
- Строит `lib/delivery/plan.ts` → `buildCourierPlan(active, warehouses, start)`:
  сначала все pickup-склады (nearest-neighbour), потом клиент. ETA = путь /
  22–24 км/ч (город, учитывает пробки) + `pickup_minutes` на складе + 5 мин у
  клиента. Реальные дороги — `roadPath` (2ГИС), когда есть старт.
- Курьер: `GET /api/courier/route` — активные доставки + маршрут с ETA.
- Админ: `GET /api/admin/deliveries?courierId=` — тот же маршрут для карты.
- **Интерактивный прогресс:** курьер жмёт точку → «еду сюда»: цель жёлтая
  (обводка + жёлтый отрезок «куда едет»), пройденные — зелёные ✓. Хранится в
  `Deliveries.route_target` (id склада или "client"). Действие
  `PATCH /api/courier/deliveries/[id] {action:"target", target}`. Видно и у
  владельца (у сфокусированного курьера).
- **Карта** `components/admin/delivery-map.tsx` — Leaflet (OSM). 2ГИС-ключа нет,
  поэтому OSM. Флажок в подписи — казахстанский (не украинский). Треугольник
  курьера — SVG с белой обводкой.

### 5.5 Координаты и геокодер (ВАЖНО, хрупкое место)
- `lib/geocode.ts` → `geocodeAddress()`. Чистит адрес (убирает «г.»/город и
  запятые, раскрывает «пр.»/«ул.»), пробует каскадом: **Яндекс (если ключ)** →
  Nominatim строгий (bounded Астана) → без города → без города и без рамки →
  только улица. Троттлинг Nominatim 1.1с (иначе лимит рубит точный дом).
- ⚠️ **Бесплатный Nominatim по Астане ненадёжен** — иногда «центр улицы» вместо
  дома, иногда разные ответы на один запрос. Точное решение — задать
  `YANDEX_GEOCODER_KEY` (бесплатно ~1000/сутки). Пока: править координаты вручную
  в карточке доставки (поле «Координаты»).
- Доставка авто-геокодится при сохранении (PUT). Кнопка «только Астана»
  (`POST /api/admin/deliveries/regeocode`) пересчитывает существующие.
- Вкладка «Доставки» при открытии один раз авто-геокодит офис и доставки без
  координат.
- **Офис** (для самовывоза) — координаты в Settings `office_lat/office_lng`.
  Сейчас заданы напрямую: `51.186198, 71.42212` (= проспект Республики 68).

### 5.6 Позиции доставки (формат)
`lib/delivery/items.ts` → `formatDeliveryItems(rows)` — **по одной позиции на
строку, с номером и складом кодом**, как в «Заказах»:
```
1) Фильтр воздушный — склад Т3
2) Колодки тормозные ×2 — склад Т3
3) Ремень ГРМ — склад Р1
```
Рендерится с `whitespace-pre-line`.

### 5.7 Аналитика и оплата курьеров
- Рейс = выполненная (delivered) доставка. У курьера — **ставка за рейс**
  (`rate_per_trip`), правится в форме курьера.
- Админ «Доступы → Курьеры»: рейсов всего/сегодня/за месяц + сумма к оплате
  (рейсы × ставка).
- Приложение курьера: блок «🧾 Мои рейсы» — кол-во, заработок, последние адреса
  (`GET /api/courier/history`).

### 5.8 Уведомления
- Менеджеру в Telegram (`notify-telegram.ts`): created / assigned / en_route /
  delivered.
- Клиенту в WhatsApp — код выдачи.

---

## 6. Админ-панель

- Вход только по сессии: `/[locale]/admin` → middleware + `getCurrentUser()`,
  иначе редирект на `/admin/login`. Сессия — cookie `scanpart_sess`, 24 часа.
  Роли: `owner`, `manager` (Доступы — только owner).
- **Вёрстка (свежая):** полноширинная, **левый сайдбар** (группы: Работа /
  Магазин / Система). Шапка (лого/авто) тоже на всю ширину **только на /admin**
  (middleware пробрасывает `x-pathname`, `site-header.tsx` это ловит). На витрине
  — центрированный `max-w-6xl`.
- **Мобильно:** сайдбар → выезжающий слева ящик (гамбургер). `overflow-x-clip`
  на рабочей области + `min-w-0` у колонок «Операций» — не вылезает за экран.
- **Разделы** (компоненты `components/admin/tab-*.tsx`):
  - **Дашборд** — статус интеграций + счётчики заказов (пока простой; план —
    сделать плотную «сводку в реальном времени»).
  - **Операции** — «Заказы» + «Доставки» на одной странице (≥1600px — рядом).
  - **Клиенты**, **Локации** (склады), **Контент**, **Дизайн** (+ Картинки),
    **Словарь поиска**, **Что искали**, **Настройки**, **Доступы** (Менеджеры +
    Курьеры).
- Каждое «Сохранить» во вкладке само ревалидирует свой кэш (отдельной кнопки
  «Опубликовать» нет).
- **Выполненные доставки** можно редактировать/удалять; у доставки есть поле
  **Примечание** (note).

---

## 7. Витрина (кратко)
- Поиск: VIN (8–17), OEM из каталога Laximo, по названию (словарь синонимов),
  по артикулу. Голосовой поиск (Web Speech + резерв). VIN по фото техпаспорта
  (`/api/vin/scan`, Gemini/GPT, ключи в админке).
- Наценки по складам (`markup`), настройки в админке.
- «Распродажа» — скрейп shop.phaeton.kz/SaleOut, только Астана, крон-синк в
  SaleCache, наценка `sale_markup_percent`, выключатель `sale_enabled`.
- SEO-слой: sitemap/robots/JSON-LD/OG (`lib/seo.ts`).

---

## 8. Рабочий процесс (деплой)

```
# ветка не обязательна — правки этой сессии шли прямо в main
npx tsc --noEmit               # обязательно чисто
npx next lint --max-warnings 0 # CI требует 0 предупреждений
git add -A && git commit -m "…" && git push origin main
# Vercel деплоит из main; ждать пока /api/health вернёт новый git sha:
curl -s https://scanpart.kz/api/health   # поле version = короткий sha
```

- **Windows-гочи:** curl/Python коверкают кириллицу (cp1251) — «кракозябры» в
  тестах это не баг. Для форджа сессий использовать Node + iron-session.
- **Форж сессии** (для проверки прод-эндпоинтов под owner/курьером):
  `sealData({user:{email,role,loggedInAt}}, {password: IRON_SESSION_PASSWORD})`,
  cookie `scanpart_sess=<sealed>`.
- `_*.mjs` в .gitignore (временные скрипты).

---

## 9. Ключевые файлы

- `lib/sheets/client.ts` — весь доступ к Google Sheets (read/upsert, SHEET_HEADERS).
- `lib/delivery/` — types (статусы), plan (маршрут), route (buildRoute/haversine),
  optimize, warehouse, items, live, notify*, roadroute.
- `lib/geocode.ts` — адрес → координаты.
- `lib/session.ts` / `lib/auth/*` — сессии, guи, курьеры, пользователи.
- `components/admin/admin-shell.tsx` — сайдбар/разделы.
- `components/admin/tab-*.tsx` — разделы админки.
- `components/admin/delivery-map.tsx` — карта (Leaflet).
- `app/courier/page.tsx` — приложение курьера.
- `app/api/**` — все эндпоинты (список — раздел выше).
- `middleware.ts` — auth-гейты + проброс `x-pathname`.

---

## 10. Что осталось / идеи
- **Дашборд** сделать плотной сводкой (KPI-полоса, живые доставки, последние
  заказы, что искали) — план согласован, не реализовано.
- **Геокодер:** подключить `YANDEX_GEOCODER_KEY` для стабильной точности адресов.
- Поиск по FRAME-номеру (номер кузова) — через Shate-M не реализуемо (только
  AutoByVin); нужен Phaeton или пометка в описании.

---

## 11. Память между сессиями
Индекс — `C:\Users\user\.claude\projects\c--Users-user-scanpart-astana\memory\MEMORY.md`.
Там короткие указатели на факты (проект, поставщики, UX-решения, деплой, и пр.).
Этот файл (`PROJECT-REFERENCE.md`) — подробная «карта»; память — быстрые ссылки.
