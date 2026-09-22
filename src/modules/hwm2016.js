/* =============================================================================
   Aliquot — src/modules/hwm2016.js
   Hazardous and Other Wastes (Management and Transboundary Movement) Rules,
   2016 — Schedule II classification panel and the total-to-extract screen.
   From `aliquot-hwm2016.jsx`.

   Converted to a DOM-free module. The pack shipped as five sections — the
   assessTrigger addition to src/lib/limits.js, the transcribed Schedules
   (src/data/limits/hwm2016.js), the routines, a registry patch and a defect
   report on the existing `leach` routine. They are FLATTENED here: every
   helper and every data table is declared locally, nothing is imported,
   because the build compiles each module into its own IIFE and a local
   duplicate across modules is correct and safe. The registry patch and the
   `leach` defect report are bookkeeping, not calculation, and are not carried
   into this module.

   Every `ref:` string is carried across CHARACTER FOR CHARACTER, and every
   Schedule II figure exactly as transcribed. Nothing here is interpolated.

   Routines
     hwcls   Classify a waste against rule 3(1)(17) — Schedule I listing,
             Schedule II Class A leachable triggers (TCLP and STLC),
             Class B TTLC triggers, and the thirteen Class C characteristics,
             with the rule 2 scope check ahead of all of it.
     hwls    Decide whether an extraction is worth running at all: at the
             method's liquid-to-solid ratio, a total concentration below
             L/S × trigger cannot produce an extract at the trigger even if
             the constituent leaches completely.

   What a flat "value > limit" loop over Schedule II gets wrong, all of it
   encoded here:
     · The operator is ≥. A result exactly on the figure classifies.
     · Class A is mg/L in the EXTRACT; Class B is mg/kg in the WASTE.
     · Three extractions, not one — TCLP for A1–A61, WET/STLC for A62–A79,
       distilled water for A10, A11 and A64. A value produced by the wrong
       extraction reads "Not graded", never a verdict.
     · Total chromium satisfies neither A4 nor A64 on its own.
     · Schedule I listing makes a waste hazardous whatever Schedule II says.
     · Below every trigger tested is not a finding of non-hazardous.

   A classification aid, not a validated method — ISO/IEC 17025 §7.11.2
   applies. Personal project. No CPCB or MoEFCC endorsement is claimed or
   implied.
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

/* ---------- trigger engine ------------------------------------------------ */
/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS IS NOT assessRow()

   assessRow() — the compliance engine used for IS 10500, Schedule VI, NAAQS
   and the noise Schedule — grades against a COMPLIANCE limit: value ≤ limit
   is a pass.

   Schedule II of the Hazardous and Other Wastes (Management and
   Transboundary Movement) Rules, 2016 does not work that way. Rule
   3(1)(17)(ii) defines hazardous waste as waste having "EQUAL TO OR MORE
   THAN the concentration limits specified for the constituents in class A
   and class B". The figure is a CLASSIFICATION TRIGGER, and the operator is
   ≥, not >.

   Two consequences that assessRow() would get wrong:

     · A result exactly ON the figure. assessRow() returns "acc" for
       c <= lim. Under Schedule II, c === lim classifies the waste as
       hazardous. Nickel at exactly 20.0 mg/L in a WET extract is a
       hazardous waste, not a borderline pass.

     · The meaning of "below". Under a compliance standard, below the limit
       on every determinand tested is a pass. Under Schedule II it is not a
       finding at all: Schedule I, the constituents not analysed, and every
       Class C characteristic remain live. Level "below" is therefore named
       "below", not "acc", and the app never prints it as a pass.

   FLAG_BAND is this app's own flag, not a figure from the Rules. It exists
   only to force a decision rule to be stated under ISO/IEC 17025 §7.8.6
   where a result sits close enough to a trigger that measurement
   uncertainty could carry it across.
   ══════════════════════════════════════════════════════════════════════════ */

const FLAG_BAND = 0.9;

/* Grade one value against one Schedule II trigger row.
   Returns { level, ratio, limitShown, why } — never throws.
     "hw"     at or above the trigger — the waste is hazardous on this row
     "below"  below the trigger — NOT a pass, and not a finding
     "na"     no figure prescribed for this constituent                     */
const assessTrigger = (c, r) => {
  if (!r) return { level: "na", why: "No Schedule II row for this constituent" };
  if (!isFinite(c)) return { level: "na", why: "No value entered" };
  if (r.lim === undefined || r.lim === null)
    return { level: "na", why: "No concentration limit prescribed in Schedule II for this constituent — silence is not a pass" };

  const ratio = r.lim > 0 ? c / r.lim : NaN;

  if (c >= r.lim)
    return {
      level: "hw", limitShown: r.lim, ratio,
      why: c === r.lim
        ? "EQUAL TO the Schedule II figure — rule 3(1)(17)(ii) reads 'equal to or more than', so the trigger fires on equality"
        : "Above the Schedule II figure",
    };

  return {
    level: "below", limitShown: r.lim, ratio,
    why: "Below the Schedule II figure — not a trigger on this constituent, and not a finding that the waste is non-hazardous",
  };
};

/* Result-row tone for a trigger verdict. "below" gets no tone: it is not a
   pass and must not be coloured like one. */
const triggerTone = (level) => (level === "hw" ? "warn" : undefined);

/* Row lookup by key within a set. */
const rowOf = (rows, k) => rows.find((r) => r.k === k);

/* Count rows in a set — for hint strings that would otherwise hard-code the
   count and go stale silently. */
const countRows = (rows) => rows.length;

/* ---------- the Rules ----------------------------------------------------- */
/* ══════════════════════════════════════════════════════════════════════════
   HAZARDOUS AND OTHER WASTES (MANAGEMENT AND TRANSBOUNDARY MOVEMENT)
   RULES, 2016 — G.S.R. 395(E), MoEFCC, 4 April 2016.
   Published in the Gazette of India, Extraordinary, Part II, Section 3,
   Sub-section (i), No. 244, New Delhi, Monday, 4 April 2016.
   Made under sections 6, 8 and 25 of the Environment (Protection) Act, 1986
   (29 of 1986), superseding the Hazardous Wastes (Management, Handling and
   Transboundary Movement) Rules, 2008.

   Transcribed verbatim from the English text of Schedule I, Schedule II
   (Class A, Class B, Class C and the Notes) and rules 2 and 3(1)(17).

   ── THE DEFINITION THIS FILE SERVES ─────────────────────────────────────
   Rule 3(1)(17): "hazardous waste" means any waste which by reason of
   characteristics such as physical, chemical, biological, reactive, toxic,
   flammable, explosive or corrosive, causes danger or is likely to cause
   danger to health or environment, whether alone or in contact with other
   wastes or substances, and shall include —
     (i)   waste specified under column (3) of Schedule I;
     (ii)  waste having EQUAL TO OR MORE THAN the concentration limits
           specified for the constituents in class A and class B of
           Schedule II or any of the characteristics as specified in
           class C of Schedule II; and
     (iii) wastes specified in Part A of Schedule III in respect of import
           or export of such wastes or the wastes not specified in Part A
           but exhibit hazardous characteristics specified in Part C of
           Schedule III.

   ── THE COMPARISON OPERATOR IS ≥, NOT > ─────────────────────────────────
   "equal to or more than the concentration limits". A result sitting
   EXACTLY on a Schedule II figure classifies the waste as hazardous. This
   is the opposite convention to every discharge and ambient standard in
   this app, where value ≤ limit is a pass. Schedule II limits are
   CLASSIFICATION TRIGGERS, not compliance limits, and are graded by
   assessTrigger() — never by assessRow().

   ── UNITS ───────────────────────────────────────────────────────────────
   Class A  mg/L IN THE LEACHATE OR EXTRACT. Not in the waste. A total
            metals result on the solid, in mg/kg, is not comparable to a
            Class A figure and must never be entered against one.
   Class B  mg/kg IN THE WASTE (total). Different basis to Class A.

   ── VERIFY ──────────────────────────────────────────────────────────────
   This is the 2016 principal text as published. These Rules have been
   amended since (amendments have been notified in 2016, 2017, 2018, 2019,
   2022 and 2023, and Schedule III in particular has been reworked). The
   amendments seen have touched import/export Schedules and the Forms
   rather than Schedule II, but that has NOT been confirmed here.
   CONFIRM the currently notified text of Schedules I and II against the
   MoEFCC e-Gazette and the CPCB compilation before using any figure in a
   classification report or a test report issued under ISO/IEC 17025.
   Nothing below is interpolated.
   ══════════════════════════════════════════════════════════════════════════ */

/* Method strings, used on every row so the extraction that produced the
   number is never separated from the number. */
const M_TCLP =
  "Toxicity Characteristic Leaching Procedure (TCLP); USEPA Test Method 1311 for extraction of leachable constituents";
const M_STLC =
  "Soluble Threshold Limit Concentration (STLC); Waste Extraction Test (WET) procedure, 22 CCR Div. 4.5, Ch. 11, Appendix II";
const M_DW =
  "Extraction using DISTILLED WATER in place of the leaching media specified in the TCLP / STLC procedures";
const M_TTLC = "Total Threshold Limit Concentration (TTLC); total concentration in the waste";

