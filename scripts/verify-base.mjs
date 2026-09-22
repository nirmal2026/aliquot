/* =============================================================================
   Aliquot — scripts/verify-base.mjs
   Shape, refusal and method-fix checks for the 51 base routines.
   ============================================================================= */

import BASE, { MODULES, tValue, percentile, stats, TOX } from "../src/modules/base.js";

let pass = 0, fail = 0;
const failures = [];
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; failures.push(`${n}${d ? " — " + d : ""}`); } };
const close = (n, got, want, tol) => {
  const g = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(n, g, g ? "" : `got ${got}, want ${want} ±${tol}`);
};
const rows = (r) => (Array.isArray(r) ? r : []);
const find = (rs, frag) => rs.find((x) => String(x.label).toLowerCase().includes(frag.toLowerCase()));
const numOf = (r) => (r ? parseFloat(String(r.value).replace(/[, ]/g, "")) : NaN);

/* ---------- registry ------------------------------------------------------ */

ok("51 base routines", BASE.length === 51, `got ${BASE.length}`);
const ids = new Set();
for (const c of BASE) {
  ok(`${c.id}: unique id`, !ids.has(c.id));
  ids.add(c.id);
  ok(`${c.id}: module exists`, MODULES.some((m) => m.id === c.mod), `mod ${c.mod}`);
  ok(`${c.id}: has a tier`, c.tier === "routine" || c.tier === "advanced", `tier ${c.tier}`);
  ok(`${c.id}: has a citation`, typeof c.ref === "string" && c.ref.length > 20);
  ok(`${c.id}: has a formula`, typeof c.formula === "string" && c.formula.length > 5);
  ok(`${c.id}: inputs all keyed and labelled`, c.inputs.every((i) => i.id && i.label));
  ok(`${c.id}: run is a function`, typeof c.run === "function");
}

/* Every module is represented */
for (const m of MODULES) ok(`module ${m.id} has routines`, BASE.some((c) => c.mod === m.id));

/* ---------- the house rule: no silent number from an empty form ----------- */

for (const c of BASE) {
  let r;
  try { r = c.run({}); } catch (e) { r = "THREW: " + e.message; }
  ok(
    `${c.id}: empty form returns null, or rows carrying a warning`,
    r === null || (Array.isArray(r) && (r.length === 0 || r.some((x) => x.tone === "warn"))),
    typeof r === "string" ? r : `returned ${Array.isArray(r) ? r.length + " rows, no warn" : typeof r}`
  );
}

/* Defaults only — every select at its default, every numeric field blank.
   This is the probe that missed the unguarded .startsWith crashes before. */
for (const c of BASE) {
  const v = {};
  for (const i of c.inputs) {
    if (i.type === "sel") v[i.id] = i.def !== undefined ? i.def : i.opts[0];
    else if (i.type === "table") v[i.id] = {};
    else v[i.id] = i.def !== undefined ? i.def : "";
  }
  let threw = null;
  try { c.run(v); } catch (e) { threw = e.message; }
  ok(`${c.id}: defaults-only form does not throw`, threw === null, threw || "");
}

/* And with every select left UNSET, which is what a partly filled form looks
   like. This is the case that crashed soilpe, lfg, clarifier and dre. */
for (const c of BASE) {
  const v = {};
  for (const i of c.inputs) {
    if (i.type === "sel") continue;
    if (i.type === "table") v[i.id] = {};
    else v[i.id] = i.def !== undefined ? i.def : "";
  }
  let threw = null;
  try { c.run(v); } catch (e) { threw = e.message; }
  ok(`${c.id}: unset select does not throw`, threw === null, threw || "");
}

/* ---------- FIX 1 — filterpm reporting basis ------------------------------ */

/*
  The worked case from claude/roadmap-2026-07-29.md, which is the record this
  fix has to reproduce:

    PM10 RDS, 1.132 m³/min, 1440 min, net 159.8 mg, 42 °C, 99.5 kPa

    Ambient  V = 1.132 × 1440           = 1630.08 m³ → 98.03 µg/m³ → within 100
    NTP      V = 1630.08 × (298.15/315.15) × (99.5/101.325)
                                        = 1514.4  m³ → 105.5 µg/m³ → exceeds 100

  7.6 % apart, and it flips the verdict. That is the whole point of the fix.
*/
{
  const pm = BASE.find((c) => c.id === "filterpm");
  const base = { sampler: "PM10 — RDS, IS 5182 Part 23", wi: 0, wf: 159.8, blank: 0, dur: 1440, t: 42, p: 99.5 };

  const amb = rows(pm.run({ ...base, basis: "Ambient conditions (CPCB NAAQMS)" }));
  const cAmb = numOf(find(amb, "Concentration — ambient basis"));
  close("filterpm ambient concentration", cAmb, 98.03, 0.05);
  const vAmb = numOf(find(amb, "Volume, ambient conditions"));
  close("filterpm ambient volume", vAmb, 1630.08, 0.5);
  const verdictAmb = find(amb, "Against NAAQS");
  ok("filterpm ambient verdict is within limit", verdictAmb.value === "Within limit", verdictAmb.value);

  const ntp = rows(pm.run({ ...base, basis: "NTP (25 °C, 101.325 kPa)" }));
  const cNtp = numOf(find(ntp, "Concentration — NTP basis"));
  close("filterpm NTP concentration", cNtp, 105.5, 0.15);
  const verdictNtp = find(ntp, "Against NAAQS");
  ok("filterpm NTP verdict exceeds limit", verdictNtp.value === "Exceeds limit", verdictNtp.value);
  ok("selecting NTP is flagged as not the CPCB basis", ntp.some((r) => /Basis note/.test(r.label) && r.tone === "warn"));

  ok("the two bases differ by about 7.6 %", Math.abs((cNtp - cAmb) / cAmb * 100 - 7.6) < 0.3,
    `${((cNtp - cAmb) / cAmb * 100).toFixed(2)} %`);

  /* ambient is the default */
  const dflt = rows(pm.run({ ...base }));
  ok("ambient is the default basis", !!find(dflt, "Concentration — ambient basis"));
}

