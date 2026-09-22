/* =============================================================================
   Aliquot — src/modules/noise.js
   Ambient noise. Module: noise.

   Routines
     noiseamb    routine   L_eq of a series, L10 / L50 / L90, zone compliance
     noiseldn    routine   day and night L_eq, L_dn, graded separately by zone
     noisecalc   routine   decibel arithmetic — energy sum, energy average,
                           background correction
     noiseatt    advanced  distance attenuation and enclosure insertion loss

   Basis
     Noise Pollution (Regulation and Control) Rules, 2000 — S.O. 123(E) dated
     14 February 2000, the Schedule: ambient air quality standards in respect of
     noise, in dB(A) Leq, by area/zone, for day time and night time. Day time is
     6 a.m. to 10 p.m.; night time is 10 p.m. to 6 a.m.

   THE ZONE LIMITS BELOW HAVE NOT BEEN RE-CHECKED AGAINST THE GAZETTE IN THIS
   BUILD. Every routine that grades against them prints VERIFY on the verdict
   row's hint. Do not remove that marker until the Schedule has been read
   against the notified text.

   ABSENT BY DESIGN — do not add them, and do not reinstate any claim that the
   app holds them:
     · firecracker noise limits
     · DG-set noise limits
     · vehicle / horn noise limits
     · occupational noise exposure limits
     · mass-law transmission loss and Fresnel barrier attenuation (see noiseatt)
   ============================================================================= */

/* ---------- input builders ------------------------------------------------ */

const N = (id, label, unit, def, hint) => ({ id, label, unit, def, hint, type: "num" });
const S = (id, label, opts, def) => ({ id, label, opts, def, type: "sel" });
const T = (id, label, hint) => ({ id, label, hint, type: "text" });

/* ---------- helpers ------------------------------------------------------- */

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : NaN; };

const fmt = (v, sig = 4) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a < 1e-4 || a >= 1e7) return v.toExponential(3).replace("e", " × 10^");
  return Number(v.toPrecision(sig)).toLocaleString("en-IN", { maximumFractionDigits: 10 });
};

/* dB are reported to 0.1 — a sound level meter of class 1 does not justify more */
const dB = (v) => (isFinite(v) ? v.toFixed(1) : "—");

const parseSeries = (t) => String(t || "").split(/[\s,;\n\t]+/).map(parseFloat).filter(isFinite);

const stats = (a) => {
  const n = a.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, min: NaN, max: NaN };
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, min: Math.min(...a), max: Math.max(...a) };
};

