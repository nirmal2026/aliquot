/* =============================================================================
   Aliquot — src/modules/plant.js
   MODULE — STP / ETP / CETP & RO

   Converted from the pack `claude/plant-module-stp-etp-cetp-ro.jsx` into a
   DOM-free ES module. The React UI is discarded; the reference data, the
   helpers and the 13 calculator routines are kept.

   No imports. Every helper and every reference table this file needs is
   declared LOCALLY — the build compiles each module into its own IIFE, so a
   local copy of `num`, `fmt`, `N`, `S` is correct and cannot collide with
   base.js.

   Every `ref:` string is carried across CHARACTER FOR CHARACTER. Every
   regulatory number is reproduced as printed in the pack — nothing is
   interpolated, rounded or "corrected".

   Method basis, in order of precedence:
     · Environment (Protection) Rules, 1986 — Schedule VI general standards
     · CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013 (MoUD)
     · IS 3025 series / APHA Standard Methods, 24th ed., for the determinands
     · Metcalf & Eddy, Wastewater Engineering, 5th ed., for process stoichiometry
     · ASTM D4189 (SDI) and ASTM D4516 (RO normalisation) for membrane plant

   Every routine states units at each step. Regulatory limits are reproduced,
   never interpolated; anything unconfirmed is marked VERIFY.
   A calculation aid, not a validated method — ISO/IEC 17025 §7.11.2 applies.
   Personal project. No CPCB endorsement is claimed or implied.

   DEFECTS FIXED IN THIS CONVERSION — see the report notes at each site:
     1. Unguarded reads of select values (`v.type.startsWith`, `v.alkali.
        startsWith`, `v.src.includes`, `v.mode.startsWith`, `v.target.includes`,
        `v.recv.split`, and the table look-ups `TREAT_PARAMS[v.param]`,
        `ASP_RANGE[v.proc]`, `CL_SOURCES[v.src]`, `DISCHARGE_SETS[v.recv]`).
        A partly filled form leaves a select undefined and the routine threw a
        TypeError. Every such read now goes through `sel()` / a guarded
        look-up, falling back to the select's own declared default.
     2. `num(x) ?? default` was dead code — num() returns NaN, never null, so
        the default never applied and NaN propagated into the result. Replaced
        by explicit isFinite tests (`dflt`, and `dpos` where zero would divide
        or is not a physically legitimate entry). Where zero IS a legitimate
        entry — primary TSS removal 0 %, operating DO 0 mg/L, residual
        alkalinity target 0, RAS ratio 0, k_d 0, temperature 0 °C — `dflt` is
        used so a deliberate zero survives.
     3. Refusal on an empty form: every routine returns null, or a row carrying
        tone "warn", rather than a number computed from nothing.
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

const parsePairs = (t) =>
  String(t || "").split(/\n/).map((l) => l.split(/[\s,;\t]+/).map(parseFloat))
    .filter((p) => p.length >= 2 && isFinite(p[0]) && isFinite(p[1]))
    .map((p) => ({ x: p[0], y: p[1] }));

/* DEFECT 2. `num(x) ?? d` never fired because num() returns NaN. These two do.
   dflt — a deliberate zero is kept.  dpos — zero is not a legitimate entry
   (it would divide by zero or describe an impossible plant), so fall back. */
const dflt = (x, d) => (isFinite(x) ? x : d);
const dpos = (x, d) => (isFinite(x) && x > 0 ? x : d);

/* DEFECT 1. A select left untouched arrives as undefined. Never read a
   property off it directly — resolve it against the declared default first. */
const sel = (x, d) => (typeof x === "string" && x.length ? x : d);

/* ---------- input builders ------------------------------------------------ */

const N = (id, label, unit, def, hint) => ({ id, label, unit, def, hint, type: "num" });
const S = (id, label, opts, def) => ({ id, label, opts, def, type: "sel" });

/* =============================================================================
   REFERENCE DATA — STP / ETP / CETP / RO module
   ============================================================================= */

/* -----------------------------------------------------------------------------
   General Standards for Discharge of Environmental Pollutants
   Environment (Protection) Rules, 1986 — Schedule VI, Part A: Effluents
   [see rule 3A]

   Columns: inland surface water · public sewers · land for irrigation ·
            marine coastal areas.
   All values mg/L unless the row says otherwise. null = "—" in the Schedule
   (no standard prescribed for that receiving medium). Strings are reproduced
   verbatim where the Schedule gives a band or a non-numeric criterion.

   VERIFY before any statutory use. Schedule VI has been amended repeatedly
   (G.S.R. 422(E) 1993 onward) and industry-specific standards in Schedule I
   OVERRIDE these general standards for a notified category of industry.
   Where a State Board consent condition is stricter, the consent governs.
   --------------------------------------------------------------------------- */
const DISCHARGE = [
  { k: "pH", unit: "", inland: "5.5 to 9.0", sewer: "5.5 to 9.0", land: "5.5 to 9.0", marine: "5.5 to 9.0" },
  { k: "Temperature", unit: "°C", inland: "not more than 5 °C above ambient", sewer: null, land: null, marine: "not more than 5 °C above ambient" },
  { k: "Suspended solids", unit: "mg/L", inland: 100, sewer: 600, land: 200, marine: 100 },
  { k: "BOD (3 d, 27 °C)", unit: "mg/L", inland: 30, sewer: 350, land: 100, marine: 100 },
  { k: "COD", unit: "mg/L", inland: 250, sewer: null, land: null, marine: 250 },
  { k: "Oil & grease", unit: "mg/L", inland: 10, sewer: 20, land: 10, marine: 20 },
  { k: "Total residual chlorine", unit: "mg/L", inland: 1.0, sewer: null, land: null, marine: 1.0 },
  { k: "Ammoniacal nitrogen (as N)", unit: "mg/L", inland: 50, sewer: 50, land: null, marine: 50 },
  { k: "Total Kjeldahl nitrogen (as N)", unit: "mg/L", inland: 100, sewer: null, land: null, marine: 100 },
  { k: "Free ammonia (as NH₃)", unit: "mg/L", inland: 5.0, sewer: null, land: null, marine: 5.0 },
  { k: "Nitrate nitrogen (as N)", unit: "mg/L", inland: 10, sewer: null, land: null, marine: 20 },
  { k: "Dissolved phosphates (as P)", unit: "mg/L", inland: 5.0, sewer: null, land: null, marine: null },
  { k: "Total dissolved solids (inorganic)", unit: "mg/L", inland: 2100, sewer: 2100, land: 2100, marine: null },
  { k: "Chloride (as Cl)", unit: "mg/L", inland: 1000, sewer: 1000, land: 600, marine: null },
  { k: "Sulphate (as SO₄)", unit: "mg/L", inland: 1000, sewer: 1000, land: 1000, marine: null },
  { k: "Sulphide (as S)", unit: "mg/L", inland: 2.0, sewer: null, land: null, marine: 5.0 },
  { k: "Fluoride (as F)", unit: "mg/L", inland: 2.0, sewer: 15, land: null, marine: 15 },
  { k: "Phenolic compounds (as C₆H₅OH)", unit: "mg/L", inland: 1.0, sewer: 5.0, land: null, marine: 5.0 },
  { k: "Cyanide (as CN)", unit: "mg/L", inland: 0.2, sewer: 2.0, land: 0.2, marine: 0.2 },
  { k: "Total chromium (as Cr)", unit: "mg/L", inland: 2.0, sewer: 2.0, land: null, marine: 2.0 },
  { k: "Hexavalent chromium (as Cr⁶⁺)", unit: "mg/L", inland: 0.1, sewer: 2.0, land: null, marine: 1.0 },
  { k: "Copper (as Cu)", unit: "mg/L", inland: 3.0, sewer: 3.0, land: null, marine: 3.0 },
  { k: "Zinc (as Zn)", unit: "mg/L", inland: 5.0, sewer: 15, land: null, marine: 15 },
  { k: "Lead (as Pb)", unit: "mg/L", inland: 0.1, sewer: 1.0, land: null, marine: 2.0 },
  { k: "Nickel (as Ni)", unit: "mg/L", inland: 3.0, sewer: 3.0, land: null, marine: 5.0 },
  { k: "Cadmium (as Cd)", unit: "mg/L", inland: 2.0, sewer: 1.0, land: null, marine: 2.0 },
  { k: "Arsenic (as As)", unit: "mg/L", inland: 0.2, sewer: 0.2, land: 0.2, marine: 0.2 },
  { k: "Mercury (as Hg)", unit: "mg/L", inland: 0.01, sewer: 0.01, land: null, marine: 0.01 },
  { k: "Selenium (as Se)", unit: "mg/L", inland: 0.05, sewer: 0.05, land: null, marine: 0.05 },
  { k: "Total iron (as Fe)", unit: "mg/L", inland: 3.0, sewer: 3.0, land: null, marine: 3.0 },
  { k: "Manganese (as Mn)", unit: "mg/L", inland: 2.0, sewer: 2.0, land: null, marine: 2.0 },
  { k: "Vanadium (as V)", unit: "mg/L", inland: 0.2, sewer: 0.2, land: null, marine: 0.2 },
  { k: "Boron (as B)", unit: "mg/L", inland: 2.0, sewer: 2.0, land: 2.0, marine: null },
  { k: "Percent sodium", unit: "%", inland: null, sewer: 60, land: 60, marine: null },
  { k: "Residual sodium carbonate", unit: "meq/L", inland: null, sewer: null, land: 5.0, marine: null },
];

const DISCHARGE_SETS = {
  "Inland surface water — EP Rules Sch. VI": "inland",
  "Public sewers — EP Rules Sch. VI": "sewer",
  "Land for irrigation — EP Rules Sch. VI": "land",
  "Marine / coastal areas — EP Rules Sch. VI": "marine",
  "Consent / plant-specific limit — I enter it": "custom",
};

/* Schedule VI does not cover faecal coliform, and the sewage-treatment-plant
   standards notified separately are NOT reproduced here — see note below. */
const STP_NOTE =
  "Sewage treatment plant standards (BOD, TSS, faecal coliform, N and P for STPs) " +
  "are notified separately from Schedule VI and have been amended and litigated. " +
  "VERIFY the figure in force against MoEFCC S.O. 1327(E) dated 13 April 2017 as " +
  "subsequently amended, the CPCB direction applicable to your State, and above all " +
  "the consent to operate for the plant. No STP-specific numeric limit is built into " +
  "this app — use the custom-limit option and enter the value from the consent.";

/* Parameters offered by the single-parameter efficiency routine, mapped to
   their Schedule VI row so the compliance check can find the limit. */
const TREAT_PARAMS = {
  "BOD (3 d, 27 °C)":                { key: "BOD (3 d, 27 °C)", unit: "mg/L" },
  "COD":                             { key: "COD", unit: "mg/L" },
  "Total suspended solids":          { key: "Suspended solids", unit: "mg/L" },
  "Oil & grease":                    { key: "Oil & grease", unit: "mg/L" },
  "Ammoniacal nitrogen (as N)":      { key: "Ammoniacal nitrogen (as N)", unit: "mg/L" },
  "Total Kjeldahl nitrogen (as N)":  { key: "Total Kjeldahl nitrogen (as N)", unit: "mg/L" },
  "Nitrate nitrogen (as N)":         { key: "Nitrate nitrogen (as N)", unit: "mg/L" },
  "Total phosphorus (as P)":         { key: "Dissolved phosphates (as P)", unit: "mg/L" },
  "Total dissolved solids":          { key: "Total dissolved solids (inorganic)", unit: "mg/L" },
  "Phenolic compounds":              { key: "Phenolic compounds (as C₆H₅OH)", unit: "mg/L" },
  "Cyanide (as CN)":                 { key: "Cyanide (as CN)", unit: "mg/L" },
  "Hexavalent chromium":             { key: "Hexavalent chromium (as Cr⁶⁺)", unit: "mg/L" },
  "Sulphide (as S)":                 { key: "Sulphide (as S)", unit: "mg/L" },
  "Fluoride (as F)":                 { key: "Fluoride (as F)", unit: "mg/L" },
  "Faecal coliform":                 { key: null, unit: "MPN/100 mL" },
  "Other — no Schedule VI limit":    { key: null, unit: "mg/L" },
};

/* -----------------------------------------------------------------------------
   Design and operating envelopes for biological treatment.
   Source: CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013,
   Part A, Chapter 5 (activated sludge and its variants), read with
   Metcalf & Eddy, Wastewater Engineering, 5th ed., Table 8-x.
   These are GUIDANCE RANGES for interpreting an operating plant, not
   statutory values. Site-specific design may sit legitimately outside them.
   --------------------------------------------------------------------------- */
const ASP_RANGE = {
  "Conventional plug flow":      { fm: [0.2, 0.4],   srt: [5, 15],   mlss: [1500, 4000], vlr: [0.3, 0.7],  hrt: [4, 8] },
  "Complete mix":                { fm: [0.2, 0.6],   srt: [5, 15],   mlss: [2500, 4000], vlr: [0.8, 2.0],  hrt: [3, 5] },
  "Extended aeration":           { fm: [0.04, 0.10], srt: [20, 40],  mlss: [2000, 5000], vlr: [0.1, 0.4],  hrt: [18, 36] },
  "High rate / step feed":       { fm: [0.4, 1.5],   srt: [3, 10],   mlss: [2000, 3000], vlr: [1.0, 3.0],  hrt: [1.5, 4] },
  "Oxidation ditch":             { fm: [0.04, 0.10], srt: [15, 30],  mlss: [3000, 5000], vlr: [0.1, 0.3],  hrt: [15, 30] },
  "SBR":                         { fm: [0.04, 0.20], srt: [10, 30],  mlss: [2000, 5000], vlr: [0.1, 0.6],  hrt: [12, 50] },
  "MBR":                         { fm: [0.05, 0.30], srt: [15, 40],  mlss: [8000, 15000], vlr: [1.0, 3.0], hrt: [4, 10] },
};

/* Hypochlorite and bleaching-powder strengths, % available chlorine w/w.
   Bleaching powder degrades on storage — assay it, do not assume 33 %. */
const CL_SOURCES = {
  "Chlorine gas (100 %)":                 100,
  "Bleaching powder, fresh (33 % av. Cl)": 33,
  "Sodium hypochlorite (12 % w/v)":        12,
  "Sodium hypochlorite (10 % w/v)":        10,
  "Calcium hypochlorite (65 % av. Cl)":    65,
  "Enter my own assay":                    null,
};