/* ─────────────────────────────────────────────────────────────────────────
   SCHEDULE II, CLASS A — based on leachable concentration limits
   [Toxicity Characteristic Leaching Procedure (TCLP) or Soluble Threshold
   Limit Concentration (STLC)].   Column 3 = "Concentration in mg/l".

   Note (1): the testing method for A1 to A61 shall be based on TCLP and
             USEPA Test Method 1311 shall be used for extraction.
   Note (2): the testing method for A62 to A79 shall be based on STLC and
             the Waste Extraction Test (WET) procedure given in Appendix II
             of section 66261 of Title 22 of the California Code of
             Regulations shall be used.
   Note (3): in case of ammonia (A10), cyanide (A11) and chromium VI (A64),
             extractions shall be conducted using distilled water in place
             of the leaching media specified in the TCLP / STLC procedures.

   `sub` records which of the three extraction regimes governs the row, so
   a result produced by the wrong extraction can be caught rather than
   silently graded.
   ───────────────────────────────────────────────────────────────────────── */
const HW_CLASS_A = [
  { c: "A1",  k: "Arsenic",                                    lim: 5.0,    sub: "tclp" },
  { c: "A2",  k: "Barium",                                     lim: 100.0,  sub: "tclp" },
  { c: "A3",  k: "Cadmium",                                    lim: 1.0,    sub: "tclp" },
  { c: "A4",  k: "Chromium and/or Chromium (III) compounds",   lim: 5.0,    sub: "tclp",
    note: "Not the same row as A64 Chromium (VI), which carries its own 5.0 mg/L trigger under a different extraction. A total-Cr result satisfies neither row on its own" },
  { c: "A5",  k: "Lead",                                       lim: 5.0,    sub: "tclp" },
  { c: "A6",  k: "Manganese",                                  lim: 10.0,   sub: "tclp" },
  { c: "A7",  k: "Mercury",                                    lim: 0.2,    sub: "tclp" },
  { c: "A8",  k: "Selenium",                                   lim: 1.0,    sub: "tclp" },
  { c: "A9",  k: "Silver",                                     lim: 5.0,    sub: "tclp" },
  { c: "A10", k: "Ammonia",                                    lim: 50,     sub: "dw",
    note: "Printed as '50*' — the asterisk is Note (3), distilled-water extraction",
    ambiguous: "The Schedule prints 'Ammonia' with no reporting basis. It does not say as N or as NH₃. The two differ by a factor of 1.216 (17/14). VERIFY the intended basis before reporting a verdict on this row" },
  { c: "A11", k: "Cyanide",                                    lim: 20,     sub: "dw",
    note: "Printed as '20*' — the asterisk is Note (3), distilled-water extraction",
    ambiguous: "The Schedule prints 'Cyanide' with no qualifier. Total, free (WAD) and amenable cyanide are different determinands. VERIFY which is intended" },
  { c: "A12", k: "Nitrate (as nitrate-nitrogen)",              lim: 1000.0, sub: "tclp",
    note: "As N, NOT as NO₃. Divide an as-NO₃ result by 4.427 before comparing" },
  { c: "A13", k: "Sulphide (as H₂S)",                          lim: 5.0,    sub: "tclp" },
  { c: "A14", k: "1,1-Dichloroethylene",                       lim: 0.7,    sub: "tclp" },
  { c: "A15", k: "1,2-Dichloroethane",                         lim: 0.5,    sub: "tclp" },
  { c: "A16", k: "1,4-Dichlorobenzene",                        lim: 7.5,    sub: "tclp" },
  { c: "A17", k: "2,4,5-Trichlorophenol",                      lim: 400.0,  sub: "tclp" },
  { c: "A18", k: "2,4,6-Trichlorophenol",                      lim: 2.0,    sub: "tclp" },
  { c: "A19", k: "2,4-Dinitrotoluene",                         lim: 0.13,   sub: "tclp" },
  { c: "A20", k: "Benzene",                                    lim: 0.5,    sub: "tclp" },
  { c: "A21", k: "Benzo (a) Pyrene",                           lim: 0.001,  sub: "tclp",
    note: "0.001 mg/L = 1 µg/L. Check the decimal place before entering" },
  { c: "A22", k: "Bromodichloromethane",                       lim: 6.0,    sub: "tclp",
    note: "Printed 'Bromodicholromethane' in the Gazette — an obvious typographic error, corrected here to the IUPAC-recognised name. The value is transcribed as printed" },
  { c: "A23", k: "Bromoform",                                  lim: 10.0,   sub: "tclp" },
  { c: "A24", k: "Carbon tetrachloride",                       lim: 0.5,    sub: "tclp" },
  { c: "A25", k: "Chlorobenzene",                              lim: 100.0,  sub: "tclp" },
  { c: "A26", k: "Chloroform",                                 lim: 6.0,    sub: "tclp" },
  { c: "A27", k: "Cresol (ortho + meta + para)",               lim: 200.0,  sub: "tclp",
    sum: "ONE trigger covering the SUM of the three cresol isomers. Enter the sum" },
  { c: "A28", k: "Dibromochloromethane",                       lim: 10.0,   sub: "tclp" },
  { c: "A29", k: "Hexachlorobenzene",                          lim: 0.13,   sub: "tclp" },
  { c: "A30", k: "Hexachlorobutadiene",                        lim: 0.5,    sub: "tclp" },
  { c: "A31", k: "Hexachloroethane",                           lim: 3.0,    sub: "tclp" },
  { c: "A32", k: "Methyl ethyl ketone",                        lim: 200.0,  sub: "tclp" },
  { c: "A33", k: "Naphthalene",                                lim: 5.0,    sub: "tclp" },
  { c: "A34", k: "Nitrobenzene",                               lim: 2.0,    sub: "tclp" },
  { c: "A35", k: "Pentachlorophenol",                          lim: 100.0,  sub: "tclp" },
  { c: "A36", k: "Pyridine",                                   lim: 5.0,    sub: "tclp" },
  { c: "A37", k: "Tetrachloroethylene",                        lim: 0.7,    sub: "tclp" },
  { c: "A38", k: "Trichloroethylene",                          lim: 0.5,    sub: "tclp" },
  { c: "A39", k: "Vinyl chloride",                             lim: 0.2,    sub: "tclp" },
  { c: "A40", k: "2,4,5-TP (Silvex)",                          lim: 1.0,    sub: "tclp" },
  { c: "A41", k: "2,4-Dichlorophenoxyacetic acid",             lim: 10.0,   sub: "tclp" },
  { c: "A42", k: "Alachlor",                                   lim: 2.0,    sub: "tclp" },
  { c: "A43", k: "Alpha HCH",                                  lim: 0.001,  sub: "tclp",
    note: "HCH isomers carry SEPARATE triggers at A43, A45, A49 and A55 — do not sum them" },
  { c: "A44", k: "Atrazine",                                   lim: 0.2,    sub: "tclp" },
  { c: "A45", k: "Beta HCH",                                   lim: 0.004,  sub: "tclp",
    note: "HCH isomers carry SEPARATE triggers — do not sum them" },
  { c: "A46", k: "Butachlor",                                  lim: 12.5,   sub: "tclp" },
  { c: "A47", k: "Chlordane",                                  lim: 0.03,   sub: "tclp" },
  { c: "A48", k: "Chlorpyriphos",                              lim: 9.0,    sub: "tclp" },
  { c: "A49", k: "Delta HCH",                                  lim: 0.004,  sub: "tclp",
    note: "HCH isomers carry SEPARATE triggers — do not sum them" },
  { c: "A50", k: "Endosulfan (alpha + beta + sulphate)",       lim: 0.04,   sub: "tclp",
    sum: "ONE trigger covering the SUM of alpha, beta and endosulfan sulphate. Enter the sum" },
  { c: "A51", k: "Endrin",                                     lim: 0.02,   sub: "tclp" },
  { c: "A52", k: "Ethion",                                     lim: 0.3,    sub: "tclp" },
  { c: "A53", k: "Heptachlor (and its Epoxide)",               lim: 0.008,  sub: "tclp",
    sum: "ONE trigger covering heptachlor and heptachlor epoxide as printed. Enter the sum" },
  { c: "A54", k: "Isoproturon",                                lim: 0.9,    sub: "tclp" },
  { c: "A55", k: "Lindane",                                    lim: 0.4,    sub: "tclp",
    note: "Gamma HCH. Separate from A43, A45 and A49 — do not sum" },
  { c: "A56", k: "Malathion",                                  lim: 19,     sub: "tclp" },
  { c: "A57", k: "Methoxychlor",                               lim: 10,     sub: "tclp" },
  { c: "A58", k: "Methyl parathion",                           lim: 0.7,    sub: "tclp" },
  { c: "A59", k: "Monocrotophos",                              lim: 0.1,    sub: "tclp" },
  { c: "A60", k: "Phorate",                                    lim: 0.2,    sub: "tclp" },
  { c: "A61", k: "Toxaphene",                                  lim: 0.5,    sub: "tclp" },

  /* ── STLC / WET from here. Note (2). ────────────────────────────────── */
  { c: "A62", k: "Antimony",                                   lim: 15,     sub: "stlc" },
  { c: "A63", k: "Beryllium",                                  lim: 0.75,   sub: "stlc" },
  { c: "A64", k: "Chromium (VI)",                              lim: 5.0,    sub: "dw",
    note: "Note (3) names chromium VI for distilled-water extraction, but unlike A10 and A11 this row carries no asterisk in the printed table",
    ambiguous: "Asterisk present on A10 and A11, absent on A64, while Note (3) names all three. The Note governs here. VERIFY against the currently notified text" },
  { c: "A65", k: "Cobalt",                                     lim: 80.0,   sub: "stlc" },
  { c: "A66", k: "Copper",                                     lim: 25.0,   sub: "stlc" },
  { c: "A67", k: "Molybdenum",                                 lim: 350,    sub: "stlc" },
  { c: "A68", k: "Nickel",                                     lim: 20.0,   sub: "stlc" },
  { c: "A69", k: "Thallium",                                   lim: 7.0,    sub: "stlc" },
  { c: "A70", k: "Vanadium",                                   lim: 24.0,   sub: "stlc" },
  { c: "A71", k: "Zinc",                                       lim: 250,    sub: "stlc" },
  { c: "A72", k: "Fluoride",                                   lim: 180.0,  sub: "stlc" },
  { c: "A73", k: "Aldrin",                                     lim: 0.14,   sub: "stlc" },
  { c: "A74", k: "DDT, DDE and DDD",                           lim: 0.1,    sub: "stlc",
    sum: "ONE trigger printed against dichlorodiphenyltrichloroethane (DDT), dichlorodiphenyldichloroethylene (DDE) and dichlorodiphenyldichloroethane (DDD) together. Enter the sum",
    ambiguous: "The Schedule does not state whether isomers are included, unlike IS 10500 Table 5 which says 'o,p and p,p isomers of DDT, DDE and DDD'. VERIFY the intended scope" },
  { c: "A75", k: "Dieldrin",                                   lim: 0.8,    sub: "stlc" },
  { c: "A76", k: "Kepone",                                     lim: 2.1,    sub: "stlc" },
  { c: "A77", k: "Mirex",                                      lim: 2.1,    sub: "stlc" },
  { c: "A78", k: "Polychlorinated biphenyls",                  lim: 5.0,    sub: "stlc" },
  { c: "A79", k: "Dioxin (2,3,7,8-TCDD)",                      lim: 0.001,  sub: "stlc",
    note: "0.001 mg/L = 1 µg/L in the extract. Check the decimal place before entering" },
];

