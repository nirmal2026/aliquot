/* =============================================================================
   Aliquot — scripts/verify-uncert.mjs
   Verification suite for the uncertainty and detection-limit pack.

   Every assertion is either against a published table value, against a hand
   calculation shown in the comment, or against an internal consistency the two
   independent code paths must both satisfy.

   Run: node scripts/verify-uncert.mjs
   ============================================================================= */

import {
  tCdf,
  tInv,
  tCrit,
  tCritOneSided,
  mean,
  sd,
  linreg,
  uInversePrediction,
  welchSatterthwaite,
  kragten,
  waterDensity,
  waterGamma,
  zFactor,
  sigFig,
  formatWithU,
} from "../src/lib/stats.js";
import { combineBudget, componentStdU, componentNu, parseComponents, sensitivityFromExponent } from "../src/lib/uncert.js";
import routines from "../src/modules/qc-uncert.js";

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
  }
}
function close(name, got, want, tol, note = "") {
  const good = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(name, good, good ? "" : `got ${got}, want ${want} ±${tol}${note ? " (" + note + ")" : ""}`);
}
function rowsOf(r) {
  return Array.isArray(r) ? r : [];
}
function find(rows, frag) {
  return rows.find((x) => String(x.label).toLowerCase().includes(frag.toLowerCase()));
}

/* =============================================================================
   A. Student's t against published critical values
   ============================================================================= */

/* Two-sided 95 % critical values, standard t table */
close("t two-sided 95 %, nu=1", tCrit(0.95, 1), 12.706, 0.002);
close("t two-sided 95 %, nu=2", tCrit(0.95, 2), 4.3027, 0.002);
close("t two-sided 95 %, nu=6", tCrit(0.95, 6), 2.4469, 0.002);
close("t two-sided 95 %, nu=10", tCrit(0.95, 10), 2.2281, 0.002);
close("t two-sided 95 %, nu=30", tCrit(0.95, 30), 2.0423, 0.002);
close("t two-sided 95 %, nu=120", tCrit(0.95, 120), 1.9799, 0.002);
close("t two-sided 95 %, nu=inf", tCrit(0.95, Infinity), 1.9600, 0.002);
close("t two-sided 99 %, nu=6", tCrit(0.99, 6), 3.7074, 0.003);

/* One-sided 99 %, the 40 CFR 136 App. B MDL multiplier.
   n = 7 -> nu = 6 -> t = 3.143, the value the regulation itself prints. */
close("t one-sided 99 %, nu=6 (MDL, n=7)", tCritOneSided(0.99, 6), 3.143, 0.002);
close("t one-sided 99 %, nu=9 (MDL, n=10)", tCritOneSided(0.99, 9), 2.821, 0.002);

/* CDF round trip */
close("tCdf(tInv) round trip", tCdf(tInv(0.975, 8), 8), 0.975, 1e-9);
ok("tCdf symmetric", Math.abs(tCdf(-1.3, 5) - (1 - tCdf(1.3, 5))) < 1e-12);
ok("tInv rejects p<=0", !Number.isFinite(tInv(0, 5)));

/* =============================================================================
   B. Descriptive and regression
   ============================================================================= */

