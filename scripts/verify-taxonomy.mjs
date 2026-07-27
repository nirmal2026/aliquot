#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   ALIQUOT — TAXONOMY VERIFICATION            scripts/verify-taxonomy.mjs

   Wire into `npm run verify`. Exits non-zero on any structural error, which
   is what makes it a gate rather than a report.

   TWO MODES, chosen automatically:

     REGISTRY MODE  src/modules/index.js is present. The taxonomy is audited
                    against the real calculator registry. This is the mode
                    that catches the failure this file exists to catch — a
                    routine added without a taxonomy row, or a row left
                    behind after a routine was removed or moved module.

     SELF-CHECK     src/modules/index.js is absent, as it is in a repo that
                    holds only the additive files. The taxonomy is audited
                    against itself: category and matrix values are validated,
                    empty matrix arrays are caught, counts and the limit
                    index are printed. It CANNOT catch an orphan in either
                    direction, and it says so rather than reporting a clean
                    run that means less than it appears to.

   ISO/IEC 17025 §7.11.2 — this script is part of the software verification
   record for the app. Keep its output with the release it gated.
   ══════════════════════════════════════════════════════════════════════════ */

import { auditTaxonomy, countByCategory, countByMatrix, getLimitIndex,
         TAXONOMY, CATEGORIES, MATRICES } from "../src/data/taxonomy.js";

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YEL = (s) => `\x1b[33m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;

/* ── choose the mode ──────────────────────────────────────────────────── */
let calcs = null;
let mode = "self-check";
try {
  const mod = await import("../src/modules/index.js");
  const reg = mod.default ?? mod.CALCS ?? mod.calcs;
  if (Array.isArray(reg) && reg.length) { calcs = reg; mode = "registry"; }
} catch { /* tree not present — self-check */ }

if (!calcs) {
  /* Synthesise a registry FROM the taxonomy. Orphan detection is then
     tautologically clean, which is exactly why it is called out below. */
  calcs = Object.entries(TAXONOMY).map(([id, t]) => ({ id, mod: t.mod, name: id, sub: "" }));
}

/* ── audit ────────────────────────────────────────────────────────────── */
const a = auditTaxonomy(calcs);

console.log(B("\nAliquot — taxonomy verification"));
console.log(`mode: ${mode === "registry" ? GRN("registry") : YEL("self-check")}`);
if (mode !== "registry")
  console.log(YEL("  src/modules/index.js not found. Orphan detection is INACTIVE in this mode —\n" +
                  "  a routine registered without a taxonomy row will NOT be caught until the\n" +
                  "  application tree is present in this repository."));

console.log(`\nroutines: ${a.routines}   taxonomy rows: ${a.tagged}` +
            `   categories: ${CATEGORIES.length}   matrices: ${MATRICES.length}`);

const cat = countByCategory(calcs);
const mx  = countByMatrix(calcs);
console.log(B("\nby category"));
for (const c of CATEGORIES) console.log(`  ${String(cat[c.id]).padStart(3)}  ${c.name}`);
console.log(B("\nby matrix") + "  (a routine serving several matrices counts in each, so this sums high)");
for (const m of MATRICES) console.log(`  ${String(mx[m.id]).padStart(3)}  ${m.name}`);

/* ── the amendment-watch list ─────────────────────────────────────────── */
const idx = getLimitIndex(calcs);
console.log(B(`\nlimits index — ${idx.length} routines grade against a notified instrument`));
for (const r of idx)
  console.log(`  ${r.verify ? RED("VERIFY") : "  ok  "}  ${r.id.padEnd(11)} ${r.instrument.slice(0, 96)}`);

/* ── result ───────────────────────────────────────────────────────────── */
if (a.warnings.length) {
  console.log(B(`\n${a.warnings.length} warning(s)`));
  for (const w of a.warnings) console.log(`  ${YEL("!")} ${w}`);
}
if (a.errors.length) {
  console.log(B(`\n${a.errors.length} error(s)`));
  for (const e of a.errors) console.log(`  ${RED("x")} ${e}`);
  console.log(RED("\nFAIL — taxonomy is inconsistent with the registry.\n"));
  process.exit(1);
}

console.log(GRN(`\nPASS — taxonomy structurally consistent (${mode} mode).\n`));