/* Convenience partitions — the form and the method note both need them. */
const HW_A_TCLP = HW_CLASS_A.filter((r) => r.sub === "tclp");
const HW_A_STLC = HW_CLASS_A.filter((r) => r.sub === "stlc");
const HW_A_DW   = HW_CLASS_A.filter((r) => r.sub === "dw");

/* ─────────────────────────────────────────────────────────────────────────
   SCHEDULE II, CLASS B — based on Total Threshold Limit Concentration
   (TTLC).   Column 3 = "Concentration in mg/kg".
   ───────────────────────────────────────────────────────────────────────── */
const HW_CLASS_B = [
  { c: "B1", k: "Asbestos", lim: 10000, sub: "ttlc",
    note: "Note (5): the specified concentration limits apply ONLY if the substances are in a friable, powdered or finely divided state" },
  { c: "B2", k: "Total Petroleum Hydrocarbons (TPH) (C5 – C36)", lim: 5000, sub: "ttlc",
    note: "Carbon range C5 to C36 as printed. A C10–C40 or C6–C40 window from a different method is not the same determinand" },
];

/* Every Schedule II concentration row, for the wrong-extraction check. */
const HW_ALL_CONC = [...HW_CLASS_A, ...HW_CLASS_B];

/* ─────────────────────────────────────────────────────────────────────────
   SCHEDULE II — the Notes, verbatim. Reproduced so the panel can print
   the one that governs a row rather than paraphrasing it.
   ───────────────────────────────────────────────────────────────────────── */
const HW_SCH2_NOTES = [
  "(1) The testing method for list of constituents at A1 to A61 in Class-A, shall be based on Toxicity Characteristic Leaching Procedure (TCLP) and for extraction of leachable constituents, USEPA Test Method 1311 shall be used.",
  "(2) The testing method for list of constituents at A62 to A79 in Class-A, shall be based on Soluble Threshold Limit Concentration (STLC) and Waste Extraction Test (WET) Procedure given in Appendix II of section 66261 of Title 22 of California Code regulation (CCR) shall be used.",
  "(3) In case of ammonia (A10), cyanide (A11) and chromium VI (A64), extractions shall be conducted using distilled water in place of the leaching media specified in the TCLP/STLC procedures.",
  "(4) A summary of above specified leaching/extraction procedures is included in manual for characterization and analysis of hazardous waste published by Central Pollution Control Board and in case the method is not covered in the said manual, suitable reference method may be adopted for the measurement.",
  "(5) In case of asbestos, the specified concentration limits apply only if the substances are in a friable, powdered or finely divided state.",
  "(6) The hazardous constituents to be analyzed in the waste shall be relevant to the nature of the industry and the materials used in the process.",
];

/* Note (2) cites "section 66261 of Title 22". 22 CCR §66261.x sits inside
   Division 4.5, Chapter 11, and the WET procedure is Appendix II to that
   chapter — so the modern citation is 22 CCR Div. 4.5, Ch. 11, App. II.
   Both point at the same text. Recorded because a report that quotes the
   Gazette wording and a report that quotes the CCR structure will look
   like they cite different things. */
const HW_WET_CITE_NOTE =
  "Schedule II Note (2) cites 'Appendix II of section 66261 of Title 22 of California Code regulation (CCR)'. Section 66261 is the section series within 22 CCR Division 4.5, Chapter 11, and the Waste Extraction Test is Appendix II to that Chapter. The two citations are the same text.";

/* Which Schedule II Note governs each extraction regime. */
const HW_SUB_NAME = { tclp: "TCLP, Note (1)", stlc: "STLC / WET, Note (2)", dw: "distilled water, Note (3)", ttlc: "TTLC, total in the waste" };

/* ─────────────────────────────────────────────────────────────────────────
   SCHEDULE II, CLASS C — based on hazardous characteristics.
   "Apart from the concentration limit given above, the substances or wastes
   shall be classified as hazardous waste if it exhibits any of the
   following characteristics due to the presence of any hazardous
   constituents."

   `kind` "measured"  the panel computes the verdict from a number
          "declared"  the panel records what the user declares; it cannot
                      compute it, and says so rather than assuming absence
   ───────────────────────────────────────────────────────────────────────── */
const HW_CLASS_C = [
  { c: "C1", k: "Flammable", kind: "measured",
    crit: "Flammable liquids, or mixture of liquids, or liquids containing solids in solution or suspension, which give off a flammable vapour at temperature LESS THAN 60 °C. Also: not a liquid and capable, under standard temperature and pressure, of causing fire through friction, absorption of moisture or spontaneous chemical changes and, when ignited, burns vigorously and persistently creating a hazard; an ignitable compressed gas; or an oxidizer.",
    method: "Flash point measured as per ASTM D 93-79 closed-cup test method, or an equivalent test method published by the Central Pollution Control Board" },
  { c: "C2", k: "Corrosive", kind: "measured",
    crit: "Aqueous and pH less than or equal to 2, or greater than or equal to 12.5; or a liquid corroding steel (SAE 1020) at a rate greater than 6.35 mm per year at a test temperature of 55 °C; or, if not aqueous or not liquid, the same two criteria applied after mixing with an equivalent weight of water.",
    method: "BIS 9040 C method for pH; NACE TM 01 69 Laboratory Corrosion Testing of Metals and EPA 1110A for corrosivity towards steel (SAE 1020)" },
  { c: "C3", k: "Reactive or explosive", kind: "declared",
    crit: "Normally unstable and readily undergoes violent change without detonating; reacts violently with water or forms potentially explosive mixtures with water; generates toxic gases, vapours or fumes on mixing with water in a quantity sufficient to present a danger; is a cyanide or sulphide bearing waste which at pH 2 to 12.5 can generate such gases; is capable of detonation or explosive reaction under a strong initiating source or heated under confinement; is readily capable of detonation or explosive decomposition at standard temperature and pressure; or is a forbidden explosive." },
  { c: "C4", k: "Toxic", kind: "measured",
    crit: "Concentration of the waste constituents listed in Class A and B equal to or more than the permissible limits prescribed therein; or acute oral LD50 less than 2,500 mg/kg; or acute dermal LD50 less than 4,300 mg/kg; or acute inhalation LC50 less than 10,000 ppm as a gas or vapour; or acute aquatic toxicity with 50 % mortality within 96 hours for zebra fish (Brachidanio rerio) at a concentration of 500 mg/L in dilution water; or shown through experience or a standard reference test method to pose a hazard because of carcinogenicity, mutagenecity, endocrine disruptivity, acute toxicity, chronic toxicity, bio-accumulative properties or persistence in the environment.",
    method: "Acute aquatic toxicity test conditions as specified in BIS test method 6582 – 2001" },
  { c: "C5", k: "Liable to spontaneous combustion", kind: "declared",
    crit: "Liable to spontaneous heating under normal conditions encountered in transport, or to heating up on contact with air, and being then liable to catch fire." },
  { c: "C6", k: "Emits flammable gases in contact with water", kind: "declared",
    crit: "By interaction with water, liable to become spontaneously flammable or to give off flammable gases in dangerous quantities." },
  { c: "C7", k: "Oxidizing", kind: "declared",
    crit: "While in themselves not necessarily combustible, may, generally by yielding oxygen, cause or contribute to the combustion of other materials." },
  { c: "C8", k: "Organic peroxides", kind: "declared",
    crit: "Organic substances or wastes which contain the bivalent O−O structure, which may undergo exothermic self-accelerating decomposition." },
  { c: "C9", k: "Poisons (acute)", kind: "declared",
    crit: "Liable either to cause death or serious injury or to harm human health if swallowed or inhaled or by skin contact." },
  { c: "C10", k: "Infectious substances", kind: "declared",
    crit: "Containing viable micro-organisms or their toxins which are known or suspected to cause disease in animals or humans." },
  { c: "C11", k: "Liberates toxic gases in contact with air or water", kind: "declared",
    crit: "By interaction with air or water, liable to give off toxic gases in dangerous quantities." },
  { c: "C12", k: "Eco-toxic", kind: "declared",
    crit: "If released, present or may present immediate or delayed adverse impacts to the environment by means of bioaccumulation or toxic effects upon biotic systems or both." },
  { c: "C13", k: "Yields another material after disposal", kind: "declared",
    crit: "Capable, by any means, after disposal, of yielding another material, e.g. leachate, which possesses any of the characteristics listed above." },
];

