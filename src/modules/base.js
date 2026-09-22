/* =============================================================================
   Aliquot — src/modules/base.js
   The 51 base routines, from `lab-calculator.jsx`.

   Converted to a DOM-free module: the React UI at the foot of the pack is
   discarded, the reference data, helpers and the CALCS array are kept.

   Every `ref:` string is carried across CHARACTER FOR CHARACTER. Do not
   reword one when refactoring — it is the load-bearing part of the routine.

   TWO METHOD FIXES RE-APPLIED HERE. Both were made on 29 July, exist only as
   prose in claude/roadmap-2026-07-29.md, and are absent from this pack, so a
   straight rebuild would silently reinstate the defects:

     FIX 1  filterpm reporting basis. The pack reduces PM to NTP and then
            grades against NAAQS. CPCB NAAQMS reports PM10 and PM2.5 at
            AMBIENT conditions. On a Delhi summer day the two differ by 7.6 %
            and it flips the verdict. A basis selector now drives the grading,
            ambient by default, with the other basis shown as a secondary row.

     FIX 2  TOX.Pb. USEPA IRIS publishes neither an oral RfD nor an oral slope
            factor for lead — assessment goes through IEUBK and the Adult Lead
            Methodology, not CDI x CSF. Both values are null, and `health`
            returns the CDI with a warn row instead of an HQ and a CR. Cr(VI)
            keeps its values with a VERIFY note on the CR row only.

   Also carried over from the 29 July decisions: the Google Fonts @import and
   the decorative emission-line badges are gone (they lived in the discarded UI
   and the MODULES table respectively).

   Every routine now carries `tier: "routine" | "advanced"`.
   ============================================================================= */

/* ---------- modules ------------------------------------------------------- */

export const MODULES = [
  { id: "qc", name: "QA / QC & Validation", ink: "#4E5BC4",
    blurb: "LOD, MDL, calibration, recovery, uncertainty, control charts, PT" },
  { id: "conv", name: "Unit Converters", ink: "#2D7FB0",
    blurb: "Liquid and solid units, and digest result back to mg/kg" },
  { id: "sol", name: "Solutions & Standards", ink: "#1E8C7A",
    blurb: "Molarity, dilution, standard weighing, Beer–Lambert, buffers" },
  { id: "water", name: "Water & Wastewater", ink: "#2F8F68",
    blurb: "Titrimetric, gravimetric, BOD, COD, hardness, SAR, WQI, IS 10500 panel" },
  { id: "plant", name: "STP / ETP / CETP & RO", ink: "#2A9D8F",
    blurb: "Removal efficiency, ASP and clarifier design, aeration, nutrient removal, sludge, RO and scaling" },
  { id: "air", name: "Ambient Air", ink: "#6E9B34",
    blurb: "CPCB colorimetric methods, filter gravimetry, NAQI, NAAQS compliance" },
  { id: "noise", name: "Noise Monitoring", ink: "#8E7CC3",
    blurb: "L_eq, L10/L50/L90, L_dn, zone compliance, decibel arithmetic, attenuation" },
  { id: "stack", name: "Source Emission", ink: "#C9822B",
    blurb: "Isokinetic sampling chain — Md, Bwo, Us, Qs, Vstd, O₂ correction" },
  { id: "fuel", name: "Fuel, Biomass & Waste", ink: "#B8860B",
    blurb: "Calorific value, proximate analysis, biogas, landfill gas, RDF, contaminated sites" },
  { id: "disp", name: "Dispersion Modelling", ink: "#C0553C",
    blurb: "Pasquill class, Briggs plume rise, Gaussian plume, line and area sources" },
  { id: "hw", name: "Waste & Contamination", ink: "#A33A48",
    blurb: "Leachate compliance, HOWM 2016 classification, DRE, dioxin TEQ, co-processing, soil indices, health risk" },
  { id: "phyto", name: "Plant Biomonitoring", ink: "#6A9955",
    blurb: "Pigments, APTI, dust capture, air pollution index, soil-to-plant transfer" },
];

/* ---------- reference data ------------------------------------------------ */

export const T99 = { 6:3.365, 7:3.143, 8:2.998, 9:2.896, 10:2.821, 11:2.764, 12:2.718,
  13:2.681, 14:2.650, 15:2.624, 16:2.602, 17:2.583, 18:2.567, 19:2.552, 20:2.539,
  21:2.528, 22:2.518, 23:2.508, 24:2.500, 25:2.492, 30:2.462, 31:2.457, 40:2.423,
  41:2.421, 50:2.405, 61:2.390 };
export const tValue = (n) => {
  if (T99[n]) return T99[n];
  const keys = Object.keys(T99).map(Number).sort((a, b) => a - b);
  if (n < keys[0]) return T99[keys[0]];
  if (n > keys[keys.length - 1]) return 2.33;
  let lo = keys[0];
  for (const k of keys) if (k <= n) lo = k;
  const hi = keys.find((k) => k >= n);
  if (lo === hi) return T99[lo];
  return T99[lo] + ((T99[hi] - T99[lo]) * (n - lo)) / (hi - lo);
};

export const EQW = { Ca: 20.04, Mg: 12.15, Na: 22.99, K: 39.10,
  HCO3: 61.02, CO3: 30.00, Cl: 35.45, SO4: 48.03, NO3: 62.00 };

/* NAAQS, CPCB notification 2009 — industrial / residential / rural (µg/m³) */
export const NAAQS = {
  "PM10":  { d: 100, a: 60,  avg: "24 h" }, "PM2.5": { d: 60,  a: 40,  avg: "24 h" },
  "SO2":   { d: 80,  a: 50,  avg: "24 h" }, "NO2":   { d: 80,  a: 40,  avg: "24 h" },
  "NH3":   { d: 400, a: 100, avg: "24 h" }, "O3":    { d: 100, a: null, avg: "8 h" },
  "Pb":    { d: 1.0, a: 0.5, avg: "24 h" }, "CO":    { d: 2,   a: null, avg: "8 h, mg/m³" },
};
export const vsNaaqs = (key, c) => {
  const s = NAAQS[key]; if (!s) return null;
  return { label: `Against NAAQS ${s.avg} (${s.d})`,
    value: c <= s.d ? "Within limit" : "Exceeds limit", tone: c <= s.d ? "ok" : "warn",
    hint: `${((c / s.d) * 100).toFixed(0)} % of the standard` + (s.a ? ` · annual standard ${s.a}` : "") };
};

/* CPCB colorimetric ambient methods — NAAQMS guideline */
export const AMB = {
  "SO₂ — improved West–Gaeke, IS 5182 Part 2": { eff: 1, extra: 1, key: "SO2",
    note: "Absorbing reagent: sodium tetrachloromercurate. CF is the reciprocal of the calibration slope." },
  "NO₂ — Jacobs–Hochheiser, IS 5182 Part 6":   { eff: 0.82, extra: 1, key: "NO2",
    note: "0.82 is the sampling efficiency of the sodium-arsenite absorber." },
  "O₃ — IS 5182 Part 9":                       { eff: 1, extra: 1.962, key: "O3",
    note: "1.962 converts µL of ozone to µg. Vs/Vt is not applied — the whole absorber is read." },
  "NH₃ — indophenol, IS 5182 Part 25":         { eff: 1, extra: 1, key: "NH3",
    note: "Absorbing reagent: dilute H₂SO₄ or boric acid; colour read at 630 nm." },
};

export const SAMPLERS = {
  "PM10 — RDS, IS 5182 Part 23":  { q: 1.132, key: "PM10" },
  "PM2.5 — FPS, IS 5182 Part 24": { q: 0.01667, key: "PM2.5" },
  "SPM — HVS, IS 5182 Part 4":    { q: 1.200, key: null },
  "Custom flow":                  { q: 1.0, key: null },
};

export const TITR = {
  "Total Hardness — EDTA, APHA 2340 C": { eq: 50.04, n: 0.02, unit: "mg/L as CaCO₃",
    note: "0.02 N (0.01 M) EDTA: 1.00 mL ≡ 1.00 mg CaCO₃" },
  "Total Alkalinity — APHA 2320 B":     { eq: 50.00, n: 0.02, unit: "mg/L as CaCO₃",
    note: "Titrate to pH 4.5 for total alkalinity" },
  "Chloride — AgNO₃, APHA 4500-Cl⁻ B":  { eq: 35.45, n: 0.0141, unit: "mg/L as Cl⁻",
    note: "Argentometric, K₂CrO₄ indicator; subtract the reagent blank" },
  "Dissolved Oxygen — APHA 4500-O C":   { eq: 8.00, n: 0.025, unit: "mg/L as O₂",
    note: "Winkler azide modification; V is the volume titrated, usually 200 mL" },
  "Acidity — APHA 2310 B":              { eq: 50.00, n: 0.02, unit: "mg/L as CaCO₃",
    note: "Titrate to pH 8.3 for total acidity" },
};

export const GRAV = ["Total Solids — APHA 2540 B", "Total Dissolved Solids — APHA 2540 C",
  "Total Suspended Solids — APHA 2540 D", "Volatile Suspended Solids — 2540 E",
  "Oil & Grease — APHA 5520 B"];

export const NAQI = {
  "PM10 (24 h, µg/m³)":  [[0,50,0,50],[51,100,51,100],[101,250,101,200],[251,350,201,300],[351,430,301,400],[431,1000,401,500]],
  "PM2.5 (24 h, µg/m³)": [[0,30,0,50],[31,60,51,100],[61,90,101,200],[91,120,201,300],[121,250,301,400],[251,700,401,500]],
  "NO₂ (24 h, µg/m³)":   [[0,40,0,50],[41,80,51,100],[81,180,101,200],[181,280,201,300],[281,400,301,400],[401,1000,401,500]],
  "SO₂ (24 h, µg/m³)":   [[0,40,0,50],[41,80,51,100],[81,380,101,200],[381,800,201,300],[801,1600,301,400],[1601,2400,401,500]],
  "O₃ (8 h, µg/m³)":     [[0,50,0,50],[51,100,51,100],[101,168,101,200],[169,208,201,300],[209,748,301,400],[749,1000,401,500]],
  "CO (8 h, mg/m³)":     [[0,1,0,50],[1.1,2,51,100],[2.1,10,101,200],[10.1,17,201,300],[17.1,34,301,400],[34.1,50,401,500]],
  "NH₃ (24 h, µg/m³)":   [[0,200,0,50],[201,400,51,100],[401,800,101,200],[801,1200,201,300],[1201,1800,301,400],[1801,3000,401,500]],
  "Pb (24 h, µg/m³)":    [[0,0.5,0,50],[0.51,1,51,100],[1.1,2,101,200],[2.1,3,201,300],[3.1,3.5,301,400],[3.6,5,401,500]],
};
export const AQI_BAND = (i) =>
  i <= 50 ? ["Good", "#2F8F68"] : i <= 100 ? ["Satisfactory", "#7EA53C"] :
  i <= 200 ? ["Moderate", "#C9A22B"] : i <= 300 ? ["Poor", "#D97B2B"] :
  i <= 400 ? ["Very Poor", "#C0453B"] : ["Severe", "#7B2D28"];

/* EPA Method 1 / IS 11255 Part 1 — traverse points as % of stack diameter */
export const TRAVERSE = {
  2:  [14.6, 85.4],
  4:  [6.7, 25.0, 75.0, 93.3],
  6:  [4.4, 14.6, 29.6, 70.4, 85.4, 95.6],
  8:  [3.2, 10.5, 19.4, 32.3, 67.7, 80.6, 89.5, 96.8],
  10: [2.6, 8.2, 14.6, 22.6, 34.2, 65.8, 77.4, 85.4, 91.8, 97.4],
  12: [2.1, 6.7, 11.8, 17.7, 25.0, 35.6, 64.4, 75.0, 82.3, 88.2, 93.3, 97.9],
  16: [1.6, 4.9, 8.5, 12.5, 16.9, 22.0, 28.3, 37.5, 62.5, 71.7, 78.0, 83.1, 87.5, 91.5, 95.1, 98.4],
  20: [1.3, 3.9, 6.7, 9.7, 12.9, 16.5, 20.4, 25.0, 30.6, 38.8, 61.2, 69.4, 75.0, 79.6, 83.5, 87.1, 90.3, 93.3, 96.1, 98.7],
};

/* Briggs (1973) dispersion coefficients, x in metres, valid ~100 m – 10 km */
export const SIGMA = {
  "Rural / open country": {
    A: (x) => [0.22 * x / Math.sqrt(1 + 1e-4 * x), 0.20 * x],
    B: (x) => [0.16 * x / Math.sqrt(1 + 1e-4 * x), 0.12 * x],
    C: (x) => [0.11 * x / Math.sqrt(1 + 1e-4 * x), 0.08 * x / Math.sqrt(1 + 2e-4 * x)],
    D: (x) => [0.08 * x / Math.sqrt(1 + 1e-4 * x), 0.06 * x / Math.sqrt(1 + 1.5e-3 * x)],
    E: (x) => [0.06 * x / Math.sqrt(1 + 1e-4 * x), 0.03 * x / (1 + 3e-4 * x)],
    F: (x) => [0.04 * x / Math.sqrt(1 + 1e-4 * x), 0.016 * x / (1 + 3e-4 * x)],
  },
  "Urban": {
    A: (x) => [0.32 * x / Math.sqrt(1 + 4e-4 * x), 0.24 * x * Math.sqrt(1 + 1e-3 * x)],
    B: (x) => [0.32 * x / Math.sqrt(1 + 4e-4 * x), 0.24 * x * Math.sqrt(1 + 1e-3 * x)],
    C: (x) => [0.22 * x / Math.sqrt(1 + 4e-4 * x), 0.20 * x],
    D: (x) => [0.16 * x / Math.sqrt(1 + 4e-4 * x), 0.14 * x / Math.sqrt(1 + 3e-4 * x)],
    E: (x) => [0.11 * x / Math.sqrt(1 + 4e-4 * x), 0.08 * x / Math.sqrt(1 + 1.5e-3 * x)],
    F: (x) => [0.11 * x / Math.sqrt(1 + 4e-4 * x), 0.08 * x / Math.sqrt(1 + 1.5e-3 * x)],
  },
};

/* Wind-profile power-law exponents (Irwin) */
export const POWER_P = {
  "Rural / open country": { A: 0.07, B: 0.07, C: 0.10, D: 0.15, E: 0.35, F: 0.55 },
  "Urban":                { A: 0.15, B: 0.15, C: 0.20, D: 0.25, E: 0.30, F: 0.30 },
};

/* Pasquill–Gifford stability lookup */
export const PASQUILL = [
  { max: 2, day: { Strong: "A", Moderate: "A–B", Slight: "B" }, night: { "≥ 4/8 cloud": "F", "≤ 3/8 cloud": "F" } },
  { max: 3, day: { Strong: "A–B", Moderate: "B", Slight: "C" }, night: { "≥ 4/8 cloud": "E", "≤ 3/8 cloud": "F" } },
  { max: 5, day: { Strong: "B", Moderate: "B–C", Slight: "C" }, night: { "≥ 4/8 cloud": "D", "≤ 3/8 cloud": "E" } },
  { max: 6, day: { Strong: "C", Moderate: "C–D", Slight: "D" }, night: { "≥ 4/8 cloud": "D", "≤ 3/8 cloud": "D" } },
  { max: Infinity, day: { Strong: "C", Moderate: "D", Slight: "D" }, night: { "≥ 4/8 cloud": "D", "≤ 3/8 cloud": "D" } },
];
export const CLASS_DESC = { A: "Extremely unstable", B: "Moderately unstable", C: "Slightly unstable",
  D: "Neutral", E: "Slightly stable", F: "Moderately stable" };

/* Leachate / TCLP regulatory levels, mg/L in the extract */
export const LEACH = [
  { k: "Arsenic",  us: 5.0,  eu_h: 2.5, eu_n: 0.2,  eu_i: 0.05 },
  { k: "Barium",   us: 100,  eu_h: 30,  eu_n: 10,   eu_i: 2.0 },
  { k: "Cadmium",  us: 1.0,  eu_h: 0.5, eu_n: 0.1,  eu_i: 0.004 },
  { k: "Chromium", us: 5.0,  eu_h: 7.0, eu_n: 1.0,  eu_i: 0.05 },
  { k: "Copper",   us: null, eu_h: 10,  eu_n: 5.0,  eu_i: 0.2 },
  { k: "Lead",     us: 5.0,  eu_h: 5.0, eu_n: 1.0,  eu_i: 0.05 },
  { k: "Mercury",  us: 0.2,  eu_h: 0.2, eu_n: 0.02, eu_i: 0.001 },
  { k: "Molybdenum", us: null, eu_h: 3.0, eu_n: 1.0, eu_i: 0.05 },
  { k: "Nickel",   us: null, eu_h: 4.0, eu_n: 1.0,  eu_i: 0.04 },
  { k: "Selenium", us: 1.0,  eu_h: 0.7, eu_n: 0.05, eu_i: 0.01 },
  { k: "Silver",   us: 5.0,  eu_h: null, eu_n: null, eu_i: null },
  { k: "Antimony", us: null, eu_h: 0.5, eu_n: 0.07, eu_i: 0.006 },
  { k: "Zinc",     us: null, eu_h: 20,  eu_n: 5.0,  eu_i: 0.4 },
];
export const LEACH_SETS = {
  "USEPA 40 CFR 261.24 — TCLP toxicity characteristic": "us",
  "EU 2003/33/EC — hazardous waste landfill (L/S 10)": "eu_h",
  "EU 2003/33/EC — non-hazardous waste landfill (L/S 10)": "eu_n",
  "EU 2003/33/EC — inert waste landfill (L/S 10)": "eu_i",
};

