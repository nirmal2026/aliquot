/* =============================================================================
   Aliquot — scripts/verify-registry.mjs
   Whole-tree checks that no single pack can make on its own.

   This is the gate the lost noise module would have tripped: a routine
   registered against a module that does not exist, or a module with no
   routines, is a taxonomy fault and must fail the build rather than quietly
   disappear from the UI.
   ============================================================================= */

import { MODULES } from "../src/modules/base.js";

const FILES = [
  "base.js", "additions.js", "plant.js", "water-is10500.js", "hwm2016.js",
  "phyto.js", "qc-uncert.js", "decision.js", "noise.js",
];

let pass = 0, fail = 0;
const failures = [];
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; failures.push(`${n}${d ? " — " + d : ""}`); } };

const ALL = [];
for (const f of FILES) {
  const m = await import(`../src/modules/${f}`);
  const r = m.default;
  ok(`${f}: default-exports an array`, Array.isArray(r) && r.length > 0, `got ${typeof r}`);
  for (const c of r) ALL.push({ ...c, __file: f });
}

console.log(`  ${ALL.length} routines across ${FILES.length} files`);
ok("91 routines registered", ALL.length === 91, `got ${ALL.length}`);

/* ---- ids ---------------------------------------------------------------- */
const seen = new Map();
for (const c of ALL) {
  if (seen.has(c.id)) {
    ok(`duplicate id "${c.id}"`, false, `${seen.get(c.id)} and ${c.__file}`);
  } else seen.set(c.id, c.__file);
}
ok("all ids unique", seen.size === ALL.length, `${ALL.length} routines, ${seen.size} distinct ids`);

/* ---- taxonomy ----------------------------------------------------------- */
const modIds = new Set(MODULES.map((m) => m.id));
for (const c of ALL) {
  ok(`${c.id}: module "${c.mod}" is registered`, modIds.has(c.mod), `in ${c.__file}`);
  ok(`${c.id}: tier is routine or advanced`, c.tier === "routine" || c.tier === "advanced", `got ${c.tier}`);
}
for (const m of MODULES) {
  const n = ALL.filter((c) => c.mod === m.id).length;
  ok(`module ${m.id} has at least one routine`, n > 0);
  ok(`module ${m.id} has a name and a blurb`, !!m.name && !!m.blurb);
}

/* ---- the contract every routine owes ------------------------------------ */
for (const c of ALL) {
  ok(`${c.id}: name`, typeof c.name === "string" && c.name.length > 2);
  ok(`${c.id}: sub`, typeof c.sub === "string" && c.sub.length > 2);
  ok(`${c.id}: formula`, typeof c.formula === "string" && c.formula.length > 5);
  ok(`${c.id}: citation`, typeof c.ref === "string" && c.ref.length > 20);
  ok(`${c.id}: inputs`, Array.isArray(c.inputs) && c.inputs.length > 0);
  ok(`${c.id}: every input keyed and labelled`, c.inputs.every((i) => (i.id || i.k) && i.label));
  ok(`${c.id}: run`, typeof c.run === "function");

  /* input keys unique within a routine */
  const ks = c.inputs.map((i) => i.id || i.k);
  ok(`${c.id}: input keys unique`, new Set(ks).size === ks.length);

  /* every select carries options */
  for (const i of c.inputs) {
    if (i.type === "sel" || i.type === "select") {
      const o = i.opts || i.options;
      ok(`${c.id}.${i.id || i.k}: select has options`, Array.isArray(o) && o.length > 0);
    }
    if (i.type === "table") ok(`${c.id}.${i.id || i.k}: table has rows`, Array.isArray(i.rows) && i.rows.length > 0);
    if (i.type === "rows") ok(`${c.id}.${i.id || i.k}: rows input has columns`, Array.isArray(i.cols) && i.cols.length > 0);
  }

  /* the renderer only knows these types */
  const KNOWN = new Set(["num", "sel", "select", "series", "pairs", "table", "text", "rows"]);
  for (const i of c.inputs) {
    ok(`${c.id}.${i.id || i.k}: renderable type "${i.type}"`, KNOWN.has(i.type), `${c.__file}`);
  }
}

/* ---- the house rule, across every routine in the tree -------------------- */
for (const c of ALL) {
  let r, threw = null;
  try { r = c.run({}); } catch (e) { threw = e.message; }
  ok(`${c.id}: empty form does not throw`, threw === null, threw || "");
  if (threw === null) {
    ok(
      `${c.id}: empty form returns no silent number`,
      r === null || (Array.isArray(r) && (r.length === 0 || r.some((x) => x.tone === "warn"))),
      `${c.__file}`
    );
  }

  /* defaults only */
  const v = {};
  for (const i of c.inputs) {
    const k = i.id || i.k;
    if (i.type === "table") v[k] = {};
    else if (i.type === "sel" || i.type === "select") v[k] = i.def !== undefined ? i.def : (i.opts || i.options)[0];
    else v[k] = i.def !== undefined && i.def === i.def ? i.def : "";
  }
  let t2 = null;
  try { c.run(v); } catch (e) { t2 = e.message; }
  ok(`${c.id}: defaults-only form does not throw`, t2 === null, t2 || "");

  /* every select unset — the case that lost the old probe */
  const v2 = {};
  for (const i of c.inputs) {
    const k = i.id || i.k;
    if (i.type === "sel" || i.type === "select") continue;
    if (i.type === "table") v2[k] = {};
    else v2[k] = i.def !== undefined && i.def === i.def ? i.def : "";
  }
  let t3 = null;
  try { c.run(v2); } catch (e) { t3 = e.message; }
  ok(`${c.id}: unset select does not throw`, t3 === null, t3 || "");
}

/* ---- deprecations must name a successor that exists --------------------- */
for (const c of ALL) {
  if (c.supersededBy) {
    ok(`${c.id}: successor "${c.supersededBy}" exists`, seen.has(c.supersededBy));
  }
}

/* ---- tier balance, reported not asserted -------------------------------- */
const routine = ALL.filter((c) => c.tier === "routine").length;
console.log(`  ${routine} routine · ${ALL.length - routine} advanced`);
for (const m of MODULES) {
  const n = ALL.filter((c) => c.mod === m.id).length;
  console.log(`    ${m.id.padEnd(6)} ${String(n).padStart(2)}  ${m.name}`);
}

console.log("");
console.log(`  Aliquot registry — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("");
  for (const f of failures.slice(0, 40)) console.log(`    FAIL  ${f}`);
  if (failures.length > 40) console.log(`    … and ${failures.length - 40} more`);
  console.log("");
  process.exit(1);
}
console.log("");
