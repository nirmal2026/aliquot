/* =============================================================================
   Aliquot — src/lib/uncert.js
   The uncertainty budget engine.

   Basis: Eurachem/CITAC Guide CG 4, "Quantifying Uncertainty in Analytical
   Measurement", 3rd edition, 2012 (QUAM:2012.P1), §8 and Appendix E, resting on
   JCGM 100:2008 (GUM) §4.2, §4.3, §5.1 and G.4.

   Pure logic. No DOM, no network.

   A budget is a list of components. Each component carries its own
   distribution, and the divisor follows from the distribution — that is the
   whole of Type B evaluation. Type A components carry n, and n is what makes
   the effective degrees of freedom finite and the coverage factor larger than 2.
   ============================================================================= */

import { welchSatterthwaite, tCrit, sigFig } from "./stats.js";

/* ---------- distributions ------------------------------------------------- */

/*
  Each entry: the divisor applied to the entered value to obtain a standard
  uncertainty, and the label printed on the budget row so the record shows
  which assumption was made.

  CG 4 §8.1.2 / GUM 4.3. The choice of distribution is a stated assumption, not
  a detail: rectangular against triangular on the same tolerance differs by
  about 22 %, and the record has to show which was used.
*/
export const DISTRIBUTIONS = {
  std: { div: () => 1, label: "already a standard uncertainty", needs: [] },
  k: { div: (c) => c.k, label: "expanded, divided by stated k", needs: ["k"] },
  ci95: { div: () => 1.96, label: "stated 95 % without k, divided by 1.96", needs: [] },
  rect: { div: () => Math.sqrt(3), label: "rectangular, half-width / √3", needs: [] },
  tri: { div: () => Math.sqrt(6), label: "triangular, half-width / √6", needs: [] },
  ushape: { div: () => Math.SQRT2, label: "U-shaped, half-width / √2", needs: [] },
  res: { div: () => Math.sqrt(12), label: "digital resolution d / √12", needs: [] },
  sdn: { div: (c) => Math.sqrt(c.n), label: "Type A, s / √n", needs: ["n"] },
  s: { div: () => 1, label: "Type A, s taken as u directly", needs: [] },
};

/* ---------- one component ------------------------------------------------- */

/*
  component = {
    label   string    printed on the budget row
    type    "A"|"B"   evaluation type. Drives the degrees of freedom.
    basis   "rel"|"abs"
              "rel" — value is a RELATIVE quantity in per cent of the result
              "abs" — value is in the unit of the input quantity; the
                      sensitivity coefficient converts it to result units
    dist    key of DISTRIBUTIONS
    value   number    as entered, before the divisor
    k       number    for dist "k"
    n       number    replicates, for dist "sdn" and for the degrees of freedom
    sens    number    sensitivity coefficient, "abs" only. Default 1.
    xval    number    optional. Value of the input quantity.
    expo    number    optional. Its exponent in the model: +1 where the result
                      is proportional to it, -1 where inversely proportional.
                      Where both are given, c_i is computed as expo * y / xval
                      and any entered sens is ignored.
    source  string    where the number came from. Printed. Never optional in
                      practice — a budget row with no source fails an audit.
  }

  On the sensitivity coefficient. It is the single most error-prone entry in a
  budget: a c_i wrong by a factor of a thousand produces a budget that still
  looks reasonable. For the ordinary case where an input enters the model as a
  simple power — mass, volume, a dilution factor — supply xval and expo instead
  and let the engine compute c_i = expo * y / xval. Use a hand-entered sens only
  where the model is genuinely not a power of that quantity.
*/

/* c_i for a quantity entering the model as y proportional to x^expo. */
export function sensitivityFromExponent(y, xval, expo) {
  if (!isFinite(y) || !isFinite(xval) || xval === 0 || !isFinite(expo)) return NaN;
  return (expo * y) / xval;
}

export function componentStdU(c) {
  const d = DISTRIBUTIONS[c.dist];
  if (!d) return NaN;
  const div = d.div(c);
  if (!isFinite(div) || div <= 0) return NaN;
  if (!isFinite(c.value)) return NaN;
  return Math.abs(c.value) / div;
}

/* Degrees of freedom for one component.
   Type A: n - 1.
   Type B: infinite, unless the analyst states a reliability — GUM G.4.2 gives
   nu = 0.5 * (du/u)^-2 for a Type B whose own uncertainty is judged to be
   du/u. Supported through c.rel, entered as a percentage. */
