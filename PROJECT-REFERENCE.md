# PROJECT-REFERENCE — scanpart.kz (полный справочник)

Обновлено: 2026‑09‑18. Читать ПЕРВЫМ при возвращении к проекту.
Это единый источник правды по архитектуре, поставщикам, прокси, поиску, настройкам,
env, админке и деплою. Все функции и доработки — здесь.

> Свежее (2026‑09‑18): фикс выдачи Phaeton (склад Астаны отдаёт 1 день → §4.1),
> честный мониторинг ВСЕХ поставщиков + Telegram‑алерты + «сторож» авто‑починки (§3.1),
> русский дашборд «работает/не работает», индикатор загрузки и зелёные карточки наличия (§4.2).

---

## 1. Что за проект
- Магазин автозапчастей по Астане: поиск по **VIN / номеру (артикул/OEM) / названию**, только
  склады Астаны и только в наличии, наценка, заказ (Telegram менеджеру + WhatsApp клиенту),
  курьерская доставка. Мультиязычность **RU/KK/EN** (next-intl), темы день/ночь/авто.
- **Стек:** Next.js 14.2 (App Router), TypeScript, Tailwind, iron-session, Google Sheets как БД,
  Cloudinary (фото), undici (HTTP через прокси).
- **Хостинг:** **Vercel (план Hobby!)**, деплой из GitHub `main`. Домен **scanpart.kz** (Vercel).
- **Тесты:** `npm test` (node:test + tsx), ~94 шт. Гейты перед деплоем: `npx tsc --noEmit`,
  `npx next lint --max-warnings 0`, `npm test`.

---

## 2. Поставщики (4) и коды складов
| Код | Поставщик | Как ходим | Фаза поиска |
|---|---|---|---|
| **Р1** | Phaeton (api.phaeton.kz) | apikey-API, **IP‑whitelist → только через прокси** | ФОН (`?phase=phaeton`) |
| **М2** | Shate‑M (api.shate‑m.kz) | apikey-API + Laximo VIN‑каталог (веб‑сессия shate‑m.kz) | быстрая |
| **Т3/Т4/Т5** | Autotrade (sklad.autotrade.kz) | веб‑сессия, DDoS‑Guard | быстрая |
| **И6** | **Interkom (opt.interkom.kz)** — НОВЫЙ | веб‑сессия (login/pass), см. §2.1 | быстрая |

Клиенту имя поставщика НИКОГДА не отдаётся — только код (Р1/М2/Т3‑Т5/И6). `source` вырезается из JSON.

### 2.1 Interkom (И6) — новый поставщик
- Сайт `https://opt.interkom.kz/opt/`, backend ASP.NET/IIS, фронт — jQuery (`/opt/static/js/interkom.js`).
- **Файлы:** `lib/interkom/session.ts` (авторизация, куки, прокси, авто‑релогин на 401),
  `lib/interkom/search.ts` (поиск, парсинг HTML‑строк, фильтр наличия, нормализация в PartOffer).
- **Авторизация:** `POST /opt/login` (form `login`&`password`, header `X-Requested-With: XMLHttpRequest`).
  Кука `b2b`, **живёт 15 минут** → авто‑релогин на HTTP 401. Креды: env `INTERKOM_LOGIN`/`INTERKOM_PASSWORD`.
- **Поиск:** `POST /opt/itemsSearch` (form): `search` (мин. 4 символа; матч по Артикул/OEM/Наименование),
  **`segment` ОБЯЗАТЕЛЕН** (GUID марки), опц. `itemCount` (offset, ~1000/пачка). Ответ JSON
  `{result,message,data}` где `data` = HTML `<tr>` строки (парсим cheerio).
- **Сегменты (GUID марок)** — карта make→segment в `segmentsForMake()`: CHEVROLET `e87444f2-…`,
  China Cars `6f118d38-…`, Gaz `bde3ccd6-…`, HYUNDAI `625243e3-…`, KAMAZ `c387f317-…`, KIA `8d389fd0-…`,
  LADA `d227a6f5-…`, RENAULT `354ef38d-…`. Марка не из списка / без авто → опрашиваем ВСЕ 8 сегментов.
