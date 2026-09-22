/* =============================================================================
   Aliquot — src/modules/phyto.js
   Plant biomonitoring & phytoremediation. Module: phyto.

   Converted from `aliquot-phyto-module.jsx` (which shipped as two files —
   src/data/plant-bio-ref.js and src/modules/phyto.js — plus a registration
   note). DOM-free ES module, no imports: the reference data, the helpers and
   the input builders are declared locally, because the build compiles each
   module into its own IIFE and a local duplicate is the correct form.

   Every `ref:` string is carried across CHARACTER FOR CHARACTER, including the
   TAIL that every routine in this pack appends. Do not reword one.

   Routines
     pigment   Chlorophyll a, b, total and carotenoid — Arnon (1949),
               Duxbury & Yentsch (1956), with the closure check a + b = total
     apti      Air Pollution Tolerance Index — Singh & Rao (1983), including
               relative water content from raw weighings
     dust      Dust capturing capacity per unit leaf area — Prusty et al. (2005)
     api       Anticipated Performance Index — Prajapati & Tripathi (2008),
               arithmetic only; the grade scale is NOT reproduced
     transfer  BCF, BAF and TF, accumulator class, hyperaccumulator screen
     soilcl    Chloride in a soil water extract, argentometric, IS 3025 (Pt 32)
     soilpe    Soil pH and electrical conductivity, IS 2720 (Pt 26) / IS 14767

   `transfer` SUPERSEDES `bcf` in mod "hw". `bcf` carries no citation for BCF,
   BAF or TF, never asks whether the soil figure is a total digest or an
   available extraction, and prints "Phytoextraction candidate" with no
   hyperaccumulation threshold behind it. Retire `bcf` or point its ref here.

   ── DEFECTS FIXED IN CONVERSION ─────────────────────────────────────────────
   FIX 1  Unguarded `.startsWith` on selects. `soilpe` read v.phratio and
          v.ecratio directly — a partly filled form (pH entered, ratio select
          never touched) threw TypeError before any row was produced. Every
          select read is now String(v.x || "") and an unset select prints
          "Not stated" with a warn tone instead of "undefined".
   FIX 2  Selects whose unset state silently flipped a convention.
            · `dust` — String(v.order || "").startsWith(...) evaluated FALSE
              when the select was untouched, i.e. it assumed the SECOND
              weighing carried the dust, the opposite of the field's own
              default. The sign of the dust mass is the diagnosis in this
              routine, so an unset select inverted the diagnosis. It now
              falls back to the declared default and says so in a warn row.
            · `dust` — an unset removal-method select printed no removal row
              at all; it now reports "Not stated" with the warn the pack
              already wrote for that case.
            · `transfer` — an unset extraction select printed no basis row;
              it now reports "Not stated" with the pack's warn.
            · `pigment` — an unset solvent select pushed a warn row whose
              value was literally `undefined`.
   FIX 3  Antimony 1000 mg/kg in HYPERACC could not be placed in van der Ent
          (2013) Table 1. The value is KEPT unchanged and a VERIFY row is now
          emitted on screen whenever Antimony is the selected element, so the
          note travels with the result instead of living in a comment.

   No `num(x) ?? default` was found in this pack — the two defaulted numerics
   (`pigment` path length, `soilcl` blank titre) already used an explicit
   isFinite test, and both are preserved as written. No routine returned a
   number from an empty form; all seven return null and still do.

   A calculation aid, not a validated method. ISO/IEC 17025 §7.11.2 applies.
   Personal project. No CPCB or MoEFCC endorsement is claimed or implied.
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

/* No routine in this pack takes a series or a pairs input, so parseSeries,
   parsePairs, stats and regress are deliberately not duplicated here. Add
   them from base.js if a future phyto routine needs one. */

/* Read a select safely. An untouched select is undefined, not "". */
const sel = (x) => String(x || "");

const band = (x, bands) => {
  for (const [lo, hi, name] of bands) if (x >= lo && x < hi) return name;
  return null;
};

/* ---------- input builders ------------------------------------------------ */

const N = (id, label, unit, def, hint) => ({ id, label, unit, def, hint, type: "num" });
const S = (id, label, opts, def) => ({ id, label, opts, def, type: "sel" });

/* =============================================================================
   REFERENCE DATA — from src/data/plant-bio-ref.js in the source pack.

   Everything here is a PUBLISHED SCIENTIFIC CRITERION, not a notified limit.
   Nothing in this block is a regulatory standard and nothing in it may be
   printed as one.

   INDIA HAS NO NOTIFIED GENERAL SOIL-QUALITY STANDARD FOR METALS. The nearest
   notified instrument is Schedule I of the Environment Protection (Management
   of Contaminated Sites) Rules, 2025, transcribed under `csite` in mod "hw".
   ============================================================================= */

/* ARNON (1949) PIGMENT COEFFICIENTS
   Arnon, D. I. (1949) "Copper enzymes in isolated chloroplasts. Polyphenol-
   oxidase in Beta vulgaris", Plant Physiology 24(1): 1–15.

   Valid ONLY for: 80 % v/v aqueous acetone, 1.00 cm path length, a clarified
   (centrifuged) extract read against an 80 % acetone blank at 645 nm and
   663 nm. Coefficients yield mg per litre of extract. They are NOT
   interchangeable with those for 100 % acetone, DMSO, ethanol or methanol
   (Lichtenthaler & Wellburn 1983) — a silent systematic error of 5–15 %. */
const ARNON = {
  a:     { a663:  12.7,  a645: -2.69 },
  b:     { a663:  -4.68, a645: 22.9  },
  total: { a663:   8.02, a645: 20.2  },
  cite:
    "Arnon, D. I. (1949) Plant Physiology 24(1): 1–15. Chlorophyll a = (12.7·A663 − 2.69·A645)·V/(1000·W); " +
    "chlorophyll b = (22.9·A645 − 4.68·A663)·V/(1000·W); total chlorophyll = (20.2·A645 + 8.02·A663)·V/(1000·W). " +
    "80 % v/v aqueous acetone, 1.00 cm path, clarified extract, acetone blank.",
};

/* Duxbury, A. C. & Yentsch, C. S. (1956) "Plankton pigment nomographs",
   Journal of Marine Research 15: 92–101. */
const CAROTENOID = {
  a480: 7.6, a510: -1.49,
  cite:
    "Duxbury, A. C. & Yentsch, C. S. (1956) Journal of Marine Research 15: 92–101. " +
    "Carotenoid = (7.6·A480 − 1.49·A510)·V/(1000·W), 80 % v/v aqueous acetone, 1.00 cm path.",
};

/* AIR POLLUTION TOLERANCE INDEX — Singh & Rao (1983).
   APTI = [ A (T + P) + R ] / 10. Dimensionally inhomogeneous: it adds a
   (mg/g × pH) product to a percentage and divides by a bare 10. Entering µg/g
   inflates APTI by 1000× and the routine cannot detect that from the number. */
const APTI_CITE =
  "Singh, S. K. & Rao, D. N. (1983) Proceedings of the Symposium on Air Pollution Control, " +
  "IIT Delhi, Vol. I, pp. 218–224. APTI = [A(T + P) + R]/10, with A = ascorbic acid mg/g FW, " +
  "T = total chlorophyll mg/g FW, P = leaf extract pH, R = relative water content %.";

/* Two banding schemes are in wide use in the Indian literature and THEY DO NOT
   AGREE. Neither is a notified criterion. The routine refuses to pick one. */
const APTI_BANDS = {
  narrow: {
    name: "Scheme 1 — narrow bands (Singh et al. 1991, as applied widely in Indian green-belt studies)",
    bands: [
      [-Infinity, 11,        "Sensitive"],
      [11,        16,        "Intermediate"],
      [16,        20,        "Tolerant"],
      [20,        Infinity,  "Very tolerant"],
    ],
    verify:
      "VERIFY the class boundaries against Singh, S. K., Rao, D. N., Agrawal, M., Pandey, J. & Naryan, D. (1991), " +
      "'Air pollution tolerance index of plants', Journal of Environmental Management 32: 45–55, before quoting a band.",
  },
  wide: {
    name: "Scheme 2 — wide bands (as applied by Lakshmi, Sarvanti & Srinivas 2009 and subsequent Indian studies)",
    bands: [
      [-Infinity,  1,        "Very sensitive"],
      [1,         17,        "Sensitive"],
      [17,        30,        "Intermediate"],
      [30,        Infinity,  "Tolerant"],
    ],
    verify:
      "VERIFY the class boundaries against Lakshmi, P. S., Sarvanti, K. L. & Srinivas, N. (2009), " +
      "'Air pollution tolerance index of various plant species growing in industrial areas', " +
      "The Ecoscan 2(2): 203–206, before quoting a band.",
  },
};

/* ANTICIPATED PERFORMANCE INDEX — Prajapati & Tripathi (2008).
   API (%) = (Σ grades awarded ÷ Σ maximum grades) × 100. The ARITHMETIC is
   certain. THE GRADE ALLOTMENT TABLE IS NOT REPRODUCED HERE because the
   per-character maxima and the APTI→grade boundaries could not be confirmed
   against the source paper. The routine takes the grade and the maximum for
   each character FROM THE USER and does only the arithmetic and the checks. */
const API_CHARACTERS = [
  { k: "APTI value",        hint: "Graded from the computed APTI. Boundaries are in the source paper — VERIFY" },
  { k: "Plant habit",       hint: "Herb / shrub / tree, and size class" },
  { k: "Canopy structure",  hint: "Sparse, irregular, globular, spreading open, spreading dense" },
  { k: "Type of plant",     hint: "Deciduous or evergreen" },
  { k: "Laminar size",      hint: "Leaf lamina area class" },
  { k: "Laminar texture",   hint: "Smooth or coriaceous" },
  { k: "Laminar hardiness", hint: "Delineate or hardy" },
  { k: "Economic value",    hint: "Number of documented uses" },
];

