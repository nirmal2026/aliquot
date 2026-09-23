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

const BUILD = "merged tree";

const code =
  parts.map((p) => p.code).join("\n") +
  `\n/* ---- bindings the UI uses ---- */\n` +
  `var BUILD = ${JSON.stringify(BUILD)};\n` +
  `var MODULES = ${BASE_NS}.MODULES;\n` +
  `var PRESETS = ${LIBUNCERT_NS}.PRESETS;\n` +
  `var ALL_ROUTINES = [].concat(${nsName("src/modules/base.js")}.__default, ${nsName("src/modules/additions.js")}.__default, ${nsName("src/modules/plant.js")}.__default, ${nsName("src/modules/water-is10500.js")}.__default, ${nsName("src/modules/hwm2016.js")}.__default, ${nsName("src/modules/phyto.js")}.__default, ${nsName("src/modules/qc-uncert.js")}.__default, ${nsName("src/modules/decision.js")}.__default, ${nsName("src/modules/noise.js")}.__default);
`;

const JSPDF = readFileSync(join(root, "vendor/jspdf.umd.min.js"), "utf8").split("</script>").join("<\\/scr"+"ipt>");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Envicron</title>
<style>
/* Platform fonts only. No web-font fetch, no network call at launch, per the
   project rule. Named families are tried first so self-hosted .woff2 files can
   be dropped in later without touching any other rule. */