const HW_C_DECLARED = HW_CLASS_C.filter((r) => r.kind === "declared");

/* The two flammability thresholds in these Rules do not agree. Recorded so
   nobody reconciles them by picking one. */
const HW_FLASH_CONFLICT =
  "Schedule II Class C1 sets the flammable-liquid threshold at a flammable vapour 'at temperature less than 60 °C', measured by ASTM D 93-79 closed cup. Schedule III Part C, code H 3, sets it at 'not more than 60.5 °C, closed-cup test, or not more than 65.6 °C, open-cup test'. Class C governs domestic classification under rule 3(1)(17)(ii); Part C governs the Basel hazard characteristics for import and export under rule 3(1)(17)(iii). A result between 60 °C and 60.5 °C falls on opposite sides of the two. Do not reconcile them — state which limb of the definition is being applied.";

/* ─────────────────────────────────────────────────────────────────────────
   SCHEDULE II — the conjunctive constituent list.
   Printed between Class B and Class C: "Wastes which contain any of the
   constituents listed below shall be considered as hazardous, PROVIDED
   they exhibit the characteristics listed in Class-C of this Schedule."

   Presence alone is not enough and a Class C characteristic alone is not
   this rule. Both limbs must hold.
   ───────────────────────────────────────────────────────────────────────── */
const HW_CONJUNCTIVE = [
  "Acid Amides", "Acid anhydrides", "Amines", "Anthracene",
  "Aromatic compounds other than those listed in Class A",
  "Bromates, (hypo-bromites)", "Chlorates (hypo-chlorites)", "Carbonyls",
  "Ferro-silicate and alloys",
  "Halogen-containing compounds which produce acidic vapours on contact with humid air or water e.g. silicon tetrachloride, aluminum chloride, titanium tetrachloride",
  "Halogen-silanes", "Halogenated Aliphatic Compounds", "Hydrazine (s)",
  "Hydrides", "Inorganic Acids", "Inorganic Peroxides", "Inorganic Tin Compounds",
  "Iodates", "(Iso- and thio-) Cyanates", "Manganese-silicate", "Mercaptans",
  "Metal Carbonyls", "Metal hydrogen sulphates", "Nitrides", "Nitriles",
  "Organic azo and azooxy Compounds", "Organic Peroxides", "Organic Oxygen Compounds",
  "Organic Sulphur Compounds", "Organo-Tin Compounds",
  "Organo nitro- and nitroso compounds",
  "Oxides and hydroxides except those of hydrogen, carbon, silicon, iron, aluminum, titanium, manganese, magnesium, calcium",
  "Phenanthrene", "Phenolic Compounds",
  "Phosphate compounds except phosphates of aluminum, calcium and iron",
  "Salts of pre-acids", "Total Sulphur", "Tungsten Compounds",
  "Tellurium and tellurium compounds", "White and Red Phosphorus",
  "2-Acetylaminofluorene", "4-Aminodiphenyl", "Benzidine and its salts",
  "Bis (Chloromethyl) ether", "Methyl chloromethyl ether",
  "1,2-Dibromo-3-chloropropane", "3,3'-Dichlorobenzidine and its salts",
  "4-Dimethylaminoazobenzene", "4-Nitrobiphenyl", "Beta-Propiolactone",
];

/* ─────────────────────────────────────────────────────────────────────────
   SCHEDULE I — List of processes generating hazardous wastes.
   Column (2) process, column (3) hazardous waste. Rule 3(1)(17)(i).
   ───────────────────────────────────────────────────────────────────────── */
const HW_SCHEDULE_I = [
  { p: 1,  proc: "Petrochemical processes and pyrolytic operations", w: ["Furnace or reactor residue and debris", "Tarry residues and still bottoms from distillation", "Oily sludge emulsion", "Organic residues", "Residues from alkali wash of fuels", "Spent catalyst and molecular sieves", "Oil from wastewater treatment"] },
  { p: 2,  proc: "Crude oil and natural gas production", w: ["Drill cuttings excluding those from water based mud", "Sludge containing oil", "Drilling mud containing oil"] },
  { p: 3,  proc: "Cleaning, emptying and maintenance of petroleum oil storage tanks including ships", w: ["Cargo residue, washing water and sludge containing oil", "Cargo residue and sludge containing chemicals", "Sludge and filters contaminated with oil", "Ballast water containing oil from ships"] },
  { p: 4,  proc: "Petroleum refining or re-processing of used oil or recycling of waste oil", w: ["Oil sludge or emulsion", "Spent catalyst", "Slop oil", "Organic residue from processes", "Spent clay containing oil"] },
  { p: 5,  proc: "Industrial operations using mineral or synthetic oil as lubricant in hydraulic systems or other applications", w: ["Used or spent oil", "Wastes or residues containing oil", "Waste cutting oils"] },
  { p: 6,  proc: "Secondary production and/or industrial use of zinc", w: ["Sludge and filter press cake arising out of production of Zinc Sulphate and other Zinc Compounds", "Zinc fines or dust or ash or skimmings in dispersible form", "Other residues from processing of zinc ash or skimmings", "Flue gas dust and other particulates"] },
  { p: 7,  proc: "Primary production of zinc or lead or copper and other non-ferrous metals except aluminium", w: ["Flue gas dust from roasting", "Process residues", "Arsenic-bearing sludge", "Non-ferrous metal bearing sludge and residue", "Sludge from scrubbers"] },
  { p: 8,  proc: "Secondary production of copper", w: ["Spent electrolytic solutions", "Sludge and filter cakes", "Flue gas dust and other particulates"] },
  { p: 9,  proc: "Secondary production of lead", w: ["Lead bearing residues", "Lead ash or particulate from flue gas", "Acid from used batteries"] },
  { p: 10, proc: "Production and/or industrial use of cadmium and arsenic and their compounds", w: ["Residues containing cadmium and arsenic"] },
  { p: 11, proc: "Production of primary and secondary aluminium", w: ["Sludges from off-gas treatment", "Cathode residues including pot lining wastes", "Tar containing wastes", "Flue gas dust and other particulates", "Drosses and waste from treatment of salt sludge", "Used anode butts", "Vanadium sludge from alumina refineries"] },
  { p: 12, proc: "Metal surface treatment, such as etching, staining, polishing, galvanizing, cleaning, degreasing, plating, etc.", w: ["Acidic and alkaline residues", "Spent acid and alkali", "Spent bath and sludge containing sulphide, cyanide and toxic metals", "Sludge from bath containing organic solvents", "Phosphate sludge", "Sludge from staining bath", "Copper etching residues", "Plating metal sludge"] },
  { p: 13, proc: "Production of iron and steel including other ferrous alloys (electric furnace; steel rolling and finishing mills; coke oven and by products plant)", w: ["Spent pickling liquor", "Sludge from acid recovery unit", "Benzol acid sludge", "Decanter tank tar sludge", "Tar storage tank residue", "Residues from coke oven by product plant"] },
  { p: 14, proc: "Hardening of steel", w: ["Cyanide-, nitrate-, or nitrite-containing sludge", "Spent hardening salt"] },
  { p: 15, proc: "Production of asbestos or asbestos-containing materials", w: ["Asbestos-containing residues", "Discarded asbestos", "Dust or particulates from exhaust gas treatment"] },
  { p: 16, proc: "Production of caustic soda and chlorine", w: ["Mercury bearing sludge generated from mercury cell process", "Residue or sludges and filter cakes", "Brine sludge"] },
  { p: 17, proc: "Production of mineral acids", w: ["Process acidic residue, filter cake, dust", "Spent catalyst"] },
  { p: 18, proc: "Production of nitrogenous and complex fertilizers", w: ["Spent catalyst", "Carbon residue", "Sludge or residue containing arsenic", "Chromium sludge from water cooling tower"] },
  { p: 19, proc: "Production of phenol", w: ["Residue or sludge containing phenol", "Spent catalyst"] },
  { p: 20, proc: "Production and/or industrial use of solvents", w: ["Contaminated aromatic, aliphatic or napthenic solvents may or may not be fit for reuse", "Spent solvents", "Distillation residues", "Process Sludge"] },
  { p: 21, proc: "Production and/or industrial use of paints, pigments, lacquers, varnishes and inks", w: ["Process wastes, residues and sludges", "Spent solvent"] },
  { p: 22, proc: "Production of plastics", w: ["Spent catalysts", "Process residues"] },
  { p: 23, proc: "Production and/or industrial use of glues, organic cements, adhesive and resins", w: ["Wastes or residues (not made with vegetable or animal materials)", "Spent solvents"] },
  { p: 24, proc: "Production of canvas and textiles", w: ["Chemical residues"] },
  { p: 25, proc: "Industrial production and formulation of wood preservatives", w: ["Chemical residues", "Residues from wood alkali bath"] },
  { p: 26, proc: "Production or industrial use of synthetic dyes, dye-intermediates and pigments", w: ["Process waste sludge/residues containing acid, toxic metals, organic compounds", "Dust from air filtration system", "Spent acid", "Spent solvent", "Spent catalyst"] },
  { p: 27, proc: "Production of organic-silicone compound", w: ["Process residues"] },
  { p: 28, proc: "Production/formulation of drugs/pharmaceutical and health care product", w: ["Process Residue and wastes", "Spent catalyst", "Spent carbon", "Off specification products", "Date-expired products", "Spent solvents"] },
  { p: 29, proc: "Production and formulation of pesticides including stock-piles", w: ["Process wastes or residues", "Sludge containing residual pesticides", "Date-expired and off-specification pesticides", "Spent solvents", "Spent catalysts", "Spent acids"] },
  { p: 30, proc: "Leather tanneries", w: ["Chromium bearing residue and sludge"] },
  { p: 31, proc: "Electronic Industry", w: ["Process residue and wastes", "Spent etching chemicals and solvents"] },
  { p: 32, proc: "Pulp and Paper Industry", w: ["Spent chemicals", "Corrosive wastes arising from use of strong acid and bases", "Process sludge containing adsorbable organic halides (AOX)"] },
  { p: 33, proc: "Handling of hazardous chemicals and wastes", w: ["Empty barrels/containers/liners contaminated with hazardous chemicals/wastes", "Contaminated cotton rags or other cleaning materials"] },
  { p: 34, proc: "De-contamination of barrels/containers used for handling of hazardous wastes/chemicals", w: ["Chemical-containing residue arising from decontamination", "Sludge from treatment of waste water arising out of cleaning/disposal of barrels/containers"] },
  { p: 35, proc: "Purification and treatment of exhaust air/gases, water and waste water from the processes in this schedule and common industrial effluent treatment plants (CETPs)", w: ["Exhaust Air or Gas cleaning residue", "Spent ion exchange resin containing toxic metals", "Chemical sludge from waste water treatment", "Oil and grease skimming", "Chromium sludge from cooling water"] },
  { p: 36, proc: "Purification process for organic compounds/solvents", w: ["Any process or distillation residue", "Spent carbon or filter medium"] },
  { p: 37, proc: "Hazardous waste treatment processes, e.g. pre-processing, incineration and concentration", w: ["Sludge from wet scrubbers", "Ash from incinerator and flue gas cleaning residue", "Concentration or evaporation residues"] },
  { p: 38, proc: "Chemical processing of ores containing heavy metals such as chromium, manganese, nickel, cadmium etc.", w: ["Process residues", "Spent acid"] },
];

