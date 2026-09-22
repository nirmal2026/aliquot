/* =============================================================================
   Aliquot — src/modules/water-is10500.js
   IS 10500 : 2012 drinking-water compliance panel, from `aliquot-is10500.jsx`.

   Converted to a DOM-free module. The pack shipped as four files — the shared
   limits engine (src/lib/limits.js), the transcribed tables
   (src/data/limits/is10500.js), the limits registry (src/data/limits/index.js)
   and the routine itself. They are FLATTENED here: every helper and every data
   table is declared locally, nothing is imported, because the build compiles
   each module into its own IIFE and a local duplicate across modules is
   correct and safe. The registry file is UI/inventory bookkeeping, not
   calculation, and is not carried into this module.

   Every `ref:` string is carried across CHARACTER FOR CHARACTER, and every
   numeric limit exactly as transcribed. Nothing here is interpolated: where
   the standard prints "No relaxation" the field is NO_RELAXATION, and where it
   prints a qualitative criterion the criterion is reproduced, not converted.

   The four things a flat "value ≤ limit" loop gets wrong, all encoded here:
     · Free residual chlorine is a MINIMUM — the only one in the standard
     · Iron + manganese carry a JOINT 0.3 mg/L ceiling
     · Sulphate may reach 400 only where magnesium does not exceed 30
     · Column 4 is reachable only where no alternative source exists

   A calculation aid, not a validated method — ISO/IEC 17025 §7.11.2 applies.
   Personal project. No CPCB or BIS endorsement is claimed or implied.
   ============================================================================= */

/* ---------- helpers ------------------------------------------------------- */

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : NaN; };

const fmt = (v, sig = 4) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a < 1e-4 || a >= 1e7) return v.toExponential(3).replace("e", " × 10^");
  return Number(v.toPrecision(sig)).toLocaleString("en-IN", { maximumFractionDigits: 10 });
};

/* ---------- input builders ------------------------------------------------ */

const N = (id, label, unit, def, hint) => ({ id, label, unit, def, hint, type: "num" });
const S = (id, label, opts, def) => ({ id, label, opts, def, type: "sel" });

/* ---------- limits engine ------------------------------------------------- */
/* ══════════════════════════════════════════════════════════════════════════
   One row shape and one verdict function for a regulatory table.

   ── ROW SHAPE ───────────────────────────────────────────────────────────
   {
     k       string   Parameter key. MUST carry the reporting basis, because
                      the basis is part of the limit: "Nitrate (as NO₃)" is
                      not the same limit as nitrate as N.
     unit    string   Units of the limit AND of the value the user enters.
     dir     string   "max"  value must not exceed the limit
                      "min"  value must not fall below the limit
                      "band" value must lie inside `band`
                      "qual" non-numeric criterion, reproduced not assessed
     lim     number   Primary limit. For a two-column standard this is the
                      stricter column.
     lim2    number   Secondary/relaxed limit, or null where the standard
                      says no relaxation is permitted. `undefined` where the
                      standard has only one column.
     band    [lo,hi]  For dir "band".
     qual    string   For dir "qual" — the criterion, verbatim.
     method  string   Test method reference.
     referee string   Method that governs in case of dispute, where the
                      standard marks one. Omit where it does not.
     note    string   Remarks column, transcribed verbatim.
     src     string   Provenance inside the standard, e.g. "Table 2, Sl xvi".
   }

   ── VERDICT LEVELS ──────────────────────────────────────────────────────
     "acc"     within the primary limit
     "lim2"    outside the primary limit but within the secondary one
     "reject"  outside both, or outside the primary where lim2 is null
     "qual"    non-numeric — reported, not graded
     "na"      no limit prescribed for this parameter in this set

   A value is NEVER silently graded against a limit that does not exist:
   `lim === undefined` returns "na", not a pass.
   ══════════════════════════════════════════════════════════════════════════ */

/* Sentinel. `null` in a lim2 field means the standard prints an explicit
   "No relaxation" — distinct from `undefined`, which means the standard has
   no second column at all. Keep the two apart; they grade differently. */
const NO_RELAXATION = null;

/* Grade one value against one row.
   Returns { level, ratio, limitShown, why } — never throws. */
const assessRow = (c, r) => {
  if (!r) return { level: "na", why: "No row for this parameter" };
  if (r.dir === "qual")
    return { level: "qual", limitShown: r.qual, why: "Non-numeric criterion — assess against the printed entry" };
  if (!isFinite(c)) return { level: "na", why: "No value entered" };

  if (r.dir === "band") {
    const [lo, hi] = r.band;
    const inside = c >= lo && c <= hi;
    return {
      level: inside ? "acc" : "reject",
      limitShown: `${lo} to ${hi}`,
      ratio: NaN,
      why: inside ? "Inside the prescribed range"
        : c < lo ? `Below ${lo}` : `Above ${hi}`,
    };
  }

  if (r.dir === "min") {
    if (r.lim === undefined) return { level: "na", why: "No minimum prescribed" };
    const ok = c >= r.lim;
    return {
      level: ok ? "acc" : "reject",
      limitShown: `${r.lim} min`,
      ratio: r.lim > 0 ? c / r.lim : NaN,
      why: ok ? `At or above the ${r.lim} ${r.unit} minimum`
              : `Below the ${r.lim} ${r.unit} minimum`,
    };
  }

  /* dir "max" */
  if (r.lim === undefined) return { level: "na", why: "No limit prescribed for this parameter in this set — not a pass" };
  const ratio = r.lim > 0 ? c / r.lim : NaN;
  if (c <= r.lim) return { level: "acc", limitShown: r.lim, ratio, why: "Within the primary limit" };
  if (r.lim2 === null || r.lim2 === undefined)
    return { level: "reject", limitShown: r.lim, ratio,
      why: r.lim2 === null ? "Above the limit and no relaxation is permitted" : "Above the only limit prescribed" };
  if (c <= r.lim2)
    return { level: "lim2", limitShown: `${r.lim} / ${r.lim2}`, ratio,
      why: "Above the primary limit, within the secondary limit" };
  return { level: "reject", limitShown: `${r.lim} / ${r.lim2}`, ratio, why: "Above both limits" };
};