/* Ascending-sort percentile with linear interpolation. */
const percentile = (arr, p) => {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return NaN;
  const i = (p / 100) * (a.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
};

/* EXCEEDANCE percentile. LN is the level exceeded N % of the time, which is the
   (100 − N)th percentile on an ASCENDING sort. L10 is therefore the 90th
   percentile, not the 10th. This is the thing people get backwards. */
const LN = (arr, nPct) => percentile(arr, 100 - nPct);

/* Energy sum and energy average — 10 log10 Σ 10^(Li/10) and its mean. */
const energySum = (a) => 10 * Math.log10(a.reduce((s, x) => s + Math.pow(10, x / 10), 0));
const energyMean = (a) => 10 * Math.log10(a.reduce((s, x) => s + Math.pow(10, x / 10), 0) / a.length);

/* ---------- the Schedule -------------------------------------------------- */

/* Noise Pollution (Regulation and Control) Rules, 2000, S.O. 123(E) — the
   Schedule. Limits in dB(A) Leq. VERIFY against the Schedule as notified. */
const ZONES = {
  "Industrial area":  { day: 75, night: 70 },
  "Commercial area":  { day: 65, night: 55 },
  "Residential area": { day: 55, night: 45 },
  "Silence zone":     { day: 50, night: 40 },
};
const ZONE_OPTS = Object.keys(ZONES);
const VERIFY = "VERIFY against the Schedule as notified";
const SCHEDULE_REF =
  "Noise Pollution (Regulation and Control) Rules, 2000 — S.O. 123(E) of 14 February 2000, the Schedule: " +
  "ambient air quality standards in respect of noise, dB(A) Leq — industrial 75 day / 70 night, commercial 65 / 55, " +
  "residential 55 / 45, silence zone 50 / 40. Day time 6 a.m. to 10 p.m.; night time 10 p.m. to 6 a.m. " +
  "These limits are transcribed and carry a VERIFY marker — they have not been re-checked against the gazette in this build.";

/* One graded row against the Schedule. Returns null if the zone is unset. */
const gradeRow = (zoneKey, period, leq, label) => {
  const z = ZONES[zoneKey];
  if (!z || !isFinite(leq)) return null;
  const lim = period === "night" ? z.night : z.day;
  const over = leq - lim;
  return {
    label: label || `${period === "night" ? "Night" : "Day"} verdict — ${zoneKey}`,
    value: leq <= lim ? `Within the limit (${lim} dB(A) Leq)` : `EXCEEDS the limit by ${dB(over)} dB`,
    tone: leq <= lim ? "ok" : "warn",
    hint: `${period === "night" ? "Night time 10 p.m. – 6 a.m." : "Day time 6 a.m. – 10 p.m."}, ` +
          `${zoneKey} limit ${lim} dB(A) Leq. ${VERIFY}.`,
  };
};

/* ---------- routines ------------------------------------------------------ */

const noiseamb = {
  id: "noiseamb", mod: "noise", tier: "routine",
  name: "Ambient Noise — Leq and Percentiles",
  sub: "Energy-averaged Leq, L10 / L50 / L90, noise climate, zone compliance",
  formula: "L_eq = 10 log₁₀( (1/n) Σ 10^(Li/10) )     L10 = level exceeded 10 % of the time     Noise climate = L10 − L90",
  ref: SCHEDULE_REF + " L_eq is the ENERGY average of the sampled levels, not the arithmetic mean. " +
       "L10 / L50 / L90 are EXCEEDANCE percentiles per the usual statistical-level convention (CPCB NAAQMS noise monitoring practice).",
  inputs: [
    { id: "vals", type: "series", label: "Sound level readings, dB(A)",
      hint: "Paste the sampled fast/slow readings — one per line, or comma separated. Equal sampling interval is assumed." },
    S("zone", "Zone / area category", ZONE_OPTS, "Residential area"),
    S("period", "Period", ["Day time (6 a.m. – 10 p.m.)", "Night time (10 p.m. – 6 a.m.)"], "Day time (6 a.m. – 10 p.m.)"),
  ],
  run: (v) => {
    const a = parseSeries(v.vals);
    if (!a.length) return null;
    const st = stats(a);
    if (a.some((x) => x < 0 || x > 200))
      return [{ label: "Range check", value: "A reading outside 0–200 dB(A) was entered", tone: "warn",
        hint: "Sound levels outside 0–200 dB(A) are not measurements. Correct the series and re-run." }];
    if (st.n < 2)
      return [{ label: "Series too short", value: `n = ${st.n}`, tone: "warn",
        hint: "One reading gives no L_eq worth the name and no percentiles. Paste the full sampled series." }];

    const leq = energyMean(a);
    const l10 = LN(a, 10), l50 = LN(a, 50), l90 = LN(a, 90);
    const zone = String(v.zone || "");
    const period = String(v.period || "").startsWith("Night") ? "night" : "day";

    const out = [
      { label: "Readings n", value: st.n },
      { label: "L_eq (energy average)", value: dB(leq), unit: "dB(A)", tone: "key",
        hint: "10 log₁₀ of the mean of 10^(Li/10). Energy averaging — the loud readings dominate." },
      { label: "Arithmetic mean (NOT L_eq)", value: dB(st.mean), unit: "dB(A)",
        hint: `Shown only so the size of the error is visible: the arithmetic mean under-reads L_eq by ${dB(leq - st.mean)} dB here. Never report it as L_eq.` },
      { label: "L_max", value: dB(st.max), unit: "dB(A)" },
      { label: "L_min", value: dB(st.min), unit: "dB(A)" },
      { label: "L10", value: dB(l10), unit: "dB(A)",
        hint: "The level EXCEEDED 10 % of the time — the 90th percentile on an ascending sort. Intrusive / peak traffic level." },
      { label: "L50", value: dB(l50), unit: "dB(A)",
        hint: "The level exceeded 50 % of the time — the median." },
      { label: "L90", value: dB(l90), unit: "dB(A)",
        hint: "The level EXCEEDED 90 % of the time — the 10th percentile on an ascending sort. Taken as the residual background level." },
      { label: "Noise climate (L10 − L90)", value: dB(l10 - l90), unit: "dB",
        hint: "The spread of the fluctuating level. A wide climate means an intermittent source; a narrow one means steady background." },
      { label: "Standard deviation", value: dB(st.sd), unit: "dB" },
    ];

    const g = gradeRow(zone, period, leq);
    if (g) out.push(g);
    else out.push({ label: "Verdict", value: "Zone not selected — not graded", tone: "warn",
      hint: `Select the area category to grade L_eq against the Schedule. ${VERIFY}.` });

    out.push({ label: "Sampling note", value: "Equal intervals assumed",
      hint: "The energy average is unweighted, so the readings must be equally spaced in time. For unequal intervals, weight each level by its duration before averaging." });
    return out;
  },
};

const noiseldn = {
  id: "noiseldn", mod: "noise", tier: "routine",
  name: "Day / Night Noise and L_dn",
  sub: "Day L_eq, night L_eq graded separately, and the day–night level",
  formula: "L_dn = 10 log₁₀( [16·10^(Ld/10) + 8·10^((Ln+10)/10)] / 24 )   — 10 dB night penalty",
  ref: SCHEDULE_REF + " The Schedule grades DAY and NIGHT L_eq separately against the zone limits; " +
       "it does not notify a day–night level. L_dn is computed here on the Rules' own 16 h / 8 h split with the " +
       "conventional 10 dB night penalty, as an informative descriptor only — it is NOT an Indian standard and " +
       "carries no notified limit.",
  inputs: [
    { id: "dayvals", type: "series", label: "Day-time readings, dB(A) (6 a.m. – 10 p.m.)",
      hint: "Paste the day series, or leave blank and enter the day L_eq directly below." },
    { id: "nightvals", type: "series", label: "Night-time readings, dB(A) (10 p.m. – 6 a.m.)",
      hint: "Paste the night series, or leave blank and enter the night L_eq directly below." },
    N("ld", "…or enter day L_eq directly", "dB(A)", "", "Overrides the day series if both are given"),
    N("ln", "…or enter night L_eq directly", "dB(A)", "", "Overrides the night series if both are given"),
    S("zone", "Zone / area category", ZONE_OPTS, "Residential area"),
  ],
  run: (v) => {
    const dv = parseSeries(v.dayvals), nv = parseSeries(v.nightvals);
    const ldIn = num(v.ld), lnIn = num(v.ln);
    const Ld = isFinite(ldIn) ? ldIn : (dv.length ? energyMean(dv) : NaN);
    const Ln = isFinite(lnIn) ? lnIn : (nv.length ? energyMean(nv) : NaN);
    if (!isFinite(Ld) && !isFinite(Ln)) return null;

    const zone = String(v.zone || "");
    const out = [];

    if (isFinite(Ld))
      out.push({ label: "Day L_eq (6 a.m. – 10 p.m.)", value: dB(Ld), unit: "dB(A)", tone: "key",
        hint: dv.length && !isFinite(ldIn) ? `Energy average of ${dv.length} readings; arithmetic mean ${dB(stats(dv).mean)} dB(A) — not L_eq.` : "Entered directly." });
    else
      out.push({ label: "Day L_eq", value: "Not entered", tone: "warn",
        hint: "No day series and no day L_eq — the day-time verdict cannot be given." });

    if (isFinite(Ln))
      out.push({ label: "Night L_eq (10 p.m. – 6 a.m.)", value: dB(Ln), unit: "dB(A)", tone: "key",
        hint: nv.length && !isFinite(lnIn) ? `Energy average of ${nv.length} readings; arithmetic mean ${dB(stats(nv).mean)} dB(A) — not L_eq.` : "Entered directly." });
    else
      out.push({ label: "Night L_eq", value: "Not entered", tone: "warn",
        hint: "No night series and no night L_eq — the night-time verdict cannot be given." });

    /* graded SEPARATELY, which is what the Schedule actually requires */
    if (zone) {
      const gd = gradeRow(zone, "day", Ld);
      const gn = gradeRow(zone, "night", Ln);
      if (gd) out.push(gd);
      if (gn) out.push(gn);
    } else {
      out.push({ label: "Verdict", value: "Zone not selected — not graded", tone: "warn",
        hint: `Select the area category to grade the day and night L_eq separately against the Schedule. ${VERIFY}.` });
    }

    if (isFinite(Ld) && isFinite(Ln)) {
      const ldn = 10 * Math.log10((16 * Math.pow(10, Ld / 10) + 8 * Math.pow(10, (Ln + 10) / 10)) / 24);
      out.push({ label: "L_dn (day–night level)", value: dB(ldn), unit: "dB(A)",
        hint: "16 h day and 8 h night, matching the Rules' own day/night split, with the conventional 10 dB penalty on the night period. The US convention uses a 15 h / 9 h split from 7 a.m.; that variant is not used here." });
      out.push({ label: "L_dn is not an Indian standard", value: "No limit applied", tone: "warn",
        hint: "The Noise Rules, 2000 Schedule notifies day-time and night-time L_eq limits by zone and nothing else. L_dn is reported here as an informative descriptor for comparison with international work — it must not be graded against the Schedule, and no L_dn limit is held in this app." });
      out.push({ label: "Day − night difference", value: dB(Ld - Ln), unit: "dB",
        hint: "A small difference in a residential area usually means night-time activity that the day limit does not control." });
    }
    return out;
  },
};

const noisecalc = {
  id: "noisecalc", mod: "noise", tier: "routine",
  name: "Decibel Arithmetic",
  sub: "Energy sum, energy average, background correction",
  formula: "Σ: L = 10 log₁₀ Σ 10^(Li/10)     avg: L = 10 log₁₀ [(1/n) Σ 10^(Li/10)]\n" +
           "background: Ls = 10 log₁₀ ( 10^(Lsb/10) − 10^(Lb/10) ),  valid only for Lsb − Lb ≥ 3 dB",
  ref: "Decibel levels are logarithmic and cannot be added or averaged arithmetically. " +
       "Background correction follows the standard measurement convention used with IS/ISO source-level methods " +
       "(e.g. ISO 3744 background-noise criterion): a source-to-background difference below 3 dB gives no valid " +
       "corrected level; 3–10 dB is corrected by energy subtraction; above 10 dB the background is negligible.",
  inputs: [
    S("op", "Operation", ["Energy sum of levels", "Energy average (L_eq)", "Background correction"], "Energy sum of levels"),
    { id: "vals", type: "series", label: "Levels, dB (for sum or average)",
      hint: "One per line, or comma separated." },
    N("lsb", "Measured level, source + background", "dB", "", "Used only for background correction"),
    N("lb", "Measured background level", "dB", "", "Source off, same position and settings"),
  ],
  run: (v) => {
    const op = String(v.op || "Energy sum of levels");

    if (op === "Background correction") {
      const lsb = num(v.lsb), lb = num(v.lb);
      if (!isFinite(lsb) || !isFinite(lb)) return null;
      const d = lsb - lb;
      const out = [
        { label: "Source + background", value: dB(lsb), unit: "dB" },
        { label: "Background", value: dB(lb), unit: "dB" },
        { label: "Difference ΔL", value: dB(d), unit: "dB" },
      ];
      if (d < 3) {
        /* REFUSE. No corrected number is returned. */
        out.push({ label: "Correction", value: "REFUSED — ΔL below 3 dB", tone: "warn",
          hint: "With a source-to-background difference under 3 dB the source contributes less than half the measured energy and the subtraction is dominated by the uncertainty of the two readings — the corrected level would be arbitrary. No corrected value is returned. Reduce the background, move closer to the source, or report the measured level as an UPPER BOUND on the source level and say so." });
        out.push({ label: "Reportable", value: `Source level ≤ ${dB(lsb)} dB (upper bound)`,
          hint: "This is a bound, not a measurement of the source." });
        return out;
      }
      const ls = 10 * Math.log10(Math.pow(10, lsb / 10) - Math.pow(10, lb / 10));
      if (d > 10) {
        out.push({ label: "Corrected source level", value: dB(lsb), unit: "dB", tone: "key",
          hint: `ΔL above 10 dB — the background contributes under 0.5 dB and is negligible, so no correction is applied. Energy subtraction would give ${dB(ls)} dB.` });
      } else {
        out.push({ label: "Corrected source level", value: dB(ls), unit: "dB", tone: "key",
          hint: `ΔL is between 3 and 10 dB — correction applied by energy subtraction. Correction = −${dB(lsb - ls)} dB.` });
        out.push({ label: "Correction applied", value: `−${dB(lsb - ls)}`, unit: "dB" });
      }
      return out;
    }

    const a = parseSeries(v.vals);
    if (!a.length) return null;
    if (a.some((x) => x < -20 || x > 200))
      return [{ label: "Range check", value: "A level outside −20 to 200 dB was entered", tone: "warn",
        hint: "Check the series — these are not sound pressure levels." }];
    const st = stats(a);

    if (op === "Energy average (L_eq)") {
      const leq = energyMean(a);
      return [
        { label: "Levels n", value: st.n },
        { label: "L_eq (energy average)", value: dB(leq), unit: "dB", tone: "key",
          hint: "10 log₁₀[(1/n) Σ 10^(Li/10)]." },
        { label: "Arithmetic mean (NOT L_eq)", value: dB(st.mean), unit: "dB",
          hint: `Shown so the size of the error is visible — it under-reads L_eq by ${dB(leq - st.mean)} dB here.` },
        { label: "Highest level", value: dB(st.max), unit: "dB" },
        { label: "Lowest level", value: dB(st.min), unit: "dB" },
      ];
    }

    const sum = energySum(a);
    return [
      { label: "Sources n", value: st.n },
      { label: "Energy sum", value: dB(sum), unit: "dB", tone: "key",
        hint: "10 log₁₀ Σ 10^(Li/10). Two equal sources add 3.0 dB, ten equal sources add 10.0 dB." },
      { label: "Rise above the loudest source", value: dB(sum - st.max), unit: "dB",
        hint: `Loudest single source ${dB(st.max)} dB.` },
      { label: "Arithmetic sum (meaningless)", value: dB(a.reduce((s, x) => s + x, 0)), unit: "dB",
        hint: "Shown only to make the point that decibels do not add arithmetically. Never report it." },
    ];
  },
};

const noiseatt = {
  id: "noiseatt", mod: "noise", tier: "advanced",
  name: "Distance Attenuation & Insertion Loss",
  sub: "Point and line source divergence, measured enclosure insertion loss",
  formula: "Point source: ΔL = 20 log₁₀(r₂/r₁)     Line source: ΔL = 10 log₁₀(r₂/r₁)\n" +
           "L₂ = L₁ − ΔL − IL",
  ref: "Geometric divergence in a free field: a point source loses 6 dB per doubling of distance " +
       "(20 log₁₀ r₂/r₁), an infinite line source 3 dB per doubling (10 log₁₀ r₂/r₁). " +
       "Insertion loss must be MEASURED (level before minus level after, same position and operating condition) or " +
       "taken from the manufacturer's declared, test-report-backed figure. Mass-law transmission loss and Fresnel " +
       "barrier attenuation are deliberately NOT implemented in this app — a computed transmission loss is not an " +
       "insertion loss and must not be reported as one.",
  inputs: [
    N("l1", "Measured level L₁ at r₁", "dB(A)", "", "Free-field measurement at the reference distance"),
    N("r1", "Reference distance r₁", "m", "", "Must be greater than zero"),
    N("r2", "Prediction distance r₂", "m", "", "Must be greater than zero"),
    S("src", "Source geometry", ["Point source (20 log₁₀ r₂/r₁)", "Line source (10 log₁₀ r₂/r₁)"], "Point source (20 log₁₀ r₂/r₁)"),
    N("il", "Insertion loss of enclosure / barrier", "dB", "", "MEASURED or manufacturer-declared only — leave blank if none"),
    T("ilsrc", "Source of the insertion loss figure", "e.g. 'measured, before 92.4 / after 74.1 dB(A) at 1 m' or 'manufacturer test report no. …'. Printed with the result."),
  ],
  run: (v) => {
    const l1 = num(v.l1), r1 = num(v.r1), r2 = num(v.r2);
    if (!isFinite(l1) || !isFinite(r1) || !isFinite(r2)) return null;
    if (!(r1 > 0) || !(r2 > 0))
      return [{ label: "Range check", value: "Both distances must be greater than zero", tone: "warn",
        hint: "log₁₀(r₂/r₁) is undefined at zero distance, and the free-field relation does not hold in the near field of the source in any case." }];
    if (l1 < 0 || l1 > 200)
      return [{ label: "Range check", value: "L₁ outside 0–200 dB(A)", tone: "warn",
        hint: "Check the entered level." }];

    const ratio = r2 / r1;
    const attPoint = 20 * Math.log10(ratio);
    const attLine = 10 * Math.log10(ratio);
    const isLine = String(v.src || "").startsWith("Line");
    const att = isLine ? attLine : attPoint;
    const il = num(v.il);
    const ilUsed = isFinite(il) ? il : 0;
    const l2 = l1 - att - ilUsed;
    const ilsrc = String(v.ilsrc || "").trim();

    const out = [
      { label: "Distance ratio r₂/r₁", value: fmt(ratio) },
      { label: "Point-source divergence 20 log₁₀(r₂/r₁)", value: dB(attPoint), unit: "dB",
        hint: "Use for a single machine, stack, vent or DG set — 6 dB per doubling of distance." },
      { label: "Line-source divergence 10 log₁₀(r₂/r₁)", value: dB(attLine), unit: "dB",
        hint: "Use for a road, rail line or a long run of pipework — 3 dB per doubling of distance." },
      { label: "Geometry applied", value: isLine ? "Line source" : "Point source", tone: "key" },
      { label: "Attenuation applied", value: dB(att), unit: "dB" },
    ];

    if (isFinite(il)) {
      if (il < 0) out.push({ label: "Insertion loss check", value: "Negative insertion loss entered", tone: "warn",
        hint: "An enclosure that raises the level is possible (resonance, flanking) but is almost always a sign of a mis-measured pair. Confirm before reporting." });
      out.push({ label: "Insertion loss applied", value: dB(il), unit: "dB",
        hint: ilsrc ? `Basis: ${ilsrc}` : "No basis recorded. Enter the measurement or the manufacturer's test report reference — an insertion loss without a traceable basis is not reportable." });
      if (!ilsrc) out.push({ label: "Insertion loss basis missing", value: "Not recorded", tone: "warn",
        hint: "Record the measured before/after pair or the declared figure's test report. Insertion loss must be measured or manufacturer-declared." });
    }

    out.push({ label: "Predicted level L₂ at r₂", value: dB(l2), unit: "dB(A)", tone: "key",
      hint: "L₁ − geometric divergence" + (isFinite(il) ? " − insertion loss." : ".") });

    out.push({ label: "Not included", value: "Ground, air, barrier, meteorology", tone: "warn",
      hint: "Free-field geometric divergence only. Ground effect, atmospheric absorption, screening by barriers or buildings, reflections and wind/temperature gradients are not applied. Over long distances or downwind this can be several dB either way — the number is a screening estimate, not a prediction." });
    out.push({ label: "Mass law and barrier estimation", value: "Not implemented — by design",
      hint: "Mass-law transmission loss and Fresnel-number barrier attenuation are deliberately absent. They predict a laboratory transmission loss, not the insertion loss actually achieved on site, and substituting one for the other routinely overstates the benefit by 5–15 dB. Measure the insertion loss, or use a declared figure backed by a test report." });
    return out;
  },
};

export const ROUTINES = [noiseamb, noiseldn, noisecalc, noiseatt];
export default ROUTINES;
