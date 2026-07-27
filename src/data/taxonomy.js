/* ══════════════════════════════════════════════════════════════════════════
   ALIQUOT — CATEGORY × MATRIX TAXONOMY                src/data/taxonomy.js

   One row per registered routine. Two navigation axes plus a limits index.

     cat   WHAT KIND of calculation it is          (11 values, CATEGORIES)
     mx    WHICH MATRIX it applies to, array       (8 values,  MATRICES)
     lim   WHICH notified instrument it grades against, or null

   ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────
   THE CATEGORY AND MATRIX ASSIGNMENTS ARE AN EDITORIAL NAVIGATION AID.
   They are not derived from any standard and no standard prescribes them.
   Nothing in `cat` or `mx` may appear in a report as a classification of a
   method. The `lim` field IS load-bearing — it is the inventory of every
   place in the app where a value is graded against a notified figure, and
   it is the list to walk when an amendment lands.

   ── WHY NOTHING IS COUNTED BY HAND HERE ─────────────────────────────────
   Build-state open item 6: the `csite` hint string hard-codes "189
   substances" and will go stale silently. Every count in this file is
   computed from the registry at call time. If a routine is added or
   removed the numbers move with it, and auditTaxonomy() fails the build if
   a routine exists without a row or a row exists without a routine.

   Personal project. No CPCB, MoEFCC or BIS endorsement is claimed or
   implied. A calculation aid, not a validated method — ISO/IEC 17025
   §7.11.2 applies to every routine indexed here.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────
   AXIS 1 — CATEGORY. What kind of calculation.
   Order is the display order. Keep `qaqc` first: it is the axis a 17025
   lab enters the app through.
   ───────────────────────────────────────────────────────────────────────── */
export const CATEGORIES = [
  { id: "qaqc",       name: "QA / QC & Validation",   sub: "Detection limits, calibration, recovery, uncertainty, control charts, PT" },
  { id: "prep",       name: "Solutions & Standards",  sub: "Weighing, dilution, buffers — what you do before the instrument" },
  { id: "unit",       name: "Unit & Basis Conversion",sub: "Between units, and between reporting bases" },
  { id: "bench",      name: "Bench Determination",    sub: "A result from raw laboratory data — titre, mass, absorbance" },
  { id: "field",      name: "Field & Sampling",       sub: "Arithmetic on the sampling train, in the field or on the stack" },
  { id: "index",      name: "Index & Classification", sub: "A derived index or a class assigned by a published scheme" },
  { id: "compliance", name: "Compliance Assessment",  sub: "A value graded against a notified limit. See the limits index" },
  { id: "process",    name: "Process & Design Check", sub: "Loading, efficiency and capacity of a treatment or combustion unit" },
  { id: "model",      name: "Predictive Model",       sub: "A concentration or a rate predicted rather than measured" },
  { id: "risk",       name: "Exposure & Risk",        sub: "Dose, hazard quotient, incremental lifetime cancer risk" },
  { id: "admin",      name: "Regulatory Procedure",   sub: "Timelines, cost sharing and process steps under a rule" },
];

/* ─────────────────────────────────────────────────────────────────────────
   AXIS 2 — MATRIX. What you are measuring in.
   `none` is not a gap. A calibration curve, a dilution and a z-score are
   genuinely matrix-independent and forcing them into a medium would be a
   false statement about their scope.
   ───────────────────────────────────────────────────────────────────────── */