/* Row lookup by key within a set. */
const rowOf = (rows, k) => rows.find((r) => r.k === k);

/* Map a level to the app's result-row tone. */
const toneOf = (level) =>
  level === "acc" ? "ok" : level === "reject" ? "warn" : level === "lim2" ? "warn" : undefined;

/* Count rows in a set — for hint strings that would otherwise hard-code the
   count and go stale silently, which is exactly how the `csite`
   "189 substances" string broke. */
const countRows = (rows) => rows.length;

/* ---------- IS 10500 : 2012 ----------------------------------------------- */
/* ══════════════════════════════════════════════════════════════════════════
   IS 10500 : 2012 — DRINKING WATER, SPECIFICATION (Second Revision)
   Bureau of Indian Standards, Drinking Water Sectional Committee FAD 25.
   Published May 2012. Doc No. FAD 25 (2047). ICS 13.060.20.

   Transcribed verbatim from the English text of Tables 1 to 6 and clauses
   4.1 to 4.3. Column 3 = "Requirement (Acceptable Limit)". Column 4 =
   "Permissible Limit in the Absence of Alternate Source". Column 5 = method.
   Column 6 = remarks, reproduced word for word in `note`.

   ── VERIFY ──────────────────────────────────────────────────────────────
   This is the 2012 BASE TEXT. The copy transcribed from carries an empty
   "Amendments Issued Since Publication" table, so it records no amendment.
   BIS issues amendments to IS 10500 and the standard is subject to periodic
   review. CONFIRM the amendment status and the current reaffirmation against
   the BIS Standards Catalogue and "Standards: Monthly Additions" before
   using any value in a statutory report or a test report issued under
   ISO/IEC 17025. Nothing here is interpolated; where the standard prints
   "No relaxation" the field is NO_RELAXATION, and where it prints a
   qualitative criterion the criterion is reproduced, not converted.

   ── HOW THE TWO COLUMNS WORK (Foreword, and the NOTE under each table) ──
   "It is recommended that the acceptable limit is to be implemented. Values
   in excess of those mentioned under 'acceptable' render the water not
   suitable, but still may be tolerated in the absence of an alternative
   source but up to the limits indicated under 'permissible limit in the
   absence of alternate source' in col 4, above which the sources will have
   to be rejected."

   So column 4 is NOT a second pass mark. It is only reachable where no
   alternative source exists. The panel routine asks that question and
   grades accordingly.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────
   Table 1 — Organoleptic and Physical Parameters   (Foreword and Clause 4)
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_T1 = [
  { k: "Colour", unit: "Hazen units", dir: "max", lim: 5, lim2: 15,
    method: "IS 3025 (Part 4)", src: "Table 1, Sl i",
    note: "Extended to 15 only, if toxic substances are not suspected in absence of alternate sources" },
  { k: "Odour", unit: "", dir: "qual", qual: "Agreeable",
    method: "IS 3025 (Part 5)", src: "Table 1, Sl ii",
    note: "a) Test cold and when heated  b) Test at several dilutions" },
  { k: "pH value", unit: "", dir: "band", band: [6.5, 8.5], lim2: NO_RELAXATION,
    method: "IS 3025 (Part 11)", src: "Table 1, Sl iii", note: "" },
  { k: "Taste", unit: "", dir: "qual", qual: "Agreeable",
    method: "IS 3025 (Parts 7 and 8)", src: "Table 1, Sl iv",
    note: "Test to be conducted only after safety has been established" },
  { k: "Turbidity", unit: "NTU", dir: "max", lim: 1, lim2: 5,
    method: "IS 3025 (Part 10)", src: "Table 1, Sl v", note: "" },
  { k: "Total dissolved solids", unit: "mg/L", dir: "max", lim: 500, lim2: 2000,
    method: "IS 3025 (Part 16)", src: "Table 1, Sl vi", note: "" },
];

/* ─────────────────────────────────────────────────────────────────────────
   Table 2 — General Parameters Concerning Substances Undesirable in
             Excessive Amounts                      (Foreword and Clause 4)
   NOTE 1 to the table: "In case of dispute, the method indicated by '*'
   shall be the referee method."
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_T2 = [
  { k: "Aluminium (as Al)", unit: "mg/L", dir: "max", lim: 0.03, lim2: 0.2,
    method: "IS 3025 (Part 55)", src: "Table 2, Sl i", note: "" },
  { k: "Ammonia (as total ammonia-N)", unit: "mg/L", dir: "max", lim: 0.5, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 34)", src: "Table 2, Sl ii",
    note: "Reported as total ammonia-NITROGEN, not as NH₃. Multiply an as-NH₃ result by 14/17 = 0.8235 before comparing" },
  { k: "Anionic detergents (as MBAS)", unit: "mg/L", dir: "max", lim: 0.2, lim2: 1.0,
    method: "Annex K of IS 13428", src: "Table 2, Sl iii", note: "" },
  { k: "Barium (as Ba)", unit: "mg/L", dir: "max", lim: 0.7, lim2: NO_RELAXATION,
    method: "Annex F of IS 13428* or IS 15302", referee: "Annex F of IS 13428",
    src: "Table 2, Sl iv", note: "" },
  { k: "Boron (as B)", unit: "mg/L", dir: "max", lim: 0.5, lim2: 1.0,
    method: "IS 3025 (Part 57)", src: "Table 2, Sl v", note: "" },
  { k: "Calcium (as Ca)", unit: "mg/L", dir: "max", lim: 75, lim2: 200,
    method: "IS 3025 (Part 40)", src: "Table 2, Sl vi",
    note: "As Ca, not as CaCO₃. Divide an as-CaCO₃ result by 2.497 before comparing" },
  { k: "Chloramines (as Cl₂)", unit: "mg/L", dir: "max", lim: 4.0, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 26)* or APHA 4500-Cl G", referee: "IS 3025 (Part 26)",
    src: "Table 2, Sl vii", note: "" },
  { k: "Chloride (as Cl)", unit: "mg/L", dir: "max", lim: 250, lim2: 1000,
    method: "IS 3025 (Part 32)", src: "Table 2, Sl viii", note: "" },
  { k: "Copper (as Cu)", unit: "mg/L", dir: "max", lim: 0.05, lim2: 1.5,
    method: "IS 3025 (Part 42)", src: "Table 2, Sl ix", note: "" },
  { k: "Fluoride (as F)", unit: "mg/L", dir: "max", lim: 1.0, lim2: 1.5,
    method: "IS 3025 (Part 60)", src: "Table 2, Sl x", note: "" },
  /* The ONLY minimum in the whole standard. */
  { k: "Free residual chlorine", unit: "mg/L", dir: "min", lim: 0.2, lim2: 1,
    method: "IS 3025 (Part 26)", src: "Table 2, Sl xi",
    note: "To be applicable only when water is chlorinated. Tested at consumer end. When protection against viral infection is required, it should be minimum 0.5 mg/l",
    ambiguous: "The characteristic is printed 'Min' but col 4 carries a bare '1'. The standard does not state whether 1 mg/L is a second minimum in the absence of an alternate source or an upper bound. This app grades only against the 0.2 mg/L minimum and reproduces the '1' unassessed. VERIFY against the current amended text before reporting a verdict on this row." },
  { k: "Iron (as Fe)", unit: "mg/L", dir: "max", lim: 0.3, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 53)", src: "Table 2, Sl xii",
    note: "Total concentration of manganese (as Mn) and iron (as Fe) shall not exceed 0.3 mg/l" },
  { k: "Magnesium (as Mg)", unit: "mg/L", dir: "max", lim: 30, lim2: 100,
    method: "IS 3025 (Part 46)", src: "Table 2, Sl xiii", note: "" },
  { k: "Manganese (as Mn)", unit: "mg/L", dir: "max", lim: 0.1, lim2: 0.3,
    method: "IS 3025 (Part 59)", src: "Table 2, Sl xiv",
    note: "Total concentration of manganese (as Mn) and iron (as Fe) shall not exceed 0.3 mg/l" },
  { k: "Mineral oil", unit: "mg/L", dir: "max", lim: 0.5, lim2: NO_RELAXATION,
    method: "Clause 6 of IS 3025 (Part 39), infrared partition method", src: "Table 2, Sl xv", note: "" },
  { k: "Nitrate (as NO₃)", unit: "mg/L", dir: "max", lim: 45, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 34)", src: "Table 2, Sl xvi",
    note: "As NO₃, NOT as N. 45 mg/L as NO₃ ≡ 10.16 mg/L as N. Multiply an as-N result by 4.427 before comparing" },
  { k: "Phenolic compounds (as C₆H₅OH)", unit: "mg/L", dir: "max", lim: 0.001, lim2: 0.002,
    method: "IS 3025 (Part 43)", src: "Table 2, Sl xvii", note: "" },
  { k: "Selenium (as Se)", unit: "mg/L", dir: "max", lim: 0.01, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 56) or IS 15303*", referee: "IS 15303",
    src: "Table 2, Sl xviii", note: "" },
  { k: "Silver (as Ag)", unit: "mg/L", dir: "max", lim: 0.1, lim2: NO_RELAXATION,
    method: "Annex J of IS 13428", src: "Table 2, Sl xix", note: "" },
  { k: "Sulphate (as SO₄)", unit: "mg/L", dir: "max", lim: 200, lim2: 400,
    method: "IS 3025 (Part 24)", src: "Table 2, Sl xx",
    note: "May be extended to 400 provided that Magnesium does not exceed 30" },
  { k: "Sulphide (as H₂S)", unit: "mg/L", dir: "max", lim: 0.05, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 29)", src: "Table 2, Sl xxi", note: "" },
  { k: "Total alkalinity as calcium carbonate", unit: "mg/L", dir: "max", lim: 200, lim2: 600,
    method: "IS 3025 (Part 23)", src: "Table 2, Sl xxii", note: "" },
  { k: "Total hardness (as CaCO₃)", unit: "mg/L", dir: "max", lim: 200, lim2: 600,
    method: "IS 3025 (Part 21)", src: "Table 2, Sl xxiii", note: "" },
  { k: "Zinc (as Zn)", unit: "mg/L", dir: "max", lim: 5, lim2: 15,
    method: "IS 3025 (Part 49)", src: "Table 2, Sl xxiv", note: "" },
];

