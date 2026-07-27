# Aliquot

Offline environmental laboratory calculator. Vite + React, wrapped in Capacitor
for Android. 84 routines across 11 modules, every one carrying the standard,
method number and clause it rests on.

**This is a personal project. It is not a product of the Central Pollution
Control Board, the Ministry of Environment, Forest and Climate Change, or the
Bureau of Indian Standards, and no endorsement by any of them is claimed or
implied. It contains no internal SOP code, no internal format and no
unpublished material.**

**A calculation aid, not a validated method.** Under ISO/IEC 17025 §7.11.2 any
software used to produce reported data must be verified before use: each
routine checked against a worked example and against the current edition of the
standard cited, and the record kept. Regulatory limits change; confirm them
against the notification in force before relying on any compliance verdict.

---

## What is in this repository right now

| Path | Status |
|---|---|
| `src/data/taxonomy.js` | Complete. Category × matrix navigation layer, limits index, two-way auditor |
| `src/pay/entitlement.js` | Complete. Play Billing entitlement; Razorpay retained for direct-APK builds only |
| `scripts/verify-taxonomy.mjs` | Complete. CI gate, runs in registry mode or self-check mode |
| `.github/workflows/ci.yml` | Complete. Taxonomy gate always runs; verify and APK jobs skip until the tree lands |
| `RELEASE.md` | The release gate — read Gate A before writing more billing code |
| `docs/build-state.md` | Architecture, decisions taken, and the open items, as of 27 July 2026 |
| **the application tree** | **Not here yet.** It is in `aliquot-android-project.zip` |

### To make this a working repository

```bash
git clone git@github.com:nirmal2026/aliquot.git
cd aliquot
unzip -o ~/path/to/aliquot-android-project.zip -d .
```

Then, before the first commit:

1. **Merge, do not overwrite, `package.json`.** The placeholder here exists only
   so the CI script can resolve ES modules in an otherwise empty repository. Keep
   your real one and add:
   ```json
   "verify:taxonomy": "node scripts/verify-taxonomy.mjs"
   ```
   and chain it into `verify` so the taxonomy gate cannot be skipped.
2. **Check `.gitignore` caught everything** before `git add`:
   ```bash
   git status --porcelain | grep -Ei 'keystore|\.jks|\.env|google-services|secret'
   ```
   That must print nothing.
3. Commit. `verify` and `apk` jobs start running on the next push.

---

## The taxonomy layer

Two navigation axes over the same 84 routines. **Lead the UI with matrix and
filter by category** — that is the order a laboratory thinks in.

```js
import { filterCalcs, getLimitIndex, auditTaxonomy } from "./src/data/taxonomy.js";

filterCalcs(CALCS, { mx: "soil" });                    // everything soil
filterCalcs(CALCS, { mx: "water", cat: "compliance" });// water compliance panels
filterCalcs(CALCS, { q: "chlor" });                    // free text
getLimitIndex(CALCS);                                  // amendment-watch list
```

Current distribution, computed by the CI gate rather than written down here —
counting anything by hand is how `csite`'s "189 substances" string went stale:

- 11 categories, 8 matrices, 84 routines, 84 taxonomy rows, 0 orphans
- 13 routines grade against a notified instrument; 3 carry a VERIFY marker
- 1 routine (`bcf`) marked deprecated and hidden from browsing, superseded by
  `transfer` in mod `phyto`

`auditTaxonomy()` fails the build when a routine is registered without a
taxonomy row, a row survives its routine, or a routine changes module without
its row being revisited.

**The category and matrix assignments are an editorial navigation aid.** No
standard prescribes them and neither field may appear in a report as a
classification of a method. The `lim` field is different — it is load-bearing,
and it is the list to walk when a notification is amended.

---

## Open items that are not code

Both have long lead times and neither is blocked on anything in this repository.
Start them now. Detail in `RELEASE.md`, Gate A.

1. **Sanction to monetise.** Publishing free and selling are different asks
   under the conduct rules applicable to the post. Play displays developer name,
   email and physical address publicly for apps with in-app purchases.
2. **BIS copyright on the transcribed IS tables.** Gazette rules and orders are
   reproducible under s.52(1)(q) of the Copyright Act, 1957. IS standards are
   not — BIS asserts copyright and sells them. Either obtain permission or keep
   the IS-derived panels free / limit-free.

Until both are settled this repository stays **private**.

---

## Conventions

- `src/modules/*.js` hold formula logic only, no DOM. That is why `npm run
  verify` can exercise every routine in Node.
- One calculator = one object: `id`, `mod`, `name`, `sub`, `formula`, `ref`,
  `inputs`, and a pure `run(values)` returning result rows.
- Every `ref:` string is a load-bearing citation. Preserve it character for
  character when refactoring.
- `run()` returns `null` or a `warn` row on missing or out-of-range input —
  never a silent number.
- Do not assume a secure context. The same bundle gets opened over `content://`,
  `file://` and `https://localhost`. See `docs/build-state.md`.
- Run the full verification after any formula change. Where an assertion
  disagrees with a hand calculation, check the hand calculation first.
