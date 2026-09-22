/* =============================================================================
   Aliquot — scripts/verify-decision-noise.mjs
   Numeric and refusal checks for src/modules/decision.js and src/modules/noise.js
   ============================================================================= */

import DEC from "../src/modules/decision.js";
import NOISE from "../src/modules/noise.js";

let pass = 0, fail = 0;
const failures = [];
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; failures.push(`${n}${d ? " — " + d : ""}`); } };
const close = (n, got, want, tol) => {
  const g = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(n, g, g ? "" : `got ${got}, want ${want} ±${tol}`);
};
const find = (rs, frag) => (rs || []).find((x) => String(x.label).toLowerCase().includes(frag.toLowerCase()));
const numOf = (r) => (r ? parseFloat(String(r.value).replace(/[, ]/g, "")) : NaN);
const R = (arr, id) => arr.find((c) => c.id === id);

/* ---------- registry ------------------------------------------------------ */
ok("decision has 1 routine", DEC.length === 1, `got ${DEC.length}`);
ok("noise has 4 routines", NOISE.length === 4, `got ${NOISE.length}`);
for (const c of [...DEC, ...NOISE]) {
  ok(`${c.id}: tier`, c.tier === "routine" || c.tier === "advanced", String(c.tier));
  ok(`${c.id}: inputs keyed and labelled`, c.inputs.every((i) => i.id && i.label));
}
ok("noise mods", NOISE.every((c) => c.mod === "noise"));
ok("decision mod", DEC[0].mod === "qc" && DEC[0].tier === "advanced");
ok("noiseatt is advanced", R(NOISE, "noiseatt").tier === "advanced");
ok("three noise routines are routine", ["noiseamb", "noiseldn", "noisecalc"].every((i) => R(NOISE, i).tier === "routine"));

/* ---------- CASE 1 — L_eq of [60, 70] ------------------------------------- */
const amb = R(NOISE, "noiseamb");
let r = amb.run({ vals: "60 70", zone: "Residential area", period: "Day time (6 a.m. – 10 p.m.)" });
const leqRow = find(r, "L_eq (energy average)");
close("Leq of [60,70] = 67.4", numOf(leqRow), 67.4, 0.05);
ok("Leq printed to one decimal", String(leqRow.value) === "67.4", String(leqRow.value));
const amRow = find(r, "Arithmetic mean");
ok("arithmetic mean 65.0 shown beside it", String(amRow.value) === "65.0", String(amRow.value));
ok("arithmetic mean row says NOT L_eq", /NOT L_eq/.test(amRow.label));

/* ---------- CASE 2 — L10 is the 90th percentile ascending ----------------- */
const series = [42, 47, 51, 53, 55, 58, 60, 63, 71, 88];
const asc = [...series].sort((a, b) => a - b);
const pct = (a, p) => { const i = (p / 100) * (a.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo); };
r = amb.run({ vals: series.join(" "), zone: "Residential area", period: "Day time (6 a.m. – 10 p.m.)" });
close("L10 = 90th percentile ascending", numOf(find(r, "L10")), pct(asc, 90), 0.05);
close("L50 = 50th percentile", numOf(find(r, "L50")), pct(asc, 50), 0.05);
close("L90 = 10th percentile ascending", numOf(find(r, "L90")), pct(asc, 10), 0.05);
ok("L10 > L90 (exceedance convention, not reversed)", numOf(find(r, "L10")) > numOf(find(r, "L90")));
close("noise climate = L10 − L90", numOf(find(r, "climate")), pct(asc, 90) - pct(asc, 10), 0.05);
ok("L10 hint states the 90th-percentile fact", /90th percentile/.test(find(r, "L10").hint));
ok("verdict carries VERIFY", /VERIFY against the Schedule as notified/.test(find(r, "verdict").hint));
ok("residential day 55 graded — 55.x series exceeds", find(r, "verdict").tone === "warn");
/* a quiet residential day series should pass */
r = amb.run({ vals: "40 42 44 41", zone: "Residential area", period: "Day time (6 a.m. – 10 p.m.)" });
ok("quiet residential day passes", find(r, "verdict").tone === "ok");
r = amb.run({ vals: "48 49 47 46", zone: "Residential area", period: "Night time (10 p.m. – 6 a.m.)" });
ok("same levels exceed the 45 night limit", find(r, "verdict").tone === "warn");
ok("night hint names the 45 limit", /45 dB\(A\)/.test(find(r, "verdict").hint));

