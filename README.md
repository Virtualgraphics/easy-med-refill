# Easy MedRefill

**Keeps a complex medication supply from ever breaking.**

Easy MedRefill is a local-first mobile app for transplant and complex chronic patients, people who take 15 or more medications and cannot afford a gap in a critical drug such as an immunosuppressant. It treats medication as a personal supply chain rather than a list of reminders.

Built in Switzerland by [Virtual Graphics](https://www.virtual-graphics.ch/) for the Meta Global AI Developer Hackathon, November 2026. Website: [easy-medrefill.com](https://easy-medrefill.com)

## What it does

- **Two runways per medication.** The *pill runway* says when the packs on hand run out. The *prescription runway* says when the prescription expires or its refills are used up. Whichever ends first drives the reorder date, with a safety buffer that is larger for critical medications.
- **Reorders through channels that already exist.** One tap builds a templated email to the patient's own practice or pharmacy. Several medications go into one order, since patients collect them together. The practice confirms with one click on a web page, the app tracks the status, and a cron job follows up automatically when nobody replies. Lead times are learned per supplier.
- **Shortage warnings.** The server publishes a list of product codes and active ingredients from the Swiss federal shortage list. Matching happens on the phone. A shortage on a critical medication pulls the reorder date to today and adds a heads-up line to the request.
- **Getting the list in.** Scan an eMediplan QR code (CHMED16A), scan a pack's GS1 DataMatrix, photograph a paper list, or type it in.

### Where Meta Muse Spark is used

Both AI features run on the server, behind explicit opt-in consent in the app, and store nothing.

| Feature | How |
|---|---|
| Photo import | A photo of a paper medication list goes to Muse Spark with a strict JSON schema. The app shows every extracted row for review before anything is saved. |
| Shortage feed | A cron job finds the newest federal "Wirkstoffliste Teilmengenabgabe" PDF and has Muse Spark read it by URL into ATC code and active ingredient rows. |

## Hard rules

These shape every feature and keep the app out of medical-device territory.

1. **Supply, not dosing.** The app tracks what the patient has, how fast it is used and when to reorder. It never calculates or recommends what to take. Dose changes are entered as given by the doctor and only recompute the forecast.
2. **Never suggest substitutes.** On a shortage the app reorders earlier and tells the clinic. It never proposes another drug, formulation or strength.
3. **Local first.** Medications, doses, packs, prescriptions and forecasts live only in an encrypted SQLite database on the phone, excluded from cloud backups.
4. **The server knows as little as possible.** It sees one approved order at the moment the patient sends it, never the full list.
5. **No medication names in notifications or logs.**
6. **No third-party analytics.** Hosting and email are in Switzerland.
7. **Demo data is anonymised.**

## Architecture

| Layer | Tech |
|---|---|
| App | React Native with Expo SDK 54, expo-router, NativeWind, TypeScript |
| On-device data | expo-sqlite with SQLCipher, key in expo-secure-store |
| Scanning | expo-camera, custom CHMED16A and GS1 parsers |
| Reminders | Local notifications computed on the device |
| Backend | Plain PHP 8.3, no framework, MariaDB, cron jobs, own SMTP client |
| AI | Meta Model API, `muse-spark-1.3`, server side only |

```
app/           screens (expo-router)
components/    UI components
lib/db/        schema, migrations, repositories, SQLCipher setup
lib/supply/    forecast engine: runways, reorder-by, shortage override
lib/reorder/   suggested quantities, email templates, server payload
lib/scan/      eMediplan, GS1 DataMatrix, photo import mapping
lib/shortages/ on-device matching and sync
lib/notifications/
backend/       PHP API, practice page, cron jobs (see backend/README.md)
```

## Running the app

The project is pinned to Expo SDK 54 and uses native modules, so it runs as a development build, not in Expo Go.

```
npm install
cp .env.example .env        # fill in the API key, or leave the URL empty for offline mode
npx expo prebuild --platform android
npx expo run:android        # or run:ios on a Mac
```

Without a server URL the app works fully offline: reorders are tracked on the phone and nothing is sent.

### Tests

The forecast engine, parsers, templates and repositories are covered by Jest. Database tests run real SQL against SQLite.

```
npm test
npm run typecheck
```

## Backend

Deployment, endpoints and the data the server stores are described in [backend/README.md](backend/README.md). Secrets live in `backend/config/config.php`, which is not in the repo.

## Status

Hackathon build. All planned must-haves work end to end against the live backend. Not yet done: localisation (German, French, Italian), the email reply assistant, Swissmedic product-name lookup for scanned GTINs, and a production release on the app stores.

## Privacy

The full data flow is documented in the app's privacy policy at [easy-medrefill.com/privacy-policy](https://easy-medrefill.com/privacy-policy/). In short: the medication list never leaves the phone, the server in Switzerland sees only approved orders, and the two AI features are off until the user turns them on.

## License

MIT, see [LICENSE](LICENSE).