/* The assessment bands are 10-percentage-point steps. Widely reproduced;
   still VERIFY against the source before a band is printed in a report. */
const API_BANDS = [
  [0,   30,  "Not recommended"],
  [30,  40,  "Very poor"],
  [40,  50,  "Poor"],
  [50,  60,  "Moderate"],
  [60,  70,  "Good"],
  [70,  80,  "Very good"],
  [80,  90,  "Excellent"],
  [90,  101, "Best"],
];

const API_CITE =
  "Prajapati, S. K. & Tripathi, B. D. (2008) Journal of Environmental Management 88(4): 1343–1349. " +
  "API (%) = (sum of grades awarded ÷ sum of maximum grades) × 100, graded on APTI plus seven " +
  "biological and socio-economic characters. VERIFY the grade allotment table and the assessment " +
  "bands against the source paper — they are NOT reproduced in this app.";

/* DUST CAPTURING CAPACITY — Prusty, Mishra & Azeez (2005).
   W = (m_dusty − m_clean) / A. THE PRINTED FORM IS ORDER-DEPENDENT AND SOURCES
   DISAGREE ON THE ORDER, so the routine asks which weighing is which and never
   takes an absolute value. */
const DUST_CITE =
  "Prusty, B. A. K., Mishra, P. C. & Azeez, P. A. (2005) Ecotoxicology and Environmental Safety " +
  "60(2): 228–235. Dust load per unit leaf area = (mass of leaf with dust − mass of leaf after dust " +
  "removal) ÷ leaf area. No Indian standard prescribes this determination; it is a research method.";

/* SOIL–PLANT TRANSFER INDICES. All three are DIMENSIONLESS RATIOS OF TWO
   mg/kg DRY-WEIGHT CONCENTRATIONS and both terms must be on the same basis. */
const TRANSFER_CITE =
  "BCF = C_root/C_soil (Oliva & Espinosa 2007, Microchemical Journal 86: 131–139; Ndeda & Manohar 2014, " +
  "IOSR-JESTFT 8(5): 24–27). BAF = C_shoot/C_soil (Rezvani & Zaefarian 2011, Australian Journal of " +
  "Agricultural Engineering 2(4): 114–119). TF = C_shoot/C_root (D'Souza et al. 2010, Journal of " +
  "Hazardous Materials 184: 457–464). All dimensionless, both terms in mg/kg on the SAME dry-weight basis.";

/* Nominal foliar hyperaccumulation thresholds, mg/kg DRY WEIGHT of shoot.
   van der Ent et al. (2013) Plant and Soil 362: 319–334, Table 1; after
   Baker & Brooks (1989) Biorecovery 1: 81–126.

   A SCIENTIFIC CRITERION FOR CLASSIFYING A PLANT, NOT A LIMIT FOR ANYTHING.

   ANTIMONY 1000 mg/kg IS CARRIED AS THE PACK GIVES IT AND HAS NOT BEEN
   ALTERED, but it could not be placed in van der Ent (2013) Table 1. The
   value stands and `transfer` prints a VERIFY row whenever Antimony is the
   selected element — see HYPERACC_VERIFY below. Do not delete the number and
   do not adjust it; confirm it against Table 1 before it is quoted. */
const HYPERACC = {
  Cadmium: 100, Selenium: 100, Thallium: 100,
  Cobalt: 300, Copper: 300, Chromium: 300,
  Nickel: 1000, Lead: 1000, Arsenic: 1000, Antimony: 1000,
  Zinc: 3000,
  Manganese: 10000,
};
const HYPERACC_CITE =
  "van der Ent, A. et al. (2013) Plant and Soil 362: 319–334, Table 1, after Baker & Brooks (1989) " +
  "Biorecovery 1: 81–126. Nominal foliar thresholds in mg/kg dry weight of shoot, to be met together " +
  "with BCF > 1 and TF > 1 on plants growing in their natural habitat. Zinc was revised from " +
  "10 000 to 3 000 mg/kg by van der Ent — VERIFY which criterion is intended.";

/* Per-element VERIFY notes on the threshold table itself. */
const HYPERACC_VERIFY = {
  Antimony:
    "VERIFY — the 1000 mg/kg threshold carried here for antimony could not be placed in van der Ent " +
    "et al. (2013) Plant and Soil 362: 319–334, Table 1. The value has been carried across unchanged " +
    "rather than removed or adjusted, but it is NOT confirmed against the source table. Antimony " +
    "hyperaccumulation is in any case sparsely evidenced. Check Table 1, and Baker & Brooks (1989) " +
    "Biorecovery 1: 81–126, before this screen is quoted for antimony.",
  Zinc:
    "VERIFY which criterion is intended — van der Ent et al. (2013) revised the zinc threshold DOWN " +
    "from the 10 000 mg/kg of Baker & Brooks (1989) to the 3 000 mg/kg used here. A study citing " +
    "10 000 mg/kg is using the older criterion and the two do not classify the same plants.",
};

/* SOIL WATER-EXTRACT DETERMINANDS.
   Equivalent weight of chloride = 35.45 g/eq. Some texts print 35.5; that is
   0.14 % high and is not a rounding this app makes silently. */
const CL_EQ_WT = 35.45;
const CL_CITE =
  "Argentometric (Mohr) titration with standard silver nitrate and potassium chromate indicator, " +
  "IS 3025 (Part 32): 1988 (Reaffirmed) — Methods of sampling and test (physical and chemical) for " +
  "water and wastewater, Part 32 Chloride. Applied here to a water extract of soil; the extraction " +
  "ratio is not part of IS 3025 and must be reported with the result. Endpoint valid at pH 7 to 10. " +
  "Equivalent weight of chloride taken as 35.45 g/eq.";

const SOIL_PH_CITE =
  "IS 2720 (Part 26): 1987 (Reaffirmed) — Methods of test for soils, Part 26: Determination of pH " +
  "value, 1 : 2.5 soil : water suspension. Rayment, G. E. & Higginson, F. R. (1992), 'Australian " +
  "Laboratory Handbook of Soil and Water Chemical Methods', method 4A1 uses 1 : 5. The two ratios " +
  "do not give the same reading and there is no general conversion between them.";

const SOIL_EC_CITE =
  "IS 14767: 2000 — Determination of the specific electrical conductivity of soils. Report the " +
  "soil : water ratio with the value and report at 25 °C. VERIFY the ratio prescribed by the " +
  "current edition before citing the standard for a specific ratio.";

/* USDA salinity classes are defined on the SATURATION EXTRACT (ECe) and on
   nothing else. The dilute-extract → ECe factor is texture-dependent
   (roughly 6 to 14) and this app does not apply one. */
const ECE_CLASSES = [
  [0,  2,        "Non-saline"],
  [2,  4,        "Slightly saline"],
  [4,  8,        "Moderately saline"],
  [8,  16,       "Strongly saline"],
  [16, Infinity, "Very strongly saline"],
];
const ECE_CITE =
  "United States Salinity Laboratory Staff (1954), USDA Agriculture Handbook No. 60, " +
  "'Diagnosis and Improvement of Saline and Alkali Soils'. Classes are defined on the SATURATION " +
  "EXTRACT (ECe) in dS/m at 25 °C. They do not apply to a 1:2.5 or 1:5 extract. The conversion " +
  "factor from a dilute extract to ECe is texture-dependent (roughly 6 to 14) and is NOT applied here.";

/* What this module does NOT contain. Recorded so no future routine invents it
   and so the panel can say so when asked. */
const PHYTO_ABSENT = [
  "Any notified Indian limit for a metal in soil — none exists as a general soil-quality standard. The nearest notified instrument is Schedule I of the Environment Protection (Management of Contaminated Sites) Rules, 2025, transcribed under `csite` in mod \"hw\"",
  "Any notified Indian limit for a metal in plant tissue. Limits exist for specified FOODS under the Food Safety and Standards (Contaminants, Toxins and Residues) Regulations, 2011 — they are food limits, they are matrix-specific, and they do not apply to an ornamental or roadside species",
  "The WHO/FAO advisory figures for metals in plants that circulate in the literature (commonly quoted as Pb 2 mg/kg and Cd 0.2 mg/kg) — these are not transcribed because the source document and its scope could not be confirmed. VERIFY before any comparison",
  "The API grade allotment table — the arithmetic is implemented, the scale is not, because it could not be confirmed",
  "Any conversion between a 1:2.5, a 1:5 and a saturation-extract soil measurement. There is none that is not soil-specific",
  "Any air-quality standard. APTI and API describe the PLANT, not the air. A tolerant species is not evidence that the air complies with the NAAQS",
];

/* Common tail carried on every ref in this module. */
const TAIL =
  " These indices describe the plant's response, not the quality of the air or the soil. " +
  "No Indian standard notifies a value for any of them. For a compliance question use the NAAQS " +
  "routines in mod \"air\" or, for soil, Schedule I of the Environment Protection (Management of " +
  "Contaminated Sites) Rules, 2025 under `csite` in mod \"hw\". " +
  "A calculation aid, not a validated method — ISO/IEC 17025 §7.11.2. Personal project, no CPCB endorsement.";

/* ---------- the routines -------------------------------------------------- */

