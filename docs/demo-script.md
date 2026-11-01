# Easy MedRefill — demo video script (≈ 95 seconds)

Target: Meta Global AI Developer Hackathon submission video. Spoken in English, calm pace (≈ 150 words/min).
Recording: phone mirrored with scrcpy, captured in OBS; browser scenes captured from the PC.

## Before recording

- Phone: Do Not Disturb on, theme set to Light, battery above 50 %, Wi-Fi on the same network as Metro.
- App: Settings → Delete all data. Then Settings → Add supplier: "Apotheke am Bahnhof", pharmacy, email = your test Gmail, lead time 2 days.
- Have ready: an anonymised paper medication list (printed), the demo-plan QR on screen or paper, a pack with a DataMatrix.
- Browser on the PC: Gmail open in one tab (for the reorder email), empty second tab for the confirmation page.
- Server: Settings → "Check shortage list now" once, so the federal list is fresh (it caches 6 h).
- OBS scenes: (1) phone mirror, (2) browser, (3) title card with logo and easy-medrefill.com, (4) end card.

## Scenes

| # | Time | On screen (you do) | Narration (you say) |
|---|---|---|---|
| 0 | 0:00–0:06 | Title card: logo, "Easy MedRefill", "Your medication supply, never broken." | "Easy MedRefill. I built it because my wife takes fifteen medications after a transplant, and every month something runs out before the refill arrives." |
| 1 | 0:06–0:14 | Cold start: splash, launch screen, welcome screen. | "The app treats medication as a personal supply chain, not a reminder list. Everything lives encrypted on the phone." |
| 2 | 0:14–0:30 | Tap "Photograph a paper list" → consent screen → Allow → photograph the printed list → Read this list → review screen appears with names and doses → Import. | "Start with what patients actually have: a paper list. One photo, and Meta's Muse Spark transcribes it into entries with the dose pattern. You check every line, nothing is saved before you say so." |
| 3 | 0:30–0:40 | Dashboard: greeting card, counters, then scroll to a medication card; open it; show the Forecast card with both runways. | "Each medication gets two runways: when the pills run out, and when the prescription expires or its refills end. The app plans the reorder early enough that neither one stalls." |
| 4 | 0:40–0:55 | Detail → Reorder → compose screen with the message preview → Approve and send → request page shows Sent. Cut to browser: the email in Gmail. | "Reorders go through the channels that already exist: a templated email to your own practice or pharmacy. Fixed wording, every value checkable. No new portal for the practice." |
| 5 | 0:55–1:05 | Browser: click the confirmation link → practice page → Confirm. Back to phone: Orders tab → Confirmed. | "The practice confirms with one click, no login. The status comes back into the app, and if nobody replies, the server follows up by itself." |
| 6 | 1:05–1:20 | Dashboard: shortage banner with the critical medication, "Reorder now" button; tap into the medication to show "Reorder today". | "Shortages are the part that scares every transplant patient. The server reads the federal shortage list with Muse, the app matches it on the phone, and a critical medication moves its reorder to today, with a heads-up to the clinic. It never suggests a substitute; that stays with the doctor." |
| 7 | 1:20–1:30 | Settings: AI features switches, then the "Everything stays on this phone" line. End card: logo, easy-medrefill.com, "Built in Switzerland. Data stays here." | "Two AI features, both opt-in and both explained. Everything else never leaves the phone. Easy MedRefill: built in Switzerland, data stays here. Next step: a pilot with a transplant clinic." |

Optional scene if the reply assistant is finished (insert after scene 5, ≈ 8 s):
Orders tab → a request that was confirmed from a reply email, with the pickup date filled in.
"Practices often reply in prose instead of clicking. Muse reads the reply, updates the status and pickup date, and drafts an answer that I approve before anything is sent."

## Captions (burn in, lower third, 3–4 words)

- Scene 2: "Photo → entries (Muse Spark)"
- Scene 3: "Two runways per medication"
- Scene 4: "Templated email, no portal"
- Scene 5: "One-click confirmation"
- Scene 6: "Federal shortage list via Muse"
- Scene 7: "Local-first · Swiss hosting"

## Notes

- Word count of narration ≈ 240, which fits 95 s at a calm pace. Trim scene 1 if over time.
- Keep the real list out of frame if it is not anonymised; the demo-plan QR is a safe fallback for scene 2 (it shows the same review screen).
- Do not shake the phone during recording (dev menu). Avoid the status bar showing the Metro connection toast: let the app sit 10 s after launch before recording.