- **Наличие (важно):** числа нет, есть иконка в колонке «Остаток». Берём ТОЛЬКО зелёную галочку
  `bi-patch-check text-success` («Доступен на складе»); `bi-dash-circle text-danger` (нет) и
  `bi-custom-truck text-primary` (в пути) — отбрасываем.
- **Поля строки:** Код td0, Артикул td1, OEM td2, Наименование td3 (`a.GoodsInfo`; **если пусто —
  фолбэк: текст ячейки → `${brand} ${art}`, пустых имён не отдаём**), Бренд td4, ЕИ td5, Цена td6.
- **Прокси:** на Vercel — через общий KZ‑прокси (`getProxyAgent("INTERKOM_PROXY_URL","PHAETON_PROXY_URL")`).
- **Выключатель:** настройка `interkom_enabled` (по умолчанию off). Включена сейчас (=on).
- **Фото:** у Interkom вотермарка вшита, чистого URL нет → фото берём НЕ у Interkom, а через наш
  общий резолвер `partPhotoUrl(article, brand)` (чистые источники).
- **Склад И6 как пункт выдачи** для курьера — владельцу добавить адрес+координаты в «Локации».

---

## 3. Прокси — ЕДИНАЯ ТОЧКА ОТКАЗА (критично)
Все поставщики на Vercel ходят через один платный KZ фикс‑IP прокси **px6.net (Proxy6)** в
`PHAETON_PROXY_URL`. Сейчас: `http://<user:pass>@194.32.251.55:8000` (Алматы). IP внесён в whitelist
Phaeton. Если прокси падает — поиск отдаёт пусто у ВСЕХ.

- **`lib/proxy.ts`:** `resolveProxyUrl(...)` (защита от битого значения — пустые кавычки/пробелы),
  `getProxyAgent(...)` (кеш агента по URL), **`resetProxyAgent(...)` + `isProxyConnError(err)` —
  САМОВОССТАНОВЛЕНИЕ**: на connection‑ошибке клиент сбрасывает агент, следующий запрос строит свежий
  и переподключается к ожившему прокси **без ручного redeploy**. Все клиенты
  (Phaeton/Shate‑M/Autotrade/Autodoc/Phaeton‑shop/Interkom) переведены на `getProxyAgent`+reset.
- **Мониторинг прокси (доработка):** `checkProxyHealth()` в `lib/proxy-health.ts` (проба через прокси
  на api.ipify.org, кеш ~30с). `GET /api/cron/proxy-check` (ключ `?key=WARM_KEY`): сравнивает с
  настройкой `proxy_status` («up»/«down»), при СМЕНЕ шлёт Telegram (🔴 упал / 🟢 поднялся), пишет статус.
  Гоняется GitHub Actions каждые 5 мин (шаг в `.github/workflows/keep-warm.yml`, секрет `PROXY_CHECK_URL`).
- **В дашборде** строка «Прокси: работает/не работает/не настроен» + «Interkom (И6): подключён/выключен/не настроен».
- **Клиентский баннер** `components/proxy-banner.tsx` — на витрине (не в админке) при `proxy_status="down"`
  показывает «Поиск временно недоступен — идёт восстановление» (RU/KK/EN, ключ `proxyBanner.down`).
- **keep‑warm:** `GET /api/cron/warm?key=WARM_KEY` греет инстанс и сессии поставщиков; GitHub Actions
  каждые 5 мин (секрет `WARM_PING_URL`). Нужен, т.к. Hobby не даёт частые Vercel‑кроны, а холодное
  соединение с прокси медленное.
- **История 2026‑08‑18/19:** прокси падал несколько раз (первый — умер старый `81.200.159.68`, купили
  `194.32.251.55`; далее сбои px6). Раньше после возврата прокси требовался `vercel redeploy` (тёплые
  инстансы держали мёртвый ProxyAgent) — теперь чинит авто‑подключение. Мониторить возврат:
  `for i in ...; do curl -sx http://…@194.32.251.55:8000 -m8 https://api.ipify.org && break; sleep 60; done`.