export const ROUTINES = [

/* ══════════════════════════════════════════════════════════════════════════
   1.  PIGMENT
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "pigment", mod: "phyto", tier: "routine",
  name: "Leaf Pigments",
  sub: "Chlorophyll a, b, total and carotenoid from an 80 % acetone extract",
  formula:
    "Chl a (mg/g FW) = (12.7·A663 − 2.69·A645) × V / (1000 · W · d)      " +
    "Chl b = (22.9·A645 − 4.68·A663) × V / (1000 · W · d)      " +
    "Total Chl = (20.2·A645 + 8.02·A663) × V / (1000 · W · d)      " +
    "Carotenoid = (7.6·A480 − 1.49·A510) × V / (1000 · W · d)",
  ref:
    ARNON.cite + " " + CAROTENOID.cite +
    " A = absorbance, dimensionless, against an 80 % acetone blank. V = final volume of the clarified " +
    "extract, mL. W = fresh weight of leaf tissue extracted, g. d = optical path length, cm — the " +
    "published coefficients assume 1.00 cm and the routine divides by d to make that explicit. " +
    "The coefficients hold for 80 % v/v AQUEOUS ACETONE ONLY. For 100 % acetone, DMSO, ethanol or " +
    "methanol use the Lichtenthaler & Wellburn (1983) coefficients instead — substituting solvent " +
    "without substituting coefficients is a silent systematic error of 5 to 15 %." + TAIL,

  inputs: [
    N("a663", "Absorbance at 663 nm", "A", "", "Chlorophyll a maximum in 80 % acetone"),
    N("a645", "Absorbance at 645 nm", "A", "", "Chlorophyll b band"),
    N("a480", "Absorbance at 480 nm", "A", "", "Carotenoid — leave blank if not determined"),
    N("a510", "Absorbance at 510 nm", "A", "", "Carotenoid correction — leave blank if not determined"),
    N("a750", "Absorbance at 750 nm", "A", "", "Optional turbidity check. Should be ≈ 0 on a properly clarified extract"),
    N("v", "Final volume of clarified extract", "mL", "10", "Volume actually read, after any make-up. Range 0.1 to 1000"),
    N("w", "Fresh weight of tissue extracted", "g", "1", "Fresh weight, not dry. Range 0.001 to 100"),
    N("d", "Optical path length", "cm", "1", "1.00 cm for a standard cuvette. The coefficients assume 1 cm"),
    S("solv", "Extraction solvent", [
      "80 % v/v aqueous acetone (Arnon 1949 — coefficients valid)",
      "100 % acetone (coefficients NOT valid)",
      "DMSO (coefficients NOT valid)",
      "Ethanol or methanol (coefficients NOT valid)",
    ], "80 % v/v aqueous acetone (Arnon 1949 — coefficients valid)"),
  ],

  run: (v) => {
    const A663 = num(v.a663), A645 = num(v.a645);
    const A480 = num(v.a480), A510 = num(v.a510), A750 = num(v.a750);
    const V = num(v.v), W = num(v.w);
    const d = isFinite(num(v.d)) ? num(v.d) : 1;

    if (!isFinite(A663) || !isFinite(A645)) return null;

    if (!isFinite(V) || V <= 0)
      return [{ label: "Input", value: "Extract volume must be greater than zero", tone: "warn", unit: "mL" }];
    if (!isFinite(W) || W <= 0)
      return [{ label: "Input", value: "Fresh weight must be greater than zero", tone: "warn", unit: "g" }];
    if (d <= 0)
      return [{ label: "Input", value: "Path length must be greater than zero", tone: "warn", unit: "cm" }];
    if (A663 < 0 || A645 < 0)
      return [{ label: "Input", value: "Negative absorbance — check the blank and the cuvette", tone: "warn" }];

    const out = [];

    /* FIX 1 / FIX 2 — guarded select read; an untouched select no longer
       prints `undefined` as the value of a warn row. */
    const solv = sel(v.solv);
    if (!solv.startsWith("80 %"))
      out.push({ label: "Solvent", value: solv || "Not stated", tone: "warn",
        hint: "The Arnon (1949) and Duxbury & Yentsch (1956) coefficients are specific to 80 % v/v aqueous acetone. Applied to this solvent they are wrong by roughly 5 to 15 % and the error is systematic, not random. Use Lichtenthaler & Wellburn (1983) coefficients for this solvent — they are not in this app. The numbers below are computed anyway so the arithmetic is visible, but they must not be reported." });

    const k = V / (1000 * W * d);
    const chlA = (ARNON.a.a663 * A663 + ARNON.a.a645 * A645) * k;
    const chlB = (ARNON.b.a663 * A663 + ARNON.b.a645 * A645) * k;
    const chlT = (ARNON.total.a663 * A663 + ARNON.total.a645 * A645) * k;

    /* photometric range */
    const maxA = Math.max(A663, A645, isFinite(A480) ? A480 : 0, isFinite(A510) ? A510 : 0);
    if (maxA > 1.0)
      out.push({ label: "Photometric range", value: `Highest absorbance ${fmt(maxA, 3)} A`, tone: "warn",
        hint: "Above 1.0 A the stray-light error of a single-beam visible spectrophotometer grows quickly and the Beer–Lambert relation the coefficients rest on is no longer linear. Dilute the extract with 80 % acetone, re-read, and multiply by the dilution. Above 2.0 A the reading is not usable at all." });
    if (maxA < 0.05)
      out.push({ label: "Photometric range", value: `Highest absorbance ${fmt(maxA, 3)} A`, tone: "warn",
        hint: "Below about 0.05 A the reading is dominated by baseline noise. Extract more tissue into the same volume rather than reporting this." });

    if (isFinite(A750) && A750 > 0.01)
      out.push({ label: "Turbidity check, 750 nm", value: fmt(A750, 3), unit: "A", tone: "warn",
        hint: "Chlorophyll does not absorb at 750 nm, so a reading above about 0.01 A is scattered light from an incompletely clarified extract. Arnon's coefficients contain no turbidity term. Re-centrifuge or filter; do not subtract A750 unless the method being followed says to." });

    out.push({ label: "Extraction factor V/(1000·W·d)", value: fmt(k, 5), unit: "mL·g⁻¹·cm⁻¹ / 1000",
      hint: `${fmt(V)} mL ÷ (1000 × ${fmt(W)} g × ${fmt(d)} cm). Converts the mg/L the coefficients return into mg of pigment per g of fresh tissue.` });

    if (chlB < 0)
      out.push({ label: "Chlorophyll b", value: `${fmt(chlB)} — NEGATIVE`, unit: "mg/g FW", tone: "warn",
        hint: "22.9·A645 is less than 4.68·A663, which is arithmetically possible but physically is not. It means the 645 nm reading is too low relative to 663 nm — usually a wrong blank, a wavelength calibration error, or pigment degradation from light or heat during extraction. Not reportable. Re-read against a fresh 80 % acetone blank." });
    else
      out.push({ label: "Chlorophyll b", value: fmt(chlB), unit: "mg/g FW",
        hint: `(22.9 × ${fmt(A645, 3)} − 4.68 × ${fmt(A663, 3)}) × ${fmt(k, 5)}` });

    out.push({ label: "Chlorophyll a", value: fmt(chlA), unit: "mg/g FW", tone: "key",
      hint: `(12.7 × ${fmt(A663, 3)} − 2.69 × ${fmt(A645, 3)}) × ${fmt(k, 5)}` });
    out.push({ label: "Total chlorophyll", value: fmt(chlT), unit: "mg/g FW", tone: "key",
      hint: `(20.2 × ${fmt(A645, 3)} + 8.02 × ${fmt(A663, 3)}) × ${fmt(k, 5)}. This is the T term of APTI — carry it across in mg/g, not µg/g.` });

    /* closure — the three Arnon equations are not independent */
    const sum = chlA + chlB;
    const dev = chlT !== 0 ? Math.abs(sum - chlT) / Math.abs(chlT) * 100 : NaN;
    out.push({ label: "Closure check, a + b against total", value: `${fmt(dev, 3)} % deviation`,
      tone: isFinite(dev) && dev > 2 ? "warn" : "ok",
      hint: isFinite(dev) && dev > 2
        ? "The three Arnon expressions are algebraically linked — 12.7 − 4.68 = 8.02 and 22.9 − 2.69 = 20.21 — so a + b must equal the total to within rounding. A deviation this large means a coefficient or an absorbance has been entered wrongly."
        : "a + b reproduces the total, as the coefficients require (12.7 − 4.68 = 8.02; 22.9 − 2.69 = 20.21). The residual is rounding in the published 20.2." });

    if (chlB > 0) {
      const ratio = chlA / chlB;
      out.push({ label: "Chlorophyll a : b ratio", value: fmt(ratio, 3),
        tone: ratio < 1.5 || ratio > 5 ? "warn" : undefined,
        hint: ratio < 1.5 || ratio > 5
          ? "Outside the roughly 2 to 4 seen in healthy sun leaves of most angiosperms. Check the absorbances before interpreting this as a stress response — an a:b outside 1.5 to 5 is more often an analytical artefact than a biological finding."
          : "Typically 2 to 4 in healthy sun leaves; shade leaves run lower. A fall in a:b under pollution stress is usually read as preferential loss of chlorophyll a, but that inference needs a matched control site, not a single value." });
    }

    if (isFinite(A480) && isFinite(A510)) {
      if (A480 < 0 || A510 < 0)
        out.push({ label: "Carotenoid", value: "Negative absorbance at 480 or 510 nm", tone: "warn" });
      else {
        const car = (CAROTENOID.a480 * A480 + CAROTENOID.a510 * A510) * k;
        out.push({ label: "Total carotenoid", value: fmt(car), unit: "mg/g FW", tone: car < 0 ? "warn" : "key",
          hint: car < 0
            ? "Negative — 1.49·A510 exceeds 7.6·A480, which cannot happen on a clean extract. Check the readings."
            : `(7.6 × ${fmt(A480, 3)} − 1.49 × ${fmt(A510, 3)}) × ${fmt(k, 5)}. Chlorophyll absorbs at 480 nm as well, so this is an operational total carotenoid on the Duxbury & Yentsch basis, not a chromatographic sum of carotenes and xanthophylls.` });
        if (car > 0 && chlT > 0)
          out.push({ label: "Total chlorophyll : carotenoid", value: fmt(chlT / car, 3),
            hint: "Falls under stress as chlorophyll is lost faster than carotenoid. Interpretable only against a matched control site sampled on the same day." });
      }
    } else if (isFinite(A480) !== isFinite(A510)) {
      out.push({ label: "Carotenoid", value: "Not computed", tone: "warn",
        hint: "Both 480 nm and 510 nm are needed. One was entered without the other." });
    }

    out.push({ label: "Basis", value: "mg per g FRESH weight",
      hint: "Fresh weight, not dry. Fresh weight drifts with leaf water status, so pigment content on a fresh-weight basis is partly a hydration measurement. Where sites differ in water availability, report relative water content alongside it (see `apti`) or convert to a dry-weight or leaf-area basis and say which." });

    return out;
  },
},