/* ---------- FIX 2 — TOX.Pb ------------------------------------------------ */

ok("TOX.Pb has no RfD", TOX.Pb.rfd === null);
ok("TOX.Pb has no slope factor", TOX.Pb.csf === null);
ok("TOX.Pb carries the reason", /IEUBK/.test(TOX.Pb.note));
ok("Cr(VI) carries a VERIFY note on its slope factor", /NJDEP/.test(TOX["Cr(VI)"].verify));

{
  const h = BASE.find((c) => c.id === "health");
  const pb = rows(h.run({ metal: "Pb", c: 250, who: "Child", ef: 350 }));
  ok("health returns a CDI for lead", !!find(pb, "CDI, non-carcinogenic"));
  ok("health returns no HQ for lead", !find(pb, "Hazard quotient"));
  ok("health says why, in warn tone", pb.some((r) => /No RfD for Pb/.test(r.label) && r.tone === "warn"));
  ok("health returns no cancer risk for lead", !find(pb, "Cancer risk"));
  ok("no Infinity anywhere in the lead output", !pb.some((r) => /Infinity|NaN/.test(String(r.value))));

  /* a metal that does have both still works */
  const as = rows(h.run({ metal: "As", c: 25, who: "Adult", ef: 350 }));
  ok("arsenic still returns an HQ", !!find(as, "Hazard quotient"));
  ok("arsenic still returns a cancer risk", !!find(as, "Cancer risk"));
  const cr = rows(h.run({ metal: "Cr(VI)", c: 25, who: "Adult", ef: 350 }));
  ok("Cr(VI) surfaces the VERIFY note on the CR row", /NJDEP/.test(find(cr, "Cancer risk").hint || ""));
}

/* ---------- other defects the rebuild note listed ------------------------- */

/* flue must not return a molecular weight from an untouched form. The CO field
   is seeded "0", so a finite-only test passes and the old code returned 28. */
{
  const flue = BASE.find((c) => c.id === "flue");
  const empty = flue.run({ co: "0", tm: "25", pbar: "760", pm: "0" });
  ok("flue returns nothing from an untouched form", empty === null);
  const real = rows(flue.run({ co2: 12, o2: 7, co: 0, tm: 25, pbar: 760, pm: 0 }));
  /* N2 by difference = 100 - 12 - 7 - 0 = 81
     Md = 0.44*12 + 0.32*7 + 0.28*(81+0) = 5.28 + 2.24 + 22.68 = 30.20 */
  close("flue Md by difference", numOf(find(real, "Dry molecular weight")), 30.2, 0.01);
}

/* isokinetic pressure ratio: at the defaults the old expression evaluated to
   zero and the || 1 swallowed it. P_s/(P_bar − P_m) must be applied. */
{
  const iso = BASE.find((c) => c.id === "isokinetic");
  const r = rows(iso.run({ us: 10, dn: 6, ts: 150, tm: 25, pbar: 760, ps: 750, pm: 20, bwo: 0.08 }));
  close("isokinetic pressure ratio", numOf(find(r, "Pressure ratio")), 750 / 740, 1e-4);
  /* A_n = pi*(0.006)^2/4 = 2.8274e-5 m2 ; R_s = 10*2.8274e-5*60*1000 = 16.965 LPM */
  close("isokinetic nozzle rate", numOf(find(r, "Rate at nozzle")), 16.965, 0.01);
  /* R_m = 16.965 * (298.15/423.15) * (750/740) * 0.92 = 11.148 */
  close("isokinetic metered rate", numOf(find(r, "Rate at gas meter")), 11.148, 0.01);
  const bad = rows(iso.run({ us: 10, dn: 6, ts: 150, tm: 25, pbar: 760, ps: 750, pm: 800 }));
  ok("isokinetic refuses P_m ≥ P_bar", bad.some((x) => /Pressure check/.test(x.label)));
}