/* Schedule I footnote, verbatim. This is the door back to Schedule II. */
const HW_SCH1_FOOTNOTE =
  "The inclusion of wastes contained in this Schedule does not preclude the use of Schedule II to demonstrate that the waste is not hazardous. In case of dispute, the matter would be referred to the Technical Review Committee constituted by Ministry of Environment, Forest and Climate Change.";

/* Schedule I Note, verbatim. */
const HW_HVLE_NOTE =
  "The high volume low effect wastes such as fly ash, Phosphogypsum, red mud, jarosite, Slags from pyrometallurgical operations, mine tailings and ore beneficiation rejects are excluded from the category of hazardous wastes. Separate guidelines on the management of these wastes shall be issued by Central Pollution Control Board.";

const HW_HVLE = [
  "Fly ash", "Phosphogypsum", "Red mud", "Jarosite",
  "Slags from pyrometallurgical operations", "Mine tailings",
  "Ore beneficiation rejects",
];

/* Rule 2 — these Rules do not apply at all. Checked before anything else,
   because a Schedule II verdict on an excluded stream is meaningless. */
const HW_RULE2_EXCLUSIONS = [
  { k: "Waste-water or exhaust gas", law: "Covered by the Water (Prevention and Control of Pollution) Act, 1974 (6 of 1974) and the Air (Prevention and Control of Pollution) Act, 1981 (14 of 1981) and the rules made thereunder — rule 2(a)" },
  { k: "Waste from ship operations beyond 5 km of the baseline", law: "Covered by the Merchant Shipping Act, 1958 (44 of 1958) — rule 2(b)" },
  { k: "Radio-active waste", law: "Covered by the Atomic Energy Act, 1962 (33 of 1962) — rule 2(c)" },
  { k: "Bio-medical waste", law: "Covered by the Bio-Medical Wastes (Management and Handling) Rules, 1998 — rule 2(d). Now the Bio-Medical Waste Management Rules, 2016, as amended — VERIFY which instrument is in force" },
  { k: "Municipal solid waste", law: "Covered by the Municipal Solid Wastes (Management and Handling) Rules, 2000 — rule 2(e). Now the Solid Waste Management Rules, 2016, as amended — VERIFY which instrument is in force" },
];

/* Liquid-to-solid ratios of the two extractions. Used ONLY by the
   cannot-exceed screen, which is arithmetic on the extraction itself and
   not a regulatory test.
     TCLP, USEPA 1311: 100 g solid to 2 L of extraction fluid   → 20 L/kg
     WET, 22 CCR:      50 g sample to 500 mL extraction solution → 10 L/kg
   VERIFY both against the current method text before relying on a screen
   that says an extraction can be omitted. */
const HW_LS_RATIO = { tclp: 20, dw: 20, stlc: 10, ttlc: null };

/* Things Schedule II does NOT contain. Recorded so no future routine
   invents them and so the panel can say so when asked. */
const HW_ABSENT = [
  "A landfill waste-acceptance criterion — Schedule II decides whether a waste IS hazardous, not whether a TSDF may accept it. CPCB's TSDF criteria are a separate document and are not reproduced here",
  "A leachable limit for total petroleum hydrocarbons — TPH appears only as a TTLC in Class B at 5000 mg/kg",
  "A total (TTLC) limit for any metal — every metal in Schedule II is a leachable trigger. A total metals result in mg/kg does not engage Class A",
  "Any dilution or averaging rule. There is no provision for blending a waste below a Class A trigger",
  "A pass mark. A result below every trigger tested is not a finding that the waste is non-hazardous — Schedule I, the untested constituents and Class C all remain live",
];

/* ---------- option strings ------------------------------------------------ */

const SCOPE_IN  = "Within scope — none of the rule 2 exclusions applies";
const SCOPE_OPTS = [SCOPE_IN, ...HW_RULE2_EXCLUSIONS.map((e) => e.k)];

const SCH1_NO = "Not from a listed process, or not established";
const SCH1_OPTS = [SCH1_NO, ...HW_SCHEDULE_I.map((s) => `${s.p} — ${s.proc}`)];

const HVLE_NO = "Not one of these";
const HVLE_OPTS = [HVLE_NO, ...HW_HVLE];

const ST_AQ  = "Aqueous liquid";
const ST_NAQ = "Non-aqueous liquid";
const ST_SOL = "Solid or semi-solid";

const YNA = ["Not assessed", "No", "Yes"];
const FISH_OPTS = [
  "Not assessed",
  "Less than 50 % mortality at 500 mg/L in 96 h",
  "50 % or more mortality at 500 mg/L in 96 h",
];

const ASB_OPTS = [
  "Not applicable or not assessed",
  "Not friable, powdered or finely divided",
  "Friable, powdered or finely divided",
];

/* A table cell holding Y / yes / 1 / true, in any case, means the
   characteristic is exhibited. Anything else, including blank, means the
   user has not said it is — which the panel reports as NOT ASSESSED, never
   as absent. */
const isYes = (v) => /^(y|yes|1|true|t)$/i.test(String(v ?? "").trim());
const isNo  = (v) => /^(n|no|0|false|f)$/i.test(String(v ?? "").trim());

/* Common citation, carried on both routines character for character. */
const REF =
  "Hazardous and Other Wastes (Management and Transboundary Movement) Rules, 2016, " +
  "G.S.R. 395(E), Ministry of Environment, Forest and Climate Change, notified 4 April 2016, " +
  "Gazette of India Extraordinary, Part II, Section 3, Sub-section (i), No. 244. " +
  "Made under sections 6, 8 and 25 of the Environment (Protection) Act, 1986 (29 of 1986). " +
  "Definition applied: rule 3(1)(17), limbs (i) Schedule I column (3), (ii) Schedule II Class A and Class B " +
  "concentration limits and Class C characteristics, and (iii) Schedule III Part A for import or export. " +
  "Scope check: rule 2(a) to 2(e). " +
  "Schedule II Class A is in mg/L in the leachate or extract; Class B is in mg/kg in the waste. " +
  "Extraction per Schedule II Note (1) — Toxicity Characteristic Leaching Procedure with USEPA Test Method 1311 " +
  "for constituents A1 to A61; Note (2) — Soluble Threshold Limit Concentration by the Waste Extraction Test " +
  "procedure at Appendix II of section 66261 of Title 22 of the California Code of Regulations " +
  "(22 CCR Division 4.5, Chapter 11, Appendix II) for constituents A62 to A79; and Note (3) — distilled water " +
  "in place of the leaching media for ammonia (A10), cyanide (A11) and chromium VI (A64). " +
  "Note (4) refers to the CPCB manual for characterization and analysis of hazardous waste for a summary of " +
  "those procedures. Note (5) limits the asbestos figure to a friable, powdered or finely divided state. " +
  "Note (6) requires the constituents analysed to be relevant to the nature of the industry and the materials " +
  "used in the process. Class C1 flash point by ASTM D 93-79 closed cup; Class C2 pH by BIS 9040 C and steel " +
  "SAE 1020 corrosion by NACE TM 01 69 and EPA 1110A; Class C4 acute aquatic toxicity by BIS 6582 : 2001. " +
  "THE OPERATOR IS ≥ — rule 3(1)(17)(ii) reads 'equal to or more than', so a result exactly on a Schedule II " +
  "figure classifies the waste as hazardous. " +
  "VERIFY: transcribed from the 2016 principal text as published. These Rules have been amended since. " +
  "Confirm the currently notified text of Schedules I and II against the MoEFCC e-Gazette and the CPCB " +
  "compilation before using any figure in a classification or test report issued under ISO/IEC 17025.";