/* ══════════════════════════════════════════════════════════════════════════
   2.  APTI
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "apti", mod: "phyto", tier: "advanced",
  name: "Air Pollution Tolerance Index",
  sub: "APTI from ascorbic acid, chlorophyll, leaf extract pH and relative water content",
  formula:
    "RWC (%) = (FW − DW) / (TW − DW) × 100        APTI = [ A (T + P) + R ] / 10",
  ref:
    APTI_CITE +
    " Relative water content after Barrs, H. D. & Weatherley, P. E. (1962), Australian Journal of " +
    "Biological Sciences 15: 413–428, as applied by Singh (1997). " +
    "APTI IS DIMENSIONLESS AND DIMENSIONALLY INHOMOGENEOUS — it adds a (mg/g × pH) product to a " +
    "percentage and divides by a bare 10 that has no physical meaning. Its value is therefore only " +
    "comparable between studies that used the same units, the same extraction ratios and the same " +
    "assay for ascorbic acid. Two published banding schemes are in wide use and they disagree; the " +
    "routine will not pick one for you." + TAIL,

  inputs: [
    N("a", "A — ascorbic acid in leaf", "mg/g FW", "",
      "mg per g FRESH weight. µg/g inflates APTI by 1000× and cannot be detected from the number. Determine by the Bajaj & Kaur (1981) colorimetric assay or equivalent; back-calculate the standard curve in `calib`, mod \"qc\""),
    N("t", "T — total chlorophyll", "mg/g FW", "",
      "mg per g FRESH weight. Take this from `pigment` above — do not enter chlorophyll a alone"),
    N("p", "P — pH of leaf extract", "", "",
      "Glass electrode on the homogenate. State the tissue : water ratio used (the Singh 1997 protocol is 5.0 g in 10.0 mL deionised water). Valid range 0 to 14"),
    S("rmode", "R — relative water content", [
      "Compute from fresh, turgid and dry weights",
      "Enter RWC directly",
    ], "Compute from fresh, turgid and dry weights"),
    N("fw", "FW — fresh weight of leaf", "g", "", "Weighed immediately on return from the field"),
    N("tw", "TW — turgid weight of leaf", "g", "", "After overnight immersion in water, blotted dry"),
    N("dw", "DW — dry weight of leaf", "g", "", "Oven dry to constant weight. State the temperature used"),
    N("r", "…or R directly", "%", "", "Only if RWC was computed elsewhere. Valid range 0 to 100"),
    S("scheme", "Tolerance banding scheme", [
      "Do not assign a band",
      APTI_BANDS.narrow.name,
      APTI_BANDS.wide.name,
    ], "Do not assign a band"),
  ],

  run: (v) => {
    const A = num(v.a), T = num(v.t), P = num(v.p);
    const out = [];

    /* ── R ──────────────────────────────────────────────────────────── */
    let R = NaN, rHow = "";
    if (sel(v.rmode) === "Enter RWC directly") {
      R = num(v.r);
      if (isFinite(R) && (R < 0 || R > 100))
        return [{ label: "Input", value: `RWC ${fmt(R)} % is outside 0 to 100 %`, tone: "warn",
          hint: "RWC is bounded by its definition. A value above 100 means the leaf gained water between the fresh and turgid weighings in a way the formula cannot represent, or the weights are transposed." }];
      rHow = "Entered directly";
    } else {
      const FW = num(v.fw), TW = num(v.tw), DW = num(v.dw);
      if ([FW, TW, DW].every(isFinite)) {
        if (FW <= 0 || TW <= 0 || DW <= 0)
          return [{ label: "Input", value: "Leaf weights must be greater than zero", tone: "warn", unit: "g" }];
        if (TW <= DW)
          return [{ label: "Input", value: "Turgid weight must exceed dry weight", tone: "warn",
            hint: `TW ${fmt(TW)} g, DW ${fmt(DW)} g. (TW − DW) is the denominator of RWC — at or below zero the index is undefined, not zero. Check that the two weighings have not been transposed.` }];
        if (FW < DW)
          return [{ label: "Input", value: "Fresh weight is below dry weight", tone: "warn",
            hint: `FW ${fmt(FW)} g, DW ${fmt(DW)} g. A leaf cannot dry to more than it weighed fresh. The weights are transposed or the balance drifted between weighings.` }];
        R = ((FW - DW) / (TW - DW)) * 100;
        rHow = `(${fmt(FW)} − ${fmt(DW)}) / (${fmt(TW)} − ${fmt(DW)}) × 100`;
        if (R > 100)
          out.push({ label: "RWC exceeds 100 %", value: `${fmt(R, 4)} %`, tone: "warn",
            hint: "FW is greater than TW. Either the leaf was already fully turgid when collected and lost nothing, or it took up surface water in the field, or the blotting after immersion was incomplete so TW is understated. Do not truncate to 100 — find the weighing." });
        if (R < 40 && R >= 0)
          out.push({ label: "RWC is very low", value: `${fmt(R, 4)} %`, tone: "warn",
            hint: "Below about 40 % most mesophytes are past the turgor-loss point. Confirm the leaf was not already senescent when collected — a senescent leaf drags APTI down for a reason that has nothing to do with air quality." });
      }
    }

    if (![A, T, P, R].every(isFinite)) {
      /* still show RWC alone if that is all that was entered */
      if (isFinite(R)) {
        out.unshift({ label: "Relative water content R", value: fmt(R, 4), unit: "%", tone: "key", hint: rHow });
        out.push({ label: "APTI", value: "Not computed", tone: "warn",
          hint: "APTI needs all four of A, T, P and R. Enter ascorbic acid, total chlorophyll and leaf extract pH to complete it." });
        return out;
      }
      return null;
    }

    if (A < 0 || T < 0)
      return [{ label: "Input", value: "Ascorbic acid and chlorophyll cannot be negative", tone: "warn" }];
    if (P < 0 || P > 14)
      return [{ label: "Input", value: `Leaf extract pH ${fmt(P)} is outside 0 to 14`, tone: "warn" }];

    const apti = (A * (T + P) + R) / 10;

    out.unshift({ label: "Relative water content R", value: fmt(R, 4), unit: "%", tone: "key", hint: rHow });
    out.push({ label: "A — ascorbic acid", value: fmt(A), unit: "mg/g FW" });
    out.push({ label: "T — total chlorophyll", value: fmt(T), unit: "mg/g FW" });
    out.push({ label: "P — leaf extract pH", value: fmt(P, 3), unit: "" });
    out.push({ label: "A × (T + P)", value: fmt(A * (T + P), 5),
      hint: `${fmt(A)} × (${fmt(T)} + ${fmt(P, 3)}) — note that P dominates the bracket whenever T is below about 1 mg/g, which it usually is. APTI is in practice driven mainly by ascorbic acid, leaf pH and RWC, and only weakly by chlorophyll.` });
    out.push({ label: "APTI", value: fmt(apti, 4), unit: "dimensionless", tone: "key",
      hint: `[${fmt(A * (T + P), 5)} + ${fmt(R, 4)}] / 10` });

    /* unit trap */
    if (T > 10)
      out.push({ label: "Check the chlorophyll unit", value: `T = ${fmt(T)}`, tone: "warn",
        hint: "Total chlorophyll above 10 mg/g fresh weight is outside anything normally measured — healthy angiosperm leaves run roughly 0.5 to 3 mg/g FW. This looks like a µg/g value entered as mg/g, which would inflate APTI by up to 1000×. Confirm the unit before the number leaves the app." });
    if (A > 50)
      out.push({ label: "Check the ascorbic acid unit", value: `A = ${fmt(A)}`, tone: "warn",
        hint: "Ascorbic acid above 50 mg/g fresh weight is far outside the usual leaf range. Confirm mg/g against µg/g." });

    /* band */
    const scheme = sel(v.scheme);
    if (scheme && scheme !== "Do not assign a band") {
      const sch = scheme === APTI_BANDS.narrow.name ? APTI_BANDS.narrow : APTI_BANDS.wide;
      const other = sch === APTI_BANDS.narrow ? APTI_BANDS.wide : APTI_BANDS.narrow;
      const b = band(apti, sch.bands);
      const bOther = band(apti, other.bands);
      out.push({ label: "Tolerance class", value: b || "—", tone: "key",
        hint: `${sch.name}. ${sch.verify}` });
      if (b && bOther && b !== bOther)
        out.push({ label: "The two published schemes disagree at this value", tone: "warn",
          value: `${b} on the selected scheme, ${bOther} on the other`,
          hint: `An APTI of ${fmt(apti, 4)} falls in different classes under the two banding schemes in wide use. Neither is a notified criterion. A report that gives a class without naming its scheme is not reproducible — name the scheme and cite it.` });
    } else {
      out.push({ label: "Tolerance class", value: "Not assigned", tone: "warn",
        hint: "No banding scheme was selected. Two are in wide use and they disagree over most of the range. Select one and the panel will print it with its citation." });
    }

    out.push({ label: "What APTI is not", value: "Not an air quality measurement", tone: "warn",
      hint: "APTI ranks a SPECIES by its biochemical resilience. It says nothing about the concentration of any pollutant, it has no notified value, and it cannot be compared against the NAAQS. Its use is to choose species for a green belt and to compare the same species between an exposed and a control site sampled on the same day, in the same season, at the same leaf age." });

    return out;
  },
},