export function componentNu(c) {
  if (c.type === "A") {
    const n = Number(c.n);
    return n >= 2 ? n - 1 : NaN;
  }
  if (isFinite(c.rel) && c.rel > 0) {
    const r = c.rel / 100;
    return 0.5 * Math.pow(r, -2);
  }
  return Infinity;
}

/* ---------- the budget ---------------------------------------------------- */

/*
  combineBudget(components, y, opts)

    y      the measurement result, in its own units. Needed because a relative
           component's contribution in result units is y * u_rel.
    opts   { conf: 0.95, fixedK: null }

  Returns null on any unusable component rather than a silent number, which is
  the convention every routine in this app follows.
*/
export function combineBudget(components, y, opts = {}) {
  const conf = isFinite(opts.conf) ? opts.conf : 0.95;
  if (!Array.isArray(components) || components.length === 0) return null;
  if (!isFinite(y)) return null;

  const rows = [];
  let sumsq = 0;

  for (const c of components) {
    const u = componentStdU(c);
    if (!isFinite(u)) {
      return { error: `Component "${c.label || "(unnamed)"}" is incomplete or its distribution needs a value it does not have.` };
    }
    const nu = componentNu(c);
    if (!isFinite(nu) && nu !== Infinity) {
      return { error: `Component "${c.label}" is Type A but has no usable n. Type A needs at least 2 replicates.` };
    }

    let contrib;
    let usedSens = null;
    let sensFrom = null;
    if (c.basis === "rel") {
      /* value entered in per cent of the result */
      contrib = (y * u) / 100;
    } else {
      const derived = sensitivityFromExponent(y, c.xval, c.expo);
      if (isFinite(derived)) {
        usedSens = derived;
        sensFrom = `computed as ${c.expo} × y / ${c.xval}`;
      } else if (isFinite(c.sens)) {
        usedSens = c.sens;
        sensFrom = "entered by hand";
      } else {
        usedSens = 1;
        sensFrom = "defaulted to 1";
      }
      contrib = usedSens * u;
    }
    if (!isFinite(contrib)) {
      return { error: `Component "${c.label}" did not produce a finite contribution. Check the sensitivity coefficient.` };
    }

    rows.push({
      label: c.label || "(unnamed)",
      type: c.type,
      dist: c.dist,
      distLabel: DISTRIBUTIONS[c.dist].label,
      value: c.value,
      u,
      basis: c.basis,
      sens: usedSens,
      sensFrom,
      nu,
      c: contrib,
      source: c.source || "",
    });
    sumsq += contrib * contrib;
  }

  const uc = Math.sqrt(sumsq);
  if (!(uc > 0)) {
    return { error: "Every component evaluated to zero. A combined uncertainty of zero is not a result." };
  }

  /* share of the variance, and the CG 4 rule of thumb */
  const maxC = Math.max(...rows.map((r) => Math.abs(r.c)));
  for (const r of rows) {
    r.pct = (100 * r.c * r.c) / sumsq;
    r.negligible = Math.abs(r.c) < maxC / 3;
  }
  rows.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));

  const nuEff = welchSatterthwaite(
    rows.map((r) => ({ c: r.c, nu: r.nu })),
    uc
  );

  let k;
  let kBasis;
  if (isFinite(opts.fixedK) && opts.fixedK > 0) {
    k = opts.fixedK;
    kBasis = `fixed by the user at k = ${opts.fixedK}`;
  } else if (!isFinite(nuEff)) {
    k = 2;
    kBasis = "k = 2, conventional, all components Type B so nu_eff is infinite (approximately 95 %)";
  } else {
    k = tCrit(conf, nuEff);
    kBasis = `two-sided t at ${(conf * 100).toFixed(0)} % with nu_eff = ${sigFig(nuEff, 3)}`;
  }

  const U = k * uc;

  return {
    rows,
    uc,
    ucRel: y !== 0 ? (100 * uc) / Math.abs(y) : NaN,
    nuEff,
    k,
    kBasis,
    U,
    URel: y !== 0 ? (100 * U) / Math.abs(y) : NaN,
    y,
    conf,
    dominant: rows[0],
    droppable: rows.filter((r) => r.negligible).length,
    /* A single component holding almost the whole variance is occasionally
       real — a badly performing balance, a poor recovery — but far more often
       it is a sensitivity coefficient entered in the wrong units. The routine
       says so rather than printing a confident wrong answer. */
    overDominant: rows[0].pct > 90,
  };
}

/* ---------- standard component library ------------------------------------ */

