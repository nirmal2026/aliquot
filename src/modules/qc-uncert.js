/* =============================================================================
   Aliquot — src/modules/qc-uncert.js
   Uncertainty and detection-limit pack. Module: qc.

   Routines
     ubudget     Type A / Type B uncertainty budget, bottom-up
     unordtest   within-laboratory reproducibility and bias, top-down
     detlim      LOD and LOQ, four approaches, instrument limit -> method limit

   MERGE NOTES — three things this pack needs from the tree

   1. Input builders. The tree exports N, S, T (and P) from its own inputs
      module. Local equivalents are defined below so the pack runs standalone in
      Node. Delete them and import the real ones on merge; the field objects
      have the same shape.

   2. A new input type, "rows" — a repeating row editor, builder R. ubudget
      needs it: a budget is a list of components, and a list cannot be entered
      through scalar fields. Roughly 80 lines in the renderer. Until it exists,
      ubudget accepts the same information as text through the documented
      one-component-per-line format, so the routine is usable today.

   3. tier. Every routine here carries tier: "routine" | "advanced". The
      taxonomy auditor should assert that every registered routine has one, so
      a new routine cannot ship untagged.

   Citations. Eurachem/CITAC CG 4 is cited for uncertainty and for nothing else.
   The detection-limit routine does not cite it, because CG 4 has no
   detection-limit clause; it cites the documents that do.
   ============================================================================= */

import {
  mean,
  sd,
  linreg,
  uInversePrediction,
  tCrit,
  tCritOneSided,
  sigFig,
  formatWithU,
} from "../lib/stats.js";
import { combineBudget, parseComponents, PRESETS, DISTRIBUTIONS } from "../lib/uncert.js";

/* ---------- local input builders — delete on merge ------------------------ */
const N = (k, label, unit, def, o = {}) => ({ k, label, unit, def, type: "num", ...o });
const S = (k, label, opts, def, o = {}) => ({ k, label, opts, def, type: "select", ...o });
const T = (k, label, o = {}) => ({ k, label, type: "text", ...o });
const R = (k, label, o = {}) => ({ k, label, type: "rows", ...o });

/* ---------- shared helpers ------------------------------------------------ */

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
};

/* Parse a free-text list of numbers: commas, spaces, tabs or newlines. */
function series(text) {
  if (Array.isArray(text)) return text.map(num).filter(Number.isFinite);
  if (typeof text !== "string") return [];
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length)
    .map(num)
    .filter(Number.isFinite);
}

/* Parse "x, y" pairs one per line for a calibration set. */
function pairs(text) {
  if (typeof text !== "string") return { x: [], y: [] };
  const x = [];
  const y = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const f = line.split(/[\s,;\t]+/).filter((s) => s.length);
    if (f.length < 2) continue;
    const a = num(f[0]);
    const b = num(f[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      x.push(a);
      y.push(b);
    }
  }
  return { x, y };
}

const row = (label, value, unit, hint, tone) => ({ label, value, unit, hint, tone });
const warn = (label, hint) => ({ label, value: "—", unit: "", hint, tone: "warn" });

/* Concentration unit -> mg/L factor. Only units that are unambiguous for a
   liquid measurement are offered; the routine refuses to guess. */
const TO_MGL = {
  "µg/L": 0.001,
  "mg/L": 1,
  "µg/mL": 1,
  "ng/mL": 0.001,
  "mg/mL": 1000,
  "ng/L": 1e-6,
};

/* =============================================================================
   1. ubudget — Type A / Type B uncertainty budget
   ============================================================================= */