/* naaqs must flag an 8-hour standard graded from a 24-hourly series */
{
  const n = BASE.find((c) => c.id === "naaqs");
  const r = rows(n.run({ pol: "O3", vals: "40 50 60 70 80" }));
  ok("naaqs flags the O3 averaging-period mismatch", r.some((x) => /Averaging period mismatch/.test(x.label)));
  const r2 = rows(n.run({ pol: "PM10", vals: "40 50 60 70 80" }));
  ok("naaqs does not flag PM10", !r2.some((x) => /Averaging period mismatch/.test(x.label)));
}

/* leach must state the basis, and warn when an EU mg/kg set is used */
{
  const l = BASE.find((c) => c.id === "leach");
  const eu = rows(l.run({ set: "EU 2003/33/EC — inert waste landfill (L/S 10)", tbl: { Lead: "0.02" } }));
  ok("leach states the EU basis in warn tone", eu.some((r) => /Basis of the criteria set/.test(r.label) && r.tone === "warn"));
  const us = rows(l.run({ set: "USEPA 40 CFR 261.24 — TCLP toxicity characteristic", tbl: { Lead: "0.02" } }));
  ok("leach does not warn on the TCLP set", !find(us, "Basis of the criteria set").tone);
}

/* ionbal / sar: K+ must be in the soluble-sodium-percent denominator */
{
  const s = BASE.find((c) => c.id === "sar");
  const withK = rows(s.run({ na: 100, ca: 40, mg: 20, hco3: 200, co3: 0, k: 20 }));
  const noK = rows(s.run({ na: 100, ca: 40, mg: 20, hco3: 200, co3: 0 }));
  ok("K+ lowers the soluble sodium percent", numOf(find(withK, "Soluble sodium")) < numOf(find(noK, "Soluble sodium")));
  ok("sar prompts for K+ when absent", /enter it if the analysis has it/.test(find(noK, "Soluble sodium").hint));
}

/* deprecated routines must name their successor */
{
  const bcf = BASE.find((c) => c.id === "bcf");
  ok("bcf declares its successor", bcf.supersededBy === "transfer");
  const r = rows(bcf.run({ soil: 100, root: 150, shoot: 200 }));
  ok("bcf says so on screen", r.some((x) => /Superseded/.test(x.label)));
  ok("lodloq declares its successor", BASE.find((c) => c.id === "lodloq").supersededBy === "detlim");
  ok("mdl declares its successor", BASE.find((c) => c.id === "mdl").supersededBy === "detlim");
}

/* uncert must disclose that k is assumed, not computed */
{
  const u = BASE.find((c) => c.id === "uncert");
  const r = rows(u.run({ comps: "1.2\n2.4\n0.8", result: 50, k: "2 (≈95 %)" }));
  ok("uncert discloses the assumed k", r.some((x) => /k was assumed/.test(x.label) && x.tone === "warn"));
  /* uc = sqrt(1.44+5.76+0.64) = sqrt(7.84) = 2.8 ; U = 5.6 % */
  close("uncert combined u_c", numOf(find(r, "Combined u_c")), 2.8, 1e-9);
}

/* ---------- spot checks on arithmetic ------------------------------------- */

close("tValue at n=7 is the 40 CFR multiplier", tValue(7), 3.143, 1e-9);
close("percentile 98 of 1..100", percentile(Array.from({ length: 100 }, (_, i) => i + 1), 98), 98.02, 0.02);
close("stats sd", stats([2, 4, 4, 4, 5, 5, 7, 9]).sd, Math.sqrt(32 / 7), 1e-12);

/* hardness: TH = 2.497*80 + 4.118*25 = 199.76 + 102.95 = 302.71 */
{
  const h = BASE.find((c) => c.id === "hardness");
  close("hardness total", numOf(find(rows(h.run({ ca: 80, mg: 25 })), "Total hardness")), 302.71, 0.01);
}

/* COD: (25 - 12) * 0.1 * 8000 / 20 = 520 mg/L */
{
  const cod = BASE.find((c) => c.id === "cod");
  close("COD", numOf(find(rows(cod.run({ a: 25, b: 12, m: 0.1, vs: 20 })), "COD")), 520, 0.01);
}

/* Gaussian plume, the case checked by hand in the rebuild note:
   Q 5 g/s, H 60 m, u 3 m/s, x 1000 m, class D rural → 52.51 µg/m³ */
{
  const g = BASE.find((c) => c.id === "gauss");
  const r = rows(g.run({ q: 5, h: 60, u: 3, x: 1000, y: 0, z: 0, terrain: "Rural / open country", cls: "D" }));
  close("gaussian sigma_y", numOf(find(r, "σ_y at x")), 76.28, 0.05);
  close("gaussian sigma_z", numOf(find(r, "σ_z at x")), 37.95, 0.05);
  close("gaussian concentration", numOf(find(r, "Concentration at the receptor")), 52.51, 0.05);
}

/* ---------- report -------------------------------------------------------- */
console.log("");
console.log(`  Aliquot base pack — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("");
  for (const f of failures) console.log(`    FAIL  ${f}`);
  console.log("");
  process.exit(1);
}
console.log("");