/* -----------------------------------------------------------------------------
   Inhibition screening thresholds for an activated-sludge biomass.

     t  — concentration in the mixed influent at which inhibition of
          CARBONACEOUS removal is commonly reported, mg/L
     nt — concentration at which NITRIFICATION is reported to be inhibited,
          mg/L. null where no figure is listed for that substance.

   Sources: USEPA Nitrogen Control Manual, EPA/625/R-93/010, for the
   nitrification set; Metcalf & Eddy, Wastewater Engineering, 5th ed., for the
   heterotroph values. These are literature screening triggers, NOT statutory
   limits and NOT a substitute for a respirometric inhibition test on your own
   biomass (ISO 8192 for activated sludge, OECD 209 for respiration
   inhibition). Reported thresholds vary widely between studies and with
   acclimatisation, speciation, complexation and solids concentration.
   VERIFY against the source before relying on any single figure.

   Deliberately NOT modelled here: an acclimatisation allowance. An
   acclimatised biomass does tolerate more, but by how much is
   substance- and site-specific and inventing a multiplier would be worse
   than saying nothing.
   --------------------------------------------------------------------------- */
const INHIBIT = [
  { k: "Hexavalent chromium",    t: 1.0,   nt: 0.25, note: "" },
  { k: "Total chromium",         t: 10,    nt: null, note: "Speciation governs — determine Cr(VI) separately" },
  { k: "Cyanide (as CN)",        t: 1.0,   nt: 0.34, note: "" },
  { k: "Copper",                 t: 1.0,   nt: 0.05, note: "The most nitrifier-toxic of the common metals" },
  { k: "Nickel",                 t: 1.0,   nt: 0.25, note: "" },
  { k: "Zinc",                   t: 5.0,   nt: 0.08, note: "" },
  { k: "Cadmium",                t: 1.0,   nt: null, note: "" },
  { k: "Phenol",                 t: 200,   nt: 4.0,  note: "" },
  { k: "Sulphide (as S)",        t: 25,    nt: null, note: "A corrosion and odour problem well below this" },
  { k: "Total dissolved solids", t: 15000, nt: null, note: "Osmotic stress and poor settling, not specific toxicity — the nitrification threshold does not scale down the way a metal's does" },
  { k: "Oil & grease",           t: 100,   nt: null, note: "A physical effect — fouls diffusers and blankets the floc surface" },
];

/* ---------- Schedule VI limit handling ------------------------------------ */
/* A Schedule VI cell is a number, a band such as "5.5 to 9.0", a non-numeric
   criterion such as "not more than 5 °C above ambient", or null (no standard
   prescribed). csLevel classifies it, csShow prints it as written, and
   csExceeds returns true / false, or null where the entry cannot be graded
   arithmetically and must be read by the analyst. */
const csLevel = (raw) => {
  if (raw === null || raw === undefined) return { kind: "none", text: "—" };
  if (typeof raw === "number") return { kind: "num", n: raw, text: String(raw) };
  const s = String(raw);
  const m = s.match(/^\s*([0-9.]+)\s*to\s*([0-9.]+)\s*$/i);
  if (m) return { kind: "range", lo: parseFloat(m[1]), hi: parseFloat(m[2]), text: s };
  return { kind: "text", text: s };
};
const csShow = (raw) => (raw === null || raw === undefined ? "—" : String(raw));
const csExceeds = (c, lvl) => {
  if (!lvl || !isFinite(c)) return null;
  if (lvl.kind === "num") return c > lvl.n;
  if (lvl.kind === "range") return c < lvl.lo || c > lvl.hi;
  return null;
};

/* ---------- local calculation helpers ------------------------------------- */

/* Range verdict against a guidance envelope [lo, hi] */
const band = (x, r, unit) => {
  if (!r || !isFinite(x)) return null;
  const within = x >= r[0] && x <= r[1];
  return {
    label: "…against the guidance envelope",
    value: within ? "Within range" : x < r[0] ? "Below range" : "Above range",
    tone: within ? "ok" : "warn",
    hint: `Typical ${r[0]}–${r[1]}${unit ? " " + unit : ""} for this process — CPHEEO 2013 / Metcalf & Eddy`,
  };
};

/* DO at saturation, Benson & Krause via APHA 4500-O. T in °C, p in kPa. */
const doSat = (tC, pKpa) => {
  const T = tC + 273.15;
  return Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / T ** 2
    + 1.2438e10 / T ** 3 - 8.621949e11 / T ** 4) * ((pKpa || 101.325) / 101.325);
};

/* Look up a Schedule VI limit for a parameter key and receiving medium */
const schVI = (key, col) => {
  if (!key || col === "custom" || !col) return null;
  const row = DISCHARGE.find((r) => r.k === key);
  return row ? row[col] : null;
};

/* Osmotic pressure, NaCl equivalent, van't Hoff at 25 °C.
   π (bar) = 2 · (TDS/58440 mol/L) · 0.08314 · 298.15 ≈ 8.37×10⁻⁴ · TDS  */
const osmotic = (tds, tC) =>
  (2 * (tds / 58440) * 0.083145 * ((isFinite(tC) ? tC : 25) + 273.15));

/* =============================================================================
   CALCULATORS
   ============================================================================= */

