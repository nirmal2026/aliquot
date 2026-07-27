# Aliquot — build state, architecture and open decisions

Last updated 27 July 2026.

## What exists now

The app is no longer a single JSX file. It is a Vite + React project wrapped in
Capacitor for Android, with **73 calculators across 10 modules** and a
155-assertion verification suite.

Delivered to Nirmal as `aliquot-android-project.zip` plus two single-file
builds: `aliquot-offline.html` (sign-in and licensing on) and
`aliquot-preview.html` (sign-in off, everything unlocked — the one that works
when opened straight off phone storage; see the secure-context section below).

| Module | id | Routines |
|---|---|---|
| QA / QC & Validation | `qc` | 8 |
| Unit Converters | `conv` | 3 |
| Solutions & Standards | `sol` | 5 |
| Water & Wastewater | `water` | 10 |
| Ambient Air | `air` | 5 |
| Source Emission | `stack` | 5 |
| Dispersion Modelling | `disp` | 5 |
| Waste & Contamination | `hw` | 12 |
| Fuel, Biomass & Waste | `fuel` | 7 |
| **STP / ETP / CETP & RO** | `plant` | **13 (new)** |

The base 51 came from `lab-calculator.jsx`; the 9 in `fuel` and `hw` came from
`claude/lab-calculator-additions.jsx` (that patch pack is now fully applied and
is superseded — do not apply it again). The 13 in `plant` are new and are held
in `claude/plant-module-stp-etp-cetp-ro.jsx`.

### The 13 new plant routines

`treff` removal efficiency and mass load · `plantcomp` Schedule VI compliance
panel · `asp` activated sludge (F/M, SRT, HRT, VLR, SVI, RAS) · `clarifier`
overflow, solids and weir loading · `aeration` AOR → SOTR → air flow → blower kW
· `nitden` nitrification and denitrification stoichiometry with alkali dosing ·
`chlor` chlorination, CT and log removal · `sludge` production, thickening,
Van Kleeck VS destruction, digester gas · `sbrmbr` SBR cycle capacity, MBBR
surface loading, MBR flux and permeability · `cetp` blend and member load share
· `inhibit` biological inhibition screening · `ro` recovery, rejection, flux,
NDP, specific energy · `scale` LSI, Ryznar, Puckorius, concentrate-side LSI, SDI.

## The content:// / secure-context trap — read this before debugging phone issues

Nirmal opened `aliquot-offline.html` from the Android Files app. Chrome received
it as a **`content://`** URL, which is an opaque, non-secure origin. Three
consequences, all of which looked like app bugs:

1. **No "Add to Home screen".** Chrome only offers it for `http`, `https` and
   `file` addresses. Not configurable.
2. **`localStorage` refused** → `src/lib/store.js` falls back to in-memory, so no
   account, session or licence survives a restart.
3. **`crypto.subtle` is undefined** — WebCrypto is gated on a secure context.
   Sign-in threw and registration was impossible. This one was a real defect.

Fixes applied:

- **`src/lib/pbkdf2.js`** — a pure-JS SHA-256 / HMAC / PBKDF2 implementation used
  automatically when `crypto.subtle` is absent. Output is **byte-identical** to
  `crypto.subtle.deriveBits` at the same iteration count, checked against Node's
  `crypto.pbkdf2Sync` across six parameter sets plus the standard
  `password`/`salt`/c=1 known-answer vector. An account created on either path
  verifies on the other. 210 000 iterations takes about 0.5 s on a desktop and a
  couple of seconds on a phone; the parameters were **not** weakened to make it
  faster. `crypto.getRandomValues` is not secure-context gated, so salts stay
  cryptographically random on every path.
- **`cryptoPath()`** is surfaced on the sign-in screen, so which path is in use is
  visible rather than guessed at.
- **Preview build** — `npm run build:preview` sets `VITE_ALIQUOT_PREVIEW=1`,
  which makes `PREVIEW` true in `src/config.js`. `App.jsx` then skips the auth
  gate and `license.js` unlocks every module, with a banner saying so. This is
  the correct build for local-file use on a phone, because neither an account nor
  a licence can persist on that origin anyway.

Inside the APK the Capacitor WebView serves from `https://localhost`, which *is*
a secure context, so the native path and real persistence are used. For a
home-screen icon without the APK: Samsung Internet and Firefox offer *Add page
shortcut* for local files where Chrome does not, or serve over
`http://localhost` from Termux to restore a real origin.

## Two real bugs found and fixed

1. **`isokinetic` pressure ratio** — the fix set out in patch block ⑥ is
   applied. With defaults `P_s = P_bar = 760, P_m = 0` the old expression
   evaluated to 0 and `|| 1` silently swallowed it, so the metered rate had no
   pressure correction at all. Now `P_s / (P_bar − P_m)`, with a guard that
   refuses `P_m ≥ P_bar`. Regression-tested.

2. **`prox` basis conversion** — the "Basis of the values entered" selector was
   never read by `run()`, so a db → db conversion applied `100/(100 − M)` a
   second time and double-counted moisture. Now the moisture term is zeroed when
   the source basis is already dry, and a contradictory entry (dry basis with
   moisture > 0.5 %) is flagged. Regression-tested.

Also fixed: `flue` returned M_d = 28 kg/kmol from a completely empty form (N₂
came out as 100 % by difference), which looked like a result. It now requires at
least one of CO₂, O₂, CO or N₂.