/* ---------- the routines -------------------------------------------------- */

export const ROUTINES = [
{
  id: "hwcls", mod: "hw", tier: "advanced",
  name: "HW Classification — Schedule II",
  sub: "Is this a hazardous waste under rule 3(1)(17)? Schedule I listing, Class A leachable triggers, Class B TTLC, Class C characteristics",
  formula:
    "Hazardous if listed in Schedule I column (3), OR if any Class A or Class B constituent is ≥ its Schedule II concentration limit, OR if any Class C characteristic is exhibited",
  ref: REF,

  inputs: [
    S("scope", "Scope of these Rules — rule 2", SCOPE_OPTS, SCOPE_IN),
    S("sch1", "Schedule I process the waste arises from — rule 3(1)(17)(i)", SCH1_OPTS, SCH1_NO),
    S("hvle", "High volume low effect waste — Note under Schedule I", HVLE_OPTS, HVLE_NO),
    S("state", "Physical state of the waste", [ST_SOL, ST_AQ, ST_NAQ], ST_SOL),

    { id: "tclp", type: "table",
      label: "Class A, A1 to A61 — TCLP extract, mg/L",
      hint: "USEPA Method 1311 extract, mg/L IN THE LEACHATE. A total-metals result on the solid in mg/kg is a different determinand and must not be entered here. Cresol, endosulfan and heptachlor rows are SUMS; the four HCH isomers are separate and must not be summed. Nitrate is as N, not as NO₃.",
      rows: HW_A_TCLP.map((r) => ({ k: r.k, unit: "mg/L", std: r.lim })) },

    { id: "dw", type: "table",
      label: "Class A, distilled-water extraction — Note (3), mg/L",
      hint: "Ammonia, cyanide and chromium VI are extracted with DISTILLED WATER in place of the TCLP or STLC leaching media. A result from a citrate-buffer or acetic-acid extraction does not belong here.",
      rows: HW_A_DW.map((r) => ({ k: r.k, unit: "mg/L", std: r.lim })) },

    { id: "stlc", type: "table",
      label: "Class A, A62 to A79 — STLC / WET extract, mg/L",
      hint: "Waste Extraction Test per 22 CCR Div. 4.5, Ch. 11, App. II, mg/L in the extract. Chromium (VI) sits in the distilled-water table above, not here. DDT/DDE/DDD is one SUM row.",
      rows: HW_A_STLC.map((r) => ({ k: r.k, unit: "mg/L", std: r.lim })) },

    { id: "ttlc", type: "table",
      label: "Class B — TTLC, total in the waste, mg/kg",
      hint: "Total concentration in the waste, mg/kg. A different basis to every Class A row above.",
      rows: HW_CLASS_B.map((r) => ({ k: r.k, unit: "mg/kg", std: r.lim })) },

    S("asb", "Asbestos physical state — Note (5)", ASB_OPTS, ASB_OPTS[0]),

    N("flash", "C1 — flash point, ASTM D 93-79 closed cup", "°C", "",
      "Class C1 threshold is below 60 °C. Leave blank if not determined"),
    N("ph", "C2 — pH", "", "",
      "Aqueous waste as received; non-aqueous or non-liquid waste after mixing with an equivalent weight of water. BIS 9040 C. Valid range 0 to 14"),
    N("corr", "C2 — corrosion rate on steel SAE 1020 at 55 °C", "mm/year", "",
      "NACE TM 01 69 and EPA 1110A. Class C2 threshold is greater than 6.35 mm/year"),
    N("ldo", "C4 — acute oral LD50", "mg/kg", "", "Class C4 threshold is less than 2 500 mg/kg"),
    N("ldd", "C4 — acute dermal LD50", "mg/kg", "", "Class C4 threshold is less than 4 300 mg/kg"),
    N("lci", "C4 — acute inhalation LC50", "ppm", "", "As a gas or vapour. Class C4 threshold is less than 10 000 ppm"),
    S("fish", "C4 — acute aquatic toxicity, zebra fish, BIS 6582 : 2001", FISH_OPTS, FISH_OPTS[0]),

    { id: "cq", type: "table",
      label: "Class C characteristics that cannot be computed — enter Y or N",
      hint: "Y where the characteristic is exhibited, N where it has been assessed and is not. A blank row is reported as NOT ASSESSED, never as absent.",
      rows: HW_C_DECLARED.map((r) => ({ k: `${r.c} — ${r.k}`, unit: "", std: "Y / N" })) },

    S("conj", "Constituent from the Schedule II list printed after Class B present?", YNA, YNA[0]),
  ],

  run: (v) => {
    const out = [], notes = [], triggers = [];

    /* ── rule 2 scope, before anything else ──────────────────────────── */
    if (v.scope && v.scope !== SCOPE_IN) {
      const ex = HW_RULE2_EXCLUSIONS.find((e) => e.k === v.scope);
      return [
        { label: "Scope — rule 2", value: "These Rules do not apply to this stream", tone: "warn",
          hint: ex ? ex.law : "" },
        { label: "Consequence", value: "A Schedule II verdict on this stream would be meaningless",
          hint: "Rule 2 excludes the stream from the Rules altogether. Classify it under the instrument that does govern it, then come back only if the residue from treating it is itself a waste within scope." },
      ];
    }

    /* ── grade the four concentration tables ─────────────────────────── */
    /* Each table is bound to ONE extraction regime. A value entered against
       a constituent the Schedule governs by a DIFFERENT extraction is never
       graded against the figure — Schedule II Notes (1) to (3) make the
       extraction part of the criterion — and it is not dropped silently
       either: it comes back as "Not graded". */
    const graded = [];
    const ungraded = [];
    const bad = [];
    const push = (rows, store, cls, unit, method, regime) => {
      const t = store || {};
      const keys = new Set(rows.map((r) => r.k));
      for (const r of rows) {
        const raw = t[r.k];
        if (raw === undefined || raw === null || String(raw).trim() === "") continue;
        const c = num(raw);
        if (!isFinite(c)) { bad.push(r.k); continue; }
        if (c < 0) { bad.push(`${r.k} (negative)`); continue; }
        graded.push({ r, c, cls, unit, method, a: assessTrigger(c, r) });
      }
      /* Anything in this store that is not a row of this regime. */
      for (const k of Object.keys(t)) {
        if (keys.has(k)) continue;
        const raw = t[k];
        if (raw === undefined || raw === null || String(raw).trim() === "") continue;
        const r = rowOf(HW_ALL_CONC, k);
        ungraded.push({ k, raw, r, regime });
      }
    };
    push(HW_A_TCLP, v.tclp, "A", "mg/L", M_TCLP, "tclp");
    push(HW_A_DW,   v.dw,   "A", "mg/L", M_DW,   "dw");
    push(HW_A_STLC, v.stlc, "A", "mg/L", M_STLC, "stlc");
    push(HW_CLASS_B, v.ttlc, "B", "mg/kg", M_TTLC, "ttlc");

    if (bad.length)
      return [{ label: "Input", tone: "warn",
        value: `Non-numeric or negative value in: ${bad.join(", ")}`,
        hint: "Enter a number, or leave the row blank. A blank row is reported as not analysed." }];

    /* ── Class C, measured limbs ─────────────────────────────────────── */
    /* `addressed` holds the Class C codes actually looked at, so the
       coverage line counts what was assessed rather than 13 minus the
       blanks in one table. A measured limb left empty is not addressed. */
    const cHits = [], cRows = [], addressed = new Set();
    const flash = num(v.flash), pH = num(v.ph), corr = num(v.corr);
    const ldo = num(v.ldo), ldd = num(v.ldd), lci = num(v.lci);

    if (isFinite(flash)) {
      addressed.add("C1");
      const hit = flash < 60;
      cRows.push({ label: "C1 — flash point", value: fmt(flash), unit: "°C",
        tone: hit ? "warn" : undefined,
        hint: hit ? "Below 60 °C — Class C1 flammable. ASTM D 93-79 closed cup"
                  : "At or above 60 °C — the Class C1 liquid limb is not engaged. The friction, compressed-gas and oxidiser limbs of C1 are separate and are not assessed from a flash point" });
      if (hit) cHits.push("C1 flammable — flash point below 60 °C");
      if (flash >= 60 && flash <= 65.6)
        notes.push({ label: "Flash point falls between the two thresholds in these Rules", tone: "warn",
          value: `${fmt(flash)} °C`, hint: HW_FLASH_CONFLICT });
    }

    if (isFinite(pH)) {
      if (pH < 0 || pH > 14)
        return [{ label: "Input", value: `pH ${fmt(pH)} is outside 0 to 14`, tone: "warn",
          hint: "Check the entry. A pH outside the scale is not gradeable." }];
      addressed.add("C2");
      const hit = pH <= 2 || pH >= 12.5;
      cRows.push({ label: "C2 — pH", value: fmt(pH, 3), unit: "",
        tone: hit ? "warn" : undefined,
        hint: `${hit ? "At or beyond the Class C2 bound" : "Inside the 2 to 12.5 band"} — corrosive if pH ≤ 2 or pH ≥ 12.5. ${
          v.state === ST_AQ ? "Applied to the aqueous waste as received"
            : "The waste is not an aqueous liquid, so the criterion applies to the liquid produced on mixing with an equivalent weight of water — confirm the entered pH was measured that way"}`});
      if (hit) cHits.push(`C2 corrosive — pH ${fmt(pH, 3)}`);
    }

    if (isFinite(corr)) {
      addressed.add("C2");
      const hit = corr > 6.35;
      cRows.push({ label: "C2 — steel SAE 1020 corrosion rate", value: fmt(corr), unit: "mm/year",
        tone: hit ? "warn" : undefined,
        hint: `${hit ? "Greater than" : "Not greater than"} 6.35 mm/year at 55 °C — NACE TM 01 69 and EPA 1110A` });
      if (hit) cHits.push(`C2 corrosive — ${fmt(corr)} mm/year on steel`);
    }

    const tox = [
      [ldo, 2500, "mg/kg", "acute oral LD50"],
      [ldd, 4300, "mg/kg", "acute dermal LD50"],
      [lci, 10000, "ppm",  "acute inhalation LC50"],
    ];
    for (const [val, thr, unit, name] of tox) {
      if (!isFinite(val)) continue;
      addressed.add("C4");
      if (val <= 0)
        return [{ label: "Input", value: `${name} must be greater than zero`, tone: "warn" }];
      const hit = val < thr;
      cRows.push({ label: `C4 — ${name}`, value: fmt(val), unit,
        tone: hit ? "warn" : undefined,
        hint: `${hit ? "Below" : "At or above"} the Class C4 threshold of ${thr} ${unit}` });
      if (hit) cHits.push(`C4 toxic — ${name} ${fmt(val)} ${unit}, below ${thr}`);
    }

    if (v.fish && v.fish !== FISH_OPTS[0]) addressed.add("C4");
    if (v.fish === FISH_OPTS[2]) {
      cRows.push({ label: "C4 — acute aquatic toxicity", value: "50 % or more mortality in 96 h at 500 mg/L", tone: "warn",
        hint: "Zebra fish (Brachidanio rerio), BIS 6582 : 2001 — Class C4 engaged" });
      cHits.push("C4 toxic — 96 h zebra fish acute aquatic toxicity");
    } else if (v.fish === FISH_OPTS[1]) {
      cRows.push({ label: "C4 — acute aquatic toxicity", value: "Below 50 % mortality in 96 h at 500 mg/L",
        hint: "Zebra fish (Brachidanio rerio), BIS 6582 : 2001 — this limb of Class C4 is not engaged" });
    }

    /* ── Class C, declared limbs ─────────────────────────────────────── */
    const cq = v.cq || {};
    const notAssessed = [];
    for (const r of HW_C_DECLARED) {
      const key = `${r.c} — ${r.k}`;
      const raw = cq[key];
      if (isYes(raw)) {
        addressed.add(r.c);
        cRows.push({ label: key, value: "EXHIBITED", tone: "warn", hint: r.crit });
        cHits.push(`${r.c} ${r.k}`);
      } else if (isNo(raw)) {
        addressed.add(r.c);
        cRows.push({ label: key, value: "Assessed, not exhibited", hint: r.crit });
      } else if (raw !== undefined && String(raw).trim() !== "") {
        return [{ label: "Input", value: `"${raw}" in ${key} — enter Y or N`, tone: "warn" }];
      } else {
        notAssessed.push(r.c);
      }
    }

    /* ── nothing entered at all ──────────────────────────────────────── */
    const anyInput =
      graded.length || ungraded.length || cRows.length ||
      (v.sch1 && v.sch1 !== SCH1_NO) ||
      (v.hvle && v.hvle !== HVLE_NO) ||
      (v.conj && v.conj !== YNA[0]);
    if (!anyInput) return null;

    /* ── Schedule I, limb (i) ────────────────────────────────────────── */
    const s1 = v.sch1 && v.sch1 !== SCH1_NO
      ? HW_SCHEDULE_I.find((s) => `${s.p} — ${s.proc}` === v.sch1) : null;
    if (s1) {
      out.push({ label: "Schedule I — rule 3(1)(17)(i)", tone: "warn",
        value: `Process ${s1.p} — ${s1.proc}`,
        hint: `Column (3) lists: ${s1.w.join(" · ")}. If the waste in hand is one of these, it is hazardous waste by listing and Schedule II is not needed to establish that.` });
      triggers.push(`Schedule I process ${s1.p}`);
      out.push({ label: "Schedule I footnote", value: "Schedule II can still be used the other way",
        hint: `${HW_SCH1_FOOTNOTE} That is the ONLY role Schedule II has for a listed waste — to demonstrate it is NOT hazardous — and the route out is the Technical Review Committee, not a test report.` });
    }

    /* ── high volume low effect ──────────────────────────────────────── */
    if (v.hvle && v.hvle !== HVLE_NO) {
      out.push({ label: "High volume low effect waste", value: v.hvle, tone: "warn",
        hint: `${HW_HVLE_NOTE} This is a Note to Schedule I, not an exemption from the Act. Manage it under the separate CPCB guidelines and confirm no other rule set — fly ash under the Fly Ash Notification, for one — applies. VERIFY the current guideline.` });
    }

    /* ── concentration triggers ──────────────────────────────────────── */
    const hits = graded.filter((g) => g.a.level === "hw");

    /* Class B asbestos qualifier — Note (5). Resolved BEFORE any row is
       emitted, so a withdrawn trigger never leaves a warning standing above
       a "no trigger met" conclusion. */
    const asbHit = hits.find((g) => g.r.c === "B1");
    const asbWithdrawn = Boolean(asbHit) && v.asb === ASB_OPTS[1];
    const effHits = asbWithdrawn ? hits.filter((g) => g.r.c !== "B1") : hits;

    out.push({ label: "Constituents analysed", value: graded.length,
      hint: `${graded.filter((g) => g.cls === "A").length} Class A leachable · ${graded.filter((g) => g.cls === "B").length} Class B total · ${countRows(HW_CLASS_A) + countRows(HW_CLASS_B)} exist in Schedule II. Note (6): the constituents analysed shall be relevant to the nature of the industry and the materials used in the process — a short list is correct only if it was chosen that way` });

    /* Rank by proximity to the trigger so the closest sits at the top. */
    graded.sort((a, b) => (b.a.ratio || 0) - (a.a.ratio || 0));

    for (const g of graded) {
      const pct = isFinite(g.a.ratio) ? (g.a.ratio * 100).toFixed(0) : "—";
      const withdrawn = asbWithdrawn && g.r.c === "B1";
      out.push({
        label: `${g.r.c} ${g.r.k}`,
        value: fmt(g.c), unit: `${g.unit} — trigger ${g.a.limitShown} ${g.unit}`,
        tone: withdrawn ? undefined : triggerTone(g.a.level),
        hint: `${withdrawn ? "At or above the figure, but the trigger is WITHDRAWN by Note (5)"
          : g.a.level === "hw" ? "TRIGGER MET" : "Below the trigger"} — ${pct} % of the Schedule II figure. ${g.a.why}. ${g.method}${g.r.sum ? `. ${g.r.sum}` : ""}${g.r.note ? `. ${g.r.note}` : ""}`,
      });
      if (g.r.ambiguous)
        notes.push({ label: `${g.r.c} ${g.r.k} — reporting basis not stated in the Schedule`, tone: "warn",
          value: "Flagged", hint: g.r.ambiguous });
      if (g.a.level === "below" && isFinite(g.a.ratio) && g.a.ratio >= FLAG_BAND)
        notes.push({ label: `${g.r.c} ${g.r.k} — close to the trigger`, tone: "warn",
          value: `${(g.a.ratio * 100).toFixed(0)} % of ${g.a.limitShown} ${g.unit}`,
          hint: `The ${(FLAG_BAND * 100).toFixed(0)} % band is this app's flag, not a figure from the Rules. Measurement uncertainty could carry this across a threshold where the operator is ≥. State the decision rule under ISO/IEC 17025 §7.8.6 before reporting a verdict on this constituent.` });
    }

    /* Values entered under the wrong extraction — reported, never graded. */
    for (const u of ungraded)
      out.push({ label: u.r ? `${u.r.c} ${u.r.k}` : u.k, value: "Not graded", tone: "warn",
        unit: String(u.raw).trim(),
        hint: u.r
          ? `Entered in the ${HW_SUB_NAME[u.regime]} table, but Schedule II governs this constituent by ${HW_SUB_NAME[u.r.sub]}. The extraction is part of the criterion — a result from the other procedure is a different determinand and is not compared with the ${u.r.lim} figure. Re-run the correct extraction, or enter the value in the table that carries this row.`
          : `Not a Schedule II constituent in the ${HW_SUB_NAME[u.regime]} table. Nothing to grade it against — silence is not a pass.` });

    /* The Note (5) statement, after the rows it qualifies. */
    if (asbHit) {
      if (asbWithdrawn) {
        out.push({ label: "B1 Asbestos — Note (5)", value: "Trigger does NOT apply",
          hint: "The specified concentration limit applies only if the substance is in a friable, powdered or finely divided state. Declared as not friable, so the Class B trigger is withdrawn on this row. The waste may still be listed at Schedule I process 15." });
      } else if (v.asb === ASB_OPTS[0]) {
        out.push({ label: "B1 Asbestos — Note (5) not answered", value: "Trigger retained", tone: "warn",
          hint: "The 10 000 mg/kg figure applies only in a friable, powdered or finely divided state. The state was not declared, so the trigger is retained rather than assumed away." });
      }
    }

    /* Class C4(i): "the concentration of the waste constituents listed in
       Class A and B are equal to or more than the permissible limits
       prescribed therein". A Class A or B trigger IS a C4 finding — but only
       a trigger that still stands after Note (5). */
    if (effHits.length) {
      triggers.push(...effHits.map((g) => `${g.r.c} ${g.r.k}`));
      addressed.add("C4");
      out.push({ label: "C4 — toxic, first limb", value: "Engaged by the concentration trigger above", tone: "warn",
        hint: "Class C4(i) reads: the concentration of the waste constituents listed in Class A and B are equal to or more than the permissible limits prescribed therein. A Class A or Class B trigger is therefore also a Class C4 finding — the same fact, not a second ground." });
    }

    /* ── Class C rows ────────────────────────────────────────────────── */
    if (cRows.length) out.push(...cRows);
    if (cHits.length) triggers.push(...cHits);
    if (notAssessed.length)
      out.push({ label: "Class C characteristics not assessed", value: notAssessed.join(", "),
        hint: "Left blank. Not assessed is not the same as not exhibited — a classification that relies on their absence is not supported by this panel." });

    /* ── the conjunctive list ────────────────────────────────────────── */
    if (v.conj === YNA[2]) {
      const anyC = cHits.length > 0;
      out.push({ label: "Schedule II constituent list — the conjunctive rule",
        value: anyC ? "Both limbs met — hazardous" : "Constituent present, no Class C characteristic established",
        tone: anyC ? "warn" : undefined,
        hint: `"Wastes which contain any of the constituents listed below shall be considered as hazardous, provided they exhibit the characteristics listed in Class-C of this Schedule." Presence alone does not classify; a Class C characteristic must also be exhibited. The list runs to ${countRows(HW_CONJUNCTIVE)} entries — ${HW_CONJUNCTIVE.slice(0, 6).join(", ")}, and so on.` });
      if (anyC) triggers.push("Schedule II constituent list with a Class C characteristic");
    }

    out.push(...notes);

    /* ── outcome ─────────────────────────────────────────────────────── */
    const uniq = [...new Set(triggers)];
    if (uniq.length) {
      out.push({ label: "Classification under rule 3(1)(17)", value: "HAZARDOUS WASTE", tone: "warn",
        hint: `Established on ${uniq.length} ground${uniq.length > 1 ? "s" : ""}: ${uniq.join(" · ")}` });
      out.push({ label: "Consequence", value: "Rules 4, 6, 8, 17, 18 and 19 engage",
        hint: "Occupier's responsibilities under rule 4; authorisation in Form 1 from the State Pollution Control Board under rule 6; storage limited to ninety days under rule 8 unless extended; packaging and labelling per rule 17 and Form 8; transport per rule 18 with Form 9; and the seven-copy manifest in Form 10 under rule 19. Records in Form 3, annual return in Form 4 by 30 June." });
    } else {
      out.push({ label: "Classification under rule 3(1)(17)", value: "No trigger met among what was tested", tone: "warn",
        hint: "This is NOT a finding that the waste is non-hazardous. It says only that nothing tested reached a Schedule II figure and nothing declared engaged Class C. The untested constituents, the unassessed Class C characteristics and any Schedule I listing all remain live." });
    }

    /* ── what was not covered ────────────────────────────────────────── */
    out.push({ label: "Coverage of this panel", tone: "warn",
      value: `${graded.length} of ${countRows(HW_CLASS_A) + countRows(HW_CLASS_B)} Schedule II constituents · ${addressed.size} of ${countRows(HW_CLASS_C)} Class C characteristics addressed`,
      hint: "A constituent not entered is not a pass. Limb (iii) of rule 3(1)(17) — Schedule III Part A and Part C for import or export — is not covered by this panel at all." });
    out.push({ label: "Not in Schedule II", value: "See the method note", hint: HW_ABSENT.join(" · ") });
    out.push({ label: "Extraction procedures", value: "Three, not one",
      hint: `${HW_SCH2_NOTES[0]} ${HW_SCH2_NOTES[1]} ${HW_SCH2_NOTES[2]} ${HW_WET_CITE_NOTE}` });

    return out;
  },
},

/* ═══════════════════════════════════════════════════════════════════════ */
{
  id: "hwls", mod: "hw", tier: "advanced",
  name: "Total-to-Extract Screen",
  sub: "Whether a TCLP or WET extraction can reach the Schedule II trigger at all",
  formula:
    "C_extract,max = C_total ÷ (L/S)      where L/S = 20 L/kg for TCLP (100 g in 2 L) and 10 L/kg for WET (50 g in 500 mL). If C_extract,max < trigger, no extraction can reach the trigger",
  ref:
    REF +
    " THIS SCREEN IS ARITHMETIC ON THE EXTRACTION, NOT A REGULATORY TEST. It has no standing under these Rules. " +
    "It is valid in one direction only: a total concentration that could not produce a qualifying extract even at " +
    "100 % leaching cannot produce one at partial leaching. It can never be used the other way — a total above the " +
    "screen says nothing except that the extraction has to be run. " +
    "Liquid-to-solid ratios are those of the methods themselves: USEPA Method 1311 takes 100 g of solid to 2 L of " +
    "extraction fluid, and the Waste Extraction Test at 22 CCR Div. 4.5, Ch. 11, App. II takes a 50 g sample to " +
    "500 mL of extraction solution. VERIFY both against the current method text before relying on this screen to " +
    "omit an extraction.",

  inputs: [
    S("k", "Schedule II constituent", HW_CLASS_A.map((r) => `${r.c} — ${r.k}`), `${HW_CLASS_A[0].c} — ${HW_CLASS_A[0].k}`),
    N("tot", "Total concentration in the waste", "mg/kg", "", "Dry basis or as received — say which, and see the note below"),
    S("basis", "Basis of the total", ["Dry basis", "As received"], "Dry basis"),
    N("moist", "Moisture content", "% w/w", "", "Only needed to convert a dry-basis total to as received. Valid range 0 to 99.9"),
    N("ls", "Liquid-to-solid ratio, if overriding the method default", "L/kg", "",
      "Leave blank to use 20 L/kg for a TCLP or distilled-water row and 10 L/kg for a WET row"),
  ],

  run: (v) => {
    const row = HW_CLASS_A.find((r) => `${r.c} — ${r.k}` === v.k);
    if (!row) return null;

    const tot = num(v.tot);
    if (!isFinite(tot)) return null;
    if (tot < 0) return [{ label: "Input", value: "Total concentration cannot be negative", tone: "warn" }];

    const def = HW_LS_RATIO[row.sub];
    const lsIn = num(v.ls);
    if (isFinite(lsIn) && lsIn <= 0)
      return [{ label: "Input", value: "Liquid-to-solid ratio must be greater than zero", tone: "warn" }];
    const ls = isFinite(lsIn) ? lsIn : def;
    if (!isFinite(ls) || ls <= 0)
      return [{ label: "Input", value: "No liquid-to-solid ratio for this row", tone: "warn",
        hint: "Class B is a total concentration and is not extracted. This screen applies to Class A only." }];

    /* Basis conversion. TCLP and WET are run on the waste as received; a
       dry-basis total overstates the as-received concentration by
       100/(100 − M). Converting the wrong way is a silent error, so the
       conversion is applied only when both the basis and the moisture are
       given, and the panel says which number it used. */
    let asRec = tot, conv = null;
    const M = num(v.moist);
    if (v.basis === "Dry basis" && isFinite(M)) {
      if (M < 0 || M >= 100)
        return [{ label: "Input", value: `Moisture ${fmt(M)} % is outside 0 to 99.9 %`, tone: "warn" }];
      asRec = tot * (100 - M) / 100;
      conv = `${fmt(tot)} mg/kg dry × (100 − ${fmt(M)})/100 = ${fmt(asRec)} mg/kg as received`;
    }

    const maxExt = asRec / ls;
    const cannot = maxExt < row.lim;

    const out = [
      { label: "Constituent", value: `${row.c} ${row.k}`,
        hint: `Schedule II trigger ${row.lim} mg/L in the extract · ${
          row.sub === "tclp" ? M_TCLP : row.sub === "stlc" ? M_STLC : M_DW}` },
      { label: "Liquid-to-solid ratio applied", value: fmt(ls), unit: "L/kg",
        hint: isFinite(lsIn) ? "Entered by you, overriding the method default"
          : `Method default for a ${row.sub === "stlc" ? "WET" : "TCLP or distilled-water"} row` },
    ];
    if (conv) out.push({ label: "Basis conversion", value: fmt(asRec), unit: "mg/kg as received", hint: conv });
    else if (v.basis === "Dry basis")
      out.push({ label: "Basis", value: "Dry basis, not converted", tone: "warn",
        hint: "Moisture was not entered, so the dry-basis total is used unconverted. That is the conservative direction — it overstates the as-received concentration — but the screen is then less sharp than it could be." });

    out.push({ label: "Maximum possible extract concentration", value: fmt(maxExt), unit: "mg/L", tone: "key",
      hint: `${fmt(asRec)} mg/kg ÷ ${fmt(ls)} L/kg, assuming the constituent leaches completely` });
    out.push({ label: "Against the Schedule II trigger", value: `${((maxExt / row.lim) * 100).toFixed(0)} % of ${row.lim} mg/L`,
      tone: cannot ? "ok" : "warn",
      hint: cannot
        ? "The extraction cannot reach the trigger even at 100 % leaching, so on this constituent alone the extraction adds nothing"
        : "The extraction could reach the trigger. It has to be run — this screen says nothing about whether it will" });

    out.push({ label: "Standing of this screen", value: "None under these Rules", tone: "warn",
      hint: "Arithmetic on the method's own liquid-to-solid ratio. Valid only in the direction shown. It does not replace an extraction where one is required, it does not apply to Class B, and it says nothing about the other constituents or about Class C." });

    return out;
  },
}];

export default ROUTINES;