/* ─────────────────────────────────────────────────────────────────────────
   Table 3 — Parameters Concerning Toxic Substances (Foreword and Clause 4)
   Sl vii, Pesticides, points to Table 5 and is handled there.
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_T3 = [
  { k: "Cadmium (as Cd)", unit: "mg/L", dir: "max", lim: 0.003, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 41)", src: "Table 3, Sl i", note: "" },
  { k: "Cyanide (as CN)", unit: "mg/L", dir: "max", lim: 0.05, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 27)", src: "Table 3, Sl ii", note: "" },
  { k: "Lead (as Pb)", unit: "mg/L", dir: "max", lim: 0.01, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 47)", src: "Table 3, Sl iii", note: "" },
  { k: "Mercury (as Hg)", unit: "mg/L", dir: "max", lim: 0.001, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 48) / Mercury analyser", src: "Table 3, Sl iv", note: "" },
  { k: "Molybdenum (as Mo)", unit: "mg/L", dir: "max", lim: 0.07, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 2)", src: "Table 3, Sl v", note: "" },
  { k: "Nickel (as Ni)", unit: "mg/L", dir: "max", lim: 0.02, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 54)", src: "Table 3, Sl vi", note: "" },
  { k: "Polychlorinated biphenyls", unit: "mg/L", dir: "max", lim: 0.0005, lim2: NO_RELAXATION,
    method: "ASTM 5175* or APHA 6630", referee: "ASTM 5175", src: "Table 3, Sl viii",
    note: "0.000 5 mg/L = 0.5 µg/L. Check the decimal place before entering" },
  { k: "Polynuclear aromatic hydrocarbons (as PAH)", unit: "mg/L", dir: "max", lim: 0.0001, lim2: NO_RELAXATION,
    method: "APHA 6440", src: "Table 3, Sl ix",
    note: "0.000 1 mg/L = 0.1 µg/L. Check the decimal place before entering" },
  { k: "Total arsenic (as As)", unit: "mg/L", dir: "max", lim: 0.01, lim2: 0.05,
    method: "IS 3025 (Part 37)", src: "Table 3, Sl x", note: "" },
  { k: "Total chromium (as Cr)", unit: "mg/L", dir: "max", lim: 0.05, lim2: NO_RELAXATION,
    method: "IS 3025 (Part 52)", src: "Table 3, Sl xi",
    note: "Total Cr, not Cr(VI). IS 10500 sets no separate hexavalent chromium limit" },
  { k: "Trihalomethanes — Bromoform", unit: "mg/L", dir: "max", lim: 0.1, lim2: NO_RELAXATION,
    method: "ASTM D 3973-85* or APHA 6232", referee: "ASTM D 3973-85", src: "Table 3, Sl xii(a)", note: "" },
  { k: "Trihalomethanes — Dibromochloromethane", unit: "mg/L", dir: "max", lim: 0.1, lim2: NO_RELAXATION,
    method: "ASTM D 3973-85* or APHA 6232", referee: "ASTM D 3973-85", src: "Table 3, Sl xii(b)", note: "" },
  { k: "Trihalomethanes — Bromodichloromethane", unit: "mg/L", dir: "max", lim: 0.06, lim2: NO_RELAXATION,
    method: "ASTM D 3973-85* or APHA 6232", referee: "ASTM D 3973-85", src: "Table 3, Sl xii(c)", note: "" },
  { k: "Trihalomethanes — Chloroform", unit: "mg/L", dir: "max", lim: 0.2, lim2: NO_RELAXATION,
    method: "ASTM D 3973-85* or APHA 6232", referee: "ASTM D 3973-85", src: "Table 3, Sl xii(d)", note: "" },
];

/* ─────────────────────────────────────────────────────────────────────────
   Table 4 — Parameters Concerning Radioactive Substances
   Note the part numbers are INVERTED relative to the order of the rows:
   alpha is IS 14194 Part 2, beta is IS 14194 Part 1.
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_T4 = [
  { k: "Radioactive materials — Alpha emitters", unit: "Bq/L", dir: "max", lim: 0.1, lim2: NO_RELAXATION,
    method: "IS 14194 (Part 2) — gross alpha activity measurement", src: "Table 4, Sl i(a)", note: "" },
  { k: "Radioactive materials — Beta emitters", unit: "Bq/L", dir: "max", lim: 1.0, lim2: NO_RELAXATION,
    method: "IS 14194 (Part 1) — gross beta activity measurement", src: "Table 4, Sl i(b)", note: "" },
];

/* ─────────────────────────────────────────────────────────────────────────
   Table 5 — Pesticide Residues Limits and Test Method  (Foreword, Table 3)
   UNITS ARE µg/L throughout, unlike every other table.
   Table 3 Sl vii gives the permissible column as "No relaxation" for all.
   NOTE to Table 5: "Test methods are for guidance and reference for testing
   laboratory. In case of two methods, USEPA method shall be the reference
   method."
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_T5 = [
  { k: "Alachlor", unit: "µg/L", dir: "max", lim: 20, lim2: NO_RELAXATION, method: "USEPA 525.2, 507", src: "Table 5, Sl i", note: "" },
  { k: "Atrazine", unit: "µg/L", dir: "max", lim: 2, lim2: NO_RELAXATION, method: "USEPA 525.2, 8141 A", src: "Table 5, Sl ii", note: "" },
  { k: "Aldrin / Dieldrin", unit: "µg/L", dir: "max", lim: 0.03, lim2: NO_RELAXATION, method: "USEPA 508", src: "Table 5, Sl iii",
    note: "One limit covering both compounds as printed" },
  { k: "Alpha HCH", unit: "µg/L", dir: "max", lim: 0.01, lim2: NO_RELAXATION, method: "USEPA 508", src: "Table 5, Sl iv",
    note: "HCH isomers carry SEPARATE limits — do not sum them" },
  { k: "Beta HCH", unit: "µg/L", dir: "max", lim: 0.04, lim2: NO_RELAXATION, method: "USEPA 508", src: "Table 5, Sl v",
    note: "HCH isomers carry SEPARATE limits — do not sum them" },
  { k: "Butachlor", unit: "µg/L", dir: "max", lim: 125, lim2: NO_RELAXATION, method: "USEPA 525.2, 8141 A", src: "Table 5, Sl vi", note: "" },
  { k: "Chlorpyriphos", unit: "µg/L", dir: "max", lim: 30, lim2: NO_RELAXATION, method: "USEPA 525.2, 8141 A", src: "Table 5, Sl vii", note: "" },
  { k: "Delta HCH", unit: "µg/L", dir: "max", lim: 0.04, lim2: NO_RELAXATION, method: "USEPA 508", src: "Table 5, Sl viii",
    note: "HCH isomers carry SEPARATE limits — do not sum them" },
  { k: "2,4-Dichlorophenoxyacetic acid", unit: "µg/L", dir: "max", lim: 30, lim2: NO_RELAXATION, method: "USEPA 515.1", src: "Table 5, Sl ix", note: "" },
  { k: "DDT (o,p and p,p isomers of DDT, DDE and DDD)", unit: "µg/L", dir: "max", lim: 1, lim2: NO_RELAXATION,
    method: "USEPA 508 / AOAC 990.06", src: "Table 5, Sl x",
    note: "ONE limit covering the SUM of six analytes: o,p and p,p isomers of DDT, DDE and DDD. Enter the sum" },
  { k: "Endosulfan (alpha, beta and sulphate)", unit: "µg/L", dir: "max", lim: 0.4, lim2: NO_RELAXATION,
    method: "USEPA 508 / AOAC 990.06", src: "Table 5, Sl xi",
    note: "ONE limit covering the SUM of alpha, beta and endosulfan sulphate. Enter the sum" },
  { k: "Ethion", unit: "µg/L", dir: "max", lim: 3, lim2: NO_RELAXATION, method: "USEPA 1657 A", src: "Table 5, Sl xii", note: "" },
  { k: "Gamma HCH (Lindane)", unit: "µg/L", dir: "max", lim: 2, lim2: NO_RELAXATION,
    method: "USEPA 508 / AOAC 990.06", src: "Table 5, Sl xiii",
    note: "HCH isomers carry SEPARATE limits — do not sum them" },
  { k: "Isoproturon", unit: "µg/L", dir: "max", lim: 9, lim2: NO_RELAXATION, method: "USEPA 532", src: "Table 5, Sl xiv", note: "" },
  { k: "Malathion", unit: "µg/L", dir: "max", lim: 190, lim2: NO_RELAXATION, method: "USEPA 8141 A", src: "Table 5, Sl xv", note: "" },
  { k: "Methyl parathion", unit: "µg/L", dir: "max", lim: 0.3, lim2: NO_RELAXATION, method: "USEPA 8141 A / ISO 10695", src: "Table 5, Sl xvi", note: "" },
  { k: "Monocrotophos", unit: "µg/L", dir: "max", lim: 1, lim2: NO_RELAXATION, method: "USEPA 8141 A", src: "Table 5, Sl xvii", note: "" },
  { k: "Phorate", unit: "µg/L", dir: "max", lim: 2, lim2: NO_RELAXATION, method: "USEPA 8141 A", src: "Table 5, Sl xviii", note: "" },
];

/* All numeric rows in mg/L, NTU, Hazen, Bq/L and pH units — Tables 1 to 4.
   Pesticides are held apart because their units are µg/L. */