And one self-inflicted break worth remembering: a scripted edit to
`src/ui/Styles.jsx` accidentally deleted the `@media (max-width:860px){` opener,
which silently unbalanced the stylesheet and dropped every mobile rule after it.
The build did not complain — CSS inside a template literal is never parsed at
build time. There is now a brace-balance check in the smoke test; run it after
any scripted edit to `Styles.jsx`.

## Decisions taken

- **Google Fonts removed.** The original CSS `@import`ed Archivo, JetBrains Mono
  and Space Grotesk from `fonts.googleapis.com`. That is a network call on every
  launch, fails silently offline, and contradicted the app's own privacy claim.
  Platform fonts (Roboto / Roboto Mono on Android) are used instead. The font
  stacks still name the three families first, so self-hosting `.woff2` files in
  `public/fonts/` later needs no other change.
- **Auth: on-device, PBKDF2-HMAC-SHA256, 210 000 iterations, random 16-byte
  salt.** Mobile number (TRAI 10-digit `^[6-9]\d{9}$`) or email, plus password.
  No network, therefore **no password reset**. Login is timing-equalised so a
  wrong handle and a wrong password are indistinguishable. A
  `FirebaseAuthProvider` seam exists in `src/auth/providers.js` for reset, OTP
  and cross-device sync when wanted.
- **Payment: Razorpay Standard Checkout**, provider interface in
  `src/pay/providers.js`. Key ID goes in `src/config.js`; the Key Secret must
  never be in the repo or the APK.
- **Gating: `PRO_MODULES` in `src/config.js`** — one array. Currently
  `stack, disp, hw, fuel, plant` = 40 of 73 routines gated, 33 free. A **test
  unlock** appears on the account screen only while no Razorpay key is
  configured, so it cannot survive into a release.
- **Regulatory limits.** EP Rules 1986 Schedule VI Part A is transcribed in
  `src/data/plant-ref.js` with a VERIFY note. **STP-specific numeric limits are
  deliberately absent** — the figure in force (MoEFCC S.O. 1327(E) of 13 April
  2017 as amended, and subsequent CPCB directions and litigation) could not be
  confirmed, so `STP_NOTE` names what to check and the user enters the consent
  value through the custom-limit option.
- **Inhibition thresholds.** An earlier draft scaled every heterotroph threshold
  by ×0.1 for nitrification and by ×2 for acclimatisation. Both were invented
  multipliers and were removed. Each substance now carries an explicit published
  nitrification value (`nt`) where one exists, and where it does not the routine
  says so and warns that a pass is unproven.

## Open items

1. **Razorpay order and verify endpoints** — until `PAYMENT.orderApiUrl` is set
   the app runs amount-only checkout: payment succeeds but the amount comes from
   the device and the signature cannot be verified, so a modified APK could pay
   ₹1 and unlock Pro. Fine for testing, not for release.
2. **Play Store vs Razorpay** — Google Play's Payments policy requires Play
   Billing for digital in-app purchases. Razorpay for a feature unlock inside a
   Play-distributed app is a policy violation. `PlayBillingProvider` is a stub.
   Razorpay is fine for direct-APK or web distribution.
3. **Licence tamper resistance** — the licence record is device-local and
   editable. Needs a server-side entitlement check at sign-in, or Play Billing's
   signed purchase tokens.
4. **APK could not be compiled in the Cowork sandbox** — its allowlist opens only
   npm and PyPI; `dl.google.com`, `maven.google.com`, Maven Central and
   `services.gradle.org` are blocked, so Gradle cannot resolve the Android Gradle
   Plugin or AndroidX. The `.github/workflows/android.yml` workflow builds the
   APK on GitHub's runners instead and uploads it as an artifact. It also runs
   `npm run verify` as a gate.
5. **No service worker.** Hosting the build at an HTTPS URL would give a proper
   installable PWA but *not* offline operation. The single-file builds are
   offline because they are single files. A hosted PWA would need a service
   worker adding.
6. **`csite` hint string** — "189 substances as notified" is hard-coded and
   matches `CS2025.length` exactly today. It will go stale silently if a
   Schedule I row is added or removed.
7. Nirmal will seek Competent Authority permission before release. The app must
   continue to read as a personal project with no CPCB endorsement — the
   disclaimer in `src/config.js` and the footer carry that.

## Conventions to keep

- `src/modules/*.js` hold formula logic only, no DOM. That is why
  `npm run verify` can exercise all 73 routines in Node.
- One calculator = one object: `id`, `mod`, `name`, `sub`, `formula`, `ref`,
  `inputs`, and a pure `run(values)` returning result rows.
- Every `ref:` string is a load-bearing citation. Preserve it character for
  character when refactoring.
- `run()` returns `null` or a `warn` row on missing or out-of-range input — never
  a silent number. The verification suite asserts this for all 73.
- Do not assume a secure context. Anything gated on one (`crypto.subtle`,
  `localStorage`, service workers, the install prompt) needs a fallback, because
  the same bundle gets opened over `content://`, `file://` and
  `https://localhost`.
- Run `npm run verify` after any formula change. Where an assertion disagrees
  with a hand calculation, check the hand calculation first: three of the four
  initial failures were wrong expected values, not code defects.