const PLANT = [

/* -----------------------------------------------------------------------------
   1 — Treatment efficiency and mass load
   --------------------------------------------------------------------------- */
{
  id: "treff", mod: "plant", tier: "routine", name: "Treatment Efficiency & Load", sub: "Removal %, mass load, compliance against Schedule VI",
  formula: "E % = (C_in − C_out) / C_in × 100\nLoad (kg/d) = Q (MLD) × C (mg/L)          1 MLD × 1 mg/L ≡ 1 kg/d",
  ref: "Environment (Protection) Rules, 1986 — Schedule VI, Part A, General Standards for Discharge of Environmental Pollutants [see rule 3A]. Determinands by IS 3025 series / APHA 24th ed.: BOD 5210 B, COD 5220 B/C, TSS 2540 D, O&G 5520 B, TKN 4500-N_org, NH₄-N 4500-NH₃, NO₃-N 4500-NO₃, TP 4500-P. Schedule I industry-specific standards override the Schedule VI general standards for a notified category, and a stricter consent condition overrides both. " + STP_NOTE,
  inputs: [
    S("param", "Parameter", Object.keys(TREAT_PARAMS), Object.keys(TREAT_PARAMS)[0]),
    N("ci", "Inlet concentration, C_in", "mg/L", "", "Raw sewage or ETP inlet"),
    N("cmid", "Intermediate stage, optional", "mg/L", "", "e.g. after primary settling — gives the stage-wise split"),
    N("ce", "Outlet concentration, C_out", "mg/L", "", "Final treated effluent"),
    N("q", "Flow treated", "MLD", "", "1 MLD = 1000 m³/d"),
    N("qdes", "Design flow of the plant", "MLD", "", "Optional — gives hydraulic utilisation"),
    S("recv", "Receiving medium / limit set", Object.keys(DISCHARGE_SETS), Object.keys(DISCHARGE_SETS)[0]),
    N("lim", "Consent limit, if custom", "mg/L", "", "Used when the limit set above is the custom option"),
  ],
  run: (v) => {
    /* DEFECT 1 — v.param and v.recv were read unguarded */
    const pName = sel(v.param, Object.keys(TREAT_PARAMS)[0]);
    const p = TREAT_PARAMS[pName] || TREAT_PARAMS[Object.keys(TREAT_PARAMS)[0]];
    const rName = sel(v.recv, Object.keys(DISCHARGE_SETS)[0]);

    const ci = num(v.ci), ce = num(v.ce), q = num(v.q);
    if (![ci, ce].every(isFinite)) return null;
    if (ci <= 0) return [{ label: "Check", value: "Inlet concentration must be greater than zero", tone: "warn" }];

    const E = ((ci - ce) / ci) * 100;
    const out = [
      { label: "Concentration removed", value: fmt(ci - ce), unit: p.unit },
      { label: "Overall removal efficiency", value: fmt(E), unit: "%", tone: "key",
        hint: E < 0 ? "Negative — outlet exceeds inlet, check sampling and dilution" : "" },
    ];
    if (E < 0) out.push({ label: "Check", value: "Outlet is higher than inlet — resample, or account for recycle streams and in-plant load", tone: "warn" });

    /* log removal is the meaningful statistic for micro-organisms */
    if (p.unit.startsWith("MPN") && ce > 0) {
      out.push({ label: "Log₁₀ removal", value: fmt(Math.log10(ci / ce), 3), tone: "key",
        hint: "log₁₀(C_in / C_out) — the reporting basis for disinfection performance" });
    }

    const cmid = num(v.cmid);
    if (isFinite(cmid) && cmid > 0) {
      out.push({ label: "Stage 1 removal (inlet → intermediate)", value: fmt(((ci - cmid) / ci) * 100), unit: "%" });
      out.push({ label: "Stage 2 removal (intermediate → outlet)", value: fmt(((cmid - ce) / cmid) * 100), unit: "%" });
      out.push({ label: "Share of total removal in stage 1", value: fmt(((ci - cmid) / (ci - ce)) * 100), unit: "%",
        hint: ci - ce === 0 ? "No net removal — share undefined" : "" });
    }

    if (isFinite(q) && q > 0 && !p.unit.startsWith("MPN")) {
      out.push({ label: "Mass load in", value: fmt(q * ci), unit: "kg/d", tone: "key" });
      out.push({ label: "Mass load out", value: fmt(q * ce), unit: "kg/d", tone: "key" });
      out.push({ label: "Mass removed", value: fmt(q * (ci - ce)), unit: "kg/d",
        hint: `${fmt(q * (ci - ce) / 1000)} t/d · ${fmt(q * (ci - ce) * 365 / 1000)} t/yr` });
      const qd = num(v.qdes);
      if (isFinite(qd) && qd > 0) {
        const u = (q / qd) * 100;
        out.push({ label: "Hydraulic utilisation", value: fmt(u), unit: "% of design flow",
          tone: u > 100 ? "warn" : "ok",
          hint: u > 100 ? "Above design flow — expect carry-over of solids and loss of efficiency" : "" });
      }
    }

    /* compliance */
    const col = DISCHARGE_SETS[rName];
    let raw = col === "custom" ? num(v.lim) : schVI(p.key, col);
    if (col === "custom" && !isFinite(raw)) {
      out.push({ label: "Compliance", value: "Enter the consent limit to get a verdict", tone: "warn" });
    } else if (raw === null || raw === undefined) {
      out.push({ label: "Compliance", value: `No general standard is prescribed for this parameter in the ${rName.split(" — ")[0].toLowerCase()} column of Schedule VI`, tone: "warn",
        hint: "Check Schedule I for your industry category, and the consent to operate" });
    } else {
      const lvl = csLevel(raw);
      const over = csExceeds(ce, lvl);
      if (over === null) {
        out.push({ label: "Prescribed standard", value: csShow(raw) });
        out.push({ label: "Compliance", value: "The standard is not numeric — assess against the printed entry", tone: "warn" });
      } else {
        out.push({ label: "Prescribed standard", value: csShow(raw), unit: lvl.kind === "num" ? p.unit : "" });
        out.push({ label: "Verdict", value: over ? "Exceeds the standard" : "Within the standard",
          tone: over ? "warn" : "ok",
          hint: lvl.kind === "num" ? `${((ce / lvl.n) * 100).toFixed(0)} % of the limit` : "" });
        if (!over && lvl.kind === "num") {
          const need = ci > 0 ? (1 - lvl.n / ci) * 100 : NaN;
          out.push({ label: "Headroom to the limit", value: fmt(lvl.n - ce), unit: p.unit,
            hint: `Minimum removal efficiency the limit demands: ${fmt(need)} %` });
        }
        if (over && lvl.kind === "num") {
          out.push({ label: "Removal efficiency required", value: fmt((1 - lvl.n / ci) * 100), unit: "%", tone: "warn",
            hint: `Present ${fmt(E)} % — shortfall ${fmt((1 - lvl.n / ci) * 100 - E)} percentage points` });
        }
      }
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   2 — Multi-parameter compliance panel
   --------------------------------------------------------------------------- */
{
  id: "plantcomp", mod: "plant", tier: "routine", name: "Effluent Compliance Panel", sub: "Whole analysis against Schedule VI in one pass",
  formula: "Compare each determinand against the standard for the receiving medium",
  ref: "Environment (Protection) Rules, 1986 — Schedule VI, Part A [see rule 3A], transcribed as printed. Blank rows are left out of the verdict. Where Schedule VI prescribes no standard for a determinand in the chosen column the row is reported as 'not prescribed', not as a pass. Schedule I industry-specific standards override these general standards; a stricter consent condition overrides both. VERIFY every value against the current amended text of the Rules before using this in a statutory report. " + STP_NOTE,
  inputs: [
    S("recv", "Receiving medium", Object.keys(DISCHARGE_SETS).filter((k) => k !== "Consent / plant-specific limit — I enter it"), Object.keys(DISCHARGE_SETS)[0]),
    { id: "tbl", type: "table", label: "Measured values in the treated effluent",
      rows: DISCHARGE.map((r) => ({ k: r.k, unit: r.unit })) },
  ],
  run: (v) => {
    /* DEFECT 1 — an unset select gave col === undefined and every row then
       read r[undefined], silently reporting "no standard prescribed" */
    const rName = sel(v.recv, Object.keys(DISCHARGE_SETS)[0]);
    const col = DISCHARGE_SETS[rName] || "inland";
    const t = v.tbl || {};
    const entered = DISCHARGE.map((r) => ({ ...r, c: num(t[r.k]) })).filter((r) => isFinite(r.c));
    if (!entered.length) return null;

    const graded = [], ungraded = [], nonNumeric = [];
    for (const r of entered) {
      const raw = r[col];
      if (raw === null || raw === undefined) { ungraded.push(r); continue; }
      const lvl = csLevel(raw);
      const over = csExceeds(r.c, lvl);
      if (over === null) { nonNumeric.push({ ...r, raw }); continue; }
      graded.push({ ...r, raw, lvl, over, ratio: lvl.kind === "num" ? r.c / lvl.n : NaN });
    }
    const fails = graded.filter((r) => r.over);
    graded.sort((a, b) => (isFinite(b.ratio) ? b.ratio : -1) - (isFinite(a.ratio) ? a.ratio : -1));

    const out = [
      { label: "Determinands entered", value: entered.length,
        hint: `${graded.length} graded · ${ungraded.length} with no standard in this column · ${nonNumeric.length} non-numeric` },
      ...graded.map((r) => ({
        label: r.k, value: fmt(r.c), unit: `of ${csShow(r.raw)}`,
        tone: r.over ? "warn" : "ok",
        hint: isFinite(r.ratio) ? `${(r.ratio * 100).toFixed(0)} % of the limit` : r.lvl.text || "",
      })),
      ...nonNumeric.map((r) => ({ label: r.k, value: fmt(r.c), unit: r.unit,
        tone: "warn", hint: `Standard is "${csShow(r.raw)}" — assess against the printed entry` })),
      ...ungraded.map((r) => ({ label: r.k, value: fmt(r.c), unit: r.unit,
        hint: "No standard prescribed for this determinand in this column — not a pass" })),
      { label: "Determinands exceeding", value: fails.length, tone: fails.length ? "warn" : "ok" },
      { label: "Outcome",
        value: fails.length ? `Non-compliant on ${fails.map((f) => f.k).join(", ")}` : "All graded determinands within Schedule VI",
        tone: fails.length ? "warn" : "ok" },
    ];
    if (graded.length) out.push({ label: "Closest to its limit among the passes",
      value: (graded.filter((r) => !r.over)[0] || {}).k || "—",
      hint: "Watch this one — it will fail first on a load excursion" });
    return out;
  },
},

/* -----------------------------------------------------------------------------
   3 — Activated sludge process check
   --------------------------------------------------------------------------- */
{
  id: "asp", mod: "plant", tier: "advanced", name: "Activated Sludge Check", sub: "F/M, SRT, HRT, volumetric loading, SVI, RAS ratio",
  formula: "HRT = V/Q      VLR = Q·S₀/V      F/M = Q·S₀/(V·X_v)\nSRT = V·X / (Q_w·X_r + (Q−Q_w)·X_e)      SVI = SV₃₀ × 1000 / MLSS      R = X/(X_r − X)",
  ref: "CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013, Part A, Chapter 5 — activated sludge process and its variants; Metcalf & Eddy, Wastewater Engineering, 5th ed., Ch. 8. SVI by APHA 2710 D / IS 3025 (Part 42) — settled sludge volume after 30 min in a 1 L cylinder. F/M is on an MLVSS basis; MLSS/MLVSS is measured by APHA 2540 D and E. Observed yield Y_obs = ΔX/ΔBOD is the operating value and will be below the true Y because of endogenous decay. The design envelopes quoted are guidance, not statutory values — a plant may legitimately sit outside them.",
  inputs: [
    S("proc", "Process configuration", Object.keys(ASP_RANGE), Object.keys(ASP_RANGE)[0]),
    N("q", "Influent flow to the aeration tank, Q", "m³/d", "", "Excluding return sludge"),
    N("s0", "BOD entering the aeration tank, S₀", "mg/L", "", "After primary settling, if there is a primary"),
    N("s", "BOD leaving, S", "mg/L", ""),
    N("vol", "Aeration tank volume, V", "m³", ""),
    N("mlss", "MLSS, X", "mg/L", ""),
    N("vratio", "MLVSS / MLSS ratio", "", "0.8", "Measure it — 0.75–0.85 is usual for sewage, lower for industrial"),
    N("sv30", "Settled sludge volume, SV₃₀", "mL/L", "", "For SVI — 30 min settling in a 1 L cylinder"),
    N("qw", "Waste sludge rate, Q_w", "m³/d", "", "For SRT"),
    N("xr", "Return / waste sludge TSS, X_r", "mg/L", ""),
    N("xe", "Effluent TSS, X_e", "mg/L", "0"),
    N("y", "True yield coefficient, Y", "kg VSS/kg BOD", "0.6", "Metcalf & Eddy default for domestic sewage on a BOD₅ basis"),
    N("kd", "Endogenous decay coefficient, k_d", "1/d", "0.06"),
  ],
  run: (v) => {
    const q = num(v.q), s0 = num(v.s0), vol = num(v.vol), mlss = num(v.mlss);
    if (![q, s0, vol, mlss].every(isFinite) || q <= 0 || vol <= 0 || mlss <= 0) return null;
    /* DEFECT 1 — ASP_RANGE[v.proc] was undefined with the select unset and
       every r.<envelope> read then threw */
    const pName = sel(v.proc, Object.keys(ASP_RANGE)[0]);
    const r = ASP_RANGE[pName] || ASP_RANGE[Object.keys(ASP_RANGE)[0]];
    const s = num(v.s), vr = dpos(num(v.vratio), 0.8);
    const mlvss = mlss * vr;

    const hrt = (vol / q) * 24;                       /* h                     */
    const vlr = (q * s0) / (vol * 1000);              /* kg BOD/m³·d           */
    const fm = (q * s0) / (vol * mlvss);              /* kg BOD/kg MLVSS·d     */
    const svMass = (vol * mlss) / 1000;               /* kg MLSS in the tank   */

    const out = [
      { label: "MLVSS", value: fmt(mlvss), unit: "mg/L", hint: `MLSS ${fmt(mlss)} × ${fmt(vr)}` },
      { label: "Solids inventory in the tank", value: fmt(svMass), unit: "kg MLSS" },
      { label: "Hydraulic retention time, HRT", value: fmt(hrt), unit: "h", tone: "key" },
      band(hrt, r.hrt, "h"),
      { label: "BOD load applied", value: fmt(q * s0 / 1000), unit: "kg BOD/d", tone: "key" },
      { label: "Volumetric organic loading, VLR", value: fmt(vlr), unit: "kg BOD/m³·d", tone: "key" },
      band(vlr, r.vlr, "kg BOD/m³·d"),
      { label: "Food-to-microorganism ratio, F/M", value: fmt(fm), unit: "kg BOD/kg MLVSS·d", tone: "key" },
      band(fm, r.fm, ""),
      { label: "MLSS against the envelope", value: mlss >= r.mlss[0] && mlss <= r.mlss[1] ? "Within range" : mlss < r.mlss[0] ? "Below range" : "Above range",
        tone: mlss >= r.mlss[0] && mlss <= r.mlss[1] ? "ok" : "warn", hint: `Typical ${r.mlss[0]}–${r.mlss[1]} mg/L for ${pName}` },
    ].filter(Boolean);

    /* SRT */
    const qw = num(v.qw), xr = num(v.xr), xe = dflt(num(v.xe), 0);
    if ([qw, xr].every(isFinite) && qw > 0 && xr > 0) {
      const wasted = qw * xr + Math.max(q - qw, 0) * xe;      /* g TSS/d ×1     */
      const srt = wasted > 0 ? (vol * mlss) / wasted : NaN;
      out.push({ label: "Solids wasted in the WAS stream", value: fmt((qw * xr) / 1000), unit: "kg TSS/d" });
      if (xe > 0) out.push({ label: "Solids lost in the effluent", value: fmt((Math.max(q - qw, 0) * xe) / 1000), unit: "kg TSS/d",
        hint: `${fmt(((Math.max(q - qw, 0) * xe) / wasted) * 100)} % of total solids leaving — an uncontrolled loss` });
      out.push({ label: "Sludge retention time, SRT", value: fmt(srt), unit: "d", tone: "key",
        hint: "θ_c on a total-solids basis, including effluent losses" });
      const b = band(srt, r.srt, "d"); if (b) out.push(b);
      if (isFinite(srt) && srt < 4) out.push({ label: "Nitrification", value: "SRT below about 4 d at 20 °C will not sustain nitrifiers — expect ammonia breakthrough", tone: "warn" });
      /* observed yield */
      if (isFinite(s) && s0 > s) {
        const yobs = (qw * xr) / (q * (s0 - s));
        out.push({ label: "Observed yield, Y_obs", value: fmt(yobs), unit: "kg TSS/kg BOD removed", tone: "key" });
        const Y = dpos(num(v.y), 0.6), kd = dflt(num(v.kd), 0.06);
        if (isFinite(srt)) {
          const ypred = Y / (1 + kd * srt);
          out.push({ label: "Predicted Y_obs = Y/(1+k_d·θ_c)", value: fmt(ypred), unit: "kg VSS/kg BOD",
            hint: `Y ${fmt(Y)} · k_d ${fmt(kd)} · θ_c ${fmt(srt)} d — compare with the observed value above` });
        }
      }
    }

    /* RAS ratio */
    if (isFinite(xr) && xr > mlss) {
      const R = mlss / (xr - mlss);
      out.push({ label: "Return sludge ratio required, R", value: fmt(R), tone: "key",
        hint: `Q_RAS = ${fmt(R * q)} m³/d at this MLSS and RAS concentration` });
    } else if (isFinite(xr)) {
      out.push({ label: "Return sludge ratio", value: "RAS concentration is at or below MLSS — thickening in the clarifier has failed", tone: "warn" });
    }

    /* SVI */
    const sv30 = num(v.sv30);
    if (isFinite(sv30) && sv30 > 0) {
      const svi = (sv30 * 1000) / mlss;
      out.push({ label: "Sludge volume index, SVI", value: fmt(svi), unit: "mL/g", tone: "key" });
      out.push({ label: "Settling character",
        value: svi < 80 ? "Dense, possibly pin-floc" : svi <= 150 ? "Good settling" : svi <= 200 ? "Poor — incipient bulking" : "Bulking",
        tone: svi <= 150 ? "ok" : "warn",
        hint: svi > 150 ? "Filamentous bulking is the usual cause — check F/M, DO, nutrient balance and septicity of the influent" : "" });
      const xrMax = 1e6 / svi;
      out.push({ label: "Maximum thickening the SVI allows", value: fmt(xrMax), unit: "mg/L",
        hint: "10⁶/SVI — the RAS cannot be thickened beyond this, which caps the achievable MLSS" });
    }

    /* removal, if the outlet was given */
    if (isFinite(s)) {
      out.push({ label: "BOD removal across the tank", value: fmt(((s0 - s) / s0) * 100), unit: "%" });
      out.push({ label: "BOD removed", value: fmt((q * (s0 - s)) / 1000), unit: "kg/d" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   4 — Secondary clarifier loading
   --------------------------------------------------------------------------- */
{
  id: "clarifier", mod: "plant", tier: "advanced", name: "Clarifier Loading", sub: "Overflow rate, solids loading, weir loading, retention",
  formula: "SOR = Q / A      SLR = (Q + Q_R)·X / A      HRT = V / (Q + Q_R)      Weir loading = Q / L_weir",
  ref: "CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013, Part A, Chapter 5 — settling tanks; Metcalf & Eddy, Wastewater Engineering, 5th ed., Ch. 8, Table 8-34. Guidance envelopes for a secondary clarifier following activated sludge: surface overflow rate 16–28 m³/m²·d at average flow and up to 40–48 at peak; solids loading rate 4–6 kg/m²·h; side water depth 3.5–4.5 m; weir loading up to about 185 m³/m·d. For a primary clarifier the SOR envelope is 30–50 m³/m²·d. These are design guidance, not statutory limits — VERIFY against the design basis report for your plant.",
  inputs: [
    S("type", "Clarifier", ["Secondary — following activated sludge", "Primary"], "Secondary — following activated sludge"),
    N("q", "Average flow, Q", "m³/d", ""),
    N("qpk", "Peak flow", "m³/d", "", "Optional — peak factor 2.25–3 is usual for sewage"),
    N("dia", "Diameter", "m", "", "Or enter the surface area below"),
    N("area", "…or surface area, A", "m²", ""),
    N("depth", "Side water depth", "m", "3.5"),
    N("mlss", "MLSS entering, X", "mg/L", "", "Secondary clarifier only — for the solids loading rate"),
    N("rratio", "Return sludge ratio, R", "", "1.0", "Q_R = R × Q"),
    N("weir", "Total weir length", "m", "", "Optional"),
    N("svi", "SVI", "mL/g", "", "Optional — checks the thickening the underflow can achieve"),
  ],
  run: (v) => {
    const q = num(v.q), dia = num(v.dia);
    const A = isFinite(num(v.area)) ? num(v.area) : isFinite(dia) && dia > 0 ? (Math.PI * dia * dia) / 4 : NaN;
    if (!isFinite(q) || q <= 0 || !isFinite(A) || A <= 0) return null;
    /* DEFECT 1 — v.type.startsWith() threw on an unset select */
    const tName = sel(v.type, "Secondary — following activated sludge");
    const secondary = tName.startsWith("Secondary");
    /* DEFECT 2 — `num(v.rratio) ?? 1.0` never fired; R = 0 is a legitimate
       entry (no return sludge) so dflt, not `||`, is correct here */
    const d = dpos(num(v.depth), 3.5), R = dflt(num(v.rratio), 1.0);
    const V = A * d;
    const sor = q / A;
    const sorRange = secondary ? [16, 28] : [30, 50];

    const out = [
      { label: "Surface area", value: fmt(A), unit: "m²", hint: isFinite(dia) && !isFinite(num(v.area)) ? `From a ${fmt(dia)} m diameter` : "As entered" },
      { label: "Tank volume", value: fmt(V), unit: "m³", hint: `${fmt(d)} m side water depth` },
      { label: "Surface overflow rate at average flow", value: fmt(sor), unit: "m³/m²·d", tone: "key" },
      { label: "…against the envelope", value: sor >= sorRange[0] && sor <= sorRange[1] ? "Within range" : sor < sorRange[0] ? "Below range" : "Above range",
        tone: sor >= sorRange[0] && sor <= sorRange[1] ? "ok" : "warn",
        hint: `Typical ${sorRange[0]}–${sorRange[1]} m³/m²·d — ${secondary ? "secondary" : "primary"} clarifier` },
      { label: "…as an upflow velocity", value: fmt(sor / 24), unit: "m/h" },
    ];

    const qpk = num(v.qpk);
    if (isFinite(qpk) && qpk > 0) {
      const sp = qpk / A;
      out.push({ label: "Surface overflow rate at peak flow", value: fmt(sp), unit: "m³/m²·d", tone: "key",
        hint: `Peak factor ${fmt(qpk / q)}` });
      out.push({ label: "…against the peak envelope", value: sp <= 48 ? "Within the usual peak allowance" : "Above the usual peak allowance",
        tone: sp <= 48 ? "ok" : "warn", hint: "40–48 m³/m²·d at peak is the usual secondary-clarifier ceiling" });
    }

    if (secondary) {
      const mlss = num(v.mlss);
      if (isFinite(mlss) && mlss > 0) {
        const qtot = q * (1 + R);
        const slrDay = (qtot * mlss) / 1000 / A;              /* kg/m²·d */
        out.push({ label: "Total flow to the clarifier, Q + Q_R", value: fmt(qtot), unit: "m³/d", hint: `R = ${fmt(R)}` });
        out.push({ label: "Solids loading rate", value: fmt(slrDay), unit: "kg/m²·d", tone: "key",
          hint: `${fmt(slrDay / 24)} kg/m²·h` });
        out.push({ label: "…against the envelope", value: slrDay / 24 >= 4 && slrDay / 24 <= 6 ? "Within range" : slrDay / 24 < 4 ? "Below range" : "Above range",
          tone: slrDay / 24 >= 4 && slrDay / 24 <= 6 ? "ok" : "warn",
          hint: "4–6 kg/m²·h for activated sludge — above 6 the blanket rises and solids carry over" });
        out.push({ label: "Hydraulic retention time", value: fmt((V / qtot) * 24), unit: "h",
          hint: "On the total flow including return sludge — 1.5–2.5 h is usual" });
        const svi = num(v.svi);
        if (isFinite(svi) && svi > 0) {
          const xrMax = 1e6 / svi;
          out.push({ label: "Underflow concentration the SVI allows", value: fmt(xrMax), unit: "mg/L",
            hint: `10⁶/SVI at SVI ${fmt(svi)} mL/g` });
          const rMin = mlss / Math.max(xrMax - mlss, 1e-9);
          out.push({ label: "Minimum return ratio this implies", value: xrMax > mlss ? fmt(rMin) : "Not achievable",
            tone: xrMax > mlss && rMin <= R ? "ok" : "warn",
            hint: xrMax > mlss ? `Operating at R = ${fmt(R)}` : "The sludge cannot thicken above the MLSS — reduce MLSS or fix the settleability" });
        }
      }
    } else {
      out.push({ label: "Hydraulic retention time", value: fmt((V / q) * 24), unit: "h", hint: "1.5–2.5 h is usual for a primary clarifier" });
    }

    const w = num(v.weir);
    if (isFinite(w) && w > 0) {
      const wl = q / w;
      out.push({ label: "Weir loading rate", value: fmt(wl), unit: "m³/m·d", tone: "key" });
      out.push({ label: "…against the envelope", value: wl <= 185 ? "Within the usual allowance" : "Above the usual allowance",
        tone: wl <= 185 ? "ok" : "warn", hint: "Up to about 185 m³/m·d; high weir loading drags floc over the launder" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   5 — Oxygen demand, SOTR and blower power
   --------------------------------------------------------------------------- */
{
  id: "aeration", mod: "plant", tier: "advanced", name: "Aeration Demand & Blower Power", sub: "AOR, SOTR, air flow, blower kW",
  formula: "AOR = Q(S₀−S)/f − 1.42 P_x + 4.57 Q·ΔN − 2.86 Q·ΔNO₃\nSOTR = AOR / [ α·F · ((β·C_s,T,H − C_L)/C_s,20) · 1.024^(T−20) ]\nP_w = (w·R·T₁)/(29.7·n·e) · [ (p₂/p₁)^n − 1 ]",
  ref: "Metcalf & Eddy, Wastewater Engineering, 5th ed., Ch. 5 — oxygen transfer, Eqs. 5-70 and 5-77; ASCE/EWRI 2-06, Standard Guidelines for In-Process Oxygen Transfer Testing, for α, β and F. C_s,20 = 9.09 mg/L in clean water at 20 °C and 1 atm. f = BOD₅/BOD_u ≈ 0.68 for domestic sewage. 4.57 kg O₂ per kg NH₄-N oxidised and 2.86 kg O₂ recovered per kg NO₃-N denitrified are the stoichiometric values with cell synthesis neglected. α is 0.4–0.6 for fine-bubble diffusers in mixed liquor, β ≈ 0.95, F (fouling) 0.65–0.9 — measure them, do not assume. Air at 20 °C and 1 atm: 1.204 kg/m³, oxygen 23.15 % by mass, hence 0.279 kg O₂ per m³ of air.",
  inputs: [
    N("q", "Flow, Q", "m³/d", ""),
    N("s0", "BOD in", "mg/L", ""),
    N("s", "BOD out", "mg/L", ""),
    N("f", "BOD₅ / BOD_ultimate ratio, f", "", "0.68"),
    N("px", "Net biomass wasted, P_x", "kg VSS/d", "", "From the sludge routine — credited at 1.42 kg O₂/kg VSS"),
    N("dn", "NH₄-N oxidised", "mg/L", "0", "Inlet minus outlet ammoniacal nitrogen"),
    N("dno3", "NO₃-N denitrified", "mg/L", "0", "Gives an oxygen credit of 2.86 kg O₂/kg N"),
    N("aorDirect", "…or enter AOR directly", "kg O₂/d", ""),
    N("t", "Mixed liquor temperature, T", "°C", "28"),
    N("cl", "Operating DO, C_L", "mg/L", "2.0"),
    N("depth", "Diffuser submergence", "m", "4.5", "Used for the mid-depth saturation correction"),
    N("pbar", "Site barometric pressure", "kPa", "101.325"),
    N("alpha", "α — transfer correction", "", "0.5"),
    N("beta", "β — salinity correction", "", "0.95"),
    N("ff", "F — diffuser fouling factor", "", "0.8"),
    N("sote", "Standard oxygen transfer efficiency, SOTE", "%", "20", "Per metre of submergence it is roughly 4–6 % for fine bubble"),
    N("p2", "Blower discharge pressure", "kPa abs", "", "Optional — for the blower power estimate"),
    N("eff", "Blower wire-to-air efficiency, e", "", "0.70"),
  ],
  run: (v) => {
    const out = [];
    let aor = num(v.aorDirect);
    const q = num(v.q), s0 = num(v.s0), s = num(v.s);
    const f = dpos(num(v.f), 0.68);

    if (!isFinite(aor)) {
      if (![q, s0, s].every(isFinite) || q <= 0) return null;
      const carb = (q * (s0 - s)) / 1000 / f;
      const px = dflt(num(v.px), 0);
      const dnv = dflt(num(v.dn), 0), dno3v = dflt(num(v.dno3), 0);
      const nit = 4.57 * ((q * dnv) / 1000);
      const den = 2.86 * ((q * dno3v) / 1000);
      aor = carb - 1.42 * px + nit - den;
      out.push({ label: "Carbonaceous demand, Q(S₀−S)/f", value: fmt(carb), unit: "kg O₂/d", hint: `f = ${fmt(f)}` });
      if (px) out.push({ label: "Credit for biomass wasted, 1.42 P_x", value: "− " + fmt(1.42 * px), unit: "kg O₂/d" });
      if (nit) out.push({ label: "Nitrogenous demand, 4.57 × N oxidised", value: fmt(nit), unit: "kg O₂/d",
        hint: `${fmt((q * dnv) / 1000)} kg N/d oxidised` });
      if (den) out.push({ label: "Credit from denitrification, 2.86 × NO₃-N", value: "− " + fmt(den), unit: "kg O₂/d" });
      if (s0 < s) out.push({ label: "Check", value: "BOD out exceeds BOD in", tone: "warn" });
    }
    if (!isFinite(aor) || aor <= 0)
      return [{ label: "Check", value: "Actual oxygen requirement works out at or below zero — check the inputs", tone: "warn" }];

    out.push({ label: "Actual oxygen requirement, AOR", value: fmt(aor), unit: "kg O₂/d", tone: "key",
      hint: `${fmt(aor / 24)} kg O₂/h` });
    if (isFinite(q) && isFinite(s0) && isFinite(s) && s0 > s)
      out.push({ label: "Specific oxygen demand", value: fmt(aor / ((q * (s0 - s)) / 1000)), unit: "kg O₂/kg BOD removed",
        hint: "1.1–1.5 is usual for carbonaceous removal; higher where nitrification is required" });

    /* DEFECT 2 — `num(v.t) ?? 28` and `num(v.cl) ?? 2.0` were dead. An
       operating DO of 0 mg/L is a legitimate entry, so dflt is used. */
    const t = dflt(num(v.t), 28), cl = dflt(num(v.cl), 2.0), pbar = dpos(num(v.pbar), 101.325);
    const dep = dpos(num(v.depth), 4.5);
    const alpha = dpos(num(v.alpha), 0.5), beta = dpos(num(v.beta), 0.95), F = dpos(num(v.ff), 0.8);

    /* mid-depth pressure correction: add half the submergence as water column */
    const pMid = pbar + (dep / 2) * 9.7936;                   /* kPa, 1 m H₂O = 9.7936 kPa */
    const csTH = doSat(t, pMid);
    const cs20 = 9.09;
    const driving = (beta * csTH - cl) / cs20;
    const theta = Math.pow(1.024, t - 20);
    const denom = alpha * F * driving * theta;

    out.push({ label: "Pressure at mid-diffuser depth", value: fmt(pMid), unit: "kPa", hint: `${fmt(pbar)} kPa + ${fmt(dep / 2)} m water` });
    out.push({ label: "DO saturation at T and that pressure", value: fmt(csTH), unit: "mg/L", hint: "APHA 4500-O, Benson & Krause" });
    out.push({ label: "Driving-force ratio (β·C_s − C_L)/C_s,20", value: fmt(driving, 4) });
    out.push({ label: "Temperature factor 1.024^(T−20)", value: fmt(theta, 4) });

    if (!(denom > 0))
      return [...out, { label: "Check", value: "Operating DO is at or above the saturation value at depth — no driving force, check C_L and temperature", tone: "warn" }];

    const sotr = aor / denom;
    out.push({ label: "Standard oxygen transfer rate required, SOTR", value: fmt(sotr), unit: "kg O₂/d", tone: "key",
      hint: `${fmt(sotr / 24)} kg O₂/h · field-to-standard ratio ${fmt(denom, 3)}` });

    const sote = dpos(num(v.sote), 20);
    const o2PerM3 = 1.204 * 0.2315;                            /* 0.2787 kg O₂/m³ air */
    const airM3h = (sotr / 24) / (o2PerM3 * (sote / 100));
    out.push({ label: "Oxygen carried per m³ of air", value: fmt(o2PerM3, 4), unit: "kg O₂/m³", hint: "Air at 20 °C, 101.325 kPa" });
    out.push({ label: "Air flow required", value: fmt(airM3h), unit: "m³/h", tone: "key",
      hint: `${fmt(airM3h / 60)} m³/min at SOTE ${fmt(sote)} %` });
    out.push({ label: "…as an air-to-water ratio", value: isFinite(q) && q > 0 ? fmt((airM3h * 24) / q) : "—", unit: "m³ air/m³ sewage",
      hint: "Typically 5–15 for fine-bubble diffused aeration" });

    const p2 = num(v.p2);
    if (isFinite(p2) && p2 > pbar) {
      const w = (airM3h * 1.204) / 3600;                        /* kg/s */
      const e = dpos(num(v.eff), 0.70), n = 0.283;
      const T1 = 273.15 + 40;                                   /* blower inlet ≈ 40 °C */
      const pw = ((w * 8.314 * T1) / (29.7 * n * e)) * (Math.pow(p2 / pbar, n) - 1);
      out.push({ label: "Blower mass flow", value: fmt(w, 4), unit: "kg air/s" });
      out.push({ label: "Pressure ratio p₂/p₁", value: fmt(p2 / pbar, 4) });
      out.push({ label: "Blower shaft power", value: fmt(pw), unit: "kW", tone: "key",
        hint: `Adiabatic, e = ${fmt(e)}, inlet 40 °C — Metcalf & Eddy Eq. 5-77` });
      out.push({ label: "Energy per day", value: fmt(pw * 24), unit: "kWh/d" });
      if (isFinite(q) && q > 0) out.push({ label: "Specific aeration energy", value: fmt((pw * 24) / q), unit: "kWh/m³ treated",
        hint: "Aeration alone is typically 0.15–0.35 kWh/m³ for a conventional STP" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   6 — Nitrification / denitrification stoichiometry
   --------------------------------------------------------------------------- */
{
  id: "nitden", mod: "plant", tier: "advanced", name: "Nitrification & Denitrification", sub: "Oxygen, alkalinity, carbon source and alkali dosing",
  formula: "O₂ = 4.57 kg per kg NH₄-N oxidised      Alkalinity destroyed = 7.14 kg CaCO₃ per kg NH₄-N\nDenitrification recovers 3.57 kg CaCO₃ and 2.86 kg O₂ per kg NO₃-N\nMethanol = 2.47 NO₃-N + 1.53 NO₂-N + 0.87 DO",
  ref: "Metcalf & Eddy, Wastewater Engineering, 5th ed., Ch. 7 — biological nitrogen removal; USEPA Nitrogen Control Manual, EPA/625/R-93/010; McCarty et al. (1969) for the methanol stoichiometry. The 4.57 and 7.14 factors are the stoichiometric maxima with cell synthesis neglected; including synthesis they fall to about 4.33 and 7.07. Alkalinity is as CaCO₃ by APHA 2320 B / IS 3025 (Part 23). Nitrifiers stall below pH 6.8 and are effectively lost below 6.0 — keep 50–100 mg/L as CaCO₃ residual alkalinity in the aeration tank. Equivalent weights used for the alkali dose: CaCO₃ 50.04, Ca(OH)₂ 37.05, NaOH 40.00, Na₂CO₃ 53.00 g/eq.",
  inputs: [
    N("q", "Flow, Q", "m³/d", ""),
    N("nh4in", "NH₄-N entering", "mg/L", ""),
    N("nh4out", "NH₄-N leaving", "mg/L", ""),
    N("no3red", "NO₃-N denitrified", "mg/L", "0", "Nitrate produced minus nitrate in the effluent"),
    N("no2", "NO₂-N denitrified", "mg/L", "0"),
    N("doRecycle", "DO carried into the anoxic zone", "mg/L", "0", "Consumes methanol before nitrate does"),
    N("alkin", "Influent alkalinity", "mg/L as CaCO₃", ""),
    N("alkres", "Residual alkalinity wanted", "mg/L as CaCO₃", "80", "50–100 holds pH above 6.8"),
    S("alkali", "Alkali for the shortfall", ["Lime — Ca(OH)₂, 90 % available", "Caustic soda — NaOH, 100 %", "Soda ash — Na₂CO₃, 99 %"], "Lime — Ca(OH)₂, 90 % available"),
    N("cod", "Readily biodegradable COD available for denitrification", "mg/L", "", "Optional — checks whether an external carbon source is needed"),
  ],
  run: (v) => {
    const q = num(v.q), nin = num(v.nh4in), nout = num(v.nh4out);
    if (![q, nin, nout].every(isFinite) || q <= 0) return null;
    if (nout > nin) return [{ label: "Check", value: "Effluent ammonia exceeds influent ammonia — check for ammonification of organic N or a sampling error", tone: "warn" }];

    const dn = nin - nout;
    const nOx = (q * dn) / 1000;                              /* kg N/d oxidised */
    const no3 = dflt(num(v.no3red), 0), no2 = dflt(num(v.no2), 0), doR = dflt(num(v.doRecycle), 0);
    const nRed = (q * no3) / 1000;

    const out = [
      { label: "NH₄-N removed", value: fmt(dn), unit: "mg/L", hint: `${fmt((dn / nin) * 100)} % removal` },
      { label: "Nitrogen oxidised", value: fmt(nOx), unit: "kg N/d", tone: "key" },
      { label: "Oxygen for nitrification, 4.57 ×", value: fmt(4.57 * nOx), unit: "kg O₂/d", tone: "key",
        hint: `${fmt(4.33 * nOx)} kg O₂/d if cell synthesis is credited` },
      { label: "Alkalinity destroyed, 7.14 ×", value: fmt(7.14 * nOx), unit: "kg CaCO₃/d", tone: "key",
        hint: `Equivalent to ${fmt(7.14 * dn)} mg/L as CaCO₃ consumed from the flow` },
    ];

    if (nRed > 0) {
      out.push({ label: "Nitrogen denitrified", value: fmt(nRed), unit: "kg N/d" });
      out.push({ label: "Oxygen credit, 2.86 ×", value: fmt(2.86 * nRed), unit: "kg O₂/d",
        hint: "Oxygen recovered by using nitrate as the electron acceptor" });
      out.push({ label: "Alkalinity recovered, 3.57 ×", value: fmt(3.57 * nRed), unit: "kg CaCO₃/d",
        hint: `${fmt(3.57 * no3)} mg/L as CaCO₃ returned` });
      out.push({ label: "Net oxygen demand for nitrogen", value: fmt(4.57 * nOx - 2.86 * nRed), unit: "kg O₂/d", tone: "key" });
    }

    /* alkalinity balance */
    /* DEFECT 2 — `num(v.alkres) ?? 80` was dead code; a target of 0 is a
       legitimate entry so dflt is used, not `||` */
    const alkin = num(v.alkin), alkres = dflt(num(v.alkres), 80);
    const netUse = 7.14 * dn - 3.57 * no3;                     /* mg/L as CaCO₃ */
    out.push({ label: "Net alkalinity consumption", value: fmt(netUse), unit: "mg/L as CaCO₃", tone: "key" });
    if (isFinite(alkin)) {
      const left = alkin - netUse;
      out.push({ label: "Alkalinity remaining", value: fmt(left), unit: "mg/L as CaCO₃",
        tone: left >= alkres ? "ok" : "warn",
        hint: left >= alkres ? `Above the ${fmt(alkres)} mg/L target — pH should hold` : "Below the target — pH will fall and nitrification will stall" });
      if (left < alkres) {
        const short = alkres - left;                            /* mg/L as CaCO₃ */
        const kgCaCO3 = (q * short) / 1000;
        out.push({ label: "Alkalinity shortfall", value: fmt(short), unit: "mg/L as CaCO₃", tone: "warn",
          hint: `${fmt(kgCaCO3)} kg/d as CaCO₃` });
        /* DEFECT 1 — v.alkali.startsWith() threw on an unset select */
        const aName = sel(v.alkali, "Lime — Ca(OH)₂, 90 % available");
        const spec = aName.startsWith("Lime") ? { eq: 37.05, pur: 90, name: "Ca(OH)₂" }
          : aName.startsWith("Caustic") ? { eq: 40.00, pur: 100, name: "NaOH" }
          : { eq: 53.00, pur: 99, name: "Na₂CO₃" };
        const dose = (kgCaCO3 * (spec.eq / 50.04)) / (spec.pur / 100);
        out.push({ label: `Alkali dose as ${spec.name}`, value: fmt(dose), unit: "kg/d", tone: "key",
          hint: `${fmt((dose * 1000) / q)} mg/L of ${spec.name} at ${spec.pur} % purity` });
      }
    } else {
      out.push({ label: "Alkalinity", value: "Enter the influent alkalinity to get the dosing requirement", tone: "warn" });
    }

    /* carbon source */
    if (nRed > 0) {
      const meoh = 2.47 * no3 + 1.53 * no2 + 0.87 * doR;        /* mg/L methanol */
      out.push({ label: "Methanol demand", value: fmt(meoh), unit: "mg/L", tone: "key",
        hint: `${fmt((q * meoh) / 1000)} kg/d · 2.47 NO₃-N + 1.53 NO₂-N + 0.87 DO` });
      out.push({ label: "…as pure methanol volume", value: fmt((q * meoh) / 1000 / 0.792), unit: "L/d",
        hint: "Density 0.792 kg/L at 20 °C" });
      out.push({ label: "Biomass produced on methanol", value: fmt(0.27 * ((q * meoh) / 1000)), unit: "kg VSS/d",
        hint: "Y ≈ 0.27 kg VSS/kg methanol — adds to the sludge to be handled" });
      const cod = num(v.cod);
      if (isFinite(cod)) {
        const need = 4.0 * no3;
        out.push({ label: "Readily biodegradable COD needed", value: fmt(need), unit: "mg/L",
          hint: "About 4 kg COD per kg NO₃-N for wastewater carbon; 3–6 depending on the substrate" });
        out.push({ label: "Carbon sufficiency", value: cod >= need ? "Internal carbon is sufficient" : "External carbon source required",
          tone: cod >= need ? "ok" : "warn",
          hint: cod >= need ? `${fmt(cod - need)} mg/L COD to spare` : `Shortfall ${fmt(need - cod)} mg/L COD` });
      }
      const cn = isFinite(num(v.cod)) ? num(v.cod) / no3 : NaN;
      if (isFinite(cn)) out.push({ label: "COD / NO₃-N ratio", value: fmt(cn),
        hint: "Below about 4 the denitrification rate is carbon-limited" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   7 — Chlorination and disinfection
   --------------------------------------------------------------------------- */
{
  id: "chlor", mod: "plant", tier: "routine", name: "Chlorination & Disinfection", sub: "Dose, demand, chemical consumption, CT and log removal",
  formula: "Demand = Dose − Residual        Chemical (kg/d) = Q (m³/d) × Dose (mg/L) / 1000 ÷ (available Cl fraction)\nCT = Residual × contact time        Log removal = log₁₀(N₀/N)",
  ref: "Residual chlorine by APHA 4500-Cl G (DPD colorimetric) or 4500-Cl B; IS 3025 (Part 26). CPHEEO Manual on Water Supply and Treatment, and CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013, Part A, Chapter 6 — disinfection. Total residual chlorine in effluent to inland surface water is limited to 1.0 mg/L by Schedule VI of the Environment (Protection) Rules, 1986 — a high residual is a violation, not a safety margin. Bleaching powder loses available chlorine on storage; assay each consignment rather than assuming 33 %. CT criteria for a given log inactivation are pathogen-, pH- and temperature-specific — take them from the applicable guidance, this routine only computes the CT achieved.",
  inputs: [
    N("q", "Flow, Q", "m³/d", ""),
    N("dose", "Chlorine dose applied", "mg/L", ""),
    N("res", "Residual chlorine after contact", "mg/L", ""),
    S("src", "Chlorine source", Object.keys(CL_SOURCES), Object.keys(CL_SOURCES)[1]),
    N("assay", "Available chlorine, if entering my own", "% w/w or w/v", ""),
    N("vol", "Contact tank volume", "m³", "", "Gives the actual contact time at this flow"),
    N("t10", "Baffling factor, t₁₀/T", "", "0.7", "1.0 plug flow · 0.7 baffled · 0.3 poorly baffled · 0.1 unbaffled"),
    N("n0", "Faecal coliform before", "MPN/100 mL", ""),
    N("n1", "Faecal coliform after", "MPN/100 mL", ""),
  ],
  run: (v) => {
    const q = num(v.q), dose = num(v.dose);
    if (![q, dose].every(isFinite) || q <= 0 || dose < 0) return null;
    const res = num(v.res);
    const out = [];

    if (isFinite(res)) {
      out.push({ label: "Chlorine demand", value: fmt(dose - res), unit: "mg/L", tone: "key",
        hint: dose - res < 0 ? "Residual exceeds the dose — impossible, check both figures" : "Consumed by ammonia, organics, sulphide and iron" });
      if (dose - res < 0) out.push({ label: "Check", value: "Residual is higher than the dose applied", tone: "warn" });
      out.push({ label: "Chlorine consumed", value: fmt((q * Math.max(dose - res, 0)) / 1000), unit: "kg Cl₂/d" });
    }

    /* DEFECT 1 — v.src was read with .includes() further down and threw when
       the select was untouched */
    const srcName = sel(v.src, Object.keys(CL_SOURCES)[1]);
    const srcDefault = CL_SOURCES[srcName];
    const avail = srcDefault === null || srcDefault === undefined ? num(v.assay) : srcDefault;
    const clKg = (q * dose) / 1000;
    out.push({ label: "Chlorine to be applied", value: fmt(clKg), unit: "kg Cl₂/d", tone: "key" });
    if (isFinite(avail) && avail > 0) {
      const chem = clKg / (avail / 100);
      out.push({ label: "Available chlorine assumed", value: fmt(avail), unit: "%",
        hint: CL_SOURCES[srcName] === null ? "As entered" : "Source default — assay your consignment" });
      out.push({ label: "Chemical required", value: fmt(chem), unit: "kg/d", tone: "key",
        hint: `${fmt(chem * 30)} kg/month · ${fmt(chem / 24)} kg/h` });
      if (srcName.includes("hypochlorite") && srcName.includes("w/v"))
        out.push({ label: "…as solution volume", value: fmt(chem), unit: "L/d",
          hint: "For a % w/v hypochlorite the kg of available chlorine per litre is the % divided by 100, so kg/d and L/d coincide" });
    } else {
      out.push({ label: "Chemical required", value: "Enter the available chlorine assay", tone: "warn" });
    }

    /* contact time and CT */
    const vol = num(v.vol);
    if (isFinite(vol) && vol > 0) {
      const T = (vol / q) * 24 * 60;                      /* min, theoretical */
      const bf = dpos(num(v.t10), 0.7);
      const t10 = T * bf;
      out.push({ label: "Theoretical contact time, V/Q", value: fmt(T), unit: "min" });
      out.push({ label: "Effective contact time, t₁₀", value: fmt(t10), unit: "min", tone: "key",
        hint: `Baffling factor ${fmt(bf)} — CPHEEO expects at least 30 min at peak flow` });
      if (t10 < 30) out.push({ label: "Contact time check", value: "Below 30 min effective contact — inadequate for reliable disinfection", tone: "warn" });
      if (isFinite(res)) {
        out.push({ label: "CT achieved", value: fmt(res * t10), unit: "mg·min/L", tone: "key",
          hint: "Compare against the CT required for your target organism, pH and temperature" });
      }
    }

    if (isFinite(res)) {
      out.push({ label: "Residual against Schedule VI (1.0 mg/L, inland surface water)",
        value: res <= 1.0 ? "Within limit" : "Exceeds limit", tone: res <= 1.0 ? "ok" : "warn",
        hint: `${fmt(res)} mg/L — ${((res / 1.0) * 100).toFixed(0)} % of the limit` });
      if (res > 1.0) out.push({ label: "Action", value: "Reduce the dose or dechlorinate before discharge — excess residual is toxic to receiving-water biota", tone: "warn" });
    }

    const n0 = num(v.n0), n1 = num(v.n1);
    if ([n0, n1].every(isFinite) && n0 > 0 && n1 > 0) {
      out.push({ label: "Log₁₀ removal achieved", value: fmt(Math.log10(n0 / n1), 3), tone: "key" });
      out.push({ label: "Percent removal", value: fmt((1 - n1 / n0) * 100, 6), unit: "%" });
      out.push({ label: "Survival ratio", value: `1 in ${fmt(n0 / n1, 3)}` });
    } else if ([n0, n1].every(isFinite)) {
      out.push({ label: "Log removal", value: "Both counts must be above zero — report a non-detect as the detection limit, not as zero", tone: "warn" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   8 — Sludge production, thickening and digestion
   --------------------------------------------------------------------------- */
{
  id: "sludge", mod: "plant", tier: "advanced", name: "Sludge Production & Digestion", sub: "Primary and biological sludge, volumes, VS destruction, gas",
  formula: "P_x = Y·Q·(S₀−S) / (1 + k_d·θ_c)        V = M / (1000 · SG · P_s/100)\nVan Kleeck:  VS destroyed % = (V_i − V_e) / (V_i − V_i·V_e) × 100",
  ref: "CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013, Part A, Chapter 7 — sludge treatment and disposal; Metcalf & Eddy, Wastewater Engineering, 5th ed., Ch. 13. Total and volatile solids by APHA 2540 B and 2540 E / IS 3025 (Parts 15 and 18). Van Kleeck expression takes V_i and V_e as decimal fractions of VS in TS and assumes the fixed solids are conserved — it fails where grit or chemical solids enter or leave the digester, in which case use the mass-balance method. Gas yield 0.75–1.12 m³ per kg VS destroyed, commonly taken as 0.9; digester gas 60–70 % CH₄ with a net calorific value of about 22–23 MJ/m³. Mesophilic digestion SRT 15–20 d at 35 °C; volatile solids loading 1.6–4.8 kg VS/m³·d. Specific gravity of primary sludge ≈ 1.02 and of waste activated sludge ≈ 1.005.",
  inputs: [
    N("q", "Flow, Q", "m³/d", ""),
    N("tssin", "Influent TSS", "mg/L", ""),
    N("prem", "TSS removed in the primary", "%", "60", "0 if the plant has no primary settling"),
    N("s0", "BOD entering aeration, S₀", "mg/L", ""),
    N("s", "BOD leaving, S", "mg/L", ""),
    N("y", "Yield coefficient, Y", "kg VSS/kg BOD", "0.6"),
    N("kd", "Decay coefficient, k_d", "1/d", "0.06"),
    N("srt", "Sludge age, θ_c", "d", "10"),
    N("psol", "Primary sludge solids", "% dry solids", "4.0"),
    N("wsol", "Waste activated sludge solids", "% dry solids", "0.8"),
    N("thick", "Solids after thickening / dewatering", "% dry solids", "", "Optional — gives the cake volume"),
    N("vsi", "VS in the digester feed", "% of TS", "", "For the digestion block"),
    N("vse", "VS in the digested sludge", "% of TS", ""),
    N("gasy", "Gas yield", "m³ per kg VS destroyed", "0.9"),
    N("ch4", "Methane in the digester gas", "% v/v", "65"),
    N("dvol", "Digester volume", "m³", "", "Optional — gives SRT and VS loading"),
  ],
  run: (v) => {
    const q = num(v.q);
    if (!isFinite(q) || q <= 0) return null;
    const out = [];
    let mPri = 0, mBio = 0;

    /* DEFECT 2 — `num(v.prem) ?? 60` was dead code, and 0 % is an explicitly
       documented entry (no primary settling), so dflt is required here */
    const tss = num(v.tssin), prem = dflt(num(v.prem), 60);
    if (isFinite(tss)) {
      mPri = (q * tss * (prem / 100)) / 1000;
      out.push({ label: "Primary sludge solids", value: fmt(mPri), unit: "kg TSS/d", tone: "key",
        hint: `${fmt(prem)} % of ${fmt(tss)} mg/L influent TSS` });
      out.push({ label: "TSS carried to secondary treatment", value: fmt(tss * (1 - prem / 100)), unit: "mg/L" });
    }

    const s0 = num(v.s0), s = num(v.s);
    if ([s0, s].every(isFinite) && s0 > s) {
      const Y = dpos(num(v.y), 0.6), kd = dflt(num(v.kd), 0.06), srt = dpos(num(v.srt), 10);
      const bodRem = (q * (s0 - s)) / 1000;
      mBio = (Y * bodRem) / (1 + kd * srt);
      out.push({ label: "BOD removed biologically", value: fmt(bodRem), unit: "kg/d" });
      out.push({ label: "Observed yield at this sludge age", value: fmt(Y / (1 + kd * srt)), unit: "kg VSS/kg BOD",
        hint: `Y ${fmt(Y)} / (1 + ${fmt(kd)} × ${fmt(srt)})` });
      out.push({ label: "Biological sludge, P_x", value: fmt(mBio), unit: "kg VSS/d", tone: "key" });
      out.push({ label: "…as total solids", value: fmt(mBio / 0.8), unit: "kg TSS/d",
        hint: "Taking VSS/TSS ≈ 0.8 in waste activated sludge — measure it" });
    }

    const mTot = mPri + mBio / 0.8;
    if (mTot <= 0) return [{ label: "Input needed", value: "Enter influent TSS, or the BOD in and out, to get a sludge quantity", tone: "warn" }];
    out.push({ label: "Total sludge solids", value: fmt(mTot), unit: "kg TSS/d", tone: "key",
      hint: `${fmt((mTot * 1000) / q)} mg/L on the plant flow · ${fmt(mTot / 1000)} t/d` });

    /* volumes */
    const ps = dpos(num(v.psol), 4.0), ws = dpos(num(v.wsol), 0.8);
    if (mPri > 0) out.push({ label: "Primary sludge volume", value: fmt(mPri / (1000 * 1.02 * (ps / 100))), unit: "m³/d",
      hint: `${fmt(ps)} % DS, SG 1.02` });
    if (mBio > 0) out.push({ label: "Waste activated sludge volume", value: fmt((mBio / 0.8) / (1000 * 1.005 * (ws / 100))), unit: "m³/d",
      hint: `${fmt(ws)} % DS, SG 1.005` });
    const vTot = (mPri > 0 ? mPri / (1000 * 1.02 * (ps / 100)) : 0) + (mBio > 0 ? (mBio / 0.8) / (1000 * 1.005 * (ws / 100)) : 0);
    out.push({ label: "Combined sludge volume", value: fmt(vTot), unit: "m³/d", tone: "key",
      hint: `${fmt((vTot / q) * 100)} % of the plant flow` });
    const th = num(v.thick);
    if (isFinite(th) && th > 0) {
      const vc = mTot / (1000 * 1.03 * (th / 100));
      out.push({ label: `Volume at ${fmt(th)} % DS`, value: fmt(vc), unit: "m³/d", tone: "key",
        hint: `Volume reduction ${fmt((1 - vc / vTot) * 100)} % · ${fmt(vc * 1.03)} t/d wet cake` });
      out.push({ label: "Water to be removed", value: fmt(vTot - vc), unit: "m³/d",
        hint: "Returns to the plant as filtrate or centrate and carries load with it" });
    }

    /* digestion */
    const vsi = num(v.vsi), vse = num(v.vse);
    if ([vsi, vse].every(isFinite) && vsi > 0 && vse > 0 && vsi < 100 && vse < 100) {
      const Vi = vsi / 100, Ve = vse / 100;
      const vsd = ((Vi - Ve) / (Vi - Vi * Ve)) * 100;
      const vsFed = mTot * Vi;
      const vsDest = vsFed * (vsd / 100);
      out.push({ label: "VS fed to the digester", value: fmt(vsFed), unit: "kg VS/d", tone: "key" });
      out.push({ label: "VS destruction, Van Kleeck", value: fmt(vsd), unit: "%", tone: "key",
        hint: vsd < 40 ? "Below 40 % — under-digested, check SRT, temperature and mixing" : vsd > 65 ? "Above 65 % — unusually high, verify the VS determinations" : "40–60 % is normal mesophilic performance" });
      out.push({ label: "VS destroyed", value: fmt(vsDest), unit: "kg VS/d" });
      out.push({ label: "Digested solids out", value: fmt(mTot - vsDest), unit: "kg TSS/d",
        hint: `Mass reduction ${fmt((vsDest / mTot) * 100)} %` });
      if (Ve >= Vi) out.push({ label: "Check", value: "VS in the digested sludge is not lower than in the feed — no destruction indicated", tone: "warn" });

      const gy = dpos(num(v.gasy), 0.9), ch4 = dpos(num(v.ch4), 65);
      const gas = vsDest * gy;
      const cv = (ch4 / 100) * 35.8;
      out.push({ label: "Digester gas produced", value: fmt(gas), unit: "m³/d", tone: "key",
        hint: `${fmt(gy)} m³/kg VS destroyed · ${fmt(gas / 24)} m³/h` });
      out.push({ label: "Methane in that gas", value: fmt((gas * ch4) / 100), unit: "m³ CH₄/d" });
      out.push({ label: "Net calorific value of the gas", value: fmt(cv), unit: "MJ/m³", hint: `${fmt(ch4)} % CH₄ at 35.8 MJ/Nm³` });
      out.push({ label: "Energy in the gas", value: fmt((gas * cv) / 1000), unit: "GJ/d", tone: "key",
        hint: `${fmt((gas * cv) / 4186.8)} Gcal/d` });
      out.push({ label: "Electricity at 35 % CHP efficiency", value: fmt((gas * cv * 0.35) / 3600), unit: "MWh/d",
        hint: `${fmt((gas * cv * 0.35) / 3600 / 24 * 1000)} kW continuous` });

      const dv = num(v.dvol);
      if (isFinite(dv) && dv > 0 && vTot > 0) {
        out.push({ label: "Digester SRT", value: fmt(dv / vTot), unit: "d", tone: "key",
          hint: dv / vTot < 15 ? "Below 15 d — mesophilic digestion will be incomplete and pathogen reduction unreliable" : "15–20 d is the usual mesophilic range" });
        const load = vsFed / dv;
        out.push({ label: "Volatile solids loading", value: fmt(load), unit: "kg VS/m³·d", tone: "key",
          hint: load > 4.8 ? "Above 4.8 kg VS/m³·d — overloaded, expect VFA accumulation and souring" : "1.6–4.8 kg VS/m³·d is the usual range" });
      }
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   9 — SBR / MBBR / MBR loading
   --------------------------------------------------------------------------- */
{
  id: "sbrmbr", mod: "plant", tier: "advanced", name: "SBR, MBBR & MBR Loading", sub: "Cycle capacity, carrier surface loading, membrane flux",
  formula: "SBR:  Q = n_tanks · (24/t_cycle) · VER · V        VER = V_decant / V_total\nMBBR:  SALR = Q·(S₀−S) / (V · fill · SSA)        MBR:  J = Q_p / A_m",
  ref: "CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013, Part A, Chapter 5 and its treatment-technology annexure; Metcalf & Eddy, Wastewater Engineering, 5th ed., Ch. 8 (SBR), Ch. 9 (attached growth) and Ch. 8-12 (membrane bioreactors). Guidance: SBR volumetric exchange ratio 0.20–0.40 with 3–6 cycles per tank per day; MBBR carrier specific surface area 350–1200 m²/m³ at 40–67 % fill, surface area loading rate 4–8 g BOD/m²·d for carbon removal and 0.8–2.0 g NH₄-N/m²·d for nitrification; submerged MBR net flux 15–25 L/m²·h with a transmembrane pressure of 0.1–0.5 bar. Carrier specific surface area and membrane area must come from the supplier's datasheet — do not assume them.",
  inputs: [
    S("mode", "System", ["SBR — sequencing batch reactor", "MBBR — moving bed biofilm reactor", "MBR — membrane bioreactor"], "SBR — sequencing batch reactor"),
    N("q", "Flow to be treated, Q", "m³/d", ""),
    N("s0", "BOD or COD in", "mg/L", ""),
    N("s", "BOD or COD out", "mg/L", ""),
    N("vol", "Reactor volume per tank, V", "m³", "", "SBR and MBBR"),
    N("tanks", "Number of tanks / trains", "", "2", "SBR"),
    N("tcyc", "Cycle time", "h", "6", "SBR — fill, react, settle, decant, idle"),
    N("ver", "Volumetric exchange ratio, VER", "", "0.3", "SBR — decant volume as a fraction of the full tank"),
    N("fill", "Carrier filling ratio", "% of reactor volume", "50", "MBBR"),
    N("ssa", "Carrier protected specific surface area", "m²/m³ of carrier", "", "MBBR — from the supplier datasheet"),
    N("nh4", "NH₄-N to be nitrified", "mg/L", "", "MBBR — for the nitrification loading check"),
    N("am", "Total membrane area, A_m", "m²", "", "MBR"),
    N("tmp", "Transmembrane pressure", "bar", "", "MBR"),
    N("uptime", "Net-to-gross permeation ratio", "", "0.9", "MBR — accounts for relaxation and backwash"),
  ],
  run: (v) => {
    const q = num(v.q);
    if (!isFinite(q) || q <= 0) return null;
    /* DEFECT 1 — v.mode.startsWith() threw on an unset select */
    const mode = sel(v.mode, "SBR — sequencing batch reactor");
    const s0 = num(v.s0), s = num(v.s);
    const out = [];
    const loadKg = [s0, s].every(isFinite) ? (q * (s0 - s)) / 1000 : NaN;
    if (isFinite(loadKg)) out.push({ label: "Organic load to be removed", value: fmt(loadKg), unit: "kg/d", tone: "key" });

    if (mode.startsWith("SBR")) {
      const V = num(v.vol), nt = dpos(num(v.tanks), 2), tc = dpos(num(v.tcyc), 6), ver = dpos(num(v.ver), 0.3);
      if (!isFinite(V) || V <= 0) return [...out, { label: "Input needed", value: "Enter the reactor volume per tank", tone: "warn" }];
      const cyclesPerTank = 24 / tc;
      const cap = nt * cyclesPerTank * ver * V;
      out.push({ label: "Cycles per tank per day", value: fmt(cyclesPerTank), hint: `${fmt(tc)} h cycle` });
      out.push({ label: "Total cycles per day", value: fmt(nt * cyclesPerTank) });
      out.push({ label: "Decant volume per cycle", value: fmt(ver * V), unit: "m³", hint: `VER ${fmt(ver)} of ${fmt(V)} m³` });
      out.push({ label: "Hydraulic capacity", value: fmt(cap), unit: "m³/d", tone: "key" });
      out.push({ label: "Capacity utilisation", value: fmt((q / cap) * 100), unit: "%",
        tone: q <= cap ? "ok" : "warn",
        hint: q <= cap ? `${fmt(cap - q)} m³/d spare` : `Short by ${fmt(q - cap)} m³/d — lengthen the cycle count, raise VER, or add a train` });
      out.push({ label: "Effective HRT", value: fmt(((nt * V) / q) * 24), unit: "h", tone: "key",
        hint: "Total reactor volume divided by flow" });
      out.push({ label: "Fill time needed per cycle at this flow", value: fmt(((ver * V) / q) * 24, 3), unit: "h",
        hint: `Decant volume ÷ inflow rate — must fit inside the ${fmt(tc)} h cycle alongside react, settle and decant` });
      if (ver > 0.5) out.push({ label: "VER check", value: "Above 0.5 — the blanket has little freeboard and solids will carry over on decant", tone: "warn" });
      if (isFinite(loadKg)) out.push({ label: "Volumetric organic loading", value: fmt(loadKg / (nt * V)), unit: "kg/m³·d" });
      return out;
    }

    if (mode.startsWith("MBBR")) {
      const V = num(v.vol), fillPct = dpos(num(v.fill), 50), ssa = num(v.ssa);
      if (!isFinite(V) || V <= 0 || !isFinite(ssa) || ssa <= 0)
        return [...out, { label: "Input needed", value: "Enter the reactor volume and the carrier specific surface area from the datasheet", tone: "warn" }];
      const carrierVol = V * (fillPct / 100);
      const area = carrierVol * ssa;
      out.push({ label: "Carrier volume", value: fmt(carrierVol), unit: "m³", hint: `${fmt(fillPct)} % fill of ${fmt(V)} m³` });
      out.push({ label: "Protected biofilm area", value: fmt(area), unit: "m²", tone: "key",
        hint: `${fmt(ssa)} m²/m³ of carrier` });
      if (fillPct > 67) out.push({ label: "Fill check", value: "Above 67 % — carriers will not circulate freely, most suppliers cap the fill here", tone: "warn" });
      if (isFinite(loadKg)) {
        const salr = (loadKg * 1000) / area;
        out.push({ label: "Surface area loading rate", value: fmt(salr), unit: "g/m²·d", tone: "key" });
        out.push({ label: "…against the carbon-removal envelope", value: salr >= 4 && salr <= 8 ? "Within range" : salr < 4 ? "Below range" : "Above range",
          tone: salr >= 4 && salr <= 8 ? "ok" : "warn", hint: "4–8 g BOD/m²·d for carbonaceous removal" });
        out.push({ label: "Volumetric loading", value: fmt(loadKg / V), unit: "kg/m³·d" });
      }
      const nh4 = num(v.nh4);
      if (isFinite(nh4)) {
        const nsalr = ((q * nh4) / 1000 * 1000) / area;
        out.push({ label: "Ammonia surface loading rate", value: fmt(nsalr), unit: "g NH₄-N/m²·d", tone: "key" });
        out.push({ label: "…against the nitrification envelope", value: nsalr <= 2.0 ? "Within range" : "Above range",
          tone: nsalr <= 2.0 ? "ok" : "warn",
          hint: "0.8–2.0 g NH₄-N/m²·d; nitrification also needs DO above 3 mg/L and BOD loading kept low" });
      }
      out.push({ label: "HRT", value: fmt((V / q) * 24), unit: "h" });
      return out;
    }

    /* MBR */
    const am = num(v.am);
    if (!isFinite(am) || am <= 0) return [...out, { label: "Input needed", value: "Enter the total installed membrane area", tone: "warn" }];
    const up = dpos(num(v.uptime), 0.9);
    const grossLmh = (q * 1000) / am / 24;
    const netLmh = grossLmh * up;
    out.push({ label: "Gross flux", value: fmt(grossLmh), unit: "L/m²·h", tone: "key",
      hint: `${fmt(q)} m³/d over ${fmt(am)} m²` });
    out.push({ label: "Net flux", value: fmt(netLmh), unit: "L/m²·h", tone: "key",
      hint: `Net-to-gross ${fmt(up)} — relaxation and backwash subtracted` });
    out.push({ label: "…against the envelope", value: netLmh >= 15 && netLmh <= 25 ? "Within range" : netLmh < 15 ? "Below range — conservative" : "Above range",
      tone: netLmh <= 25 ? "ok" : "warn",
      hint: "15–25 L/m²·h net for submerged hollow fibre or flat sheet; sustained operation above this accelerates irreversible fouling" });
    const tmp = num(v.tmp);
    if (isFinite(tmp) && tmp > 0) {
      out.push({ label: "Permeability", value: fmt(netLmh / tmp), unit: "L/m²·h·bar", tone: "key",
        hint: "Track this against time at constant temperature — a falling permeability is the fouling signal, not the flux itself" });
      out.push({ label: "Transmembrane pressure", value: fmt(tmp), unit: "bar",
        tone: tmp <= 0.5 ? "ok" : "warn",
        hint: tmp > 0.5 ? "Above 0.5 bar — clean the membrane, do not raise the suction" : "0.1–0.5 bar is the normal operating window" });
    }
    out.push({ label: "Specific membrane area", value: fmt(am / q * 1000, 4), unit: "m² per m³/d",
      hint: "Useful for comparing tenders on a like-for-like basis" });
    return out;
  },
},

/* -----------------------------------------------------------------------------
   10 — CETP blend and load share
   --------------------------------------------------------------------------- */
{
  id: "cetp", mod: "plant", tier: "advanced", name: "CETP Blend & Load Share", sub: "Mixed inlet concentration, member contribution, dilution needed",
  formula: "C_mix = Σ(Q_i·C_i) / ΣQ_i        Load_i = Q_i·C_i / 1000  kg/d        Share_i = Load_i / ΣLoad",
  ref: "Mass balance on the combined inlet stream. Inlet acceptance limits for member units of a common effluent treatment plant are set by the CETP's consent to establish and operate and by the agreement with each member unit; they are not general standards, so this routine takes the limit as an input. CETP outlet standards are prescribed under the Environment (Protection) Rules, 1986 — VERIFY the entry applicable to your CETP category and the consent condition, and note that a member unit may separately be a notified Schedule I industry with its own pre-treatment standards. Determinands by IS 3025 series / APHA 24th ed. Flow-weighted blending assumes complete mixing in the collection system and no reaction en route — sulphide generation and ammonia stripping in long rising mains both break that assumption.",
  inputs: [
    S("param", "Parameter", Object.keys(TREAT_PARAMS), "COD"),
    { id: "units", type: "pairs", label: "Member unit — flow (m³/d), concentration (mg/L)",
      hint: "One member per line — e.g.\n120, 4500\n340, 1800\n85, 12000\n900, 650" },
    N("inlim", "CETP inlet acceptance limit", "mg/L", "", "From the consent or the member agreement"),
    N("qdes", "CETP design hydraulic capacity", "m³/d", ""),
    N("cdes", "CETP design inlet concentration", "mg/L", ""),
    N("peak", "Peak factor to apply", "", "1.0", "For a shock-load check"),
  ],
  run: (v) => {
    const pts = parsePairs(v.units).filter((p) => p.x > 0);
    if (pts.length < 1) return null;
    /* DEFECT 1 — TREAT_PARAMS[v.param] was undefined with the select unset and
       p.unit then threw */
    const pName = sel(v.param, "COD");
    const p = TREAT_PARAMS[pName] || TREAT_PARAMS["COD"];
    const qTot = pts.reduce((a, b) => a + b.x, 0);
    const massTot = pts.reduce((a, b) => a + (b.x * b.y) / 1000, 0);
    const cmix = (massTot * 1000) / qTot;

    const rows = pts.map((pt, i) => ({
      i: i + 1, q: pt.x, c: pt.y, load: (pt.x * pt.y) / 1000,
    })).sort((a, b) => b.load - a.load);

    const out = [
      { label: "Member units entered", value: pts.length },
      { label: "Total flow received", value: fmt(qTot), unit: "m³/d", tone: "key", hint: `${fmt(qTot / 1000)} MLD` },
      { label: `Blended inlet ${pName}`, value: fmt(cmix), unit: p.unit, tone: "key",
        hint: "Flow-weighted mean, complete mixing assumed" },
      { label: "Total mass load", value: fmt(massTot), unit: "kg/d", tone: "key" },
      { label: "Highest contributor", value: `Line ${rows[0].i}`,
        hint: `${fmt(rows[0].q)} m³/d at ${fmt(rows[0].c)} mg/L → ${fmt(rows[0].load)} kg/d, ${((rows[0].load / massTot) * 100).toFixed(0)} % of the load on ${((rows[0].q / qTot) * 100).toFixed(0)} % of the flow` },
      ...rows.slice(0, 12).map((r) => ({
        label: `Line ${r.i} — ${fmt(r.q)} m³/d at ${fmt(r.c)} mg/L`,
        value: fmt(r.load), unit: "kg/d",
        hint: `${((r.load / massTot) * 100).toFixed(1)} % of load · ${((r.q / qTot) * 100).toFixed(1)} % of flow`,
      })),
    ];
    if (rows.length > 12) out.push({ label: "Note", value: `Only the 12 largest contributors are listed; ${rows.length - 12} more were included in the totals` });

    const lim = num(v.inlim);
    if (isFinite(lim) && lim > 0) {
      const bad = rows.filter((r) => r.c > lim);
      out.push({ label: "Members above the inlet limit", value: bad.length, tone: bad.length ? "warn" : "ok",
        hint: bad.length ? `Lines ${bad.map((b) => b.i).join(", ")}` : `All member streams at or below ${fmt(lim)} mg/L` });
      out.push({ label: "Blended stream against the inlet limit", value: cmix <= lim ? "Within the limit" : "Exceeds the limit",
        tone: cmix <= lim ? "ok" : "warn", hint: `${((cmix / lim) * 100).toFixed(0)} % of ${fmt(lim)} mg/L` });
      if (cmix > lim) {
        const qNeed = (massTot * 1000) / lim - qTot;
        out.push({ label: "Dilution flow that would bring the blend to the limit", value: fmt(qNeed), unit: "m³/d of clean water", tone: "warn",
          hint: "Dilution is not treatment and most consents prohibit it — this figure is to size the problem, not to solve it" });
        out.push({ label: "Load that must instead be removed at source", value: fmt(massTot - (qTot * lim) / 1000), unit: "kg/d", tone: "key" });
      }
    }

    const qdes = num(v.qdes), cdes = num(v.cdes);
    if (isFinite(qdes) && qdes > 0) {
      const hu = (qTot / qdes) * 100;
      out.push({ label: "Hydraulic utilisation", value: fmt(hu), unit: "% of design", tone: hu > 100 ? "warn" : "ok" });
    }
    if (isFinite(cdes) && cdes > 0 && isFinite(qdes) && qdes > 0) {
      const lDes = (qdes * cdes) / 1000;
      out.push({ label: "Design mass load", value: fmt(lDes), unit: "kg/d" });
      out.push({ label: "Organic load utilisation", value: fmt((massTot / lDes) * 100), unit: "% of design", tone: massTot > lDes ? "warn" : "ok",
        hint: massTot > lDes ? `Overloaded by ${fmt(massTot - lDes)} kg/d — the biology, not the hydraulics, is the constraint` : "" });
    }

    const pk = dpos(num(v.peak), 1);
    if (pk > 1) {
      out.push({ label: `Blended concentration at a peak factor of ${fmt(pk)}`, value: fmt(cmix * pk), unit: p.unit, tone: "key",
        hint: "Applies the factor to concentration, which is the worse case for the biology; applying it to flow instead stresses the hydraulics" });
      if (isFinite(qdes) && qdes > 0)
        out.push({ label: "…and at peak flow", value: fmt((qTot * pk / qdes) * 100), unit: "% of design flow",
          tone: (qTot * pk) > qdes ? "warn" : "ok" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   11 — CETP inlet inhibition screening
   --------------------------------------------------------------------------- */
{
  id: "inhibit", mod: "plant", tier: "advanced", name: "Biological Inhibition Screening", sub: "Toxicity thresholds for an activated-sludge biomass",
  formula: "Compare the concentration in the mixed influent against the reported inhibition threshold",
  ref: "Screening thresholds compiled from the USEPA Nitrogen Control Manual, EPA/625/R-93/010, for the nitrification set and Metcalf & Eddy, Wastewater Engineering, 5th ed., for the heterotroph values. These are literature concentrations at which inhibition is commonly reported — NOT statutory limits, and NOT a substitute for a respirometric inhibition test on your own biomass (ISO 8192 for activated sludge, OECD 209 for respiration inhibition). Reported thresholds vary widely with acclimatisation, metal speciation and complexation, and solids concentration, and a shock load matters more than the mean. No acclimatisation allowance is applied here, because the size of that allowance is site-specific and a made-up multiplier would be worse than none. Where no nitrification figure is listed for a substance the routine says so rather than scaling the heterotroph value. Use this to decide what to test, not to conclude that a stream is safe. VERIFY each figure against the source before relying on it.",
  inputs: [
    { id: "tbl", type: "table", label: "Concentration in the mixed influent to the biological stage",
      rows: INHIBIT.map((r) => ({ k: r.k, unit: "mg/L", std: r.t })) },
    S("target", "Treatment objective", ["Carbonaceous removal only", "Carbonaceous removal and nitrification"], "Carbonaceous removal and nitrification"),
  ],
  run: (v) => {
    const t = v.tbl || {};
    const rows = INHIBIT.map((r) => ({ ...r, c: num(t[r.k]) })).filter((r) => isFinite(r.c));
    if (!rows.length) return null;
    /* DEFECT 1 — v.target.includes() threw on an unset select */
    const target = sel(v.target, "Carbonaceous removal and nitrification");
    const nitri = target.includes("nitrification");

    const graded = rows.map((r) => {
      const useNt = nitri && r.nt !== null && r.nt !== undefined;
      const trigger = useNt ? r.nt : r.t;
      return { ...r, trigger, basis: useNt ? "nitrification" : "carbonaceous", ratio: r.c / trigger };
    }).sort((a, b) => b.ratio - a.ratio);
    const flagged = graded.filter((r) => r.ratio >= 1);
    const noNt = nitri ? graded.filter((r) => r.nt === null || r.nt === undefined) : [];

    const out = [
      { label: "Substances entered", value: rows.length },
      { label: "Threshold basis", value: nitri ? "Nitrification where a figure is listed, otherwise carbonaceous" : "Carbonaceous removal",
        hint: "Each threshold is the value published for that substance — no blanket scaling factor is applied" },
      ...graded.map((r) => ({
        label: r.k, value: fmt(r.c), unit: `of ${fmt(r.trigger, 3)} mg/L`,
        tone: r.ratio >= 1 ? "warn" : "ok",
        hint: `${(r.ratio * 100).toFixed(0)} % of the ${r.basis} threshold${r.note ? " · " + r.note : ""}`,
      })),
      { label: "Substances at or above threshold", value: flagged.length, tone: flagged.length ? "warn" : "ok" },
      { label: "Screening outcome",
        value: flagged.length
          ? `Inhibition risk from ${flagged.map((f) => f.k).join(", ")} — run a respirometric inhibition test before accepting the stream`
          : "No substance entered reaches its screening threshold — this is not a clearance, only an absence of flags",
        tone: flagged.length ? "warn" : "ok" },
    ];
    if (noNt.length) out.push({ label: "No nitrification threshold listed", value: noNt.map((r) => r.k).join(", "), tone: "warn",
      hint: "These were graded on the carbonaceous threshold, which for a specific nitrifier toxicant is likely to be far too high — treat a pass on these as unproven" });
    out.push({ label: "Next step", value: flagged.length
        ? "ISO 8192 or OECD 209 inhibition test on your own biomass at the actual mixed-influent concentration, plus source segregation and pre-treatment at the member unit"
        : "Confirm with a periodic respirometric check, and watch for substances not listed here" });
    return out;
  },
},

/* -----------------------------------------------------------------------------
   12 — RO performance
   --------------------------------------------------------------------------- */
{
  id: "ro", mod: "plant", tier: "routine", name: "RO Performance", sub: "Recovery, rejection, flux, concentration factor, specific energy",
  formula: "Y = Q_p/Q_f × 100        R = (1 − C_p/C_f) × 100        CF = ln(1/(1−Y)) / Y\nJ = Q_p/A_m        NDP = (P_f − ΔP/2 − P_p) − (π_c − π_p)        E_s = P_pump / Q_p",
  ref: "ASTM D4516, Standard Practice for Standardizing Reverse Osmosis Performance Data, for flux, normalisation and the temperature correction; ASTM D4194 for test conditions. Salt rejection is on the determinand measured — a rejection quoted on conductivity is not the same as one on a specific ion, and rejection of a single ion may be far lower than the overall figure. The log-mean concentration factor ln(1/(1−Y))/Y is the average across the element; the simple 1/(1−Y) is the value at the concentrate end and is the correct one for a scaling check. Osmotic pressure is estimated as a NaCl equivalent by van't Hoff, π ≈ 8.4×10⁻⁴ × TDS bar at 25 °C — for a high-sulphate or high-silica feed use a proper projection. Product water for potable use must meet IS 10500:2012.",
  inputs: [
    N("qf", "Feed flow, Q_f", "m³/h", "", "Enter any two of feed, permeate and concentrate"),
    N("qp", "Permeate flow, Q_p", "m³/h", ""),
    N("qc", "Concentrate flow, Q_c", "m³/h", ""),
    N("cf", "Feed TDS or conductivity, C_f", "mg/L or µS/cm", ""),
    N("cp", "Permeate TDS or conductivity, C_p", "mg/L or µS/cm", ""),
    N("cc", "Concentrate, measured", "mg/L or µS/cm", "", "Optional — checks the mass balance"),
    N("am", "Total active membrane area", "m²", "", "Element area × number of elements"),
    N("pf", "Feed pressure, P_f", "bar", ""),
    N("dp", "Pressure drop across the stage, ΔP", "bar", "", "Feed pressure minus concentrate pressure"),
    N("pp", "Permeate back pressure, P_p", "bar", "0"),
    N("t", "Feed temperature", "°C", "25"),
    N("kw", "High-pressure pump power drawn", "kW", "", "Optional — gives specific energy"),
  ],
  run: (v) => {
    let qf = num(v.qf), qp = num(v.qp), qc = num(v.qc);
    const known = [qf, qp, qc].filter(isFinite).length;
    if (known < 2) return null;
    if (!isFinite(qf)) qf = qp + qc;
    if (!isFinite(qp)) qp = qf - qc;
    if (!isFinite(qc)) qc = qf - qp;
    if (!(qf > 0) || qp < 0 || qc < 0) return [{ label: "Check", value: "Flows are inconsistent — feed must equal permeate plus concentrate and all three must be positive", tone: "warn" }];

    const Y = (qp / qf) * 100;
    const cfSimple = qp >= qf ? Infinity : 1 / (1 - qp / qf);
    const cfMean = Y > 0 && Y < 100 ? Math.log(1 / (1 - Y / 100)) / (Y / 100) : NaN;

    const out = [
      { label: "Feed flow", value: fmt(qf), unit: "m³/h", hint: `${fmt(qf * 24)} m³/d` },
      { label: "Permeate flow", value: fmt(qp), unit: "m³/h", hint: `${fmt(qp * 24)} m³/d` },
      { label: "Concentrate flow", value: fmt(qc), unit: "m³/h", hint: `${fmt(qc * 24)} m³/d` },
      { label: "Recovery, Y", value: fmt(Y), unit: "%", tone: "key",
        hint: Y > 80 ? "Above 80 % — scaling and low concentrate velocity become the limits" : Y < 30 ? "Below 30 % — high energy per m³ of product" : "" },
      { label: "Concentration factor at the concentrate end, 1/(1−Y)", value: fmt(cfSimple), tone: "key",
        hint: "Use this one for the scaling check — it is the worst case in the element" },
      { label: "Log-mean concentration factor", value: fmt(cfMean),
        hint: "ln(1/(1−Y))/Y — the average the membrane actually sees" },
    ];

    const cf = num(v.cf), cp = num(v.cp);
    if ([cf, cp].every(isFinite) && cf > 0) {
      const R = (1 - cp / cf) * 100;
      out.push({ label: "Salt rejection, R", value: fmt(R, 4), unit: "%", tone: "key" });
      out.push({ label: "Salt passage", value: fmt(100 - R, 4), unit: "%",
        hint: "Track salt passage, not rejection — a rise from 1 % to 2 % is a doubling, and reads as 99 % to 98 %" });
      const ccCalc = qc > 0 ? (cf * qf - cp * qp) / qc : NaN;
      out.push({ label: "Concentrate concentration by mass balance", value: fmt(ccCalc), unit: "mg/L or µS/cm", tone: "key" });
      const ccMeas = num(v.cc);
      if (isFinite(ccMeas) && isFinite(ccCalc) && ccCalc > 0) {
        const err = ((ccMeas - ccCalc) / ccCalc) * 100;
        out.push({ label: "Measured concentrate", value: fmt(ccMeas), unit: "mg/L or µS/cm" });
        out.push({ label: "Mass balance closure", value: fmt(err), unit: "%",
          tone: Math.abs(err) <= 5 ? "ok" : "warn",
          hint: Math.abs(err) <= 5 ? "Closes within ±5 %" : "Outside ±5 % — check the flow meters and the sampling points" });
      }
      if (R < 0) out.push({ label: "Check", value: "Permeate is more concentrated than the feed — sample mix-up, or a badly damaged element", tone: "warn" });
    }

    /* flux */
    const am = num(v.am);
    if (isFinite(am) && am > 0) {
      const lmh = (qp * 1000) / am;
      out.push({ label: "Permeate flux, J", value: fmt(lmh), unit: "L/m²·h", tone: "key" });
      out.push({ label: "…against the usual envelope",
        value: lmh <= 25 ? "Within the usual range" : "Above the usual range",
        tone: lmh <= 25 ? "ok" : "warn",
        hint: "Brackish-water RO design flux is typically 15–25 L/m²·h on good feed and 10–15 on a poor one; higher flux accelerates fouling at the lead element" });
    }

    /* NDP and specific flux */
    /* DEFECT 2 — `num(v.t) ?? 25` was dead code; a feed temperature of 0 °C is
       a legitimate entry so dflt is used */
    const pf = num(v.pf), dp = dflt(num(v.dp), 0), pp = dflt(num(v.pp), 0), t = dflt(num(v.t), 25);
    if (isFinite(pf) && isFinite(cf)) {
      const ccCalc = qc > 0 && isFinite(cp) ? (cf * qf - cp * qp) / qc : cf * cfSimple;
      const piC = osmotic(ccCalc, t), piP = osmotic(isFinite(cp) ? cp : 0, t);
      const ndp = (pf - dp / 2 - pp) - (piC - piP);
      out.push({ label: "Osmotic pressure at the concentrate end", value: fmt(piC), unit: "bar",
        hint: "NaCl equivalent, van't Hoff — approximate" });
      out.push({ label: "Net driving pressure, NDP", value: fmt(ndp), unit: "bar", tone: "key" });
      if (ndp <= 0) out.push({ label: "Check", value: "Net driving pressure is not positive — no permeate can be produced at these conditions", tone: "warn" });
      if (isFinite(am) && am > 0 && ndp > 0) {
        out.push({ label: "Specific flux (permeability)", value: fmt(((qp * 1000) / am) / ndp, 4), unit: "L/m²·h·bar", tone: "key",
          hint: "Normalise to a fixed temperature and NDP and trend it — a 15 % fall is the usual clean-in-place trigger" });
      }
      /* ASTM D4516 temperature correction factor */
      const K = t >= 25 ? 2640 : 3020;
      const tcf = Math.exp(K * (1 / 298 - 1 / (273 + t)));
      out.push({ label: "Temperature correction factor to 25 °C", value: fmt(tcf, 4),
        hint: `ASTM D4516, K = ${K} for polyamide ${t >= 25 ? "at or above" : "below"} 25 °C` });
      out.push({ label: "Permeate flow normalised to 25 °C", value: fmt(qp * tcf), unit: "m³/h",
        hint: "Multiply by the ratio of reference to actual NDP as well, for a full ASTM D4516 normalisation" });
    }

    const kw = num(v.kw);
    if (isFinite(kw) && kw > 0 && qp > 0) {
      out.push({ label: "Specific energy consumption", value: fmt(kw / qp, 4), unit: "kWh/m³ permeate", tone: "key",
        hint: "Brackish-water RO is typically 0.5–1.5 kWh/m³ at the high-pressure pump; a high figure at normal NDP points to pump inefficiency" });
      out.push({ label: "Energy per m³ of feed", value: fmt(kw / qf, 4), unit: "kWh/m³ feed" });
      out.push({ label: "Daily energy", value: fmt(kw * 24), unit: "kWh/d" });
    }
    return out;
  },
},

/* -----------------------------------------------------------------------------
   13 — Scaling indices and SDI
   --------------------------------------------------------------------------- */
{
  id: "scale", mod: "plant", tier: "advanced", name: "Scaling Indices & SDI", sub: "LSI, Ryznar, Puckorius, concentrate-side LSI, silt density index",
  formula: "pH_s = (9.3 + A + B) − (C + D)      LSI = pH − pH_s      RSI = 2 pH_s − pH\nPSI = 2 pH_s − pH_eq,  pH_eq = 1.465 log₁₀(Alk) + 4.54      SDI = (1 − t₁/t₂)/T × 100",
  ref: "Langelier (1936), J. AWWA 28, 1500 — saturation index; Ryznar (1944); Puckorius & Brooke (1991) for the practical scaling index; APHA 2330 B, Calcium Carbonate Saturation, for the method and its limits. Coefficients: A = (log₁₀TDS − 1)/10, B = −13.12 log₁₀(T K) + 34.55, C = log₁₀(Ca as CaCO₃) − 0.4, D = log₁₀(alkalinity as CaCO₃). Valid for TDS below about 10 000 mg/L — above that use the Stiff–Davis index, which uses ionic strength in place of TDS. LSI predicts the direction of the CaCO₃ reaction, not the rate or the quantity; it says nothing about sulphate, silica or fluoride scaling, which are usually the real limit on RO recovery. SDI by ASTM D4189, 0.45 µm filter at 207 kPa, normally over 15 min. Membrane suppliers require SDI₁₅ below 5 and prefer below 3. Calcium as CaCO₃ = Ca as Ca × 2.497.",
  inputs: [
    N("ph", "pH", "", ""),
    N("t", "Temperature", "°C", "25"),
    N("tds", "Total dissolved solids", "mg/L", ""),
    N("ca", "Calcium", "mg/L as Ca", "", "Converted internally to a CaCO₃ basis"),
    N("caco3", "…or calcium already as CaCO₃", "mg/L as CaCO₃", ""),
    N("alk", "Total (M) alkalinity", "mg/L as CaCO₃", ""),
    N("rec", "RO recovery for the concentrate-side check", "%", "", "Optional — recomputes the index at the concentrate end"),
    N("t1", "SDI — time for the first 500 mL", "s", ""),
    N("t2", "SDI — time for 500 mL after the test period", "s", ""),
    N("tt", "SDI — test period, T", "min", "15"),
  ],
  run: (v) => {
    /* DEFECT 2 — `num(v.t) ?? 25` was dead code; 0 °C is a legitimate entry */
    const ph = num(v.ph), t = dflt(num(v.t), 25), tds = num(v.tds), alk = num(v.alk);
    const caAsCaCO3 = isFinite(num(v.caco3)) ? num(v.caco3) : isFinite(num(v.ca)) ? num(v.ca) * 2.497 : NaN;
    const out = [];

    if ([ph, tds, caAsCaCO3, alk].every(isFinite) && tds > 0 && caAsCaCO3 > 0 && alk > 0) {
      const index = (TDS, Ca, Alk, pH) => {
        const A = (Math.log10(TDS) - 1) / 10;
        const B = -13.12 * Math.log10(t + 273.15) + 34.55;
        const C = Math.log10(Ca) - 0.4;
        const D = Math.log10(Alk);
        const pHs = (9.3 + A + B) - (C + D);
        const pHeq = 1.465 * Math.log10(Alk) + 4.54;
        return { A, B, C, D, pHs, lsi: pH - pHs, rsi: 2 * pHs - pH, psi: 2 * pHs - pHeq, pHeq };
      };
      const f = index(tds, caAsCaCO3, alk, ph);
      out.push({ label: "Calcium on a CaCO₃ basis", value: fmt(caAsCaCO3), unit: "mg/L as CaCO₃",
        hint: isFinite(num(v.caco3)) ? "As entered" : `${fmt(num(v.ca))} mg/L as Ca × 2.497` });
      out.push({ label: "A = (log₁₀TDS − 1)/10", value: fmt(f.A, 4) });
      out.push({ label: "B = −13.12 log₁₀(T K) + 34.55", value: fmt(f.B, 4), hint: `T = ${fmt(t + 273.15)} K` });
      out.push({ label: "C = log₁₀(Ca as CaCO₃) − 0.4", value: fmt(f.C, 4) });
      out.push({ label: "D = log₁₀(alkalinity)", value: fmt(f.D, 4) });
      out.push({ label: "pH of saturation, pH_s", value: fmt(f.pHs, 3), tone: "key" });
      out.push({ label: "Langelier saturation index, LSI", value: fmt(f.lsi, 3), tone: "key" });
      out.push({ label: "LSI interpretation",
        value: f.lsi < -0.5 ? "Undersaturated — corrosive, CaCO₃ will dissolve"
          : f.lsi < 0 ? "Slightly undersaturated" : f.lsi === 0 ? "At equilibrium"
          : f.lsi <= 0.5 ? "Slightly supersaturated — scaling possible" : "Supersaturated — CaCO₃ scale will form",
        tone: Math.abs(f.lsi) <= 0.5 ? "ok" : "warn" });
      out.push({ label: "Ryznar stability index, RSI", value: fmt(f.rsi, 3), tone: "key" });
      out.push({ label: "RSI interpretation",
        value: f.rsi < 6 ? "Scale forming" : f.rsi <= 7 ? "Approximately balanced" : f.rsi <= 8.5 ? "Corrosive" : "Strongly corrosive",
        tone: f.rsi >= 6 && f.rsi <= 7 ? "ok" : "warn" });
      out.push({ label: "Equilibrium pH, pH_eq", value: fmt(f.pHeq, 3) });
      out.push({ label: "Puckorius scaling index, PSI", value: fmt(f.psi, 3),
        hint: "Uses the equilibrium pH rather than the measured pH — more reliable in a poorly buffered water" });
      if (tds > 10000) out.push({ label: "Validity", value: "TDS above 10 000 mg/L — the Langelier form is outside its range, use the Stiff–Davis index", tone: "warn" });

      const rec = num(v.rec);
      if (isFinite(rec) && rec > 0 && rec < 100) {
        const CF = 1 / (1 - rec / 100);
        const c = index(tds * CF, caAsCaCO3 * CF, alk * CF, ph);
        out.push({ label: `Concentration factor at ${fmt(rec)} % recovery`, value: fmt(CF), tone: "key" });
        out.push({ label: "Concentrate TDS", value: fmt(tds * CF), unit: "mg/L" });
        out.push({ label: "Concentrate Ca as CaCO₃", value: fmt(caAsCaCO3 * CF), unit: "mg/L" });
        out.push({ label: "Concentrate alkalinity", value: fmt(alk * CF), unit: "mg/L as CaCO₃" });
        out.push({ label: "LSI at the concentrate end", value: fmt(c.lsi, 3), tone: "key",
          hint: "Feed pH is carried over unchanged; in reality pH rises slightly as CO₂ is rejected, so this is a mild under-estimate" });
        out.push({ label: "Concentrate verdict",
          value: c.lsi <= 0 ? "No CaCO₃ scaling indicated at this recovery"
            : c.lsi <= 1.0 ? "Marginal — antiscalant will normally hold it" : "Scaling — acid or antiscalant dosing, or a lower recovery, is required",
          tone: c.lsi <= 0 ? "ok" : "warn" });
        out.push({ label: "Reminder", value: "This is the CaCO₃ check only. BaSO₄, SrSO₄, CaSO₄, CaF₂ and silica saturation must be checked separately — one of those usually caps recovery before CaCO₃ does" });
      }
    } else if ([ph, tds, caAsCaCO3, alk].some(isFinite)) {
      out.push({ label: "Input needed", value: "pH, TDS, calcium and alkalinity are all required, and all must be above zero", tone: "warn" });
    }

    /* SDI */
    const t1 = num(v.t1), t2 = num(v.t2), T = dpos(num(v.tt), 15);
    if ([t1, t2].every(isFinite) && t1 > 0 && t2 > 0) {
      if (t2 < t1) {
        out.push({ label: "SDI", value: "The second reading is faster than the first — no plugging indicated, re-check the test", tone: "warn" });
      } else {
        const sdi = ((1 - t1 / t2) / T) * 100;
        out.push({ label: "Plugging factor, 1 − t₁/t₂", value: fmt((1 - t1 / t2) * 100), unit: "%" });
        out.push({ label: `SDI over ${fmt(T)} min`, value: fmt(sdi, 3), unit: "%/min", tone: "key" });
        out.push({ label: "Suitability for RO",
          value: sdi < 3 ? "Below 3 — suitable, spiral-wound elements will run" : sdi <= 5 ? "3–5 — acceptable but marginal, expect more frequent cleaning" : "Above 5 — pretreatment is inadequate, most warranties are void above 5",
          tone: sdi <= 5 ? (sdi < 3 ? "ok" : "warn") : "warn" });
        if ((1 - t1 / t2) * 100 > 75)
          out.push({ label: "Test validity", value: "Plugging above 75 % — ASTM D4189 requires a shorter test period, repeat at 10 or 5 min and state the period with the result", tone: "warn" });
      }
    }
    return out.length ? out : null;
  },
},

];

export const ROUTINES = PLANT;
export default ROUTINES;