/*
  Presets seed the component LIST — labels, evaluation types, distributions and
  the source that must be filled in. They never seed a numeric uncertainty
  value. Same rule as regulatory limits: the app does not know your pipette.

  Sources named here are the documents the analyst reads to get the number, and
  are printed on the budget row.
*/
const B = (label, dist, source, basis = "rel") => ({
  label,
  type: "B",
  basis,
  dist,
  value: NaN,
  source,
});
const A = (label, source, basis = "rel") => ({
  label,
  type: "A",
  basis,
  dist: "sdn",
  value: NaN,
  n: NaN,
  source,
});

export const PRESETS = {
  "generic-multiplicative": {
    name: "Generic multiplicative model",
    note: "Every component entered as a relative standard uncertainty. Correct whenever the result is a product and quotient of its inputs, which covers most analytical results.",
    comps: [],
  },

  "icpms-solid": {
    name: "Trace metal in a solid by ICP-MS, acid digestion",
    note: "The calibration component usually dominates near the LOQ and the digestion recovery dominates well above it. If neither is the largest row, check the budget before trusting it.",
    comps: [
      A("Repeatability of the whole method, replicate digests", "Own data, n replicate digestions of one sample"),
      B("Calibration standard, certified value", "k", "CRM certificate, divide by the certificate's own k"),
      B("Calibration standard, purity", "rect", "CRM certificate, stated as a lower limit"),
      B("Calibration curve, inverse prediction", "std", "Computed by the calibration routine, u(x0)"),
      B("Sample mass, balance", "res", "Balance readability, counted for tare and gross", "abs"),
      B("Digestion vessel final volume", "tri", "Volumetric flask specification, at its marked reference temperature", "abs"),
      B("Final volume, temperature departure", "rect", "Laboratory temperature range against the flask's reference temperature", "abs"),
      B("Dilution, pipette systematic error", "rect", "ISO 8655-2:2022 maximum permissible systematic error, or the pipette's calibration certificate"),
      A("Dilution, pipette repeatability", "Own gravimetric check, ISO 8655-6:2022"),
      B("Recovery, bias against a CRM", "std", "Own recovery study; state whether the result is corrected for recovery"),
      B("Moisture, dry-basis conversion", "rect", "Own moisture determination"),
    ],
  },

  "aas-water": {
    name: "Trace metal in water by AAS",
    note: "No digestion term where the sample is filtered and acidified only. Add one if the method digests.",
    comps: [
      A("Repeatability, replicate determinations", "Own data"),
      B("Calibration standard, certified value", "k", "CRM certificate, divide by the certificate's own k"),
      B("Calibration standard, purity", "rect", "CRM certificate"),
      B("Calibration curve, inverse prediction", "std", "Computed by the calibration routine, u(x0)"),
      B("Sample volume, pipette systematic error", "rect", "ISO 8655-2:2022 or the calibration certificate"),
      A("Sample volume, pipette repeatability", "Own gravimetric check, ISO 8655-6:2022"),
      B("Final volume, volumetric flask", "tri", "Flask specification at its marked reference temperature", "abs"),
      B("Recovery, bias", "std", "Own recovery study"),
    ],
  },

  titrimetric: {
    name: "Titrimetric determination",
    note: "The titrant concentration term carries the whole standardisation chain. Build that as its own budget and bring the answer in as one component.",
    comps: [
      A("Repeatability, replicate titrations", "Own data"),
      B("Titrant concentration, from standardisation", "std", "Own standardisation budget, brought in as a standard uncertainty"),
      B("Burette, volume delivered", "tri", "Burette specification at its marked reference temperature", "abs"),
      B("Burette, temperature departure", "rect", "Laboratory temperature range", "abs"),
      B("End-point detection bias", "rect", "Own indicator blank or potentiometric comparison", "abs"),
      B("Aliquot, pipette systematic error", "rect", "ISO 8655-2:2022 or glassware specification"),
      A("Aliquot, pipette repeatability", "Own gravimetric check"),
      B("Molar mass of the analyte", "rect", "IUPAC atomic weight uncertainties"),
    ],
  },

  "gravimetric-spm": {
    name: "Gravimetric particulate on a filter",
    note: "Two weighings, so the balance term is counted twice. Conditioning and filter handling are usually larger than the balance.",
    comps: [
      B("Balance readability, tare weighing", "res", "Balance specification", "abs"),
      B("Balance readability, gross weighing", "res", "Balance specification", "abs"),
      B("Balance linearity", "rect", "Balance calibration certificate", "abs"),
      A("Filter conditioning and handling, blank filters", "Own field-blank or laboratory-blank data", "abs"),
      A("Sampled volume, flow rate", "Own flow calibration data"),
      B("Sampling duration, timer", "rect", "Timer resolution and drift"),
      B("Temperature at sampling", "rect", "Sensor specification or certificate", "abs"),
      B("Barometric pressure at sampling", "rect", "Sensor specification or certificate", "abs"),
    ],
  },

  "stack-isokinetic": {
    name: "Stack particulate, isokinetic sampling",
    note: "Feed the sampled-volume terms through the isokinetic routine with the Kragten helper rather than combining them by hand.",
    comps: [
      B("Balance readability, tare and gross", "res", "Balance specification", "abs"),
      A("Filter and probe-wash recovery", "Own data", "abs"),
      B("Nozzle diameter", "rect", "Measured, micrometer resolution and out-of-roundness"),
      B("Pitot tube coefficient", "rect", "Pitot calibration certificate or the type-S default"),
      B("Manometer / differential pressure", "rect", "Instrument specification"),
      B("Dry gas meter volume, calibration factor", "k", "Dry gas meter calibration certificate"),
      B("Meter temperature", "rect", "Sensor specification", "abs"),
      B("Barometric pressure", "rect", "Barometer specification", "abs"),
      B("Moisture determination", "std", "Own impinger gravimetry"),
      B("Stack gas molecular weight, Orsat or analyser", "rect", "Analyser specification"),
    ],
  },

  "ambient-gaseous": {
    name: "Ambient gaseous pollutant, wet chemical",
    note: "Absorption efficiency is a real component and is usually omitted. If it is not in the budget, the budget is not complete.",
    comps: [
      A("Repeatability, replicate analyses", "Own data"),
      B("Calibration curve, inverse prediction", "std", "Computed by the calibration routine, u(x0)"),
      B("Calibration standard, certified value and purity", "k", "CRM certificate"),
      B("Absorbing solution volume", "tri", "Volumetric specification", "abs"),
      B("Aliquot taken for colour development", "rect", "Pipette specification"),
      A("Sampled air volume, flow rate", "Own rotameter or MFC calibration"),
      B("Sampling duration", "rect", "Timer resolution"),
      B("Temperature and pressure reduction to NTP", "rect", "Sensor specifications"),
      B("Absorption / collection efficiency", "rect", "Own or published efficiency study"),
    ],
  },
};

