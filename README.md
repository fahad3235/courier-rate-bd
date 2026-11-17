# Courier Rate BD

Offline, bilingual (English / বাংলা) Bangladesh courier rate comparison and parcel cost estimator. A pure static web app — no server, no network requests, no account.

## Honesty note — no real prices

**This app ships with zero real courier prices.** Every rate is entered by the user from the courier's own offer. The optional "Load demo data" button loads three clearly labelled **DEMO SAMPLE** couriers whose rates are invented examples, not real prices. Never treat demo rates as a courier's actual charges — always confirm the current rate with the courier before quoting a customer.

## Problem

Small sellers and online shops in Bangladesh juggle several couriers, each with different zone rates, per-kg charges, COD fees and delivery times. Rates change often and live in screenshots and chat messages. Courier Rate BD gives one offline place to keep the rates *you* collected, compare them side by side, and estimate what a parcel will cost before booking it.

## Features

1. **Courier rate cards (CRUD)** — name plus, for Inside Dhaka and Outside Dhaka: base charge for the first 1 kg, per-extra-kg charge, COD fee %, minimum charge, delivery days (min–max). Add, edit and delete with inline validation (positive numbers, days min ≤ max, name required, no duplicate names, case-insensitive).
2. **Cost estimator** — weight (kg, decimals allowed, > 0, max 50), zone selector, optional COD amount. Cost = base + ⌈weight − 1⌉⁺ × per-kg + COD × COD%; the minimum charge applies when the computed total is lower. Results are sorted cheapest first, with **Cheapest** and **Fastest** badges. Invalid inputs show inline errors; with no couriers saved, a clear empty state is shown.
3. **Comparison table** — all couriers with both zones' rates, COD % and days; sortable by price (Inside Dhaka base) and by fastest delivery.
4. **Dashboard strip** — courier count, cheapest Inside-Dhaka base, fastest delivery, last estimate summary.
5. **Data tab** — JSON export (download), strict import (malformed JSON, wrong shape and negative numbers are rejected and reported per entry), typed-`DELETE` erase-all, and a clearly labelled "Load demo data" button.
6. **English / বাংলা toggle** — persisted in localStorage; Bengali digits in Bengali mode. All UI strings exist in both languages (`js/i18n.js`, plain UTF-8).
7. **Responsive** — clean layout at 1280 px and 390 px with no horizontal overflow at 390 px.

All data is stored in the browser's `localStorage` only. Nothing leaves the device.

## Stack

- Pure static HTML + CSS + vanilla JavaScript (no build step, no framework, no CDN, no external requests).
- `js/core.js` — pure logic (cost calc, validation, sorting, import validation). No DOM access, so it is unit-tested directly with Node.
- `js/i18n.js` — English/Bengali string tables.
- `js/app.js` — DOM/UI layer, localStorage persistence.
- Tests: Node's built-in `node:test` runner, no dependencies.

## Prerequisites

- Any modern browser (for the app).
- Node.js 18+ (only for running the unit tests).

## Install

No install step. Clone or download the repo and open `index.html` in a browser — or serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Dev commands

```bash
node --test tests/test.js   # run the unit tests
```

There is no build step and no package manager setup.

## Testing

- **Unit tests:** `node --test tests/test.js` — 26 test cases, 95 assertions covering cost calculation (fractional weight, exact 1 kg, 0.5 kg, 50 kg cap, COD fee, minimum charge, zero COD %), cheapest/fastest sorting, validation rejections, and import validation (good input plus malformed JSON, non-array, wrong shape, negative numbers, duplicate names, empty array). See `TEST_RESULTS.md` for the exact run output.
- **Browser smoke test:** headless-Chrome (CDP) checks recorded in `TEST_RESULTS.md` — page loads with zero console/page errors, estimator math in the live page matches `core.js` for two hand-computed cases, no horizontal overflow at 390 px, EN/BN toggle switches visible strings, demo-data load and erase-all work, and export/import round-trip works.

## Deployment

Static hosting only. Any static host works (GitHub Pages, Netlify, Vercel, or a plain web server): publish the repository root so `index.html` is served. No environment variables, no secrets, no backend.

## Limitations

- Rates are only as current as the user keeps them — the app cannot fetch live courier prices (by design: it makes no network requests).
- Data lives in one browser's localStorage. Clearing browser data, or switching browsers/devices, loses the saved couriers — use JSON export as a backup.
- The estimator charges extra weight per *started* kg above 1 kg (ceil), which matches common courier practice but may differ from a specific courier's rounding rule; check the courier's own terms.
- COD fee is computed on the COD amount entered; some couriers charge COD on the parcel value or add a fixed fee — enter the effective % accordingly.
- Bengali translations cover the app's own UI strings; courier names are shown exactly as typed.

## Status

Complete MVP. All features implemented and tested (see `TEST_RESULTS.md`). No real courier data bundled.