/* ══════════════════════════════════════════════════════════════════════════
   3.  DUST
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "dust", mod: "phyto", tier: "routine",
  name: "Dust Capturing Capacity",
  sub: "Dust load per unit leaf area from a paired weighing",
  formula: "W (mg/cm²) = (m_dusty − m_clean) × 1000 / A",
  ref:
    DUST_CITE +
    " m in g, A in cm², result in mg/cm². THE PRINTED FORM OF THIS EXPRESSION VARIES BETWEEN " +
    "SOURCES — some write (W2 − W1) with W2 the dusty leaf, some write (W1 − W2) with W1 the leaf " +
    "as collected. Both denote the same physical quantity, the dust removed, but a routine that " +
    "hard-codes one order returns a negative number for a user following the other. This routine " +
    "asks which weighing is which and never takes an absolute value. " +
    "The leaf area basis also varies: dust settles on the adaxial surface but leaf area is commonly " +
    "measured on one side only, so a one-sided and a two-sided basis differ by a factor of two. " +
    "State which was used." + TAIL,

  inputs: [
    N("m1", "First weighing", "g", "", "The leaf as it came off the plant, or the leaf after cleaning — say which below"),
    N("m2", "Second weighing", "g", ""),
    S("order", "Which weighing carried the dust?", [
      "First weighing was the leaf as collected (dusty); second was after cleaning",
      "First weighing was the cleaned leaf; second was the leaf as collected (dusty)",
    ], "First weighing was the leaf as collected (dusty); second was after cleaning"),
    N("area", "Leaf area", "cm²", "", "Total for the leaves actually weighed, not per leaf"),
    S("side", "Leaf area basis", [
      "One side (projected area)",
      "Both sides (total surface)",
    ], "One side (projected area)"),
    N("nleaf", "Number of leaves pooled", "", "3", "Prusty et al. use three mature leaves per plant"),
    N("res", "Balance readability", "g", "0.0001", "The last digit the balance displays. Used to check the weighing is resolvable"),
    S("removal", "Dust removal method", [
      "Brushed (camel-hair brush)",
      "Washed and filtered",
      "Other or not stated",
    ], "Brushed (camel-hair brush)"),
  ],

  run: (v) => {
    const m1 = num(v.m1), m2 = num(v.m2), A = num(v.area);
    if (![m1, m2].every(isFinite)) return null;

    if (m1 <= 0 || m2 <= 0)
      return [{ label: "Input", value: "Leaf weights must be greater than zero", tone: "warn", unit: "g" }];
    if (!isFinite(A) || A <= 0)
      return [{ label: "Input", value: "Leaf area must be greater than zero", tone: "warn", unit: "cm²" }];

    const out = [];

    /* FIX 2 — an untouched order select used to evaluate FALSE, i.e. it
       silently assumed the SECOND weighing was the dusty one, which is the
       opposite of this field's own default. The sign of dm is the diagnosis
       in this routine, so that inverted the diagnosis. Fall back to the
       declared default and say so. */
    const order = sel(v.order);
    const dustyFirst = order === ""
      ? true
      : order.startsWith("First weighing was the leaf as collected");
    if (order === "")
      out.push({ label: "Weighing order", value: "Not stated — taken as first weighing dusty", tone: "warn",
        hint: "The order selector was not set. The routine has assumed the field default, that the FIRST weighing was the leaf as collected and the second was after cleaning. If that is the wrong way round the sign of the dust mass reverses and the result is meaningless. Set the selector." });

    const dm = dustyFirst ? m1 - m2 : m2 - m1;

    if (dm < 0)
      return [{ label: "Result", value: "Negative dust mass", tone: "warn",
        unit: "g",
        hint: `The weighing declared as dusty (${fmt(dustyFirst ? m1 : m2, 6)} g) is LIGHTER than the one declared as clean (${fmt(dustyFirst ? m2 : m1, 6)} g), by ${fmt(Math.abs(dm), 6)} g. Either the order selector is set the wrong way round, or the leaf lost water between the two weighings — a leaf held at room temperature can lose more mass to transpiration in twenty minutes than it carries in dust. Weigh both within a few minutes, or seal the leaf between weighings. The routine will not take an absolute value: the sign is the diagnosis.` }];

    const res = num(v.res);

    if (isFinite(res) && res > 0 && dm < 20 * res)
      out.push({ label: "Weighing resolution", value: `Dust mass is ${fmt(dm / res, 3)} × the balance readability`, tone: "warn",
        hint: `${fmt(dm, 6)} g on a balance reading to ${fmt(res, 6)} g. Below about 20 scale divisions the difference of two weighings carries a relative uncertainty of more than 5 % from rounding alone, before any transpiration loss. Pool more leaves or use a balance with finer readability.` });

    if (dm === 0)
      out.push({ label: "Dust mass", value: "Zero to the resolution of the balance", tone: "warn",
        hint: "The two weighings are identical. Report as below the working limit of the method rather than as zero dust." });

    const mg = dm * 1000;
    out.push({ label: "Dust removed", value: fmt(mg, 4), unit: "mg",
      hint: `${fmt(dustyFirst ? m1 : m2, 6)} g − ${fmt(dustyFirst ? m2 : m1, 6)} g = ${fmt(dm, 6)} g. The ×1000 to mg is NOT in the printed formula in most sources, which leave the result in g/cm²; state the unit explicitly whenever this number is quoted.` });

    const twoSided = sel(v.side) === "Both sides (total surface)";
    const load = mg / A;
    out.push({ label: `Dust load, ${twoSided ? "two-sided" : "one-sided"} area basis`,
      value: fmt(load, 4), unit: "mg/cm²", tone: "key",
      hint: `${fmt(mg, 4)} mg ÷ ${fmt(A)} cm². Equivalent to ${fmt(load * 10, 4)} g/m² and ${fmt(load / 1000, 5)} g/cm².` });

    /* the other basis, so the factor of two is never hidden */
    out.push({ label: `Same result on the ${twoSided ? "one-sided" : "two-sided"} basis`,
      value: fmt(twoSided ? load * 2 : load / 2, 4), unit: "mg/cm²", tone: "warn",
      hint: "A one-sided and a two-sided leaf area differ by a factor of two and both conventions appear in the literature. A dust load quoted without its area basis is ambiguous by 100 %. State it." });

    const n = num(v.nleaf);
    if (isFinite(n) && n > 0)
      out.push({ label: "Per leaf", value: fmt(mg / n, 4), unit: "mg dust per leaf",
        hint: `${fmt(mg, 4)} mg over ${fmt(n)} leaves. Useful for the field record; the area-normalised figure above is the comparable one.` });

    /* FIX 2 — an unset removal select used to print no row at all. The
       removal method is part of the result, so an unset select is reported
       as "Not stated" rather than omitted. */
    const removal = sel(v.removal) || "Other or not stated";
    if (removal === "Brushed (camel-hair brush)")
      out.push({ label: "Removal method", value: "Brushed", tone: "warn",
        hint: "Brushing removes leaf trichomes, epicuticular wax and occasionally lamina fragments along with the dust, so the mass difference is an upper bound on dust. On a pubescent or waxy leaf — Calotropis procera and Nerium oleander both qualify — the bias can be substantial. A wash-and-filter determination is the more defensible option where the species is hairy." });
    if (removal === "Other or not stated")
      out.push({ label: "Removal method", value: "Not stated", tone: "warn",
        hint: "The dust removal method is part of the result. Two labs using brushing and washing on the same leaf will not agree. State it in the report." });

    out.push({ label: "What this is not", value: "Not a measurement of ambient PM", tone: "warn",
      hint: "Dust load on a leaf is a function of the species, the leaf surface, its height above the road, the leaf age, the time since the last rainfall and the wind, as well as of the dust in the air. It is a biomonitoring endpoint, not a substitute for a gravimetric PM10 or PM2.5 determination — those are `filterpm` in mod \"air\", with the NAAQS behind them." });

    return out;
  },
},