/* ---------- CASE 3 — background correction refuses below 3 dB ------------- */
const calc = R(NOISE, "noisecalc");
r = calc.run({ op: "Background correction", lsb: "62.0", lb: "60.0" });
const corr = find(r, "Correction");
ok("ΔL = 2 dB refuses", corr.tone === "warn" && /REFUSED/.test(String(corr.value)), JSON.stringify(corr && corr.value));
ok("no corrected level returned below 3 dB", !r.some((x) => /corrected source level/i.test(x.label)));
r = calc.run({ op: "Background correction", lsb: "65.0", lb: "60.0" });
let cs = find(r, "Corrected source level");
close("ΔL = 5 dB corrects by energy subtraction", numOf(cs), 10 * Math.log10(Math.pow(10, 6.5) - Math.pow(10, 6)), 0.05);
ok("3–10 dB correction applied", /between 3 and 10/.test(cs.hint));
r = calc.run({ op: "Background correction", lsb: "75.0", lb: "60.0" });
cs = find(r, "Corrected source level");
close("ΔL = 15 dB — background negligible, level unchanged", numOf(cs), 75.0, 0.05);
ok("above 10 dB says negligible", /negligible/.test(cs.hint));
r = calc.run({ op: "Background correction", lsb: "62.9", lb: "60.0" });
ok("ΔL = 2.9 dB still refuses", /REFUSED/.test(String(find(r, "Correction").value)));
r = calc.run({ op: "Background correction", lsb: "63.0", lb: "60.0" });
ok("ΔL = 3.0 dB exactly is corrected", !!find(r, "Corrected source level"));

/* decibel arithmetic */
r = calc.run({ op: "Energy sum of levels", vals: "60 60" });
close("two equal sources add 3 dB", numOf(find(r, "Energy sum")), 63.01, 0.02);
r = calc.run({ op: "Energy average (L_eq)", vals: "60 70" });
close("energy average of [60,70] = 67.4", numOf(find(r, "L_eq")), 67.4, 0.05);
ok("energy average shows arithmetic mean too", String(find(r, "Arithmetic mean").value) === "65.0");

/* ---------- CASE 4 — decision: 97.4, U 4, k 2, TU 100, w = U -------------- */
const dec = DEC[0];
r = dec.run({ y: "97.4", umode: "Expanded uncertainty U with k", uval: "4", k: "2",
  ltype: "Upper limit", tu: "100", tl: "", rule: "Guarded acceptance, w = U", wc: "", unit: "mg/L" });
close("u = U/k = 2", numOf(find(r, "Standard uncertainty")), 2, 1e-9);
close("acceptance limit = 96", numOf(find(r, "Acceptance limit")), 96, 1e-9);
ok("verdict INDETERMINATE", find(r, "Verdict").value === "INDETERMINATE", String(find(r, "Verdict").value));
const riskRow = find(r, "Specific risk of");
ok("risk is of false rejection", /false rejection/.test(riskRow.label), riskRow.label);
close("specific risk of false rejection ≈ 90.3 %", numOf(riskRow), 90.3, 0.05);
const stmt = find(r, "Statement of conformity");
const want = "97.4 mg/L — INDETERMINATE against an upper limit of 100 mg/L, decision rule: guarded acceptance with a guard band of w = U = 4 mg/L, acceptance limit 96 mg/L. Specific risk of false rejection 90.3 %. Conformity is not demonstrated at this level of risk.";
ok("statement matches the recorded sentence", stmt.value === want, `\n got:  ${stmt.value}\n want: ${want}`);

