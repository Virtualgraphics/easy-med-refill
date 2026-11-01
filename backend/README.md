# Easy MedRefill backend

Plain PHP 8.1+, no framework, no Composer. MariaDB. Deploys as a file upload to Hostpoint.

## Layout

```
backend/
  public/        web root of api.easy-medrefill.com (index.php, .htaccess)
  src/           application code
  config/        config.example.php -> copy to config.php (gitignored)
  cron/          send-reorders.php, follow-ups.php, fetch-shortages.php
  schema.sql     database schema
```

## Deploy

1. Upload the whole `backend` folder to the web space, for example as `~/www/api.easy-medrefill.com`.
2. In the Hostpoint control panel, point the subdomain `api.easy-medrefill.com` at either:
   - the **`public`** subfolder (preferred: code and config stay outside the web root), or
   - the `backend` folder itself. The root `index.php` and `.htaccess` handle this case, and `src/`, `config/` and `cron/` carry a `Require all denied` so they are never served.
3. Copy `config/config.example.php` to `config/config.php` and fill in the database password, the mailbox password and an API key (`openssl rand -hex 32`).
4. Create the tables: import `schema.sql` in phpMyAdmin, or `mysql -h ehozimoc.mysql.db.internal -u ehozimoc_medi -p ehozimoc_easymedrefill < schema.sql`.
5. Check `https://api.easy-medrefill.com/health` returns `{"ok":true,...}`.
6. Add the cron jobs in the control panel (adjust the path):

```
*/10 * * * *  php ~/www/api.easy-medrefill.com/cron/send-reorders.php
0 8 * * *     php ~/www/api.easy-medrefill.com/cron/follow-ups.php
0 */6 * * *   php ~/www/api.easy-medrefill.com/cron/fetch-shortages.php
```

7. In the app, set `EXPO_PUBLIC_API_URL=https://api.easy-medrefill.com` and `EXPO_PUBLIC_API_KEY=<the key>` in `.env.local`, restart Metro.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | liveness |
| POST | `/v1/reorders` | X-Api-Key | queue a reorder; sends the email immediately, cron retries on failure |
| GET | `/v1/reorders/{reference}` | X-Api-Key | status for the app to poll |
| POST | `/v1/devices` | X-Api-Key | register a push token (push itself is not wired yet) |
| GET | `/v1/shortages` | X-Api-Key | shortage list (product codes and ATC/ingredient rows) for on-device matching |
| POST | `/v1/shortages/refresh` | X-Api-Key | rebuild the list now: simulated feed + federal BWL list read by Muse Spark (`{"force":true}` to bypass the 6h cache) |
| POST | `/v1/extract-plan` | X-Api-Key | photo of a paper medication list (`image_base64`, `mime`) -> structured rows via Meta Muse Spark; nothing stored |
| GET | `/p/{token}` | link token | practice view of one request |
| POST | `/p/{token}/confirm` | link token | one-click confirmation |

## Shortage data sources

- **BWL Meldestelle** (federal): the monthly "Wirkstoffliste Teilmengenabgabe" PDF is read by Muse Spark via the Responses API (`input_file` by URL, structured output) into ATC code + active ingredient rows. Matched on the device by active ingredient.
- **Simulated** feed in `cron/shortages.simulated.json` for demos.
- **drugshortage.ch** is deliberately not fetched: its terms of use require a licence for integration into other products. The brief plans a data partnership instead.

## What the server stores

Only what a practice needs to act on one approved order: the templated message, provider contact, the medications in that order with quantity and dates, plus the patient's short reference. An order can hold several medications (patients collect them together), but never the full list, no dose history, no names in logs.

## Manual test

```
curl -s https://api.easy-medrefill.com/health
curl -s -X POST https://api.easy-medrefill.com/v1/reorders \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"request_id":"3f9a1c2e-0000-4000-8000-000000000001","language":"de","patient_reference":"DP-1968",
       "provider":{"kind":"pharmacy","name":"Test Apotheke","email":"you@example.com"},
       "items":[{"medication":{"name":"Testmedikament","strength":"1 mg","form":"Tablette","gtin":null,"pharmacode":null},
                 "quantity_packs":1,"units_remaining":9,"needed_by":"2026-11-10"}],
       "needed_by":"2026-11-10",
       "message":{"subject":"Nachbestellung Test","body":"Guten Tag\n\nTestanfrage.\n\nFreundliche Grüsse"}}'
curl -s https://api.easy-medrefill.com/v1/reorders/3F9A1C2E -H "X-Api-Key: $KEY"
```