- **Резерв (TODO владельца):** второй прокси на случай сбоя основного — тогда авто‑переключение
  (не сделано, ждёт второго прокси), либо переезд на VPS (постоянный IP, без стороннего прокси).

### 3.1 ЧЕСТНЫЙ мониторинг всех поставщиков + «сторож» (2026‑09‑18)
Раньше health завышал: `phaeton` был просто пингом корня `api.phaeton.kz` (не через прокси) и
оставался «ok», пока поиск реально молчал. Теперь всё честно и с авто‑починкой.

- **Реальные пробы** (`lib/monitoring.ts`, `lib/phaeton/health.ts`): гоняем «сентинел»‑артикулы через
  ТУ ЖЕ функцию поиска, что видит покупатель. Семантика (чтобы не было ложных тревог):
  - **Р1 (Phaeton)** — СТРОГО по наличию сентинелов в Астане (каталог большой, они гарантированы):
    пусто = сломано (whitelist/склад/фильтр).
  - **М2/Т3/И6** — по ДОСТУПНОСТИ: их `searchXxxOffers` бросают только на auth/сети, пустой каталог = `[]`;
    «down» лишь когда ВСЕ сентинелы упали. Иначе Interkom (узкая номенклатура) ложно показывал «не работает».
    Interkom пробуется только при `interkom_enabled=on`. Сентинелы — env `SUPPLIER_HEALTH_ARTICLES`
    (или `PHAETON_HEALTH_ARTICLES`), деф. `0986424815,0451103316,OC90`. Кэш проб 60с.
- **Крон `GET /api/cron/proxy-check`** (GitHub Actions «Keep warm», ~5 мин): проверяет прокси + каждого
  поставщика, пишет `${supplier}_status` (up/down), шлёт Telegram ТОЛЬКО при СМЕНЕ статуса
  (🔴 «… не работает» / 🟢 «… снова работает»; первый замер без алерта). Если прокси лёг — пробы не
  гоняем (дублей к алерту прокси нет; дашборд сам покажет поставщиков «не работает» через оверлей).
- **«СТОРОЖ» (авто‑починка, безопасно):** при «не работает» (прокси жив) монитор СНАЧАЛА чинит в рамках
  рабочей логики — `remediate()`: `resetProxyAgent(...)` (застрявший туннель) + сброс сессии поставщика
  (`resetShatemAuth`/`resetAutotradeSession`/`resetInterkomSession` — протухшая кука/токен без явной 401) —
  и `reprobe(force=true)` мимо кэша. Помогло и сбой был кратким → тихо (без спама); поднялся из
  устойчивого down → 🟢 «(авто‑восстановление)»; не помогло → 🔴 «нужна проверка». НЕ трогает то, что
  требует человека (провайдер прокси, IP‑whitelist, токены, редеплой) — только точный алерт.
- **Health честно по каждому** (`app/api/health/route.ts`): `phaeton/shatem/autotrade/interkom` берутся из
  `${supplier}_status`; при `proxyDown` все показываются «не работает» (без записи статуса — без шторма
  алертов на восстановлении). `telegram` — с причиной: `invalid`/`unreachable`/`no-chat`; токен тестируется
  ТЕМ ЖЕ путём, что и отправка (`getTelegramToken`/`getTelegramChatId`, свежее чтение), иначе врал «неверный
  токен» при рабочем боте из‑за старого env `TELEGRAM_BOT_TOKEN`. getMe кэшируется 60с (429/5xx = транзиент).
- **`?diag=<DIAG_TOKEN>`**: `GET /api/search?...&phase=phaeton&diag=` — счётчики brands/prices,
  warehouseIds, atAstana/inStockNow/picked, дамп складов Dictionary; `GET /api/health?diag=` — детали getMe
  Telegram (без раскрытия токена). `DIAG_TOKEN` в Vercel prod непустой.

---