/* ══════════════════════════════════════════════════════════════════════════
   4.  API
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "api", mod: "phyto", tier: "advanced",
  name: "Anticipated Performance Index",
  sub: "Green-belt suitability score from APTI plus seven biological and socio-economic characters",
  formula: "API (%) = (Σ grades awarded ÷ Σ maximum grades) × 100",
  ref:
    API_CITE +
    " THE GRADE ALLOTMENT TABLE IS NOT REPRODUCED IN THIS APP. The per-character maxima and the " +
    "APTI-to-grade boundaries could not be confirmed against the source paper, and inventing them " +
    "would put a fabricated scale into a report. Read the grade and the maximum for each character " +
    "off the paper and enter them here; the routine does the arithmetic, checks each grade against " +
    "its own maximum, and prints the assessment band with a VERIFY note. " +
    "VERIFY: Prajapati & Tripathi (2008), Journal of Environmental Management 88(4): 1343–1349, " +
    "Table 1 (grade allotment) and Table 2 (assessment categories)." + TAIL,

  inputs: [
    { id: "g", type: "table",
      label: "Grade awarded for each character",
      hint: "From the grade allotment table in the source paper. Leave a row blank if that character was not graded — a blank row is reported as not graded, never as zero.",
      rows: API_CHARACTERS.map((c) => ({ k: c.k, unit: "grade", std: "" })) },
    { id: "mx", type: "table",
      label: "Maximum grade available for each character",
      hint: "Also from the source paper. Must be entered for every character that carries a grade, or the percentage has no denominator.",
      rows: API_CHARACTERS.map((c) => ({ k: c.k, unit: "max", std: "" })) },
    S("confirm", "Grade scale checked against the source paper?", [
      "Not checked",
      "Checked — the grades and maxima above are as printed in the paper",
    ], "Not checked"),
  ],

  run: (v) => {
    const g = v.g || {}, mx = v.mx || {};
    const rows = [], bad = [];
    let sum = 0, max = 0, graded = 0;

    for (const c of API_CHARACTERS) {
      const gr = g[c.k], mr = mx[c.k];
      const gv = String(gr ?? "").trim() === "" ? NaN : num(gr);
      const mv = String(mr ?? "").trim() === "" ? NaN : num(mr);

      if (!isFinite(gv) && !isFinite(mv)) { rows.push({ label: c.k, value: "Not graded", hint: c.hint }); continue; }
      if (!isFinite(gv)) { bad.push(`${c.k} — maximum given without a grade`); continue; }
      if (!isFinite(mv)) { bad.push(`${c.k} — grade given without a maximum`); continue; }
      if (gv < 0 || mv <= 0) { bad.push(`${c.k} — grade cannot be negative and the maximum must exceed zero`); continue; }
      if (gv > mv) { bad.push(`${c.k} — grade ${fmt(gv)} exceeds its own maximum ${fmt(mv)}`); continue; }

      sum += gv; max += mv; graded += 1;
      rows.push({ label: c.k, value: `${fmt(gv)} of ${fmt(mv)}`, unit: "grade",
        hint: `${((gv / mv) * 100).toFixed(0)} % of the available grade. ${c.hint}` });
    }

    if (bad.length)
      return [{ label: "Input", tone: "warn", value: bad.join(" · "),
        hint: "Each character needs a grade and its own maximum, both taken from the source paper. A grade above its maximum is a transcription error." }];

    if (!graded) return null;

    const out = [...rows];
    const pct = (sum / max) * 100;

    out.push({ label: "Characters graded", value: `${graded} of ${API_CHARACTERS.length}`,
      tone: graded < API_CHARACTERS.length ? "warn" : undefined,
      hint: graded < API_CHARACTERS.length
        ? "A partial score is not comparable with a published API, which grades all eight characters. The percentage below is against the maxima of the characters actually graded, not against the full scale."
        : "All eight characters graded." });

    out.push({ label: "Score", value: `${fmt(sum)} of ${fmt(max)}` });
    out.push({ label: "API", value: fmt(pct, 4), unit: "%", tone: "key",
      hint: `${fmt(sum)} ÷ ${fmt(max)} × 100` });

    if (sel(v.confirm).startsWith("Checked")) {
      const b = band(pct, API_BANDS);
      out.push({ label: "Assessment category", value: b || "—", tone: "key",
        hint: "Ten-percentage-point bands from 'Not recommended' below 30 % to 'Best' above 90 %. VERIFY the band boundaries against Prajapati & Tripathi (2008) Table 2 before the category appears in a report." });
    } else {
      out.push({ label: "Assessment category", value: "Withheld", tone: "warn",
        hint: "The grade scale has not been confirmed against the source paper. The percentage above is arithmetic on whatever was entered; a category printed on top of an unverified scale would read as an authority the app does not have. Confirm the scale and the category will print." });
    }

    out.push({ label: "What API is for", value: "Species selection for a green belt",
      hint: "API ranks candidate species for plantation. It combines a biochemical index with canopy, foliage and economic characters, several of which are judgements rather than measurements. It is not a pollution measurement and has no notified value. Two workers grading the same tree will not always agree — record who graded it." });

    return out;
  },
},

/* ══════════════════════════════════════════════════════════════════════════
   5.  TRANSFER — BCF, BAF, TF
   Supersedes `bcf` in mod "hw".
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "transfer", mod: "phyto", tier: "advanced",
  name: "BCF, BAF & Translocation Factor",
  sub: "Soil-to-root, soil-to-shoot and root-to-shoot metal transfer, with accumulator class",
  formula: "BCF = C_root / C_soil        BAF = C_shoot / C_soil        TF = C_shoot / C_root",
  ref:
    TRANSFER_CITE + " " + HYPERACC_CITE +
    " All three ratios are DIMENSIONLESS and require both terms in mg/kg on the SAME dry-weight " +
    "basis. A soil dried at 105 °C paired with tissue dried at 90 °C does not meet that — the ratio " +
    "is still computable but the two 'dry weights' are different operational quantities and the " +
    "drying regimes must be reported. " +
    "BCF and BAF against a TOTAL soil digestion are not the same numbers as against a " +
    "plant-available extraction (DTPA, CaCl₂, NH₄OAc–EDTA); a total digest gives the lower ratio. " +
    "Neither ratio is a regulatory quantity and neither has a notified Indian value." + TAIL,

  inputs: [
    S("el", "Element", ["Not specified", ...Object.keys(HYPERACC).sort()], "Not specified"),
    N("soil", "C_soil — metal in soil", "mg/kg DW", "", "Rooting-zone soil actually surrounding the sampled plant, not a site mean"),
    N("root", "C_root — metal in root", "mg/kg DW", "", "Washed free of adhering soil before drying, or BCF measures the soil twice"),
    N("shoot", "C_shoot — metal in shoot or leaf", "mg/kg DW", ""),
    S("extr", "Soil digestion or extraction", [
      "Total or pseudo-total digestion (aqua regia, HNO₃–HCl–HClO₄, USEPA 3050B / 3051A)",
      "Plant-available extraction (DTPA, CaCl₂, NH₄OAc–EDTA)",
      "Not stated",
    ], "Total or pseudo-total digestion (aqua regia, HNO₃–HCl–HClO₄, USEPA 3050B / 3051A)"),
    N("tsoil", "Soil drying temperature", "°C", "105", "For the record — it belongs with the ratio"),
    N("tplant", "Plant tissue drying temperature", "°C", "70", "For the record. Above about 70 °C some tissue components volatilise and the dry weight is not the same quantity as a soil dry weight"),
  ],

  run: (v) => {
    const s = num(v.soil), r = num(v.root), sh = num(v.shoot);
    if (!isFinite(s) && !isFinite(r) && !isFinite(sh)) return null;

    if (isFinite(s) && s < 0) return [{ label: "Input", value: "Soil concentration cannot be negative", tone: "warn" }];
    if (isFinite(r) && r < 0) return [{ label: "Input", value: "Root concentration cannot be negative", tone: "warn" }];
    if (isFinite(sh) && sh < 0) return [{ label: "Input", value: "Shoot concentration cannot be negative", tone: "warn" }];

    const out = [];
    let bcf = NaN, baf = NaN, tf = NaN;

    if (isFinite(s) && s === 0)
      out.push({ label: "C_soil is zero", value: "BCF and BAF undefined", tone: "warn",
        hint: "A ratio to zero is not infinity, it is undefined. If the soil result is below the detection limit, say so and report the ratio as 'greater than' the value obtained with the detection limit as the denominator — do not substitute zero." });

    if (isFinite(s) && s > 0 && isFinite(r)) {
      bcf = r / s;
      out.push({ label: "BCF — root / soil", value: fmt(bcf, 4), unit: "dimensionless", tone: "key",
        hint: `${fmt(r)} ÷ ${fmt(s)} mg/kg. Above 1 the root concentrates the metal above the soil it grows in.` });
    }
    if (isFinite(s) && s > 0 && isFinite(sh)) {
      baf = sh / s;
      out.push({ label: "BAF — shoot / soil", value: fmt(baf, 4), unit: "dimensionless", tone: "key",
        hint: `${fmt(sh)} ÷ ${fmt(s)} mg/kg. Also written BAC in parts of the literature — the same ratio under two names.` });
    }
    if (isFinite(r) && isFinite(sh)) {
      if (r === 0)
        out.push({ label: "TF", value: "Undefined — root concentration is zero", tone: "warn" });
      else {
        tf = sh / r;
        out.push({ label: "TF — shoot / root", value: fmt(tf, 4), unit: "dimensionless", tone: "key",
          hint: `${fmt(sh)} ÷ ${fmt(r)} mg/kg. Above 1 the metal moves to the shoot faster than it is retained in the root.` });
      }
    }

    /* ── class ──────────────────────────────────────────────────────── */
    if (isFinite(baf))
      out.push({ label: "Accumulator class on BAF", value: baf > 1 ? "Accumulator" : "Excluder",
        tone: baf > 1 ? "warn" : undefined,
        hint: "BAF above 1 is taken as accumulation into the shoot and below 1 as exclusion (Rezvani & Zaefarian 2011). The boundary is a convention in the literature, not a measurement threshold — a BAF of 0.98 and one of 1.02 are the same finding." });

    if (isFinite(bcf) && isFinite(tf)) {
      const verdict =
        bcf > 1 && tf > 1 ? "Phytoextraction candidate — metal is taken up and moved to the harvestable shoot"
        : bcf > 1 && tf <= 1 ? "Phytostabilisation candidate — metal is taken up but held in the root"
        : bcf <= 1 && tf > 1 ? "Low uptake but efficient internal transport — neither strategy is supported on these numbers alone"
        : "Excluder — low uptake and low transport. Useful as a barrier or screening planting, not for remediation";
      out.push({ label: "Phytoremediation reading", value: verdict, tone: "key",
        hint: "A single plant at a single time point. Uptake varies with soil pH, organic matter, competing cations, season and plant age; a strategy is not established from one sampling." });
    }

    /* ── hyperaccumulation ──────────────────────────────────────────── */
    const el = sel(v.el);
    if (el && el !== "Not specified") {
      const thr = HYPERACC[el];
      if (isFinite(sh) && thr) {
        const meets = sh >= thr && bcf > 1 && tf > 1;
        out.push({ label: `Hyperaccumulation screen — ${el}`,
          value: meets ? "All three criteria met" : "Not met",
          tone: meets ? "warn" : undefined,
          hint: `Nominal foliar threshold ${thr} mg/kg DW; shoot ${isFinite(sh) ? fmt(sh) : "—"} mg/kg ${sh >= thr ? "≥" : "<"} threshold. BCF ${isFinite(bcf) ? fmt(bcf, 3) : "—"} ${bcf > 1 ? ">" : "≤"} 1. TF ${isFinite(tf) ? fmt(tf, 3) : "—"} ${tf > 1 ? ">" : "≤"} 1. ${HYPERACC_CITE} The criterion also requires the plant to be growing in its natural habitat, not in a spiked pot — this screen cannot check that.` });
      }
      /* FIX 3 — the per-element VERIFY note is emitted whenever the element
         is selected, not only when the screen row is produced, so it cannot
         be lost from a partly entered form. Antimony 1000 mg/kg is carried
         unchanged; it is simply not confirmed against van der Ent Table 1. */
      if (HYPERACC_VERIFY[el])
        out.push({ label: `VERIFY — ${el} threshold ${HYPERACC[el]} mg/kg DW`,
          value: "Threshold not confirmed against the cited table",
          tone: "warn", hint: HYPERACC_VERIFY[el] });
    }

    /* ── the things that invalidate the ratio ───────────────────────── */
    /* FIX 2 — an unset extraction select used to print no basis row at all.
       The extraction is part of the definition of the ratio. */
    const extr = sel(v.extr) || "Not stated";
    if (extr.startsWith("Total"))
      out.push({ label: "Basis of the soil figure", value: "Total or pseudo-total digestion", tone: "warn",
        hint: "BCF and BAF against a total digest are systematically LOWER than against a plant-available extraction, because most of the total is not available to the root. Comparing a BCF computed on a total digest with a published BCF computed on DTPA is comparing two different quantities. State the extraction with the ratio." });
    if (extr === "Not stated")
      out.push({ label: "Basis of the soil figure", value: "Not stated", tone: "warn",
        hint: "The soil extraction is part of the definition of BCF and BAF. Without it the ratio cannot be compared with anything." });

    const ts = num(v.tsoil), tp = num(v.tplant);
    if (isFinite(ts) && isFinite(tp) && Math.abs(ts - tp) > 5)
      out.push({ label: "Drying regimes differ", value: `Soil ${fmt(ts)} °C, tissue ${fmt(tp)} °C`, tone: "warn",
        hint: "Both terms of the ratio are 'mg/kg dry weight' but the two dry weights were produced by different regimes, so they are not the same operational quantity. The ratio is still computable and is what the literature reports; record both temperatures with it. Tissue dried above about 70 °C also loses volatile components and, for mercury and selenium, some of the analyte itself." });
    if (isFinite(tp) && tp > 80)
      out.push({ label: "Tissue drying temperature", value: `${fmt(tp)} °C`, tone: "warn",
        hint: "Above about 80 °C losses of mercury and selenium from plant tissue are documented, and thermal decomposition of the matrix begins. If Hg or Se is among the analytes this is a determinate negative bias, not a rounding." });

    out.push({ label: "Reference values", value: "No notified Indian limit exists", tone: "warn",
      hint: PHYTO_ABSENT[0] + " — and for the plant, " + PHYTO_ABSENT[1] });

    return out;
  },
},