/* ---------- text fallback for the component list --------------------------- */

/*
  The proper input for a budget is a repeating row editor — see the pack header
  for the "rows" input type this needs. Until that exists in the renderer, a
  budget can be entered as one component per line:

    label | A or B | rel or abs | dist | value | k or n | sensitivity | source

  The sensitivity field accepts either a plain number, or "exponent@value" —
  "-1@0.5000" meaning the result is inversely proportional to a quantity whose
  value is 0.5000, from which c_i is computed. Prefer the second form: it is the
  one that cannot be out by a factor of a thousand.

  Trailing fields may be omitted. Blank lines and lines starting with # ignored.
*/
const NUMERIC_FIELDS = ["value", "k", "n", "sens", "xval", "expo", "rel"];

export function parseComponents(text) {
  if (Array.isArray(text)) {
    /* Rows arriving from the row editor carry strings. Coerce here rather than
       in the caller, so every entry point into the engine is numeric. A blank
       cell must become NaN, not 0 — zero is a legitimate entry and silently
       substituting it is how a budget loses a component. */
    return text.map((r) => {
      const c = { ...r };
      for (const f of NUMERIC_FIELDS) {
        if (c[f] === "" || c[f] === null || c[f] === undefined) delete c[f];
        else if (typeof c[f] === "string") c[f] = Number(c[f].trim());
      }
      if (c.type !== "A") c.type = "B";
      c.basis = c.basis === "abs" ? "abs" : "rel";
      return c;
    });
  }
  if (typeof text !== "string") return [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const f = line.split("|").map((s) => s.trim());
    if (f.length < 5) continue;
    const type = /^a$/i.test(f[1]) ? "A" : "B";
    const dist = f[3];
    const kn = Number(f[5]);
    const c = {
      label: f[0],
      type,
      basis: /^abs/i.test(f[2]) ? "abs" : "rel",
      dist,
      value: Number(f[4]),
      source: f[7] || "",
    };
    if (dist === "k") c.k = kn;
    if (dist === "sdn" || type === "A") c.n = kn;
    if (c.basis === "abs" && f[6]) {
      const m = /^\s*(-?[\d.]+)\s*@\s*(-?[\d.eE+-]+)\s*$/.exec(f[6]);
      if (m) {
        c.expo = Number(m[1]);
        c.xval = Number(m[2]);
      } else {
        c.sens = Number(f[6]);
      }
    }
    out.push(c);
  }
  return out;
}
