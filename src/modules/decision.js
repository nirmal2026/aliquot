/* =============================================================================
   Aliquot — src/modules/decision.js
   Decision rules and statements of conformity. Module: qc.

   Routines
     decision    conformity decision with a signed guard band, five rules,
                 upper / lower / two-sided limits, specific risk

   Basis
     ISO/IEC 17025:2017 §7.8.6.1 — when a statement of conformity is made, the
     decision rule applied shall be documented and reported.
     ILAC-G8:2019 §4 — guard-banded acceptance and rejection, the acceptance
     limit A, and the sign convention on the guard band w.
     JCGM 106:2012 §7 — specific consumer's and producer's risk from the
     posterior distribution of the measurand.

   ONE SIGNED GUARD BAND. ILAC-G8 holds w as a single signed quantity:
   POSITIVE moves the acceptance limit INWARDS (guarded acceptance, binding
   the consumer's risk), NEGATIVE moves it OUTWARDS (guarded rejection,
   binding the producer's risk). All five rules are then one arithmetic path:

       upper limit   A = TU − w
       lower limit   A = TL + w
       two-sided     [TL + w , TU − w]

   Simple acceptance is w = 0 and needs no special case.

   Φ is Abramowitz & Stegun 7.1.26 and nothing else — see phi() below.
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

/* Standard normal CDF.

   Abramowitz & Stegun, Handbook of Mathematical Functions (1964), eq. 7.1.26,
   the rational-times-Gaussian approximation to erf(x) with |ε| ≤ 1.5e-7:

       erf(x) = 1 − (a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵)·e^(−x²),  t = 1/(1 + px)

   Φ(z) = ½[1 + erf(z/√2)] halves that bound, so the worst error of Φ here is
   7.0e-8 over z ∈ [−4, 4]. That is four orders below the precision any real
   uncertainty budget carries, so no other approximation is used and none
   should be substituted. */
const erf = (x) => {
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const p = 0.3275911;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429;
  const t = 1 / (1 + p * z);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  return s * (1 - poly * Math.exp(-z * z));
};
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/* percent to one decimal, for the report sentence */
const pct = (p) => (100 * p).toFixed(1);

const RULES = [
  "Simple acceptance (w = 0)",
  "Guarded acceptance, w = U",
  "Guarded acceptance, w = 1.64u",
  "Guarded rejection, w = −U",
  "Custom guard band",
];

const LIMIT_TYPES = ["Upper limit", "Lower limit", "Two-sided"];

/* ---------- the routine --------------------------------------------------- */