/* WHO-2005 toxic equivalency factors, mammalian */
export const TEF = [
  ["2,3,7,8-TCDD", 1], ["1,2,3,7,8-PeCDD", 1], ["1,2,3,4,7,8-HxCDD", 0.1],
  ["1,2,3,6,7,8-HxCDD", 0.1], ["1,2,3,7,8,9-HxCDD", 0.1], ["1,2,3,4,6,7,8-HpCDD", 0.01],
  ["OCDD", 0.0003], ["2,3,7,8-TCDF", 0.1], ["1,2,3,7,8-PeCDF", 0.03],
  ["2,3,4,7,8-PeCDF", 0.3], ["1,2,3,4,7,8-HxCDF", 0.1], ["1,2,3,6,7,8-HxCDF", 0.1],
  ["1,2,3,7,8,9-HxCDF", 0.1], ["2,3,4,6,7,8-HxCDF", 0.1], ["1,2,3,4,6,7,8-HpCDF", 0.01],
  ["1,2,3,4,7,8,9-HpCDF", 0.01], ["OCDF", 0.0003],
];

export const TR = { Cd: 30, Hg: 40, As: 10, Pb: 5, Cu: 5, Ni: 5, Co: 5, Cr: 2, Zn: 1, Mn: 1 };

/*
  FIX 2 — TOX.Pb.

  The pack carried Pb: { rfd: 3.5e-3, csf: 0.0085 }. USEPA IRIS publishes
  neither an oral reference dose nor an oral slope factor for lead: exposure is
  assessed through the IEUBK model for children and the Adult Lead Methodology,
  not through CDI x CSF. Those two numbers could not be sourced to the cited
  RAGS Part A basis and are now null. `health` returns the CDI with a warn row
  in their place.

  Cr(VI) keeps its values. The RfD is IRIS. The 0.5 slope factor is not — it is
  of NJDEP origin — so it carries a VERIFY note surfaced on the CR row only.
*/
export const TOX = {
  As: { rfd: 3e-4, csf: 1.5 },   Cd: { rfd: 1e-3, csf: 6.3 },
  "Cr(VI)": { rfd: 3e-3, csf: 0.5,
    verify: "The RfD is IRIS. The oral slope factor 0.5 is not IRIS — it is of NJDEP origin. VERIFY against the value your jurisdiction requires before reporting a cancer risk." },
  Cu: { rfd: 4e-2, csf: null },
  Pb: { rfd: null, csf: null,
    note: "USEPA IRIS publishes no oral RfD and no oral slope factor for lead. Assessment goes through the IEUBK model (children) or the Adult Lead Methodology, not CDI × CSF. No hazard quotient or cancer risk is returned for lead." },
  Ni: { rfd: 2e-2, csf: 0.84 },
  Zn: { rfd: 3e-1, csf: null },  Mn: { rfd: 1.4e-1, csf: null },
  Fe: { rfd: 7e-1, csf: null },  Hg: { rfd: 3e-4, csf: null },
};

export const WQI_PARAMS = [
  { k: "pH", std: 8.5, ideal: 7, unit: "" }, { k: "TDS", std: 500, ideal: 0, unit: "mg/L" },
  { k: "Total Hardness", std: 300, ideal: 0, unit: "mg/L" }, { k: "Chloride", std: 250, ideal: 0, unit: "mg/L" },
  { k: "Sulphate", std: 200, ideal: 0, unit: "mg/L" }, { k: "Nitrate", std: 45, ideal: 0, unit: "mg/L" },
  { k: "Fluoride", std: 1.0, ideal: 0, unit: "mg/L" }, { k: "Turbidity", std: 5, ideal: 0, unit: "NTU" },
];

/* ---------- helpers ------------------------------------------------------- */

export const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : NaN; };

export const fmt = (v, sig = 4) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a < 1e-4 || a >= 1e7) return v.toExponential(3).replace("e", " × 10^");
  return Number(v.toPrecision(sig)).toLocaleString("en-IN", { maximumFractionDigits: 10 });
};

export const parseSeries = (t) => String(t || "").split(/[\s,;\n\t]+/).map(parseFloat).filter(isFinite);

export const parsePairs = (t) =>
  String(t || "").split(/\n/).map((l) => l.split(/[\s,;\t]+/).map(parseFloat))
    .filter((p) => p.length >= 2 && isFinite(p[0]) && isFinite(p[1]))
    .map((p) => ({ x: p[0], y: p[1] }));

export const stats = (a) => {
  const n = a.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, rsd: NaN };
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, rsd: (sd / mean) * 100, min: Math.min(...a), max: Math.max(...a) };
};

export const regress = (p) => {
  const n = p.length;
  const mx = p.reduce((s, q) => s + q.x, 0) / n, my = p.reduce((s, q) => s + q.y, 0) / n;
  const sxy = p.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0);
  const sxx = p.reduce((s, q) => s + (q.x - mx) ** 2, 0);
  const syy = p.reduce((s, q) => s + (q.y - my) ** 2, 0);
  const m = sxy / sxx, c = my - m * mx, r = sxy / Math.sqrt(sxx * syy);
  const sse = p.reduce((s, q) => s + (q.y - (m * q.x + c)) ** 2, 0);
  return { n, m, c, r, r2: r * r, sy_x: n > 2 ? Math.sqrt(sse / (n - 2)) : NaN, mx, sxx };
};

export const subIndex = (c, bands) => {
  for (const [bl, bh, il, ih] of bands)
    if (c >= bl && c <= bh) return ((ih - il) / (bh - bl)) * (c - bl) + il;
  return c > bands[bands.length - 1][1] ? 500 : NaN;
};