export const ubudget = {
  id: "ubudget",
  mod: "qc",
  tier: "advanced",
  name: "Uncertainty budget, Type A and Type B",
  sub: "Bottom-up combined and expanded uncertainty, with effective degrees of freedom",

  formula:
    "u_c(y) = √Σ[c_i·u(x_i)]²   ·   ν_eff = u_c⁴ / Σ(c_i⁴/ν_i)   ·   U = k·u_c, k = t(95 %, ν_eff)",

  ref:
    "Eurachem/CITAC Guide CG 4, Quantifying Uncertainty in Analytical Measurement, 3rd ed., 2012 (QUAM:2012.P1), §8 and Appendix E. JCGM 100:2008 (GUM) §4.2, §4.3, §5.1 and G.4 for the Type A / Type B distinction, the distribution divisors and Welch–Satterthwaite.",

  inputs: [
    S(
      "preset",
      "Preset component list",
      Object.keys(PRESETS).map((k) => `${k} — ${PRESETS[k].name}`),
      `generic-multiplicative — ${PRESETS["generic-multiplicative"].name}`,
      {
        hint:
          "A preset seeds the labels, evaluation types, distributions and the source to consult. It never seeds a number. The app does not know your pipette.",
      }
    ),
    N("y", "Measurement result y", "result units", NaN, {
      hint:
        "Needed because a relative component's contribution in result units is y × u_rel. Enter the result the budget belongs to.",
    }),
    T("yunit", "Unit of the result", {
      hint: "Free text. Printed on every row and on the record.",
    }),
    R("comp", "Uncertainty components", {
      cols: [
        { k: "label", label: "Component", type: "text" },
        { k: "type", label: "Type", type: "select", opts: ["A", "B"] },
        { k: "basis", label: "Basis", type: "select", opts: ["rel", "abs"] },
        {
          k: "dist",
          label: "Distribution",
          type: "select",
          opts: Object.keys(DISTRIBUTIONS),
        },
        { k: "value", label: "Value", type: "num" },
        { k: "k", label: "k", type: "num" },
        { k: "n", label: "n", type: "num" },
        { k: "expo", label: "Exponent", type: "num" },
        { k: "xval", label: "Quantity value", type: "num" },
        { k: "sens", label: "c_i (if not computed)", type: "num" },
        { k: "source", label: "Source", type: "text" },
      ],
      hint:
        'One row per component. "rel" values are in per cent of the result. "abs" values are in the unit of the input quantity and need a sensitivity coefficient: enter the quantity\'s exponent in the model (+1 proportional, −1 inversely proportional) and its value, and c_i is computed as expo × y / value. Type c_i by hand only where the model is not a simple power of that quantity — a c_i out by a factor of a thousand produces a budget that still looks reasonable. Text fallback, one per line: label | A or B | rel or abs | dist | value | k or n | c_i or expo@value | source',
    }),
    S("conf", "Confidence level", ["95 %", "99 %"], "95 %"),
    N("fixk", "Override k (leave blank to compute)", "", NaN, {
      hint:
        "Leave blank. k is computed from t at the effective degrees of freedom. Fix it only when a client or a method mandates a value, and the record will say it was fixed.",
    }),
  ],

  run(v) {
    const y = num(v.y);
    if (!Number.isFinite(y)) return null;

    const comps = parseComponents(v.comp);
    if (!comps.length) return null;

    const conf = String(v.conf || "").startsWith("99") ? 0.99 : 0.95;
    const fixedK = num(v.fixk);
    const unit = String(v.yunit || "").trim();

    const b = combineBudget(comps, y, { conf, fixedK });
    if (!b) return null;
    if (b.error) return [warn("Budget incomplete", b.error)];

    const out = [];

    /* one row per component, largest contribution first */
    for (const r of b.rows) {
      out.push(
        row(
          `  ${r.label}`,
          sigFig(r.c, 3),
          unit,
          `Type ${r.type} · ${r.distLabel} · entered ${r.value}${
            r.basis === "rel" ? " %" : ""
          } → u = ${sigFig(r.u, 3)}${r.basis === "rel" ? " %" : ""}${
            r.sens !== null ? ` · c_i = ${sigFig(r.sens, 4)} (${r.sensFrom})` : ""
          } · ${r.pct.toFixed(1)} % of the variance${
            r.negligible ? " · below one third of the largest contribution" : ""
          }${r.source ? ` · ${r.source}` : " · SOURCE NOT STATED"}`,
          r.source ? undefined : "warn"
        )
      );
    }

    out.push(row("Combined standard uncertainty u_c", sigFig(b.uc, 3), unit));
    if (Number.isFinite(b.ucRel)) {
      out.push(row("u_c, relative", sigFig(b.ucRel, 3), "%"));
    }
    out.push(
      row(
        "Effective degrees of freedom ν_eff",
        Number.isFinite(b.nuEff) ? sigFig(b.nuEff, 3) : "∞",
        "",
        Number.isFinite(b.nuEff)
          ? "Welch–Satterthwaite. Finite because at least one Type A component carries a small n."
          : "Infinite: every component is Type B. k = 2 is then the conventional choice."
      )
    );
    out.push(row("Coverage factor k", sigFig(b.k, 4), "", b.kBasis));
    out.push(
      row(
        `Expanded uncertainty U at ${(conf * 100).toFixed(0)} %`,
        sigFig(b.U, 3),
        unit
      )
    );
    if (Number.isFinite(b.URel)) {
      out.push(row("U, relative", sigFig(b.URel, 3), "%"));
    }

    const f = formatWithU(y, b.U);
    if (f) {
      out.push(
        row(
          "Report as",
          `${f.y} ± ${f.U} ${unit}`.trim(),
          "",
          `U expressed to two significant figures and the result rounded to the same decimal place, GUM 7.2.6. Coverage factor k = ${sigFig(
            b.k,
            3
          )}, approximately ${(conf * 100).toFixed(0)} % level of confidence.`
        )
      );
    }

    /* diagnostics that make the budget worth building */
    out.push(
      row(
        "Largest contribution",
        b.dominant.label,
        "",
        `${b.dominant.pct.toFixed(
          1
        )} % of the variance. Reducing any other component will not move U appreciably until this one is reduced.`
      )
    );
    if (b.overDominant) {
      out.push(
        row(
          "One component holds almost the whole variance",
          `${b.dominant.pct.toFixed(1)} %`,
          "",
          `"${b.dominant.label}" accounts for ${b.dominant.pct.toFixed(
            1
          )} % of the variance and every other component is negligible beside it. That is occasionally real. Far more often it is a sensitivity coefficient entered in the wrong units — a c_i out by a factor of a thousand produces a budget that still looks reasonable. Check this row before using the result. Where the quantity enters the model as a simple power, enter its value and exponent and let c_i be computed instead of typing it.`,
          "warn"
        )
      );
    }
    if (b.droppable) {
      out.push(
        row(
          "Components below one third of the largest",
          b.droppable,
          "",
          "CG 4 §8.2.3 rule of thumb: a component smaller than one third of the largest can usually be neglected. Keep them listed on the record; an assessor is checking that the budget is complete, not that it is short."
        )
      );
    }
    if (b.k > 2.5 && !Number.isFinite(fixedK)) {
      out.push(
        row(
          "Note on k",
          sigFig(b.k, 3),
          "",
          "k is well above 2 because a Type A component with few replicates dominates. A spreadsheet using k = 2 here would understate U by " +
            `${(100 * (1 - 2 / b.k)).toFixed(0)} %. Increase n on that component to bring k down.`,
          "warn"
        )
      );
    }
    if (Number.isFinite(fixedK)) {
      out.push(
        warn(
          "k was fixed by the user",
          `k = ${fixedK} was entered rather than computed. The computed value at ν_eff would have been used otherwise. The record states this.`
        )
      );
    }

    return out;
  },
};