:root{
  --bg:#ffffff; --panel:#ffffff; --panel2:#f2f4f7; --line:#d8dde5;
  --ink:#12161c; --sub:#5b6675; --accent:#0b7a53; --bad:#b21f2d;
  --ok:#0b7a53; --warn:#8a5a00; --warnbg:#fff6e6; --keyv:#0b7a53;
  --rl:#2a3341; --rh:#5b6675; --rline:#e5e9ef; --band:#0b7a53;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
}
[data-theme=dark]{
  --bg:#0e1116; --panel:#161b23; --panel2:#1c222c; --line:#2a3240;
  --ink:#e6ecf4; --sub:#8b97a8; --accent:#2fb183; --bad:#ef6a78;
  --ok:#2fb183; --warn:#e8b866; --warnbg:#251d0d; --keyv:#2fb183;
  --rl:#cfdaea; --rh:#7d8ea6; --rline:#1f2733; --band:#2fb183;
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
.formula{font-family:var(--mono);font-size:11.5px;color:var(--sub);background:var(--panel2);
  border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin:12px 0 8px;
  overflow-x:auto;white-space:pre-wrap;word-break:break-word}
.ref{font-size:11px;color:var(--dim);border-left:2px solid var(--line);padding-left:9px;margin:8px 0 4px}
label{display:block;font-size:12.5px;color:var(--dim);margin:11px 0 4px}
label .u{color:#6f8098}
input,select,textarea{width:100%;background:var(--panel2);border:1px solid var(--line);
  color:var(--ink);border-radius:8px;padding:9px 10px;font-size:15px;font-family:var(--sans)}
textarea{font-family:var(--mono);font-size:12.5px;min-height:84px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:#4a6f92}
.hint{font-size:11px;color:var(--rh);margin-top:4px;white-space:pre-line}
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
  border-bottom:1px solid var(--rline);align-items:baseline}
.r .l{font-size:13.5px;color:var(--rl);flex:1 1 55%;min-width:0}
.r .v{font-family:var(--mono);font-size:13.5px;text-align:right;flex:0 0 auto;overflow-wrap:anywhere;color:var(--ink)}
.r .h{font-size:11px;color:var(--rh);margin-top:2px;flex:0 0 100%;line-height:1.45}
.r.key .l{color:var(--ink);font-weight:500}
.r.key .v{font-size:16px;font-weight:600;color:var(--keyv)}
.r.ok .v{color:var(--ok)}
.r.warn{background:var(--warnbg);border-radius:6px;padding:8px;margin:4px 0;border-bottom:0}
.r.warn .l,.r.warn .v{color:var(--warn)}
.r.sub .l{padding-left:12px;color:var(--sub)}
.r .band{padding:3px 11px;border-radius:20px;color:#fff;background:var(--band);font-size:12.5px}
.note{font-size:11px;color:#7d8ea6;margin-top:26px;border-top:1px solid var(--line);padding-top:12px}
.empty{color:var(--dim);font-size:13px;padding:26px 4px;text-align:center}
#record{display:none}
@media print{ #gate,.mtabs,.themebtn,.controls .tabs{display:none!important} 
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

.logo{display:inline-flex;align-items:center;margin-right:8px;vertical-align:middle}
header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
header h1{font-size:20px;margin:0;display:flex;align-items:center}
header .sub{flex:1 1 100%;order:3;margin-top:2px}
.hactions{display:flex;gap:6px;flex:0 0 auto}
.themebtn{background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:8px;
  padding:7px 11px;font-weight:600;font-size:12px;cursor:pointer;width:auto}
.mtabwrap{position:relative}
.mtabs{display:flex;gap:6px;overflow-x:auto;margin-top:8px;padding-bottom:2px;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
.mtabs::-webkit-scrollbar{height:3px}
.mtabs::-webkit-scrollbar-thumb{background:var(--line);border-radius:3px}
.mtabfade{position:absolute;top:8px;bottom:2px;width:28px;pointer-events:none;z-index:2}
.mtabfade.r{right:0;background:linear-gradient(90deg,transparent,var(--bg))}
.mtabfade.l{left:0;background:linear-gradient(270deg,transparent,var(--bg))}
.mtab{flex:0 0 auto;padding:8px 12px;border:1px solid var(--line);background:var(--panel);
  color:var(--sub);border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.mtab[aria-selected=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
#gate{position:fixed;inset:0;z-index:99;background:var(--bg);display:flex;align-items:center;
  justify-content:center;flex-direction:column;gap:14px;padding:24px}
#gate .box{width:100%;max-width:320px;text-align:center}
#gate .glogo{display:flex;align-items:center;justify-content:center;margin:0 auto 6px}
#gate input{margin:8px 0}
#gate .err{color:var(--bad);font-size:12.5px;min-height:16px}
.saverow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
.saverow .full{grid-column:1/3}
@media(max-width:380px){.saverow{grid-template-columns:1fr}.saverow .full{grid-column:1}}

.savepanel{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:11px;margin:8px 0}
.savepanel label{font-size:12px;color:var(--sub);display:block;margin-bottom:6px}

#about{position:fixed;inset:0;z-index:98;background:rgba(0,0,0,.5);display:none;
  align-items:center;justify-content:center;padding:20px}
#about.open{display:flex}
#about .card2{background:var(--panel);color:var(--ink);border:1px solid var(--line);
  border-radius:14px;max-width:440px;width:100%;max-height:82vh;overflow:auto;padding:18px 18px 22px}
#about h2{margin:.2em 0 .4em;font-size:18px}
#about p{font-size:13px;line-height:1.55;color:var(--ink);margin:.6em 0}
#about p.lead{font-size:15px;color:var(--ink);margin:.2em 0 .4em}
#about .disc p{color:var(--ink)}
#about .x{float:right;background:var(--panel2);border:1px solid var(--line);color:var(--ink);
  border-radius:8px;padding:5px 10px;cursor:pointer;font-weight:600}
#about .disc{background:var(--warnbg);border-radius:8px;padding:10px;font-size:11.5px;margin-top:8px}

</style>
</head>
<body>
<div id="about">
  <div class="card2">
    <button class="x" id="aboutx" type="button">Close</button>
    <h2>Envicron</h2>
    <p class="lead"><b>Offline Environmental Laboratory &amp; Field Calculator.</b></p>
    <p>Envicron brings together 91 calculation routines used across environmental and
    bio-science laboratory work — spanning water and wastewater, ambient air, source
    (stack) emission, soil and sediment, hazardous waste and fuel, noise, and the
    quality-assurance and quality-control that underpin them all. Each routine states the
    standard, method number and clause it rests on, shows the formula it applies, validates
    every input against its permitted range, and reports the result to the correct number of
    significant figures with its citation.</p>
    <p>The application is built to work entirely offline. No calculation requires a network
    connection, and nothing you enter — sample data, analyst name or laboratory name —
    ever leaves your device. Reports you save or share are generated locally on the phone.</p>
    <p>It is designed for practising analysts, laboratory chemists, field-monitoring teams
    and students who need a fast, traceable calculation at the bench or in the field, with the
    governing standard always in view.</p>
    <p><b>Author:</b> Nirmal Kumar Sharma</p>
    <div class="disc">
    <p style="margin:0 0 8px"><b>Not an official product.</b> Envicron is an independent personal
    project.</p>
    <p style="margin:0"><b>A calculation aid, not a validated method.</b> Under ISO/IEC 17025:2017
    &sect;7.11.2, any software used to produce reported results must be verified before use. Check
    each routine against the current edition of the standard it cites before relying on it, and
    confirm every regulatory limit against the notification in force — limits change over time.
    Results are the user&rsquo;s responsibility.</p>
    </div>
    <p style="margin-top:10px;color:var(--sub);font-size:11.5px">Version 1.0</p>
  </div>
</div>
<div id="gate">
  <div class="box">
    <div class="glogo"><svg viewBox="0 0 100 100" width="56" height="56" style="vertical-align:middle" aria-hidden="true"><defs><linearGradient id="dg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12a06a"/><stop offset="1" stop-color="#0b7a53"/></linearGradient><clipPath id="dc2"><path d="M50 30C50 30 72 58 72 72a22 22 0 0 1-44 0C28 58 50 30 50 30Z"/></clipPath></defs><path d="M41 12L47 26M59 12L53 26" stroke="#0b7a53" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M50 30C50 30 72 58 72 72a22 22 0 0 1-44 0C28 58 50 30 50 30Z" fill="url(#dg2)"/><g clip-path="url(#dc2)"><ellipse cx="66" cy="82" rx="26" ry="22" fill="#e8478b" opacity="0.9"/></g><ellipse cx="43" cy="58" rx="5" ry="8" fill="#fff" opacity="0.30"/></svg></div>
    <h1 style="margin:.2em 0">Envicron</h1>
    <div class="sub" style="margin-bottom:6px">Sign in to continue · offline</div>
    <input id="gid" type="text" placeholder="Login ID" autocomplete="username">
    <input id="gpw" type="password" placeholder="Passcode" autocomplete="current-password" inputmode="numeric">
    <div class="err" id="gerr"></div>
    <button id="gbtn" type="button">Unlock</button>
  </div>
</div>
<div class="wrap">
<header>
  <h1><span class="logo" aria-hidden="true"><svg viewBox="0 0 100 100" width="26" height="26" style="vertical-align:middle" aria-hidden="true"><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12a06a"/><stop offset="1" stop-color="#0b7a53"/></linearGradient><clipPath id="dc"><path d="M50 30C50 30 72 58 72 72a22 22 0 0 1-44 0C28 58 50 30 50 30Z"/></clipPath></defs><path d="M41 12L47 26M59 12L53 26" stroke="#0b7a53" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M50 30C50 30 72 58 72 72a22 22 0 0 1-44 0C28 58 50 30 50 30Z" fill="url(#dg)"/><g clip-path="url(#dc)"><ellipse cx="66" cy="82" rx="26" ry="22" fill="#e8478b" opacity="0.9"/></g><ellipse cx="43" cy="58" rx="5" ry="8" fill="#fff" opacity="0.30"/></svg></span>Envicron</h1>
  <div class="sub">Environmental Laboratory &amp; Field Calculators (Offline) · <span id="count"></span></div>
  <div class="hactions"><button class="themebtn" id="aboutbtn" type="button">About</button><button class="themebtn" id="themebtn" type="button">◐ Theme</button></div>
</header>

<div class="controls">
  <input id="q" type="search" placeholder="Search — plume, isokinetic, TCLP, uncertainty, MDL, SO₂…" autocomplete="off">
  <div class="mtabwrap"><span class="mtabfade l" id="mtfl" style="display:none"></span><div class="mtabs" id="mtabs" role="tablist"></div><span class="mtabfade r" id="mtfr"></span></div>
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

<script>/*__JSPDF__*/</script>
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

  /* Download a text blob as a file. Reliable in a content:// WebView where
     window.print() and navigator.share are unavailable. Returns true on success. */
  function downloadFile(name, text, mime){
    try{
      var blob = new Blob([text], {type: (mime||"text/plain") + ";charset=utf-8"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
      return true;
    }catch(e){ return false; }
  }

  /* Copy without the async clipboard API (which needs a secure origin). */
  function legacyCopy(text, btn){
    try{
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly","");
      ta.style.position="fixed"; ta.style.top="-1000px";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if(btn){ btn.textContent = ok ? "Copied ✓" : "Select & copy"; setTimeout(function(){ btn.textContent="Share"; }, 1800); }
      if(!ok){ // last resort: show the text so the user can long-press copy
        var pre = document.createElement("div"); pre.className="savepanel";
        pre.textContent = text; pre.style.whiteSpace="pre-wrap"; pre.style.userSelect="text";
        if(btn && btn.parentNode && btn.parentNode.parentNode) btn.parentNode.parentNode.appendChild(pre);
      }
    }catch(e){ if(btn) btn.textContent="Share"; }
  }

  /* ---- Capacitor-aware save & share ------------------------------------
     In the packaged Android app window.Capacitor.Plugins gives us the native
     Filesystem (writes a real file the user can open) and Share (Android share
     sheet). In a plain browser we fall back to Blob download / Web Share /
     clipboard. Each path degrades to the on-screen text so nothing silently
     fails. ---------------------------------------------------------------- */
  function flash(btn,msg,back){ if(!btn) return; var o=btn.textContent; btn.textContent=msg;
    setTimeout(function(){ btn.textContent=back||o; }, 1900); }

  function isNative(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }

  /* In a no-bundler build the plugin JS is never imported, so
     window.Capacitor.Plugins.<X> is undefined even though the plugin IS compiled
     into the app. The native runtime lists compiled plugins in
     Capacitor.PluginHeaders; registerPlugin(name) reads that and builds the
     proxy. So we register on demand. Returns the plugin proxy or null. */
  function plugin(name){
    try{
      if(!window.Capacitor) return null;
      var P = window.Capacitor.Plugins || {};
      if(P[name]) return P[name];
      var hdrs = window.Capacitor.PluginHeaders;
      if(window.Capacitor.registerPlugin && hdrs && hdrs.some(function(h){return h.name===name;})){
        return window.Capacitor.registerPlugin(name);
      }
      return null;
    }catch(e){ return null; }
  }

  function showText(txt, note){
    var pre=document.createElement("div"); pre.className="savepanel";
    if(note){ var n=document.createElement("div"); n.style.color="var(--warn)"; n.style.fontSize="11.5px";
      n.style.marginBottom="6px"; n.textContent=note; pre.appendChild(n); }
    var body=document.createElement("div"); body.style.whiteSpace="pre-wrap"; body.style.userSelect="text";
    body.style.fontSize="12px"; body.textContent=txt; pre.appendChild(body);
    var host=document.querySelector(".savepanel"); if(host&&host.parentNode) host.parentNode.appendChild(pre);
  }

  /* Save: write the HTML report to a shareable location and open the Android
     share/open sheet so the user can pick "Print > Save as PDF", Drive, etc.
     Errors are SHOWN, not swallowed. */
  function saveReport(name, htmlDoc, txt, btn, say){
    say = say || function(){};
    // Diagnostic: report the environment so a silent failure becomes visible.
    var envnote = "";
    try{
      var haveCap = !!window.Capacitor;
      var nativeP = haveCap && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      var heads = haveCap && window.Capacitor.PluginHeaders ? window.Capacitor.PluginHeaders.map(function(h){return h.name;}) : [];
      envnote = "env: capacitor=" + haveCap + " native=" + !!nativeP + " plugins=[" + heads.join(",") + "]";
    }catch(e){ envnote = "env probe failed: " + e; }

    if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
      var Fs = plugin("Filesystem"), Sh = plugin("Share");
      if(!Fs){ say("File system plugin not available.\\n" + envnote + "\\nUse Email report instead.", true);
               flash(btn,"\u2013","Save as PDF"); return; }
      var fpath = name + ".html";
      say("Writing file\u2026");
      Fs.writeFile({ path: fpath, data: htmlDoc, directory: "CACHE", encoding: "utf8", recursive: true })
        .then(function(){ return Fs.getUri({ path: fpath, directory: "CACHE" }); })
        .then(function(u){
          var fileUrl = u && u.uri;
          if(Sh && fileUrl){
            return Sh.share({ title: name, files: [fileUrl], dialogTitle: "Save or share report" })
              .then(function(){ say("Shared. Choose Print \u2192 Save as PDF, or Drive."); flash(btn,"Done \u2713","Save as PDF"); });
          }
          say("Saved to app storage, but the Share plugin is missing so it cannot be opened.\\n" + envnote, true);
          flash(btn,"Saved","Save as PDF");
        })
        .catch(function(e){
          say("Save failed: " + (e && (e.message||e.errorMessage) || e) + "\\n" + envnote + "\\nTry Email report instead.", true);
          flash(btn,"\u2717","Save as PDF");
        });
      return;
    }
    // Browser (desktop preview)
    if(downloadFile(name + ".html", htmlDoc, "text/html")){
      say("Downloaded. Open it and use Print \u2192 Save as PDF.");
      flash(btn,"Downloaded \u2713","Save as PDF");
      try{ document.getElementById("record").innerHTML=htmlDoc; if(window.print) window.print(); }catch(e){}
      return;
    }
    say("Download not available here. Use Email report, or copy the text below.", true);
    showText(txt);
  }

  function shareReport(name, txt, btn){
    if(isNative()){
      var Sh = plugin("Share");
      if(Sh){ Sh.share({ title:name, text:txt, dialogTitle:"Share report" })
        .then(function(){}).catch(function(e){ showText(txt, "Share failed: "+(e&&(e.message||e)||e)+"."); }); return; }
      showText(txt, "Share is unavailable on this build. Report text below \u2014 long-press to copy.");
      return;
    }
    if(navigator.share){ navigator.share({title:name, text:txt}).catch(function(){ copyText(txt,btn); }); return; }
    copyText(txt, btn);
  }

  /* Email the report as a prefilled message. Pure mailto — no plugin, works in
     every WebView. Body is text (mailto cannot attach a file). Prefilled To. */
  function copyText(txt, btn){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ flash(btn,"Copied \u2713","Share"); },
        function(){ legacyCopy(txt,btn); });
      return;
    }
    legacyCopy(txt, btn);
  }


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

  function localStamp(){
    // Device local time (the phone's timezone, e.g. IST). Format: YYYY-MM-DD HH:MM:SS TZ.
    var d = new Date();
    function p(n){ return (n<10?"0":"")+n; }
    var s = d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "
          + p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds());
    // timezone label from the device
    var tz = "";
    try{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }catch(e){}
    var off = -d.getTimezoneOffset(); // minutes east of UTC
    var sign = off>=0?"+":"-"; off=Math.abs(off);
    var gmt = "UTC"+sign+p(Math.floor(off/60))+":"+p(off%60);
    return s + " (" + (tz?tz+", ":"") + gmt + ")";
  }
  function localDateOnly(){
    var d=new Date(); function p(n){return (n<10?"0":"")+n;}
    return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
  }
  // Turn a calculation display name into a safe file name.
  // "LOD & LOQ" -> "LOD_LOQ"; "BCF, BAF & TF" -> "BCF_BAF_TF".
  function safeName(name){
    var t = String(name||"");
    // characters illegal or awkward in file names, by char code (no escaping traps):
    // 47 / , 92 \\ , 58 : , 42 * , 63 ? , 34 " , 60 < , 62 > , 124 | , 44 , , 38 &
    var bad = [47,92,58,42,63,34,60,62,124,44,38];
    var o="";
    for(var i=0;i<t.length;i++){
      var code=t.charCodeAt(i);
      o += (bad.indexOf(code)>=0 || code<32) ? " " : t.charAt(i);
    }
    // collapse whitespace runs to a single underscore, trim
    var parts=o.split(/\\s+/).filter(function(x){return x.length;});
    return parts.join("_") || "report";
  }
  /* Build the report as a REAL PDF using jsPDF (inlined, offline). Returns a
     Blob. No native plugin involved in making the PDF — only in sharing it. */
  function pdfSafe(t){
    if(t==null) return "";
    t=String(t)
      .split("\u03c3").join("s").split("\u03bc").join("u").split("\u03b1").join("a")
      .split("\u03b2").join("b").split("\u03b3").join("g").split("\u0394").join("D")
      .split("\u00b7").join("-").split("\u2248").join("~").split("\u2264").join("<=")
      .split("\u2265").join(">=").split("\u2212").join("-").split("\u2192").join("->")
      .split("\u00b3").join("3").split("\u00b2").join("2").split("\u2013").join("-")
      .split("\u2014").join("-").split("\u201c").join('"').split("\u201d").join('"')
      .split("\u2019").join("'").split("\u2026").join("...");
    var o=""; for(var i=0;i<t.length;i++){ o += (t.charCodeAt(i) < 256 ? t.charAt(i) : "?"); }
    return o;
  }
  function makePdf(rt, lr, fname, an, lab){
    var jsPDFctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if(!jsPDFctor) return null;
    var doc = new jsPDFctor({ unit:"pt", format:"a4" });
    var M=40, W=515, y=54, LH=14;
    function line(){ doc.setDrawColor(150); doc.line(M,y,M+W,y); y+=10; }
    function wrap(txt, size, bold, indent){
      doc.setFontSize(size||10); doc.setFont("helvetica", bold?"bold":"normal");
      var x=M+(indent||0);
      var parts=doc.splitTextToSize(pdfSafe(txt), W-(indent||0));
      for(var i=0;i<parts.length;i++){ if(y>800){doc.addPage();y=54;} doc.text(parts[i], x, y); y+=LH; }
    }
    // Key/value row that NEVER overlaps: label wraps in the left column; value
    // sits in the right column; if the label is too long it drops to its own line.
    var KX=M, VX=M+230, VW=W-230;   // value column at 230pt, plenty of gap
    function kv(k,v){
      doc.setFontSize(10);
      var kw=pdfSafe(k), vw=pdfSafe(v==null?"":v);
      doc.setFont("helvetica","bold");
      var klines=doc.splitTextToSize(kw, VX-KX-10);   // label wraps within its column
      doc.setFont("helvetica","normal");
      var vlines=doc.splitTextToSize(vw, VW);
      var rows=Math.max(klines.length, vlines.length);
      var startY=y;
      for(var i=0;i<rows;i++){
        if(y>800){doc.addPage();y=54; startY=y;}
        if(klines[i]){ doc.setFont("helvetica","bold"); doc.text(klines[i], KX, y); }
        if(vlines[i]){ doc.setFont("helvetica","normal"); doc.text(vlines[i], VX, y); }
        y+=LH;
      }
    }
    // Title
    wrap(rt.name, 15, true); y+=2;
    doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(90);
    wrap("Envicron \u00b7 "+rt.id+" / "+rt.mod+" \u00b7 "+localStamp(), 9);
    doc.setTextColor(0); y+=4; line();
    // Header block
    if(lab) kv("Laboratory", lab);
    if(an)  kv("Analyst", an);
    var samp = (state[rt.id]&&state[rt.id].__sample)||"";
    if(samp) kv("Sample reference", samp);
    y+=4;
    // Inputs
    wrap("Inputs as entered", 12, true); y+=2;
    rt.inputs.forEach(function(i){
      if(kind(i)==="rows"||kind(i)==="table") return;
      var v=lr.values[key(i)]; if(v===undefined||v===""||v===null) return;
      kv("  "+i.label+(i.unit?" ("+i.unit+")":""), v);
    });
    y+=6;
    // Results
    wrap("Result", 12, true); y+=2;
    (lr.results||[]).forEach(function(r){
      if(r.label==null && r.value==null) return;
      kv("  "+(r.label||""), (r.value!=null?r.value:"")+(r.unit?" "+r.unit:""));
    });
    y+=8; line();
    doc.setFontSize(9); doc.setTextColor(70);
    wrap("A calculation aid, not a validated method. ISO/IEC 17025 \u00a77.11.2 applies: verify before use. "
       + "A personal project \u2014 not a product of, and not endorsed by, any organisation or employer. "
       + "Verdicts are against limits or criteria selected or entered by the user.", 9);
    doc.setTextColor(0); y+=16;
    wrap("Calculated by ______________    Checked by ______________    Date __________", 10);
    return doc.output("blob");
  }


  function reportText(rt, lr, fname, an, lab){
    var L = [];
    L.push((fname||rt.name));
    L.push(rt.name + "  [" + rt.id + " / " + rt.mod + "]");
    L.push("Envicron " + BUILD + " · " + localStamp());
    if(lab) L.push("Laboratory: " + lab);
    if(an)  L.push("Analyst: " + an);
    var samp = state[rt.id].__sample || "";
    if(samp) L.push("Sample: " + samp);
    L.push("");
    L.push("INPUTS");
    rt.inputs.forEach(function(i){
      if(kind(i)==="rows"||kind(i)==="table") return;
      var v = lr.values[key(i)];
      if(v===undefined||v===""||v===null) return;
      L.push("  " + i.label + (i.unit?" ("+i.unit+")":"") + ": " + v);
    });
    L.push("");
    L.push("RESULTS");
    (lr.results||[]).forEach(function(r){
      if(r.label==null && r.value==null) return;
      var line = "  " + (r.label||"") + ": " + (r.value!=null?r.value:"") + (r.unit?" "+r.unit:"");
      L.push(line.replace(/\\s+$/,""));
    });
    L.push("");
    L.push("A calculation aid, not a validated method (ISO/IEC 17025 §7.11.2). Verify against the cited standard.");
    return L.join("\\n");
  }

  function buildRecord(rt, values, rws, results){
    var h = [], lab = LS.get("aq.lab")||"", an = LS.get("aq.analyst")||"";
    var samp = state[rt.id].__sample || "";
    h.push("<h2>"+esc(rt.name)+"</h2>");
    h.push('<div class="meta">'+esc(rt.sub)+"<br>Envicron " + BUILD + " · routine <b>"+esc(rt.id)+
           "</b> · module "+esc(rt.mod)+" · tier "+esc(rt.tier)+" · generated "+
           esc(localStamp())+"</div>");
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
      var rec = el("button","sec","Save / Share"); rec.disabled = true;
      var rst = el("button","sec","Reset");
      bar.appendChild(go); bar.appendChild(rec); bar.appendChild(rst);
      body.appendChild(bar); body.appendChild(out);

      rst.addEventListener("click", function(){
        // clear inputs, row tables, results and any open save panel
        Object.keys(state[rt.id]).forEach(function(k){
          if(k.indexOf("__")!==0) state[rt.id][k]="";
        });
        rowState[rt.id] = [];
        lastRun[rt.id] = null;
        out.innerHTML = "";
        rec.disabled = true;
        var sp = body.querySelector(".savepanel"); if(sp) sp.parentNode.removeChild(sp);
        // reset visible field widgets
        body.querySelectorAll("input,select,textarea").forEach(function(el2){
          if(el2.type==="button") return;
          if(el2.tagName==="SELECT"){ el2.selectedIndex=0; }
          else el2.value="";
        });
        // rebuild any dynamic row tables
        var evt = new Event("aliquot:reset"); body.dispatchEvent(evt);
      });

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
        // toggle a single inline tile: file name + analyst + lab together
        var existing = body.querySelector(".savepanel");
        if(existing){ existing.parentNode.removeChild(existing); return; }
        var sp = el("div","savepanel");
        sp.appendChild(el("label",null,"Report details, kept on this device"));
        var grid = el("div","saverow");
        var fn = el("input"); fn.type="text"; fn.placeholder="File name";
        fn.value = safeName(rt.name) + "-" + localDateOnly();
        var an = el("input"); an.type="text"; an.placeholder="Analyst name";
        an.value = LS.get("aq.analyst") || "";
        var lb = el("input"); lb.type="text"; lb.placeholder="Laboratory"; lb.className="full";
        lb.value = LS.get("aq.lab") || "";
        grid.appendChild(fn); grid.appendChild(an); grid.appendChild(lb);
        sp.appendChild(grid);
        var srow = el("div","btnrow");
        var pdf = el("button",null,"Save as PDF");
        var shr = el("button","sec","Share");
        srow.appendChild(pdf); srow.appendChild(shr);
        sp.appendChild(srow);
        var status = el("div"); status.style.fontSize="11.5px"; status.style.marginTop="6px";
        status.style.color="var(--sub)"; status.style.whiteSpace="pre-line";
        sp.appendChild(status);
        function setStatus(msg, bad){ status.textContent = msg; status.style.color = bad ? "var(--bad)" : "var(--sub)"; }
        out.parentNode.insertBefore(sp, out);

        function persist(){
                    LS.set("aq.analyst", an.value||"");
          LS.set("aq.lab", lb.value||"");
        }
        pdf.addEventListener("click", function(){
          persist();
          var blob;
          try{ blob = makePdf(rt, lr, fn.value, an.value, lb.value); }
          catch(e){ setStatus("PDF build failed: "+(e&&e.message||e), true); return; }
          if(!blob){ setStatus("PDF engine not loaded.", true); return; }
          var fname = (fn.value || safeName(rt.name)) + ".pdf";

          if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
            var Fs = plugin("Filesystem"), Sh = plugin("Share");
            if(!Fs || !Sh){ setStatus("File/Share plugin missing in this build.", true); return; }
            setStatus("Preparing PDF\u2026");
            var reader = new FileReader();
            reader.onloadend = function(){
              var b64 = String(reader.result).split(",")[1];  // strip data: prefix
              Fs.writeFile({ path: fname, data: b64, directory: "CACHE" })
                .then(function(){ return Fs.getUri({ path: fname, directory: "CACHE" }); })
                .then(function(u){
                  return Sh.share({ title: fname, files: [u.uri], dialogTitle: "Save as PDF or share" });
                })
                .then(function(){ setStatus("Choose \u201cSave to Files\u201d for a PDF, or share."); flash(pdf,"\u2713","Save as PDF"); })
                .catch(function(e){ setStatus("Save failed: "+(e&&(e.message||e)||e), true); });
            };
            reader.onerror = function(){ setStatus("Could not read the generated PDF.", true); };
            reader.readAsDataURL(blob);
            return;
          }

          // Browser: download the real .pdf
          try{
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a"); a.href=url; a.download=fname;
            document.body.appendChild(a); a.click();
            setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
            setStatus("PDF downloaded."); flash(pdf,"\u2713","Save as PDF");
          }catch(e){ setStatus("Download failed: "+(e&&e.message||e), true); }
        });
        shr.addEventListener("click", function(){
          persist();
          var txt = reportText(rt, lr, fn.value, an.value, lb.value);
          shareReport((fn.value||rt.name), txt, shr);
        });
      });
    }
    return c;
  }

  /* ---- list -------------------------------------------------------------- */
  var list = document.getElementById("list");
  var tabs = document.getElementById("tabs");
  var qbox = document.getElementById("q");
  var tier = "all";
  /* ---- 7 matrix pages (module -> matrix) ------------------------------- */
  var MATRIX = [
    {id:"all",   name:"All"},
    {id:"qaqc",  name:"QA / QC",         mods:["qc","conv","sol"]},
    {id:"water", name:"Water",           mods:["water","plant"]},
    {id:"air",   name:"Air",             mods:["air","disp"]},
    {id:"stack", name:"Source Emission", mods:["stack"]},
    {id:"waste", name:"Waste & Fuel",    mods:["hw","fuel"]},
    {id:"soil",  name:"Soil & Plant",    mods:["phyto"]},
    {id:"noise", name:"Noise",           mods:["noise"]}
  ];
  var curMatrix = "all";
  function inMatrix(rt){
    if(curMatrix==="all") return true;
    var mx = MATRIX.filter(function(x){return x.id===curMatrix;})[0];
    return mx && mx.mods && mx.mods.indexOf(rt.mod) >= 0;
  }

  document.getElementById("count").textContent = ROUTINES.length + " Calculations · 7 Modules";

  function matches(rt){
    if(!inMatrix(rt)) return false;
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

  var mtabs = document.getElementById("mtabs");
  MATRIX.forEach(function(t){
    var b = el("div","mtab", t.name);
    b.setAttribute("role","tab");
    b.setAttribute("aria-selected", t.id === curMatrix ? "true":"false");
    b.addEventListener("click", function(){
      curMatrix = t.id;
      Array.prototype.forEach.call(mtabs.children, function(x){ x.setAttribute("aria-selected","false"); });
      b.setAttribute("aria-selected","true");
      draw();
    });
    mtabs.appendChild(b);
  });
  (function(){
    var mt=document.getElementById("mtabs"), l=document.getElementById("mtfl"), r=document.getElementById("mtfr");
    if(!mt) return;
    function upd(){
      if(l) l.style.display = mt.scrollLeft > 4 ? "block":"none";
      if(r) r.style.display = (mt.scrollWidth - mt.clientWidth - mt.scrollLeft) > 4 ? "block":"none";
    }
    mt.addEventListener("scroll", upd); window.addEventListener("resize", upd); setTimeout(upd,60);
  })();
  qbox.addEventListener("input", draw);

  draw();

  if(!LS.persistent){
    var n = document.querySelector(".note");
    n.insertBefore(document.createTextNode(
      "This file was opened from an address that does not allow local storage, so the laboratory and analyst names will not survive a restart. Everything else works normally. "), n.firstChild);
  }

  /* ---- theme toggle (light default, dark optional) --------------------- */
  (function(){
    var saved = LS.get("env.theme");
    if(saved === "dark") document.documentElement.setAttribute("data-theme","dark");
    var ab = document.getElementById("aboutbtn"), am = document.getElementById("about"),
        ax = document.getElementById("aboutx");
    if(ab && am){ ab.addEventListener("click", function(){ am.classList.add("open"); }); }
    if(ax && am){ ax.addEventListener("click", function(){ am.classList.remove("open"); }); }
    if(am){ am.addEventListener("click", function(e){ if(e.target===am) am.classList.remove("open"); }); }
    var tb = document.getElementById("themebtn");
    if(tb) tb.addEventListener("click", function(){
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      if(dark){ document.documentElement.removeAttribute("data-theme"); LS.set("env.theme","light"); }
      else { document.documentElement.setAttribute("data-theme","dark"); LS.set("env.theme","dark"); }
    });
  })();

  /* ---- first-login gate (fully offline) -------------------------------- */
  (function(){
    var ID = "Envicron", PW = "1234";
    var gate = document.getElementById("gate");
    if(!gate) return;
    // If already unlocked this install, skip.
    if(LS.get("env.auth") === "1"){ gate.style.display="none"; return; }
    var gid=document.getElementById("gid"), gpw=document.getElementById("gpw"),
        gerr=document.getElementById("gerr"), gbtn=document.getElementById("gbtn");
    function tryUnlock(){
      if((gid.value||"").trim() === ID && (gpw.value||"") === PW){
        LS.set("env.auth","1"); gate.style.display="none";
      } else {
        gerr.textContent = "Incorrect login ID or passcode.";
      }
    }
    gbtn.addEventListener("click", tryUnlock);
    gpw.addEventListener("keydown", function(e){ if(e.key==="Enter") tryUnlock(); });
    gid.focus();
  })();

})();
</script>
</body>
</html>
`;

const htmlFinal = html.replace("/*__JSPDF__*/", JSPDF);

writeFileSync(join(root, "aliquot.html"), htmlFinal, "utf8");
console.log(`  wrote aliquot.html  ${(htmlFinal.length / 1024).toFixed(1)} KB`);

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