/* Hand check: [2,4,4,4,5,5,7,9], mean 5, sample sd = sqrt(32/7) = 2.13809 */
close("mean", mean([2, 4, 4, 4, 5, 5, 7, 9]), 5, 1e-12);
close("sample sd (n-1)", sd([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7), 1e-12);
ok("sd of one value is NaN", !Number.isFinite(sd([3])));

/* Perfect line y = 3 + 2x */
{
  const x = [1, 2, 3, 4, 5];
  const y = x.map((v) => 3 + 2 * v);
  const r = linreg(x, y);
  close("linreg slope", r.b, 2, 1e-12);
  close("linreg intercept", r.a, 3, 1e-12);
  close("linreg s(y/x) on a perfect line", r.syx, 0, 1e-9);
  close("linreg r2", r.r2, 1, 1e-12);
  close("linreg Sxx", r.Sxx, 10, 1e-12); /* sum (x-3)^2 = 4+1+0+1+4 */
  ok("linreg refuses n<3", linreg([1, 2], [1, 2]) === null);
  ok("linreg refuses zero Sxx", linreg([2, 2, 2], [1, 2, 3]) === null);
}

/* Inverse prediction sanity: u(x0) grows as x0 moves from the centroid */
{
  const x = [0, 1, 2, 3, 4, 5];
  const y = [0.02, 1.01, 1.98, 3.03, 3.99, 5.02];
  const r = linreg(x, y);
  const uCentre = uInversePrediction(r, r.xbar, 1);
  const uEdge = uInversePrediction(r, 5, 1);
  ok("u(x0) minimum at the centroid", uEdge > uCentre);
  const uMore = uInversePrediction(r, r.xbar, 3);
  ok("u(x0) falls with more sample replicates", uMore < uCentre);
}

/* =============================================================================
   C. Welch-Satterthwaite
   ============================================================================= */

/* All Type B -> infinite nu_eff. Asserted with an identity test, not a
   tolerance: Math.abs(Infinity - Infinity) is NaN and would fail silently. */
ok(
  "WS all Type B gives infinite nu",
  welchSatterthwaite([{ c: 1, nu: Infinity }, { c: 2, nu: Infinity }], Math.sqrt(5)) === Infinity
);

/* One dominant Type A component: nu_eff must approach that component's nu.
   c = 1 with nu = 4, plus a negligible Type B: uc ~ 1, nu_eff ~ 4. */
{
  const uc = Math.sqrt(1 + 0.0001);
  const nuEff = welchSatterthwaite([{ c: 1, nu: 4 }, { c: 0.01, nu: Infinity }], uc);
  close("WS dominated by one Type A", nuEff, 4, 0.01);
}

/* Two equal Type A components with nu = 4 each: uc^2 = 2,
   nu_eff = 4/(2*(1/4)) = 8. Hand calculation: uc^4 = 4, sum c^4/nu = 2*(1/4) = 0.5,
   4/0.5 = 8. */
close(
  "WS two equal Type A components",
  welchSatterthwaite([{ c: 1, nu: 4 }, { c: 1, nu: 4 }], Math.SQRT2),
  8,
  1e-9
);

/* =============================================================================
   D. Kragten against the closed form
   ============================================================================= */

/*
  For a pure product-and-quotient model the relative combination is exact:
      y = a*b/c   ->   u(y)/y = sqrt( (ua/a)^2 + (ub/b)^2 + (uc/c)^2 )
  Kragten is a first-order numerical approximation of the same thing, so the two
  must agree to well within a per cent at realistic relative uncertainties.
*/
{
  const model = (x) => (x.a * x.b) / x.c;
  const x = { a: 100.28, b: 0.9999, c: 100.0 };
  const u = { a: 0.05, b: 0.00005, c: 0.07 };
  const kr = kragten(model, x, u);
  const rel = Math.sqrt(
    Math.pow(u.a / x.a, 2) + Math.pow(u.b / x.b, 2) + Math.pow(u.c / x.c, 2)
  );
  const closed = rel * model(x);
  const diff = Math.abs(kr.uc - closed) / closed;
  ok("Kragten agrees with the closed form", diff < 5e-3, `relative difference ${(diff * 100).toFixed(4)} %`);
  close("Kragten returns the unperturbed result", kr.y, model(x), 1e-12);
  ok("Kragten zero-uncertainty input contributes nothing", kragten(model, x, { ...u, b: 0 }).contrib.b === 0);
}

/* A non-multiplicative model, where the closed form above does NOT apply and
   the numerical engine is the reason this design was chosen:
      y = (A - A_blank) / b        A blank correction, a difference, then a ratio. */
{
  const model = (x) => (x.A - x.Ab) / x.b;
  const x = { A: 0.452, Ab: 0.013, b: 0.0219 };
  const u = { A: 0.002, Ab: 0.002, b: 0.0004 };
  const kr = kragten(model, x, u);
  /* Hand check.
     y = (0.452 - 0.013)/0.0219 = 20.04566
     A  : (0.454-0.013)/0.0219 = 20.13699   d = +0.09132
     Ab : (0.452-0.015)/0.0219 = 19.95434   d = -0.09132
     b  : 0.439/0.0223         = 19.68610   d = -0.35956
     uc = sqrt(2*0.09132^2 + 0.35956^2) = 0.38206

     Note the slope term. The first-order value y*u(b)/b is 0.36613, but
     Kragten is a finite difference and 1/b is convex, so it returns 0.35956 —
     a 1.8 % difference on the dominant component. That is the approximation
     being made, and it is why the multiplicative closed form is shown beside
     the Kragten result on screen rather than instead of it. */
  close("Kragten on a blank-corrected ratio", kr.uc, 0.38206, 0.0002);
  ok("Kragten difference terms are equal and opposite in sign", kr.contrib.A > 0 && kr.contrib.Ab < 0);
}

/* =============================================================================
   E. Water density, gamma and the Z factor
   ============================================================================= */

/* Tanaka: maximum density near 3.98 degC, and 998.20 kg/m3 at 20 degC. */
close("water density at 20 degC", waterDensity(20), 998.2, 0.02);
close("water density at 4 degC", waterDensity(4), 999.97, 0.02);
close("water density at 25 degC", waterDensity(25), 997.05, 0.03);
ok("water density refuses out of range", !Number.isFinite(waterDensity(60)));

/* gamma is strongly temperature dependent — this is the reason a constant is
   not used. Published values: about 2.07e-4 /K at 20 degC, 2.57e-4 /K at 25. */
close("gamma at 20 degC", waterGamma(20), 2.07e-4, 6e-6);
close("gamma at 25 degC", waterGamma(25), 2.57e-4, 6e-6);
ok("gamma rises with temperature", waterGamma(30) > waterGamma(20));

/* ISO 8655-6 Z factor at 20 degC, 1013 hPa is close to 1.0028 mL/g. */
close("Z factor at 20 degC, 1013 hPa", zFactor(20, 1013, 50), 1.0029, 0.0006);
ok("Z factor rises with temperature", zFactor(30, 1013, 50) > zFactor(20, 1013, 50));
ok("Z factor rejects impossible pressure", !Number.isFinite(zFactor(20, 0, 50)));

/* =============================================================================
   F. Rounding and reporting
   ============================================================================= */
close("sigFig 3", sigFig(1234.5, 3), 1230, 1e-9);
close("sigFig 2 on a small number", sigFig(0.0012345, 2), 0.0012, 1e-12);
{
  const f = formatWithU(97.4321, 4.2134);
  ok("formatWithU gives U to 2 sig figs", f.U === 4.2, `got ${f && f.U}`);
  ok("formatWithU rounds y to the same place", f.y === 97.4, `got ${f && f.y}`);
}

/* =============================================================================
   G. Component evaluation
   ============================================================================= */
close("rectangular divisor", componentStdU({ dist: "rect", value: 1.2 }), 1.2 / Math.sqrt(3), 1e-12);
close("triangular divisor", componentStdU({ dist: "tri", value: 1.2 }), 1.2 / Math.sqrt(6), 1e-12);
close("resolution divisor", componentStdU({ dist: "res", value: 0.1 }), 0.1 / Math.sqrt(12), 1e-12);
close("expanded with stated k", componentStdU({ dist: "k", value: 0.6, k: 2 }), 0.3, 1e-12);
close("Type A s/sqrt(n)", componentStdU({ dist: "sdn", value: 2.4, n: 9 }), 0.8, 1e-12);
ok("unknown distribution returns NaN", !Number.isFinite(componentStdU({ dist: "nope", value: 1 })));
close("Type A nu is n-1", componentNu({ type: "A", n: 7 }), 6, 1e-12);
ok("Type B nu is infinite", componentNu({ type: "B" }) === Infinity);
/* GUM G.4.2: a Type B judged reliable to 25 % has nu = 0.5*(0.25)^-2 = 8 */
close("Type B with stated reliability", componentNu({ type: "B", rel: 25 }), 8, 1e-12);

/* =============================================================================
   H. combineBudget
   ============================================================================= */

/* Three relative Type B components of 1 % each on a result of 100:
   each contributes 1.0, uc = sqrt(3) = 1.7321, nu_eff infinite, k = 2,
   U = 3.4641. Hand calculation. */
{
  const comps = [
    { label: "a", type: "B", basis: "rel", dist: "std", value: 1, source: "x" },
    { label: "b", type: "B", basis: "rel", dist: "std", value: 1, source: "x" },
    { label: "c", type: "B", basis: "rel", dist: "std", value: 1, source: "x" },
  ];
  const b = combineBudget(comps, 100);
  close("uc of three 1 % components on y=100", b.uc, Math.sqrt(3), 1e-9);
  close("uc relative", b.ucRel, Math.sqrt(3), 1e-9);
  ok("nu_eff infinite when all Type B", !Number.isFinite(b.nuEff));
  close("k = 2 for an all-Type-B budget", b.k, 2, 1e-12);
  close("U", b.U, 2 * Math.sqrt(3), 1e-9);
  close("each component holds a third of the variance", b.rows[0].pct, 100 / 3, 1e-9);
}

/* The case the routine exists to expose: a Type A component with n = 3
   dominating. nu_eff must be near 2 and k near 4.30, not 2. */
{
  const comps = [
    { label: "repeatability", type: "A", basis: "rel", dist: "sdn", value: 5.196, n: 3, source: "own" },
    { label: "small B", type: "B", basis: "rel", dist: "std", value: 0.1, source: "cert" },
  ];
  const b = combineBudget(comps, 100);
  ok("nu_eff is finite and small", b.nuEff > 1.9 && b.nuEff < 2.1, `nu_eff = ${b.nuEff}`);
  ok("k is near the t value 4.303, not 2", b.k > 4.2 && b.k < 4.4, `k = ${b.k}`);
  ok(
    "U is more than double the k=2 value",
    b.U > 2 * 2 * b.uc * 0.99,
    `U = ${b.U}, 2*uc = ${2 * b.uc}`
  );
}

/* Absolute components with a sensitivity coefficient */
{
  const comps = [
    { label: "abs", type: "B", basis: "abs", dist: "std", value: 0.5, sens: 2, source: "x" },
    { label: "rel", type: "B", basis: "rel", dist: "std", value: 1, source: "x" },
  ];
  const b = combineBudget(comps, 100);
  /* contributions: 2*0.5 = 1.0 and 100*1/100 = 1.0 -> uc = sqrt(2) */
  close("absolute component uses its sensitivity coefficient", b.uc, Math.SQRT2, 1e-9);
}

/* Sensitivity coefficient from an exponent.
   y = 34.7 mg/kg, sample mass 0.5000 g entering the model as m^-1:
   c_i = -1 * 34.7 / 0.5 = -69.4 mg/kg per g. A balance readability of 0.1 mg
   counted twice gives a half-width of 0.0002 g, u = 0.0002/sqrt(12) =
   5.7735e-5 g, so the contribution is 69.4 * 5.7735e-5 = 4.007e-3 mg/kg. */
{
  const comps = [
    {
      label: "sample mass",
      type: "B",
      basis: "abs",
      dist: "res",
      value: 0.0002,
      expo: -1,
      xval: 0.5,
      source: "balance",
    },
  ];
  const b = combineBudget(comps, 34.7);
  close("c_i computed from the exponent", Math.abs(b.rows[0].sens), 69.4, 1e-9);
  close("contribution from a computed c_i", b.uc, 69.4 * (0.0002 / Math.sqrt(12)), 1e-9);
  ok("the record says c_i was computed", /computed as/.test(b.rows[0].sensFrom));
}

/* A hand-entered c_i out by a factor of 1000 must be flagged, not accepted. */
{
  const comps = [
    { label: "sample mass", type: "B", basis: "abs", dist: "res", value: 0.0002, sens: 69400, source: "balance" },
    { label: "repeatability", type: "A", basis: "rel", dist: "sdn", value: 4.1, n: 3, source: "own" },
  ];
  const b = combineBudget(comps, 34.7);
  ok("a single component over 90 % of the variance is flagged", b.overDominant === true, `${b.rows[0].pct} %`);
  const rows = rowsOf(routines[0].run({ y: 34.7, yunit: "mg/kg", comp: "", conf: "95 %" }));
  const viaText = rowsOf(
    routines[0].run({
      y: 34.7,
      yunit: "mg/kg",
      conf: "95 %",
      comp:
        "sample mass | B | abs | res | 0.0002 | | 69400 | balance\n" +
        "repeatability | A | rel | sdn | 4.1 | 3 | | own",
    })
  );
  ok(
    "the routine prints the over-dominance warning",
    viaText.some((x) => /almost the whole variance/.test(x.label))
  );
}

/* The text parser accepts the exponent@value form. */
{
  const c = parseComponents("mass | B | abs | res | 0.0002 | | -1@0.5000 | balance");
  ok("parser reads the exponent form", c[0].expo === -1 && c[0].xval === 0.5, JSON.stringify(c[0]));
  const c2 = parseComponents("mass | B | abs | res | 0.0002 | | 69.4 | balance");
  ok("parser still accepts a plain c_i", c2[0].sens === 69.4 && c2[0].expo === undefined);
}

/* Refusals */
ok("empty budget returns null", combineBudget([], 100) === null);
ok("non-finite y returns null", combineBudget([{ label: "a", type: "B", basis: "rel", dist: "std", value: 1 }], NaN) === null);
ok(
  "a Type A component with no n is an error, not a number",
  !!combineBudget([{ label: "a", type: "A", basis: "rel", dist: "sdn", value: 1 }], 100).error
);
ok(
  "an all-zero budget is an error, not zero uncertainty",
  !!combineBudget([{ label: "a", type: "B", basis: "rel", dist: "std", value: 0 }], 100).error
);

/* Text fallback parser */
{
  const c = parseComponents(
    "# comment\nPipette systematic | B | rel | rect | 0.8 | | | ISO 8655-2\nRepeatability | A | rel | sdn | 1.5 | 6 | | own data\n"
  );
  ok("parser reads two components", c.length === 2, `got ${c.length}`);
  ok("parser sets type", c[0].type === "B" && c[1].type === "A");
  ok("parser sets n on the Type A row", c[1].n === 6);
  ok("parser keeps the source", c[0].source === "ISO 8655-2");
}

/* =============================================================================
   I. The routines themselves
   ============================================================================= */

const [ubudget, unordtest, detlim] = routines;

/* every routine carries the required fields */
for (const r of routines) {
  ok(`${r.id}: has an id`, typeof r.id === "string" && r.id.length > 0);
  ok(`${r.id}: has a module`, r.mod === "qc");
  ok(`${r.id}: has a tier`, r.tier === "routine" || r.tier === "advanced");
  ok(`${r.id}: has a formula string`, typeof r.formula === "string" && r.formula.length > 10);
  ok(`${r.id}: has a citation`, typeof r.ref === "string" && r.ref.length > 30);
  ok(`${r.id}: has inputs`, Array.isArray(r.inputs) && r.inputs.length > 0);
  ok(`${r.id}: every input has a key and a label`, r.inputs.every((i) => i.k && i.label));
  ok(`${r.id}: run is a function`, typeof r.run === "function");
  /* the house rule: an empty form never returns a silent number */
  const empty = r.run({});
  ok(
    `${r.id}: empty form returns null or a warning`,
    empty === null || (Array.isArray(empty) && empty.some((x) => x.tone === "warn")),
    `got ${JSON.stringify(empty)?.slice(0, 120)}`
  );
}

/* Eurachem must be cited for uncertainty and must NOT be cited for LOD/LOQ. */
ok("ubudget cites Eurachem CG 4", /Eurachem\/CITAC Guide CG 4/.test(ubudget.ref));
ok("ubudget cites the GUM", /JCGM 100:2008/.test(ubudget.ref));
ok("detlim does not rest on Eurachem", /40 CFR Part 136/.test(detlim.ref) && /ISO 11843/.test(detlim.ref));
ok("detlim says why Eurachem is absent", /no detection-limit clause/.test(detlim.ref));

/* --- detlim: 40 CFR 136 App. B MDL, hand checked ------------------------- */
{
  /* Seven replicates. s computed below and asserted, so the MDL is a hand check:
     MDL_s = t(6, 0.99) * s = 3.143 * s */
  const data = "1.10 1.25 1.05 1.30 1.15 1.20 1.12";
  const d = data.split(/\s+/).map(Number);
  const s = sd(d);
  const expect = 3.143 * s;
  const r = rowsOf(
    detlim.run({
      mode: "Spiked replicates, 40 CFR 136 App. B MDL",
      data,
      spike: 5,
      unit: "µg/L",
      kd: 3,
      kq: 10,
    })
  );
  const mdl = find(r, "MDL_s");
  close("MDL_s = t(6,0.99) x s", mdl.value, sigFig(expect, 3), Math.abs(expect) * 0.005);

  /* spike 5 against an MDL near 0.29 is about 17x -> must refuse */
  const flag = r.find((x) => String(x.label).includes("Spike level too high"));
  ok("spike above 10x the MDL is refused", !!flag);

  /* fewer than seven replicates is not the cited procedure */
  const few = rowsOf(detlim.run({ mode: "Spiked replicates, 40 CFR 136 App. B MDL", data: "1 2 3", unit: "µg/L" }));
  ok("fewer than seven replicates is refused", few.some((x) => /Too few replicates/.test(x.label)));

  /* identical replicates must not give an MDL of zero */
  const zero = rowsOf(
    detlim.run({ mode: "Spiked replicates, 40 CFR 136 App. B MDL", data: "2 2 2 2 2 2 2", unit: "µg/L" })
  );
  ok("zero standard deviation is refused", zero.some((x) => /Standard deviation is zero/.test(x.label)));
}

/* --- detlim: instrument limit -> method limit, hand checked -------------- */
{
  /*  Blanks with s = 0.412 µg/L  ->  LOD = 3 x 0.412 = 1.236 µg/L
      = 0.001236 mg/L. Sample 0.500 g into 50 mL:
      method LOD (mg/kg) = 0.001236 x 50 / 0.500 = 0.1236 mg/kg
      dry basis at 8.2 % moisture: 0.1236 / 0.918 = 0.13464 mg/kg          */
  const vals = [0, 0.412, -0.412, 0.582966, -0.582966];
  /* construct a set with an exact sd of 0.412: use +/-0.412 twice and 0 once
     -> sd = sqrt((0.412^2*2 + 0.582966^2*2)/4) ... simpler: assert on what the
     code computes and hand-check the chain from that s. */
  const data = "10.0 10.5 9.6 10.2 9.9";
  const d = data.split(/\s+/).map(Number);
  const s = sd(d);
  const r = rowsOf(
    detlim.run({
      mode: "Replicate blanks (3s / 10s)",
      data,
      unit: "µg/L",
      kd: 3,
      kq: 10,
      samptype: "Solid, mass in g",
      samp: 0.5,
      vfin: 50,
      df: 1,
      moist: 8.2,
    })
  );
  const lodRow = find(r, "Instrument LOD");
  close("blank-route instrument LOD = 3s", lodRow.value, sigFig(3 * s, 3), Math.abs(3 * s) * 0.005);

  const methRow = find(r, "Method LOD, as received");
  const expectMethod = ((3 * s) / 1000) * (50 / 0.5); /* mg/L x mL/g = mg/kg */
  close("method LOD in mg/kg", methRow.value, sigFig(expectMethod, 3), Math.abs(expectMethod) * 0.005);
  ok("method LOD unit is mg/kg", methRow.unit === "mg/kg");

  const dryRow = find(r, "Method LOD, dry basis");
  close("dry-basis method LOD", dryRow.value, sigFig(expectMethod / 0.918, 3), Math.abs(expectMethod) * 0.006);

  const pf = find(r, "Preparation factor");
  close("preparation factor", pf.value, 100, 1e-9);
}

/* moisture at or above 100 % must be refused, not divided by */
{
  const r = rowsOf(
    detlim.run({
      mode: "Replicate blanks (3s / 10s)",
      data: "10.0 10.5 9.6 10.2 9.9",
      unit: "µg/L",
      samptype: "Solid, mass in g",
      samp: 0.5,
      vfin: 50,
      moist: 100,
    })
  );
  ok("moisture of 100 % is refused", r.some((x) => /Moisture out of range/.test(x.label)));
}

/* --- detlim: calibration route, hand checked ----------------------------- */
{
  const cal = "0,0.002\n1,0.0221\n2,0.0439\n3,0.0662\n4,0.0878\n5,0.1101";
  const { x, y } = (() => {
    const xs = [];
    const ys = [];
    for (const line of cal.split("\n")) {
      const [a, b] = line.split(",").map(Number);
      xs.push(a);
      ys.push(b);
    }
    return { x: xs, y: ys };
  })();
  const reg = linreg(x, y);
  const expectLod = (3.3 * reg.syx) / reg.b;
  const r = rowsOf(detlim.run({ mode: "Calibration residuals, ICH Q2(R2)", cal, unit: "mg/L", kd: 3, kq: 10 }));
  const lodRow = r.find((z) => /Instrument LOD/.test(z.label));
  close("ICH LOD = 3.3 s(y/x)/b", lodRow.value, sigFig(expectLod, 3), Math.abs(expectLod) * 0.01);
  const slope = find(r, "Slope");
  close("reported slope matches the regression", slope.value, sigFig(reg.b, 5), Math.abs(reg.b) * 1e-4);
}

/* --- detlim: ISO 11843-2 ------------------------------------------------- */
{
  const cal = "0,0.002\n1,0.0221\n2,0.0439\n3,0.0662\n4,0.0878\n5,0.1101";
  const r = rowsOf(detlim.run({ mode: "Calibration function, ISO 11843-2", cal, unit: "mg/L", m: 1, kq: 10 }));
  const xc = find(r, "Critical value");
  const xd = find(r, "Minimum detectable value");
  ok("x_d is twice x_c", Math.abs(xd.value - 2 * xc.value) < Math.abs(xc.value) * 0.02, `x_c=${xc.value} x_d=${xd.value}`);
  ok("x_c is positive", xc.value > 0);
}

/* --- unordtest, hand checked -------------------------------------------- */
{
  /* u(Rw) = 3 %, RMS bias = 2 %, u(Cref) = 1 %
     u(bias) = sqrt(4+1) = 2.2360
     uc = sqrt(9 + 5) = 3.7417 ;  U = 7.4833 */
  const r = rowsOf(
    unordtest.run({
      rwsrc: "Control chart on a stable control sample",
      srw: 3,
      nrw: 40,
      rmsb: 2,
      ucref: 1,
      nb: 6,
      corr: "No",
    })
  );
  close("u(bias)", find(r, "u(bias)").value, sigFig(Math.sqrt(5), 3), 0.01);
  close("uc", find(r, "Combined standard").value, sigFig(Math.sqrt(14), 3), 0.01);
  close("U at k=2", find(r, "Expanded uncertainty").value, sigFig(2 * Math.sqrt(14), 3), 0.02);
  ok("uncorrected bias is flagged", r.some((x) => /Bias is not corrected/.test(x.label)));

  /* short control chart must be flagged */
  const short = rowsOf(
    unordtest.run({ rwsrc: "Control chart on a stable control sample", srw: 3, nrw: 12, rmsb: 2, ucref: 1, nb: 6, corr: "Yes" })
  );
  ok("short control chart is flagged", short.some((x) => /Control chart n is small/.test(x.label)));

  /* duplicate route: two identical pairs give s_r = 0 -> combined equals bias only */
  const dup = rowsOf(
    unordtest.run({ rwsrc: "Duplicate analyses of routine samples", dups: "10 10\n20 20\n30 30", rmsb: 2, ucref: 1, nb: 6, corr: "Yes" })
  );
  close("identical duplicates give u(Rw) = 0", find(dup, "u(R_w)").value, 0, 1e-9);
}

/* --- ubudget end to end -------------------------------------------------- */
{
  const comp =
    "Repeatability | A | rel | sdn | 2.4 | 9 | | own data, 9 replicates\n" +
    "CRM certified value | B | rel | k | 1.2 | 2 | | CRM certificate\n" +
    "Flask, 100 mL | B | abs | tri | 0.10 | | 0.5 | flask specification\n";
  const r = rowsOf(ubudget.run({ y: 50, yunit: "mg/kg", comp, conf: "95 %" }));
  ok("ubudget returns rows", r.length > 5);
  const uc = find(r, "Combined standard uncertainty");
  ok("uc is finite and positive", uc && uc.value > 0);
  const kRow = find(r, "Coverage factor");
  ok("k is between 2 and 3 with a Type A n=9 present", kRow.value > 2 && kRow.value < 3, `k = ${kRow.value}`);
  const rep = find(r, "Report as");
  ok("a report sentence is produced", rep && /±/.test(String(rep.value)));
  const dom = find(r, "Largest contribution");
  ok("the dominant component is named", dom && typeof dom.value === "string");

  /* a component with no source must be flagged, not silently accepted */
  const noSrc = rowsOf(ubudget.run({ y: 50, yunit: "mg/kg", comp: "Something | B | rel | std | 1 | | |", conf: "95 %" }));
  ok("a component with no stated source is flagged", noSrc.some((x) => /SOURCE NOT STATED/.test(String(x.hint || ""))));

  /* a fixed k must be disclosed */
  const fixed = rowsOf(ubudget.run({ y: 50, yunit: "mg/kg", comp, conf: "95 %", fixk: 2 }));
  ok("a user-fixed k is disclosed", fixed.some((x) => /k was fixed by the user/.test(x.label)));
}

/* =============================================================================
   Report
   ============================================================================= */
console.log("");
console.log(`  Aliquot uncertainty pack — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("");
  for (const f of failures) console.log(`    FAIL  ${f}`);
  console.log("");
  process.exit(1);
}
console.log("");
