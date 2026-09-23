# Envicron

Offline environmental laboratory & field calculator — 91 routines, 12 source
modules grouped into 7 matrix pages. Vite-free single-file web build wrapped in
Capacitor for Android.

Not an official product. A calculation aid, not a validated method
(ISO/IEC 17025:2017 §7.11.2 applies).

## Build the app
- `node scripts/build-html.mjs` → writes `aliquot.html` (copied to `www/index.html`)
- `npm run verify` → runs the registry + uncertainty + decision/noise gates

## Build the APK (GitHub Actions)
Actions → **Build Envicron APK** → **Run workflow**. The workflow verifies the
tree, rebuilds the HTML, generates launcher icons from `brand/logo.svg`, then
`cap add/sync android` and `gradlew assembleDebug`. Debug APK in the run's
Artifacts.

`android/` is generated on the runner and is gitignored — do not commit it.
