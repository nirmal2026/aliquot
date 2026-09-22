/* =============================================================================
   Aliquot — scripts/build-html.mjs

   Builds the single-file HTML edition from the SAME source files the Node
   verification suites exercise. The sources are read, ES module syntax is
   stripped, and the result is inlined. There is no second implementation of
   any formula.

   No network calls. No build toolchain. Opens over file:// and content://.

   Run: node scripts/build-html.mjs
   ============================================================================= */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const SOURCES = [
  "src/lib/stats.js",
  "src/lib/uncert.js",
  "src/modules/base.js",
  "src/modules/additions.js",
  "src/modules/plant.js",
  "src/modules/water-is10500.js",
  "src/modules/hwm2016.js",
  "src/modules/phyto.js",
  "src/modules/qc-uncert.js",
  "src/modules/decision.js",
  "src/modules/noise.js",
];

/*
  Each source becomes its own IIFE with its own scope, and returns its exported
  bindings as a namespace object.

  Straight concatenation does not work: base.js and qc-uncert.js both declare
  `N`, `S` and `num` at top level, so the bundle was a SyntaxError and the page
  rendered nothing. Scoping per module is the fix, and it also means a future
  pack cannot break the build by choosing a common helper name.
*/
function nsName(file) {
  return "NS_" + file.replace(/^.*\//, "").replace(/[^a-z0-9]/gi, "_");
}

function demodule(src, file) {
  /* which namespaces does this file import from, and what does it take? */
  const imports = [];
  const importRe = /^\s*import\s+(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))\s+from\s+["']([^"']+)["'];?\s*$/gm;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const target = nsName(m[3]);
    if (m[1]) {
      const names = m[1].split(",").map((x) => x.trim()).filter(Boolean);
      imports.push(`var { ${names.join(", ")} } = ${target};`);
    } else if (m[2]) {
      imports.push(`var ${m[2]} = ${target}.__default;`);
    }
  }

  /* what does it export? */
  const exports = [];
  const expRe = /^\s*export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  while ((m = expRe.exec(src)) !== null) exports.push(m[1]);
  const hasDefault = /^\s*export\s+default\s/m.test(src);

  let body = src
    .replace(importRe, "")
    .replace(/^\s*export\s+default\s+/gm, "var __default = ")
    .replace(/^\s*export\s+(const|let|var|function|class)\s/gm, "$1 ");

  if (/^\s*export\s/m.test(body) || /^\s*import\s/m.test(body)) {
    throw new Error(`${file}: module syntax survived the strip. Check it by hand.`);
  }

  const ret = exports.concat(hasDefault ? ["__default"] : []);
  const code =
    `/* ---- ${file} ---- */\n` +
    `var ${nsName(file)} = (function(){\n` +
    (imports.length ? imports.join("\n") + "\n" : "") +
    body +
    `\nreturn { ${ret.join(", ")} };\n})();\n`;
  return { code, ns: nsName(file), exports: ret };
}

const parts = SOURCES.map((f) => demodule(readFileSync(join(root, f), "utf8"), f));

/* The UI needs a handful of bindings by name. Bring them into scope explicitly
   rather than relying on what happens to be global. */
const BASE_NS = nsName("src/modules/base.js");
const UNCERT_NS = nsName("src/modules/qc-uncert.js");
const LIBUNCERT_NS = nsName("src/lib/uncert.js");

const code =
  parts.map((p) => p.code).join("\n") +
  `\n/* ---- bindings the UI uses ---- */\n` +
  `var MODULES = ${BASE_NS}.MODULES;\n` +
  `var PRESETS = ${LIBUNCERT_NS}.PRESETS;\n` +
  `var ALL_ROUTINES = [].concat(${nsName("src/modules/base.js")}.__default, ${nsName("src/modules/additions.js")}.__default, ${nsName("src/modules/plant.js")}.__default, ${nsName("src/modules/water-is10500.js")}.__default, ${nsName("src/modules/hwm2016.js")}.__default, ${nsName("src/modules/phyto.js")}.__default, ${nsName("src/modules/qc-uncert.js")}.__default, ${nsName("src/modules/decision.js")}.__default, ${nsName("src/modules/noise.js")}.__default);
`;