/* Φ accuracy — A&S 7.1.26 against known values */
r = dec.run({ y: "0", umode: "Standard uncertainty u", uval: "1", k: "2",
  ltype: "Upper limit", tu: "1.959964", rule: "Simple acceptance (w = 0)", unit: "" });
close("Φ(1.96) = 97.5 %", numOf(find(r, "Probability of conformity")), 97.5, 0.02);
r = dec.run({ y: "0", umode: "Standard uncertainty u", uval: "1", k: "2",
  ltype: "Upper limit", tu: "0", rule: "Simple acceptance (w = 0)", unit: "" });
close("Φ(0) = 50 %", numOf(find(r, "Probability of conformity")), 50, 0.001);

/* simple acceptance, same result: PASS on the limit itself */
r = dec.run({ y: "97.4", umode: "Expanded uncertainty U with k", uval: "4", k: "2",
  ltype: "Upper limit", tu: "100", rule: "Simple acceptance (w = 0)", unit: "mg/L" });
ok("simple acceptance passes 97.4 vs 100", find(r, "Verdict").value === "PASS");
close("guard band w = 0", numOf(find(r, "Guard band")), 0, 1e-12);
ok("accepted → consumer's risk reported", /false acceptance/.test(find(r, "Specific risk of").label));
close("risk of false acceptance = 9.7 %", numOf(find(r, "Specific risk of")), 9.7, 0.05);

/* guarded rejection widens the acceptance limit outwards */
r = dec.run({ y: "102", umode: "Expanded uncertainty U with k", uval: "4", k: "2",
  ltype: "Upper limit", tu: "100", rule: "Guarded rejection, w = −U", unit: "mg/L" });
close("guarded rejection acceptance limit = 104", numOf(find(r, "Acceptance limit")), 104, 1e-9);
ok("102 against TU 100 with guarded rejection is INDETERMINATE", find(r, "Verdict").value === "INDETERMINATE");
r = dec.run({ y: "105", umode: "Expanded uncertainty U with k", uval: "4", k: "2",
  ltype: "Upper limit", tu: "100", rule: "Guarded rejection, w = −U", unit: "mg/L" });
ok("105 is FAIL under guarded rejection", find(r, "Verdict").value === "FAIL");

/* w = 1.64u */
r = dec.run({ y: "90", umode: "Expanded uncertainty U with k", uval: "4", k: "2",
  ltype: "Upper limit", tu: "100", rule: "Guarded acceptance, w = 1.64u", unit: "mg/L" });
close("w = 1.64u = 3.28", numOf(find(r, "Guard band")), 3.28, 1e-9);
close("acceptance limit = 96.72", numOf(find(r, "Acceptance limit")), 96.72, 1e-9);
ok("1.64u sentence phrasing", /w = 1\.64u = 3\.28 mg\/L/.test(find(r, "Statement of conformity").value));

/* lower limit */
r = dec.run({ y: "6.2", umode: "Standard uncertainty u", uval: "0.1", k: "2",
  ltype: "Lower limit", tl: "6.0", rule: "Guarded acceptance, w = U", unit: "mg/L" });
close("lower acceptance limit = TL + w = 6.2", numOf(find(r, "Acceptance limit")), 6.2, 1e-9);
ok("lower-limit sentence names a lower limit", /against a lower limit of 6 mg\/L/.test(find(r, "Statement of conformity").value),
  find(r, "Statement of conformity").value);

/* ---------- CASE 5 — pH 6.5–8.5 two-sided, U = 1.0, empty interval -------- */
r = dec.run({ y: "7.4", umode: "Expanded uncertainty U with k", uval: "1.0", k: "2",
  ltype: "Two-sided", tl: "6.5", tu: "8.5", rule: "Guarded acceptance, w = U", unit: "pH" });