## 4. Архитектура поиска (`app/api/search/route.ts`)
### Прогрессивная выдача (2 фазы)
- **Быстрая фаза** (`GET /api/search?q=&k=`): Shate‑M + Autotrade + **Interkom** сразу; поле
  `phaetonPending:true`, если Phaeton может добавить. Быстро (~3‑5с тёплый) — НЕ ждёт Phaeton.
- **Фаза Phaeton** (`?phase=phaeton`): только Phaeton (Р1), фон; клиент (`components/results-list.tsx`)
  дозагружает и **допечатывает** Р1 в список с пересортировкой по цене. Индикатор «Ищем ещё предложения…».
  Таймаут Phaeton **25с + повтор** (безопасно — фон не блокирует UI). `lib/phaeton/client.ts`.
- **Ускорение Phaeton по названию:** для name‑поиска быстрая фаза уже резолвит OEM из каталога Laximo
  (`oem[]`); клиент передаёт их в фазу Phaeton `&oems=...` → Phaeton не гоняет Laximo второй раз
  (было ~30с → стало ~3‑5с).

### 4.1 Склад Астаны у Phaeton (инцидент+фикс 2026‑09‑18)
Симптом «Р1 не отдаёт запчасти» оказался НЕ прокси (бренды/цены приходили, rawItems~5000). Причины:
1. **Phaeton Dictionary перестал отдавать список `Warehouses`** → `getAstanaWarehouseIds()` бросал ошибку →
   `warehouseIds=[]`. **Фикс:** env **`PHAETON_ASTANA_WAREHOUSE_ID=fd6fcfe0-a729-11e7-80c2-9457a554842b`**
   (склад «Астана»). Это надёжно определяет Астану без Dictionary И скоупит `searchPrices` к Астане →
   payload упал ~4988→~4 позиции, ответ 10‑17с→**1‑2с** (побочно ушла нестабильность «работает со 2‑го раза»).
2. **Склад «Астана» отдаёт 1 день отгрузки** даже на физический остаток, а фильтр требовал `days===0` →
   выкидывал ВЕСЬ остаток Астаны. **Фикс:** «в наличии» = позиция на складе Астаны с остатком (>0 уже
   отфильтровано), без `days===0`. Плюс у позиций Астаны обнуляем `shipmentDays` → на карточке НЕТ плашки
   «Доставка под заказ N дней» (это местное наличие). Диагностика — `?diag` (см. §3.1).
- **Правило на будущее:** при «Р1 не отдаёт» сначала `?diag`, не редеплой ради прокси. Если brands/prices
  fulfilled — дело в резолвере склада/фильтрах. `getAstanaWarehouseIds` (`lib/phaeton/astana-warehouse.ts`)
  сначала берёт env‑override, иначе матчит `/астана|astana/i` в Dictionary (24ч кэш).

### 4.2 Выдача результатов (UX)
- **Индикатор загрузки над карточками** (`components/results-list.tsx`, серверные надписи из
  `app/[locale]/results/page.tsx`): пока фоном идёт Phaeton — красный пульсирующий кружок и надпись
  «Подождите загрузку всех позиций»; когда позиции со всех складов пришли — зелёная галочка «Данные
  запчасти на складе в Астане». Обе надписи РЕДАКТИРУЮТСЯ в админке: настройки `search_loading_label` /
  `search_ready_label` (пусто = перевод по умолчанию RU/KK/EN: `results.searchLoadingAll`/`searchReadyAstana`).
- **Зелёные карточки наличия:** позиция в наличии в Астане (остаток ≥1) — карточка с зелёным фоном + значок
  «В наличии · Астана» (`results.inStockBadge`), чтобы читалось «есть сейчас», а не «под заказ».

### Поиск по названию
- Для авто с VIN/каталогом (`vinScoped`) — по каталогу Laximo (Shate‑M web‑session, `lib/shatem/catalog.ts`,
  `lib/shatem/web-session.ts` — тоже ХОДИТ через прокси, это чинило «пусто по названию»). Матч названия
  устойчив к русской грамматике (беглая гласная «колодки/колодок», «комплект…») — `nameMatchesAll`.