/* ══════════════════════════════════════════════════════════════════════════
   6.  SOIL CHLORIDE
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "soilcl", mod: "phyto", tier: "routine",
  name: "Chloride in Soil Water Extract",
  sub: "Argentometric (Mohr) titration on a soil : water extract",
  formula:
    "Cl⁻ (mg per 100 g soil) = N × (V_s − V_b) × (V_extract / V_aliquot) × (100 / W_soil) × 35.45",
  ref:
    CL_CITE +
    " N = normality of the silver nitrate, eq/L, which is numerically meq/mL. V_s and V_b = titre for " +
    "the sample and for a distilled-water blank, mL. V_extract = total volume of water used to extract " +
    "the soil, mL. V_aliquot = volume of the filtered extract titrated, mL. W_soil = mass of soil " +
    "extracted, g. 35.45 mg/meq is the equivalent weight of chloride. " +
    "THE BLANK IS NOT OPTIONAL. IS 3025 (Part 32) requires the titration of a distilled-water blank " +
    "carried through the same indicator addition; the chromate indicator itself consumes silver and " +
    "the endpoint is reached slightly past the equivalence point. Published soil formulations that " +
    "omit the blank overstate chloride by the blank titre, which on a low-chloride soil can be most " +
    "of the result." + TAIL,

  inputs: [
    N("nag", "Normality of AgNO₃", "N (eq/L)", "0.02", "Standardised against NaCl. Valid range 0.001 to 1"),
    N("vs", "Titre for the sample", "mL", "", "To the first persistent reddish-brown tinge"),
    N("vb", "Titre for the distilled-water blank", "mL", "0.2", "Same indicator, same volume, same operator. Do not leave at zero without having run one"),
    N("vext", "Total extraction water", "mL", "200", "The water added to the soil"),
    N("vali", "Aliquot titrated", "mL", "50", "Volume of the filtered extract taken for titration"),
    N("wsoil", "Soil taken for extraction", "g", "40", "Air-dry, < 2 mm. State the basis"),
    N("phx", "pH of the extract at titration", "", "", "Mohr endpoint is valid only at pH 7 to 10. Leave blank if not checked"),
    S("basis", "Soil weight basis", ["Air-dry", "Oven-dry (105 °C)", "As received"], "Air-dry"),
  ],

  run: (v) => {
    /* isFinite test, not `?? 0` — num() returns NaN, never null, and zero is
       a legitimate (if warned-about) blank titre. */
    const N_ = num(v.nag), vs = num(v.vs), vb = isFinite(num(v.vb)) ? num(v.vb) : 0;
    const vext = num(v.vext), vali = num(v.vali), w = num(v.wsoil);

    if (!isFinite(vs)) return null;
    if (!isFinite(N_) || N_ <= 0)
      return [{ label: "Input", value: "AgNO₃ normality must be greater than zero", tone: "warn", unit: "N" }];
    if (vs < 0 || vb < 0)
      return [{ label: "Input", value: "Titres cannot be negative", tone: "warn", unit: "mL" }];
    if (!isFinite(vext) || vext <= 0 || !isFinite(vali) || vali <= 0)
      return [{ label: "Input", value: "Extraction volume and aliquot must both be greater than zero", tone: "warn", unit: "mL" }];
    if (vali > vext)
      return [{ label: "Input", value: `Aliquot ${fmt(vali)} mL exceeds the total extract ${fmt(vext)} mL`, tone: "warn",
        hint: "More extract was titrated than was made. Check which volume is which." }];
    if (!isFinite(w) || w <= 0)
      return [{ label: "Input", value: "Soil weight must be greater than zero", tone: "warn", unit: "g" }];
    if (vs <= vb)
      return [{ label: "Result", value: "Sample titre does not exceed the blank", tone: "warn",
        hint: `Sample ${fmt(vs)} mL, blank ${fmt(vb)} mL. Chloride is at or below the working limit of the titration. Report as less than the concentration corresponding to one drop (about 0.05 mL) above the blank, not as zero and not as a negative.` }];

    const meqAliquot = N_ * (vs - vb);
    const meqExtract = meqAliquot * (vext / vali);
    const meq100 = meqExtract * (100 / w);
    const mg100 = meq100 * CL_EQ_WT;

    const basis = sel(v.basis);

    const out = [
      { label: "Blank-corrected titre", value: fmt(vs - vb, 4), unit: "mL",
        hint: `${fmt(vs)} − ${fmt(vb)} mL of ${fmt(N_)} N AgNO₃` },
      { label: "Chloride in the aliquot", value: fmt(meqAliquot, 4), unit: "meq",
        hint: `${fmt(N_)} eq/L × ${fmt(vs - vb, 4)} mL = meq, since 1 N is 1 meq/mL` },
      { label: "Extract-to-aliquot factor", value: fmt(vext / vali, 4), unit: "×",
        hint: `${fmt(vext)} mL extract ÷ ${fmt(vali)} mL titrated` },
      { label: "Soil-to-100 g factor", value: fmt(100 / w, 4), unit: "×",
        hint: `100 g ÷ ${fmt(w)} g of soil taken` },
      { label: "Chloride", value: fmt(mg100, 4), unit: "mg per 100 g soil", tone: "key",
        hint: `${fmt(meq100, 4)} meq/100 g × ${CL_EQ_WT} mg/meq. Some texts use 35.5 mg/meq, which is 0.14 % high; this app uses the relative atomic mass 35.45.` },
      { label: "…as mg/kg", value: fmt(mg100 * 10, 4), unit: "mg/kg soil", tone: "key" },
      { label: "…as meq per 100 g", value: fmt(meq100, 4), unit: "meq/100 g",
        hint: "The agronomic unit. Reported alongside the mass unit because soil chemistry literature uses both." },
      { label: "Extraction ratio", value: `1 : ${fmt(vext / w, 3)}`, unit: "soil : water w/v",
        hint: `${fmt(w)} g of soil in ${fmt(vext)} mL of water. THIS RATIO IS PART OF THE RESULT. Chloride is soluble, so a wider ratio does not change the total extracted much, but the ratio must still be reported — IS 3025 (Part 32) is a water method and says nothing about how the soil was extracted.` },
      { label: "Soil weight basis", value: basis || "Not stated", tone: basis ? undefined : "warn",
        hint: "An air-dry soil still carries hygroscopic moisture, typically 1 to 4 % on a clay. A result on an air-dry basis is that much lower than the same result on an oven-dry basis. State which was used, or determine the moisture and convert." },
    ];

    const px = num(v.phx);
    if (isFinite(px)) {
      const ok = px >= 7 && px <= 10;
      out.push({ label: "pH at titration", value: fmt(px, 3), tone: ok ? "ok" : "warn",
        hint: ok
          ? "Inside the pH 7 to 10 window the Mohr endpoint requires."
          : px < 7
            ? "Below pH 7 the chromate is protonated to dichromate, silver chromate does not precipitate at the equivalence point, and the endpoint is late — chloride is overstated. Neutralise with NaHCO₃ and repeat."
            : "Above pH 10 silver hydroxide precipitates before silver chromate and the endpoint is early — chloride is understated. Neutralise with dilute H₂SO₄ and repeat." });
    } else {
      out.push({ label: "pH at titration", value: "Not checked", tone: "warn",
        hint: "The Mohr endpoint is only valid between pH 7 and 10. A calcareous or a sodic soil extract will sit outside that range. Check it — the failure is silent and one-directional." });
    }

    if (vb === 0)
      out.push({ label: "Blank", value: "Entered as zero", tone: "warn",
        hint: "A zero blank means either that no blank was run or that it titrated below the resolution of the burette. The chromate indicator consumes silver in its own right; a real blank on a 50 mL aliquot with 5 to 6 drops of 5 % K₂CrO₄ is typically 0.1 to 0.3 mL. A zero here inflates every result by that amount." });

    out.push({ label: "Interferences", value: "Sulphide, thiosulphate, bromide, iodide, colour, turbidity", tone: "warn",
      hint: "Bromide and iodide titrate as chloride and are reported as chloride. Sulphide and thiosulphate consume silver. A coloured or turbid extract hides the brick-red endpoint — filter or decolourise with aluminium hydroxide suspension first, per IS 3025 (Part 32). On a soil near a tannery, a battery-breaking yard or an old dump these are not hypothetical." });

    out.push({ label: "Reference value", value: "No notified Indian limit for chloride in soil", tone: "warn",
      hint: "Chloride in soil is assessed agronomically, against crop salt tolerance, not against a notified environmental standard. There is no CPCB or MoEFCC figure to compare this with. Salinity is normally judged on the electrical conductivity of the saturation extract — see `soilpe`." });

    return out;
  },
},