const decision = {
  id: "decision", mod: "qc", tier: "advanced",
  name: "Decision Rule & Statement of Conformity",
  sub: "Guard bands, acceptance limits and specific risk",
  formula: "A = TU − w  (upper)   A = TL + w  (lower)   w > 0 inwards, w < 0 outwards\n" +
           "p_c = Φ((TU − y)/u) − Φ((TL − y)/u)   ·   Φ = A&S 7.1.26",
  ref: "ISO/IEC 17025:2017 §7.8.6.1 (the decision rule shall be documented and reported); " +
       "ILAC-G8:2019 §4 (guarded acceptance and guarded rejection, signed guard band w, acceptance limit A); " +
       "JCGM 106:2012 §7 (specific consumer's and producer's risk from a normal posterior centred on the measured value with standard deviation u). " +
       "The guard band is entered and reported as ONE SIGNED VALUE — positive inwards, negative outwards — which is ILAC-G8's own convention.",
  inputs: [
    N("y", "Measured result y", "", "", "In the same unit as the limit"),
    S("umode", "Uncertainty entered as", ["Expanded uncertainty U with k", "Standard uncertainty u"], "Expanded uncertainty U with k"),
    N("uval", "u or U", "", "", "Whichever you selected above — same unit as the result"),
    N("k", "Coverage factor k", "", "2", "Used only when U is entered. u = U / k"),
    S("ltype", "Limit type", LIMIT_TYPES, "Upper limit"),
    N("tu", "Upper limit TU", "", "", "Leave blank for a lower-limit-only specification"),
    N("tl", "Lower limit TL", "", "", "Leave blank for an upper-limit-only specification"),
    S("rule", "Decision rule", RULES, "Simple acceptance (w = 0)"),
    N("wc", "Custom guard band w", "", "", "Signed: positive moves the acceptance limit inwards, negative outwards. Used only with the custom rule."),
    T("unit", "Unit label", "Free text, e.g. mg/L or pH. Printed in the statement of conformity."),
  ],
  run: (v) => {
    const y = num(v.y);
    const uin = num(v.uval);
    const kin = num(v.k);
    const umode = String(v.umode || "Expanded uncertainty U with k");
    const ltype = String(v.ltype || "Upper limit");
    const rule = String(v.rule || RULES[0]);
    const unit = String(v.unit || "").trim();
    const U_ = unit ? " " + unit : "";

    if (!isFinite(y) || !isFinite(uin)) return null;
    if (uin < 0) return [{ label: "Input check", value: "Uncertainty cannot be negative", tone: "warn",
      hint: "Enter u or U as a positive quantity." }];

    /* u, and U at the stated k */
    let u, U, k;
    if (umode.startsWith("Standard")) {
      u = uin; k = isFinite(kin) && kin > 0 ? kin : 2; U = k * u;
    } else {
      k = isFinite(kin) && kin > 0 ? kin : NaN;
      if (!isFinite(k)) return [{ label: "Input check", value: "Coverage factor k is required with an expanded uncertainty", tone: "warn",
        hint: "Enter the k actually used on the certificate — usually 2 for a 95 % coverage probability." }];
      U = uin; u = U / k;
    }
    if (!(u > 0)) return [{ label: "Input check", value: "u must be greater than zero", tone: "warn",
      hint: "A decision rule cannot be applied to a result reported without an uncertainty." }];

    /* limits */
    const two = ltype === "Two-sided";
    const upper = ltype === "Upper limit" || two;
    const lower = ltype === "Lower limit" || two;
    const TU = num(v.tu), TL = num(v.tl);
    if (upper && !isFinite(TU)) return [{ label: "Input check", value: "Enter the upper limit TU", tone: "warn" }];
    if (lower && !isFinite(TL)) return [{ label: "Input check", value: "Enter the lower limit TL", tone: "warn" }];
    if (two && !(TU > TL)) return [{ label: "Input check", value: "TU must be greater than TL", tone: "warn",
      hint: "Check which way round the two limits were entered." }];

    /* the single signed guard band */
    let w, wPhrase, ruleWord;
    if (rule === "Guarded acceptance, w = U") {
      w = U; ruleWord = "guarded acceptance";
      wPhrase = `w = U = ${fmt(w)}${U_}`;
    } else if (rule === "Guarded acceptance, w = 1.64u") {
      w = 1.64 * u; ruleWord = "guarded acceptance";
      wPhrase = `w = 1.64u = ${fmt(w)}${U_}`;
    } else if (rule === "Guarded rejection, w = −U") {
      w = -U; ruleWord = "guarded rejection";
      wPhrase = `w = −U = ${fmt(w)}${U_}`;
    } else if (rule === "Custom guard band") {
      w = num(v.wc); ruleWord = "a custom guard band";
      if (!isFinite(w)) return [{ label: "Input check", value: "Enter the custom guard band w", tone: "warn",
        hint: "Signed: positive inwards (binds the consumer's risk), negative outwards (binds the producer's risk)." }];
      wPhrase = `w = ${fmt(w)}${U_}`;
    } else {
      w = 0; ruleWord = "simple acceptance";
      wPhrase = "no guard band (w = 0)";
    }

    /* acceptance limits — one arithmetic path */
    const AU = isFinite(TU) ? TU - w : NaN;
    const AL = isFinite(TL) ? TL + w : NaN;

    const out = [
      { label: "Measured result y", value: fmt(y), unit, tone: "key" },
      { label: "Standard uncertainty u", value: fmt(u), unit },
      { label: `Expanded uncertainty U (k = ${fmt(k)})`, value: fmt(U), unit,
        hint: "u = U / k. A guard band of w = U is the 95 % expanded uncertainty; w = 1.64u is the 95 % one-sided normal deviate." },
      { label: "Decision rule", value: rule },
      { label: "Guard band w (signed)", value: fmt(w), unit,
        hint: "ILAC-G8:2019 §4 sign convention — positive moves the acceptance limit INWARDS (guarded acceptance), negative moves it OUTWARDS (guarded rejection)." },
    ];

    /* EMPTY ACCEPTANCE INTERVAL — flag, never print the interval backwards. */
    if (two && 2 * w >= TU - TL) {
      out.push({ label: "Acceptance interval", value: "EMPTY — no result can be accepted", tone: "warn",
        hint: `The guard band consumes the whole specification: 2w = ${fmt(2 * w)} ≥ TU − TL = ${fmt(TU - TL)}. ` +
              `The acceptance interval would run from ${fmt(AL)} down to ${fmt(AU)}, which is not an interval. ` +
              "Either the specification is too tight for this measurement uncertainty, or the wrong decision rule was chosen. Reduce u, widen the specification, or agree a different rule with the customer." });
      out.push({ label: "Statement of conformity", value: "NOT ISSUED", tone: "warn",
        hint: `${fmt(y)}${U_} — no statement of conformity can be made against limits of ${fmt(TL)} to ${fmt(TU)}${U_} under ${ruleWord} with a guard band of ${wPhrase}: the acceptance interval is empty. ISO/IEC 17025:2017 §7.8.6.1 requires the decision rule to be reported; a rule that admits no result is not a usable rule.` });
      return out;
    }

    /* verdict — min/max form so guarded rejection (w < 0) needs no branch */
    let verdict;
    if (two) {
      const inLo = Math.min(TL, AL), inHi = Math.max(TU, AU);
      const accLo = Math.max(TL, AL), accHi = Math.min(TU, AU);
      verdict = (y >= accLo && y <= accHi) ? "PASS" : (y < inLo || y > inHi) ? "FAIL" : "INDETERMINATE";
    } else if (upper) {
      const lo = Math.min(TU, AU), hi = Math.max(TU, AU);
      verdict = y <= lo ? "PASS" : y > hi ? "FAIL" : "INDETERMINATE";
    } else {
      const lo = Math.min(TL, AL), hi = Math.max(TL, AL);
      verdict = y >= hi ? "PASS" : y < lo ? "FAIL" : "INDETERMINATE";
    }

    /* specific risk — JCGM 106:2012 §7. Normal posterior centred on y, sd u. */
    const pHiConf = isFinite(TU) ? phi((TU - y) / u) : 1;   /* P(Y ≤ TU) */
    const pLoConf = isFinite(TL) ? phi((TL - y) / u) : 0;   /* P(Y < TL) */
    let pc;
    if (two) pc = pHiConf - pLoConf;
    else if (upper) pc = pHiConf;
    else pc = 1 - pLoConf;
    pc = Math.min(1, Math.max(0, pc));
    const pn = 1 - pc;

    const accepted = verdict === "PASS";
    const riskName = accepted ? "false acceptance" : "false rejection";
    const risk = accepted ? pn : pc;

    /* acceptance limit rows */
    if (two) {
      out.push({ label: "Specification interval", value: `${fmt(TL)} to ${fmt(TU)}`, unit });
      out.push({ label: "Acceptance interval", value: `${fmt(AL)} to ${fmt(AU)}`, unit, tone: "key",
        hint: "TL + w to TU − w." });
    } else if (upper) {
      out.push({ label: "Upper limit TU", value: fmt(TU), unit });
      out.push({ label: "Acceptance limit A = TU − w", value: fmt(AU), unit, tone: "key" });
    } else {
      out.push({ label: "Lower limit TL", value: fmt(TL), unit });
      out.push({ label: "Acceptance limit A = TL + w", value: fmt(AL), unit, tone: "key" });
    }

    out.push({ label: "Verdict", value: verdict, tone: verdict === "PASS" ? "ok" : "warn",
      hint: verdict === "PASS" ? "The result lies inside the acceptance limit — conformity is demonstrated under this rule."
        : verdict === "FAIL" ? "The result lies outside the specification limit on the rejection side of the guard band — non-conformity is demonstrated under this rule."
        : "The result lies INSIDE the guard band. Neither conformity nor non-conformity is demonstrated at this level of risk." });

    out.push({ label: "Probability of conformity p_c", value: pct(pc), unit: "%",
      hint: "Area of the posterior distribution inside the specification. JCGM 106:2012 §7." });
    out.push({ label: "Probability of non-conformity", value: pct(pn), unit: "%" });
    out.push({ label: `Specific risk of ${riskName}`, value: pct(risk), unit: "%", tone: "key",
      hint: accepted
        ? "Specific consumer's risk — the probability that this accepted item is in fact non-conforming."
        : "Specific producer's risk — the probability that this item, not accepted, is in fact conforming." });

    /* statement of conformity, written to be pasted into a report */
    const limitPhrase = two
      ? `limits of ${fmt(TL)} to ${fmt(TU)}${U_}`
      : upper ? `an upper limit of ${fmt(TU)}${U_}`
              : `a lower limit of ${fmt(TL)}${U_}`;
    const accPhrase = two
      ? `acceptance interval ${fmt(AL)} to ${fmt(AU)}${U_}`
      : upper ? `acceptance limit ${fmt(AU)}${U_}`
              : `acceptance limit ${fmt(AL)}${U_}`;
    const closing = verdict === "PASS"
      ? "Conformity is demonstrated at this level of risk."
      : verdict === "FAIL"
        ? "Non-conformity is demonstrated at this level of risk."
        : "Conformity is not demonstrated at this level of risk.";
    const sentence =
      `${fmt(y)}${U_} — ${verdict} against ${limitPhrase}, decision rule: ${ruleWord} with a guard band of ` +
      `${wPhrase}, ${accPhrase}. Specific risk of ${riskName} ${pct(risk)} %. ${closing}`;

    out.push({ label: "Statement of conformity", value: sentence, tone: "key",
      hint: "ISO/IEC 17025:2017 §7.8.6.1 — the decision rule and the limits it was applied to must appear with the statement. Copy this line into the report." });

    out.push({ label: "Assumption", value: "Normal posterior, no prior",
      hint: "JCGM 106:2012 §7. The risk is computed from a normal distribution centred on the measured value with standard deviation u — no production prior is applied, so these are SPECIFIC risks for this item, not global risks for the process." });

    return out;
  },
};

export const ROUTINES = [decision];
export default ROUTINES;