const BUILD = "merged tree";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Aliquot</title>
<style>
/* Platform fonts only. No web-font fetch, no network call at launch, per the
   project rule. Named families are tried first so self-hosted .woff2 files can
   be dropped in later without touching any other rule. */
:root{
  --bg:#0e1116; --panel:#161b23; --panel2:#1c222c; --line:#2a3240;
  --ink:#e6ecf4; --dim:#93a1b5; --accent:#5cc8a0; --warn:#e8b04b; --bad:#e8695f;
  --ok:#5cc8a0;
  --mono:"JetBrains Mono","Roboto Mono",ui-monospace,Menlo,Consolas,monospace;
  --sans:Archivo,"Space Grotesk",Roboto,-apple-system,"Segoe UI",system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
  font-size:15px;line-height:1.5;-webkit-text-size-adjust:100%}
.wrap{max-width:940px;margin:0 auto;padding:12px 12px 72px}
header{padding:14px 0 10px;border-bottom:1px solid var(--line);margin-bottom:12px}
h1{margin:0;font-size:21px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:12.5px;margin-top:3px}
.controls{position:sticky;top:0;z-index:9;background:var(--bg);padding:8px 0 10px;
  border-bottom:1px solid var(--line);margin-bottom:14px}
#q{width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);
  border-radius:9px;padding:10px 12px;font-size:15px;font-family:var(--sans)}
#q:focus{outline:none;border-color:#4a6f92}
.tabs{display:flex;gap:6px;margin-top:8px}
.tab{flex:1;padding:8px 6px;border:1px solid var(--line);background:var(--panel);
  border-radius:9px;color:var(--dim);font-size:13px;cursor:pointer;text-align:center}