/* ══════════════════════════════════════════════════════════════════════════
   7.  SOIL pH & EC
   ══════════════════════════════════════════════════════════════════════════ */
{
  id: "soilpe", mod: "phyto", tier: "routine",
  name: "Soil pH & Electrical Conductivity",
  sub: "Suspension pH and extract EC, with the saturation-extract caveat",
  formula:
    "EC₂₅ = EC_T / [1 + 0.019 (T − 25)]        Salinity classes are defined on the SATURATION EXTRACT (ECe) only",
  ref:
    SOIL_PH_CITE + " " + SOIL_EC_CITE + " " + ECE_CITE +
    " The temperature compensation shown is the conventional linear approximation, about 1.9 % per " +
    "°C, used where a meter has no automatic temperature compensation. It is an approximation and it " +
    "degrades more than about 10 °C away from 25 °C; a meter with ATC is preferable to applying it. " +
    "THERE IS NO GENERAL CONVERSION between a 1:2.5 or 1:5 extract and a saturation extract. The " +
    "factor is a function of the soil's texture and water-holding capacity, roughly 6 to 14, and " +
    "this app does not apply one." + TAIL,

  inputs: [
    N("ph", "Soil pH", "", "", "Glass electrode in the settled suspension. Valid range 0 to 14"),
    S("phratio", "Soil : water ratio for pH", [
      "1 : 2.5 (IS 2720 Part 26)",
      "1 : 5",
      "1 : 1",
      "Saturation paste",
      "Other or not stated",
    ], "1 : 2.5 (IS 2720 Part 26)"),
    N("ec", "Electrical conductivity as read", "dS/m", "", "1 dS/m = 1 mS/cm = 1000 µS/cm. Valid range 0 to 200"),
    S("ecratio", "Soil : water ratio for EC", [
      "1 : 2.5",
      "1 : 5",
      "1 : 1",
      "Saturation extract (ECe)",
      "Other or not stated",
    ], "1 : 5"),
    N("tc", "Temperature at which EC was read", "°C", "25", "Leave at 25 if the meter has automatic temperature compensation"),
    S("atc", "Meter temperature compensation", [
      "Automatic (ATC) — value is already at 25 °C",
      "None — apply the linear correction",
    ], "Automatic (ATC) — value is already at 25 °C"),
  ],

  run: (v) => {
    const pH = num(v.ph), ec = num(v.ec), T = num(v.tc);
    if (!isFinite(pH) && !isFinite(ec)) return null;
    const out = [];

    /* FIX 1 — v.phratio and v.ecratio were read with a bare .startsWith. A
       form with pH entered and the ratio select never touched threw
       TypeError before a single row was produced. Both are read through
       sel() now and an unset select reports "Not stated". */
    const phratio = sel(v.phratio);
    const ecratio = sel(v.ecratio);

    /* ── pH ─────────────────────────────────────────────────────────── */
    if (isFinite(pH)) {
      if (pH < 0 || pH > 14)
        return [{ label: "Input", value: `pH ${fmt(pH)} is outside 0 to 14`, tone: "warn" }];
      const cls =
        pH < 4.5 ? "Extremely acidic" : pH < 5.5 ? "Strongly acidic" : pH < 6.5 ? "Moderately acidic"
        : pH <= 7.5 ? "Neutral" : pH <= 8.5 ? "Moderately alkaline" : pH <= 9.0 ? "Strongly alkaline"
        : "Very strongly alkaline";
      out.push({ label: "Soil pH", value: fmt(pH, 3), unit: `at ${phratio || "an unstated soil : water ratio"}`, tone: "key",
        hint: `${cls}. Descriptive classes after the USDA Soil Survey Manual; they are a description, not a standard, and India notifies no soil pH limit.` });
      out.push({ label: "pH ratio", value: phratio || "Not stated", tone: phratio.startsWith("1 : 2.5") ? undefined : "warn",
        hint: phratio.startsWith("1 : 2.5")
          ? "IS 2720 (Part 26): 1987 specifies 1 : 2.5 soil : water. The ratio is part of the result and must be reported with it."
          : "IS 2720 (Part 26) specifies 1 : 2.5. A wider ratio dilutes the exchangeable acidity and typically reads 0.1 to 0.3 pH units higher; a saturation paste reads lower still. There is no general conversion between ratios. Report the ratio with the value and do not compare across ratios." });
      if (pH > 6.0 && pH < 8.5)
        out.push({ label: "Metal mobility note", value: "Near-neutral — most cationic metals are least soluble here",
          hint: "Cd, Pb, Zn, Cu and Ni mobility rises sharply below about pH 6 and again in strongly alkaline soil for the amphoteric species. A BCF or BAF from `transfer` is only comparable between sites at similar pH. Chromium(VI) and arsenic behave the other way round — they are more mobile as pH rises." });
      else
        out.push({ label: "Metal mobility note", value: pH <= 6.0 ? "Acidic — cationic metal mobility elevated" : "Strongly alkaline — anionic species mobility elevated",
          tone: "warn",
          hint: pH <= 6.0
            ? "Below about pH 6 the solubility and plant availability of Cd, Pb, Zn, Cu and Ni rise steeply. Uptake ratios from `transfer` at this pH are not comparable with ratios from a neutral soil."
            : "Above about pH 8.5 arsenate and chromate desorb from iron oxides and become more mobile, while cationic metals are least soluble. Read `transfer` ratios with the pH beside them." });
    }

    /* ── EC ─────────────────────────────────────────────────────────── */
    if (isFinite(ec)) {
      if (ec < 0) return [{ label: "Input", value: "Conductivity cannot be negative", tone: "warn" }];
      if (ec > 200) return [{ label: "Input", value: `EC ${fmt(ec)} dS/m is outside the plausible range`, tone: "warn",
        hint: "Check the unit. 1 dS/m = 1 mS/cm = 1000 µS/cm. A µS/cm value entered as dS/m is out by 1000." }];

      let ec25 = ec, how = "As read — meter has automatic temperature compensation";
      if (sel(v.atc).startsWith("None")) {
        if (!isFinite(T))
          return [{ label: "Input", value: "Reading temperature is needed to apply the correction", tone: "warn", unit: "°C" }];
        if (T <= -52.6)
          return [{ label: "Input", value: "Temperature makes the correction denominator zero or negative", tone: "warn", unit: "°C" }];
        ec25 = ec / (1 + 0.019 * (T - 25));
        how = `${fmt(ec)} ÷ [1 + 0.019 × (${fmt(T)} − 25)]`;
        if (Math.abs(T - 25) > 10)
          out.push({ label: "Temperature correction", value: `${fmt(T)} °C is more than 10 °C from 25 °C`, tone: "warn",
            hint: "The 1.9 %/°C linear coefficient is an approximation that degrades away from 25 °C and varies with the ionic composition. Bring the extract to 25 °C or use a meter with ATC rather than correcting this far." });
      }

      out.push({ label: "EC at 25 °C", value: fmt(ec25, 4), unit: "dS/m", tone: "key", hint: how });
      out.push({ label: "…as µS/cm", value: fmt(ec25 * 1000, 4), unit: "µS/cm" });
      out.push({ label: "EC ratio", value: ecratio || "Not stated", tone: ecratio.startsWith("Saturation") ? undefined : "warn",
        hint: ecratio.startsWith("Saturation")
          ? "Saturation extract. This is the basis the salinity classes are defined on."
          : "The USDA salinity classes are defined on the SATURATION EXTRACT and on nothing else. Converting this reading to ECe needs a factor of roughly 6 to 14 that depends on the soil's texture and water-holding capacity — it is a property of the soil, not a constant, and this app will not apply one. Either prepare a saturation extract or report the value with its ratio and no class." });

      if (ecratio.startsWith("Saturation")) {
        const cls = band(ec25, ECE_CLASSES);
        out.push({ label: "Salinity class", value: cls || "—", unit: "on ECe", tone: "key",
          hint: `${ECE_CITE} Crop response: most crops are unaffected below 2 dS/m; sensitive crops decline from about 2; only salt-tolerant species yield above about 8.` });
      } else {
        out.push({ label: "Salinity class", value: "Not assigned", tone: "warn",
          hint: "A class was not assigned because the measurement is not on a saturation extract. Assigning one anyway would understate salinity by whatever the dilution factor happens to be — on a 1:5 extract that is a factor of several, in the direction that makes a saline soil look clean." });
      }

      out.push({ label: "Reference value", value: "No notified Indian limit for soil EC", tone: "warn",
        hint: "Soil salinity is assessed agronomically against crop tolerance. There is no CPCB or MoEFCC notified figure. Where a contamination question is being asked rather than a salinity one, the notified instrument is Schedule I of the Environment Protection (Management of Contaminated Sites) Rules, 2025 — `csite` in mod \"hw\"." });
    }

    return out;
  },
}];

export default ROUTINES;
