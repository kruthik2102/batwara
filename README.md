# Batwara

Split bills with friends, Splitwise-style, with no server. Groups live on the phones of the people in them and sync by passing an encrypted file around (WhatsApp, Quick Share, Bluetooth, email). Settle up through PhonePe, Google Pay, Paytm or BHIM with the amount filled in.

The interface follows Apple's design language: large titles, inset grouped lists, a floating glass tab bar, page sheets that push the screen behind them back, pull-down menus, action sheets, swipe actions, and spring physics with velocity hand-off and momentum projection. It runs on Android.

## Install the APK

Every push to `main` builds a signed APK on GitHub Actions:

- **Releases → latest → `batwara.apk`**: open this link on the phone and install it (allow "Install unknown apps" for your browser when Android asks).
- The same file is also on the `apk` branch.

Builds are signed with the development key in `android/app/batwara-dev.keystore`, so each new build installs over the old one and keeps your data. Make your own private key before publishing to Google Play.

## What it does

| Area | Features |
| --- | --- |
| Sign-in | Mobile number + 6-digit code (demo provider shows the code on screen; plug in a real SMS relay with `VITE_OTP_RELAY_URL`) |
| Groups | Trip / Home / Couple / Work / Other, currency per group, members by phone number or from Contacts, simplify debts, remove from phone |
| Expenses | Equal, exact amounts, percentages, shares, adjustments, itemised with tax and tip, several payers, foreign currency with editable rate, category guess from the description, notes, receipt photo, repeat weekly or monthly, comments, edit history, delete and restore |
| Balances | Per group and per friend, pairwise or simplified, totals by category and month, CSV export |
| Settle up | Installed UPI apps listed natively; opens the chosen app with payee, amount and note; reads the app's reply; the receiver confirms before it counts; cash and other payments; reminders via the share sheet; UPI ID from a QR-code image |
| Sync | Encrypted update and invite files; merge in any order, repeatedly; tampered or foreign files rejected |
| Other | Activity feed, light/dark/automatic appearance, haptics, reminders for repeating expenses, the phone's text size |

## How it works

- **Event log.** Every change (expense added, edited, deleted, payment confirmed…) is an immutable event. Balances are computed from the log, so there is no stored balance to drift.
- **Signatures.** Each phone has its own ECDSA P-256 key. Every event is signed; imports verify signatures and reject anything that doesn't check out. A known device can't be re-keyed.
- **Ordering.** Hybrid logical clocks order events across phones, so the latest edit wins the same way everywhere.
- **Merging.** A group file contains the group's whole log. Importing is a set union by event id: idempotent, order-independent, and convergent (tested).
- **Encryption.** Group files are AES-256-GCM encrypted with a per-group key, bound to the group id. An *invite* carries the key; an *update* doesn't, so a forwarded update is useless to outsiders.
- **Identity.** Your id is derived from your verified phone number, so people can add you to a group before you join, and a lost phone recovers by verifying the same number and importing an invite from any member.
- **Money.** Integer paise everywhere; leftover paise go to the payer first; currency conversion re-allocates so shares always add up exactly.

## Project layout

```
src/core/       pure logic: money, splits, HLC, events, reduce, balances, recurring, sync, CSV, UPI (unit-tested)
src/platform/   Capacitor wrappers: storage, haptics, share, files, status bar, UPI and contacts plugin, OTP
src/ui/         design system: springs, gestures, navigation stacks, sheets, overlays, components
src/screens/    tabs and pushed screens
src/sheets/     modal sheets: add/edit expense, settle up, new group, add people, import
android/        Capacitor 6 Android project + BatwaraSystemPlugin.java (insets, UPI apps, contact picker)
test/           node:test suites
```

## Build it yourself

```bash
npm ci
npm test                 # core logic tests
npm run dev              # browser preview at http://localhost:5173
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease   # needs JDK 17 and the Android SDK
```

## Real SMS codes

The app ships with a demo verifier. To send real codes, run a small stateless relay (any serverless function) and build with `VITE_OTP_RELAY_URL=https://your-relay`. The relay needs two endpoints:

- `POST /v1/otp/send` `{ phone }` → `{ requestId, ttl, resendAfter }`
- `POST /v1/otp/verify` `{ requestId, code }` → `200` on success, or `{ message, code, triesLeft }` with a 4xx

Back it with an SMS provider (MSG91, Twilio Verify, Firebase Auth). Sending SMS in India needs DLT registration of your sender ID and template.

## Known limits

- UPI apps don't reliably report payment results, which is why the receiver confirms each payment.
- Some UPI apps refuse pre-filled person-to-person requests; the sheet offers Copy UPI ID as a fallback.
- Sync is manual by design: send an update after changes so others see them.
- Exchange rates ship as approximate defaults; "Update rates" fetches ECB reference rates when online.