.tab[aria-selected=true]{background:var(--panel2);color:var(--ink);border-color:#3a4a63}
.modhead{display:flex;align-items:baseline;gap:10px;margin:22px 0 8px;
  padding-bottom:7px;border-bottom:1px solid var(--line)}
.modhead .sw{width:3px;height:15px;border-radius:2px;background:var(--mi);flex:none}
.modhead h2{margin:0;font-size:15px;letter-spacing:-.01em}
.modhead .n{margin-left:auto;font-family:var(--mono);font-size:10.5px;color:var(--dim);
  border:1px solid var(--line);border-radius:20px;padding:2px 8px;white-space:nowrap}
.modhead p{margin:0;flex-basis:100%;font-size:11.5px;color:var(--dim)}
.card{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--mi,#3a4a63);
  border-radius:10px;margin-bottom:8px;overflow:hidden}
.chead{display:flex;align-items:center;gap:9px;padding:12px 13px;cursor:pointer;user-select:none}
.chead .t{flex:1;min-width:0}
.chead h3{margin:0;font-size:14.5px;font-weight:600}
.chead p{margin:2px 0 0;font-size:11.5px;color:var(--dim)}
.pill{font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;
  padding:2px 6px;border-radius:20px;border:1px solid var(--line);color:var(--dim);flex:none}
.pill.rout{border-color:#2f4a3f;color:var(--accent)}
.pill.adv{border-color:#3d4a5f;color:#a9bcd4}
.chev{color:var(--dim);font-size:13px;flex:none}
.body{display:none;padding:0 13px 14px;border-top:1px solid var(--line)}
.card.open .body{display:block}
.formula{font-family:var(--mono);font-size:11.5px;color:#b9c8dc;background:var(--panel2);
  border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin:12px 0 8px;
  overflow-x:auto;white-space:pre-wrap;word-break:break-word}
.ref{font-size:11px;color:var(--dim);border-left:2px solid var(--line);padding-left:9px;margin:8px 0 4px}
label{display:block;font-size:12.5px;color:var(--dim);margin:11px 0 4px}
label .u{color:#6f8098}
input,select,textarea{width:100%;background:var(--panel2);border:1px solid var(--line);
  color:var(--ink);border-radius:8px;padding:9px 10px;font-size:15px;font-family:var(--sans)}
textarea{font-family:var(--mono);font-size:12.5px;min-height:84px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:#4a6f92}
.hint{font-size:11px;color:#7d8ea6;margin-top:4px;white-space:pre-line}
button{background:var(--accent);color:#08150f;border:0;border-radius:9px;padding:11px 16px;
  font-size:14.5px;font-weight:600;cursor:pointer;font-family:var(--sans)}
button.sec{background:var(--panel2);color:var(--ink);border:1px solid var(--line);font-weight:500}
button[disabled]{opacity:.45;cursor:default}
.btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.tbl{border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:4px}
.tr{display:grid;grid-template-columns:1fr 104px;align-items:center;gap:8px;
  padding:5px 9px;border-bottom:1px solid #1f2733}
.tr:last-child{border-bottom:0}
.tr span{font-size:12px}
.tr span em{font-style:normal;color:var(--dim);font-family:var(--mono);font-size:10px}
.tr input{padding:6px 8px;font-size:12.5px}
table.rows{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
table.rows th{font-weight:500;color:var(--dim);text-align:left;padding:4px;font-size:11px;
  white-space:nowrap;border-bottom:1px solid var(--line)}
table.rows td{padding:2px}
table.rows input,table.rows select{padding:6px;font-size:12.5px;border-radius:6px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.rowdel{background:transparent;color:var(--bad);border:1px solid var(--line);padding:5px 9px;
  font-size:12px;border-radius:6px}
.res{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
.r{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;padding:8px 0;
  border-bottom:1px solid #1f2733;align-items:baseline}
.r .l{font-size:13.5px;color:#cfdaea;flex:1 1 55%;min-width:0}
.r .v{font-family:var(--mono);font-size:13.5px;text-align:right;flex:0 0 auto;overflow-wrap:anywhere}
.r .h{font-size:11px;color:#7d8ea6;margin-top:2px;flex:0 0 100%;line-height:1.45}
.r.key .l{color:var(--ink);font-weight:500}
.r.key .v{font-size:16px;font-weight:600;color:var(--accent)}
.r.ok .v{color:var(--ok)}
.r.warn{background:#251d0d;border-radius:6px;padding:8px;margin:4px 0;border-bottom:0}
.r.warn .l,.r.warn .v{color:var(--warn)}
.r.sub .l{padding-left:12px;color:#9fb0c6}
.r .band{padding:3px 11px;border-radius:20px;color:#fff;font-size:12.5px}
.note{font-size:11px;color:#7d8ea6;margin-top:26px;border-top:1px solid var(--line);padding-top:12px}
.empty{color:var(--dim);font-size:13px;padding:26px 4px;text-align:center}
#record{display:none}
@media print{
  body{background:#fff;color:#000}
  .wrap{display:none !important}
  #record{display:block !important;font-family:Georgia,serif;color:#000;padding:0}
  #record h2{font-size:16px;margin:0 0 2px}
  #record .meta{font-size:11px;color:#333;margin-bottom:10px}
  #record table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
  #record th,#record td{border:1px solid #999;padding:4px 6px;text-align:left;
    vertical-align:top;word-break:break-word;overflow-wrap:anywhere}
  #record table.comp{font-size:9px}
  #record table.comp th,#record table.comp td{padding:2px 3px}
  #record .cit{font-size:10px;margin-top:10px;border-top:1px solid #999;padding-top:6px}
  #record .sig{margin-top:26px;font-size:11px}
}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Aliquot</h1>
  <div class="sub">Environmental &amp; bio-science laboratory calculators · offline · <span id="count"></span></div>
</header>

<div class="controls">
  <input id="q" type="search" placeholder="Search — plume, isokinetic, TCLP, uncertainty, MDL, SO₂…" autocomplete="off">
  <div class="tabs" id="tabs" role="tablist"></div>
</div>

<div id="list"></div>

<div class="note">
  A calculation aid, not a validated method, and not a substitute for reading the
  rule. Under <b>ISO/IEC 17025 §7.11.2</b> any software used to produce reported
  data must be verified before use — check every routine against your own worked
  examples and the current edition of the referenced standard, and keep the
  record. Regulatory limits change; confirm them against the notification in
  force before relying on a verdict. Every verdict is against a limit or a
  criterion you selected or entered.
  <br><br>
  A personal project. Not a product of, and not endorsed by, any organisation or
  employer. No network access; nothing leaves the device.
</div>
</div>

<div id="record"></div>

<script>
${code}

/* =============================================================================
   UI. Vanilla, no framework, so the file is genuinely one file.

   It renders BOTH routine shapes without either module knowing about the other:
     base.js       inputs keyed \`id\`, types num | sel | series | pairs | table
     qc-uncert.js  inputs keyed \`k\`,  types num | select | text | rows
   ============================================================================= */
(function(){
  var ROUTINES = ALL_ROUTINES;
  var state = {}, rowState = {}, lastRun = {};

  /* store.js pattern: probe localStorage inside try/catch, fall back to memory.
     Over content:// the probe itself throws, not just the write. */
  var mem = {};
  var LS = (function(){
    try { var k="__aq"; localStorage.setItem(k,"1"); localStorage.removeItem(k);
      return {get:function(k){return localStorage.getItem(k)},
              set:function(k,v){localStorage.setItem(k,v)}, persistent:true}; }
    catch(e){ return {get:function(k){return mem[k]||null},
              set:function(k,v){mem[k]=v}, persistent:false}; }
  })();

  function el(t,c,x){ var e=document.createElement(t); if(c)e.className=c;
    if(x!=null)e.textContent=x; return e; }

  /* ---- shape adapters --------------------------------------------------- */
  var key  = function(i){ return i.k || i.id; };
  var opts = function(i){ return i.opts || i.options || []; };
  function kind(i){
    switch(i.type){
      case "sel": case "select": return "select";
      case "series": case "pairs": return "area";
      case "text": return i.multiline ? "area" : "line";
      case "table": return "table";
      case "rows": return "rows";
      default: return "num";
    }
  }
  function placeholderFor(i){
    if(i.type === "pairs") return "0, 12\\n10, 1250\\n25, 3010";
    if(i.type === "series") return "12.4  12.7  12.1  …";
    return "";
  }

  /* ---- scalar field ------------------------------------------------------ */
  function field(rid, i){
    var k = key(i), t = kind(i), wrap = el("div");
    var lab = el("label"); lab.textContent = i.label;
    if(i.unit){ lab.appendChild(el("span","u"," — "+i.unit)); }
    wrap.appendChild(lab);

    var c;
    if(t === "select"){
      c = el("select");
      opts(i).forEach(function(o){ var op=el("option",null,o); op.value=o; c.appendChild(op); });
      c.value = state[rid][k] != null ? state[rid][k] : (i.def != null ? i.def : opts(i)[0]);
    } else if(t === "area"){
      c = el("textarea");
      c.placeholder = placeholderFor(i);
      c.value = state[rid][k] || "";
    } else if(t === "line"){
      c = el("input"); c.type = "text";
      c.value = state[rid][k] || "";
    } else {
      c = el("input"); c.type = "text"; c.setAttribute("inputmode","decimal");
      c.placeholder = "—";
      var d = i.def;
      c.value = state[rid][k] != null ? state[rid][k] : (d != null && d === d ? d : "");
    }
    var save = function(){ state[rid][k] = c.value; };
    c.addEventListener("input", save);
    c.addEventListener("change", save);
    save();
    wrap.appendChild(c);
    if(i.hint) wrap.appendChild(el("div","hint",i.hint));
    return wrap;
  }

  /* ---- table field, base.js ---------------------------------------------- */
  function tableField(rid, i){
    var k = key(i), wrap = el("div");
    wrap.appendChild(el("label", null, i.label));
    if(!state[rid][k] || typeof state[rid][k] !== "object") state[rid][k] = {};
    var box = el("div","tbl");
    (i.rows||[]).forEach(function(r){
      var tr = el("div","tr");
      var s = el("span");
      s.appendChild(document.createTextNode(r.k + (r.unit ? " ("+r.unit+")" : "")));
      if(r.std !== undefined){
        s.appendChild(document.createTextNode("  "));
        s.appendChild(el("em", null, (typeof r.std === "number" && r.std < 1 ? "TEF " : "std ") + r.std));
      }
      tr.appendChild(s);
      var inp = el("input"); inp.type="text"; inp.setAttribute("inputmode","decimal");
      inp.placeholder = "—";
      inp.value = state[rid][k][r.k] || "";
      inp.addEventListener("input", function(){ state[rid][k][r.k] = inp.value; });
      tr.appendChild(inp);
      box.appendChild(tr);
    });
    wrap.appendChild(box);
    if(i.hint) wrap.appendChild(el("div","hint",i.hint));
    return wrap;
  }

  /* ---- rows field, the repeating component editor ------------------------ */
  function rowsField(rid, i){
    var wrap = el("div");
    wrap.appendChild(el("label", null, i.label));
    if(i.hint) wrap.appendChild(el("div","hint",i.hint));
    var scroll = el("div","scroll"), table = el("table","rows");
    var thead = el("thead"), htr = el("tr");
    i.cols.forEach(function(c){ htr.appendChild(el("th",null,c.label)); });
    htr.appendChild(el("th",null,""));
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = el("tbody"); table.appendChild(tbody);
    scroll.appendChild(table); wrap.appendChild(scroll);

    function draw(){
      tbody.innerHTML = "";
      rowState[rid].forEach(function(r, n){
        var tr = el("tr");
        i.cols.forEach(function(c){
          var td = el("td"), ctrl;
          if(c.type === "select"){
            ctrl = el("select");
            var b = el("option",null,""); b.value=""; ctrl.appendChild(b);
            c.opts.forEach(function(o){ var op=el("option",null,o); op.value=o; ctrl.appendChild(op); });
          } else {
            ctrl = el("input"); ctrl.type = "text";
            if(c.type === "num") ctrl.setAttribute("inputmode","decimal");
            ctrl.style.minWidth = c.type === "text" ? "150px" : "72px";
          }
          ctrl.value = (r[c.k] == null || r[c.k] !== r[c.k]) ? "" : r[c.k];
          var save = function(){ r[c.k] = ctrl.value; };
          ctrl.addEventListener("input", save);
          ctrl.addEventListener("change", save);
          td.appendChild(ctrl); tr.appendChild(td);
        });
        var td = el("td"), del = el("button","rowdel","×");
        del.addEventListener("click", function(){ rowState[rid].splice(n,1); draw(); });
        td.appendChild(del); tr.appendChild(td);
        tbody.appendChild(tr);
      });
    }
    draw();

    var bar = el("div","btnrow");
    var add = el("button","sec","Add component");
    add.addEventListener("click", function(){
      rowState[rid].push({type:"B", basis:"rel", dist:"rect"}); draw();
    });
    bar.appendChild(add);
    if(typeof PRESETS !== "undefined"){
      var seed = el("button","sec","Load preset");
      seed.addEventListener("click", function(){
        var p = String(state[rid].preset||"").split(" — ")[0], pre = PRESETS[p];
        if(!pre){ alert("Choose a preset above first."); return; }
        rowState[rid] = pre.comps.map(function(c){
          return {label:c.label, type:c.type, basis:c.basis, dist:c.dist,
                  value:"", k:"", n:"", expo:"", xval:"", sens:"", source:c.source};
        });
        draw();
        alert(pre.name + "\\n\\n" + pre.note +
          (pre.comps.length ? "\\n\\nLabels, evaluation types, distributions and the source to consult have been filled in. No numeric value is seeded — the app does not know your equipment." : ""));
      });
      bar.appendChild(seed);
    }
    wrap.appendChild(bar);
    return wrap;
  }

  /* ---- results ----------------------------------------------------------- */
  function renderRows(rs){
    var box = el("div","res");
    rs.forEach(function(r){
      var isSub = /^\\s{2}/.test(String(r.label));
      var cls = "r" + (r.tone==="warn"?" warn":r.tone==="key"?" key":r.tone==="ok"?" ok":"") + (isSub?" sub":"");
      var d = el("div", cls);
      d.appendChild(el("div","l", String(r.label).trim()));
      var vtxt = (r.value == null ? "" : String(r.value)) + (r.unit ? " " + r.unit : "");
      if(r.tone === "band" && r.colour){
        var v = el("div","v"); var b = el("span","band", vtxt); b.style.background = r.colour;
        v.appendChild(b); d.appendChild(v);
      } else {
        d.appendChild(el("div","v", vtxt));
      }
      if(r.hint) d.appendChild(el("div","h", r.hint));
      box.appendChild(d);
    });
    return box;
  }

  /* ---- verification record ----------------------------------------------- */
  function esc(s){ return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function buildRecord(rt, values, rws, results){
    var h = [], lab = LS.get("aq.lab")||"", an = LS.get("aq.analyst")||"";
    var samp = state[rt.id].__sample || "";
    h.push("<h2>"+esc(rt.name)+"</h2>");
    h.push('<div class="meta">'+esc(rt.sub)+"<br>Aliquot ${BUILD} · routine <b>"+esc(rt.id)+
           "</b> · module "+esc(rt.mod)+" · tier "+esc(rt.tier)+" · generated "+
           esc(new Date().toISOString().replace("T"," ").slice(0,19))+" UTC</div>");
    h.push("<table><tr><th>Laboratory</th><td>"+esc(lab)+"</td><th>Analyst</th><td>"+esc(an)+
           "</td></tr><tr><th>Sample reference</th><td colspan=3>"+esc(samp)+"</td></tr></table><br>");

    h.push("<b>Inputs as entered</b><table>");
    rt.inputs.forEach(function(i){
      if(kind(i) === "rows") return;
      var v = values[key(i)];
      if(v === undefined || v === "" || v === null) return;
      if(kind(i) === "table"){
        var any = Object.keys(v).filter(function(kk){ return v[kk] !== ""; });
        if(!any.length) return;
        h.push("<tr><th>"+esc(i.label)+"</th><td>"+any.map(function(kk){
          return esc(kk)+" = "+esc(v[kk]); }).join("; ")+"</td></tr>");
        return;
      }
      h.push("<tr><th>"+esc(i.label)+(i.unit?" ("+esc(i.unit)+")":"")+"</th><td>"+esc(v)+"</td></tr>");
    });
    h.push("</table>");

    if(rws && rws.length){
      var COLS = [["label","Component"],["type","Type"],["basis","Basis"],["dist","Distribution"],
                  ["value","Value"],["k","k"],["n","n"],["expo","Exponent"],["xval","Quantity"],
                  ["sens","c_i"],["source","Source"]];
      var used = COLS.filter(function(c){
        if(["label","type","basis","dist","value"].indexOf(c[0]) >= 0) return true;
        return rws.some(function(r){ return r[c[0]] != null && String(r[c[0]]).trim() !== ""; });
      });
      h.push('<br><b>Uncertainty components as entered</b><table class="comp"><tr>');
      used.forEach(function(c){ h.push("<th>"+esc(c[1])+"</th>"); });
      h.push("</tr>");
      rws.forEach(function(r){
        h.push("<tr>"+used.map(function(c){ return "<td>"+esc(r[c[0]])+"</td>"; }).join("")+"</tr>");
      });
      h.push("</table>");
    }

    h.push("<br><b>Formula applied</b><table><tr><td>"+esc(rt.formula)+"</td></tr></table>");
    h.push("<br><b>Result</b><table>");
    results.forEach(function(r){
      h.push("<tr><th>"+esc(String(r.label).trim())+"</th><td>"+esc(r.value)+" "+esc(r.unit||"")+"</td></tr>");
      if(r.hint) h.push('<tr><td colspan=2 style="font-size:9.5px;color:#333">'+esc(r.hint)+"</td></tr>");
    });
    h.push("</table>");
    h.push('<div class="cit"><b>Citation.</b> '+esc(rt.ref)+"</div>");
    h.push('<div class="cit">A calculation aid, not a validated method. ISO/IEC 17025 §7.11.2 applies: '+
           'verify before use. A personal project — not a product of, and not endorsed by, any '+
           'organisation or employer. Verdicts are against limits or criteria selected or entered by the user.</div>');
    h.push('<div class="sig">Calculated by ____________________ &nbsp;&nbsp; Checked by ____________________ &nbsp;&nbsp; Date __________</div>');
    return h.join("");
  }

  /* ---- one card ---------------------------------------------------------- */
  function card(rt){
    if(!state[rt.id]) state[rt.id] = {};
    if(!rowState[rt.id]) rowState[rt.id] = [];
    var mi = (MODULES.filter(function(m){return m.id===rt.mod;})[0]||{}).ink || "#3a4a63";

    var c = el("div","card"); c.style.setProperty("--mi", mi);
    var head = el("div","chead");
    var t = el("div","t");
    t.appendChild(el("h3", null, rt.name));
    t.appendChild(el("p", null, rt.sub));
    head.appendChild(t);
    head.appendChild(el("span","pill "+(rt.tier==="advanced"?"adv":"rout"), rt.tier));
    var chev = el("span","chev","▾"); head.appendChild(chev);
    c.appendChild(head);

    var body = el("div","body"); c.appendChild(body);
    var built = false;
    head.addEventListener("click", function(){
      if(!built){ buildBody(); built = true; }
      c.classList.toggle("open");
      chev.textContent = c.classList.contains("open") ? "▴" : "▾";
    });

    function buildBody(){
      body.appendChild(el("div","formula", rt.formula));
      body.appendChild(el("div","ref", rt.ref));
      rt.inputs.forEach(function(i){
        var k = kind(i);
        body.appendChild(k === "rows" ? rowsField(rt.id,i) : k === "table" ? tableField(rt.id,i) : field(rt.id,i));
      });

      var ctx = el("div");
      ctx.appendChild(el("label", null, "Sample reference, for the record"));
      var ci = el("input"); ci.type="text";
      ci.addEventListener("input", function(){ state[rt.id].__sample = ci.value; });
      ctx.appendChild(ci);
      body.appendChild(ctx);

      var out = el("div"), bar = el("div","btnrow");
      var go = el("button", null, "Calculate");
      var rec = el("button","sec","Record / Save as PDF"); rec.disabled = true;
      bar.appendChild(go); bar.appendChild(rec);
      body.appendChild(bar); body.appendChild(out);

      go.addEventListener("click", function(){
        out.innerHTML = "";
        var values = {};
        Object.keys(state[rt.id]).forEach(function(k){ values[k] = state[rt.id][k]; });
        var rws = rowState[rt.id].filter(function(r){
          return r.label || (r.value !== "" && r.value != null); });
        rt.inputs.forEach(function(i){
          if(kind(i) === "rows" && rws.length) values[key(i)] = rws;
        });
        var res;
        try { res = rt.run(values); }
        catch(err){ res = [{label:"Calculation failed", value:"—", unit:"",
          hint:String(err && err.message || err), tone:"warn"}]; }

        if(res == null || (Array.isArray(res) && !res.length)){
          out.appendChild(renderRows([{label:"Not enough input", value:"—", unit:"", tone:"warn",
            hint:"A required field is missing or out of range. This routine returns nothing rather than a silent number."}]));
          rec.disabled = true;
          return;
        }
        out.appendChild(renderRows(res));
        lastRun[rt.id] = {values:values, rows:rws, results:res};
        rec.disabled = false;
      });

      rec.addEventListener("click", function(){
        var lr = lastRun[rt.id]; if(!lr) return;
        var lab = prompt("Laboratory (kept on this device)", LS.get("aq.lab")||"");
        if(lab != null) LS.set("aq.lab", lab);
        var an = prompt("Analyst (kept on this device)", LS.get("aq.analyst")||"");
        if(an != null) LS.set("aq.analyst", an);
        document.getElementById("record").innerHTML = buildRecord(rt, lr.values, lr.rows, lr.results);
        window.print();
      });
    }
    return c;
  }

  /* ---- list -------------------------------------------------------------- */
  var list = document.getElementById("list");
  var tabs = document.getElementById("tabs");
  var qbox = document.getElementById("q");
  var tier = "all";
  document.getElementById("count").textContent = ROUTINES.length + " routines · " + MODULES.length + " modules";

  function matches(rt){
    if(tier !== "all" && rt.tier !== tier) return false;
    var s = qbox.value.trim().toLowerCase();
    if(!s) return true;
    return (rt.name + " " + rt.sub + " " + rt.formula + " " + rt.ref + " " + rt.id).toLowerCase().indexOf(s) >= 0;
  }

  function draw(){
    list.innerHTML = "";
    var shown = 0;
    MODULES.forEach(function(m){
      var rs = ROUTINES.filter(function(r){ return r.mod === m.id && matches(r); });
      if(!rs.length) return;
      shown += rs.length;
      var h = el("div","modhead"); h.style.setProperty("--mi", m.ink);
      h.appendChild(el("span","sw"));
      h.appendChild(el("h2", null, m.name));
      h.appendChild(el("span","n", rs.length + (rs.length===1?" routine":" routines")));
      h.appendChild(el("p", null, m.blurb));
      list.appendChild(h);
      rs.forEach(function(r){ list.appendChild(card(r)); });
    });
    /* any routine whose module is not in MODULES still has to appear */
    var orphans = ROUTINES.filter(function(r){
      return matches(r) && !MODULES.some(function(m){ return m.id === r.mod; }); });
    if(orphans.length){
      var h = el("div","modhead");
      h.appendChild(el("span","sw"));
      h.appendChild(el("h2", null, "Unfiled"));
      h.appendChild(el("span","n", orphans.length + " routines"));
      h.appendChild(el("p", null, "Registered against a module that does not exist — a taxonomy fault, shown rather than hidden."));
      list.appendChild(h);
      orphans.forEach(function(r){ list.appendChild(card(r)); });
      shown += orphans.length;
    }
    if(!shown) list.appendChild(el("div","empty","Nothing matches that search."));
  }

  [["all","All"],["routine","Routine"],["advanced","Advanced"]].forEach(function(t){
    var b = el("div","tab", t[1]);
    b.setAttribute("role","tab");
    b.setAttribute("aria-selected", t[0] === tier ? "true" : "false");
    b.addEventListener("click", function(){
      tier = t[0];
      Array.prototype.forEach.call(tabs.children, function(x){ x.setAttribute("aria-selected","false"); });
      b.setAttribute("aria-selected","true");
      draw();
    });
    tabs.appendChild(b);
  });
  qbox.addEventListener("input", draw);

  draw();

  if(!LS.persistent){
    var n = document.querySelector(".note");
    n.insertBefore(document.createTextNode(
      "This file was opened from an address that does not allow local storage, so the laboratory and analyst names will not survive a restart. Everything else works normally. "), n.firstChild);
  }
})();
</script>
</body>
</html>
`;

writeFileSync(join(root, "aliquot.html"), html, "utf8");
console.log(`  wrote aliquot.html  ${(html.length / 1024).toFixed(1)} KB`);

/* Guards that matter for this project, checked at build time. */
const problems = [];
const hits = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter((h) => !/^https?:\/\/localhost/.test(h));
if (hits.length) problems.push(`network reference(s) in the bundle: ${hits.slice(0, 3).join(", ")}`);
if (/@impo` + `rt/.test(html)) problems.push("CSS import present — that is a network call on launch");
if (!/@media print/.test(html)) problems.push("print stylesheet missing");
if (problems.length) {
  console.log("");
  for (const p of problems) console.log(`  FAIL  ${p}`);
  process.exit(1);
}
console.log("  no network references · print stylesheet present");