export const percentile = (arr, p) => {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return NaN;
  const i = (p / 100) * (a.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
};

/* Gaussian plume, reflection at the ground. Q g/s → µg/m³ */
export const plumeC = (Q, u, sy, sz, H, y, z) =>
  ((Q / (2 * Math.PI * u * sy * sz)) *
    Math.exp(-(y * y) / (2 * sy * sy)) *
    (Math.exp(-((z - H) ** 2) / (2 * sz * sz)) + Math.exp(-((z + H) ** 2) / (2 * sz * sz)))) * 1e6;

/* Briggs plume rise. Returns { F, dh, xf, mode } */
export const briggsRise = (vs, d, Ts, Ta, u, cls, dTdz) => {
  const g = 9.81;
  const F = (g * vs * d * d * (Ts - Ta)) / (4 * Ts);
  const stable = cls === "E" || cls === "F";
  if (F <= 0) return { F, dh: (3 * d * vs) / u, xf: NaN, mode: "Momentum only — plume is not buoyant" };
  if (stable) {
    const s = (g * (dTdz || (cls === "E" ? 0.02 : 0.035))) / Ta;
    const dh = 2.6 * Math.pow(F / (u * s), 1 / 3);
    const calm = 5.0 * Math.pow(F, 0.25) * Math.pow(s, -0.375);
    return { F, s, dh: Math.min(dh, calm), xf: 2.07 * u / Math.sqrt(s), mode: "Stable, buoyancy dominated" };
  }
  return F < 55
    ? { F, dh: (21.425 * Math.pow(F, 0.75)) / u, xf: 49 * Math.pow(F, 0.625), mode: "Neutral / unstable, F < 55" }
    : { F, dh: (38.71 * Math.pow(F, 0.6)) / u, xf: 119 * Math.pow(F, 0.4), mode: "Neutral / unstable, F ≥ 55" };
};

/* Shared by the CPCB colorimetric ambient methods */
export const airVolNTP = (lpm, minutes, tC, pKpa) => {
  const V = (lpm * minutes) / 1000;
  const t = isFinite(tC) ? tC : 25, p = isFinite(pKpa) && pKpa > 0 ? pKpa : 101.325;
  return { V, Vn: V * (298.15 / (t + 273.15)) * (p / 101.325) };
};

/* ---------- input builders ------------------------------------------------ */

export const N = (id, label, unit, def, hint) => ({ id, label, unit, def, hint, type: "num" });
export const S = (id, label, opts, def) => ({ id, label, opts, def, type: "sel" });

/* ---------- the routines -------------------------------------------------- */

export const BASE = [
/* ══════════ QA / QC ══════════ */
{
  id: "lodloq", mod: "qc", tier: "advanced", name: "LOD & LOQ", sub: "Detection and quantification limits",
  formula: "LOD = k·σ / S     LOQ = 10·σ / S",
  ref: "ICH Q2(R1); IUPAC. σ = SD of ≥7 blank or low-level replicates; S = calibration slope.",
  supersededBy: "detlim",
  inputs: [
    { id: "sd", type: "series", label: "Blank / low-level replicate responses", hint: "Paste ≥7 values, or enter σ directly below" },
    N("sdDirect", "…or enter σ directly", "", ""),
    N("slope", "Calibration slope S", "response / conc.", "1", "Leave 1 if σ is already in concentration units"),
    S("k", "LOD factor k", ["3 (IUPAC / 3σ)", "3.3 (ICH)"], "3 (IUPAC / 3σ)"),
  ],
  run: (v) => {
    const ser = parseSeries(v.sd), st = stats(ser);
    const sd = isFinite(num(v.sdDirect)) ? num(v.sdDirect) : st.sd;
    const S_ = num(v.slope) || 1, k = v.k?.startsWith("3.3") ? 3.3 : 3;
    if (!isFinite(sd)) return null;
    return [
      ser.length ? { label: "Replicates used", value: st.n } : null,
      ser.length ? { label: "Mean of replicates", value: fmt(st.mean) } : null,
      { label: "σ (standard deviation)", value: fmt(sd) },
      { label: `LOD (${k}σ/S)`, value: fmt((k * sd) / S_), tone: "key" },
      { label: "LOQ (10σ/S)", value: fmt((10 * sd) / S_), tone: "key" },
      { label: "Superseded", value: "Use `detlim`",
        hint: "detlim covers this route and three others, applies the 40 CFR 136 App. B checks, and converts the instrument limit to a method limit. This routine is kept so existing records remain reproducible." },
    ].filter(Boolean);
  },
},
{
  id: "mdl", mod: "qc", tier: "advanced", name: "Method Detection Limit", sub: "USEPA 40 CFR 136 Appendix B",
  formula: "MDL = t(n−1, 0.99) × SD",
  ref: "Spiked replicates at 1–5× estimated MDL, n ≥ 7. Verify MDL ≤ spike level ≤ 10 × MDL.",
  supersededBy: "detlim",
  inputs: [{ id: "vals", type: "series", label: "Spiked replicate results", hint: "Paste ≥7 values" }],
  run: (v) => {
    const st = stats(parseSeries(v.vals));
    if (st.n < 2) return null;
    const t = tValue(st.n), mdl = t * st.sd, ratio = st.mean / mdl;
    return [
      { label: "n", value: st.n }, { label: "Mean", value: fmt(st.mean) },
      { label: "SD", value: fmt(st.sd) }, { label: "%RSD", value: fmt(st.rsd), unit: "%" },
      { label: `t (${st.n - 1} df, 99 %)`, value: t.toFixed(3) },
      { label: "MDL", value: fmt(mdl), tone: "key" },
      { label: "Spike / MDL ratio", value: fmt(ratio),
        hint: ratio > 10 ? "Above 10 — repeat at a lower spike level" : ratio < 1 ? "Below 1 — spike level too low" : "Within 1–10, acceptable",
        tone: ratio > 10 || ratio < 1 ? "warn" : "ok" },
      { label: "Note on the ratio", value: "Uses the mean recovered",
        hint: "40 CFR 136 App. B checks the SPIKE LEVEL against the MDL, not the mean recovered. `detlim` takes the spike level as its own input and applies the check as written." },
    ];
  },
},
{
  id: "calib", mod: "qc", tier: "routine", name: "Calibration Curve", sub: "Least-squares fit and back-calculation",
  formula: "y = m·x + c",
  ref: "ISO/IEC 17025 §7.2.1.5. Most methods expect r² ≥ 0.995. CF used by CPCB methods is 1/m.",
  inputs: [
    { id: "pairs", type: "pairs", label: "Concentration, Response", hint: "One pair per line — e.g.\n0, 12\n10, 1250\n25, 3010" },
    N("resp", "Back-calculate a sample response", "", ""),
  ],
  run: (v) => {
    const pts = parsePairs(v.pairs);
    if (pts.length < 3) return null;
    const g = regress(pts);
    const out = [
      { label: "Points (n)", value: g.n },
      { label: "Slope m", value: fmt(g.m, 6), tone: "key" },
      { label: "Calibration factor CF (1/m)", value: fmt(1 / g.m, 6) },
      { label: "Intercept c", value: fmt(g.c, 6) },
      { label: "Correlation r", value: g.r.toFixed(6) },
      { label: "r²", value: g.r2.toFixed(6), tone: g.r2 >= 0.995 ? "ok" : "warn",
        hint: g.r2 >= 0.995 ? "Meets the usual ≥ 0.995 criterion" : "Below 0.995 — review standards and outliers" },
      { label: "Residual SD (Sy/x)", value: fmt(g.sy_x) },
      { label: "LOD from curve (3.3·Sy/x / m)", value: fmt((3.3 * g.sy_x) / g.m) },
      { label: "LOQ from curve (10·Sy/x / m)", value: fmt((10 * g.sy_x) / g.m) },
    ];
    const y = num(v.resp);
    if (isFinite(y)) {
      const x = (y - g.c) / g.m;
      const sx = (g.sy_x / g.m) * Math.sqrt(1 + 1 / g.n + (x - g.mx) ** 2 / g.sxx);
      out.push({ label: "Back-calculated concentration", value: fmt(x), tone: "key" });
      out.push({ label: "Std. error of that result", value: "± " + fmt(sx), hint: "Single measurement, 1σ" });
      out.push({ label: "As an uncertainty component", value: fmt((sx / Math.abs(x)) * 100) + " %",
        hint: "This is u(x₀) by inverse prediction. Enter it into `ubudget` as a relative standard uncertainty — it is the component most budgets omit and it dominates near the LOQ." });
    }
    return out;
  },
},
{
  id: "recovery", mod: "qc", tier: "routine", name: "Recovery", sub: "Spike recovery and CRM recovery",
  formula: "R % = (C_spiked − C_unspiked) / C_added × 100",
  ref: "Typical acceptance 80–120 % (trace level 70–130 %). For a CRM, use the certified value as C_added.",
  inputs: [
    N("spiked", "Spiked / measured result", "", ""), N("unspiked", "Unspiked sample result", "", "0"),
    N("added", "Amount added / certified value", "", ""),
    N("lo", "Lower acceptance limit", "%", "80"), N("hi", "Upper acceptance limit", "%", "120"),
  ],
  run: (v) => {
    const s = num(v.spiked), u = num(v.unspiked) || 0, a = num(v.added);
    if (!isFinite(s) || !isFinite(a) || a === 0) return null;
    const r = ((s - u) / a) * 100, lo = num(v.lo), hi = num(v.hi);
    return [
      { label: "Net recovered", value: fmt(s - u) },
      { label: "Recovery", value: fmt(r), unit: "%", tone: "key" },
      { label: "Bias", value: fmt(r - 100), unit: "%" },
      { label: "Verdict", value: r >= lo && r <= hi ? "Within limits" : "Outside limits",
        tone: r >= lo && r <= hi ? "ok" : "warn", hint: `Acceptance window ${lo}–${hi} %` },
    ];
  },
},
{
  id: "precision", mod: "qc", tier: "routine", name: "Precision & HorRat", sub: "Repeatability with Horwitz ratio",
  formula: "PRSD_R = 2 · C^(−0.1505)      HorRat = RSD_obs / PRSD_R",
  ref: "Horwitz & Albert (2006). HorRat 0.5–2.0 generally acceptable.",
  inputs: [
    { id: "vals", type: "series", label: "Replicate results", hint: "Paste your replicate values" },
    S("unit", "Result unit", ["mg/kg (ppm)", "µg/kg (ppb)", "mg/L (ppm)", "% (g/100 g)"], "mg/kg (ppm)"),
  ],
  run: (v) => {
    const st = stats(parseSeries(v.vals));
    if (st.n < 2) return null;
    const f = v.unit?.startsWith("µg") ? 1e-9 : v.unit?.startsWith("%") ? 1e-2 : 1e-6;
    const prsd = 2 * Math.pow(st.mean * f, -0.1505), hr = st.rsd / prsd, good = hr >= 0.5 && hr <= 2;
    return [
      { label: "n", value: st.n }, { label: "Mean", value: fmt(st.mean) }, { label: "SD", value: fmt(st.sd) },
      { label: "%RSD (observed)", value: fmt(st.rsd), unit: "%", tone: "key" },
      { label: "Range", value: `${fmt(st.min)} – ${fmt(st.max)}` },
      { label: "Horwitz PRSD_R (predicted)", value: fmt(prsd), unit: "%" },
      { label: "HorRat", value: fmt(hr), tone: good ? "ok" : "warn",
        hint: good ? "Within 0.5–2.0" : hr < 0.5 ? "Scatter lower than expected — check replicate independence" : "Precision poorer than the method should give" },
    ];
  },
},
{
  id: "uncert", mod: "qc", tier: "routine", name: "Measurement Uncertainty", sub: "Combined and expanded, GUM approach",
  formula: "u_c = √(u₁² + u₂² + … + uₙ²)      U = k · u_c",
  ref: "ISO/IEC Guide 98-3 (GUM); Eurachem/CITAC CG4. Enter components as relative standard uncertainty in %.",
  inputs: [
    { id: "comps", type: "series", label: "Relative uncertainty components (%)", hint: "One per line — calibration, repeatability, recovery, dilution, reference material…" },
    N("result", "Reported result (optional)", "", ""),
    S("k", "Coverage factor k", ["2 (≈95 %)", "3 (≈99 %)", "1 (standard)"], "2 (≈95 %)"),
  ],
  run: (v) => {
    const u = parseSeries(v.comps);
    if (!u.length) return null;
    const uc = Math.sqrt(u.reduce((s, x) => s + x * x, 0));
    const k = parseFloat(v.k) || 2, U = k * uc, R = num(v.result);
    const out = [
      { label: "Components", value: u.length },
      { label: "Largest single component", value: fmt(Math.max(...u)), unit: "%", hint: "Reduce this one first — it dominates the budget" },
      { label: "Combined u_c (relative)", value: fmt(uc), unit: "%" },
      { label: `Expanded U (k = ${k})`, value: fmt(U), unit: "%", tone: "key" },
    ];
    if (isFinite(R)) {
      const abs = (R * U) / 100;
      out.push({ label: "Absolute expanded uncertainty", value: "± " + fmt(abs), tone: "key" });
      out.push({ label: "Report as", value: `${fmt(R)} ± ${fmt(abs)}  (k = ${k})` });
    }
    out.push({ label: "k was assumed, not computed", tone: "warn", value: `k = ${k}`,
      hint: "This routine takes k as given. Where a Type A component rests on few replicates the correct k comes from t at the effective degrees of freedom and can be well above 2 — with n = 3 dominating it is 4.30. Use `ubudget` for a budget that computes it, and `decision` to turn U into a statement of conformity." });
    return out;
  },
},
{
  id: "control", mod: "qc", tier: "routine", name: "Control Chart Limits", sub: "Shewhart warning and action limits",
  formula: "WL = x̄ ± 2s      AL = x̄ ± 3s",
  ref: "ISO 7870; ISO/IEC 17025 §7.7. Build from ≥20 in-control QC results.",
  inputs: [
    { id: "vals", type: "series", label: "Historic QC results", hint: "Paste ≥20 in-control values" },
    N("newVal", "Check a new QC value", "", ""),
  ],
  run: (v) => {
    const st = stats(parseSeries(v.vals));
    if (st.n < 2) return null;
    const out = [
      { label: "n", value: st.n, tone: st.n < 20 ? "warn" : undefined, hint: st.n < 20 ? "Fewer than 20 points — limits are provisional" : "" },
      { label: "Central line x̄", value: fmt(st.mean), tone: "key" },
      { label: "s", value: fmt(st.sd) }, { label: "%RSD", value: fmt(st.rsd), unit: "%" },
      { label: "Upper action limit (+3s)", value: fmt(st.mean + 3 * st.sd) },
      { label: "Upper warning limit (+2s)", value: fmt(st.mean + 2 * st.sd) },
      { label: "Lower warning limit (−2s)", value: fmt(st.mean - 2 * st.sd) },
      { label: "Lower action limit (−3s)", value: fmt(st.mean - 3 * st.sd) },
    ];
    const x = num(v.newVal);
    if (isFinite(x)) {
      const z = (x - st.mean) / st.sd, az = Math.abs(z);
      out.push({ label: "New value, distance from mean", value: fmt(z) + " s" });
      out.push({ label: "Status", value: az >= 3 ? "Outside action limits — reject the run" : az >= 2 ? "Between warning and action limits — investigate" : "In control",
        tone: az >= 2 ? "warn" : "ok" });
    }
    if (st.n >= 20) out.push({ label: "As an uncertainty component", value: fmt(st.rsd) + " %",
      hint: "This %RSD is the within-laboratory reproducibility s(R_w). Enter it into `unordtest` with your bias data for a top-down combined uncertainty." });
    return out;
  },
},
{
  id: "zscore", mod: "qc", tier: "routine", name: "PT Z-score", sub: "Proficiency testing performance",
  formula: "z = (x − X) / σ_pt",
  ref: "ISO 13528 / ISO/IEC 17043. |z| ≤ 2 satisfactory · 2 < |z| < 3 questionable · |z| ≥ 3 unsatisfactory.",
  inputs: [N("x", "Your reported result", "", ""), N("X", "Assigned value", "", ""), N("sig", "Standard deviation for PA (σ_pt)", "", "")],
  run: (v) => {
    const x = num(v.x), X = num(v.X), s = num(v.sig);
    if (![x, X, s].every(isFinite) || s === 0) return null;
    const z = (x - X) / s, az = Math.abs(z);
    return [
      { label: "Deviation from assigned value", value: fmt(x - X) },
      { label: "Relative deviation", value: fmt(((x - X) / X) * 100), unit: "%" },
      { label: "z-score", value: z.toFixed(2), tone: "key" },
      { label: "Performance", value: az <= 2 ? "Satisfactory" : az < 3 ? "Questionable" : "Unsatisfactory", tone: az <= 2 ? "ok" : "warn" },
    ];
  },
},

/* ══════════ Unit converters ══════════ */
{
  id: "digest", mod: "conv", tier: "routine", name: "Digest → Solid Result", sub: "Instrument mg/L back to mg/kg of sample",
  formula: "C (mg/kg) = (C_digest − C_blank) × V_final × DF / W",
  ref: "For USEPA 3050B / 3051A digests read on AAS, ICP-OES or ICP-MS. mg/L × mL ÷ g gives µg/g, which is mg/kg.",
  inputs: [
    N("cd", "Concentration read on instrument", "mg/L", ""), N("cb", "Digestion blank", "mg/L", "0"),
    N("vf", "Final made-up volume", "mL", "50"), N("w", "Sample weight taken", "g", "0.5"),
    N("df", "Further dilution factor", "×", "1", "1 if the digest was read undiluted"),
    N("moist", "Moisture content", "%", "", "Optional — converts to dry-weight basis"),
  ],
  run: (v) => {
    const cd = num(v.cd), cb = num(v.cb) || 0, vf = num(v.vf), w = num(v.w), df = num(v.df) || 1;
    if (![cd, vf, w].every(isFinite) || w <= 0) return null;
    const c = ((cd - cb) * vf * df) / w;
    const out = [
      { label: "Blank-corrected reading", value: fmt(cd - cb), unit: "mg/L" },
      { label: "Effective factor (V × DF / W)", value: fmt((vf * df) / w) },
      { label: "Result, as-received basis", value: fmt(c), unit: "mg/kg", tone: "key" },
      { label: "…in µg/g", value: fmt(c) }, { label: "…in %", value: fmt(c / 1e4), unit: "%" },
    ];
    const m = num(v.moist);
    if (isFinite(m) && m >= 0 && m < 100) {
      out.push({ label: "Result, dry-weight basis", value: fmt((c * 100) / (100 - m)), unit: "mg/kg", tone: "key" });
      out.push({ label: "Dry-weight factor", value: fmt(100 / (100 - m)) + " ×" });
    }
    if (cd - cb <= 0) out.push({ label: "Note", value: "Blank equals or exceeds the sample reading", tone: "warn" });
    return out;
  },
},
{
  id: "liqconv", mod: "conv", tier: "routine", name: "Liquid Units", sub: "mg/L, µg/L, ng/L, ppm, ppb, ppt",
  formula: "1 mg/L = 1000 µg/L = 10⁶ ng/L ≈ 1 ppm",
  ref: "The ppm ≈ mg/L equivalence assumes a dilute aqueous solution of density 1.00 g/mL.",
  inputs: [N("val", "Value", "", ""), S("unit", "Unit", ["mg/L", "µg/L", "ng/L", "µg/mL", "g/L", "ppm", "ppb", "ppt"], "µg/L")],
  run: (v) => {
    const x = num(v.val);
    if (!isFinite(x)) return null;
    const f = { "mg/L": 1, "µg/L": 1e-3, "ng/L": 1e-6, "µg/mL": 1, "g/L": 1e3, ppm: 1, ppb: 1e-3, ppt: 1e-6 };
    const m = x * f[v.unit];
    return [
      { label: "g/L", value: fmt(m / 1000) },
      { label: "mg/L  ·  ppm  ·  µg/mL", value: fmt(m), tone: "key" },
      { label: "µg/L  ·  ppb", value: fmt(m * 1e3), tone: "key" },
      { label: "ng/L  ·  ppt", value: fmt(m * 1e6), tone: "key" },
      { label: "µg/100 mL", value: fmt(m * 100) },
    ];
  },
},
{
  id: "solconv", mod: "conv", tier: "routine", name: "Solid Units", sub: "mg/kg, µg/g, ng/g, ppm, ppb, %",
  formula: "1 % = 10 g/kg = 10 000 mg/kg = 10⁷ µg/kg",
  ref: "For solids, ppm is mg/kg and ppb is µg/kg by mass — no density assumption needed.",
  inputs: [N("val", "Value", "", ""), S("unit", "Unit", ["mg/kg", "µg/g", "µg/kg", "ng/g", "g/kg", "%", "ppm", "ppb"], "mg/kg")],
  run: (v) => {
    const x = num(v.val);
    if (!isFinite(x)) return null;
    const f = { "mg/kg": 1, "µg/g": 1, "µg/kg": 1e-3, "ng/g": 1e-3, "g/kg": 1e3, "%": 1e4, ppm: 1, ppb: 1e-3 };
    const m = x * f[v.unit];
    return [
      { label: "%", value: fmt(m / 1e4), unit: "%" }, { label: "g/kg", value: fmt(m / 1e3) },
      { label: "mg/kg  ·  µg/g  ·  ppm", value: fmt(m), tone: "key" },
      { label: "µg/kg  ·  ng/g  ·  ppb", value: fmt(m * 1e3), tone: "key" },
      { label: "ng/kg  ·  ppt", value: fmt(m * 1e6) },
    ];
  },
},

/* ══════════ Solutions ══════════ */
{
  id: "molppm", mod: "sol", tier: "routine", name: "Molarity ⇄ ppm", sub: "Concentration unit conversion",
  formula: "ppm (mg/L) = M × MW × 1000",
  ref: "Assumes a dilute aqueous solution where 1 L ≈ 1 kg.",
  inputs: [N("mw", "Molar / atomic weight", "g/mol", ""), N("m", "Molarity", "mol/L", "", "Fill either this…"), N("ppm", "Concentration", "mg/L (ppm)", "", "…or this")],
  run: (v) => {
    const mw = num(v.mw), M = num(v.m), p = num(v.ppm);
    if (!isFinite(mw) || mw <= 0) return null;
    if (isFinite(M)) return [
      { label: "mg/L (ppm)", value: fmt(M * mw * 1000), tone: "key" },
      { label: "µg/L (ppb)", value: fmt(M * mw * 1e6) }, { label: "mmol/L", value: fmt(M * 1000) }];
    if (isFinite(p)) return [
      { label: "Molarity", value: fmt(p / (mw * 1000)), unit: "mol/L", tone: "key" },
      { label: "mmol/L", value: fmt(p / mw) }, { label: "µg/L (ppb)", value: fmt(p * 1000) }];
    return null;
  },
},
{
  id: "dilute", mod: "sol", tier: "routine", name: "Dilution", sub: "C₁V₁ = C₂V₂ and dilution factor",
  formula: "C₁V₁ = C₂V₂      DF = V_final / V_aliquot",
  ref: "Use consistent units. Report the sample result as measured × DF.",
  inputs: [
    N("c1", "Stock concentration C₁", "", ""), N("c2", "Required concentration C₂", "", ""),
    N("v2", "Required final volume V₂", "mL", ""), N("meas", "Measured result on diluted sample", "", "", "Optional — back-calculates the original"),
  ],
  run: (v) => {
    const c1 = num(v.c1), c2 = num(v.c2), v2 = num(v.v2);
    if (![c1, c2, v2].every(isFinite) || c1 === 0) return null;
    const v1 = (c2 * v2) / c1, df = c1 / c2;
    const out = [
      { label: "Aliquot of stock (V₁)", value: fmt(v1), unit: "mL", tone: "key" },
      { label: "Diluent to add", value: fmt(v2 - v1), unit: "mL" },
      { label: "Dilution factor", value: fmt(df) + " ×" }, { label: "Expressed as", value: `1 : ${fmt(df)}` },
    ];
    if (v1 > v2) out.push({ label: "Check", value: "Aliquot exceeds final volume — C₂ cannot be above C₁", tone: "warn" });
    const m = num(v.meas);
    if (isFinite(m)) out.push({ label: "Original concentration", value: fmt(m * df), tone: "key" });
    return out;
  },
},
{
  id: "stock", mod: "sol", tier: "routine", name: "Standard Preparation", sub: "Weight of salt for a given standard",
  formula: "w = C × V × (MW_salt / AW_element) ÷ (purity / 100)",
  ref: "Gravimetric factor corrects for the salt matrix; assay correction for stated purity. Dry the salt as the certificate specifies.",
  inputs: [
    N("conc", "Required concentration", "mg/L", "1000"), N("vol", "Final volume", "mL", "1000"),
    N("mwSalt", "Molar weight of salt", "g/mol", ""), N("awEl", "Atomic weight of element", "g/mol", "", "Leave blank if preparing the compound itself"),
    N("purity", "Assay / purity", "%", "100"),
  ],
  run: (v) => {
    const C = num(v.conc), V = num(v.vol), mws = num(v.mwSalt), awe = num(v.awEl), p = num(v.purity) || 100;
    if (![C, V].every(isFinite)) return null;
    const gf = isFinite(mws) && isFinite(awe) && awe > 0 ? mws / awe : 1;
    const mg = C * (V / 1000) * gf * (100 / p);
    return [
      { label: "Gravimetric factor", value: fmt(gf, 6), hint: gf === 1 ? "No salt correction applied" : "" },
      { label: "Weigh out", value: fmt(mg), unit: "mg", tone: "key" },
      { label: "…in grams", value: fmt(mg / 1000), unit: "g" },
      { label: "Make up to", value: fmt(V), unit: "mL" }, { label: "Nominal strength", value: fmt(C) + " mg/L" },
    ];
  },
},
{
  id: "beer", mod: "sol", tier: "routine", name: "Beer–Lambert", sub: "Absorbance to concentration",
  formula: "A = ε · b · c",
  ref: "Linear only while A ≲ 1.0. Above that, dilute rather than extrapolate.",
  inputs: [N("a", "Absorbance A", "", ""), N("e", "Molar absorptivity ε", "L mol⁻¹ cm⁻¹", ""), N("b", "Path length b", "cm", "1"), N("mw", "Molar weight (optional)", "g/mol", "")],
  run: (v) => {
    const A = num(v.a), e = num(v.e), b = num(v.b) || 1, mw = num(v.mw);
    if (![A, e].every(isFinite) || e === 0) return null;
    const c = A / (e * b);
    const out = [
      { label: "Concentration", value: fmt(c), unit: "mol/L", tone: "key" },
      { label: "…in µmol/L", value: fmt(c * 1e6) },
      { label: "Transmittance", value: fmt(Math.pow(10, -A) * 100), unit: "%" },
    ];
    if (isFinite(mw)) out.push({ label: "…in mg/L", value: fmt(c * mw * 1000), tone: "key" });
    if (A > 1) out.push({ label: "Note", value: "A > 1.0 — dilute the sample", tone: "warn" });
    return out;
  },
},
{
  id: "buffer", mod: "sol", tier: "routine", name: "Buffer pH", sub: "Henderson–Hasselbalch",
  formula: "pH = pKa + log₁₀([A⁻] / [HA])",
  ref: "Best buffering within pKa ± 1. Ignores activity coefficients — verify with a calibrated pH meter.",
  inputs: [N("pka", "pKa", "", ""), N("base", "Conjugate base [A⁻]", "mol/L", ""), N("acid", "Weak acid [HA]", "mol/L", "")],
  run: (v) => {
    const pka = num(v.pka), b = num(v.base), a = num(v.acid);
    if (![pka, b, a].every(isFinite) || a <= 0 || b <= 0) return null;
    const ph = pka + Math.log10(b / a);
    return [
      { label: "Ratio [A⁻]/[HA]", value: fmt(b / a) },
      { label: "pH", value: ph.toFixed(2), tone: "key" },
      { label: "Buffer capacity", value: Math.abs(ph - pka) <= 1 ? "Good — within pKa ± 1" : "Weak — outside pKa ± 1", tone: Math.abs(ph - pka) <= 1 ? "ok" : "warn" },
      { label: "Total buffer concentration", value: fmt(a + b), unit: "mol/L" },
    ];
  },
},

/* ══════════ Water & wastewater ══════════ */
{
  id: "titr", mod: "water", tier: "routine", name: "Titrimetric Determination", sub: "Hardness, alkalinity, chloride, DO, acidity",
  formula: "C (mg/L) = (V_titrant − V_blank) × N × Eq × 1000 / V_sample",
  ref: "APHA 24th Ed. Equivalent weight is set by the method chosen below.",
  inputs: [
    S("method", "Method", Object.keys(TITR), Object.keys(TITR)[0]),
    N("vt", "Titrant used for sample", "mL", ""), N("vb", "Titrant used for blank", "mL", "0"),
    N("n", "Titrant normality", "N", "", "Leave blank to use the method default"),
    N("vs", "Sample volume titrated", "mL", "100"),
  ],
  run: (v) => {
    const m = TITR[v.method]; if (!m) return null;
    const vt = num(v.vt), vb = num(v.vb) || 0, vs = num(v.vs);
    const n = isFinite(num(v.n)) ? num(v.n) : m.n;
    if (![vt, vs].every(isFinite) || vs <= 0) return null;
    const c = ((vt - vb) * n * m.eq * 1000) / vs;
    const out = [
      { label: "Net titrant", value: fmt(vt - vb), unit: "mL" },
      { label: "Normality used", value: fmt(n, 5), unit: "N", hint: isFinite(num(v.n)) ? "" : "Method default — standardise and enter your own" },
      { label: "Equivalent weight", value: m.eq, unit: "mg/meq" },
      { label: "Result", value: fmt(c), unit: m.unit, tone: "key" },
      { label: "Method note", value: m.note },
    ];
    if (vt - vb <= 0) out.push({ label: "Check", value: "Blank equals or exceeds sample titre", tone: "warn" });
    return out;
  },
},
{
  id: "cod", mod: "water", tier: "routine", name: "COD", sub: "Open reflux / closed reflux titrimetric",
  formula: "COD (mg/L) = (A − B) × M × 8000 / V_sample",
  ref: "APHA 5220 B/C. A = mL FAS for blank, B = mL FAS for sample, M = molarity of FAS.",
  inputs: [
    N("a", "FAS for blank, A", "mL", ""), N("b", "FAS for sample, B", "mL", ""),
    N("m", "FAS molarity", "M", "0.1"), N("vs", "Sample volume", "mL", "20"),
    N("bod", "BOD of the same sample (optional)", "mg/L", "", "To get the BOD/COD ratio"),
  ],
  run: (v) => {
    const a = num(v.a), b = num(v.b), m = num(v.m), vs = num(v.vs);
    if (![a, b, m, vs].every(isFinite) || vs <= 0) return null;
    const cod = ((a - b) * m * 8000) / vs;
    const out = [
      { label: "Net FAS consumed", value: fmt(a - b), unit: "mL" },
      { label: "COD", value: fmt(cod), unit: "mg/L", tone: "key" },
    ];
    if (a - b <= 0) out.push({ label: "Check", value: "Sample titre equals or exceeds blank — dilute and repeat", tone: "warn" });
    const bod = num(v.bod);
    if (isFinite(bod) && cod > 0) {
      const r = bod / cod;
      out.push({ label: "BOD / COD ratio", value: fmt(r), tone: "key",
        hint: r >= 0.6 ? "Readily biodegradable" : r >= 0.3 ? "Moderately biodegradable" : "Poorly biodegradable — likely industrial" });
    }
    return out;
  },
},
{
  id: "grav", mod: "water", tier: "routine", name: "Gravimetric Solids", sub: "TS, TDS, TSS, VSS and oil & grease",
  formula: "C (mg/L) = (W₂ − W₁) × 1000 / V_sample",
  ref: "APHA 2540 B/C/D/E and 5520 B. Dry to constant weight; W in mg, V in mL.",
  inputs: [
    S("what", "Determination", GRAV, GRAV[2]),
    N("w1", "Tare weight of dish / filter, W₁", "mg", ""), N("w2", "Weight after drying, W₂", "mg", ""),
    N("vs", "Sample volume", "mL", "100"), N("w3", "Weight after ignition at 550 °C, W₃", "mg", "", "For volatile / fixed solids only"),
  ],
  run: (v) => {
    const w1 = num(v.w1), w2 = num(v.w2), vs = num(v.vs);
    if (![w1, w2, vs].every(isFinite) || vs <= 0) return null;
    const c = ((w2 - w1) * 1000) / vs;
    const out = [
      { label: "Net residue", value: fmt(w2 - w1), unit: "mg" },
      { label: v.what.split(" —")[0], value: fmt(c), unit: "mg/L", tone: "key" },
      { label: "…in g/L", value: fmt(c / 1000) },
    ];
    if (w2 - w1 <= 0) out.push({ label: "Check", value: "Non-positive residue — re-check the weighing", tone: "warn" });
    const w3 = num(v.w3);
    if (isFinite(w3)) {
      const vol = ((w2 - w3) * 1000) / vs;
      out.push({ label: "Volatile fraction", value: fmt(vol), unit: "mg/L", tone: "key" });
      out.push({ label: "Fixed fraction", value: fmt(((w3 - w1) * 1000) / vs), unit: "mg/L" });
      out.push({ label: "Volatile share", value: fmt((vol / c) * 100), unit: "%" });
    }
    return out;
  },
},
{
  id: "bod", mod: "water", tier: "routine", name: "BOD", sub: "5-day BOD with seed correction",
  formula: "BOD = [(D₁ − D₂) − (B₁ − B₂) f] / P",
  ref: "APHA 5210 B. Valid only if DO depletion ≥ 2.0 mg/L and residual DO ≥ 1.0 mg/L.",
  inputs: [
    N("d1", "Initial DO of dilution, D₁", "mg/L", ""), N("d2", "Final DO after incubation, D₂", "mg/L", ""),
    N("vs", "Sample volume", "mL", ""), N("vt", "Total bottle volume", "mL", "300"),
    N("b1", "Seed blank initial DO, B₁", "mg/L", "", "Leave blank if unseeded"),
    N("b2", "Seed blank final DO, B₂", "mg/L", ""), N("f", "Seed ratio f", "", ""),
  ],
  run: (v) => {
    const d1 = num(v.d1), d2 = num(v.d2), vs = num(v.vs), vt = num(v.vt) || 300;
    if (![d1, d2, vs].every(isFinite) || vs <= 0) return null;
    const P = vs / vt, b1 = num(v.b1), b2 = num(v.b2), f = num(v.f);
    const seed = [b1, b2, f].every(isFinite) ? (b1 - b2) * f : 0;
    const dep = d1 - d2;
    return [
      { label: "Dilution factor P", value: fmt(P, 5), hint: `1 : ${fmt(1 / P)}` },
      { label: "DO depletion", value: fmt(dep), unit: "mg/L", tone: dep >= 2 ? "ok" : "warn",
        hint: dep >= 2 ? "Meets the ≥ 2.0 mg/L criterion" : "Below 2.0 mg/L — use a stronger dilution" },
      { label: "Residual DO", value: fmt(d2), unit: "mg/L", tone: d2 >= 1 ? "ok" : "warn",
        hint: d2 >= 1 ? "Meets the ≥ 1.0 mg/L criterion" : "Below 1.0 mg/L — result invalid, dilute further" },
      seed ? { label: "Seed correction", value: fmt(seed), unit: "mg/L" } : null,
      { label: "BOD", value: fmt((dep - seed) / P), unit: "mg/L", tone: "key" },
    ].filter(Boolean);
  },
},
{
  id: "hardness", mod: "water", tier: "routine", name: "Hardness from Ca & Mg", sub: "Calculated, as CaCO₃",
  formula: "TH = 2.497 × Ca + 4.118 × Mg",
  ref: "APHA 2340 B. BIS 10500 desirable 200 mg/L, permissible 600 mg/L.",
  inputs: [N("ca", "Calcium", "mg/L", ""), N("mg", "Magnesium", "mg/L", "")],
  run: (v) => {
    const ca = num(v.ca) || 0, mg = num(v.mg) || 0;
    if (!isFinite(num(v.ca)) && !isFinite(num(v.mg))) return null;
    const th = 2.497 * ca + 4.118 * mg;
    return [
      { label: "Calcium hardness", value: fmt(2.497 * ca), unit: "mg/L as CaCO₃" },
      { label: "Magnesium hardness", value: fmt(4.118 * mg), unit: "mg/L as CaCO₃" },
      { label: "Total hardness", value: fmt(th), unit: "mg/L as CaCO₃", tone: "key" },
      { label: "Classification", value: th < 75 ? "Soft" : th < 150 ? "Moderately hard" : th < 300 ? "Hard" : "Very hard" },
      { label: "Against BIS 10500", value: th <= 200 ? "Within desirable limit" : th <= 600 ? "Above desirable, within permissible" : "Above permissible limit",
        tone: th <= 200 ? "ok" : "warn" },
    ];
  },
},
{
  id: "tds", mod: "water", tier: "routine", name: "TDS from Conductivity", sub: "Empirical EC correlation",
  formula: "TDS (mg/L) = k_e × EC (µS/cm)",
  ref: "APHA 2510. k_e is water-specific, typically 0.55–0.70. Establish it for your own matrix by gravimetric TDS.",
  inputs: [N("ec", "Electrical conductivity", "µS/cm at 25 °C", ""), N("ke", "Correlation factor k_e", "", "0.65")],
  run: (v) => {
    const ec = num(v.ec), ke = num(v.ke) || 0.65;
    if (!isFinite(ec)) return null;
    const tds = ec * ke;
    return [
      { label: "Estimated TDS", value: fmt(tds), unit: "mg/L", tone: "key" },
      { label: "Range at k_e 0.55–0.70", value: `${fmt(ec * 0.55)} – ${fmt(ec * 0.7)} mg/L` },
      { label: "Salinity class", value: ec < 250 ? "Low (C1)" : ec < 750 ? "Medium (C2)" : ec < 2250 ? "High (C3)" : "Very high (C4)", hint: "USDA irrigation classification" },
      { label: "Against BIS 10500", value: tds <= 500 ? "Within desirable limit" : tds <= 2000 ? "Above desirable, within permissible" : "Above permissible limit",
        tone: tds <= 500 ? "ok" : "warn" },
    ];
  },
},
{
  id: "ionbal", mod: "water", tier: "routine", name: "Ionic Balance", sub: "Anion–cation balance check",
  formula: "%IBE = (Σcations − Σanions) / (Σcations + Σanions) × 100",
  ref: "APHA 1030 E. Accept within ±5 % for a complete major-ion analysis.",
  inputs: [
    N("ca", "Ca²⁺", "mg/L", ""), N("mg", "Mg²⁺", "mg/L", ""), N("na", "Na⁺", "mg/L", ""), N("k", "K⁺", "mg/L", ""),
    N("hco3", "HCO₃⁻", "mg/L", ""), N("co3", "CO₃²⁻", "mg/L", ""), N("cl", "Cl⁻", "mg/L", ""),
    N("so4", "SO₄²⁻", "mg/L", ""), N("no3", "NO₃⁻", "mg/L", ""),
  ],
  run: (v) => {
    const meq = (x, e) => (num(v[x]) || 0) / e;
    const cat = meq("ca", EQW.Ca) + meq("mg", EQW.Mg) + meq("na", EQW.Na) + meq("k", EQW.K);
    const an = meq("hco3", EQW.HCO3) + meq("co3", EQW.CO3) + meq("cl", EQW.Cl) + meq("so4", EQW.SO4) + meq("no3", EQW.NO3);
    if (cat === 0 || an === 0) return null;
    const ibe = ((cat - an) / (cat + an)) * 100, ok = Math.abs(ibe) <= 5;
    return [
      { label: "Σ cations", value: fmt(cat), unit: "meq/L" }, { label: "Σ anions", value: fmt(an), unit: "meq/L" },
      { label: "Difference", value: fmt(cat - an), unit: "meq/L" },
      { label: "Ionic balance error", value: fmt(ibe), unit: "%", tone: "key" },
      { label: "Verdict", value: ok ? "Acceptable (within ±5 %)" : "Outside ±5 % — re-check the analysis", tone: ok ? "ok" : "warn",
        hint: !ok ? (ibe > 0 ? "Cation excess — an anion may be missing" : "Anion excess — a cation may be missing") : "" },
    ];
  },
},
{
  id: "sar", mod: "water", tier: "advanced", name: "SAR & RSC", sub: "Irrigation water suitability",
  formula: "SAR = Na / √((Ca + Mg)/2)      RSC = (CO₃ + HCO₃) − (Ca + Mg)",
  ref: "USDA Handbook 60. All terms in meq/L. SAR < 10 low sodium hazard; RSC < 1.25 safe, > 2.5 unsuitable.",
  inputs: [N("na", "Na⁺", "mg/L", ""), N("ca", "Ca²⁺", "mg/L", ""), N("mg", "Mg²⁺", "mg/L", ""), N("hco3", "HCO₃⁻", "mg/L", ""), N("co3", "CO₃²⁻", "mg/L", "0"), N("k", "K⁺", "mg/L", "", "Included in the soluble-sodium percent denominator only")],
  run: (v) => {
    const na = (num(v.na) || 0) / EQW.Na, ca = (num(v.ca) || 0) / EQW.Ca, mg = (num(v.mg) || 0) / EQW.Mg;
    const k = (num(v.k) || 0) / EQW.K;
    const hco3 = (num(v.hco3) || 0) / EQW.HCO3, co3 = (num(v.co3) || 0) / EQW.CO3;
    if (ca + mg === 0) return null;
    const sar = na / Math.sqrt((ca + mg) / 2), rsc = hco3 + co3 - (ca + mg);
    const sc = sar < 10 ? ["S1 — low sodium hazard", "ok"] : sar < 18 ? ["S2 — medium", "ok"] : sar < 26 ? ["S3 — high", "warn"] : ["S4 — very high", "warn"];
    const rc = rsc < 1.25 ? ["Safe", "ok"] : rsc <= 2.5 ? ["Marginal", "warn"] : ["Unsuitable", "warn"];
    return [
      { label: "Na⁺", value: fmt(na), unit: "meq/L" }, { label: "Ca²⁺ + Mg²⁺", value: fmt(ca + mg), unit: "meq/L" },
      { label: "SAR", value: fmt(sar), tone: "key" }, { label: "Sodium hazard class", value: sc[0], tone: sc[1] },
      { label: "RSC", value: fmt(rsc), unit: "meq/L", tone: "key" }, { label: "RSC rating", value: rc[0], tone: rc[1] },
      { label: "Soluble sodium %", value: fmt((na / (na + ca + mg + k)) * 100), unit: "%",
        hint: k > 0 ? "K⁺ included in the denominator as entered" : "K⁺ not entered — enter it if the analysis has it, the denominator should carry all cations" },
    ];
  },
},
{
  id: "do", mod: "water", tier: "routine", name: "DO Saturation", sub: "Percent saturation at temperature and pressure",
  formula: "ln C* = −139.34411 + 1.575701×10⁵/T − 6.642308×10⁷/T² + 1.243800×10¹⁰/T³ − 8.621949×10¹¹/T⁴",
  ref: "APHA 4500-O; Benson & Krause. T in kelvin, freshwater at 1 atm.",
  inputs: [N("t", "Water temperature", "°C", "25"), N("do", "Measured DO", "mg/L", ""), N("p", "Barometric pressure", "kPa", "101.325")],
  run: (v) => {
    const tc = num(v.t), meas = num(v.do), p = num(v.p) || 101.325;
    if (!isFinite(tc)) return null;
    const T = tc + 273.15;
    const cs = Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / T ** 2 + 1.2438e10 / T ** 3 - 8.621949e11 / T ** 4) * (p / 101.325);
    const out = [
      { label: "DO at saturation", value: fmt(cs), unit: "mg/L", tone: "key" },
      { label: "Pressure correction", value: fmt(p / 101.325, 5) + " ×" },
    ];
    if (isFinite(meas)) {
      out.push({ label: "Percent saturation", value: fmt((meas / cs) * 100), unit: "%", tone: "key" });
      out.push({ label: "Oxygen deficit", value: fmt(cs - meas), unit: "mg/L" });
      out.push({ label: "Assessment", value: meas >= 5 ? "Above 5 mg/L — supports aquatic life" : meas >= 4 ? "4–5 mg/L — stressed" : "Below 4 mg/L — poor", tone: meas >= 5 ? "ok" : "warn" });
    }
    return out;
  },
},
{
  id: "wqi", mod: "water", tier: "advanced", name: "Water Quality Index", sub: "Weighted arithmetic WQI",
  formula: "q = 100(V − V₀)/(S − V₀)    W = K/S    WQI = Σ(qW) / ΣW",
  ref: "Brown et al.; standards from BIS 10500. Leave a parameter blank to exclude it.",
  inputs: [{ id: "tbl", type: "table", label: "Observed values", rows: WQI_PARAMS }],
  run: (v) => {
    const t = v.tbl || {};
    const used = WQI_PARAMS.filter((p) => isFinite(num(t[p.k])));
    if (used.length < 3) return null;
    const K = 1 / used.reduce((s, p) => s + 1 / p.std, 0);
    let sumQW = 0, sumW = 0;
    const rows = used.map((p) => {
      const q = Math.abs(((num(t[p.k]) - p.ideal) / (p.std - p.ideal)) * 100), W = K / p.std;
      sumQW += q * W; sumW += W;
      return { p, q };
    }).sort((a, b) => b.q - a.q);
    const wqi = sumQW / sumW;
    const cls = wqi <= 25 ? ["Excellent", "ok"] : wqi <= 50 ? ["Good", "ok"] : wqi <= 75 ? ["Poor", "warn"] : wqi <= 100 ? ["Very poor", "warn"] : ["Unfit for drinking", "warn"];
    return [
      { label: "Parameters used", value: used.length },
      { label: "Highest sub-index", value: rows[0].p.k, hint: `q = ${fmt(rows[0].q)} — the main driver` },
      { label: "WQI", value: fmt(wqi), tone: "key" }, { label: "Classification", value: cls[0], tone: cls[1] },
    ];
  },
},

/* ══════════ Ambient air ══════════ */
{
  id: "ambgas", mod: "air", tier: "routine", name: "Gaseous Pollutant — Colorimetric", sub: "SO₂, NO₂, O₃ and NH₃ by the CPCB formula",
  formula: "C (µg/m³) = (A_s − A_b) × CF × (V_s / V_t) / V_a × f",
  ref: "CPCB Guidelines for Measurement of Ambient Air Pollutants (NAAQMS). CF = reciprocal of the calibration slope; f is the method factor (0.82 for NO₂, 1.962 µL→µg for O₃).",
  inputs: [
    S("method", "Method", Object.keys(AMB), Object.keys(AMB)[0]),
    N("as", "Sample absorbance, A_s", "", ""), N("ab", "Reagent blank absorbance, A_b", "", "0"),
    N("cf", "Calibration factor CF", "µg per absorbance unit", ""),
    N("vs", "Volume of absorbing solution, V_s", "mL", "30"),
    N("vt", "Aliquot taken for analysis, V_t", "mL", "10"),
    N("lpm", "Sampling flow rate", "L/min", "1.0"), N("dur", "Sampling duration", "min", "1440"),
    N("t", "Average ambient temperature", "°C", "25"), N("p", "Average pressure", "kPa", "101.325"),
  ],
  run: (v) => {
    const m = AMB[v.method]; if (!m) return null;
    const As = num(v.as), Ab = num(v.ab) || 0, cf = num(v.cf);
    const vs = num(v.vs), vt = num(v.vt), lpm = num(v.lpm), dur = num(v.dur);
    if (![As, cf, vs, vt, lpm, dur].every(isFinite) || vt <= 0) return null;
    const { V, Vn } = airVolNTP(lpm, dur, num(v.t), num(v.p));
    const isO3 = m.extra !== 1;
    const mass = (As - Ab) * cf * (isO3 ? m.extra : vs / vt);
    const C = mass / Vn / m.eff;
    const out = [
      { label: "Net absorbance (A_s − A_b)", value: fmt(As - Ab) },
      { label: "Mass in the analysed portion", value: fmt(mass), unit: "µg" },
      isO3 ? null : { label: "Aliquot factor V_s / V_t", value: fmt(vs / vt) },
      { label: "Air sampled, V_a (sampling conditions)", value: fmt(V), unit: "m³" },
      { label: "Air sampled at NTP", value: fmt(Vn), unit: "m³" },
      m.eff !== 1 ? { label: "Sampling efficiency", value: m.eff } : null,
      { label: "Concentration", value: fmt(C), unit: "µg/m³", tone: "key" },
      { label: "Duration", value: fmt(dur / 60) + " h" },
      { label: "Method note", value: m.note },
    ].filter(Boolean);
    const n = vsNaaqs(m.key, C);
    if (n) out.splice(out.length - 1, 0, n);
    return out;
  },
},
{
  /*
    FIX 1 — reporting basis.

    The pack computed the volume at NTP and graded the resulting concentration
    against NAAQS. CPCB NAAQMS reports PM10 and PM2.5 at AMBIENT conditions.
    On the worked Delhi summer day — PM10 RDS, 1.132 m³/min, 1440 min, net
    159.8 mg, 42 °C, 99.5 kPa — ambient gives 98.03 µg/m³ (within the 24 h
    limit of 100) and NTP gives 105.5 µg/m³ (exceeds it). 7.6 % apart, and it
    flips the verdict.

    The basis selector now drives the grading, ambient by default. The other
    basis is shown as a secondary row with the percentage difference so the
    size of the choice is visible. `ambgas` correctly uses NTP and is untouched.
  */
  id: "filterpm", mod: "air", tier: "routine", name: "Filter Paper PM", sub: "Gravimetric PM10, PM2.5 and SPM",
  formula: "C (µg/m³) = (W_f − W_i) × 10⁶ / V      V = Q_avg × t",
  ref: "IS 5182 Part 23 (PM10), Part 24 (PM2.5), Part 4 (SPM); CPCB NAAQMS guideline. Condition filters to constant weight. CPCB reports PM10 and PM2.5 at ambient conditions; NTP = 25 °C, 101.325 kPa is offered as a secondary basis only.",
  inputs: [
    S("sampler", "Sampler", Object.keys(SAMPLERS), Object.keys(SAMPLERS)[0]),
    S("basis", "Reporting basis", ["Ambient conditions (CPCB NAAQMS)", "NTP (25 °C, 101.325 kPa)"], "Ambient conditions (CPCB NAAQMS)"),
    N("wi", "Initial filter weight, W_i", "mg", ""), N("wf", "Final filter weight, W_f", "mg", ""),
    N("blank", "Field blank gain", "mg", "0", "Subtracted from the net mass"),
    N("q", "Average flow rate", "m³/min", "", "Blank uses the sampler default"),
    N("dur", "Sampling duration", "min", "1440"),
    N("t", "Average ambient temperature", "°C", "25"), N("p", "Average pressure", "kPa", "101.325"),
  ],
  run: (v) => {
    const s = SAMPLERS[v.sampler] || SAMPLERS["Custom flow"];
    const wi = num(v.wi), wf = num(v.wf), d = num(v.dur);
    const q = isFinite(num(v.q)) ? num(v.q) : s.q;
    if (![wi, wf, d].every(isFinite)) return null;
    const t = isFinite(num(v.t)) ? num(v.t) : 25, p = num(v.p) || 101.325;
    const V = q * d;                                     /* ambient conditions */
    const Vn = V * (298.15 / (t + 273.15)) * (p / 101.325); /* NTP */
    const net = wf - wi - (num(v.blank) || 0);
    const cAmb = (net * 1000) / V;
    const cNtp = (net * 1000) / Vn;
    const ntpBasis = String(v.basis || "").startsWith("NTP");
    const c = ntpBasis ? cNtp : cAmb;
    const other = ntpBasis ? cAmb : cNtp;
    const diff = other === 0 ? NaN : ((other - c) / c) * 100;
    const out = [
      { label: "Flow rate used", value: fmt(q), unit: "m³/min", hint: isFinite(num(v.q)) ? "As entered" : "Sampler default" },
      { label: "Net mass (blank-corrected)", value: fmt(net), unit: "mg", tone: net <= 0 ? "warn" : undefined,
        hint: net <= 0 ? "Non-positive mass — check the weighing" : "" },
      { label: "Volume, ambient conditions", value: fmt(V), unit: "m³" },
      { label: "Volume at NTP", value: fmt(Vn), unit: "m³" },
      { label: `Concentration — ${ntpBasis ? "NTP" : "ambient"} basis`, value: fmt(c), unit: "µg/m³", tone: "key" },
      { label: `…on the ${ntpBasis ? "ambient" : "NTP"} basis`, value: fmt(other), unit: "µg/m³",
        hint: isFinite(diff) ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} % against the reporting basis. Shown for comparison only — it does not drive the verdict below.` : "" },
      { label: "Duration", value: fmt(d / 60) + " h" },
    ];
    if (ntpBasis) out.push({ label: "Basis note", value: "NTP selected", tone: "warn",
      hint: "CPCB NAAQMS reports PM10 and PM2.5 at ambient conditions. A verdict graded on the NTP basis is not the CPCB basis and should say so on the report." });
    const n = vsNaaqs(s.key, c);
    if (n) out.push(n);
    return out;
  },
},
{
  id: "gasconv", mod: "air", tier: "routine", name: "µg/m³ ⇄ ppb", sub: "Gaseous pollutant unit conversion",
  formula: "ppb = (µg/m³ × V_m) / MW      V_m = 22.414 × (T/273.15) × (101.325/P)",
  ref: "NAAQS are expressed in µg/m³. Default conditions 25 °C, 101.325 kPa, giving V_m = 24.45 L/mol.",
  inputs: [
    N("mw", "Molar weight", "g/mol", "", "NO₂ 46.01 · SO₂ 64.06 · O₃ 48.00 · CO 28.01 · NH₃ 17.03 · C₆H₆ 78.11 · HCl 36.46 · HF 20.01"),
    N("ugm3", "Concentration", "µg/m³", "", "Fill either this…"), N("ppb", "Concentration", "ppb", "", "…or this"),
    N("t", "Temperature", "°C", "25"), N("p", "Pressure", "kPa", "101.325"),
  ],
  run: (v) => {
    const mw = num(v.mw), t = isFinite(num(v.t)) ? num(v.t) : 25, p = num(v.p) || 101.325;
    if (!isFinite(mw) || mw <= 0) return null;
    const Vm = 22.414 * ((t + 273.15) / 273.15) * (101.325 / p);
    const u = num(v.ugm3), b = num(v.ppb);
    const out = [{ label: "Molar volume V_m", value: fmt(Vm), unit: "L/mol" }];
    if (isFinite(u)) {
      out.push({ label: "ppb (v/v)", value: fmt((u * Vm) / mw), tone: "key" });
      out.push({ label: "ppm (v/v)", value: fmt((u * Vm) / mw / 1000) });
      out.push({ label: "mg/m³", value: fmt(u / 1000) });
    } else if (isFinite(b)) {
      out.push({ label: "µg/m³", value: fmt((b * mw) / Vm), tone: "key" });
      out.push({ label: "mg/m³", value: fmt((b * mw) / Vm / 1000) });
    } else return null;
    return out;
  },
},
{
  id: "naqi", mod: "air", tier: "advanced", name: "National AQI", sub: "CPCB sub-index method",
  formula: "I_p = [(I_Hi − I_Lo)/(BP_Hi − BP_Lo)] × (C_p − BP_Lo) + I_Lo      AQI = max(I_p)",
  ref: "CPCB National Air Quality Index (2014). At least three pollutants required, and PM10 or PM2.5 must be one of them.",
  inputs: [{ id: "tbl", type: "table", label: "Pollutant concentrations", rows: Object.keys(NAQI).map((k) => ({ k, unit: "" })) }],
  run: (v) => {
    const t = v.tbl || {};
    const subs = Object.entries(NAQI).map(([k, bands]) => {
      const c = num(t[k]);
      return isFinite(c) ? { k, c, i: subIndex(c, bands) } : null;
    }).filter((s) => s && isFinite(s.i));
    if (!subs.length) return null;
    const sorted = [...subs].sort((a, b) => b.i - a.i);
    const aqi = sorted[0].i, [band, colour] = AQI_BAND(aqi);
    const valid = subs.length >= 3 && subs.some((s) => s.k.startsWith("PM"));
    return [
      ...sorted.map((s) => ({ label: `Sub-index — ${s.k.split(" (")[0]}`, value: Math.round(s.i), hint: `${fmt(s.c)} → ${AQI_BAND(s.i)[0]}` })),
      { label: "AQI", value: Math.round(aqi), tone: "key" },
      { label: "Category", value: band, tone: "band", colour },
      { label: "Prominent pollutant", value: sorted[0].k.split(" (")[0] },
      { label: "Validity", value: valid ? "Meets CPCB criteria" : "Needs ≥ 3 pollutants including PM10 or PM2.5", tone: valid ? "ok" : "warn" },
    ];
  },
},
{
  id: "naaqs", mod: "air", tier: "advanced", name: "NAAQS Compliance", sub: "Annual mean, 98th percentile and exceedances",
  formula: "98 % compliance — 2 % of values may exceed, but not on two consecutive days",
  ref: "NAAQS 2009 notification. Annual arithmetic mean requires ≥ 104 measurements taken twice a week, 24-hourly, at uniform intervals. VERIFY: this instrument covers 8 of the 12 notified parameters — benzene, benzo(a)pyrene, arsenic and nickel are not held.",
  inputs: [
    S("pol", "Pollutant", Object.keys(NAAQS), "PM10"),
    { id: "vals", type: "series", label: "24-hourly values, in date order", hint: "Paste one value per day of monitoring — order matters for the consecutive-day rule" },
  ],
  run: (v) => {
    const a = parseSeries(v.vals), s = NAAQS[v.pol];
    if (a.length < 2) return null;
    const st = stats(a), p98 = percentile(a, 98);
    const exc = a.filter((x) => x > s.d).length;
    let consec = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > s.d && a[i - 1] > s.d) consec++;
    const pctExc = (exc / a.length) * 100;
    const out = [
      { label: "Measurements", value: st.n, tone: st.n >= 104 ? "ok" : "warn",
        hint: st.n >= 104 ? "Meets the ≥ 104 annual requirement" : `${104 - st.n} more needed for an annual mean` },
      { label: "Range", value: `${fmt(st.min)} – ${fmt(st.max)}` },
      { label: "Annual arithmetic mean", value: fmt(st.mean), tone: "key" },
    ];
    if (s.a) out.push({ label: `Against annual standard (${s.a})`, value: st.mean <= s.a ? "Within limit" : "Exceeds limit", tone: st.mean <= s.a ? "ok" : "warn" });
    out.push({ label: "98th percentile", value: fmt(p98), tone: "key" });
    out.push({ label: `Against ${s.avg} standard (${s.d})`, value: p98 <= s.d ? "Within limit" : "Exceeds limit", tone: p98 <= s.d ? "ok" : "warn" });
    out.push({ label: "Exceedance days", value: exc, hint: `${pctExc.toFixed(1)} % of measurements` });
    out.push({ label: "Consecutive-day exceedances", value: consec, tone: consec > 0 ? "warn" : "ok",
      hint: consec > 0 ? "Violates the 'not on two consecutive days' condition" : "No two consecutive exceedance days" });
    out.push({ label: "Overall", value: pctExc <= 2 && consec === 0 ? "Compliant" : "Non-compliant", tone: pctExc <= 2 && consec === 0 ? "ok" : "warn" });
    if (v.pol === "O3" || v.pol === "CO") out.push({ label: "Averaging period mismatch", value: "24-hourly series entered", tone: "warn",
      hint: `The ${v.pol} standard is an 8-hour standard. A series of 24-hourly values cannot be graded against it. Enter 8-hourly values or grade this pollutant separately.` });
    return out;
  },
},

/* ══════════ Source emission ══════════ */
{
  id: "flue", mod: "stack", tier: "advanced", name: "Flue Gas Molecular Weight", sub: "Dry and wet basis, with moisture",
  formula: "M_d = 0.44(%CO₂) + 0.32(%O₂) + 0.28(%N₂ + %CO)      M_s = M_d(1 − B_wo) + 18·B_wo",
  ref: "CPCB Source Emission Monitoring manual, Chapter 2. B_wo from the condenser method: V_v = (V_c × 22.4 / (1000 × 18)) × (T_m/273) × (760/(P_bar − P_m)).",
  inputs: [
    N("co2", "CO₂", "% v/v", ""), N("o2", "O₂", "% v/v", ""), N("co", "CO", "% v/v", "0"), N("n2", "N₂", "% v/v", ""),
    N("vc", "Condensate collected, V_c", "mL", "", "For moisture — leave blank if B_wo is entered"),
    N("vm", "Volume of gas at meter, V_m", "m³", ""),
    N("tm", "Meter temperature, T_m", "°C", "25"),
    N("pbar", "Barometric pressure, P_bar", "mm Hg", "760"),
    N("pm", "Suction at meter, P_m", "mm Hg", "0"),
    N("bwoDirect", "…or enter B_wo directly", "fraction", ""),
  ],
  run: (v) => {
    const co2 = num(v.co2) || 0, o2 = num(v.o2) || 0, co = num(v.co) || 0;
    /* An untouched form must not return a molecular weight. A finite-only test
       still passed because the CO field is seeded "0", so at least one of the
       four must be greater than zero. */
    if (!(co2 > 0 || o2 > 0 || co > 0 || num(v.n2) > 0)) return null;
    let n2 = num(v.n2);
    if (!isFinite(n2)) n2 = Math.max(0, 100 - co2 - o2 - co);
    const Md = 0.44 * co2 + 0.32 * o2 + 0.28 * (n2 + co);
    if (!isFinite(Md) || Md <= 0) return null;
    const out = [
      { label: "N₂ used", value: fmt(n2), unit: "%", hint: isFinite(num(v.n2)) ? "As entered" : "By difference" },
      { label: "Dry molecular weight M_d", value: fmt(Md), unit: "kg/kmol", tone: "key" },
    ];
    let bwo = num(v.bwoDirect);
    const vc = num(v.vc), vm = num(v.vm), tm = isFinite(num(v.tm)) ? num(v.tm) : 25, pbar = num(v.pbar) || 760, pm = num(v.pm) || 0;
    if (!isFinite(bwo) && isFinite(vc) && isFinite(vm) && vm > 0) {
      const Vv = ((vc * 22.4) / (1000 * 18)) * ((tm + 273) / 273) * (760 / (pbar - pm));
      bwo = Vv / (Vv + vm);
      out.push({ label: "Equivalent vapour volume V_v", value: fmt(Vv), unit: "m³" });
    }
    if (isFinite(bwo)) {
      out.push({ label: "B_wo (water vapour fraction)", value: fmt(bwo, 5), tone: "key" });
      out.push({ label: "Moisture", value: fmt(bwo * 100), unit: "%" });
      out.push({ label: "Wet molecular weight M_s", value: fmt(Md * (1 - bwo) + 18 * bwo), unit: "kg/kmol", tone: "key" });
    }
    return out;
  },
},
{
  id: "velocity", mod: "stack", tier: "advanced", name: "Stack Velocity & Flow", sub: "Pitot traverse to Q at NTP",
  formula: "U_s = K_p·C_p·√(ΔP)·√(T_s /(P_s·M_s))      Q_s = 3600·U_s·A_s·(1−B_wo)·(T_ref/T_s)·(P_s/P_ref)",
  ref: "CPCB Source Emission manual, Chapter 2 §8–11. K_p = 34.97 for ΔP in mm H₂O, P_s in mm Hg, T_s in K, M_s in kg/kmol. NTP = 298 K, 760 mm Hg.",
  inputs: [
    { id: "dps", type: "series", label: "Velocity pressure ΔP at each traverse point", unit: "mm H₂O", hint: "Paste all traverse readings — the mean of √ΔP is used" },
    N("cp", "Pitot tube coefficient, C_p", "", "0.84", "S-type pitot typically 0.84"),
    N("ts", "Stack gas temperature, T_s", "°C", ""),
    N("pbar", "Barometric pressure, P_bar", "mm Hg", "760"),
    N("dpstat", "Static pressure, ΔP_s", "mm H₂O", "0"),
    N("ms", "Wet molecular weight, M_s", "kg/kmol", "29"),
    N("bwo", "B_wo (water vapour fraction)", "", "0"),
    N("dia", "Stack internal diameter", "m", "", "Or enter the area below"),
    N("area", "…or stack area, A_s", "m²", ""),
  ],
  run: (v) => {
    const dps = parseSeries(v.dps);
    if (!dps.length) return null;
    const cp = num(v.cp) || 0.84, tsC = num(v.ts), pbar = num(v.pbar) || 760;
    const ms = num(v.ms) || 29, bwo = num(v.bwo) || 0;
    if (!isFinite(tsC)) return null;
    const Ts = tsC + 273.15;
    const Ps = pbar + (num(v.dpstat) || 0) / 13.6;
    const rootMean = dps.reduce((s, x) => s + Math.sqrt(Math.max(x, 0)), 0) / dps.length;
    const Us = 34.97 * cp * rootMean * Math.sqrt(Ts / (Ps * ms));
    const dia = num(v.dia);
    const As = isFinite(num(v.area)) ? num(v.area) : isFinite(dia) ? (Math.PI * dia * dia) / 4 : NaN;
    const out = [
      { label: "Traverse points", value: dps.length },
      { label: "Mean √ΔP", value: fmt(rootMean), unit: "(mm H₂O)^½" },
      { label: "Absolute stack pressure P_s", value: fmt(Ps), unit: "mm Hg" },
      { label: "Stack gas velocity U_s", value: fmt(Us), unit: "m/s", tone: "key" },
    ];
    if (isFinite(As)) {
      const Qs = 3600 * Us * As * (1 - bwo) * (298.15 / Ts) * (Ps / 760);
      out.push({ label: "Stack area A_s", value: fmt(As), unit: "m²" });
      out.push({ label: "Actual flow (stack conditions)", value: fmt(Us * As * 3600), unit: "m³/h" });
      out.push({ label: "Flow at NTP, dry, Q_s", value: fmt(Qs), unit: "Nm³/h", tone: "key" });
      out.push({ label: "…per second", value: fmt(Qs / 3600), unit: "Nm³/s" });
    }
    return out;
  },
},
{
  id: "isokinetic", mod: "stack", tier: "advanced", name: "Isokinetic Sampling Rate", sub: "Nozzle and gas-meter rates, isokineticity",
  formula: "R_s = U_s·A_n·60·1000      R_m = R_s·(T_m/T_s)·(P_s/(P_bar−P_m))·(1−B_wo)",
  ref: "CPCB Source Emission manual, Chapter 2 §12–13. Isokineticity must stay within 90–110 %.",
  inputs: [
    N("us", "Stack gas velocity, U_s", "m/s", ""),
    N("dn", "Nozzle diameter", "mm", ""),
    N("ts", "Stack temperature, T_s", "°C", ""), N("tm", "Meter temperature, T_m", "°C", "25"),
    N("pbar", "Barometric pressure, P_bar", "mm Hg", "760"),
    N("ps", "Absolute stack pressure, P_s", "mm Hg", "760"),
    N("pm", "Suction at meter, P_m", "mm Hg", "0"),
    N("bwo", "B_wo (water vapour fraction)", "", "0"),
    N("actual", "Actual metered rate achieved", "LPM", "", "Optional — to check isokineticity"),
  ],
  run: (v) => {
    const us = num(v.us), dn = num(v.dn), tsC = num(v.ts), tmC = isFinite(num(v.tm)) ? num(v.tm) : 25;
    if (![us, dn, tsC].every(isFinite) || dn <= 0) return null;
    const An = (Math.PI * (dn / 1000) ** 2) / 4;
    const Rs = us * An * 60 * 1000;
    const Ts = tsC + 273.15, Tm = tmC + 273.15;
    const pbar = num(v.pbar) || 760, ps = num(v.ps) || 760, pm = num(v.pm) || 0, bwo = num(v.bwo) || 0;
    /* Pressure ratio, corrected. The pack had ((pbar-ps)/(pbar-pm) || 1),
       which evaluates to 0 at the defaults and is then silently swallowed by
       the || 1, so the metered rate carried no pressure correction at all. */
    if (pm >= pbar) return [{ label: "Pressure check", value: "P_m must be below P_bar", tone: "warn",
      hint: "Suction at the meter cannot equal or exceed barometric pressure — the correction would divide by zero or change sign." }];
    const Rm = Rs * (Tm / Ts) * (ps / (pbar - pm)) * (1 - bwo);
    const out = [
      { label: "Nozzle area A_n", value: fmt(An, 5), unit: "m²", hint: `${fmt(An * 1e6)} mm²` },
      { label: "Rate at nozzle, R_s", value: fmt(Rs), unit: "LPM", tone: "key" },
      { label: "Rate at gas meter, R_m", value: fmt(Rm), unit: "LPM", tone: "key" },
      { label: "Temperature ratio T_m/T_s", value: fmt(Tm / Ts, 5) },
      { label: "Pressure ratio P_s/(P_bar − P_m)", value: fmt(ps / (pbar - pm), 5) },
      { label: "Moisture correction (1 − B_wo)", value: fmt(1 - bwo, 5) },
    ];
    const act = num(v.actual);
    if (isFinite(act) && Rm > 0) {
      const iso = (act / Rm) * 100;
      out.push({ label: "Isokineticity", value: fmt(iso), unit: "%", tone: iso >= 90 && iso <= 110 ? "ok" : "warn",
        hint: iso >= 90 && iso <= 110 ? "Within the 90–110 % window" : iso > 110 ? "Over-isokinetic — fines over-sampled" : "Under-isokinetic — coarse particles over-sampled" });
    }
    return out;
  },
},
{
  id: "vstd", mod: "stack", tier: "advanced", name: "Sampled Gas Volume & Dust", sub: "V_std, dust concentration, O₂ correction, emission rate",
  formula: "V_std = V_m·Y·((P_bar−P_m)/760)·(298/(T_m+273))      E_m = (W₂−W₁)·1000/V_std      E_s = E_m·(21−O_s)/(21−O_m)",
  ref: "CPCB Source Emission manual, Chapter 2 §15–19. NTP = 25 °C, 760 mm Hg, dry basis. O₂ correction is applied only when measured O₂ exceeds the reference.",
  inputs: [
    N("vm", "Volume at dry gas meter, V_m", "m³", ""),
    N("y", "Dry gas meter calibration factor, Y", "", "1.0"),
    N("pbar", "Barometric pressure, P_bar", "mm Hg", "760"),
    N("pm", "Suction at meter, P_m", "mm Hg", "0"),
    N("tm", "Meter temperature, T_m", "°C", "25"),
    N("w1", "Initial thimble / filter weight, W₁", "g", ""),
    N("w2", "Final thimble / filter weight, W₂", "g", ""),
    N("om", "Measured O₂", "% v/v", "", "For O₂ correction"),
    N("os", "Reference O₂", "% v/v", "11", "11 % for hazardous waste incinerators; 7 % for many kilns"),
    N("qs", "Flue gas flow at NTP, Q_s", "Nm³/h", "", "For the emission rate"),
  ],
  run: (v) => {
    const vm = num(v.vm), y = num(v.y) || 1, pbar = num(v.pbar) || 760, pm = num(v.pm) || 0, tm = isFinite(num(v.tm)) ? num(v.tm) : 25;
    if (!isFinite(vm)) return null;
    const Vstd = vm * y * ((pbar - pm) / 760) * (298 / (tm + 273));
    const out = [
      { label: "Pressure ratio", value: fmt((pbar - pm) / 760, 5) },
      { label: "Temperature ratio", value: fmt(298 / (tm + 273), 5) },
      { label: "Volume sampled at NTP, V_std", value: fmt(Vstd), unit: "Nm³", tone: "key" },
    ];
    const w1 = num(v.w1), w2 = num(v.w2);
    let Em = NaN;
    if ([w1, w2].every(isFinite) && Vstd > 0) {
      Em = ((w2 - w1) * 1000) / Vstd;
      out.push({ label: "Net dust collected", value: fmt((w2 - w1) * 1000), unit: "mg", tone: w2 - w1 <= 0 ? "warn" : undefined });
      out.push({ label: "Dust concentration E_m", value: fmt(Em), unit: "mg/Nm³", tone: "key" });
    }
    const om = num(v.om), os = isFinite(num(v.os)) ? num(v.os) : 11;
    let Efinal = Em;
    if (isFinite(Em) && isFinite(om)) {
      if (om > os && om < 21) {
        Efinal = (Em * (21 - os)) / (21 - om);
        out.push({ label: `Corrected to ${os} % O₂, E_s`, value: fmt(Efinal), unit: "mg/Nm³", tone: "key" });
        out.push({ label: "Correction factor", value: fmt((21 - os) / (21 - om), 4) + " ×" });
      } else {
        out.push({ label: "O₂ correction", value: `Not applied — measured O₂ ${fmt(om)} % is at or below the ${os} % reference`, tone: "warn",
          hint: "Disclosed in the citation and deliberate in this routine. CPCB applies the correction in both directions; if your consent requires that, correct by hand and say so on the report." });
      }
    }
    const qs = num(v.qs);
    if (isFinite(Efinal) && isFinite(qs)) {
      const rate = (Efinal * qs) / 1e6;
      out.push({ label: "Emission rate", value: fmt(rate), unit: "kg/h", tone: "key" });
      out.push({ label: "…per day", value: fmt(rate * 24), unit: "kg/day" });
      out.push({ label: "…per year (8760 h)", value: fmt((rate * 8760) / 1000), unit: "tonne/yr" });
    }
    return out;
  },
},
{
  id: "traverse", mod: "stack", tier: "advanced", name: "Traverse Points", sub: "Sampling point locations on a circular stack",
  formula: "d_i = (%_i / 100) × D + port length",
  ref: "IS 11255 Part 1 / USEPA Method 1. Points per diameter depend on the distance from the nearest flow disturbance — use 12 unless the ≥8 D / ≥2 D criterion is met.",
  inputs: [
    N("dia", "Stack internal diameter, D", "m", ""),
    S("np", "Points per diameter", Object.keys(TRAVERSE), "12"),
    N("port", "Port / nipple length to add", "mm", "100"),
    N("up", "Distance upstream from disturbance", "duct diameters", "", "Optional — checks the ≥ 8 D criterion"),
    N("down", "Distance downstream to exit", "duct diameters", "", "Optional — checks the ≥ 2 D criterion"),
  ],
  run: (v) => {
    const D = num(v.dia), pts = TRAVERSE[v.np], port = num(v.port) || 0;
    if (!isFinite(D) || D <= 0 || !pts) return null;
    const out = [
      { label: "Stack diameter", value: fmt(D), unit: "m" },
      { label: "Cross-sectional area", value: fmt((Math.PI * D * D) / 4), unit: "m²" },
      { label: "Points per diameter", value: pts.length, hint: `${pts.length * 2} total across two perpendicular ports` },
      ...pts.map((p, i) => ({ label: `Point ${i + 1} — ${p} % of D`, value: fmt(D * (p / 100) * 1000 + port), unit: "mm",
        hint: i === 0 ? "Measured from the inner stack wall, port length included" : "" })),
    ];
    const up = num(v.up), down = num(v.down);
    if (isFinite(up) || isFinite(down)) {
      const ok = (isFinite(up) ? up : 99) >= 8 && (isFinite(down) ? down : 99) >= 2;
      out.push({ label: "Location criteria", value: ok ? "Meets ≥ 8 D upstream and ≥ 2 D downstream" : "Does not meet the 8 D / 2 D rule — increase the number of points",
        tone: ok ? "ok" : "warn" });
    }
    out.push({ label: "Circular ducts only", value: "Rectangular not covered",
      hint: "USEPA Method 1 treats a rectangular duct by dividing the cross-section into equal areas, not by these percentages. Do not apply this table to a rectangular duct." });
    return out;
  },
},

/* ══════════ Dispersion modelling ══════════ */
{
  id: "pasquill", mod: "disp", tier: "advanced", name: "Pasquill Stability Class", sub: "From wind speed and insolation or cloud cover",
  formula: "Class A (very unstable) → F (moderately stable); D is neutral",
  ref: "Pasquill (1961) / Turner. Use D for heavily overcast conditions, day or night, regardless of wind speed.",
  inputs: [
    N("u", "Surface wind speed at 10 m", "m/s", ""),
    S("when", "Time", ["Day", "Night"], "Day"),
    S("ins", "Insolation (day) or cloud cover (night)", ["Strong", "Moderate", "Slight", "≥ 4/8 cloud", "≤ 3/8 cloud"], "Moderate"),
    N("z", "Height to scale the wind to", "m", "", "Optional — gives u at stack height"),
    S("terrain", "Terrain", Object.keys(SIGMA), "Rural / open country"),
  ],
  run: (v) => {
    const u = num(v.u);
    if (!isFinite(u) || u < 0) return null;
    const row = PASQUILL.find((r) => u < r.max) || PASQUILL[PASQUILL.length - 1];
    const day = v.when === "Day";
    const key = v.ins;
    const cls = day ? row.day[key] : row.night[key];
    if (!cls) return [{ label: "Selection", value: day ? "Pick Strong, Moderate or Slight for daytime" : "Pick a cloud-cover option for night", tone: "warn" }];
    const primary = cls.split("–")[0];
    const out = [
      { label: "Wind band", value: row.max === Infinity ? "> 6 m/s" : `< ${row.max} m/s` },
      { label: "Stability class", value: cls, tone: "key" },
      { label: "Description", value: CLASS_DESC[primary] },
      { label: "Dispersion behaviour", value: "ABC".includes(primary) ? "Unstable — rapid vertical mixing, high near-field ground concentrations" : primary === "D" ? "Neutral — the usual choice for high winds or overcast skies" : "Stable — limited vertical mixing, plume travels far before touching down" },
    ];
    const z = num(v.z);
    if (isFinite(z) && z > 0) {
      const p = POWER_P[v.terrain][primary];
      out.push({ label: "Power-law exponent p", value: p, hint: `${v.terrain}, class ${primary}` });
      out.push({ label: `Wind speed at ${fmt(z)} m`, value: fmt(u * Math.pow(z / 10, p)), unit: "m/s", tone: "key" });
    }
    return out;
  },
},
{
  id: "plumerise", mod: "disp", tier: "advanced", name: "Plume Rise", sub: "Briggs buoyancy flux and effective stack height",
  formula: "F = g·v_s·d²·(T_s−T_a)/(4T_s)      Δh = 21.425 F^¾/u (F<55)  ·  38.71 F^⅗/u (F≥55)      H = h_s + Δh",
  ref: "Briggs (1975). For stable classes E and F, Δh = 2.6 (F/(u·s))^⅓ with s = (g/T_a)(∂θ/∂z), capped by the calm-stable form.",
  inputs: [
    N("hs", "Physical stack height, h_s", "m", ""),
    N("d", "Stack exit internal diameter, d", "m", ""),
    N("vs", "Exit gas velocity, v_s", "m/s", ""),
    N("ts", "Exit gas temperature, T_s", "°C", ""),
    N("ta", "Ambient temperature, T_a", "°C", "25"),
    N("u", "Wind speed at stack height, u", "m/s", ""),
    S("cls", "Stability class", ["A", "B", "C", "D", "E", "F"], "D"),
    N("dtdz", "Potential temperature gradient ∂θ/∂z", "K/m", "", "Stable classes only — defaults 0.02 (E) and 0.035 (F)"),
  ],
  run: (v) => {
    const hs = num(v.hs), d = num(v.d), vs = num(v.vs), tsC = num(v.ts), taC = isFinite(num(v.ta)) ? num(v.ta) : 25, u = num(v.u);
    if (![hs, d, vs, tsC, u].every(isFinite) || u <= 0) return null;
    const Ts = tsC + 273.15, Ta = taC + 273.15;
    const r = briggsRise(vs, d, Ts, Ta, u, v.cls, num(v.dtdz));
    const out = [
      { label: "Buoyancy flux F", value: fmt(r.F), unit: "m⁴/s³", tone: "key" },
      { label: "Regime", value: r.mode },
      r.s ? { label: "Stability parameter s", value: fmt(r.s, 4), unit: "s⁻²" } : null,
      { label: "Plume rise Δh", value: fmt(r.dh), unit: "m", tone: "key" },
      { label: "Effective stack height H", value: fmt(hs + r.dh), unit: "m", tone: "key" },
      isFinite(r.xf) ? { label: "Distance to final rise, x_f", value: fmt(r.xf), unit: "m" } : null,
      { label: "Momentum rise (3·d·v_s/u)", value: fmt((3 * d * vs) / u), unit: "m",
        hint: (3 * d * vs) / u > r.dh ? "Momentum exceeds buoyancy — use the momentum value" : "Buoyancy dominates" },
      { label: "Volumetric exit flow", value: fmt(((Math.PI * d * d) / 4) * vs), unit: "m³/s" },
    ].filter(Boolean);
    if (vs / u < 1.5) out.push({ label: "Downwash check", value: "v_s/u below 1.5 — stack-tip downwash likely, consider raising exit velocity", tone: "warn" });
    return out;
  },
},
{
  id: "gauss", mod: "disp", tier: "advanced", name: "Gaussian Plume", sub: "Concentration at a receptor",
  formula: "C = Q/(2π·u·σ_y·σ_z) · exp(−y²/2σ_y²) · [exp(−(z−H)²/2σ_z²) + exp(−(z+H)²/2σ_z²)]",
  ref: "Briggs (1973) σ curves, valid roughly 100 m to 10 km. Steady state, flat terrain, no deposition or decay, wind and stability constant along the path.",
  inputs: [
    N("q", "Emission rate, Q", "g/s", "", "mg/Nm³ × Nm³/h ÷ 3.6×10⁶ gives g/s"),
    N("h", "Effective stack height, H", "m", "", "Physical height + plume rise"),
    N("u", "Wind speed at stack height, u", "m/s", ""),
    S("terrain", "Terrain", Object.keys(SIGMA), "Rural / open country"),
    S("cls", "Stability class", ["A", "B", "C", "D", "E", "F"], "D"),
    N("x", "Downwind distance, x", "m", "1000"),
    N("y", "Crosswind offset, y", "m", "0"),
    N("z", "Receptor height, z", "m", "0", "0 for ground level"),
  ],
  run: (v) => {
    const q = num(v.q), H = num(v.h), u = num(v.u), x = num(v.x), y = num(v.y) || 0, z = num(v.z) || 0;
    if (![q, H, u, x].every(isFinite) || u <= 0 || x <= 0) return null;
    const [sy, sz] = SIGMA[v.terrain][v.cls](x);
    const C = plumeC(q, u, sy, sz, H, y, z);
    const Cg = plumeC(q, u, sy, sz, H, 0, 0);
    const out = [
      { label: "σ_y at x", value: fmt(sy), unit: "m" },
      { label: "σ_z at x", value: fmt(sz), unit: "m" },
      { label: "Concentration at the receptor", value: fmt(C), unit: "µg/m³", tone: "key" },
      { label: "Ground-level centreline at the same x", value: fmt(Cg), unit: "µg/m³", tone: "key" },
      { label: "Plume half-width (2.15 σ_y)", value: fmt(2.15 * sy), unit: "m", hint: "Where concentration falls to 10 % of the centreline" },
      { label: "Vertical spread (2.15 σ_z)", value: fmt(2.15 * sz), unit: "m" },
      { label: "Mixing check", value: sz > H / 2 ? "Plume has reached the ground — reflection term matters" : "Plume still elevated at this distance" },
    ];
    if (x < 100 || x > 10000)
      out.push({ label: "Range warning", value: "Briggs curves are fitted for roughly 100 m – 10 km; this result is an extrapolation", tone: "warn" });
    return out;
  },
},
{
  id: "maxglc", mod: "disp", tier: "advanced", name: "Maximum Ground-Level Concentration", sub: "Peak concentration and where it occurs",
  formula: "C_max occurs near σ_z = H/√2 ;  C_max ≈ 2Q/(π·e·u·H²) × (σ_z/σ_y)",
  ref: "Computed by scanning the ground-level centreline from 20 m to 50 km with the Briggs curves, so it holds for any σ ratio.",
  inputs: [
    N("q", "Emission rate, Q", "g/s", ""),
    N("h", "Effective stack height, H", "m", ""),
    N("u", "Wind speed at stack height, u", "m/s", ""),
    S("terrain", "Terrain", Object.keys(SIGMA), "Rural / open country"),
    S("cls", "Stability class", ["A", "B", "C", "D", "E", "F"], "D"),
    N("limit", "Compare against a standard", "µg/m³", "", "Optional — e.g. NAAQS 80 for SO₂ 24 h"),
  ],
  run: (v) => {
    const q = num(v.q), H = num(v.h), u = num(v.u);
    if (![q, H, u].every(isFinite) || u <= 0 || H < 0) return null;
    const f = SIGMA[v.terrain][v.cls];
    let best = { C: -1, x: NaN, sy: NaN, sz: NaN };
    for (let i = 0; i <= 2000; i++) {
      const x = 20 * Math.pow(50000 / 20, i / 2000);
      const [sy, sz] = f(x);
      if (!(sy > 0 && sz > 0)) continue;
      const C = plumeC(q, u, sy, sz, H, 0, 0);
      if (C > best.C) best = { C, x, sy, sz };
    }
    if (best.C < 0) return null;
    const analytic = (2 * q * 1e6) / (Math.PI * Math.E * u * H * H) * (best.sz / best.sy);
    const out = [
      { label: "Maximum ground-level concentration", value: fmt(best.C), unit: "µg/m³", tone: "key" },
      { label: "Distance to the maximum", value: fmt(best.x), unit: "m", tone: "key" },
      { label: "…in km", value: fmt(best.x / 1000), unit: "km" },
      { label: "σ_y there", value: fmt(best.sy), unit: "m" },
      { label: "σ_z there", value: fmt(best.sz), unit: "m", hint: `H/√2 = ${fmt(H / Math.SQRT2)} m` },
      { label: "Classical estimate 2Q/(π e u H²)·(σ_z/σ_y)", value: fmt(analytic), unit: "µg/m³",
        hint: "Agreement with the scan confirms the σ_z = H/√2 assumption holds here" },
    ];
    const lim = num(v.limit);
    if (isFinite(lim) && lim > 0)
      out.push({ label: "Against the standard entered", value: best.C <= lim ? "Within limit" : "Exceeds limit",
        tone: best.C <= lim ? "ok" : "warn", hint: `${((best.C / lim) * 100).toFixed(0)} % of ${fmt(lim)} µg/m³` });
    return out;
  },
},
{
  id: "linesource", mod: "disp", tier: "advanced", name: "Line & Area Sources", sub: "Roads by line source, urban areas by box model",
  formula: "Line:  C = 2q / (√(2π)·σ_z·u·sin φ) · exp(−H²/2σ_z²)      Box:  C = q_A·L / (u·H_mix)",
  ref: "Infinite crosswind line source (Turner). The box model assumes complete vertical mixing to the mixing height and no background.",
  inputs: [
    S("mode", "Source type", ["Line source (road)", "Area source (box model)"], "Line source (road)"),
    N("q", "Line: emission per unit length", "g/s per m", "", "Vehicles per second × g per vehicle-metre"),
    N("h", "Line: source height, H", "m", "0.5"),
    N("x", "Line: distance from the road", "m", "50"),
    N("phi", "Line: wind angle to the road", "degrees", "90", "90° is perpendicular; below 45° the model is unreliable"),
    S("terrain", "Terrain", Object.keys(SIGMA), "Urban"),
    S("cls", "Stability class", ["A", "B", "C", "D", "E", "F"], "D"),
    N("u", "Wind speed", "m/s", ""),
    N("qa", "Area: emission flux", "g/s per m²", ""),
    N("len", "Area: box length along the wind", "m", ""),
    N("hmix", "Area: mixing height", "m", "500"),
  ],
  run: (v) => {
    const u = num(v.u);
    if (!isFinite(u) || u <= 0) return null;
    if (String(v.mode || "").startsWith("Line")) {
      const q = num(v.q), H = num(v.h) || 0, x = num(v.x), phi = num(v.phi) || 90;
      if (![q, x].every(isFinite) || x <= 0) return null;
      const [, sz] = SIGMA[v.terrain][v.cls](x);
      const sinp = Math.sin((phi * Math.PI) / 180);
      const C = ((2 * q) / (Math.sqrt(2 * Math.PI) * sz * u * sinp)) * Math.exp(-(H * H) / (2 * sz * sz)) * 1e6;
      const out = [
        { label: "σ_z at that distance", value: fmt(sz), unit: "m" },
        { label: "sin φ", value: fmt(sinp, 4) },
        { label: "Concentration", value: fmt(C), unit: "µg/m³", tone: "key" },
      ];
      if (phi < 45) out.push({ label: "Angle warning", value: "Below 45° the infinite-line approximation breaks down — treat as indicative only", tone: "warn" });
      return out;
    }
    const qa = num(v.qa), L = num(v.len), hm = num(v.hmix) || 500;
    if (![qa, L].every(isFinite)) return null;
    const C = ((qa * L) / (u * hm)) * 1e6;
    return [
      { label: "Ventilation coefficient u × H_mix", value: fmt(u * hm), unit: "m²/s" },
      { label: "Box-averaged concentration", value: fmt(C), unit: "µg/m³", tone: "key" },
      { label: "Total area emission", value: fmt(qa * L), unit: "g/s per m of crosswind width" },
      { label: "Note", value: "Uniform mixing to H_mix and no background — treat as a screening estimate" },
    ];
  },
},

/* ══════════ Hazardous waste ══════════ */
{
  id: "leach", mod: "hw", tier: "advanced", name: "Leachate Compliance", sub: "TCLP and landfill acceptance criteria",
  formula: "Compare the extract concentration against the regulatory level for each constituent",
  ref: "USEPA 40 CFR 261.24 (TCLP toxicity characteristic, mg/L in the extract). EU values are Council Decision 2003/33/EC waste acceptance criteria at L/S 10 l/kg, expressed as mg/kg dry substance — check the basis before comparing. India: verify against Schedule II of the Hazardous and Other Wastes Rules, 2016, and the CPCB TSDF landfill criteria, which are not reproduced here.",
  inputs: [
    S("set", "Criteria set", Object.keys(LEACH_SETS), Object.keys(LEACH_SETS)[0]),
    { id: "tbl", type: "table", label: "Extract concentrations", rows: LEACH.map((l) => ({ k: l.k, unit: "mg/L" })) },
  ],
  run: (v) => {
    const col = LEACH_SETS[v.set], t = v.tbl || {};
    const euBasis = col !== "us";
    const rows = LEACH.map((l) => ({ ...l, c: num(t[l.k]), lim: l[col] })).filter((r) => isFinite(r.c));
    if (!rows.length) return null;
    const graded = rows.filter((r) => r.lim != null);
    const fails = graded.filter((r) => r.c > r.lim);
    const out = [
      { label: "Basis of the criteria set", value: euBasis ? "mg/kg dry substance at L/S 10 l/kg" : "mg/L in the TCLP extract",
        tone: euBasis ? "warn" : undefined,
        hint: euBasis ? "The input table is labelled mg/L. The EU sets are mg/kg dry substance at a liquid-to-solid ratio of 10 l/kg. Convert your data to that basis before reading the verdict." : "" },
      { label: "Constituents entered", value: rows.length, hint: graded.length < rows.length ? `${rows.length - graded.length} have no limit in this set` : "" },
      ...graded.sort((a, b) => b.c / b.lim - a.c / a.lim).map((r) => ({
        label: r.k, value: fmt(r.c), unit: `of ${r.lim}`, tone: r.c > r.lim ? "warn" : "ok",
        hint: `${((r.c / r.lim) * 100).toFixed(0)} % of the limit`,
      })),
      { label: "Constituents exceeding", value: fails.length, tone: fails.length ? "warn" : "ok" },
      { label: "Outcome",
        value: fails.length ? `Fails on ${fails.map((f) => f.k).join(", ")}` : "All entered constituents within the criteria",
        tone: fails.length ? "warn" : "ok" },
    ];
    if (col === "us" && fails.length)
      out.push({ label: "USEPA consequence", value: "Exhibits the toxicity characteristic — the waste carries a D-code and is a listed hazardous waste for disposal purposes", tone: "warn" });
    return out;
  },
},
{
  id: "dre", mod: "hw", tier: "advanced", name: "DRE & Combustion Efficiency", sub: "Incinerator destruction performance",
  formula: "DRE = (W_in − W_out)/W_in × 100      CE = CO₂/(CO₂ + CO) × 100",
  ref: "DRE ≥ 99.99 % for hazardous waste, ≥ 99.9999 % for PCBs and POPs. CE ≥ 99.9 %. Hazardous and Other Wastes Rules, 2016 (India) and 40 CFR 264.343 (USA) use the same DRE definition.",
  inputs: [
    N("win", "POHC fed to the incinerator, W_in", "g/h", ""),
    N("wout", "POHC in the stack gas, W_out", "g/h", ""),
    N("co2", "CO₂ in flue gas", "% v/v", ""),
    N("co", "CO in flue gas", "% v/v", ""),
    N("coMg", "…or CO", "mg/Nm³", "", "Compared against the 100 mg/Nm³ hourly standard"),
    S("target", "DRE target", ["99.99 % — hazardous waste", "99.9999 % — PCB / POPs"], "99.99 % — hazardous waste"),
  ],
  run: (v) => {
    const win = num(v.win), wout = num(v.wout);
    const out = [];
    if ([win, wout].every(isFinite) && win > 0) {
      const dre = ((win - wout) / win) * 100;
      const target = String(v.target || "").startsWith("99.9999") ? 99.9999 : 99.99;
      out.push({ label: "Mass destroyed", value: fmt(win - wout), unit: "g/h" });
      out.push({ label: "DRE", value: dre.toFixed(6), unit: "%", tone: "key" });
      out.push({ label: "Against target", value: dre >= target ? "Meets the requirement" : "Below the requirement",
        tone: dre >= target ? "ok" : "warn", hint: `Target ${target} % · shortfall ${dre < target ? fmt(target - dre) + " %" : "none"}` });
      out.push({ label: "Equivalent decontamination", value: `1 in ${fmt(win / Math.max(wout, 1e-12), 3)}` });
    }
    const co2 = num(v.co2), co = num(v.co);
    if ([co2, co].every(isFinite) && co2 + co > 0) {
      const ce = (co2 / (co2 + co)) * 100;
      out.push({ label: "Combustion efficiency", value: ce.toFixed(4), unit: "%", tone: "key" });
      out.push({ label: "Against 99.9 % requirement", value: ce >= 99.9 ? "Meets the requirement" : "Below the requirement", tone: ce >= 99.9 ? "ok" : "warn" });
    }
    const cm = num(v.coMg);
    if (isFinite(cm))
      out.push({ label: "CO against 100 mg/Nm³ standard", value: cm <= 100 ? "Within limit" : "Exceeds limit", tone: cm <= 100 ? "ok" : "warn",
        hint: `${fmt(cm)} mg/Nm³ at 11 % O₂, hourly average` });
    return out.length ? out : null;
  },
},
{
  id: "teq", mod: "hw", tier: "advanced", name: "Dioxin / Furan TEQ", sub: "WHO-2005 toxic equivalency",
  formula: "TEQ = Σ (C_i × TEF_i)",
  ref: "WHO-2005 mammalian TEFs. Incinerator standard 0.1 ng TEQ/Nm³ at 11 % O₂, dry basis — Hazardous and Other Wastes Rules 2016 (India), EU Industrial Emissions Directive 2010/75/EU. VERIFY the standard against the schedule in force before reporting a verdict.",
  inputs: [
    { id: "tbl", type: "table", label: "Congener concentrations", rows: TEF.map(([k, tef]) => ({ k, unit: "ng/Nm³", std: tef })) },
    N("om", "Measured O₂", "% v/v", "", "Optional — corrects the TEQ to 11 % O₂"),
    N("os", "Reference O₂", "% v/v", "11"),
  ],
  run: (v) => {
    const t = v.tbl || {};
    const rows = TEF.map(([k, tef]) => ({ k, tef, c: num(t[k]) })).filter((r) => isFinite(r.c));
    if (!rows.length) return null;
    const teq = rows.reduce((s, r) => s + r.c * r.tef, 0);
    const top = [...rows].map((r) => ({ ...r, contrib: r.c * r.tef })).sort((a, b) => b.contrib - a.contrib);
    const out = [
      { label: "Congeners entered", value: rows.length, hint: `of ${TEF.length} 2,3,7,8-substituted` },
      { label: "Total concentration", value: fmt(rows.reduce((s, r) => s + r.c, 0)), unit: "ng/Nm³" },
      { label: "TEQ (measured O₂)", value: fmt(teq), unit: "ng TEQ/Nm³", tone: "key" },
      { label: "Largest contributor", value: top[0].k, hint: teq > 0 ? `${((top[0].contrib / teq) * 100).toFixed(0)} % of the TEQ` : "" },
    ];
    const om = num(v.om), os = isFinite(num(v.os)) ? num(v.os) : 11;
    let final = teq;
    if (isFinite(om) && om > os && om < 21) {
      final = (teq * (21 - os)) / (21 - om);
      out.push({ label: `TEQ corrected to ${os} % O₂`, value: fmt(final), unit: "ng TEQ/Nm³", tone: "key" });
    }
    out.push({ label: "Against 0.1 ng TEQ/Nm³", value: final <= 0.1 ? "Within limit" : "Exceeds limit", tone: final <= 0.1 ? "ok" : "warn",
      hint: `${((final / 0.1) * 100).toFixed(0)} % of the standard` });
    return out;
  },
},
{
  id: "coproc", mod: "hw", tier: "advanced", name: "Co-processing Feed Check", sub: "Blend calorific value, TSR and pollutant load",
  formula: "NCV_blend = Σ(w_i · NCV_i)      TSR = (AFR thermal energy / total thermal energy) × 100",
  ref: "CPCB guidelines for co-processing of hazardous and other wastes in cement kilns. Chlorine, sulphur and heavy-metal input limits are plant- and permit-specific — enter your own.",
  inputs: [
    N("mass", "Waste feed rate", "t/h", ""),
    N("ncv", "Net calorific value of the waste", "kcal/kg", ""),
    N("cl", "Chlorine in the waste", "%", ""),
    N("s", "Sulphur in the waste", "%", ""),
    N("hg", "Mercury in the waste", "mg/kg", ""),
    N("fuel", "Total kiln thermal input", "Gcal/h", "", "For the thermal substitution rate"),
    N("clLim", "Permit limit — chlorine input", "kg/h", ""),
    N("hgLim", "Permit limit — mercury input", "g/h", ""),
  ],
  run: (v) => {
    const m = num(v.mass), ncv = num(v.ncv);
    if (![m, ncv].every(isFinite) || m <= 0) return null;
    const energy = (m * 1000 * ncv) / 1e6;
    const out = [
      { label: "Waste feed rate", value: fmt(m), unit: "t/h" },
      { label: "Thermal energy from waste", value: fmt(energy), unit: "Gcal/h", tone: "key" },
      { label: "…in GJ/h", value: fmt(energy * 4.1868) },
    ];
    const fuel = num(v.fuel);
    if (isFinite(fuel) && fuel > 0) {
      const tsr = (energy / fuel) * 100;
      out.push({ label: "Thermal substitution rate", value: fmt(tsr), unit: "%", tone: "key",
        hint: tsr > 30 ? "Above 30 % — most Indian permits require specific approval at this level" : "" });
    }
    const cl = num(v.cl), s = num(v.s), hg = num(v.hg);
    if (isFinite(cl)) {
      const clLoad = m * 1000 * (cl / 100);
      out.push({ label: "Chlorine input", value: fmt(clLoad), unit: "kg/h", tone: "key" });
      const lim = num(v.clLim);
      if (isFinite(lim)) out.push({ label: "Against the chlorine limit", value: clLoad <= lim ? "Within limit" : "Exceeds limit", tone: clLoad <= lim ? "ok" : "warn" });
      if (cl > 1) out.push({ label: "Chlorine note", value: "Above 1 % Cl — bypass dust and dioxin formation risk rise sharply", tone: "warn" });
    }
    if (isFinite(s)) out.push({ label: "Sulphur input", value: fmt(m * 1000 * (s / 100)), unit: "kg/h" });
    if (isFinite(hg)) {
      const hgLoad = m * hg;
      out.push({ label: "Mercury input", value: fmt(hgLoad), unit: "g/h", tone: "key" });
      const lim = num(v.hgLim);
      if (isFinite(lim)) out.push({ label: "Against the mercury limit", value: hgLoad <= lim ? "Within limit" : "Exceeds limit", tone: hgLoad <= lim ? "ok" : "warn" });
    }
    return out;
  },
},
{
  id: "hp", mod: "hw", tier: "advanced", name: "EU Hazardous Property Screening", sub: "HP concentration cut-offs by summation",
  formula: "A waste is hazardous for a property when Σ c_i ≥ the cut-off for that property",
  ref: "Annex III of Directive 2008/98/EC as amended by Regulation (EU) 2017/997 and Regulation (EU) 1357/2014. This screens on concentration only — HP12, HP14 and HP15 also have test-based routes, and India classifies by Schedule I/II listing rather than by these cut-offs.",
  inputs: [
    N("hp4", "Σ substances classified Eye/Skin Irrit. 2", "%", ""),
    N("hp5", "Σ STOT SE 3 / Asp. Tox. 1", "%", ""),
    N("hp6", "Σ Acute Tox. 3 (oral)", "%", ""),
    N("hp7", "Σ Carc. 1A / 1B", "%", ""),
    N("hp8", "Σ Skin Corr. 1A/1B/1C", "%", ""),
    N("hp10", "Σ Repr. 1A / 1B", "%", ""),
    N("hp11", "Σ Muta. 1A / 1B", "%", ""),
    N("hp13", "Σ respiratory or skin sensitisers", "%", ""),
  ],
  run: (v) => {
    const rules = [
      ["hp4", "HP4 — Irritant", 20], ["hp5", "HP5 — STOT / aspiration toxicity", 20],
      ["hp6", "HP6 — Acute toxicity", 5], ["hp7", "HP7 — Carcinogenic", 0.1],
      ["hp8", "HP8 — Corrosive", 5], ["hp10", "HP10 — Toxic for reproduction", 0.3],
      ["hp11", "HP11 — Mutagenic", 0.1], ["hp13", "HP13 — Sensitising", 10],
    ];
    const rows = rules.map(([id, label, cut]) => ({ label, cut, c: num(v[id]) })).filter((r) => isFinite(r.c));
    if (!rows.length) return null;
    const trig = rows.filter((r) => r.c >= r.cut);
    return [
      ...rows.map((r) => ({ label: r.label, value: fmt(r.c), unit: `of ${r.cut} %`,
        tone: r.c >= r.cut ? "warn" : "ok", hint: r.c >= r.cut ? "Cut-off reached — property assigned" : "Below cut-off" })),
      { label: "Properties triggered", value: trig.length, tone: trig.length ? "warn" : "ok" },
      { label: "Screening outcome",
        value: trig.length ? `Hazardous for ${trig.map((t) => t.label.split(" —")[0]).join(", ")}` : "No hazardous property triggered on these cut-offs",
        tone: trig.length ? "warn" : "ok" },
      { label: "Caution", value: "Concentration route only — HP14 ecotoxicity and the mirror-entry rules need separate assessment" },
    ];
  },
},

/* ══════════ Trace metal indices ══════════ */
{
  id: "efcf", mod: "hw", tier: "advanced", name: "EF, CF & I_geo", sub: "Single-element contamination indices",
  formula: "EF = (M/Ref)_sample ÷ (M/Ref)_background     CF = C/B     I_geo = log₂(C / 1.5B)",
  ref: "Müller (1969); Buat-Ménard. Reference element usually Fe or Al. Background from local uncontaminated soil or Turekian & Wedepohl shale.",
  inputs: [
    N("cs", "Metal in sample", "mg/kg", ""), N("cb", "Metal in background", "mg/kg", ""),
    N("rs", "Reference element in sample", "mg/kg", "", "For EF only — e.g. Fe or Al"),
    N("rb", "Reference element in background", "mg/kg", ""),
  ],
  run: (v) => {
    const cs = num(v.cs), cb = num(v.cb), rs = num(v.rs), rb = num(v.rb);
    if (![cs, cb].every(isFinite) || cb <= 0) return null;
    const cf = cs / cb, igeo = Math.log2(cs / (1.5 * cb));
    const ig = igeo < 0 ? "0 — uncontaminated" : igeo < 1 ? "1 — uncontaminated to moderate" : igeo < 2 ? "2 — moderately contaminated"
      : igeo < 3 ? "3 — moderate to heavy" : igeo < 4 ? "4 — heavily contaminated" : igeo < 5 ? "5 — heavy to extreme" : "6 — extremely contaminated";
    const out = [
      { label: "Contamination factor CF", value: fmt(cf), tone: "key" },
      { label: "CF class", value: cf < 1 ? "Low" : cf < 3 ? "Moderate" : cf < 6 ? "Considerable" : "Very high", tone: cf < 1 ? "ok" : "warn" },
      { label: "Geoaccumulation index I_geo", value: fmt(igeo), tone: "key" },
      { label: "I_geo class", value: ig, tone: igeo < 1 ? "ok" : "warn" },
    ];
    if ([rs, rb].every(isFinite) && rs > 0 && rb > 0) {
      const ef = (cs / rs) / (cb / rb);
      out.push({ label: "Enrichment factor EF", value: fmt(ef), tone: "key" });
      out.push({ label: "EF class", value: ef < 2 ? "Minimal / no enrichment" : ef < 5 ? "Moderate" : ef < 20 ? "Significant" : ef < 40 ? "Very high" : "Extremely high",
        tone: ef < 2 ? "ok" : "warn", hint: ef < 1.5 ? "Consistent with a crustal source" : "Suggests an anthropogenic contribution" });
    }
    return out;
  },
},
{
  id: "pli", mod: "hw", tier: "advanced", name: "Pollution Load Index", sub: "Multi-element PLI from CF values",
  formula: "PLI = (CF₁ × CF₂ × … × CFₙ)^(1/n)",
  ref: "Tomlinson et al. (1980). PLI < 1 unpolluted · = 1 baseline · > 1 progressive deterioration.",
  inputs: [{ id: "cfs", type: "series", label: "Contamination factors (CF)", hint: "One CF per metal — compute each with the EF/CF calculator" }],
  run: (v) => {
    const a = parseSeries(v.cfs).filter((x) => x > 0);
    if (a.length < 2) return null;
    const pli = Math.pow(a.reduce((s, x) => s * x, 1), 1 / a.length), cd = a.reduce((s, x) => s + x, 0);
    return [
      { label: "Metals included", value: a.length },
      { label: "Degree of contamination C_d", value: fmt(cd), hint: cd < 8 ? "Low" : cd < 16 ? "Moderate" : cd < 32 ? "Considerable" : "Very high" },
      { label: "Modified degree mC_d", value: fmt(cd / a.length) },
      { label: "PLI", value: fmt(pli), tone: "key" },
      { label: "Interpretation", value: pli < 1 ? "Unpolluted" : pli === 1 ? "At baseline" : "Polluted — progressive deterioration", tone: pli < 1 ? "ok" : "warn" },
    ];
  },
},
{
  id: "bcf", mod: "hw", tier: "advanced", name: "BCF & Translocation Factor", sub: "Plant uptake and internal transport",
  formula: "BCF = C_root / C_soil      TF = C_shoot / C_root      BAC = C_shoot / C_soil",
  ref: "BCF > 1 indicates accumulation. TF > 1 with BCF > 1 suggests a phytoextraction candidate; BCF > 1 with TF < 1 suggests phytostabilisation.",
  supersededBy: "transfer",
  inputs: [N("soil", "Metal in soil", "mg/kg", ""), N("root", "Metal in root", "mg/kg", ""), N("shoot", "Metal in shoot / leaf", "mg/kg", "")],
  run: (v) => {
    const s = num(v.soil), r = num(v.root), sh = num(v.shoot);
    if (!isFinite(s) || s <= 0) return null;
    const out = [];
    if (isFinite(r)) out.push({ label: "BCF (root / soil)", value: fmt(r / s), tone: "key" });
    if (isFinite(sh)) out.push({ label: "BAC (shoot / soil)", value: fmt(sh / s), tone: "key" });
    if (isFinite(r) && isFinite(sh) && r > 0) {
      const tf = sh / r, bcf = r / s;
      out.push({ label: "Translocation factor TF", value: fmt(tf), tone: "key" });
      out.push({ label: "TF interpretation", value: tf > 1 ? "Efficient root-to-shoot transport" : "Metal largely retained in roots", tone: tf > 1 ? "ok" : undefined });
      out.push({ label: "Phytoremediation potential", value: bcf > 1 && tf > 1 ? "Phytoextraction candidate" : bcf > 1 ? "Phytostabilisation candidate" : "Excluder — low accumulation" });
    }
    if (out.length) out.push({ label: "Superseded", value: "Use `transfer`",
      hint: "The phyto module's `transfer` routine answers the same question with more rigour. Two routines answering one question with different rigour means the weaker one ends up in a report. This one is kept so existing records remain reproducible." });
    return out.length ? out : null;
  },
},
{
  id: "eco", mod: "hw", tier: "advanced", name: "Ecological Risk", sub: "Hakanson potential ecological risk",
  formula: "E_r = T_r × CF      RI = Σ E_r",
  ref: "Hakanson (1980). T_r: Hg 40 · Cd 30 · As 10 · Pb/Cu/Ni/Co 5 · Cr 2 · Zn/Mn 1.",
  inputs: [
    S("metal", "Metal", Object.keys(TR), "Cd"), N("cs", "Concentration in sample", "mg/kg", ""),
    N("cb", "Background concentration", "mg/kg", ""), N("ri", "Running Σ E_r from other metals", "", "0"),
  ],
  run: (v) => {
    const cs = num(v.cs), cb = num(v.cb);
    if (![cs, cb].every(isFinite) || cb <= 0) return null;
    const tr = isFinite(TR[v.metal]) ? TR[v.metal] : 1, cf = cs / cb, er = tr * cf, RI = (num(v.ri) || 0) + er;
    const erCls = er < 40 ? ["Low risk", "ok"] : er < 80 ? ["Moderate", "warn"] : er < 160 ? ["Considerable", "warn"] : er < 320 ? ["High", "warn"] : ["Very high", "warn"];
    const riCls = RI < 150 ? ["Low", "ok"] : RI < 300 ? ["Moderate", "warn"] : RI < 600 ? ["Considerable", "warn"] : ["Very high", "warn"];
    return [
      { label: "Toxic-response factor T_r", value: tr }, { label: "Contamination factor CF", value: fmt(cf) },
      { label: "Potential ecological risk E_r", value: fmt(er), tone: "key" }, { label: "E_r class", value: erCls[0], tone: erCls[1] },
      { label: "Cumulative RI", value: fmt(RI), tone: "key" }, { label: "RI class", value: riCls[0], tone: riCls[1] },
    ];
  },
},
{
  id: "health", mod: "hw", tier: "advanced", name: "Health Risk", sub: "USEPA ingestion exposure, HQ and CR",
  formula: "CDI = (C × IngR × EF × ED)/(BW × AT) × 10⁻⁶      HQ = CDI / RfD      CR = CDI × CSF",
  ref: "USEPA RAGS Part A. HQ or HI > 1 indicates non-carcinogenic concern; CR above 1×10⁻⁶–1×10⁻⁴ is the usual acceptable range.",
  inputs: [
    S("metal", "Metal", Object.keys(TOX), "As"), N("c", "Concentration in soil / dust", "mg/kg", ""),
    S("who", "Receptor", ["Adult", "Child"], "Adult"), N("ingr", "Ingestion rate", "mg/day", "", "Default 100 adult, 200 child"),
    N("ef", "Exposure frequency", "days/yr", "350"), N("ed", "Exposure duration", "years", "", "Default 30 adult, 6 child"),
    N("bw", "Body weight", "kg", "", "Default 70 adult, 15 child"),
  ],
  run: (v) => {
    const c = num(v.c);
    if (!isFinite(c)) return null;
    const child = v.who === "Child";
    const ingr = num(v.ingr) || (child ? 200 : 100), ef = num(v.ef) || 350;
    const ed = num(v.ed) || (child ? 6 : 30), bw = num(v.bw) || (child ? 15 : 70);
    const cdiN = ((c * ingr * ef * ed) / (bw * ed * 365)) * 1e-6;
    const cdiC = ((c * ingr * ef * ed) / (bw * 70 * 365)) * 1e-6;
    const tox = TOX[v.metal];
    const out = [
      { label: "Receptor assumptions", value: `${ingr} mg/d · ${ed} yr · ${bw} kg` },
      { label: "CDI, non-carcinogenic", value: fmt(cdiN), unit: "mg/kg-d", tone: "key" },
    ];

    /* FIX 2 applied here. With no RfD there is no hazard quotient, and the
       routine says so rather than dividing by null and printing Infinity. */
    if (tox.rfd == null) {
      out.push({ label: `No RfD for ${v.metal}`, value: "HQ not computed", tone: "warn", hint: tox.note });
    } else {
      const hq = cdiN / tox.rfd;
      out.push({ label: `RfD for ${v.metal}`, value: tox.rfd, unit: "mg/kg-d" });
      out.push({ label: "Hazard quotient HQ", value: fmt(hq), tone: "key" });
      out.push({ label: "Assessment", value: hq <= 1 ? "HQ ≤ 1 — no significant non-carcinogenic risk" : "HQ > 1 — potential non-carcinogenic concern", tone: hq <= 1 ? "ok" : "warn" });
    }

    if (tox.csf == null) {
      if (tox.rfd == null) out.push({ label: `No oral slope factor for ${v.metal}`, value: "CR not computed", tone: "warn",
        hint: "Use the IEUBK model for children or the Adult Lead Methodology. This routine cannot substitute for either." });
    } else {
      const cr = cdiC * tox.csf;
      out.push({ label: "CDI, carcinogenic (AT = 70 yr)", value: fmt(cdiC), unit: "mg/kg-d" });
      out.push({ label: "Cancer risk CR", value: fmt(cr), tone: "key", hint: tox.verify || "" });
      out.push({ label: "CR assessment", value: cr < 1e-6 ? "Below 1×10⁻⁶ — negligible" : cr <= 1e-4 ? "Within 10⁻⁶–10⁻⁴ acceptable range" : "Above 1×10⁻⁴ — unacceptable",
        tone: cr <= 1e-4 ? "ok" : "warn" });
    }
    out.push({ label: "Note", value: "Ingestion pathway only — add dermal and inhalation for a full HI" });
    return out;
  },
},
];

export default BASE;