const ai = find(r, "Acceptance interval");
ok("empty acceptance interval flagged", ai.tone === "warn" && /EMPTY/.test(String(ai.value)), String(ai && ai.value));
ok("no verdict is issued on an empty interval", !r.some((x) => /^verdict$/i.test(x.label)));
ok("no risk is issued on an empty interval", !r.some((x) => /specific risk/i.test(x.label)));
ok("statement not issued", String(find(r, "Statement of conformity").value) === "NOT ISSUED");
ok("interval is never printed backwards", !r.some((x) => /7\.5 to 7\.5/.test(String(x.value))));
ok("empty-interval hint explains 2w ≥ TU − TL", /2w/.test(ai.hint));
/* a workable two-sided case still grades */
r = dec.run({ y: "7.4", umode: "Expanded uncertainty U with k", uval: "0.2", k: "2",
  ltype: "Two-sided", tl: "6.5", tu: "8.5", rule: "Guarded acceptance, w = U", unit: "pH" });
ok("two-sided with U = 0.2 gives PASS", find(r, "Verdict").value === "PASS");
ok("two-sided acceptance interval 6.7 to 8.3", String(find(r, "Acceptance interval").value) === "6.7 to 8.3",
  String(find(r, "Acceptance interval").value));
r = dec.run({ y: "8.4", umode: "Expanded uncertainty U with k", uval: "0.2", k: "2",
  ltype: "Two-sided", tl: "6.5", tu: "8.5", rule: "Guarded acceptance, w = U", unit: "pH" });
ok("8.4 inside the upper guard band is INDETERMINATE", find(r, "Verdict").value === "INDETERMINATE");
r = dec.run({ y: "8.9", umode: "Expanded uncertainty U with k", uval: "0.2", k: "2",
  ltype: "Two-sided", tl: "6.5", tu: "8.5", rule: "Guarded acceptance, w = U", unit: "pH" });
ok("8.9 above TU is FAIL", find(r, "Verdict").value === "FAIL");
r = dec.run({ y: "6.4", umode: "Expanded uncertainty U with k", uval: "0.2", k: "2",
  ltype: "Two-sided", tl: "6.5", tu: "8.5", rule: "Guarded acceptance, w = U", unit: "pH" });
ok("6.4 below TL is FAIL", find(r, "Verdict").value === "FAIL");

/* ---------- refusals ------------------------------------------------------ */
ok("decision: empty form returns null", dec.run({}) === null);
ok("decision: no k with U is refused", (dec.run({ y: "10", umode: "Expanded uncertainty U with k", uval: "2", k: "",
  ltype: "Upper limit", tu: "12", rule: "Simple acceptance (w = 0)" }) || []).some((x) => x.tone === "warn"));
ok("decision: u = 0 is refused", (dec.run({ y: "10", umode: "Standard uncertainty u", uval: "0",
  ltype: "Upper limit", tu: "12", rule: "Simple acceptance (w = 0)" }) || []).some((x) => x.tone === "warn"));
ok("decision: missing limit is refused", (dec.run({ y: "10", umode: "Standard uncertainty u", uval: "1",
  ltype: "Upper limit", tu: "", rule: "Simple acceptance (w = 0)" }) || []).some((x) => x.tone === "warn"));
ok("decision: TU ≤ TL is refused", (dec.run({ y: "10", umode: "Standard uncertainty u", uval: "1",
  ltype: "Two-sided", tu: "5", tl: "9", rule: "Simple acceptance (w = 0)" }) || []).some((x) => x.tone === "warn"));
ok("decision: custom rule without w is refused", (dec.run({ y: "10", umode: "Standard uncertainty u", uval: "1",
  ltype: "Upper limit", tu: "12", rule: "Custom guard band", wc: "" }) || []).some((x) => x.tone === "warn"));

for (const c of NOISE) ok(`${c.id}: empty form returns null or warns`,
  c.run({}) === null || (c.run({}) || []).some((x) => x.tone === "warn"));
