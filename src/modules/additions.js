/* =============================================================================
   Aliquot — src/modules/additions.js
   The addition pack, from `claude/lab-calculator-additions.jsx`.

   Nine routines:
     fuel   cv     Calorific Value
     fuel   bomb   Bomb Calorimeter GCV
     fuel   prox   Proximate & Ultimate Basis
     fuel   air0   Combustion Air & Flue Gas
     fuel   bio    Biomass Energy & Methane Potential
     fuel   lfg    Landfill Gas Generation
     fuel   rdf    RDF / SRF Classification
     hw     csite  Contaminated Site Classification
     hw     csfund Site Assessment & Remediation Funding

   Converted to a DOM-free module: the React PickField component, the CSS block
   and the merge instructions at the foot of the pack are discarded; the
   reference data, helpers and the calculator objects are kept.

   Every `ref:` string is carried across CHARACTER FOR CHARACTER. Every
   regulatory number in CS2025 is carried as printed. Do not reword or
   "correct" either when refactoring — they are the load-bearing part.

   No imports. Each module is compiled into its own IIFE by scripts/build-html.mjs,
   so the local copies of num / fmt / parsePairs / N / S below are correct and
   safe — they cannot collide with base.js.

   DEFECTS FIXED DURING THE CONVERSION (pack behaviour changed on purpose)

     D1  lfg — `v.gwp.startsWith("25")` threw a TypeError on a partly filled
         form, because an untouched select is undefined. Guarded with
         String(v.gwp || "").
     D2  air0 — `num(v.oref) ?? 11` was dead code: num() returns NaN, never
         null or undefined, so the 11 % default never applied and a blank
         reference-O₂ field produced NaN silently. Replaced with an explicit
         isFinite test. Same defect in lfg on `num(v.mcf) ?? 1`.
     D3  Selects read without a fallback (cv.corr, cv.basis, prox.to, csite.use,
         csfund.resp, csfund.confirm) printed "undefined" into labels and hints,
         and csfund silently took the orphan-site branch, when the form was only
         partly filled. Each now falls back to its own declared default.
     D4  `|| default` on numeric fields where zero is a legitimate entry
         (cv.lam, bio.ch4pct, bio.eff, lfg.docf, lfg.f) silently substituted the
         default for a deliberate zero. Replaced with isFinite tests.
     D5  csite — the pack used a bespoke input type "pick" served by a React
         component that does not exist in this tree; scripts/build-html.mjs has
         no "pick" branch and would have rendered the 189-substance Schedule I
         lookup as a number box. Changed to a plain select on the same id, which
         the renderer already supports and which still yields "" — and therefore
         the existing refusal row — when nothing is chosen.
     D6  prox — the "from" select was declared and never read, so the stated
         basis of the entry vanished. It now labels the conversion factor. The
         arithmetic is unchanged: the entered moisture already carries the basis.

   The pack's ⑥ correction to the existing `isokinetic` routine is already
   applied in base.js (line ~1264) and is not repeated here.
   ============================================================================= */

/* ---------- helpers ------------------------------------------------------- */

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : NaN; };

const fmt = (v, sig = 4) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a < 1e-4 || a >= 1e7) return v.toExponential(3).replace("e", " × 10^");
  return Number(v.toPrecision(sig)).toLocaleString("en-IN", { maximumFractionDigits: 10 });
};

const parsePairs = (t) =>
  String(t || "").split(/\n/).map((l) => l.split(/[\s,;\t]+/).map(parseFloat))
    .filter((p) => p.length >= 2 && isFinite(p[0]) && isFinite(p[1]))
    .map((p) => ({ x: p[0], y: p[1] }));

/* Read a numeric field that has a non-zero default. num() returns NaN for a
   blank field, so the test must be isFinite — `?? d` never fires and `|| d`
   swallows a deliberate zero. */
const numOr = (v, d) => { const n = num(v); return isFinite(n) ? n : d; };

/* ---------- input builders ------------------------------------------------ */

const N = (id, label, unit, def, hint) => ({ id, label, unit, def, hint, type: "num" });
const S = (id, label, opts, def) => ({ id, label, opts, def, type: "sel" });

/* ---------- reference data ------------------------------------------------ */

/* ─────────────────────────────────────────────────────────────────────────
   Environment Protection (Management of Contaminated Sites) Rules, 2025
   S.O. 3401(E), MoEFCC, 24 July 2025 — Schedule I [see rules 3(1)(e),(o),(q)]
   "Response and Screening Levels of Hazardous Substances"

   Row = [ name, group, RL, SL_agri, SL_resi, SL_comm, SL_indl, GW, SW, meta? ]
     RL, SL_*  soil / sediment, mg/kg          (col 4–8 of the gazette table)
     GW        ground water screening, mg/L    (col 9)
     SW        surface water screening, µg/L   (col 10)
     null      "-" in the gazette — no level notified for that medium
     string    non-numeric criterion, reproduced verbatim (pH band, dS/m,
               ng TEQ/kg, Hazen units, NTU, bacteriological)
   Transcribed verbatim from the English text of the notification. Verify
   against the gazette before using any value in a statutory report.
   ───────────────────────────────────────────────────────────────────────── */