export const MATRICES = [
  { id: "none",   name: "Matrix independent", sub: "Applies whatever you are analysing" },
  { id: "water",  name: "Water & Wastewater", sub: "Drinking, surface, ground, effluent, treatment plant" },
  { id: "airamb", name: "Ambient Air",        sub: "NAAQMS, AQI, dispersion receptors" },
  { id: "airsrc", name: "Source Emission",    sub: "Stack, duct, incinerator" },
  { id: "soil",   name: "Soil & Sediment",    sub: "Including contaminated-site media" },
  { id: "solid",  name: "Solid Waste & Fuel", sub: "Hazardous waste, MSW, RDF, coal, biomass" },
  { id: "biota",  name: "Plant & Tissue",     sub: "Leaf, root, shoot — biomonitoring" },
  { id: "noise",  name: "Noise",              sub: "Leq, Ln, Ldn, propagation, dose" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const MATRIX_IDS   = MATRICES.map((m) => m.id);

/* ═════════════════════════════════════════════════════════════════════════
   THE ROWS

   Keyed on the routine `id` used in src/modules/*.js. `mod` is repeated
   here only so auditTaxonomy() can catch a routine that was moved between
   modules without its taxonomy row being revisited — it is checked, not
   trusted.

   `lim` names the instrument the routine grades against. null means the
   routine returns numbers and no verdict. A routine with a non-null `lim`
   is on the amendment-watch list; getLimitIndex() prints that list.
   ═════════════════════════════════════════════════════════════════════════ */
export const TAXONOMY = {

  /* ── QA / QC & Validation ─────────────────────────────────── mod qc ── */
  lodloq:   { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  mdl:      { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  calib:    { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  recovery: { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  precision:{ mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  uncert:   { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  control:  { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },
  zscore:   { mod: "qc", cat: "qaqc", mx: ["none"], lim: null },

  /* ── Unit Converters ────────────────────────────────────── mod conv ── */
  digest:   { mod: "conv", cat: "unit", mx: ["soil", "solid", "biota"], lim: null,
              note: "The back-calculation for every solid digest in the app. Tissue, soil and waste all route through it" },
  liqconv:  { mod: "conv", cat: "unit", mx: ["water"],  lim: null },
  solconv:  { mod: "conv", cat: "unit", mx: ["soil", "solid", "biota"], lim: null },

  /* ── Solutions & Standards ───────────────────────────────── mod sol ── */
  molppm:   { mod: "sol", cat: "prep",  mx: ["none"], lim: null },
  dilute:   { mod: "sol", cat: "prep",  mx: ["none"], lim: null },
  stock:    { mod: "sol", cat: "prep",  mx: ["none"], lim: null },
  beer:     { mod: "sol", cat: "bench", mx: ["none"], lim: null },
  buffer:   { mod: "sol", cat: "prep",  mx: ["none"], lim: null },

  /* ── Water & Wastewater ───────────────────────────────── mod water ── */
  titr:     { mod: "water", cat: "bench",      mx: ["water"], lim: null },
  cod:      { mod: "water", cat: "bench",      mx: ["water"], lim: null },
  grav:     { mod: "water", cat: "bench",      mx: ["water"], lim: null },
  bod:      { mod: "water", cat: "bench",      mx: ["water"], lim: null },
  hardness: { mod: "water", cat: "bench",      mx: ["water"], lim: null },
  tds:      { mod: "water", cat: "index",      mx: ["water"], lim: null,
              note: "An empirical EC correlation, not the IS 3025 (Part 16) gravimetric method. Do not report as TDS by IS 3025" },
  ionbal:   { mod: "water", cat: "qaqc",       mx: ["water"], lim: null,
              note: "Sits in the water module but is a data-quality check, not a determination. Reachable from the QA/QC category" },
  sar:      { mod: "water", cat: "index",      mx: ["water"], lim: null },
  do:       { mod: "water", cat: "bench",      mx: ["water"], lim: null },
  wqi:      { mod: "water", cat: "index",      mx: ["water"], lim: null,
              note: "Sub-index standards are taken from IS 10500 but the WQI itself is not a notified quantity" },
  is10500:  { mod: "water", cat: "compliance", mx: ["water"],
              lim: "IS 10500 : 2012 (Second Revision), BIS FAD 25 — Tables 1 to 5 and clauses 4.1 to 4.3" },

  /* ── Ambient Air ──────────────────────────────────────────── mod air ── */
  ambgas:   { mod: "air", cat: "bench",      mx: ["airamb"], lim: null },
  filterpm: { mod: "air", cat: "bench",      mx: ["airamb"], lim: null },
  gasconv:  { mod: "air", cat: "unit",       mx: ["airamb"], lim: null },
  naqi:     { mod: "air", cat: "index",      mx: ["airamb"], lim: null,
              note: "The AQI breakpoints are a CPCB publication, not a notified standard. An AQI is not a compliance verdict" },
  naaqs:    { mod: "air", cat: "compliance", mx: ["airamb"],
              lim: "NAAQS 2009, CPCB notification of 18 November 2009 — VERIFY: the app carries 8 of the 12 parameters and one of the two area columns" },

  /* ── Source Emission ────────────────────────────────────── mod stack ── */
  flue:      { mod: "stack", cat: "field", mx: ["airsrc"], lim: null },
  velocity:  { mod: "stack", cat: "field", mx: ["airsrc"], lim: null },
  isokinetic:{ mod: "stack", cat: "field", mx: ["airsrc"], lim: null },
  vstd:      { mod: "stack", cat: "field", mx: ["airsrc"], lim: null },
  traverse:  { mod: "stack", cat: "field", mx: ["airsrc"], lim: null },

  /* ── Dispersion Modelling ────────────────────────────────── mod disp ── */
  pasquill:  { mod: "disp", cat: "model", mx: ["airamb"], lim: null },
  plumerise: { mod: "disp", cat: "model", mx: ["airamb", "airsrc"], lim: null },
  gauss:     { mod: "disp", cat: "model", mx: ["airamb"], lim: null },
  maxglc:    { mod: "disp", cat: "model", mx: ["airamb"], lim: null },
  linesource:{ mod: "disp", cat: "model", mx: ["airamb"], lim: null },

  /* ── Waste & Contamination ─────────────────────────────────── mod hw ── */
  leach:   { mod: "hw", cat: "compliance", mx: ["solid", "water"],
             lim: "USEPA 40 CFR 261.24 toxicity characteristic; EU Council Decision 2003/33/EC. NOT an Indian instrument — for India use `hwcls`" },
  dre:     { mod: "hw", cat: "process",    mx: ["airsrc", "solid"],
             lim: "Hazardous and Other Wastes (Management and Transboundary Movement) Rules, 2016 — DRE ≥ 99.99 %, ≥ 99.9999 % for PCB and POPs" },
  teq:     { mod: "hw", cat: "index",      mx: ["airsrc"],
             lim: "0.1 ng TEQ/Nm³ at 11 % O₂ — VERIFY against the schedule in force. TEFs are WHO-2005, a scientific criterion, not a limit" },
  coproc:  { mod: "hw", cat: "process",    mx: ["solid"], lim: null },
  hp:      { mod: "hw", cat: "compliance", mx: ["solid"],
             lim: "Annex III, Directive 2008/98/EC as amended by (EU) 2017/997 and 1357/2014. EU only — no Indian counterpart" },
  efcf:    { mod: "hw", cat: "index",      mx: ["soil"], lim: null },
  pli:     { mod: "hw", cat: "index",      mx: ["soil"], lim: null },
  bcf:     { mod: "hw", cat: "index",      mx: ["soil", "biota"], lim: null,
             deprecated: "SUPERSEDED by `transfer` in mod phyto, which carries citations for BCF, BAF and TF, asks whether the soil figure is a total digest or an available extraction, and does not print a phytoextraction verdict without a shoot threshold. Retire `bcf` or point its ref at `transfer` — do not ship two routines answering the same question with different rigour" },
  eco:     { mod: "hw", cat: "index",      mx: ["soil"], lim: null },
  health:  { mod: "hw", cat: "risk",       mx: ["soil"], lim: null,
             note: "USEPA RAGS Part A. The exposure parameters are USEPA defaults; Indian body weight, intake rate and exposure frequency differ and must be entered, not accepted" },
  csite:   { mod: "hw", cat: "compliance", mx: ["soil", "water"],
             lim: "Environment Protection (Management of Contaminated Sites) Rules, 2025, S.O. 3401(E) of 24 July 2025, Schedule I — response and screening levels across seven media" },
  csfund:  { mod: "hw", cat: "admin",      mx: ["none"],
             lim: "Contaminated Sites Rules, 2025, rule 8(1) to 8(8) — cost sharing and recovery" },
  hwcls:   { mod: "hw", cat: "compliance", mx: ["solid"],
             lim: "Hazardous and Other Wastes Rules, 2016, rule 3(1)(17), Schedule I and Schedule II — Class A leachable, Class B TTLC, Class C characteristics" },
  hwls:    { mod: "hw", cat: "compliance", mx: ["solid"],
             lim: "Hazardous and Other Wastes Rules, 2016, Schedule II — whether an extraction can reach the trigger at all" },

  /* ── Fuel, Biomass & Waste ───────────────────────────────── mod fuel ── */
  cv:    { mod: "fuel", cat: "bench",   mx: ["solid"], lim: null },
  bomb:  { mod: "fuel", cat: "bench",   mx: ["solid"], lim: null },
  prox:  { mod: "fuel", cat: "unit",    mx: ["solid"], lim: null,
           note: "Primarily a basis conversion — ar, db, daf, dmmf. Indexed under Unit & Basis, not Bench" },
  air0:  { mod: "fuel", cat: "process", mx: ["solid", "airsrc"], lim: null },
  bio:   { mod: "fuel", cat: "process", mx: ["solid"], lim: null },
  lfg:   { mod: "fuel", cat: "model",   mx: ["solid"], lim: null },
  rdf:   { mod: "fuel", cat: "index",   mx: ["solid"], lim: null,
           note: "EN ISO 21640 : 2021 class code. A European classification, not an Indian notified limit" },

  /* ── STP / ETP / CETP & RO ─────────────────────────────── mod plant ── */
  treff:     { mod: "plant", cat: "compliance", mx: ["water"],
               lim: "Environment (Protection) Rules, 1986, Schedule VI Part A [rule 3A]. STP-specific limits are deliberately absent — enter the consent value" },
  plantcomp: { mod: "plant", cat: "compliance", mx: ["water"],
               lim: "Environment (Protection) Rules, 1986, Schedule VI Part A [rule 3A], four receiving media" },
  asp:       { mod: "plant", cat: "process", mx: ["water"], lim: null },
  clarifier: { mod: "plant", cat: "process", mx: ["water"], lim: null },
  aeration:  { mod: "plant", cat: "process", mx: ["water"], lim: null },
  nitden:    { mod: "plant", cat: "process", mx: ["water"], lim: null },
  chlor:     { mod: "plant", cat: "process", mx: ["water"], lim: null },
  sludge:    { mod: "plant", cat: "process", mx: ["water", "solid"], lim: null },
  sbrmbr:    { mod: "plant", cat: "process", mx: ["water"], lim: null },
  cetp:      { mod: "plant", cat: "process", mx: ["water"], lim: null },
  inhibit:   { mod: "plant", cat: "process", mx: ["water"], lim: null },
  ro:        { mod: "plant", cat: "process", mx: ["water"], lim: null },
  scale:     { mod: "plant", cat: "process", mx: ["water"], lim: null },

  /* ── Plant Biomonitoring ────────────────────────────────── mod phyto ── */
  pigment:  { mod: "phyto", cat: "bench", mx: ["biota"], lim: null },
  apti:     { mod: "phyto", cat: "index", mx: ["biota"], lim: null,
              note: "Two published banding schemes disagree. The routine will not pick one. Not an air quality measurement" },
  dust:     { mod: "phyto", cat: "bench", mx: ["biota"], lim: null },
  api:      { mod: "phyto", cat: "index", mx: ["biota"], lim: null,
              note: "Arithmetic only — the grade allotment table is not reproduced because it could not be confirmed" },
  transfer: { mod: "phyto", cat: "index", mx: ["biota", "soil"], lim: null },
  soilcl:   { mod: "phyto", cat: "bench", mx: ["soil"],  lim: null },
  soilpe:   { mod: "phyto", cat: "bench", mx: ["soil"],  lim: null },

  /* ── Noise ──────────────────────────────────────────────── mod noise ──
     VERIFY THE ROUTINE ID. The noise module is in the built project but not
     in any pack in the workspace, so this row is written from the parameter
     inventory, not from the source. If auditTaxonomy() reports it as an
     orphan, correct the key here to whatever src/modules/noise.js declares.
     ──────────────────────────────────────────────────────────────────── */
  noise: { mod: "noise", cat: "compliance", mx: ["noise"],
           lim: "Noise Pollution (Regulation and Control) Rules, 2000 — the Schedule, ambient standards by zone and by day/night. Firecracker limits are held as reference data and are deliberately not wired to a verdict",
           verify: "Routine id written from the parameter inventory, not read from source. Confirm against src/modules/noise.js" },
};

/* ═════════════════════════════════════════════════════════════════════════
   LOOKUPS AND FILTERS — pure functions, no DOM, callable from Node
   ═════════════════════════════════════════════════════════════════════════ */

export const taxOf = (id) => TAXONOMY[id] || null;
export const categoryOf = (id) => TAXONOMY[id]?.cat ?? null;
export const matricesOf = (id) => TAXONOMY[id]?.mx ?? [];
export const limitOf = (id) => TAXONOMY[id]?.lim ?? null;

export const catMeta = (cid) => CATEGORIES.find((c) => c.id === cid) || null;
export const mxMeta  = (mid) => MATRICES.find((m) => m.id === mid) || null;

/**
 * Filter a calculator registry.
 * @param {Array}  calcs  the registry from src/modules/index.js
 * @param {Object} f      { cat, mx, q, mod, includeDeprecated }
 *                        cat / mx / mod null or omitted = no filter on that axis
 *                        q = case-insensitive substring over name, sub, id
 * Deprecated routines are EXCLUDED by default so a superseded routine cannot
 * be reached by browsing. It stays reachable by its id for a saved link.
 */
export function filterCalcs(calcs, f = {}) {
  const q = (f.q || "").trim().toLowerCase();
  return calcs.filter((c) => {
    const t = TAXONOMY[c.id];
    if (!t) return false;                                  // untagged: not browsable
    if (t.deprecated && !f.includeDeprecated) return false;
    if (f.mod && c.mod !== f.mod) return false;
    if (f.cat && t.cat !== f.cat) return false;
    if (f.mx && !t.mx.includes(f.mx)) return false;
    if (q) {
      const hay = `${c.id} ${c.name || ""} ${c.sub || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Counts per category for the registry as it actually is. Never hard-coded. */
export function countByCategory(calcs) {
  const n = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0]));
  for (const c of calcs) {
    const t = TAXONOMY[c.id];
    if (t && !t.deprecated && n[t.cat] !== undefined) n[t.cat] += 1;
  }
  return n;
}

/** Counts per matrix. A routine serving three matrices counts in all three,
 *  so the sum EXCEEDS the routine count. That is correct, not a bug. */
export function countByMatrix(calcs) {
  const n = Object.fromEntries(MATRIX_IDS.map((m) => [m, 0]));
  for (const c of calcs) {
    const t = TAXONOMY[c.id];
    if (!t || t.deprecated) continue;
    for (const m of t.mx) if (n[m] !== undefined) n[m] += 1;
  }
  return n;
}

/**
 * THE AMENDMENT-WATCH LIST.
 * Every routine that grades a value against a notified instrument, with the
 * instrument named. This is the list to walk when a notification is amended,
 * and the list to show in the app's "what standards does this use" panel.
 */
export function getLimitIndex(calcs) {
  return calcs
    .filter((c) => TAXONOMY[c.id]?.lim)
    .map((c) => ({
      id: c.id, mod: c.mod, name: c.name,
      instrument: TAXONOMY[c.id].lim,
      verify: /VERIFY/i.test(TAXONOMY[c.id].lim) || Boolean(TAXONOMY[c.id].verify),
    }))
    .sort((a, b) => a.instrument.localeCompare(b.instrument));
}

/* ═════════════════════════════════════════════════════════════════════════
   AUDIT — call from npm run verify. Returns { ok, errors[], warnings[] }.
   Fails the build on any of:
     · a registered routine with no taxonomy row
     · a taxonomy row with no registered routine
     · a row whose `mod` disagrees with the registry
     · an unknown cat or mx value
     · an empty mx array
   Warns (does not fail) on a VERIFY marker or a deprecated routine still
   registered, because both are states a build can legitimately be in.
   ═════════════════════════════════════════════════════════════════════════ */
export function auditTaxonomy(calcs) {
  const errors = [], warnings = [];
  const registered = new Set(calcs.map((c) => c.id));

  for (const c of calcs) {
    const t = TAXONOMY[c.id];
    if (!t) { errors.push(`Routine "${c.id}" (mod ${c.mod}) is registered but has no taxonomy row`); continue; }
    if (t.mod !== c.mod)
      errors.push(`Routine "${c.id}" is registered under mod "${c.mod}" but its taxonomy row says "${t.mod}"`);
    if (!CATEGORY_IDS.includes(t.cat))
      errors.push(`Routine "${c.id}" has unknown category "${t.cat}"`);
    if (!Array.isArray(t.mx) || t.mx.length === 0)
      errors.push(`Routine "${c.id}" has no matrix. Use ["none"] for a matrix-independent routine — an empty array is a gap, "none" is a statement`);
    else for (const m of t.mx)
      if (!MATRIX_IDS.includes(m)) errors.push(`Routine "${c.id}" has unknown matrix "${m}"`);
    if (t.verify) warnings.push(`Routine "${c.id}": ${t.verify}`);
    if (t.deprecated) warnings.push(`Routine "${c.id}" is marked deprecated but is still registered: ${t.deprecated}`);
    if (t.lim && /VERIFY/i.test(t.lim)) warnings.push(`Routine "${c.id}" grades against an instrument carrying a VERIFY marker`);
  }

  for (const id of Object.keys(TAXONOMY))
    if (!registered.has(id))
      errors.push(`Taxonomy row "${id}" has no registered routine. Either the routine was removed and the row was not, or the id is wrong`);

  return { ok: errors.length === 0, errors, warnings,
           routines: registered.size, tagged: Object.keys(TAXONOMY).length };
}

export default {
  CATEGORIES, MATRICES, TAXONOMY,
  filterCalcs, countByCategory, countByMatrix, getLimitIndex, auditTaxonomy,
};