- Без каталога — вольный текст Phaeton + словарь синонимов (aliases). **Строгий фильтр «все слова
  запроса есть в названии»** — против «фантазий».

### Свободный поиск на любое авто (чек‑бокс `anycar=1`)
- Есть на поиске **по номеру И по названию** (`components/search-input-form.tsx`, галочка «…на любое авто»).
- При `anycar`: не привязываемся к выбранному авто (`vinScoped=false`), Interkom опрашивает ВСЕ сегменты,
  предупреждение «может не подойти» (`fitWarning`) скрыто. **НО матч строгий** (по конкретному номеру/
  названию, все слова запроса в названии) — без «фантазий». i18n ключи `article.anyCarLabel`, `name.anyCarLabel`.

### Нормализация номера (пробелы/дефисы)
- Для `kind=article`: строим набор вариантов запроса (raw, пробел→дефис, без пробелов, без пробелов+дефисов,
  реконструкция дефиса для 11‑значных ГАЗ‑номеров) и шлём поставщикам; Phaeton — один канонический
  (без пробелов/дефисов). `AH 03004` = `AH03004` = `AH-03004`; `3302-2905006` = `33022905006` = `3302 2905006`.

### Наценка
- **`price_brackets`** (диапазоны входящей цены) — ГЛАВНЫЙ механизм; общий `markup_percent` — ЗАПАСНОЙ
  (если цена не попала ни в один диапазон). Переопределение по складу больше НЕ применяется.
- `lib/markup.ts`: `applyBracketMarkup(price, brackets, fallbackPct)`, `parsePriceBrackets` (валид/сорт/≤10).
  Формат `price_brackets` (JSON): `[{from, to|null, kind:"percent"|"fixed", value}]`, от 0 до 10 строк.
  Редактор в «Настройках» (таблица От/До/тип %|₸/значение).
- **`analogs_max`** — сколько позиций с каждого склада показывать, **диапазон 0–30** (было 0–20), деф. **20**.

---