const CS2025 = [
["1,1,1-Trichloroethane (TCA)","Halogenated aliphatic compounds",50,0.1,5,50,50,null,null],
["1,1,2,2-Tetrachloroethene (PCE)","Halogenated aliphatic compounds",8.8,0.1,0.2,0.5,0.6,0.03,110],
["1,1,2,2-Tetrachlorethane","Halogenated aliphatic compounds",50,0.1,5,50,50,null,null],
["1,1,2-Trichloroethane","Halogenated aliphatic compounds",50,0.1,5,50,50,null,null],
["1,1,2-Trichloroethene (TCE)","Halogenated aliphatic compounds",2.5,0.01,0.01,0.01,0.01,0.005,21],
["1,1-Dichloroethane","Halogenated aliphatic compounds",50,0.1,5,50,50,null,null],
["1,1-Dichloroethene","Halogenated aliphatic compounds",50,0.1,5,50,50,0.014,null],
["1,2,3,4-Tetrachlorobenzene","Halogenated aromatic compounds",10,0.05,2,10,10,null,1.8],
["1,2,3,5-Tetrachlorobenzene","Halogenated aromatic compounds",10,0.05,2,10,10,null,null],
["1,2,3-Trichlorobenzene","Halogenated aromatic compounds",11,0.05,2,10,10,null,8],
["1,2,4,5-Tetrachlorobenzene","Halogenated aromatic compounds",10,0.05,2,10,10,null,null],
["1,2,4-Trichlorobenzene","Halogenated aromatic compounds",11,0.05,2,10,10,null,24],
["1,2-Dichlorobenzene","Halogenated aromatic compounds",19,0.1,1,10,10,0.005,0.7],
["1,2-Dichloroethane","Halogenated aliphatic compounds",50,0.1,5,50,50,0.005,100],
["1,2-Dichloroethene","Halogenated aliphatic compounds",50,0.1,5,50,50,0.05,null],
["1,2-Dichloropropane","Halogenated aliphatic compounds",50,0.1,5,50,50,null,null],
["1,2-Dichloropropene (cis and trans)","Halogenated aliphatic compounds",50,0.1,5,50,50,null,null],
["1,3,5-Trichlorobenzene","Halogenated aromatic compounds",11,0.05,2,10,10,null,null],
["1,3-Dichlorobenzene","Halogenated aromatic compounds",19,0.1,1,10,10,null,150],
["1,4-Dichlorobenzene","Halogenated aromatic compounds",19,0.1,1,10,10,0.005,26],
["1,4-Dioxane","Heterocyclic organic compound",null,null,null,null,null,0.05,null],
["2,3,4,6-Tetrachlorophenol","Halogenated aromatic compounds",21,0.05,0.5,5,5,0.1,null],
["2,4,6-Trichlorophenol","Halogenated aromatic compounds",22,0.05,0.5,5,5,0.005,null],
["2,4-Dichlorophenol","Halogenated aromatic compounds",5,0.05,0.5,5,5,0.9,null],
["2,4-Dichlorophenoxyacetic acid (2,4-D)","Pesticides (Phenoxy herbicide)",null,null,null,null,null,0.1,null],
["3-Iodo-2-propynyl butyl carbamate","Pesticides, Carbamate",null,null,null,null,null,null,1.9],
["Acenaphthene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,5.8],
["Acenaphthylene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,null],
["Acridine","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,4.4],
["Aldicarb","Pesticides, Carbamate",null,null,null,null,null,0.009,1],
["Aldrin","Pesticides, Organochlorine",0.32,null,null,null,null,0.0007,0.004],
["Aliphatics non chlorinated (each)","Non-halogenated aliphatic compounds",0.3,0.3,null,null,null,null,null],
["Aluminium","Metal",null,null,null,null,null,2.9,null],
["Ammonia (total)","Inorganic",null,null,null,null,null,0.5,null],
["Ammonia (un-ionized)","Inorganic",null,null,null,null,null,null,19],
["Aniline","Organic",null,null,null,null,null,null,2.2],
["Anthracene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,0.012],
["Antimony (metallic)","Inorganic",40,20,20,40,40,0.006,null],
["Arsenic","Metal",76,12,12,12,12,0.01,5],
["Asbestos","—",100,null,null,null,null,null,null,{note:"Schedule I gives a response level of 100 with no unit stated and no screening levels — confirm the unit basis before use."}],
["Atrazine","Pesticides, Triazine",0.71,null,null,null,null,0.005,1.8],
["Barium","Inorganic",2000,750,500,2000,2000,2,null],
["Benzene","Monocyclic aromatic compounds",5,0.05,0.5,5,5,0.005,370],
["Benzo(a)anthracene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,0.018],
["Benzo(a)pyrene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,0.00004,0.015],
["Benzo(b)fluoranthene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,null],
["Benzo(k)fluoranthene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,null],
["Beryllium","Inorganic",8,4,4,8,8,null,null],
["Boron","Inorganic",2,2,null,null,null,5,0.0015],
["Bromacil","Pesticides",null,null,null,null,null,null,5],
["Bromoxynil","Pesticides, Benzonitrile",null,null,null,null,null,0.03,5],
["Cadmium","Metal",22,1.4,10,22,22,0.007,null],
["Calcium","Inorganic",null,null,null,null,null,75,null],
["Captan","Pesticides",null,null,null,null,null,null,1.3],
["Carbaryl","Pesticides, Carbamate",0.45,null,null,null,null,null,0.2],
["Carbofuran","Pesticides, Carbamate",0.017,null,null,null,null,0.09,1.8],
["Chlordane","Pesticides, Organochlorine",4,null,null,null,null,0.0002,0.006],
["Chloride","Inorganic",null,null,null,null,null,250,120000],
["Chlorothalonil","Pesticides",null,null,null,null,null,null,0.18],
["Chlorpyrifos","Pesticides, Organophosphorus",null,null,null,null,null,0.09,0.002],
["Chromium (total)","Metal",87,64,64,87,87,0.05,null],
["Chromium, hexavalent (Cr(VI))","Metal",78,0.4,0.4,1.4,1.4,null,1],
["Chromium, trivalent (Cr(III))","Metal",180,null,null,null,null,null,8.9],
["Chrysene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,null],
["Cobalt","Inorganic",300,40,50,300,300,null,null],
["Coliforms, fecal (Escherichia coli)","Biological",null,null,null,null,null,"Shall not be detectable in any 100 ml sample",null],
["Coliforms, total","Biological",null,null,null,null,null,null,null],
["Colour","Physical",null,null,null,null,null,"5 Hazen Units (IS)",null],
["Conductivity","Physical","4 dS/m","2 dS/m","2 dS/m","4 dS/m","4 dS/m",null,null,{u:"dS/m"}],
["Copper","Metal",190,63,63,91,91,2,null],
["Cyanazine","Pesticides, Triazine",null,null,null,null,null,0.01,2],
["Cyanide","Inorganic",50,0.9,0.9,8,8,0.2,5],
["Cyanobacterial Toxins","Biological",null,null,null,null,null,0.0015,null],
["DDD (Dichlorodiphenyldichloroethane)","Pesticides, Organochlorine",34,null,null,null,null,null,null],
["DDE (Dichlorodiphenylethylene)","Pesticides, Organochlorine",2.3,null,null,null,null,null,null],
["DDT (Dichlorodiphenyltrichloroethane)","Pesticides, Organochlorine",1.7,null,null,null,null,1,null],
["DDT Total","Pesticides, Organochlorine",12,0.7,0.7,12,12,null,0.001],
["Deltamethrin","Pesticides",null,null,null,null,null,null,0.0004],
["Di(2-ethylhexyl) phthalate","Phthalate esters",null,null,null,null,null,null,16],
["Dibenz(a,h)anthracene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,null],
["Dibromochloromethane","Halogenated methanes",null,null,null,null,null,0.1,null],
["Dicamba","Pesticides, Aromatic Carboxylic Acid",null,null,null,null,null,0.11,10],
["Dichlorobromomethane","Halogenated methanes",null,null,null,null,null,null,null],
["Dichloromethane (Methylene chloride)","Halogenated aliphatic compounds",50,0.1,5,50,50,0.05,98.1],
["Dichlorophenols","Chlorinated phenols",22,0.05,0.5,5,5,0.9,0.2],
["Diclofop-methyl","Pesticides",null,null,null,null,null,null,6.1],
["Didecyldimethylammonium chloride","Pesticides",null,null,null,null,null,null,1.5],
["Diisopropanolamine","Organic",180,180,180,180,180,null,1600],
["Dimethoate","Pesticides, Organophosphorus",null,null,null,null,null,0.02,6.2],
["Di-n-butyl phthalate","Phthalate esters",null,null,null,null,null,null,19],
["Dinoseb","Pesticides",null,null,null,null,null,0.01,0.05],
["Endosulfan","Pesticides, Organochlorine",4,null,null,null,null,0.4,0.003],
["Endrin","Pesticides, Organochlorine",null,null,null,null,null,0.0006,0.0023],
["Ethylbenzene","Monocyclic aromatic compounds",110,0.1,5,50,50,0.14,90],
["Ethylene glycol","Glycols",960,960,960,960,960,null,192000],
["Exchangeable Sodium Percentage (ESP)","—",15,10,null,null,null,null,null,{u:"%"}],
["Fluoranthene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,0.04],
["Fluorene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,3],
["Fluoride","Inorganic",2000,200,400,2000,2000,1.5,120],
["Glyphosate","Pesticides, Organophosphorus",null,null,null,null,null,0.28,800],
["Heptachlor","Pesticides, Organochlorine",4,null,null,null,null,null,0.01],
["Hexachlorobenzene","Halogenated aromatic compounds",10,0.05,2,10,10,null,null],
["Hexachlorobutadiene","Halogenated aliphatic compounds",null,null,null,null,null,0.0006,1.3],
["Hexachlorocyclohexane (alfa HCH)","Pesticides, Organochlorine",17,17,17,17,17,0.01,null],
["Hexachlorocyclohexane (delta HCH)","Pesticides, Organochlorine",null,null,null,null,null,0.04,null],
["Hexachlorocyclohexane (HCH)","Pesticides, Organochlorine",0.01,0.01,null,null,null,null,0.01],
["Hexachlorocyclohexane (beta HCH)","Pesticides, Organochlorine",1.6,null,null,null,null,0.04,null],
["Imidacloprid","Pesticides",null,null,null,null,null,0.23,null],
["Indeno(1,2,3-c,d)pyrene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,null],
["Iron","Inorganic",null,null,null,null,null,0.3,300],
["Lead","Metal",600,70,140,260,600,0.005,null],
["Lindane (gamma HCH)","Pesticides, Organochlorine",1.2,null,null,null,null,0.002,null],
["Linuron","Pesticides",null,null,null,null,null,null,7],
["Lithium","Inorganic",null,null,null,null,null,null,null],
["Magnesium","Inorganic",null,null,null,null,null,30,null],
["Malathion","Pesticides, Organophosphorus",null,null,null,null,null,0.29,null],
["Manganese","Inorganic",null,null,null,null,null,0.12,null],
["MCPA (Methylchlorophenoxyacetic acid)","Pesticides",4,null,null,null,null,0.1,2.6],
["Mercury (inorganic)","Metal",50,6.6,6.6,24,50,0.001,0.026],
["Methoprene","—",null,null,null,null,null,1,null],
["Methylmercury","Organic",4,null,null,null,null,null,0.004],
["Methyl tertiary-butyl ether (MTBE)","Aliphatic ether",null,null,null,null,null,null,10000],
["Metolachlor","Pesticides, Organophosphorus",null,null,null,null,null,0.05,7.8],
["Metribuzin","Pesticides, Triazine",null,null,null,null,null,0.08,1],
["Molybdenum","Inorganic",190,5,10,40,40,0.07,73],
["Monochlorobenzene","Halogenated aromatic compounds",15,0.1,1,10,10,0.08,1.3],
["Monochlorophenols","Chlorinated phenols",5.4,0.05,0.5,5,5,null,7],
["Naphthalene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,1.1],
["n-hexane","Aliphatic hydrocarbon",21,6.5,6.5,21,21,null,null],
["Nickel","Metal",100,45,45,50,89,0.02,null],
["Nitrate","Inorganic nitrogen compounds",null,null,null,null,null,45,"13 mg/L",{note:"The surface-water column is in µg/L throughout Schedule I, but nitrate is printed as 13 mg/L. Reproduced as printed."}],
["Nitrite","Inorganic nitrogen compounds",null,null,null,null,null,null,60],
["Nonylphenol and its ethoxylates","Nonylphenol and its ethoxylates",14,5.7,5.7,14,14,null,1],
["PCBs (Polychlorinated biphenyls)","Polychlorinated biphenyls",33,0.5,1.3,33,33,null,0.001],
["Pentachlorobenzene","Halogenated aromatic compounds",10,0.05,2,10,10,null,6],
["Pentachlorophenol","Halogenated aromatic compounds",12,7.6,7.6,7.6,7.6,0.06,0.5],
["Permethrin","Pesticides, Organochlorine compounds",null,null,null,null,null,null,0.004],
["pH","Inorganic acidity, alkalinity and pH","6 to 8","6 to 8","6 to 8","6 to 8","6 to 8","6.5-8.5","6.5 to 9.0",{u:"pH units"}],
["Phenanthrene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,0.4],
["Phenolic compounds (as C6H5OH)","Phenolic compounds",14,0.1,1,10,10,0.001,null],
["Phenols (mono- & dihydric)","Aromatic hydroxyl compounds",3.8,3.6,3.8,3.8,3.8,null,4],
["Phenoxy herbicides","Pesticides",null,null,null,null,null,null,4],
["Phthalic acid esters (each)","Phthalate esters",30,30,null,null,null,null,null],
["Picloram","Pesticides",null,null,null,null,null,null,29],
["Poly chlorinated dibenzo-p-dioxins / dibenzofurans","Polychlorinated dioxins and furans","4 ng TEQ/kg","4 ng TEQ/kg","4 ng TEQ/kg","4 ng TEQ/kg","4 ng TEQ/kg",null,null,{u:"ng TEQ/kg"}],
["Polycyclic Hydrocarbon (PAH)","Polycyclic aromatic hydrocarbons (PAH)",40,null,null,null,null,0.0001,null],
["Propylene glycol","Glycols",null,null,null,null,null,null,500000],
["Pyrene","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,0.025],
["Quinoline","Polycyclic aromatic hydrocarbons (PAH)",10,0.1,1,10,10,null,3.4],
["Reactive Chlorine Species","Inorganic reactive chlorine compounds",null,null,null,null,null,null,0.5],
["Selenium","Inorganic",2.9,1,1,2.9,2.9,0.05,1],
["Silver","Inorganic",40,20,20,40,40,0.1,0.1,{note:"Surface-water value printed as '0,1' in the gazette; read as 0.1 µg/L."}],
["Simazine","Pesticides, Triazine",null,null,null,null,null,0.01,10],
["Sodium","Inorganic",null,null,null,null,null,50,null],
["Sodium adsorption ratio (SAR)","—",12,5,5,12,12,null,null,{u:"—"}],
["Styrene","Monocyclic aromatic compounds",86,0.1,5,50,50,0.02,72,{note:"Ground-water level printed as '0.02 (C)'; the (C) marker is not defined in Schedule I."}],
["Sulfolane","Organic sulphur compound",0.8,0.8,0.8,0.8,0.8,null,50000],
["Sulphate","Inorganic sulphur compounds",null,null,null,null,null,200,null],
["Sulphur (elemental)","Inorganic sulphur compounds",500,500,null,null,null,null,null],
["Tebuthiuron","Pesticides",null,null,null,null,null,null,1.6],
["Tetrachloromethane","Halogenated aliphatic compounds",50,0.1,5,50,50,null,13.3],
["Tetrachlorophenols","Halogenated aromatic compounds",21,0.05,0.5,5,5,0.1,1],
["Thallium","Inorganic",1,1,1,1,1,null,0.8],
["Thiophene","Miscellaneous organic compound",0.1,0.1,null,null,null,null,null],
["Tin (inorganic)","Inorganic",300,5,50,300,300,null,null],
["Toluene","Monocyclic aromatic compounds",32,0.1,3,30,30,0.06,2],
["Total dissolved solids (TDS)","Solids",null,null,null,null,null,500,null],
["Total hydrocarbons (TPH) (mineral oil)","Aromatic Hydrocarbons",5000,null,null,null,null,0.01,null],
["Toxaphene","Pesticides, Organochlorine",null,null,null,null,null,null,0.008],
["Triallate","Pesticides, Carbamate",null,null,null,null,null,null,0.24],
["Tribromomethane","Halogenated aliphatic compounds",75,null,null,null,null,null,null],
["Tributyltin","Organotin compounds",null,null,null,null,null,null,0.008],
["Trichlorfon","—",null,null,null,null,null,null,0.009],
["Trichloromethane (chloroform)","Halogenated aliphatic compounds",50,0.1,5,50,50,0.3,1.8],
["Trichlorophenols","Halogenated aromatic compounds",22,0.05,0.5,5,5,0.005,18],
["Tricyclohexyltin","Organotin compounds",null,null,null,null,null,null,null],
["Trifluralin","Pesticides, Dinitroaniline",null,null,null,null,null,0.02,0.2],
["Triphenyltin","Organotin compounds",null,null,null,null,null,null,0.022],
["Turbidity","Solids, total particulate matter",null,null,null,null,null,"0.1-1.0 NTU",null],
["Uranium","Inorganic",300,23,23,33,300,0.02,15],
["Vanadium","Inorganic",130,130,130,130,130,null,null],
["Vinyl chloride","Halogenated aliphatic compounds",0.1,null,null,null,null,0.002,null],
["Xylene","Monocyclic aromatic compounds",17,2.4,2.4,2.4,2.4,0.09,null],
["Zinc","Metal",720,250,250,360,410,5,30],
["HFPO-DA (Gen X Chemicals)","Organofluorine compounds",null,null,null,null,null,0.000004,null],
["PFHxS","Organofluorine compounds",null,null,null,null,null,0.000001,null],
["PFNA","Organofluorine compounds",null,null,null,null,null,0.000001,null],
["PFOA","Organofluorine compounds",null,null,null,null,null,0.000001,null],
["PFOS","Organofluorine compounds",null,null,null,null,null,null,1,{note:"The single value '1' printed for PFOS sits ambiguously between the ground-water and surface-water columns in the gazette. Taken here as 1 µg/L surface water — VERIFY against the printed table before reporting."}],
];

/* Column index in a CS2025 row for each land use — rule 3(1)(i) */
const CS_LANDUSE = { "Agricultural": 3, "Residential": 4, "Commercial": 5, "Industrial": 6 };

/* Rule 8(2) — sharing of assessment and remediation funds, Centre : State */
const CS_FUND = {
  "North Eastern and Himalayan States": [90, 10],
  "Other States": [60, 40],
  "Union Territory": [100, 0],
};

/* ─── Fuel and bioenergy constants ─────────────────────────────────────── */
const KCAL_MJ = 4.1868e-3;          /* 1 kcal = 4.1868 kJ → MJ per kcal      */
const AIR_O2_MASS = 0.232;          /* mass fraction O₂ in dry air           */
const AIR_RHO_N = 1.293;            /* kg/Nm³ dry air at 0 °C, 101.325 kPa   */
const CH4_LHV = 35.8;               /* MJ/Nm³ net, 0 °C 101.325 kPa          */
const CH4_HHV = 39.8;               /* MJ/Nm³ gross                          */
const CH4_RHO = 0.7168;             /* kg/m³ at 0 °C, 101.325 kPa            */
const MOLAR_VOL = 22.414;           /* Nm³/kmol at 0 °C, 101.325 kPa         */

/* EN ISO 21640:2021 (ex EN 15359:2011) — solid recovered fuel classification.
   NCV as received, MJ/kg (mean); Cl dry, % (mean); Hg as received, mg/MJ
   (median and 80th percentile). Class 1 is the cleanest.                    */
const SRF = {
  ncv: [25, 20, 15, 10, 3],
  cl:  [0.2, 0.6, 1.0, 1.5, 3.0],
  hgMed: [0.02, 0.03, 0.08, 0.15, 0.50],
  hg80:  [0.04, 0.06, 0.16, 0.30, 1.00],
};

/* Landfill gas — USEPA LandGEM v3.02 defaults and IPCC 2006 Vol.5 Ch.3 */
const LFG_PRESETS = {
  "LandGEM CAA default (k 0.05, L₀ 170)": { k: 0.05, l0: 170 },
  "LandGEM arid (< 635 mm rain) (k 0.02, L₀ 170)": { k: 0.02, l0: 170 },
  "LandGEM inventory conventional (k 0.04, L₀ 100)": { k: 0.04, l0: 100 },
  "Enter k and L₀ myself": { k: null, l0: null },
};

/* ---------- pack helpers -------------------------------------------------- */

/* Parse a Schedule I cell into a comparable criterion.
   number → {kind:"num"}   "6 to 8" / "6.5-8.5" → {kind:"band"}
   "4 dS/m" → {kind:"num", unit:"dS/m"}   free text → {kind:"text"}   null → none */
const csLevel = (v) => {
  if (v === null || v === undefined || v === "") return { kind: "none" };
  if (typeof v === "number") return { kind: "num", n: v };
  const s = String(v).trim();
  const band = s.match(/^([\d.]+)\s*(?:–|-|to)\s*([\d.]+)/);
  if (band) return { kind: "band", lo: +band[1], hi: +band[2], text: s };
  const lead = s.match(/^([\d.]+)\s*(.*)$/);
  if (lead && isFinite(+lead[1])) return { kind: "num", n: +lead[1], unit: lead[2].trim(), text: s };
  return { kind: "text", text: s };
};
const csShow = (v) => (v === null || v === undefined ? "not notified" : String(v));
/* Returns true when the measured value is at or above the criterion,
   or outside the band for a band criterion. null when not comparable. */
const csExceeds = (c, lvl) => {
  if (!isFinite(c)) return null;
  if (lvl.kind === "num") return c >= lvl.n;
  if (lvl.kind === "band") return c < lvl.lo || c > lvl.hi;
  return null;
};

/* Basis conversion factor for coal/biomass analyses.
   ar → db, ar → daf, ar → dmmf (Parr). All inputs in mass %. */
const basisFactor = (target, M, A, S_) => {
  if (target === "Dry (db)") return 100 / (100 - M);
  if (target === "Dry ash free (daf)") return 100 / (100 - M - A);
  if (target === "Dry mineral matter free (dmmf)") {
    const mm = 1.08 * A + 0.55 * (S_ || 0);          /* Parr mineral matter */
    return 100 / (100 - M - mm);
  }
  return 1;
};

/* Buswell & Mueller theoretical methane yield, Nm³ CH₄ per kg substrate */
const buswell = (c, h, o, n) => {
  const mw = 12.011 * c + 1.008 * h + 15.999 * o + 14.007 * n;
  if (!(mw > 0)) return null;
  const nCH4 = c / 2 + h / 8 - o / 4 - (3 * n) / 8;
  const nCO2 = c / 2 - h / 8 + o / 4 + (3 * n) / 8;
  return { mw, nCH4, nCO2, yCH4: (MOLAR_VOL * nCH4) / mw, yCO2: (MOLAR_VOL * nCO2) / mw,
    pctCH4: (nCH4 / (nCH4 + nCO2)) * 100 };
};

/* SRF class number (1–5) for a value against an ascending "lower is better"
   scale, or a descending "higher is better" scale for NCV. 0 = out of class. */
const srfClass = (val, scale, higherBetter) => {
  for (let i = 0; i < scale.length; i++)
    if (higherBetter ? val >= scale[i] : val <= scale[i]) return i + 1;
  return 0;
};

/* ---------- the routines -------------------------------------------------- */

export const ROUTINES = [
/* ══════════ Fuel, Biomass & Waste ══════════ */
{
  id: "cv", mod: "fuel", tier: "routine", name: "Calorific Value", sub: "Dulong, Boie, Channiwala–Parikh; GCV ⇄ NCV",
  formula: "Dulong:  GCV (kcal/kg) = 8080 C + 34500 (H − O/8) + 2240 S\nNet:  NCV = GCV − λ (9H + M),  λ = 2.442 MJ/kg at 25 °C",
  ref: "Elemental fractions from ultimate analysis, IS 1350 (Part 4). Gross CV by bomb calorimeter, IS 1350 (Part 2) / ISO 1928. ISO 1928:2009 constant-pressure net CV: q(p,net) = q(V,gross) − 212.2 w(H) − 0.8 [w(O) + w(N)] in J/g with w in mass %. Channiwala & Parikh, Fuel 81 (2002) 1051 — the correlation of choice for biomass and RDF; validated for C 0–92 %, H 0.4–25 %, O 0–50 %, ash 0–71 %. Dulong under-reads for high-oxygen fuels. State the basis (ar / ad / db / daf) with every result — a calorific value without a stated basis is not a result.",
  inputs: [
    S("basis", "Basis of the analysis entered", ["As received (ar)", "Air dried (ad)", "Dry (db)", "Dry ash free (daf)"], "As received (ar)"),
    N("c", "Carbon, C", "% m/m", ""),
    N("h", "Hydrogen, H — excluding moisture", "% m/m", ""),
    N("o", "Oxygen, O", "% m/m", ""),
    N("n", "Nitrogen, N", "% m/m", "0"),
    N("s", "Sulphur, S", "% m/m", "0"),
    N("ash", "Ash, A", "% m/m", "0"),
    N("m", "Moisture, M", "% m/m", "0", "Moisture on the basis selected — 0 for a dry basis"),
    N("gcvMeas", "Measured GCV, if available", "kcal/kg", "", "From the bomb calorimeter; overrides the correlation for the NCV step"),
    S("corr", "Which GCV drives the NCV step", ["Measured, if entered", "Dulong", "Boie", "Channiwala–Parikh"], "Measured, if entered"),
    N("lam", "Latent heat of vaporisation, λ", "MJ/kg", "2.442", "2.442 at 25 °C (ISO 1928); 2.501 at 0 °C"),
  ],
  run: (v) => {
    const c = num(v.c), h = num(v.h);
    if (![c, h].every(isFinite)) return null;
    const o = num(v.o) || 0, n = num(v.n) || 0, s = num(v.s) || 0,
          a = num(v.ash) || 0, m = num(v.m) || 0;
    const C = c / 100, H = h / 100, O = o / 100, N_ = n / 100, S_ = s / 100, M = m / 100;
    const sum = c + h + o + n + s + a + m;

    /* D3 — an untouched select is undefined; fall back to the declared default */
    const basis = v.basis || "As received (ar)";
    const corr = v.corr || "Measured, if entered";

    const dul = 8080 * C + 34500 * (H - O / 8) + 2240 * S_;                       /* kcal/kg */
    const boie = 35.16 * C + 116.225 * H - 11.09 * O + 6.28 * N_ + 10.465 * S_;   /* MJ/kg   */
    const cp = 0.3491 * c + 1.1783 * h + 0.1005 * s - 0.1034 * o - 0.0151 * n - 0.0211 * a;
    const meas = num(v.gcvMeas);

    const pick = corr === "Dulong" ? dul
      : corr === "Boie" ? boie / KCAL_MJ
      : corr === "Channiwala–Parikh" ? cp / KCAL_MJ
      : isFinite(meas) ? meas : dul;
    const usedName = corr === "Measured, if entered"
      ? (isFinite(meas) ? "measured GCV" : "Dulong (no measured value entered)") : corr;

    /* D4 — λ = 0 is a legitimate entry (it makes NCV = GCV); `|| 2.442` would
       have silently overwritten it */
    const lam = numOr(v.lam, 2.442);
    const gcvMJ = pick * KCAL_MJ;
    const ncvMJ = gcvMJ - lam * (9 * H + M);

    const out = [
      { label: "Sum of components entered", value: fmt(sum), unit: "%",
        tone: Math.abs(sum - 100) > 2 ? "warn" : "ok",
        hint: Math.abs(sum - 100) > 2 ? "More than 2 % off 100 — the analysis does not close, check the basis" : "Analysis closes within 2 %" },
      { label: "GCV — Dulong", value: fmt(dul), unit: "kcal/kg", hint: `${fmt(dul * KCAL_MJ)} MJ/kg` },
      { label: "GCV — Boie", value: fmt(boie / KCAL_MJ), unit: "kcal/kg", hint: `${fmt(boie)} MJ/kg` },
      { label: "GCV — Channiwala–Parikh", value: fmt(cp / KCAL_MJ), unit: "kcal/kg", hint: `${fmt(cp)} MJ/kg · best for biomass and RDF` },
    ];
    if (isFinite(meas)) {
      out.push({ label: "GCV — measured", value: fmt(meas), unit: "kcal/kg", hint: `${fmt(meas * KCAL_MJ)} MJ/kg` });
      out.push({ label: "Correlation vs measured", value: fmt(((dul - meas) / meas) * 100), unit: "% (Dulong)",
        hint: `Boie ${fmt(((boie / KCAL_MJ - meas) / meas) * 100)} % · C–P ${fmt(((cp / KCAL_MJ - meas) / meas) * 100)} %` });
    }
    out.push({ label: "GCV used for the net step", value: fmt(pick), unit: "kcal/kg", tone: "key", hint: usedName });
    out.push({ label: "Water formed from hydrogen (9H)", value: fmt(9 * h), unit: "% m/m" });
    out.push({ label: "NCV", value: fmt(ncvMJ / KCAL_MJ), unit: "kcal/kg", tone: "key", hint: `${fmt(ncvMJ)} MJ/kg · basis ${basis}` });
    out.push({ label: "…in GJ/tonne", value: fmt(ncvMJ) });
    out.push({ label: "GCV − NCV gap", value: fmt(gcvMJ - ncvMJ), unit: "MJ/kg", hint: `λ = ${fmt(lam)} MJ/kg` });

    if (n > 0 || o > 0) {
      const iso = gcvMJ * 1000 - 212.2 * h - 0.8 * (o + n);                        /* J/g */
      out.push({ label: "NCV — ISO 1928 constant pressure", value: fmt(iso / 1000 / KCAL_MJ), unit: "kcal/kg",
        hint: `${fmt(iso / 1000)} MJ/kg · q(p,net) = q(V,gross) − 212.2 w(H) − 0.8 [w(O) + w(N)]` });
    }
    if (o > 25) out.push({ label: "Dulong caution", value: "Oxygen above 25 % — Dulong is unreliable for this fuel, use Channiwala–Parikh", tone: "warn" });
    if (h > 0 && 9 * h + m > 100) out.push({ label: "Check", value: "Water formed plus moisture exceeds 100 % — re-check H and M", tone: "warn" });
    return out;
  },
},
{
  id: "bomb", mod: "fuel", tier: "routine", name: "Bomb Calorimeter GCV", sub: "Water equivalent and gross calorific value",
  formula: "W = (m_BA · Q_BA + e₃) / Δθ_BA        GCV = (W · Δθ − e₁ − e₂ − e₃) / m",
  ref: "IS 1350 (Part 2): 1970 — determination of calorific value; ISO 1928:2009; ASTM D5865. Δθ is the corrected temperature rise (Regnault–Pfaundler or Dickinson cooling correction) — the raw rise is not acceptable. e₁ nitric acid, e₂ sulphuric acid, e₃ fuse wire and firing aid. Take the certified gross CV of the benzoic acid from its certificate; NIST SRM 39j is 26 434 J/g ≈ 6 313 cal/g. VERIFY every correction constant against IS 1350 (Part 2) Cl. 5 and your calorimeter manual before reporting — this routine does not assume them.",
  inputs: [
    N("wDirect", "Water equivalent, W", "cal/°C", "", "Leave blank to compute it from a benzoic acid run"),
    N("mba", "Benzoic acid taken", "g", ""),
    N("qba", "Certified gross CV of the benzoic acid", "cal/g", "6313", "From the certificate — do not assume"),
    N("dtba", "Corrected temperature rise, benzoic acid run", "°C", ""),
    N("e3ba", "Fuse wire correction, benzoic acid run", "cal", "0"),
    N("m", "Sample taken", "g", ""),
    N("dt", "Corrected temperature rise, sample run", "°C", ""),
    N("e1", "e₁ — nitric acid correction", "cal", "0", "Commonly 1 cal per mL of 0.1 N alkali titrated — VERIFY"),
    N("e2", "e₂ — sulphuric acid correction", "cal", "0", "Sulphur-dependent — take the factor from IS 1350 (Part 2)"),
    N("e3", "e₃ — fuse wire and firing aid", "cal", "0"),
    N("mad", "Moisture of the analysis sample", "%", "", "Optional — converts GCV(ad) to a dry basis"),
    N("mar", "Total moisture, as received", "%", "", "Optional — then to an as-received basis"),
  ],
  run: (v) => {
    let W = num(v.wDirect);
    const out = [];
    const mba = num(v.mba), qba = num(v.qba), dtba = num(v.dtba), e3ba = num(v.e3ba) || 0;
    if (!isFinite(W) && [mba, qba, dtba].every(isFinite) && dtba > 0) {
      W = (mba * qba + e3ba) / dtba;
      out.push({ label: "Heat released by the benzoic acid", value: fmt(mba * qba + e3ba), unit: "cal" });
      out.push({ label: "Water equivalent W", value: fmt(W), unit: "cal/°C", tone: "key", hint: "From this calibration run" });
    } else if (isFinite(W)) {
      out.push({ label: "Water equivalent W", value: fmt(W), unit: "cal/°C", hint: "As entered" });
    } else return null;

    const m = num(v.m), dt = num(v.dt);
    if (![m, dt].every(isFinite) || m <= 0) return out;
    const e1 = num(v.e1) || 0, e2 = num(v.e2) || 0, e3 = num(v.e3) || 0;
    const heat = W * dt, gcv = (heat - e1 - e2 - e3) / m;
    out.push({ label: "Gross heat released, W · Δθ", value: fmt(heat), unit: "cal" });
    out.push({ label: "Total corrections e₁ + e₂ + e₃", value: fmt(e1 + e2 + e3), unit: "cal",
      hint: e1 + e2 + e3 === 0 ? "No corrections entered — acid and fuse corrections are mandatory under IS 1350 (Part 2)" : "",
      tone: e1 + e2 + e3 === 0 ? "warn" : undefined });
    out.push({ label: "GCV, basis of the analysis sample", value: fmt(gcv), unit: "cal/g = kcal/kg", tone: "key",
      hint: `${fmt(gcv * KCAL_MJ)} MJ/kg` });

    const mad = num(v.mad), mar = num(v.mar);
    if (isFinite(mad) && mad >= 0 && mad < 100) {
      const db = (gcv * 100) / (100 - mad);
      out.push({ label: "GCV, dry basis", value: fmt(db), unit: "kcal/kg", tone: "key" });
      if (isFinite(mar) && mar >= 0 && mar < 100) {
        out.push({ label: "GCV, as received", value: fmt((db * (100 - mar)) / 100), unit: "kcal/kg", tone: "key",
          hint: `Total moisture ${fmt(mar)} %` });
      }
    }
    if (dt <= 0) out.push({ label: "Check", value: "Non-positive temperature rise", tone: "warn" });
    return out;
  },
},
{
  id: "prox", mod: "fuel", tier: "routine", name: "Proximate & Ultimate Basis", sub: "Fixed carbon, fuel ratio, ar ⇄ db ⇄ daf ⇄ dmmf",
  formula: "FC = 100 − (M + VM + A)     X_db = X · 100/(100 − M)     X_daf = X · 100/(100 − M − A)",
  ref: "IS 1350 (Part 1): 1984 — proximate analysis of coal and coke (moisture, volatile matter, ash, fixed carbon by difference); IS 1350 (Part 4) — ultimate analysis; ISO 17246 and ISO 17247. Parr formula for mineral matter, MM = 1.08 A + 0.55 S, for the dmmf basis. Fixed carbon is always by difference, never measured.",
  inputs: [
    S("from", "Basis of the values entered", ["As received (ar)", "Air dried (ad)", "Dry (db)"], "As received (ar)"),
    N("m", "Moisture, M", "%", ""),
    N("vm", "Volatile matter, VM", "%", ""),
    N("ash", "Ash, A", "%", ""),
    N("s", "Sulphur, S", "%", "0", "For the Parr mineral-matter correction only"),
    S("to", "Convert to", ["Dry (db)", "Dry ash free (daf)", "Dry mineral matter free (dmmf)"], "Dry (db)"),
    N("gcv", "GCV on the basis entered", "kcal/kg", "", "Optional — converted to the target basis too"),
  ],
  run: (v) => {
    const m = num(v.m), vm = num(v.vm), a = num(v.ash);
    if (![m, vm, a].every(isFinite)) return null;
    const s = num(v.s) || 0, fc = 100 - (m + vm + a);
    /* D3 / D6 — fall back to the declared defaults, and state the source basis
       instead of leaving the "from" select unread */
    const from = v.from || "As received (ar)";
    const to = v.to || "Dry (db)";
    const f = basisFactor(to, m, a, s);
    const mm = 1.08 * a + 0.55 * s;
    const out = [
      { label: "Fixed carbon, by difference", value: fmt(fc), unit: "%", tone: "key",
        hint: fc < 0 ? "Negative — M + VM + A already exceeds 100 %" : "" },
      { label: "Fuel ratio, FC / VM", value: fmt(fc / vm), hint: vm > 0 ? (fc / vm < 1 ? "Volatile-rich — biomass, lignite or RDF behaviour" : "Char-forming — bituminous and higher rank") : "" },
      { label: "Combustible fraction (VM + FC)", value: fmt(vm + fc), unit: "%" },
      { label: "Parr mineral matter, 1.08 A + 0.55 S", value: fmt(mm), unit: "%" },
      { label: `Conversion factor, ${from} → ${to}`, value: fmt(f, 5) + " ×", tone: "key",
        hint: "The moisture entered already carries the source basis — enter M = 0 when the values are already dry" },
      { label: `Volatile matter, ${to}`, value: fmt(vm * f), unit: "%" },
      { label: `Fixed carbon, ${to}`, value: fmt(fc * f), unit: "%" },
    ];
    if (to === "Dry (db)") out.push({ label: "Ash, db", value: fmt(a * f), unit: "%" });
    const g = num(v.gcv);
    if (isFinite(g)) {
      out.push({ label: `GCV, ${to}`, value: fmt(g * f), unit: "kcal/kg", tone: "key", hint: `${fmt(g * f * KCAL_MJ)} MJ/kg` });
    }
    if (fc < 0) out.push({ label: "Check", value: "M + VM + A exceeds 100 % — re-check the determinations", tone: "warn" });
    if (to !== "Dry (db)" && 100 - m - a <= 0) out.push({ label: "Check", value: "Moisture plus ash leaves no organic matter — daf basis undefined", tone: "warn" });
    return out;
  },
},
{
  id: "air0", mod: "fuel", tier: "advanced", name: "Combustion Air & Flue Gas", sub: "Stoichiometric air, excess air, flue gas volume, O₂ correction",
  formula: "A₀ = (2.67 C + 8 H + S − O) / 0.232  kg air/kg fuel\nEA % = O₂ / (21 − O₂) × 100        E_ref = E_meas × (21 − O_ref) / (21 − O_meas)",
  ref: "Stoichiometry on dry air at 23.2 % O₂ by mass and 1.293 kg/Nm³ at 0 °C, 101.325 kPa. Excess-air-from-oxygen relation as used in USEPA Method 3/3B and the CPCB Source Emission Monitoring manual. Reference O₂ for the correction: 11 % for hazardous waste incinerators (Hazardous and Other Wastes Rules, 2016), 7 % for many kilns and 6 % for solid-fuel boilers — VERIFY the figure written into your consent condition rather than assuming one. All flue gas volumes are at NTP, dry unless stated.",
  inputs: [
    N("c", "Carbon, C", "% m/m", ""),
    N("h", "Hydrogen, H", "% m/m", ""),
    N("o", "Oxygen, O", "% m/m", "0"),
    N("n", "Nitrogen, N", "% m/m", "0"),
    N("s", "Sulphur, S", "% m/m", "0"),
    N("m", "Moisture, M", "% m/m", "0"),
    N("o2", "Measured O₂ in dry flue gas", "% v/v", "", "For excess air and the O₂ correction"),
    N("co", "Measured CO in dry flue gas", "% v/v", "0", "Subtracted as 0.5 CO from the O₂ term"),
    N("oref", "Reference O₂ for correction", "% v/v", "11"),
    N("emeas", "Measured pollutant concentration", "mg/Nm³", "", "Optional — corrected to the reference O₂"),
    N("fuelRate", "Fuel firing rate", "kg/h", "", "Optional — gives air and flue gas flows"),
  ],
  run: (v) => {
    const c = num(v.c), h = num(v.h);
    if (![c, h].every(isFinite)) return null;
    const o = num(v.o) || 0, n = num(v.n) || 0, s = num(v.s) || 0, m = num(v.m) || 0;
    const C = c / 100, H = h / 100, O = o / 100, N_ = n / 100, S_ = s / 100, M = m / 100;

    const o2Need = 2.67 * C + 8 * H + S_ - O;              /* kg O₂ / kg fuel */
    const a0 = o2Need / AIR_O2_MASS;                        /* kg air / kg fuel */
    const a0v = a0 / AIR_RHO_N;                             /* Nm³ air / kg fuel */
    const vDry = 1.867 * C + 0.7 * S_ + 0.8 * N_ + 0.79 * a0v;   /* Nm³/kg, theoretical dry */
    const vH2O = 11.2 * H + 1.244 * M;                      /* Nm³/kg */
    const co2max = (1.867 * C / vDry) * 100;

    const out = [
      { label: "Theoretical O₂ required", value: fmt(o2Need), unit: "kg O₂/kg fuel" },
      { label: "Theoretical (stoichiometric) air A₀", value: fmt(a0), unit: "kg air/kg fuel", tone: "key" },
      { label: "…by volume", value: fmt(a0v), unit: "Nm³ air/kg fuel" },
      { label: "Theoretical dry flue gas", value: fmt(vDry), unit: "Nm³/kg fuel", tone: "key" },
      { label: "Water vapour in flue gas", value: fmt(vH2O), unit: "Nm³/kg fuel" },
      { label: "Theoretical wet flue gas", value: fmt(vDry + vH2O), unit: "Nm³/kg fuel" },
      { label: "CO₂ max (stoichiometric)", value: fmt(co2max), unit: "% v/v dry" },
    ];
    if (o2Need <= 0) { out.push({ label: "Check", value: "Fuel oxygen exceeds the oxygen demand — re-check the ultimate analysis", tone: "warn" }); return out; }

    const o2 = num(v.o2), co = num(v.co) || 0;
    let ea = NaN;
    if (isFinite(o2)) {
      const o2net = o2 - 0.5 * co;
      if (o2net >= 21) {
        out.push({ label: "Excess air", value: "Measured O₂ is at or above 21 % — not a combustion gas", tone: "warn" });
      } else {
        ea = (o2net / (21 - o2net)) * 100;
        out.push({ label: "Net O₂ (O₂ − 0.5 CO)", value: fmt(o2net), unit: "% v/v" });
        out.push({ label: "Excess air", value: fmt(ea), unit: "%", tone: "key",
          hint: ea < 10 ? "Low — risk of CO and unburnt carbon" : ea > 100 ? "High — heat carried out with the flue gas" : "Normal operating range" });
        out.push({ label: "Air / fuel ratio, actual", value: fmt(a0 * (1 + ea / 100)), unit: "kg air/kg fuel" });
        out.push({ label: "Actual dry flue gas", value: fmt(vDry + (ea / 100) * a0v), unit: "Nm³/kg fuel", tone: "key" });
        out.push({ label: "Estimated CO₂ in flue gas", value: fmt(co2max / (1 + (ea / 100) * a0v / vDry)), unit: "% v/v dry" });
      }
    }
    /* D2 — the pack had `num(v.oref) ?? 11`, which is dead code: num() returns
       NaN, never null, so a blank reference-O₂ field gave NaN, not 11 */
    const oref = numOr(v.oref, 11), emeas = num(v.emeas);
    if (isFinite(o2) && o2 < 21) {
      const cf = (21 - oref) / (21 - o2);
      out.push({ label: `O₂ correction factor to ${fmt(oref)} % O₂`, value: fmt(cf, 4) + " ×",
        hint: o2 <= oref ? "Measured O₂ is at or below the reference — correction would relax the result; most consents disallow it" : "" ,
        tone: o2 <= oref ? "warn" : undefined });
      if (isFinite(emeas) && o2 > oref)
        out.push({ label: `Concentration corrected to ${fmt(oref)} % O₂`, value: fmt(emeas * cf), unit: "mg/Nm³", tone: "key" });
    }
    const fr = num(v.fuelRate);
    if (isFinite(fr) && fr > 0) {
      const airFlow = a0 * (isFinite(ea) ? 1 + ea / 100 : 1) * fr;
      out.push({ label: "Combustion air demand", value: fmt(airFlow), unit: "kg/h", hint: `${fmt(airFlow / AIR_RHO_N)} Nm³/h` });
      out.push({ label: "Dry flue gas flow", value: fmt((vDry + (isFinite(ea) ? (ea / 100) * a0v : 0)) * fr), unit: "Nm³/h", tone: "key" });
    }
    return out;
  },
},
{
  id: "bio", mod: "fuel", tier: "advanced", name: "Biomass Energy & Methane Potential", sub: "Dry matter, VS, Buswell, BMP, biogas energy",
  formula: "Buswell:  CH₄ = 22.414 (c/2 + h/8 − o/4 − 3n/8) / M_w   Nm³/kg\nV_CH₄ = VS × BMP        E = V_CH₄ × 35.8 MJ/Nm³",
  ref: "Buswell & Mueller, Ind. Eng. Chem. 44 (1952) 550 — theoretical yield from the empirical formula CcHhOoNn. BMP by VDI 4630 or ISO 11734 batch assay. CH₄ net CV 35.8 MJ/Nm³ and gross 39.8 MJ/Nm³ at 0 °C, 101.325 kPa; density 0.7168 kg/m³. The COD route uses the stoichiometric 0.35 Nm³ CH₄ per kg COD removed at 0 °C (0.382 at 25 °C). Volatile solids by APHA 2540 E / IS 3025. Buswell is an upper bound — it assumes complete conversion and ignores cell synthesis, lignin and inhibition, so field yields of 50–70 % of theoretical are normal.",
  inputs: [
    N("mass", "Feedstock quantity, wet", "t/d", ""),
    N("moist", "Moisture, wet basis", "%", ""),
    N("vs", "Volatile solids", "% of total solids", "", "VS/TS from the loss on ignition at 550 °C"),
    N("ncv", "NCV of the dry matter", "MJ/kg", "", "Direct-combustion route — leave blank if digesting"),
    N("bmp", "Measured BMP", "Nm³ CH₄/kg VS", "", "From a VDI 4630 batch test"),
    N("cc", "Empirical formula — carbon atoms, c", "", "", "Cellulose C₆H₁₀O₅ · glucose C₆H₁₂O₆ · protein ≈ C₅H₇O₂N"),
    N("hh", "…hydrogen atoms, h", "", ""),
    N("oo", "…oxygen atoms, o", "", ""),
    N("nn", "…nitrogen atoms, n", "", "0"),
    N("codrem", "COD removed, alternative route", "kg/d", ""),
    N("ch4pct", "Methane in the biogas", "% v/v", "60"),
    N("eff", "CHP electrical efficiency", "%", "38"),
  ],
  run: (v) => {
    const out = [];
    const mass = num(v.mass), moist = num(v.moist), vsp = num(v.vs);
    let vsMass = NaN;
    if (isFinite(mass) && isFinite(moist) && moist >= 0 && moist < 100) {
      const dm = mass * (1 - moist / 100);
      out.push({ label: "Dry matter (total solids)", value: fmt(dm), unit: "t/d", tone: "key", hint: `${fmt(dm * 1000)} kg/d` });
      out.push({ label: "Water carried in", value: fmt(mass - dm), unit: "t/d" });
      if (isFinite(vsp)) {
        vsMass = dm * (vsp / 100) * 1000;                     /* kg VS/d */
        out.push({ label: "Volatile solids fed", value: fmt(vsMass), unit: "kg VS/d", tone: "key" });
        out.push({ label: "Inert / ash fraction", value: fmt(dm * 1000 - vsMass), unit: "kg/d" });
      }
      const ncv = num(v.ncv);
      if (isFinite(ncv)) {
        const e = dm * 1000 * ncv;
        out.push({ label: "Thermal energy, combustion route", value: fmt(e / 1000), unit: "GJ/d", tone: "key",
          hint: `${fmt(e / 4186.8)} Gcal/d · ${fmt(e / 3600)} MWh(th)/d` });
      }
    }
    const c = num(v.cc), h = num(v.hh), o = num(v.oo), n = num(v.nn) || 0;
    let theo = null;
    if ([c, h, o].every(isFinite) && c > 0) {
      theo = buswell(c, h, o, n);
      if (theo && theo.yCH4 > 0) {
        out.push({ label: "Molar mass of the substrate", value: fmt(theo.mw), unit: "g/mol" });
        out.push({ label: "Theoretical CH₄ — Buswell", value: fmt(theo.yCH4), unit: "Nm³ CH₄/kg", tone: "key" });
        out.push({ label: "Theoretical CO₂", value: fmt(theo.yCO2), unit: "Nm³/kg" });
        out.push({ label: "Theoretical biogas CH₄ content", value: fmt(theo.pctCH4), unit: "% v/v" });
      }
    }
    const bmp = num(v.bmp);
    let ch4 = NaN;
    if (isFinite(bmp) && isFinite(vsMass)) {
      ch4 = vsMass * bmp;
      out.push({ label: "Methane from the BMP route", value: fmt(ch4), unit: "Nm³ CH₄/d", tone: "key" });
      if (theo && theo.yCH4 > 0) {
        const bd = (bmp / theo.yCH4) * 100;
        out.push({ label: "Biodegradability, BMP / theoretical", value: fmt(bd), unit: "%",
          tone: bd > 100 ? "warn" : "ok",
          hint: bd > 100 ? "Above 100 % — the measured yield exceeds the Buswell bound, re-check VS or the formula" : "Typical range 40–80 % for lignocellulosic feedstock" });
      }
    }
    const cod = num(v.codrem);
    if (isFinite(cod)) {
      const ch4cod = cod * 0.35;
      out.push({ label: "Methane from the COD route", value: fmt(ch4cod), unit: "Nm³ CH₄/d", tone: "key", hint: "0.35 Nm³ CH₄ per kg COD removed at 0 °C" });
      if (!isFinite(ch4)) ch4 = ch4cod;
    }
    if (isFinite(ch4) && ch4 > 0) {
      /* D4 — `|| 60` and `|| 38` swallowed a deliberate zero */
      const pct = numOr(v.ch4pct, 60);
      const eff = numOr(v.eff, 38);
      if (!(pct > 0)) {
        out.push({ label: "Check", value: "Methane content in the biogas must be above 0 % v/v", tone: "warn" });
        return out;
      }
      const biogas = (ch4 * 100) / pct;
      const eth = ch4 * CH4_LHV;
      out.push({ label: "Biogas volume", value: fmt(biogas), unit: "Nm³/d", hint: `${fmt(pct)} % CH₄` });
      out.push({ label: "Biogas net calorific value", value: fmt((pct / 100) * CH4_LHV), unit: "MJ/Nm³" });
      out.push({ label: "Thermal energy in the methane", value: fmt(eth / 1000), unit: "GJ/d", tone: "key", hint: `${fmt(eth / 4186.8)} Gcal/d` });
      out.push({ label: "Electricity at the stated efficiency", value: fmt((eth * eff) / 100 / 3600), unit: "MWh/d", tone: "key",
        hint: `${fmt((eth * eff) / 100 / 3600 / 24 * 1000)} kW continuous` });
      out.push({ label: "Methane mass", value: fmt(ch4 * CH4_RHO), unit: "kg CH₄/d" });
    }
    return out.length ? out : null;
  },
},
{
  id: "lfg", mod: "fuel", tier: "advanced", name: "Landfill Gas Generation", sub: "First-order decay — IPCC 2006 and LandGEM",
  formula: "Q_CH₄ (t) = Σ k · L₀ · M_i · e^(−k (t − t_i))\nL₀ = MCF × DOC × DOC_f × F × 16/12  ÷  ρ_CH₄",
  ref: "IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Vol. 5 Ch. 3 — Solid Waste Disposal Sites, first-order decay; USEPA LandGEM v3.02, EPA-600/R-05/047. LandGEM Clean Air Act defaults k = 0.05 /yr and L₀ = 170 m³/Mg; arid sites k = 0.02 /yr. IPCC defaults DOC_f = 0.5, F = 0.5, MCF = 1.0 for a managed anaerobic site. CH₄ density 0.7168 kg/m³ at 0 °C. This routine uses annual cohorts, which is the IPCC form; LandGEM subdivides each year into ten increments and will read a few per cent higher in the first year after closure. GWP 28 (IPCC AR5) or 25 (AR4, CDM/UNFCCC). VERIFY k, DOC and MCF for Indian MSW against the CPCB or MoEFCC inventory guidance before using this in a reported inventory — the LandGEM defaults are derived from US waste and over-read for Indian waste streams.",
  inputs: [
    { id: "waste", type: "pairs", label: "Year of disposal, tonnes accepted", hint: "One pair per line — e.g.\n2015, 120000\n2016, 135000\n2017, 141000" },
    N("year", "Evaluation year", "", ""),
    S("preset", "Model preset", Object.keys(LFG_PRESETS), Object.keys(LFG_PRESETS)[0]),
    N("k", "Methane generation rate constant, k", "1/yr", "", "Overrides the preset"),
    N("l0", "Methane generation potential, L₀", "m³ CH₄/Mg", "", "Overrides the preset"),
    N("doc", "DOC — degradable organic carbon", "fraction", "", "IPCC route — computes L₀ and overrides the value above"),
    N("docf", "DOC_f — fraction dissimilated", "", "0.5"),
    N("mcf", "MCF — methane correction factor", "", "1.0"),
    N("f", "F — CH₄ fraction in landfill gas", "", "0.5"),
    N("cap", "Gas collection efficiency", "%", "", "Optional — gives the recoverable volume"),
    S("gwp", "GWP for methane", ["28 — IPCC AR5", "25 — IPCC AR4 / CDM"], "28 — IPCC AR5"),
  ],
  run: (v) => {
    const pts = parsePairs(v.waste);
    if (!pts.length) return null;
    const t = num(v.year);
    if (!isFinite(t)) return null;
    const pre = LFG_PRESETS[v.preset] || {};
    let k = isFinite(num(v.k)) ? num(v.k) : pre.k;
    let l0 = isFinite(num(v.l0)) ? num(v.l0) : pre.l0;
    const out = [];

    /* D4 — DOC_f, MCF and F are all legitimately zero-valued fields;
       D2 — `num(v.mcf) ?? 1` was dead code */
    const doc = num(v.doc);
    if (isFinite(doc) && doc > 0) {
      const docf = numOr(v.docf, 0.5), mcf = numOr(v.mcf, 1), fIn = numOr(v.f, 0.5);
      const massYield = mcf * doc * docf * fIn * (16 / 12);      /* t CH₄ / t waste */
      l0 = (massYield * 1000) / CH4_RHO;                          /* m³ CH₄ / Mg     */
      out.push({ label: "L₀ from the IPCC DOC route", value: fmt(l0), unit: "m³ CH₄/Mg", tone: "key",
        hint: `MCF ${fmt(mcf)} × DOC ${fmt(doc)} × DOC_f ${fmt(docf)} × F ${fmt(fIn)} × 16/12 = ${fmt(massYield * 1000)} kg CH₄/t` });
    }
    if (!isFinite(k) || !isFinite(l0) || k <= 0 || l0 <= 0)
      return [{ label: "Input needed", value: "Enter k and L₀, or a DOC value, or choose a preset other than the manual one", tone: "warn" }];

    let q = 0, totalMass = 0, inPlace = 0;
    const rows = [];
    for (const p of pts) {
      const age = t - p.x;
      totalMass += p.y;
      if (age < 0) continue;
      inPlace += p.y;
      const qi = k * l0 * p.y * Math.exp(-k * age);
      q += qi;
      rows.push({ y: p.x, m: p.y, age, qi });
    }
    if (!inPlace) return [{ label: "Check", value: "No waste was deposited on or before the evaluation year", tone: "warn" }];

    rows.sort((a, b) => b.qi - a.qi);
    /* D1 — an untouched select is undefined and `.startsWith` threw */
    const gwp = String(v.gwp || "").startsWith("25") ? 25 : 28;
    const f = numOr(v.f, 0.5);
    const cap = num(v.cap);

    out.push({ label: "Cohorts entered", value: pts.length, hint: `${fmt(totalMass)} t total · ${fmt(inPlace)} t in place at ${t}` });
    out.push({ label: "k used", value: fmt(k, 4), unit: "1/yr", hint: `Half-life ${fmt(Math.LN2 / k)} yr` });
    out.push({ label: "L₀ used", value: fmt(l0), unit: "m³ CH₄/Mg" });
    out.push({ label: `Methane generated in ${t}`, value: fmt(q), unit: "m³ CH₄/yr", tone: "key",
      hint: `${fmt(q / 8760)} m³/h average` });
    out.push({ label: "…as mass", value: fmt((q * CH4_RHO) / 1000), unit: "t CH₄/yr", tone: "key" });
    out.push({ label: "Total landfill gas", value: fmt(q / f), unit: "m³/yr", hint: `${fmt(f * 100)} % CH₄ by volume` });
    out.push({ label: "Energy in the methane", value: fmt((q * CH4_LHV) / 1000), unit: "GJ/yr",
      hint: `${fmt((q * CH4_LHV) / 1000 / 3600 * 1000)} MWh(th)/yr` });
    out.push({ label: "Largest contributing cohort", value: rows[0].y,
      hint: `${fmt(rows[0].qi)} m³/yr — ${((rows[0].qi / q) * 100).toFixed(0)} % of the total, age ${rows[0].age} yr` });
    if (isFinite(cap) && cap > 0) {
      const rec = (q * cap) / 100;
      out.push({ label: "Recoverable methane", value: fmt(rec), unit: "m³/yr", tone: "key", hint: `${fmt(cap)} % collection` });
      out.push({ label: "Avoided emission if flared or used", value: fmt((rec * CH4_RHO * gwp) / 1000), unit: "t CO₂e/yr", tone: "key",
        hint: `GWP ${gwp}` });
    }
    out.push({ label: "Uncontrolled emission", value: fmt((q * CH4_RHO * gwp) / 1000), unit: "t CO₂e/yr", hint: `GWP ${gwp}` });
    return out;
  },
},
{
  id: "rdf", mod: "fuel", tier: "routine", name: "RDF / SRF Classification", sub: "EN ISO 21640 class code and energy recovery",
  formula: "Class code = NCV class ; Cl class ; Hg class      Hg (mg/MJ) = Hg (mg/kg, ar) / NCV (MJ/kg, ar)",
  ref: "EN ISO 21640:2021, superseding EN 15359:2011 — solid recovered fuels, specifications and classes. Three classification parameters, five classes each: net calorific value as received (mean), chlorine on a dry basis (mean), and mercury as received in mg/MJ (median and 80th percentile). Class 1 is the cleanest. India: Solid Waste Management Rules, 2016 require that non-recyclable waste of calorific value 1500 kcal/kg or above is not landfilled but used for energy recovery or as RDF feedstock — VERIFY the clause numbering against the amended text. CPCB Guidelines on Usage of Refuse Derived Fuel in Various Industries, 2018. Cement-kiln acceptance limits for Cl, S, Hg and alkalis are plant- and consent-specific, not set by the SRF class.",
  inputs: [
    N("ncv", "NCV as received", "MJ/kg", "", "Or use the kcal/kg field below"),
    N("ncvk", "…or NCV as received", "kcal/kg", ""),
    N("cl", "Chlorine, dry basis", "% m/m", ""),
    N("hg", "Mercury as received, median", "mg/kg", ""),
    N("hg80", "Mercury as received, 80th percentile", "mg/kg", ""),
    N("moist", "Moisture as received", "%", ""),
    N("ash", "Ash, dry basis", "%", ""),
    N("rate", "Feed rate", "t/h", "", "Optional — gives the thermal input"),
  ],
  run: (v) => {
    let ncv = num(v.ncv);
    const ncvk = num(v.ncvk);
    if (!isFinite(ncv) && isFinite(ncvk)) ncv = ncvk * KCAL_MJ;
    if (!isFinite(ncv) || ncv <= 0) return null;
    const cl = num(v.cl), hg = num(v.hg), hg80 = num(v.hg80);
    const kcal = ncv / KCAL_MJ;

    const cN = srfClass(ncv, SRF.ncv, true);
    const out = [
      { label: "NCV as received", value: fmt(ncv), unit: "MJ/kg", tone: "key", hint: `${fmt(kcal)} kcal/kg` },
      { label: "NCV class", value: cN || "Outside the scale", tone: cN ? "ok" : "warn",
        hint: cN ? `Class ${cN} — thresholds 25 / 20 / 15 / 10 / 3 MJ/kg` : "Below 3 MJ/kg — not classifiable as SRF" },
    ];
    let cCl = null, cHg = null;
    if (isFinite(cl)) {
      cCl = srfClass(cl, SRF.cl, false);
      out.push({ label: "Chlorine, dry", value: fmt(cl), unit: "%" });
      out.push({ label: "Cl class", value: cCl || "Outside the scale", tone: cCl ? "ok" : "warn",
        hint: cCl ? "Thresholds 0.2 / 0.6 / 1.0 / 1.5 / 3.0 %" : "Above 3 % Cl — outside the SRF scale" });
      if (cl > 1) out.push({ label: "Chlorine note", value: "Above 1 % Cl — bypass dust, chloride build-up and dioxin formation risk rise sharply in a cement kiln", tone: "warn" });
    }
    if (isFinite(hg)) {
      const hgMJ = hg / ncv, hg80MJ = isFinite(hg80) ? hg80 / ncv : null;
      const cMed = srfClass(hgMJ, SRF.hgMed, false);
      const c80 = hg80MJ !== null ? srfClass(hg80MJ, SRF.hg80, false) : cMed;
      cHg = Math.max(cMed || 9, c80 || 9);
      if (cHg === 9) cHg = 0;
      out.push({ label: "Mercury, median", value: fmt(hgMJ, 3), unit: "mg/MJ", hint: `${fmt(hg)} mg/kg ÷ ${fmt(ncv)} MJ/kg` });
      if (hg80MJ !== null) out.push({ label: "Mercury, 80th percentile", value: fmt(hg80MJ, 3), unit: "mg/MJ" });
      out.push({ label: "Hg class", value: cHg || "Outside the scale", tone: cHg ? "ok" : "warn",
        hint: cHg ? "Median thresholds 0.02 / 0.03 / 0.08 / 0.15 / 0.50 mg/MJ; the worse of median and 80th percentile governs" : "" });
    }
    const code = `NCV ${cN || "—"} ; Cl ${cCl ?? "—"} ; Hg ${cHg ?? "—"}`;
    out.push({ label: "EN ISO 21640 class code", value: code, tone: "key" });
    const worst = Math.max(cN || 0, cCl || 0, cHg || 0);
    if (worst) out.push({ label: "Poorest of the three", value: `Class ${worst}`, tone: worst <= 3 ? "ok" : "warn",
      hint: worst <= 3 ? "Generally acceptable for cement-kiln co-processing subject to consent" : "Weak fuel or high contaminant — expect specific conditions" });

    out.push({ label: "Against SWM Rules 2016 landfill diversion", value: kcal >= 1500 ? "1500 kcal/kg or above — must not be landfilled, route to energy recovery" : "Below 1500 kcal/kg — the diversion requirement is not triggered",
      tone: kcal >= 1500 ? "ok" : "warn", hint: `${fmt(kcal)} kcal/kg against 1500 kcal/kg` });

    const moist = num(v.moist), ash = num(v.ash);
    if (isFinite(moist)) out.push({ label: "Moisture as received", value: fmt(moist), unit: "%",
      tone: moist > 25 ? "warn" : "ok", hint: moist > 25 ? "Above 25 % — handling, storage and flame stability problems" : "" });
    if (isFinite(ash)) out.push({ label: "Ash, dry", value: fmt(ash), unit: "%" });

    const rate = num(v.rate);
    if (isFinite(rate) && rate > 0) {
      const th = rate * 1000 * ncv / 1000;                        /* GJ/h */
      out.push({ label: "Thermal input", value: fmt(th), unit: "GJ/h", tone: "key", hint: `${fmt(th / 4.1868)} Gcal/h · ${fmt(th * 1000 / 3600)} MW(th)` });
      if (isFinite(hg)) out.push({ label: "Mercury input", value: fmt(rate * 1000 * hg / 1000), unit: "g/h",
        hint: "Compare against the mercury input limit in the co-processing permission" });
      if (isFinite(cl)) out.push({ label: "Chlorine input", value: fmt(rate * 1000 * cl / 100), unit: "kg/h" });
    }
    return out;
  },
},

/* ══════════ Waste & Contamination ══════════ */
{
  id: "csite", mod: "hw", tier: "advanced", name: "Contaminated Site Classification", sub: "Schedule I response and screening levels, Rules 2025",
  formula: "C < SL → investigated site      SL ≤ C < RL → probable contaminated site      C ≥ RL → contaminated site",
  ref: "Environment Protection (Management of Contaminated Sites) Rules, 2025 — S.O. 3401(E), MoEFCC, 24 July 2025. Schedule I [see rules 3(1)(e), (o) and (q)] read with rules 4(6), 4(9) and 4(10). Response level (rule 3(1)(o)) applies to soil and sediment only; ground water and surface water carry screening levels alone (rule 3(1)(q)). Units: soil and sediment mg/kg, ground water mg/L, surface water µg/L. Rule 2(1) excludes sites affected by radioactive waste, mining operations, oil pollution of the sea and solid waste from a dump site; rule 2(2) brings such a site back within the Rules where a mixed contaminant exceeds the response level. Remediation targets the site-specific remediation level, not the screening level (rules 3(1)(r) and 5(14)). These Rules are a personal reading of the notification and are not a CPCB product.",
  inputs: [
    /* D5 — the pack used type "pick", a React component this tree does not have.
       A plain select carries the same 189 options through the existing renderer,
       and an unset value still yields the refusal row below. */
    { id: "sub", type: "sel", label: "Substance — Schedule I", opts: CS2025.map((r) => r[0]), def: "",
      hint: "189 substances as notified. Nothing is selected until you choose one." },
    S("use", "Land use — rule 3(1)(i)", Object.keys(CS_LANDUSE), "Industrial"),
    N("soil", "Soil / sediment result", "mg/kg", ""),
    N("gw", "Ground water result", "mg/L", ""),
    N("sw", "Surface water result", "µg/L", ""),
  ],
  run: (v) => {
    const row = CS2025.find((r) => r[0] === v.sub);
    if (!row) return [{ label: "Substance", value: "Pick a substance from Schedule I to begin", tone: "warn" }];
    const meta = row[9] || {};
    /* D3 — an untouched land-use select is undefined */
    const use = v.use || "Industrial";
    const idx = CS_LANDUSE[use] ?? 6;
    const rl = csLevel(row[2]), sl = csLevel(row[idx]), gwl = csLevel(row[7]), swl = csLevel(row[8]);
    const soil = num(v.soil), gw = num(v.gw), sw = num(v.sw);
    const u = meta.u || "mg/kg";

    const out = [
      { label: "Chemical group", value: row[1] },
      { label: "Response level, RL", value: csShow(row[2]), unit: rl.kind === "num" && !rl.unit ? u : "" },
      { label: `Screening level — ${use}`, value: csShow(row[idx]), unit: sl.kind === "num" && !sl.unit ? u : "" },
      { label: "Ground water screening level", value: csShow(row[7]), unit: gwl.kind === "num" ? "mg/L" : "" },
      { label: "Surface water screening level", value: csShow(row[8]), unit: swl.kind === "num" ? "µg/L" : "" },
    ];

    let status = 0;   /* 0 none · 1 investigated · 2 probable · 3 contaminated */
    const notes = [];

    if (isFinite(soil)) {
      const overRL = csExceeds(soil, rl), overSL = csExceeds(soil, sl);
      if (rl.kind !== "none" || sl.kind !== "none") {
        if (overRL === true) {
          status = Math.max(status, 3);
          out.push({ label: "Soil / sediment against RL", value: rl.kind === "band" ? "Outside the notified band" : "At or above the response level", tone: "warn",
            hint: rl.kind === "num" ? `${fmt(soil)} against ${fmt(rl.n)} — ${((soil / rl.n) * 100).toFixed(0)} % of RL` : `${fmt(soil)} against ${rl.text}` });
        } else if (overSL === true) {
          status = Math.max(status, 2);
          out.push({ label: "Soil / sediment against SL", value: sl.kind === "band" ? "Outside the notified band" : "At or above the screening level, below the response level", tone: "warn",
            hint: sl.kind === "num" ? `${fmt(soil)} against ${fmt(sl.n)} — ${((soil / sl.n) * 100).toFixed(0)} % of SL` : `${fmt(soil)} against ${sl.text}` });
        } else if (overSL === false || overRL === false) {
          status = Math.max(status, 1);
          out.push({ label: "Soil / sediment", value: sl.kind === "band" ? "Within the notified band" : "Below the screening level", tone: "ok",
            hint: sl.kind === "num" ? `${fmt(soil)} against ${fmt(sl.n)} ${u}` : rl.kind === "num" ? `${fmt(soil)} against RL ${fmt(rl.n)} ${u} — no screening level notified` : "" });
        } else notes.push("The soil criterion for this substance is not numeric — assess it against the printed entry.");
      } else notes.push("Schedule I notifies no soil or sediment level for this substance.");
    }
    if (isFinite(gw)) {
      const over = csExceeds(gw, gwl);
      if (over === true) { status = Math.max(status, 2);
        out.push({ label: "Ground water against SL", value: gwl.kind === "band" ? "Outside the notified band" : "At or above the screening level", tone: "warn",
          hint: gwl.kind === "num" ? `${fmt(gw)} against ${fmt(gwl.n)} mg/L — ${((gw / gwl.n) * 100).toFixed(0)} %` : gwl.text }); }
      else if (over === false) { status = Math.max(status, 1);
        out.push({ label: "Ground water", value: gwl.kind === "band" ? "Within the notified band" : "Below the screening level", tone: "ok", hint: `${fmt(gw)} against ${csShow(row[7])} mg/L` }); }
      else notes.push("No numeric ground water screening level is notified for this substance.");
    }
    if (isFinite(sw)) {
      const over = csExceeds(sw, swl);
      if (over === true) { status = Math.max(status, 2);
        out.push({ label: "Surface water against SL", value: swl.kind === "band" ? "Outside the notified band" : "At or above the screening level", tone: "warn",
          hint: swl.kind === "num" ? `${fmt(sw)} against ${fmt(swl.n)} µg/L — ${((sw / swl.n) * 100).toFixed(0)} %` : swl.text }); }
      else if (over === false) { status = Math.max(status, 1);
        out.push({ label: "Surface water", value: swl.kind === "band" ? "Within the notified band" : "Below the screening level", tone: "ok", hint: `${fmt(sw)} against ${csShow(row[8])} µg/L` }); }
      else notes.push("No numeric surface water screening level is notified for this substance.");
    }

    if (!status) {
      out.push({ label: "Status", value: "Enter at least one result in a medium that has a notified level", tone: "warn" });
    } else {
      const label = status === 3 ? "Contaminated site — rule 4(9)"
        : status === 2 ? "Probable contaminated site — rule 4(6)"
        : "Investigated site — rules 3(1)(h) and 4(10)";
      out.push({ label: "Site status on this determinand", value: label, tone: status >= 2 ? "warn" : "ok" });
      out.push({ label: "Next step under the Rules",
        value: status === 3
          ? "List as a contaminated site, publish for comments within 60 days (rule 4(12)), then the final list and newspaper notice (rule 4(13)); select a reference organisation within 90 days and identify the responsible person within 90 days (rules 5(1) and 5(2))"
          : status === 2
          ? "Detailed site assessment covering the entire geographical area within three months of listing (rule 4(8)); public notice restricting activity meanwhile (rule 4(11))"
          : "May be delisted as an investigated site (rule 4(6) or 4(10)); no remediation obligation arises" });
      if (status === 3) {
        out.push({ label: "Remediation plan due", value: "Six months from the direction under rule 5(5) — rule 5(6)" });
        out.push({ label: "Board review of the plan", value: "Three months from submission — rule 5(8)" });
        out.push({ label: "Progress reporting", value: "Half-yearly in Form 2 to the State Board, copy to CPCB — rule 5(10)" });
        out.push({ label: "Orphan site route", value: "Where no responsible person is identified, the State Board prepares the plan within six months of publication and starts remediation within 90 days of finalising it — rule 5(13)" });
        out.push({ label: "Remediation endpoint", value: "Bring the response level down to the site-specific remediation level — rule 5(14)" });
      }
    }
    if (meta.note) out.push({ label: "Gazette note", value: meta.note, tone: "warn" });
    notes.forEach((n) => out.push({ label: "Note", value: n }));
    out.push({ label: "Scope check", value: "These Rules do not apply to sites affected by radioactive waste, mining operations, oil pollution of the sea, or solid waste from a dump site — rule 2(1); rule 2(2) restores coverage where a mixed contaminant exceeds the response level" });
    return out;
  },
},
{
  id: "csfund", mod: "hw", tier: "advanced", name: "Site Assessment & Remediation Funding", sub: "Rule 8 cost sharing and recovery, Rules 2025",
  formula: "Centre : State = 90 : 10 (NE and Himalayan)   ·   60 : 40 (other States)   ·   100 : 0 (Union Territories)",
  ref: "Environment Protection (Management of Contaminated Sites) Rules, 2025, rule 8(1) to 8(8). Funds are met initially from the Environmental Relief Fund under section 7(9) of the Public Liability Insurance Act, 1991, and by the State Government. Rule 8(3): the State share may come from the Environment Protection Fund under sections 16(1) and 16(5) of the Environment (Protection) Act, 1986, or from environmental compensation collected by the State Board. Rule 8(4): State concurrence within sixty days. Rule 8(5): assessment expenditure is recovered from an identified responsible person within three months. Rule 8(6): the responsible person pays the whole expenditure with interest as directed by the State Board — but is not liable for assessment cost where the site is not confirmed as contaminated. Rules 8(7) and 8(8) apply the same ratio to orphan sites and to sites under bank possession or judicial proceedings.",
  inputs: [
    N("prelim", "Preliminary site assessment — rule 4(5)", "₹ lakh", ""),
    N("detail", "Detailed site assessment — rule 4(8)", "₹ lakh", ""),
    N("plan", "Remediation plan preparation", "₹ lakh", ""),
    N("remed", "Remediation execution", "₹ lakh", ""),
    S("cat", "Location of the site — rule 8(2)", Object.keys(CS_FUND), "Other States"),
    S("resp", "Responsible person — rule 5(2)", ["Identified", "Not identified — orphan site, rule 3(1)(k)"], "Identified"),
    S("confirm", "Site confirmed as contaminated?", ["Yes", "No — contaminant below the response level"], "Yes"),
    N("rate", "Interest rate on recovery", "% p.a.", "", "Rule 8(6) — as directed by your State Board; there is no rate in the Rules"),
    N("months", "Months from expenditure to recovery", "months", ""),
  ],
  run: (v) => {
    const p = num(v.prelim) || 0, d = num(v.detail) || 0, pl = num(v.plan) || 0, r = num(v.remed) || 0;
    const assess = p + d, total = assess + pl + r;
    if (total <= 0) return null;
    /* D3 — untouched selects are undefined; the pack then silently took the
       orphan-site branch and printed an undefined category */
    const cat = v.cat || "Other States";
    const [cShare, sShare] = CS_FUND[cat] || [60, 40];
    const identified = (v.resp || "Identified") === "Identified";
    const confirmed = (v.confirm || "Yes") === "Yes";

    const out = [
      { label: "Assessment cost — rules 4(5) and 4(8)", value: fmt(assess), unit: "₹ lakh" },
      { label: "Plan and remediation cost", value: fmt(pl + r), unit: "₹ lakh" },
      { label: "Total expenditure", value: fmt(total), unit: "₹ lakh", tone: "key" },
      { label: "Sharing ratio", value: `${cShare} : ${sShare}`, hint: cat },
      { label: "Central Government share", value: fmt((total * cShare) / 100), unit: "₹ lakh", tone: "key" },
      { label: "State Government share", value: fmt((total * sShare) / 100), unit: "₹ lakh", tone: "key" },
    ];

    if (identified) {
      const recoverable = confirmed ? total : pl + r;
      out.push({ label: "Recoverable from the responsible person", value: fmt(recoverable), unit: "₹ lakh", tone: "key",
        hint: confirmed ? "Whole expenditure — rule 8(6)" : "Assessment cost is not recoverable where the site is not confirmed as contaminated — proviso to rule 8(6)" });
      if (!confirmed) out.push({ label: "Borne by the exchequer", value: fmt(assess), unit: "₹ lakh", tone: "warn",
        hint: `Split ${cShare} : ${sShare} — Centre ${fmt((assess * cShare) / 100)}, State ${fmt((assess * sShare) / 100)} ₹ lakh` });
      out.push({ label: "Assessment recovery deadline", value: "Three months from the expenditure — rule 8(5)" });
      const rate = num(v.rate), mo = num(v.months);
      if (isFinite(rate) && isFinite(mo) && rate > 0 && mo > 0) {
        const interest = (recoverable * rate * mo) / (100 * 12);
        out.push({ label: "Simple interest over the period", value: fmt(interest), unit: "₹ lakh",
          hint: `${fmt(rate)} % p.a. over ${fmt(mo)} months` });
        out.push({ label: "Total demand on the responsible person", value: fmt(recoverable + interest), unit: "₹ lakh", tone: "key" });
      }
    } else {
      out.push({ label: "Orphan site", value: "No responsible person traced — the whole cost is met in the ratio above, rule 8(7)", tone: "warn" });
      out.push({ label: "State Board obligation", value: "Prepare the remediation plan within six months of publication and begin remediation within 90 days of finalising it — rule 5(13)" });
    }
    out.push({ label: "State concurrence", value: "Within sixty days of communication of the contaminated site — rule 8(4)" });
    out.push({ label: "Environmental compensation", value: "Separate from remediation cost — payment of compensation does not absolve the responsible person of the remediation cost, rule 13(4); compensation is credited to the Environmental Relief Fund in a separate account, rule 13(5)" });
    return out;
  },
},
];

export default ROUTINES;
