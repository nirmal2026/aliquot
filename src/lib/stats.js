/* =============================================================================
   Aliquot — src/lib/stats.js
   Statistical primitives for the uncertainty and validation routines.

   Pure logic. No DOM, no network. Exercised by scripts/verify-uncert.mjs.

   Contents
     lnGamma, betacf, ibeta      incomplete beta, for the t distribution
     tCdf, tInv                  Student's t, CDF and quantile
     tCrit                       two-sided critical value at a confidence level
     mean, sd, rsd, median       descriptive statistics
     linreg                      least-squares line with s(y/x), Sxx, r2
     welchSatterthwaite          effective degrees of freedom
     kragten                     numerical propagation, Eurachem/CITAC CG 4 App. E.2
   ============================================================================= */

/* ---------- gamma and beta ------------------------------------------------ */

const LNG_C = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
];

export function lnGamma(x) {
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += LNG_C[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/* Continued fraction for the incomplete beta function (Lentz's method). */
function betacf(a, b, x) {
  const FPMIN = 1e-300;
  const EPS = 3e-16;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/* Regularised incomplete beta I_x(a,b). */
export function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/* ---------- Student's t --------------------------------------------------- */

/* P(T <= t) for nu degrees of freedom. nu may be Infinity (normal limit). */
export function tCdf(t, nu) {
  if (!isFinite(t)) return t > 0 ? 1 : 0;
  if (!isFinite(nu)) {
    /* Normal CDF, Abramowitz & Stegun 26.2.17 via erf-style rational form.
       Same accuracy class as the Phi already used by the decision routine. */
    const z = t / Math.SQRT2;
    const sign = z < 0 ? -1 : 1;
    const a = Math.abs(z);
    const p = 0.3275911;
    const tt = 1 / (1 + p * a);
    const y =
      1 -
      ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt +
        0.254829592) *
        tt *
        Math.exp(-a * a);
    return 0.5 * (1 + sign * y);
  }
  const x = nu / (nu + t * t);
  const p = 0.5 * ibeta(nu / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/* Quantile: returns t such that P(T <= t) = p. Bisection on tCdf. */
export function tInv(p, nu) {
  if (!(p > 0 && p < 1)) return NaN;
  if (!(nu > 0)) return NaN;
  if (p === 0.5) return 0;
  let lo = -1e4;
  let hi = 1e4;
  for (let i = 0; i < 300; i++) {
    const mid = 0.5 * (lo + hi);
    if (tCdf(mid, nu) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return 0.5 * (lo + hi);
}

/* Two-sided critical value. conf as a fraction, e.g. 0.95. */
export function tCrit(conf, nu) {
  return tInv(1 - (1 - conf) / 2, nu);
}

/* One-sided critical value, e.g. the 40 CFR 136 App. B MDL multiplier. */
export function tCritOneSided(conf, nu) {
  return tInv(conf, nu);
}

/* ---------- descriptive --------------------------------------------------- */

export function mean(a) {
  if (!a || !a.length) return NaN;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

/* Sample standard deviation, n-1 in the denominator. */
export function sd(a) {
  if (!a || a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
}

export function rsd(a) {
  const m = mean(a);
  if (!isFinite(m) || m === 0) return NaN;
  return (sd(a) / Math.abs(m)) * 100;
}

export function median(a) {
  if (!a || !a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/* ---------- least squares ------------------------------------------------- */

/*
  Unweighted least-squares line y = a + b x.
  Returns the quantities the inverse-prediction uncertainty needs:
    b      slope
    a      intercept
    syx    residual standard deviation, sqrt(SSE/(n-2))
    Sxx    sum of (x - xbar)^2
    xbar   mean of x
    n      number of calibration points
    r2     coefficient of determination
*/
export function linreg(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const xbar = mean(x.slice(0, n));
  const ybar = mean(y.slice(0, n));
  let Sxx = 0;
  let Sxy = 0;
  let Syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - xbar;
    const dy = y[i] - ybar;
    Sxx += dx * dx;
    Sxy += dx * dy;
    Syy += dy * dy;
  }
  if (Sxx === 0) return null;
  const b = Sxy / Sxx;
  const a = ybar - b * xbar;
  const sse = Math.max(0, Syy - b * Sxy);
  const syx = Math.sqrt(sse / (n - 2));
  const r2 = Syy === 0 ? NaN : 1 - sse / Syy;
  return { a, b, syx, Sxx, xbar, ybar, n, r2, sse };
}

/*
  Standard uncertainty of x0 obtained by inverse prediction from a calibration
  line — Eurachem/CITAC CG 4 (3rd ed., 2012) Appendix E.3.

    u(x0) = (syx / b) * sqrt( 1/m + 1/n + (x0 - xbar)^2 / Sxx )

  m = number of replicate readings of the test sample
  n = number of calibration points
*/
export function uInversePrediction(reg, x0, m) {
  if (!reg || !(m > 0) || !(reg.b !== 0)) return NaN;
  const t = 1 / m + 1 / reg.n + ((x0 - reg.xbar) * (x0 - reg.xbar)) / reg.Sxx;
  return (reg.syx / Math.abs(reg.b)) * Math.sqrt(t);
}

/* ---------- degrees of freedom -------------------------------------------- */

/*
  Welch-Satterthwaite effective degrees of freedom.
  GUM (JCGM 100:2008) G.4.1 / Eurachem CG 4 §8.3.

    nu_eff = uc^4 / SUM( ci^4 / nu_i )

  contributions: array of { c, nu } where c is the component's contribution to
  uc in the units of the result, and nu its degrees of freedom (Infinity for a
  Type B component treated as reliably known).

  Returns Infinity when every component has infinite nu, which is the correct
  answer, not an error: a budget of only Type B components has no finite nu_eff
  and k = 1.96 (2 by convention) is right.
*/
export function welchSatterthwaite(contributions, uc) {
  if (!(uc > 0)) return NaN;
  let denom = 0;
  for (const { c, nu } of contributions) {
    if (!isFinite(nu) || nu <= 0) continue;
    denom += Math.pow(c, 4) / nu;
  }
  if (denom === 0) return Infinity;
  return Math.pow(uc, 4) / denom;
}

/* ---------- Kragten numerical propagation --------------------------------- */

/*
  Eurachem/CITAC CG 4 (3rd ed., 2012) Appendix E.2.

  For each input quantity, recompute the whole model with that quantity
  increased by its standard uncertainty. The change in the result is that
  component's contribution.

    u_i(y) = y(x_i + u(x_i)) - y(x_1 ... x_n)
    uc(y)  = sqrt( SUM u_i(y)^2 )

  Handles any model, including non-multiplicative ones, without a
  differentiation engine. This is the method CG 4 itself puts in front of
  practitioners.

    model  (x) => number, x an object of input quantities
    x      object of input values
    u      object of standard uncertainties, same keys (missing = 0)
*/
export function kragten(model, x, u) {
  const y = model(x);
  if (!isFinite(y)) return null;
  const contrib = {};
  let sumsq = 0;
  for (const key of Object.keys(x)) {
    const ui = u[key];
    if (!isFinite(ui) || ui === 0) {
      contrib[key] = 0;
      continue;
    }
    const xp = { ...x, [key]: x[key] + ui };
    const yp = model(xp);
    if (!isFinite(yp)) return null;
    const d = yp - y;
    contrib[key] = d;
    sumsq += d * d;
  }
  return { y, contrib, uc: Math.sqrt(sumsq) };
}

/* ---------- water density, for volumetric uncertainty --------------------- */

/*
  Density of air-free water, Tanaka et al. (2001), Metrologia 38, 301-309.
  Valid 0-40 degC at 101.325 kPa. Returns kg/m3.

  This is the formulation ISO 4787:2022 and ISO 8655-6:2022 rest on. It is used
  here rather than a single cubic expansion coefficient because gamma is itself
  strongly temperature dependent: about 2.07e-4 /K at 20 degC but 2.57e-4 /K at
  25 degC, so a constant misstates the correction across an Indian laboratory's
  actual working range.
*/
export function waterDensity(tC) {
  if (!(tC >= 0 && tC <= 40)) return NaN;
  const a1 = -3.983035;
  const a2 = 301.797;
  const a3 = 522528.9;
  const a4 = 69.34881;
  const a5 = 999.974950;
  return a5 * (1 - ((tC + a1) * (tC + a1) * (tC + a2)) / (a3 * (tC + a4)));
}

/*
  Cubic expansion coefficient of water at t, from the Tanaka density, by
  central difference. Returns /K.
*/
export function waterGamma(tC) {
  const h = 0.05;
  const lo = waterDensity(tC - h);
  const hi = waterDensity(tC + h);
  const r = waterDensity(tC);
  if (!isFinite(lo) || !isFinite(hi) || !isFinite(r)) return NaN;
  return -(hi - lo) / (2 * h) / r;
}

/*
  Z factor for the gravimetric determination of volume, ISO 8655-6:2022 —
  the volume of one gram of water at the balance, corrected for air buoyancy.

    Z = 1 / (rho_W - rho_A) * (1 - rho_A / rho_B)      mL/g

  rho_W  density of water at t                    g/mL
  rho_A  density of air at t, p, relative humidity g/mL
  rho_B  density of the balance reference weights, conventionally 8.0 g/mL

  Air density from the simplified CIPM relation used in ISO 8655-6:
    rho_A = (0.348444 p - h (0.00252 t - 0.020582)) / (273.15 + t)   in kg/m3
  with p in hPa, t in degC, h in %RH. At 20 degC, 1013 hPa, 50 %RH this returns
  1.199 kg/m3, which is the expected density of laboratory air; the result is
  converted to g/mL below (1 kg/m3 = 0.001 g/mL).
*/
export function zFactor(tC, pHpa, rhPct, rhoB = 8.0) {
  if (!(tC >= 0 && tC <= 40)) return NaN;
  if (!(pHpa > 0)) return NaN;
  const h = isFinite(rhPct) ? rhPct : 50;
  const rhoW = waterDensity(tC) / 1000; /* kg/m3 -> g/mL */
  const rhoAkgm3 = (0.348444 * pHpa - h * (0.00252 * tC - 0.020582)) / (273.15 + tC);
  const rhoA = rhoAkgm3 / 1000; /* kg/m3 -> g/mL */
  if (!(rhoW > rhoA)) return NaN;
  return (1 / (rhoW - rhoA)) * (1 - rhoA / rhoB);
}

/* ---------- rounding ------------------------------------------------------ */

/* Round to n significant figures. Returns a number, not a string. */
export function sigFig(v, n) {
  if (!isFinite(v) || v === 0) return v;
  const d = Math.ceil(Math.log10(Math.abs(v)));
  const power = n - d;
  const mag = Math.pow(10, power);
  return Math.round(v * mag) / mag;
}

/*
  Uncertainty reporting convention: express U to two significant figures and
  round the result to the same decimal place. GUM 7.2.6.
*/
export function formatWithU(y, U) {
  if (!isFinite(y) || !isFinite(U) || U <= 0) return null;
  const Ur = sigFig(U, 2);
  const dp = Math.max(0, -Math.floor(Math.log10(Math.abs(Ur))) + 1);
  return { y: Number(y.toFixed(dp)), U: Number(Ur.toFixed(dp)), dp };
}