/* =============================================================================
   2. unordtest — top-down uncertainty
   ============================================================================= */

export const unordtest = {
  id: "unordtest",
  mod: "qc",
  tier: "routine",
  name: "Uncertainty from control-chart and bias data",
  sub: "Top-down estimate: within-laboratory reproducibility combined with bias",

  formula:
    "u_c = √[u(R_w)² + u(bias)²]   ·   u(bias) = √[RMS_bias² + u(C_ref)²]   ·   U = 2·u_c",

  ref:
    "Nordtest Report TR 537, Handbook for Calculation of Measurement Uncertainty in Environmental Laboratories. Consistent with Eurachem/CITAC CG 4 §7.7 and §7.16, which admit reproducibility and bias data as a route to the combined uncertainty where a full component budget is not available.",

  inputs: [
    S(
      "rwsrc",
      "Source of within-laboratory reproducibility",
      ["Control chart on a stable control sample", "Duplicate analyses of routine samples", "Both, combined"],
      "Control chart on a stable control sample"
    ),
    N("srw", "Control chart s_Rw", "%", NaN, {
      hint: "Relative standard deviation of the control sample over a long period, covering different days, operators and calibrations.",
    }),
    N("nrw", "Number of control results", "", NaN),
    T("dups", "Duplicate pairs, one pair per line as: value1 value2", {
      multiline: true,
      hint: "Used for the range-based estimate. Covers sample matrix variation, which a single control sample does not.",
    }),
    N("rmsb", "RMS bias", "%", NaN, {
      hint: "Root mean square of the individual biases against a CRM or proficiency-test assigned values. Not the mean bias — the mean can be near zero while the biases are large.",
    }),
    N("ucref", "Uncertainty of the reference value u(C_ref)", "%", NaN, {
      hint: "From the CRM certificate divided by its own k, or from the PT scheme's stated uncertainty of the assigned value.",
    }),
    N("nb", "Number of bias determinations", "", NaN),
    S("corr", "Is the routine result corrected for bias?", ["No", "Yes"], "No"),
  ],

  run(v) {
    const src = String(v.rwsrc || "");
    let uRw = NaN;
    const parts = [];

    if (src.startsWith("Control") || src.startsWith("Both")) {
      const s = num(v.srw);
      if (!Number.isFinite(s) || s < 0) return null;
      uRw = s;
      parts.push(`control chart s_Rw = ${s} %`);
    }

    let sDup = NaN;
    if (src.startsWith("Duplicate") || src.startsWith("Both")) {
      const { x, y } = pairs(v.dups);
      if (x.length < 2) {
        return [
          warn(
            "Duplicate data insufficient",
            "At least two duplicate pairs are needed, and eight or more before the estimate is worth reporting."
          ),
        ];
      }
      let sum = 0;
      let used = 0;
      for (let i = 0; i < x.length; i++) {
        const m = (x[i] + y[i]) / 2;
        if (!(m > 0)) continue;
        const d = (x[i] - y[i]) / m;
        sum += d * d;
        used++;
      }
      if (!used) return [warn("Duplicate data unusable", "Every pair has a mean of zero or below.")];
      sDup = 100 * Math.sqrt(sum / (2 * used));
      parts.push(`duplicates s_r = ${sigFig(sDup, 3)} % from ${used} pairs`);
      uRw = Number.isFinite(uRw) ? Math.sqrt(uRw * uRw + sDup * sDup) : sDup;
    }

    if (!Number.isFinite(uRw)) return null;

    const rms = num(v.rmsb);
    const ucref = num(v.ucref);
    if (!Number.isFinite(rms) || !Number.isFinite(ucref)) return null;
    if (rms < 0 || ucref < 0) return null;

    const uBias = Math.sqrt(rms * rms + ucref * ucref);
    const uc = Math.sqrt(uRw * uRw + uBias * uBias);
    const U = 2 * uc;

    const out = [
      row("u(R_w), within-laboratory reproducibility", sigFig(uRw, 3), "%", parts.join(" · ")),
      row("RMS bias", sigFig(rms, 3), "%"),
      row("u(C_ref)", sigFig(ucref, 3), "%"),
      row("u(bias)", sigFig(uBias, 3), "%"),
      row("Combined standard uncertainty u_c", sigFig(uc, 3), "%"),
      row("Expanded uncertainty U, k = 2", sigFig(U, 3), "%", "Approximately 95 % level of confidence."),
    ];

    if (String(v.corr) === "No" && rms > 0) {
      out.push(
        row(
          "Bias is not corrected for",
          `${sigFig(rms, 3)} %`,
          "",
          "The bias has been folded into the uncertainty rather than applied as a correction. CG 4 §7.16 allows either, but the method must say which the laboratory does, and it must be the same choice every time.",
          "warn"
        )
      );
    }
    if (Number.isFinite(num(v.nrw)) && num(v.nrw) < 30) {
      out.push(
        warn(
          "Control chart n is small",
          `${num(v.nrw)} results. Nordtest TR 537 expects a long-term control chart. Below about 30 results the s_Rw is not yet a within-laboratory reproducibility and U is optimistic.`
        )
      );
    }
    if (Number.isFinite(num(v.nb)) && num(v.nb) < 5) {
      out.push(
        warn(
          "Few bias determinations",
          `${num(v.nb)} determinations. The RMS bias is poorly defined below about five.`
        )
      );
    }

    out.push(
      row(
        "Compare against",
        "ubudget",
        "",
        "This is the number to use for routine reporting. Build the bottom-up component budget once per method for the method file; if the two disagree by more than about a factor of two, one of them is wrong and it is usually a missing component in the bottom-up budget."
      )
    );

    return out;
  },
};

