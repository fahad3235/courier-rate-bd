# Courier Rate BD — Test Results

Date: 2026-11-17. All results below are from real runs on this machine; nothing is invented.

## Hand-computed estimator checks (verified by hand before writing tests)

Cost model: `total = base + ceil(max(weight − 1, 0)) × perKg + COD × COD%`, then `total = max(total, minCharge)`.

| # | Inputs | Hand computation | Expected | Verified |
|---|--------|------------------|----------|----------|
| A | base 60, per-kg 20, weight 2.5 kg, COD ৳1000 @ 1% | extra = ceil(1.5) = 2 kg → 60 + 2×20 + 1000×0.01 = 60 + 40 + 10 | **৳110** | Unit test + live page (see below) |
| B | base 80, per-kg 30, weight 1.0 kg, COD 0, min 100 | extra 0 → 80 → below min → min applies | **৳100** (min applied) | Unit test + live page |
| C | base 50, per-kg 25, weight 0.5 kg | extra 0 → 50 | **৳50** | Unit test |
| D | base 100, per-kg 10, weight 50 kg (cap) | extra 49 → 100 + 490 | **৳590** | Unit test |
| E | base 70, per-kg 40, weight exactly 1.0 kg | extra 0 → 70 | **৳70** | Unit test |
| F | COD ৳500 @ 2% → fee ৳10; COD @ 0% → fee ৳0 | 500×0.02 = 10 | **৳10 / ৳0** | Unit test |
| G | base 90, per-kg 10, weight 3 kg, min 50 | 90 + 2×10 = 110 > min → min NOT applied | **৳110** | Unit test |
| H | outside zone, base 120, per-kg 30, weight 2 kg | 120 + 1×30 | **৳150** | Unit test |

## 1. Unit tests (Node)

Command:

```bash
cd ~/workspace/muse-project-factory/builds/courier-rate-bd
node --test tests/test.js
```

Result: **28 tests, 28 pass, 0 fail** (Node v24.22.1, duration ~195 ms). 95+ assertion calls across the suite.

Coverage: cost calc (fractional weight, exact 1 kg, 0.5 kg, 50 kg cap, COD fee, minimum charge applied/not applied, zero COD %, outside zone, just-above-1 kg rounding), cheapest/fastest sorting + badges, dashboard helpers, estimate validation (weight 0/negative/NaN/>50, COD negative, bad zone), courier validation (name required, case-insensitive duplicate, base/perKg/COD%/minCharge/days out of range, daysMin > daysMax, missing rates), import validation (good array, this app's own export shape `{couriers: [...]}`, malformed JSON, non-array top level, object without a couriers array, wrong-shape entries rejected individually with indexes, negative numbers, duplicate names inside one import, empty array), demo data validity, Bengali-digit and money formatting.

Repair history: first run was 25/26 — one failure in `sortByInsideBase and sortByFastest`. Root cause was a wrong expectation in the *test*, not the app: `sortByFastest` uses the minimum daysMin across both zones (as documented in `js/core.js`), and the test data left outside-zone days at the default 2, creating a tie resolved by stable sort. Fixed the test to set outside-zone days explicitly. Re-ran: 26/26. Two more tests were then added for the export-shape import fix (see §3): final 28/28.

## 2. Headless-Chrome smoke test (CDP)

Tool: cached `chromium_headless_shell-1187` at `~/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell`, driven over CDP (raw WebSocket, Node 24) by `/tmp/smoke-cdp.mjs`. Page loaded over `file://`. Note: `--dump-dom` outputs zero bytes in this VM build, so CDP was used as documented in the workspace notes.

Command:

```bash
rm -rf /tmp/crbd-profile
node /tmp/smoke-cdp.mjs
```

Result: **33/33 checks passed**, 0 page exceptions, 0 console errors.

Checks that passed (each verified live in the page):

- Page loads: title, `window.__app` + `window.CourierCore` present, header text, 4 dashboard stats, estimator empty state ("No couriers saved yet").
- Courier CRUD via the real form: add "Test Courier" (count 1, name stored); duplicate name "test courier" (case-insensitive) rejected with inline error and not added (count stays 2).
- Estimator live case A: weight 2.5 kg, Inside Dhaka, COD ৳1000 → **৳110** (matches hand computation), Cheapest badge shown, dashboard last-estimate reads "2.5 kg · Inside Dhaka · ৳110".
- Estimator live case B: weight 1 kg, COD 0 → Test Courier ৳60, "Min Courier" ৳100 with minimum-charge note shown; Cheapest badge on Test Courier.
- Validation: weight 0 shows inline error "Enter a weight greater than 0 kg."
- EN/BN toggle: heading switches to "পার্সেল খরচের হিসাব", dashboard count shows Bengali digit "২", toggle back restores English.
- Compare: table renders 2 rows; sort-by-fastest puts Test Courier (1–2 days) first.
- Demo data: load adds 3 sample couriers (count 2 → 5), DEMO SAMPLE badges visible.
- Erase-all: typing DELETE clears all (count 0).
- Export/import round-trip: export 5 couriers → erase → import → 5 added, 0 rejected, count 5.
- Import rejection: non-array JSON rejected (0 added); mixed file adds 1 valid courier and rejects 1 bad entry (`inside:baseInvalid`).
- Responsive: `document.documentElement.scrollWidth` = 390 at 390 px viewport and 1265 at 1280 px — no horizontal overflow at either width.
- Persistence: localStorage key `courierRateBD.v1` written; after `Page.reload`, 6 couriers survive (5 re-imported + 1 from the mixed-import check).
- Zero page exceptions and zero console errors across the whole run.

## 3. Bug found and fixed during testing (repair cycle 1 of 2)

**Bug (real, found by the smoke test): export/import round-trip was broken.** `buildExportJson()` writes the wrapped object `{app, version, exportedAt, couriers: [...]}`, but `validateImport()` strictly required a top-level array and rejected the app's own export with `notArray` — so a user exporting then importing their own backup would get 0 couriers back. First smoke run: 30/33, with the round-trip check failing (`added: 0`) and the reload-persistence check failing as a cascade (count 1 instead of 6).

**Fix:** `js/core.js` `validateImport()` now also accepts an object whose `couriers` property is an array (the app's own export shape), while still rejecting objects without a `couriers` array (`notArray`), malformed JSON, and invalid entries individually. Two unit tests added for the new shape (valid wrapped export; object with non-array `couriers` rejected).

**Also fixed in the same cycle:** one smoke-check expectation was wrong (expected "Test Courier=৳80" for the 1 kg case; the correct hand-computed value is ৳60 — base 60, no extra kg). The app was right; the check was corrected.

After the fix: unit tests 28/28, smoke 33/33. No further repair cycles needed.

## Files tested

- `index.html`, `css/style.css`, `js/app.js`, `js/core.js`, `js/i18n.js` (all present, UTF-8 Bengali strings in `js/i18n.js` unescaped)
- `tests/test.js`, `README.md`, `.gitignore`

## Known limitations (not failures)

- Smoke-test profile (`/tmp/crbd-profile`) is throwaway; the app's localStorage behaviour was verified in-page and across a reload within that profile.
- The export download itself (browser save dialog) was not exercised end-to-end in headless mode; the export *content* and the import of that content were verified exactly via `buildExportJson()` + `importJsonText()`.
