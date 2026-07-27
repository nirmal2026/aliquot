# Aliquot — release gate

Nothing below is legal advice. Items in **Gate A** are the ones where getting it
wrong costs more than a rejected build.

---

## Gate A — clear before you write another line of billing code

### A1. Permission to monetise, not just to publish

The build-state note says you will seek Competent Authority permission before
release. **Monetising changes what you are asking for.** A free personal app is
a hobby; a paid app on Play is private trade, and the conduct rules applicable
to your post (CCS (Conduct) Rules, 1964, rule 15, as applied through CPCB's
service regulations — *VERIFY which instrument governs your post*) require
previous sanction for that.

Three things make this sharper than a normal side project:

- The subject matter is your official domain. An app that issues compliance
  verdicts against CPCB-administered instruments, sold by a serving CPCB officer,
  invites the reading that it carries official weight — which is the exact thing
  your own guardrail forbids.
- Play requires a **publicly displayed developer name, email and physical
  address** for paid apps and apps with in-app purchases. Your name becomes
  publicly attached to a commercial product in your regulatory field.
- Payments create a taxable income stream that has to be declarable.

**Ask for sanction in writing, describing it as a paid application, before
submission.** A free listing with no IAP is a materially smaller ask and remains
available as a fallback.

### A2. BIS copyright on the transcribed IS tables

Government instruments and the app are in different positions:

| Content | Position |
|---|---|
| EP Rules 1986 Sch. VI · S.O. 3401(E) · NAAQS 2009 notification · Noise Rules 2000 · HOWM 2016 | Gazette-published rules and orders. Section 52(1)(q), Copyright Act, 1957 permits reproduction. |
| **IS 10500 : 2012 tables (64 determinands) · IS 3025 · IS 5182 · IS 1350 · IS 11255 method text** | **BIS asserts copyright and sells these standards.** An IS standard is not an Act, rule or order, even where a notification refers to it. |

Reproducing IS 10500's limit tables verbatim inside a **paid** app is the
sharpest exposure in this plan. Two clean routes:

1. **Write to BIS** for permission to reproduce the tables in a commercial app,
   or ask what licence applies. Slow, but it settles the question.
2. **Design around it.** `is10500` is currently in the free `water` module. Keep
   every IS-table-derived panel free, or ship the panel with the row *shape* and
   the citation but no transcribed numbers — the user enters the limit from their
   own copy of the standard. This is already the pattern used for STP limits
   (`STP_NOTE`) and it works.

Route 2 costs one afternoon and removes the exposure entirely. Route 1 is
better if the panels are the reason anyone would pay.

### A3. Play Billing, not Razorpay

Build-state open item 2 is a submission blocker, not a to-do. Google Play's
Payments policy requires Play's billing system for digital purchases inside a
Play-distributed app. Enforcement is removal.

`src/pay/entitlement.js` (delivered) does the swap and keeps Razorpay alive for
direct-APK distribution behind `DISTRIBUTION === "direct"`. Ship one or the
other — shipping both and choosing at runtime is the arrangement the policy
prohibits.

---

## Gate B — sign-in

**Recommendation: drop the local password account for the Play build.**

The current design is on-device PBKDF2 with no password reset. For paying users
that is a support problem and a refund problem: reinstall, forget the password,
lose the account. Worse, if entitlement is keyed to the local account, a
reinstall can look like a lost purchase.

Play Billing already ties the entitlement to the **Google account**, so:

- **Play build** — the one-time sign-in is Google Sign-In, or no sign-in at all
  and the Play account carries the entitlement implicitly. Restore-purchases
  works by definition. Password reset is Google's problem, not yours.
- **Direct-APK build** — keep the PBKDF2 account. It is the right design where
  there is no account system to lean on.

If you add Google Sign-In you are collecting an identifier, and the **Data
safety** declaration changes from "no data collected" to a disclosed
authentication identifier. Fill that in honestly; a false Data safety form is
its own enforcement ground.

---

## Gate C — technical

- [ ] `npm run verify` green, including `auditTaxonomy()` — **add it to the
      workflow gate**, so a routine added without a taxonomy row fails CI
- [ ] Confirm the `noise` routine id against `src/modules/noise.js`; the
      taxonomy row is written from the parameter inventory, not from source
- [ ] Retire `bcf` (mod `hw`) or point its `ref` at `transfer` (mod `phyto`).
      Two routines answering the same question with different rigour means the
      weaker one ends up in a report
- [ ] Replace the hard-coded "189 substances" in the `csite` hint with
      `countRows()` — build-state open item 6
- [ ] Apply the three pending packs: `aliquot-is10500.jsx`, `aliquot-hwm2016.jsx`,
      `aliquot-phyto-module.jsx`
- [ ] Brace-balance check on `src/ui/Styles.jsx` in the smoke test
- [ ] Purchase acknowledged within 3 days — verified by killing the app between
      purchase and acknowledgement, then reopening
- [ ] Entitlement resolves with **aeroplane mode on** after one online sync.
      This is the assumption offline-first rests on; test it, do not assume it
- [ ] Target API level meets Play's current requirement for new apps —
      *VERIFY the current number, it moves annually*
- [ ] Play App Signing enrolled; upload keystore backed up somewhere that is not
      the build machine
- [ ] Internal testing track → closed track → production. Do not go straight to
      production with a billing integration

---

## Gate D — listing

- [ ] Store listing carries the disclaimer verbatim: personal project, not a
      product of CPCB, MoEFCC or BIS, no endorsement claimed or implied
- [ ] Listing says **calculation aid, not a validated method**, and names
      ISO/IEC 17025 §7.11.2
- [ ] No CPCB logo, colours, name in the app title, or wording that implies
      official status. "Aliquot" is clean; "CPCB Calculator" would not be
- [ ] Screenshots contain no internal format, no SOP code, no real monitoring
      data from official work
- [ ] Every VERIFY marker in `getLimitIndex()` is either resolved or visible to
      the user in the app — currently `naaqs` and `teq`
- [ ] Privacy policy URL (Play requires one even for an app that collects
      nothing). State plainly that calculations never leave the device
- [ ] Content rating questionnaire completed
- [ ] Refund position stated in the listing: Play's own refund window applies

---

## Sequencing

A1 and A2 are independent of all code and have the longest lead times. Start
them now; they will still be running when the code is finished.