/* =============================================================================
   3. detlim — LOD and LOQ
   ============================================================================= */

export const detlim = {
  id: "detlim",
  mod: "qc",
  tier: "advanced",
  name: "Limit of detection and limit of quantification",
  sub: "Blank, spiked-replicate (MDL), calibration-residual and ISO 11843 routes, with the instrument limit converted to a method limit",

  formula:
    "LOD = k_D·s   ·   MDL = t(n−1, 0.99)·s   ·   LOD = 3.3·s(y/x)/b   ·   x_c = t·s(y/x)/b·√(1/K + 1/J + x̄²/S_xx)",

  ref:
    "40 CFR Part 136 Appendix B, Definition and Procedure for the Determination of the Method Detection Limit, Revision 2, for the spiked-replicate route. ISO 11843-1:1997 and ISO 11843-2:2000, Capability of detection, for the critical value and the minimum detectable value. ICH Q2(R2) for the calibration-residual route. IUPAC recommendations (Currie, Pure Appl. Chem. 67 (1995) 1699) for the 3s convention. Eurachem is deliberately not cited here: CG 4 is an uncertainty guide and contains no detection-limit clause.",

  inputs: [
    S(
      "mode",
      "Approach",
      [
        "Replicate blanks (3s / 10s)",
        "Spiked replicates, 40 CFR 136 App. B MDL",
        "Calibration residuals, ICH Q2(R2)",
        "Calibration function, ISO 11843-2",
      ],
      "Spiked replicates, 40 CFR 136 App. B MDL"
    ),
    T("data", "Replicate results, one per line or comma separated", {
      multiline: true,
      hint: "In the units the instrument reports. Blanks for the blank route, spiked replicates for the MDL route.",
    }),
    T("blanks", "Method blank results (MDL route)", {
      multiline: true,
      hint: "40 CFR 136 App. B Revision 2 requires a blank-based MDL_b as well as the spike-based MDL_s, and takes the greater of the two. Leave blank only if no blanks gave a numerical result.",
    }),
    N("spike", "Spike level", "same units as the data", NaN, {
      hint: "Revision 2 requires the spike to be between one and ten times the resulting MDL. The routine checks this and refuses to report outside it.",
    }),
    T("cal", "Calibration set, one point per line as: concentration, response", {
      multiline: true,
      hint: "For the ICH and ISO 11843 routes.",
    }),
    N("m", "Replicate readings of the test sample", "", 1),
    N("kd", "k for LOD", "", 3, { hint: "3 by the IUPAC convention. 3.3 in ICH Q2(R2) for the calibration route." }),
    N("kq", "k for LOQ", "", 10),
    S("unit", "Unit of the data", Object.keys(TO_MGL), "µg/L"),

    N("samp", "Sample amount taken", "g for a solid, mL for a liquid", NaN),
    S("samptype", "Sample type", ["Solid, mass in g", "Liquid, volume in mL"], "Solid, mass in g"),
    N("vfin", "Final digest or extract volume", "mL", NaN),
    N("df", "Further dilution factor", "", 1),
    N("moist", "Moisture, for a dry-weight basis", "%", NaN, {
      hint: "Leave blank to report on the basis as received.",
    }),
  ],

  run(v) {
    const mode = String(v.mode || "");
    const unit = String(v.unit || "µg/L");
    const toMgL = TO_MGL[unit];
    if (!Number.isFinite(toMgL)) return null;

    const kd = Number.isFinite(num(v.kd)) ? num(v.kd) : 3;
    const kq = Number.isFinite(num(v.kq)) ? num(v.kq) : 10;

    let lod = NaN;
    let loq = NaN;
    const out = [];

    /* ---- route 1: replicate blanks -------------------------------------- */
    if (mode.startsWith("Replicate blanks")) {
      const d = series(v.data);
      if (d.length < 2) return null;
      const s = sd(d);
      const mb = mean(d);
      if (!(s > 0)) {
        return [
          warn(
            "Standard deviation is zero",
            "Every replicate is identical. That is a resolution limit, not a detection limit — the readings are not resolving the noise. Report the resolution and say so."
          ),
        ];
      }
      lod = kd * s;
      loq = kq * s;
      out.push(row("n replicates", d.length, ""));
      out.push(row("Mean of the blanks", sigFig(mb, 4), unit));
      out.push(row("s of the blanks", sigFig(s, 4), unit));
      out.push(row(`Instrument LOD = ${kd}·s`, sigFig(lod, 3), unit));
      out.push(row(`Instrument LOQ = ${kq}·s`, sigFig(loq, 3), unit));
      if (d.length < 10) {
        out.push(
          warn(
            "Few blanks",
            `${d.length} replicates. s is poorly estimated below about ten, and the LOD inherits that. Consider the t-based multiplier of the MDL route instead of a fixed 3.`
          )
        );
      }
      const zeros = d.filter((x) => x <= 0).length;
      if (zeros) {
        out.push(
          warn(
            "Censored blanks",
            `${zeros} of ${d.length} blanks are zero or negative. A blank set truncated at zero understates s and therefore understates the LOD. Use the instrument's signed response rather than a reported "not detected".`
          )
        );
      }
    }

    /* ---- route 2: 40 CFR 136 App. B MDL ---------------------------------- */
    else if (mode.startsWith("Spiked")) {
      const d = series(v.data);
      if (d.length < 2) return null;
      if (d.length < 7) {
        return [
          warn(
            "Too few replicates",
            `${d.length} replicates. 40 CFR 136 Appendix B requires a minimum of seven. Returning an MDL from fewer would not be the procedure cited.`
          ),
        ];
      }
      const s = sd(d);
      if (!(s > 0)) {
        return [warn("Standard deviation is zero", "Every replicate is identical. Not an MDL.")];
      }
      const t = tCritOneSided(0.99, d.length - 1);
      const mdlS = t * s;

      out.push(row("n spiked replicates", d.length, ""));
      out.push(row("Mean recovered", sigFig(mean(d), 4), unit));
      out.push(row("s of the spiked replicates", sigFig(s, 4), unit));
      out.push(
        row("t(n−1, 0.99), one-sided", sigFig(t, 4), "", `n − 1 = ${d.length - 1} degrees of freedom`)
      );
      out.push(row("MDL_s, spike-based", sigFig(mdlS, 3), unit));

      /* blank-based MDL_b, Revision 2 */
      const bl = series(v.blanks);
      let mdlB = NaN;
      if (bl.length >= 2) {
        const sb = sd(bl);
        const mbl = mean(bl);
        const tb = tCritOneSided(0.99, bl.length - 1);
        mdlB = mbl + tb * sb;
        out.push(row("n method blanks", bl.length, ""));
        out.push(
          row("MDL_b, blank-based", sigFig(mdlB, 3), unit, "mean of the blanks + t(n−1, 0.99)·s of the blanks")
        );
      } else if (bl.length === 1) {
        mdlB = bl[0];
        out.push(
          row("MDL_b, blank-based", sigFig(mdlB, 3), unit, "Single blank result, taken as the highest blank result.")
        );
      } else {
        out.push(
          row(
            "MDL_b, blank-based",
            "not computed",
            "",
            "No method blank results entered. Revision 2 requires MDL_b where any blank gave a numerical result, and takes the greater of MDL_s and MDL_b. If blanks genuinely gave no numerical result, this is complete; otherwise it is not."
          )
        );
      }

      lod = Number.isFinite(mdlB) ? Math.max(mdlS, mdlB) : mdlS;
      loq = (kq / kd) * lod; /* conventional, and labelled as such below */

      out.push(
        row("MDL, reported", sigFig(lod, 3), unit, Number.isFinite(mdlB) ? "The greater of MDL_s and MDL_b." : "MDL_s, no blank-based value available.")
      );

      /* the verification check that makes this the cited procedure */
      const spike = num(v.spike);
      if (Number.isFinite(spike)) {
        const ratio = spike / lod;
        out.push(row("Spike / MDL ratio", sigFig(ratio, 3), ""));
        if (ratio > 10) {
          out.push(
            warn(
              "Spike level too high",
              `The spike is ${sigFig(ratio, 3)}× the MDL. Revision 2 requires the determination to be repeated at a lower spike level, between one and ten times the MDL. This MDL is not valid as it stands.`
            )
          );
        } else if (ratio < 1) {
          out.push(
            warn(
              "Spike level too low",
              `The spike is ${sigFig(ratio, 3)}× the MDL. Repeat at a higher level, between one and ten times the MDL.`
            )
          );
        }
      } else {
        out.push(
          warn(
            "Spike level not entered",
            "Without it the one-to-ten-times check cannot be made, and that check is part of the cited procedure, not an optional extra."
          )
        );
      }

      out.push(
        row(
          "LOQ",
          sigFig(loq, 3),
          unit,
          `${kq}/${kd} × MDL, by convention. 40 CFR 136 Appendix B defines an MDL and does not define an LOQ; the multiplier is the laboratory's stated convention and must appear in the method.`
        )
      );
    }

    /* ---- route 3: calibration residuals, ICH ----------------------------- */
    else if (mode.startsWith("Calibration residuals")) {
      const { x, y } = pairs(v.cal);
      const reg = linreg(x, y);
      if (!reg) return null;
      if (!(Math.abs(reg.b) > 0)) {
        return [warn("Slope is zero", "The calibration line has no slope. No detection limit can be derived from it.")];
      }
      const kL = Number.isFinite(num(v.kd)) && num(v.kd) !== 3 ? num(v.kd) : 3.3;
      lod = (kL * reg.syx) / Math.abs(reg.b);
      loq = (kq * reg.syx) / Math.abs(reg.b);
      out.push(row("Calibration points n", reg.n, ""));
      out.push(row("Slope b", sigFig(reg.b, 5), `response per ${unit}`));
      out.push(row("Intercept a", sigFig(reg.a, 5), "response"));
      out.push(row("Residual standard deviation s(y/x)", sigFig(reg.syx, 5), "response"));
      out.push(row("r²", sigFig(reg.r2, 5), "", "r² is not evidence of linearity. A lack-of-fit test is."));
      out.push(row(`Instrument LOD = ${kL}·s(y/x)/b`, sigFig(lod, 3), unit));
      out.push(row(`Instrument LOQ = ${kq}·s(y/x)/b`, sigFig(loq, 3), unit));
      if (Math.min(...x) > lod) {
        out.push(
          warn(
            "LOD is below the working range",
            `The lowest calibration point is ${sigFig(Math.min(...x), 3)} ${unit} and the computed LOD is below it. A limit extrapolated below the lowest standard is an extrapolation, not a measurement. Calibrate lower or report the lowest standard as the LOQ.`
          )
        );
      }
    }

    /* ---- route 4: ISO 11843-2 -------------------------------------------- */
    else if (mode.startsWith("Calibration function")) {
      const { x, y } = pairs(v.cal);
      const reg = linreg(x, y);
      if (!reg) return null;
      if (!(Math.abs(reg.b) > 0)) return [warn("Slope is zero", "No capability of detection can be derived.")];
      const K = Number.isFinite(num(v.m)) && num(v.m) > 0 ? num(v.m) : 1;
      const J = reg.n;
      const nu = reg.n - 2;
      const t = tCritOneSided(0.95, nu);
      const g = Math.sqrt(1 / K + 1 / J + (reg.xbar * reg.xbar) / reg.Sxx);
      const xc = (t * reg.syx * g) / Math.abs(reg.b);
      const xd = 2 * xc; /* alpha = beta, ISO 11843-2 §5.2 */
      lod = xd;
      loq = (kq * reg.syx) / Math.abs(reg.b);
      out.push(row("Calibration points J", J, ""));
      out.push(row("Replicate readings of the sample K", K, ""));
      out.push(row("Degrees of freedom ν", nu, ""));
      out.push(row("t(ν, 0.95) one-sided", sigFig(t, 4), ""));
      out.push(row("Critical value x_c", sigFig(xc, 3), unit, "The net concentration above which a signal is declared a detection, at a 5 % risk of a false positive."));
      out.push(
        row(
          "Minimum detectable value x_d",
          sigFig(xd, 3),
          unit,
          "ISO 11843-2 §5.2, with α = β = 0.05: the concentration that will be detected with 95 % probability. Approximately 2·x_c. This, not x_c, is the LOD."
        )
      );
      out.push(row(`LOQ = ${kq}·s(y/x)/b`, sigFig(loq, 3), unit, "ISO 11843 does not define a quantification limit. This is the ICH convention, stated as such."));
    } else {
      return null;
    }

    if (!Number.isFinite(lod) || !Number.isFinite(loq)) return null;

    /* ---- instrument limit -> method limit -------------------------------- */
    const samp = num(v.samp);
    const vfin = num(v.vfin);
    const df = Number.isFinite(num(v.df)) && num(v.df) > 0 ? num(v.df) : 1;
    const isSolid = String(v.samptype || "").startsWith("Solid");

    if (Number.isFinite(samp) && Number.isFinite(vfin)) {
      if (!(samp > 0) || !(vfin > 0)) {
        out.push(warn("Preparation factor unusable", "Sample amount and final volume must both be greater than zero."));
        return out;
      }
      const lodMgL = lod * toMgL;
      const loqMgL = loq * toMgL;

      /* Solid:  mg/kg = mg/L × V(mL) / m(g).  Liquid: same unit, × V/Vs. */
      const f = (vfin / samp) * df;
      const outUnit = isSolid ? "mg/kg" : "mg/L";
      let lodM = lodMgL * f;
      let loqM = loqMgL * f;

      out.push(
        row(
          "Preparation factor",
          sigFig(f, 4),
          isSolid ? "mL/g" : "—",
          `final volume ${vfin} mL ÷ sample ${samp} ${isSolid ? "g" : "mL"}${df !== 1 ? ` × dilution ${df}` : ""}`
        )
      );
      out.push(row("Method LOD, as received", sigFig(lodM, 3), outUnit));
      out.push(row("Method LOQ, as received", sigFig(loqM, 3), outUnit));

      const moist = num(v.moist);
      if (Number.isFinite(moist)) {
        if (!(moist >= 0 && moist < 100)) {
          out.push(
            warn(
              "Moisture out of range",
              "Moisture must be at least 0 % and below 100 %. A dry-basis conversion at 100 % moisture divides by zero."
            )
          );
        } else {
          const dry = 1 - moist / 100;
          out.push(row("Method LOD, dry basis", sigFig(lodM / dry, 3), outUnit, `moisture ${moist} %`));
          out.push(row("Method LOQ, dry basis", sigFig(loqM / dry, 3), outUnit, `moisture ${moist} %`));
        }
      }
    } else {
      out.push(
        row(
          "Method limit",
          "not computed",
          "",
          "Sample amount and final volume were not both entered, so only the instrument limit is reported. An instrument LOD is not a reportable method LOD."
        )
      );
    }

    out.push(
      row(
        "Report to",
        "2 significant figures",
        "",
        "A detection limit carried to four figures claims a precision the underlying s does not have."
      )
    );

    return out;
  },
};

export default [ubudget, unordtest, detlim];