const IS10500_MAIN = [...IS10500_T1, ...IS10500_T2, ...IS10500_T3, ...IS10500_T4];

/* ─────────────────────────────────────────────────────────────────────────
   CROSS-PARAMETER RULES

   Held as data, not buried in run(), so an amendment is a data edit. Each
   quotes the remark it comes from verbatim.
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_RULES = [
  {
    id: "femn", kind: "sum",
    needs: ["Iron (as Fe)", "Manganese (as Mn)"], lim: 0.3, unit: "mg/L",
    text: "Total concentration of manganese (as Mn) and iron (as Fe) shall not exceed 0.3 mg/l",
    src: "Table 2, remarks to Sl xii and Sl xiv",
  },
  {
    id: "so4mg", kind: "conditional-lim2",
    target: "Sulphate (as SO₄)", cond: { k: "Magnesium (as Mg)", op: "<=", value: 30 },
    text: "May be extended to 400 provided that Magnesium does not exceed 30",
    src: "Table 2, remarks to Sl xx",
  },
  {
    id: "colour", kind: "qualitative-lim2",
    target: "Colour",
    text: "Extended to 15 only, if toxic substances are not suspected in absence of alternate sources",
    src: "Table 1, remarks to Sl i",
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   Table 6 — Bacteriological Quality of Drinking Water   (Clause 4.1.1)
   and the virological (4.2.7) and biological (4.3.8, 4.3.9) requirements.
   All are presence/absence, so they are not graded by assessRow().
   ───────────────────────────────────────────────────────────────────────── */