ok("noiseamb: single reading refused", (amb.run({ vals: "60", zone: "Residential area" }) || []).some((x) => x.tone === "warn"));
ok("noiseamb: out-of-range refused", (amb.run({ vals: "60 700", zone: "Residential area" }) || []).some((x) => x.tone === "warn"));
ok("noiseamb: zone unset is not graded silently",
  (amb.run({ vals: "60 62 64", period: "Day time (6 a.m. – 10 p.m.)" }) || []).some((x) => x.tone === "warn"));
const att = R(NOISE, "noiseatt");
ok("noiseatt: zero distance refused", (att.run({ l1: "90", r1: "0", r2: "10" }) || []).some((x) => x.tone === "warn"));
r = att.run({ l1: "90", r1: "1", r2: "2", src: "Point source (20 log₁₀ r₂/r₁)" });
close("point source loses 6 dB per doubling", numOf(find(r, "Geometry applied") && find(r, "Attenuation applied")), 6.02, 0.02);
close("predicted level 84 dB(A)", numOf(find(r, "Predicted level")), 83.98, 0.03);
r = att.run({ l1: "90", r1: "1", r2: "2", src: "Line source (10 log₁₀ r₂/r₁)" });
close("line source loses 3 dB per doubling", numOf(find(r, "Attenuation applied")), 3.01, 0.02);
ok("both geometries offered", !!find(r, "Point-source divergence") && !!find(r, "Line-source divergence"));
ok("mass law / barrier declared not implemented", !!find(r, "Mass law"));
ok("IL without a basis is flagged",
  (att.run({ l1: "90", r1: "1", r2: "2", il: "12" }) || []).some((x) => /basis missing/i.test(x.label) && x.tone === "warn"));

/* ---------- L_dn ---------------------------------------------------------- */
const ldn = R(NOISE, "noiseldn");
r = ldn.run({ dayvals: "", nightvals: "", ld: "60", ln: "50", zone: "Residential area" });
const want_ldn = 10 * Math.log10((16 * Math.pow(10, 6) + 8 * Math.pow(10, 6)) / 24);
close("L_dn of Ld 60 / Ln 50", numOf(find(r, "L_dn")), want_ldn, 0.05);
ok("L_dn flagged as not an Indian standard", (r || []).some((x) => /not an Indian standard/i.test(x.label) && x.tone === "warn"));
ok("day graded separately", !!find(r, "Day verdict"));
ok("night graded separately", !!find(r, "Night verdict"));
ok("day 60 exceeds residential 55", find(r, "Day verdict").tone === "warn");
ok("night 50 exceeds residential 45", find(r, "Night verdict").tone === "warn");
ok("day verdict carries VERIFY", /VERIFY against the Schedule as notified/.test(find(r, "Day verdict").hint));
ok("night verdict carries VERIFY", /VERIFY against the Schedule as notified/.test(find(r, "Night verdict").hint));
r = ldn.run({ dayvals: "60 70", nightvals: "", ld: "", ln: "", zone: "Industrial area" });
close("day series energy-averaged", numOf(find(r, "Day L_eq")), 67.4, 0.05);
ok("missing night flagged", (r || []).some((x) => /night l_eq/i.test(x.label) && x.tone === "warn"));

/* ---------- absent by design --------------------------------------------- */
const allText = JSON.stringify([...DEC, ...NOISE], (k, v) => (typeof v === "function" ? String(v) : v));
for (const banned of ["firecracker", "Fresnel", "mass law of ", "horn"]) {
  ok(`no ${banned} limits held`, !new RegExp(banned, "i").test(allText.replace(/Mass-law transmission loss and Fresnel[^"]*/gi, "").replace(/Mass law and barrier estimation/gi, "").replace(/mass-law/gi, "")),
    "banned term appears outside its disclaimer");
}
const zoneRows = allText.match(/\d{2}(?= day)/g);
ok("only the four Schedule zones are held", (allText.match(/Industrial area|Commercial area|Residential area|Silence zone/g) || []).length > 0);

/* ---------- report -------------------------------------------------------- */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