## 5. Env‑переменные (Vercel → Production; имена, без значений)
`PHAETON_USER_GUID`, `PHAETON_API_KEY`, `PHAETON_BASE_URL`, **`PHAETON_PROXY_URL`** (общий прокси),
**`PHAETON_ASTANA_WAREHOUSE_ID`** (=`fd6fcfe0-a729-11e7-80c2-9457a554842b`, склад Астаны — см. §4.1),
`PHAETON_SHOP_LOGIN`, `PHAETON_SHOP_PASSWORD`,
`SHATEM_API_KEY`, `SHATEM_WEB_LOGIN`, `SHATEM_WEB_PASSWORD`,
`AUTOTRADE_LOGIN`, `AUTOTRADE_PASSWORD`,
**`INTERKOM_LOGIN`, `INTERKOM_PASSWORD`** (опц. `INTERKOM_PROXY_URL` → фолбэк на PHAETON_PROXY_URL),
`GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, `SHEETS_SPREADSHEET_ID`,
`CLOUDINARY_URL`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`,
`IRON_SESSION_PASSWORD`, `BCRYPT_PEPPER`, `CRON_SECRET`, **`WARM_KEY`** (пингер), **`DIAG_TOKEN`** (непустой — для `?diag`),
опц. **`SUPPLIER_HEALTH_ARTICLES`**/`PHAETON_HEALTH_ARTICLES` (сентинелы мониторинга, деф. `0986424815,0451103316,OC90`),
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`.
(Прочие прокси‑env‑имена как фолбэки: SHATEM_PROXY_URL, AUTOTRADE_PROXY_URL, AUTODOC_PROXY_URL — не заданы.)
**Внимание:** env `TELEGRAM_BOT_TOKEN` содержит СТАРЫЙ/отозванный токен (рабочий — в настройке
`telegram_bot_token`). Health теперь тестирует токен из настроек, но env‑значение лучше удалить/обновить (§12).

**GitHub secrets (repo 779722-hub/scanpart-astana):** `WARM_PING_URL` (=warm URL с ключом),
`PROXY_CHECK_URL` (=proxy-check URL с ключом). `gh` залогинен под 779722-hub.

**Vercel CLI** залогинен под аккаунтом владельца (scope `779722-9753s-projects`). Деплой:
`vercel deploy --prod --yes`. `vercel env pull` может рендерить некоторые секреты как пусто — не верить,
проверять рантаймом. Форж owner‑куки для тестов: `sealData({user:{email,role:"owner",loggedInAt}}, {password: IRON_SESSION_PASSWORD})`, кука `scanpart_sess`.

---

## 6. Настройки (лист Google Sheets `Settings`, ключи)
`markup_percent`, **`price_brackets`** (JSON), `analogs_max` (0–30, деф. 20), `show_oem`, `show_photos`,
`photo_size_phaeton`, `photo_size_shatem`, `photo_size_autotrade`, **`interkom_enabled`**,
**`search_loading_label`**, **`search_ready_label`** (надписи индикатора загрузки, см. §4.2),
**`proxy_status`**, **`phaeton_status`**, **`shatem_status`**, **`autotrade_status`**, **`interkom_status`**
(up/down — ведёт крон‑мониторинг, читает дашборд), `telegram_bot_token`, `telegram_chat_id`,
`sale_enabled`, `sale_markup_percent`, `sale_pages`, `sale_sync_at`, `sale_sync_cursor`,
`vin_ocr_provider`, `voice_search_enabled`, `voice_stt_provider`, `openai_api_key`, `gemini_api_key`,
`openrouter_api_key`, `openrouter_model`.
**Секреты** (`telegram_bot_token`, `openai_api_key`, `gemini_api_key`, `openrouter_api_key`) в
`GET /api/admin/settings` РЕДАКТИРУЮТСЯ (не отдаются в открытом виде); поле `secretsSet` показывает «задано».
PUT принимает `{patch:{key:value}}` (пустой секрет = не перезаписывать).

---

## 7. Админка
- Гейт: без сессии `/ru/admin` → 307 на логин; `/api/admin/*` → 401. Роли owner/manager.
- **Безопасность (фикс сессии):** секреты не утекают в settings GET; PUT/DELETE курьеров и GET списка
  пользователей — только **owner** (`requireRole("owner")`). Настройки — секреты редактируются.
- **Дашборд (`components/admin/tab-dashboard.tsx`)** — карточка «Статус» из `/api/health`:
  Phaeton (Р1), Shate‑M (М2), Autotrade (Т3), **Interkom (И6)**, **Прокси**, Google Таблицы, Хранилище фото, Телеграм.
  Все подписи на русском (склады/коды Р1/М2/Т3/И6 не переводим), единые статусы **«работает / не работает»**
  (+ «не настроено / выключено / нет данных»), значок зелёный/красный/серый. Статусы поставщиков — из
  честных проб крона (§3.1). Опрос каждые 30с.
- Вкладки: Дашборд, Операции (Заказы+Доставки), Клиенты, Локации/Склады, Контент, Дизайн(+Картинки),
  Словарь, Что искали, Настройки, Доступы (owner‑only: менеджеры+курьеры). Полная ширина, сайдбар слева,
  мобильный — выезжающий ящик.
- `/api/health` `checks`: phaeton/shatem/autotrade/interkom/proxy/sheets/cloudinary/telegram;
  верхний `ok` завязан на Google Sheets (не на Phaeton). Может разово мигнуть на холодном инстансе.

---

## 8. VIN
- `POST /api/session/vin` сохраняет vin+vehicle (реальный VIN → session.vin; ручной ввод → vin="").
- Показ авто **двухфазный** (быстро): сначала `/api/vin?fast=1` (NHTSA, ~0.4с, сразу пишет session.vin),
  затем полный Laximo (`vehicleByVin`) в фоне уточняет модель («уточняем модель…»). Файлы
  `components/vin-search-form.tsx`, `account-view.tsx`. Name‑поиск берёт session.vin в момент поиска.

---

## 9. Крон / GitHub Actions
- **`.github/workflows/keep-warm.yml`** (cron `*/5`): пинг `WARM_PING_URL` (прогрев) + `PROXY_CHECK_URL`
  (честный мониторинг всех поставщиков + «сторож» авто‑починки + телеграм‑алерт, §3.1). Шаг proxy‑check
  помечен `if: always()` (отрабатывает, даже если прогрев подвис); прогрев скоуплен на склад Астаны
  (иначе на холодном инстансе 504 — тянул ~230КБ). GH‑расписание «best effort» (бывают задержки).
- Vercel‑крон в `vercel.json`: только суточный `sale-sync` (Hobby не даёт частые). Warm/proxy‑check —
  через GitHub Actions по URL‑ключу.
- VPS‑деплой (`.github/workflows/deploy.yml`) — ОТКЛЮЧЁН (VPS не поднимали), прод на Vercel.

---

## 10. Деплой и проверка
- Пуш в `main` (Vercel авто‑деплой бывает нестабилен) → надёжнее `vercel deploy --prod --yes` (алиасит scanpart.kz).
- После правок: `npx tsc --noEmit`, `npx next lint --max-warnings 0`, `npm test` (все зелёные), затем деплой.
- Проверка версии: `curl https://scanpart.kz/api/health` → `version` = git sha.
- Windows shell коверкает кириллицу (cp1251) — URL‑кодировать кириллицу в запросах, парсеры писать в UTF‑8 файл.