const IS10500_MICRO = [
  { id: "ecoli", k: "E. coli or thermotolerant coliform bacteria", req: "Shall not be detectable in any 100 ml sample",
    method: "IS 1622", src: "Table 6, Sl i(a), ii(a), iii(a)" },
  { id: "tcoli", k: "Total coliform bacteria", req: "Shall not be detectable in any 100 ml sample",
    method: "IS 1622", src: "Table 6, Sl ii(b), iii(b)",
    note: "Applies to treated water entering and within the distribution system" },
  { id: "ms2", k: "MS2 phage", req: "Shall be absent in 1 litre of water",
    method: "USEPA method 1602; on detection, PCR per Annex B", src: "Clause 4.2.7" },
  { id: "crypto", k: "Cryptosporidium", req: "Shall be absent in 10 litre of water",
    method: "USEPA 1622 or USEPA 1623* or ISO 15553 : 2006", referee: "USEPA 1623", src: "Clause 4.3.8" },
  { id: "giardia", k: "Giardia", req: "Shall be absent in 10 litre of water",
    method: "USEPA 1623* or ISO 15553 : 2006", referee: "USEPA 1623", src: "Clause 4.3.9" },
];

/* Table 6, footnote 1 — verbatim. Drives the action statement in the panel. */
const IS10500_MICRO_ACTION =
  "Immediate investigative action shall be taken if either E. coli or total coliform bacteria are detected. " +
  "The minimum action in the case of total coliform bacteria is repeat sampling; if these bacteria are detected " +
  "in the repeat sample, the cause shall be determined by immediate further investigation.";

/* Things IS 10500 does NOT contain. Recorded so no future routine invents
   them, and so the panel can say so when asked. */
const IS10500_ABSENT = [
  "BOD, COD and dissolved oxygen — no oxygen-demand parameter appears anywhere in IS 10500",
  "A total trihalomethane limit — four separate THM limits are given and NO fractional summation rule. WHO applies Σ(Cᵢ/GVᵢ) ≤ 1; IS 10500 does not",
  "A total pesticides limit — eighteen individual limits, no aggregate. The EU 0.5 µg/L total has no counterpart here",
  "A hexavalent chromium limit — only total chromium at 0.05 mg/L",
  "Sodium, potassium, silica, temperature and electrical conductivity",
];

/* ---------- option strings ------------------------------------------------ */

const ALT_YES = "An alternative source IS available";
const ALT_NO  = "No alternative source is available";

const CHLOR_NONE = "Not chlorinated — row not applicable";
const CHLOR_YES  = "Chlorinated";
const CHLOR_VIR  = "Chlorinated, protection against viral infection required";

const TOX_NO  = "Toxic substances not suspected";
const TOX_YES = "Toxic substances suspected, or not established";

const MICRO_OPTS = ["Not tested", "Not detected", "Detected"];

/* Level → plain words, in the standard's own terms. */
const say = (level, alt) => {
  if (level === "acc") return "Within the acceptable limit";
  if (level === "lim2")
    return alt === ALT_NO
      ? "Above acceptable — tolerable, no alternative source"
      : "Above acceptable — water NOT SUITABLE";
  if (level === "reject") return "SOURCE TO BE REJECTED";
  if (level === "qual") return "Qualitative — assess against the printed entry";
  return "No limit prescribed";
};

/* ---------- the routine --------------------------------------------------- */