---

## 11. Ключевые файлы
- Поиск: `app/api/search/route.ts`, `components/results-list.tsx`, `components/search-input-form.tsx`.
- Поставщики: `lib/phaeton/client.ts`, `lib/shatem/{client,catalog,web-session}.ts`,
  `lib/autotrade/{session,search}.ts`, **`lib/interkom/{session,search}.ts`**.
- Прокси/устойчивость: `lib/proxy.ts`, `lib/proxy-health.ts`, `app/api/cron/{warm,proxy-check}/route.ts`,
  `components/proxy-banner.tsx`, `.github/workflows/keep-warm.yml`.
- Мониторинг/сторож: **`lib/monitoring.ts`** (пробы поставщиков), **`lib/phaeton/health.ts`** (проба Р1),
  `lib/phaeton/astana-warehouse.ts`, resetʼы сессий в `lib/{shatem/client,autotrade/session,interkom/session}.ts`.
- Наценка/настройки: `lib/markup.ts`, `lib/sheets/settings.ts`, `components/admin/tab-settings.tsx`.
- Здоровье/дашборд: `app/api/health/route.ts`, `components/admin/tab-dashboard.tsx`.
- VIN: `app/api/vin/route.ts`, `components/vin-search-form.tsx`.

---

## 12. Незакрытые задачи ВЛАДЕЛЬЦА (важно)
1. **Ротировать 4 ключа** (могли утечь до фикса settings): `telegram_bot_token`, `openai_api_key`,
   `gemini_api_key`, `openrouter_api_key` — перевыпустить у провайдеров, вписать в «Настройки».
2. **Env `TELEGRAM_BOT_TOKEN`** содержит СТАРЫЙ/отозванный токен — удалить его в Vercel или вписать
   актуальный (рабочий токен лежит в настройке `telegram_bot_token`; health уже тестирует именно её).
3. **Склад И6** — добавить адрес+координаты пункта выдачи в «Локации» (для курьерской маршрутизации).
4. **Наценка по диапазонам** — сейчас `price_brackets` пусто → действует общий % (сейчас 50). Задать при желании.
5. **Прокси px6** — включить автопродление `194.32.251.55` (единая точка отказа); при повторных сбоях —
   резервный прокси (для авто‑переключения нужно доработать код + дать второй URL) или переезд на VPS.
   «Сторож» (§3.1) чинит только транзиент (застрявший туннель/сессия); провайдера/whitelist чинит человек.
6. `analogs_max` сейчас = 20 (можно до 30).