export const ROUTINES = [{
  id: "is10500", mod: "water", tier: "advanced", name: "IS 10500 Compliance Panel",
  sub: "A whole drinking-water analysis against Tables 1 to 6 in one pass",
  formula: "Grade each determinand against col 3 (acceptable) and col 4 (permissible in the absence of alternate source), then apply the cross-parameter rules",
  ref:
    "IS 10500 : 2012, Drinking Water — Specification (Second Revision), Bureau of Indian Standards, " +
    "Drinking Water Sectional Committee FAD 25, published May 2012, Doc No. FAD 25 (2047). " +
    "Tables 1 to 5 transcribed verbatim; Table 6 and clauses 4.2.7, 4.3.8 and 4.3.9 handled as presence/absence. " +
    "Column semantics per the Foreword and the NOTE under each table: 'It is recommended that the acceptable limit " +
    "is to be implemented. Values in excess of those mentioned under acceptable render the water not suitable, but " +
    "still may be tolerated in the absence of an alternative source but up to the limits indicated under permissible " +
    "limit in the absence of alternate source in col 4, above which the sources will have to be rejected.' " +
    "Cross-parameter rules are reproduced from the remarks column: Fe + Mn ≤ 0.3 mg/L (Sl xii and xiv); sulphate to 400 " +
    "only where magnesium does not exceed 30 (Sl xx); colour to 15 only if toxic substances are not suspected (Table 1 Sl i). " +
    "Referee methods marked '*' in the standard are carried on each row and govern in case of dispute. " +
    "VERIFY: the transcription is of the 2012 BASE TEXT, whose Amendments page is blank. Confirm the amendment and " +
    "reaffirmation status against the BIS Standards Catalogue before using this panel for a report issued under " +
    "ISO/IEC 17025. Sampling per IS 1622 and IS 3025 (Part 1).",

  inputs: [
    S("alt", "Availability of an alternative source", [ALT_YES, ALT_NO], ALT_YES),
    { id: "tbl", type: "table", label: "Measured values — Tables 1 to 4",
      hint: "Leave a row blank to exclude it. Watch the basis: nitrate is as NO₃ not as N, ammonia is as total ammonia-N, calcium is as Ca not as CaCO₃.",
      rows: IS10500_MAIN.map((r) => ({ k: r.k, unit: r.unit, std: r.dir === "band" ? `${r.band[0]}–${r.band[1]}` : r.dir === "qual" ? "agreeable" : r.dir === "min" ? `${r.lim} min` : r.lim })) },
    { id: "pest", type: "table", label: "Pesticide residues — Table 5, µg/L",
      hint: "µg/L throughout, unlike every other table. DDT and endosulfan rows are SUMS of the named isomers. HCH isomers are separate — do not sum them.",
      rows: IS10500_T5.map((r) => ({ k: r.k, unit: r.unit, std: r.lim })) },
    S("chlor", "Chlorination status", [CHLOR_NONE, CHLOR_YES, CHLOR_VIR], CHLOR_YES),
    S("tox", "For the colour relaxation to 15 Hazen", [TOX_NO, TOX_YES], TOX_NO),
    S("ecoli", "E. coli / thermotolerant coliform in 100 mL", MICRO_OPTS, "Not tested"),
    S("tcoli", "Total coliform bacteria in 100 mL", MICRO_OPTS, "Not tested"),
    S("ms2", "MS2 phage in 1 L", MICRO_OPTS, "Not tested"),
    S("crypto", "Cryptosporidium in 10 L", MICRO_OPTS, "Not tested"),
    S("giardia", "Giardia in 10 L", MICRO_OPTS, "Not tested"),
  ],

  run: (v) => {
    const t = v.tbl || {}, p = v.pest || {};
    const alt = v.alt;

    /* ── grade every entered row ─────────────────────────────────────── */
    const graded = [];
    const push = (rows, store) => {
      for (const r of rows) {
        const raw = store[r.k];
        if (raw === undefined || raw === null || String(raw).trim() === "") continue;
        const c = num(raw);
        /* A "qual" row — Odour, Taste — takes the printed criterion, not a
           number. Sending its text through the non-numeric guard would abort
           the whole panel, so it goes straight to assessRow(), which returns
           level "qual" and reproduces the criterion instead of grading it. */
        if (!isFinite(c) && r.dir !== "qual") { graded.push({ r, raw, c: NaN, a: { level: "bad" } }); continue; }
        graded.push({ r, raw, c, a: assessRow(c, r) });
      }
    };
    push(IS10500_MAIN, t);
    push(IS10500_T5, p);

    const micro = IS10500_MICRO.filter((m) => v[m.id] && v[m.id] !== "Not tested");
    if (!graded.length && !micro.length) return null;

    const bad = graded.filter((g) => g.a.level === "bad");
    if (bad.length)
      return [{ label: "Input", tone: "warn",
        value: `Non-numeric value in: ${bad.map((b) => b.r.k).join(", ")}` }];

    const val = (k) => {
      const g = graded.find((x) => x.r.k === k);
      return g ? g.c : NaN;
    };
    const setLevel = (k, level, why) => {
      const g = graded.find((x) => x.r.k === k);
      if (g) { g.a = { ...g.a, level, why, overridden: true }; }
    };

    const out = [];
    const notes = [];

    /* ── cross-parameter rules, applied BEFORE the verdict ───────────── */

    /* Free residual chlorine — the only minimum, and only when chlorinated */
    const frc = graded.find((g) => g.r.k === "Free residual chlorine");
    if (frc) {
      if (v.chlor === CHLOR_NONE) {
        setLevel("Free residual chlorine", "na",
          "Row applies only when the water is chlorinated — Table 2, Sl xi remarks");
      } else if (v.chlor === CHLOR_VIR) {
        const ok = frc.c >= 0.5;
        setLevel("Free residual chlorine", ok ? "acc" : "reject",
          ok ? "At or above the 0.5 mg/L minimum for viral protection"
             : "Below the 0.5 mg/L minimum required where protection against viral infection is needed");
      }
      notes.push({ label: "Free residual chlorine — column 4 ambiguity", tone: "warn",
        value: "Graded against the 0.2 mg/L minimum only; the bare '1' in col 4 is reproduced unassessed",
        hint: "The characteristic is printed 'Min' but col 4 gives no direction. The standard does not say whether 1 mg/L is a second minimum or an upper bound. VERIFY against the current amended text before reporting a verdict on this row" });
    }

    /* Fe + Mn joint ceiling */
    const fe = val("Iron (as Fe)"), mn = val("Manganese (as Mn)");
    const femn = IS10500_RULES.find((r) => r.id === "femn");
    if (isFinite(fe) && isFinite(mn)) {
      const sum = fe + mn;
      const ok = sum <= femn.lim;
      notes.push({ label: "Iron + manganese, joint ceiling", value: fmt(sum), unit: "mg/L",
        tone: ok ? "ok" : "warn",
        hint: `${femn.text} — ${femn.src}. ${ok ? `Within, margin ${fmt(femn.lim - sum)} mg/L` : `EXCEEDS by ${fmt(sum - femn.lim)} mg/L, even though each may pass alone`}` });
      if (!ok) {
        setLevel("Iron (as Fe)", "reject", "Fails the joint Fe + Mn ≤ 0.3 mg/L ceiling");
        setLevel("Manganese (as Mn)", "reject", "Fails the joint Fe + Mn ≤ 0.3 mg/L ceiling");
      }
    } else if (isFinite(fe) !== isFinite(mn)) {
      notes.push({ label: "Iron + manganese, joint ceiling", tone: "warn",
        value: "Cannot be checked — only one of the pair was entered",
        hint: `${femn.text} — ${femn.src}. A pass on the single determinand does not establish compliance` });
    }

    /* Sulphate relaxation conditional on magnesium */
    const so4 = val("Sulphate (as SO₄)"), mg = val("Magnesium (as Mg)");
    const rule = IS10500_RULES.find((r) => r.id === "so4mg");
    if (isFinite(so4) && so4 > 200) {
      if (!isFinite(mg)) {
        setLevel("Sulphate (as SO₄)", "reject",
          "Above 200 mg/L and magnesium was not determined, so the relaxation to 400 cannot be claimed");
        notes.push({ label: "Sulphate relaxation", tone: "warn",
          value: "Cannot be claimed — magnesium not determined",
          hint: `${rule.text} — ${rule.src}` });
      } else if (mg > 30) {
        setLevel("Sulphate (as SO₄)", "reject",
          `Above 200 mg/L and magnesium is ${fmt(mg)} mg/L, above 30 — the relaxation to 400 is not available`);
        notes.push({ label: "Sulphate relaxation", tone: "warn",
          value: "Not available — magnesium above 30 mg/L",
          hint: `${rule.text} — ${rule.src}` });
      } else {
        notes.push({ label: "Sulphate relaxation", tone: "ok",
          value: `Available — magnesium ${fmt(mg)} mg/L, at or below 30`,
          hint: `${rule.text} — ${rule.src}` });
      }
    }

    /* Colour relaxation conditional on toxic substances */
    const col = graded.find((g) => g.r.k === "Colour");
    if (col && col.a.level === "lim2" && v.tox === TOX_YES) {
      setLevel("Colour", "reject",
        "Relaxation to 15 Hazen is not available where toxic substances are suspected or not established");
      notes.push({ label: "Colour relaxation", tone: "warn", value: "Not available",
        hint: `${IS10500_RULES.find((r) => r.id === "colour").text} — Table 1, remarks to Sl i` });
    }

    /* ── assemble ────────────────────────────────────────────────────── */
    const scored = graded.filter((g) => ["acc", "lim2", "reject"].includes(g.a.level));
    const rejects = scored.filter((g) => g.a.level === "reject");
    const overAcc = scored.filter((g) => g.a.level === "lim2");
    const nonNum  = graded.filter((g) => g.a.level === "qual");
    const noLimit = graded.filter((g) => g.a.level === "na");

    /* Rank by proximity to the limit, but ONLY for "max" rows. A ratio above
       1 on a minimum is a good result, not a near-miss, so min and band rows
       are never ranked. */
    const rank = (g) => (g.r.dir === "max" && isFinite(g.a.ratio) ? g.a.ratio : -1);
    scored.sort((a, b) => rank(b) - rank(a));

    out.push({ label: "Determinands entered", value: graded.length,
      hint: `${scored.length} graded · ${nonNum.length} qualitative · ${noLimit.length} not applicable · ${micro.length} microbiological` });
    out.push({ label: "Basis for column 4",
      value: alt === ALT_NO ? "No alternative source — col 4 is reachable" : "Alternative source available — col 3 governs",
      hint: alt === ALT_NO
        ? "Values between col 3 and col 4 are tolerable; above col 4 the source is to be rejected"
        : "Any value above col 3 renders the water not suitable, whatever col 4 says" });

    for (const g of scored) {
      out.push({
        label: g.r.k,
        value: fmt(g.c), unit: `${g.r.unit} — limit ${g.a.limitShown}`,
        tone: toneOf(g.a.level),
        hint: `${say(g.a.level, alt)}. ${g.a.why}${isFinite(g.a.ratio) ? ` — ${(g.a.ratio * 100).toFixed(0)} % of the acceptable limit` : ""}${g.r.referee ? `. Referee method ${g.r.referee}` : ""}`,
      });
    }
    for (const g of nonNum)
      out.push({ label: g.r.k, value: isFinite(g.c) ? fmt(g.c) : String(g.raw).trim(), unit: g.r.unit, tone: "warn",
        hint: `Requirement is "${g.r.qual}" — a qualitative criterion, not graded here. ${g.r.note}` });
    for (const g of noLimit)
      out.push({ label: g.r.k, value: fmt(g.c), unit: g.r.unit,
        hint: g.a.why + " — not a pass" });

    out.push(...notes);

    /* Microbiology */
    let microFail = false;
    for (const m of micro) {
      const det = v[m.id] === "Detected";
      if (det) microFail = true;
      out.push({ label: m.k, value: det ? "DETECTED" : "Not detected",
        tone: det ? "warn" : "ok",
        hint: `${m.req} — ${m.src}, ${m.method}${m.referee ? `. Referee ${m.referee}` : ""}` });
    }
    if ((v.ecoli === "Detected" || v.tcoli === "Detected"))
      out.push({ label: "Required action", value: "Immediate investigative action", tone: "warn",
        hint: IS10500_MICRO_ACTION });

    /* ── outcome ─────────────────────────────────────────────────────── */
    const parts = [];
    if (rejects.length) parts.push(`${rejects.length} determinand${rejects.length > 1 ? "s" : ""} requiring rejection of the source`);
    if (overAcc.length) parts.push(`${overAcc.length} above the acceptable limit`);
    if (microFail) parts.push("microbiological failure");

    let verdict, tone;
    if (rejects.length || microFail) {
      verdict = "Does not conform — source to be rejected";
      tone = "warn";
    } else if (overAcc.length) {
      verdict = alt === ALT_NO
        ? "Conforms only in the absence of an alternative source"
        : "Does not conform — water not suitable";
      tone = "warn";
    } else if (scored.length) {
      verdict = "Conforms on every determinand entered";
      tone = "ok";
    } else {
      verdict = "Nothing graded";
      tone = "warn";
    }

    out.push({ label: "Outcome against IS 10500 : 2012", value: verdict, tone,
      hint: parts.length ? parts.join(" · ") : "All graded determinands within their acceptable limits" });

    if (rejects.length)
      out.push({ label: "Rejecting determinands", value: rejects.map((g) => g.r.k).join(", "), tone: "warn" });
    if (overAcc.length)
      out.push({ label: "Above acceptable, within permissible", value: overAcc.map((g) => g.r.k).join(", "), tone: "warn" });

    const passes = scored.filter((g) => g.a.level === "acc" && rank(g) >= 0);
    if (passes.length)
      out.push({ label: "Closest to its limit among the passes", value: passes[0].r.k,
        hint: `${(passes[0].a.ratio * 100).toFixed(0)} % of the acceptable limit — this one fails first` });

    out.push({ label: "Scope of this panel", tone: "warn",
      value: `${graded.length} of ${countRows(IS10500_MAIN) + countRows(IS10500_T5)} numeric rows assessed`,
      hint: "A determinand not entered is not a pass. IS 10500 conformity requires the full suite of Tables 1 to 4, the Table 5 pesticides, and the bacteriological, virological and biological requirements of clauses 4.1 to 4.3" });
    out.push({ label: "Not in IS 10500", value: "See the method note",
      hint: IS10500_ABSENT.join(" · ") });

    return out;
  },
}];

export default ROUTINES;
