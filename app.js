/* ============================================================
   TAF — Travail à Faire · by Majin
   Stockage local, aucune dépendance externe.
   ============================================================ */
(function () {
"use strict";

/* ---------- Constantes ---------- */
const STORE_KEY = "pic-majin:v1";   // inchangé : renommer la clé effacerait vos données
const APP_TITLE = "TAF - TRAVAIL À FAIRE";

const DEFAULT_COLUMNS = [
  { key:"date",          label:"Date",             type:"date", visible:true },
  { key:"sujet",         label:"Sujet",            type:"text", visible:true },
  { key:"collaboration", label:"Collaboration",    type:"text", visible:true },
  { key:"objectif",      label:"Objectif",         type:"text", visible:true },
  { key:"echeance",      label:"Date d'échéance",  type:"date", visible:true },
  { key:"statut",        label:"Statut",           type:"statut", visible:true },
  { key:"action",        label:"Action",           type:"long", visible:true },
  { key:"commentaire",   label:"Commentaire",      type:"long", visible:true },
  { key:"score",         label:"Difficulté",       type:"score", visible:true },
  { key:"rex",           label:"REX",              type:"long", visible:true }
];

/* Ordre d'affichage et de tri des statuts */
const STATUT_ORDER = ["en-cours", "en-attente", "bloquee", "deleguee"];

const COL_WIDTH = { date:7, sujet:12, collaboration:10, objectif:10,
                    echeance:9, action:15, commentaire:17, rex:15 };

const DEFAULT_SETTINGS = {
  reminders:true, lead:1, sound:true, dense:false, intro:true, introSon:true,
  sortKey:"echeance", sortDir:"asc",
  kanban:false,
  theme:"auto",          // auto | clair | sombre
  closedGroups:{}        // groupes de statut repliés dans la liste
};

/* Valeurs par défaut d'une tâche — utilisées à la création et à la migration */
function taskDefaults() {
  return {
    statut:"en-cours",   // en-cours | en-attente | bloquee | deleguee
    tags:[],             // ["formation","déploiement",…]
    score:null,          // 1-5 étoiles, posé à l'archivage
    recurrence:null,     // null | { freq:"semaine"|"mois"|"trimestre", count:0 }
    linkedTo:[],         // [id, id, …]
    comments:[],         // [{id,texte,at,updatedAt}] — stocké localement, sync par D1
    shareToken:null      // token de partage lecture seule
  };
}

/* Statuts disponibles */
const STATUTS = {
  "en-cours":   { label:"En cours",   pluriel:"En cours",   color:"var(--o-orange)",    railCls:"st-encours" },
  "en-attente": { label:"En attente", pluriel:"En attente", color:"var(--o-yellow)",    railCls:"st-attente" },
  "bloquee":    { label:"Bloquée",    pluriel:"Bloquées",   color:"var(--st-bloquee)",  railCls:"st-bloquee" },
  "deleguee":   { label:"Déléguée",   pluriel:"Déléguées",  color:"var(--st-deleguee)", railCls:"st-deleguee"}
};

const DEFAULT_SYNC = { enabled:false, space:"", lastAt:null, pushEndpoint:null };
const API = "/api";
const TOMBSTONE_DAYS = 120;

/* Déclaré avant le chargement : migrateSettings() s'exécute pendant load(). */
let migrated = false;

/* ---------- Utilitaires ---------- */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function todayISO(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function frDate(iso) {
  if (!iso) return "";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(todayISO() + "T00:00:00");
  const b = new Date(iso + "T00:00:00");
  return Math.round((b - a) / 864e5);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
const MONTHS = ["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];

/* ---------- Affichage : initiales, couleurs de tags, échéance relative ---------- */
function initials(name) {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}
/* Une couleur stable par tag, tirée de la palette secondaire Orange */
function tagCls(tag) {
  let h = 0;
  for (const ch of String(tag).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "tag-chip tag-c" + (h % 6);
}
function relOf(iso) {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d < 0)  return { k:"late",  cls:"rel rel-late",  label: (-d) + " j de retard" };
  if (d === 0) return { k:"today", cls:"rel rel-today", label:"aujourd'hui" };
  if (d <= 7) return { k:"soon",  cls:"rel rel-soon",  label:"dans " + d + " j" };
  return { k:"later", cls:"rel rel-later", label:"dans " + d + " j" };
}
const railOf = t => "r-" + ((relOf(t.echeance) || {}).k || "none");
const ICO = {
  comment:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  chevron:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  x:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  moon:'<svg class="svg-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg class="svg-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};
function svgSpan(cls, svg, label) {
  const s = el("span", label ? { class:cls, role:"img", "aria-label":label, title:label } : { class:cls });
  s.innerHTML = svg;
  return s;
}

/* ---------- Pièces jointes (liens internet, captures d'écran) ----------
   Module dans js/ : il range les images dans IndexedDB et, si la synchro
   est active et le bucket R2 relié, les envoie sur Cloudflare R2. */
const PJ = () => (window.TAF && window.TAF.piecesJointes) ? window.TAF : null;
const aDesPJ = t => !!((t.liens || []).length || (t.captures || []).length);
/* Copie des liens avec de nouveaux identifiants (duplication, récurrence) */
const copierLiens = liens => (liens || []).map(l => ({ ...l, id: uid() }));

/* ---------- État ---------- */
let data = load();
let view = "taches";
let filters = { q:"", collab:"", ech:"", tag:"", statut:"", qArch:"", collabArch:"", tagArch:"", rexTodo:false };
let editing = null;          // fonction de validation de la cellule en cours
let lastUndo = null;         // { type, task }

function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { raw = null; }
  const d = raw && typeof raw === "object" ? raw : {};
  const cols = Array.isArray(d.columns) && d.columns.length ? d.columns : DEFAULT_COLUMNS;
  return {
    version: 1,
    columns: DEFAULT_COLUMNS.map(def => {
      const found = cols.find(c => c.key === def.key);
      return found ? { ...def, label: found.label || def.label, visible: found.visible !== false } : { ...def };
    }),
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    settings: migrateSettings({ ...DEFAULT_SETTINGS, ...(d.settings || {}) }),
    sync: { ...DEFAULT_SYNC, ...(d.sync || {}) },
    metaUpdatedAt: d.metaUpdatedAt || new Date(0).toISOString()
  };
}

/* Migration des tâches existantes vers le modèle v2 */
function migrateTasks() {
  let changed = false;
  const defs = taskDefaults();
  data.tasks.forEach(t => {
    Object.entries(defs).forEach(([k, v]) => {
      if (t[k] === undefined) { t[k] = Array.isArray(v) ? [] : v; changed = true; }
    });
  });
  if (changed) save();
}

/* Ancien réglage « ambiance sonore » : seul le marimba subsiste. */
function migrateSettings(s) {
  if (typeof s.introSound === "string") {
    s.introSon = s.introSound !== "aucun";
    delete s.introSound;
    migrated = true;
  }
  return s;
}

/* Les suppressions laissent une trace le temps que les autres appareils
   la reçoivent, puis disparaissent pour de bon. */
/* Une ligne créée puis laissée entièrement vide ne veut rien dire :
   on la retire au chargement suivant. */
function pruneEmptyTasks() {
  const keys = ["sujet", "collaboration", "objectif", "echeance", "action", "commentaire", "rex"];
  let n = 0;
  live().forEach(t => {
    if (keys.every(k => !String(t[k] || "").trim()) && !aDesPJ(t)) {
      t.deleted = true;
      t.deletedAt = new Date().toISOString();
      touch(t);
      n++;
    }
  });
  if (n) { save(); queueSync(); }
  return n;
}

function purgeTombstones() {
  const limit = Date.now() - TOMBSTONE_DAYS * 864e5;
  const before = data.tasks.length;
  const purgees = data.tasks.filter(t => t.deleted && new Date(t.deletedAt || 0).getTime() <= limit);
  data.tasks = data.tasks.filter(t => !t.deleted || new Date(t.deletedAt || 0).getTime() > limit);
  if (data.tasks.length !== before) save();
  /* Une tâche supprimée garde ses images tant que l'annulation reste possible
     sur un autre appareil ; elles partent avec la trace de suppression. */
  if (PJ()) purgees.forEach(t => {
    if (!(t.captures || []).length) return;
    PJ().capturesDb.supprimerParTache(t.id).catch(() => {});
    const s = PJ().capturesSync;
    if (s && s.estActif()) t.captures.forEach(c => s.supprimer(c.id).catch(() => {}));
  });
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch (e) { toast("Sauvegarde impossible : l'espace du navigateur est plein.", "warn"); }
}
const cols     = () => data.columns;
const visCols  = () => data.columns.filter(c => c.visible);
const labelOf  = k => (data.columns.find(c => c.key === k) || {}).label || k;
const live     = () => data.tasks.filter(t => !t.deleted && t.kind !== "note");
const notes    = () => data.tasks
  .filter(t => !t.deleted && t.kind === "note")
  .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
const actives  = () => live().filter(t => !t.archived);
const archived = () => live().filter(t => t.archived);
const touch    = t => { t.updatedAt = new Date().toISOString(); };
function touchMeta() { data.metaUpdatedAt = new Date().toISOString(); }

/* ---------- Statut d'échéance ---------- */
function statusOf(t) {
  if (t.archived) return { cls:"st-done", label:"Archivée" };
  // Statut personnalisé non-en-cours prime sur l'échéance
  const st = t.statut || "en-cours";
  if (st !== "en-cours") {
    const s = STATUTS[st] || STATUTS["en-cours"];
    return { cls:"st-statut st-" + st, label:s.label };
  }
  const d = daysUntil(t.echeance);
  if (d === null) return { cls:"st-none",  label:"Sans échéance" };
  if (d < 0)      return { cls:"st-late",  label:"En retard" };
  if (d === 0)    return { cls:"st-today", label:"Aujourd'hui" };
  if (d <= 7)     return { cls:"st-soon",  label:"Sous 7 jours" };
  return { cls:"st-far", label:"À venir" };
}

/* ---------- Filtrage & tri ---------- */
function matches(t, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return cols().some(c => String(t[c.key] || "").toLowerCase().includes(s));
}
function filteredActives() {
  let list = actives().filter(t => matches(t, filters.q));
  if (filters.collab) list = list.filter(t => (t.collaboration || "") === filters.collab);
  if (filters.tag) list = list.filter(t => (t.tags || []).includes(filters.tag));
  if (filters.statut) list = list.filter(t => (t.statut || "en-cours") === filters.statut);
  if (filters.ech) {
    list = list.filter(t => {
      const d = daysUntil(t.echeance);
      if (filters.ech === "none")  return d === null;
      if (d === null) return false;
      if (filters.ech === "late")  return d < 0;
      if (filters.ech === "today") return d === 0;
      if (filters.ech === "7")     return d >= 0 && d <= 7;
      return true;
    });
  }
  return sortList(list);
}
function sortList(list) {
  const { sortKey:k, sortDir:dir } = data.settings;
  const sign = dir === "desc" ? -1 : 1;
  const col = cols().find(c => c.key === k);
  const type = col ? col.type : "text";

  return list.slice().sort((a, b) => {
    if (type === "statut") {
      const ia = STATUT_ORDER.indexOf(a.statut || "en-cours");
      const ib = STATUT_ORDER.indexOf(b.statut || "en-cours");
      return (ia - ib) * sign;
    }
    if (type === "score") {
      const sa = a.score || 0, sb = b.score || 0;
      if (!sa && !sb) return 0;
      if (!sa) return 1;         // non notées toujours en fin
      if (!sb) return -1;
      return (sa - sb) * sign;
    }
    const va = a[k] || "", vb = b[k] || "";
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    if (type === "date") return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
    return String(va).localeCompare(String(vb), "fr", { sensitivity:"base", numeric:true }) * sign;
  });
}
function filteredArchives() {
  let list = archived().filter(t => matches(t, filters.qArch));
  if (filters.collabArch) list = list.filter(t => (t.collaboration || "") === filters.collabArch);
  if (filters.tagArch) list = list.filter(t => (t.tags || []).includes(filters.tagArch));
  if (filters.rexTodo) list = list.filter(t => !(t.rex || "").trim());
  return list.sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
}

/* ============================================================
   RENDU — Tableau des tâches
   ============================================================ */
function renderTable() {
  const head = $("#head-row");
  head.innerHTML = "";
  head.appendChild(el("th", { class:"col-check" }, el("span", { class:"sr-only" }, "Archiver")));
  const W = { sujet:"24%", collaboration:"170px", echeance:"130px", date:"110px", statut:"120px", score:"110px" };
  visCols().forEach(c => {
    const on = data.settings.sortKey === c.key;
    const th = el("th", {
      class:"sortable" + (on ? " is-sorted" : ""), "data-sort":c.key, tabindex:"0", role:"button",
      title:"Trier par " + c.label, "aria-sort": on ? (data.settings.sortDir === "asc" ? "ascending" : "descending") : "none"
    });
    if (W[c.key]) th.style.width = W[c.key];
    th.append(c.label, el("span", { class:"sort-mark" }, on ? (data.settings.sortDir === "asc" ? "↑" : "↓") : ""));
    head.appendChild(th);
  });
  head.appendChild(el("th", { class:"col-tools" }, el("span", { class:"sr-only" }, "Ouvrir la fiche")));

  const body = $("#body-taches");
  body.innerHTML = "";
  const list = filteredActives();
  const ncol = String(visCols().length + 2);
  const closed = data.settings.closedGroups || {};
  let i = 0;

  /* Un groupe par statut, dans l'ordre métier ; le tri choisi s'applique dans chaque groupe. */
  STATUT_ORDER.forEach(st => {
    const rows = list.filter(t => (t.statut || "en-cours") === st);
    if (!rows.length) return;
    const isClosed = !!closed[st];
    const grp = el("tr", { class:"grp" });
    const td = el("td", { colspan:ncol });
    const btn = el("button", { type:"button", class:"grp-btn", "data-grp":st, "aria-expanded": String(!isClosed) });
    const sq = el("span", { class:"grp-sq", "aria-hidden":"true" });
    sq.style.background = STATUTS[st].color;
    btn.append(sq, el("span", { class:"grp-label" }, STATUTS[st].label),
      el("span", { class:"grp-n" }, String(rows.length)),
      el("span", { class:"grp-arrow" }, isClosed ? "Afficher" : "Réduire"));
    td.appendChild(btn);
    grp.appendChild(td);
    body.appendChild(grp);
    if (!isClosed) rows.forEach(t => body.appendChild(rowFor(t, i++)));
  });

  $("#empty-taches").hidden = list.length > 0;
  $(".table-scroll").hidden = list.length === 0;
  $(".hint").hidden = list.length === 0;
  refreshCounters();
}

/* Une ligne du tableau (et, sur mobile, une carte) */
function rowFor(t, i) {
  const tr = el("tr", { class:"row", "data-id":t.id });
  tr.style.animationDelay = Math.min(i * 18, 360) + "ms";

  const tdC = el("td", { class:"col-check " + railOf(t) });
  tdC.appendChild(el("button", { class:"check-box", "data-act":"archive", type:"button",
    title:"Archiver la tâche", "aria-label":"Archiver « " + (t.sujet || "cette tâche") + " »" }));
  tr.appendChild(tdC);

  visCols().forEach(c => {
    const td = el("td", { class:"k-" + c.key });
    const shown = cellValue(t, c);
    const isSujet = c.key === "sujet";
    const cell = el("div", {
      class:"cell", "data-act": isSujet ? "sujet" : "edit", "data-key":c.key, tabindex:"0", role:"button",
      title: isSujet ? "Ouvrir la fiche" : c.label + " — cliquez pour modifier"
    });

    if (isSujet) {
      cell.appendChild(el("span", { class:"sujet-link" }, t.sujet || "Sans sujet"));
      const meta = el("div", { class:"sujet-meta" });
      (t.tags || []).forEach(tg => meta.appendChild(el("span", { class:tagCls(tg) }, tg)));
      if (t.date && !visCols().some(x => x.key === "date")) meta.appendChild(el("span", { class:"sujet-date" }, "créée le " + frDate(t.date)));
      if (PJ() && aDesPJ(t)) meta.appendChild(PJ().piecesJointes.indicateurs(t));
      if (meta.childNodes.length) cell.appendChild(meta);
    } else if (c.key === "collaboration") {
      if (shown) {
        const w = el("div", { class:"collab" });
        w.append(el("span", { class:"avatar", "aria-hidden":"true" }, initials(shown)), el("span", {}, shown));
        cell.appendChild(w);
      } else cell.classList.add("is-empty");
    } else if (c.key === "echeance") {
      const r = relOf(t.echeance);
      if (r) {
        cell.appendChild(el("span", { class:r.cls }, r.label));
        cell.appendChild(el("div", { class:"rel-date" }, frDate(t.echeance)));
      } else cell.appendChild(el("span", { class:"no-date" }, "Sans date"));
    } else if (c.type === "statut") {
      cell.appendChild(el("span", { class:"statut-badge badge-" + (t.statut || "en-cours") }, shown));
    } else if (c.type === "score") {
      if (t.score) {
        const sc = el("span", { class:"score-cell", title:t.score + " sur 5" });
        sc.append(el("b", {}, "★".repeat(t.score)), el("i", {}, "★".repeat(5 - t.score)));
        cell.appendChild(sc);
      } else cell.classList.add("is-empty");
    } else if (shown) {
      cell.appendChild(el("span", { class:"cell-text" }, shown));
    } else cell.classList.add("is-empty");

    td.appendChild(cell);
    tr.appendChild(td);
  });

  const tdT = el("td", { class:"col-tools" });
  const tools = el("div", { class:"tools" });
  if ((t.commentaire || "").trim() || (t.comments || []).some(x => !x.deleted)) {
    tools.appendChild(svgSpan("tool-ico", ICO.comment, "A un commentaire ou un journal"));
  }
  const open = el("button", { class:"tool-open", "data-act":"open", type:"button", "aria-label":"Ouvrir la fiche", title:"Ouvrir la fiche" });
  open.innerHTML = ICO.chevron;
  tools.appendChild(open);
  tdT.appendChild(tools);
  tr.appendChild(tdT);
  return tr;
}

/* Rendu texte d'une cellule, selon le type de colonne */
function cellValue(t, col) {
  const v = t[col.key];
  if (col.type === "date")   return frDate(v);
  if (col.type === "statut")  return (STATUTS[v || "en-cours"] || STATUTS["en-cours"]).label;
  if (col.type === "score")   return v ? "★".repeat(v) + "☆".repeat(5 - v) : "";
  return v || "";
}

function pctWidth(key) {
  const total = visCols().reduce((s, c) => s + (COL_WIDTH[c.key] || 10), 0) || 1;
  return (((COL_WIDTH[key] || 10) / total) * 93).toFixed(2);
}
function el(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.append(text);
  return n;
}

function refreshCounters() {
  const a = actives();
  const late = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d < 0; }).length;
  const soon = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d >= 0 && d <= 7; }).length;
  $("#head-count").textContent = a.length;
  $("#head-late").textContent = late;
  $("#head-soon").textContent = soon;
  $("#head-sub-word").textContent = a.length > 1 ? "tâches actives" : "tâche active";
  $("#badge-taches").textContent = a.length;
  $("#badge-archives").textContent = archived().length;
  const opts = list => [...new Set(list.map(t => (t.collaboration || "").trim()).filter(Boolean))]
    .sort((x, y) => x.localeCompare(y, "fr"));
  fillSelect($("#f-collab"), opts(actives()), filters.collab, "Collaboration");
  fillSelect($("#f-collab-arch"), opts(archived()), filters.collabArch, "Collaboration");
  refreshTagSelects();
  renderStatutSeg();
  renderRexSeg();
  $$(".fsel").forEach(sel => sel.classList.toggle("is-set", !!sel.value));
}

/* Filtre par statut, en boutons avec leur nombre */
function renderStatutSeg() {
  const box = $("#seg-statut");
  if (!box) return;
  const a = actives();
  box.innerHTML = "";
  [{ k:"", label:"Toutes", n:a.length }]
    .concat(STATUT_ORDER.map(k => ({ k, label:STATUTS[k].pluriel, n:a.filter(t => (t.statut || "en-cours") === k).length })))
    .forEach(s => {
      const b = el("button", { type:"button", class:"seg", "data-statut":s.k, "aria-pressed": String(filters.statut === s.k) });
      b.append(s.label + " ", el("span", { class:"cnt" }, String(s.n)));
      box.appendChild(b);
    });
}
function renderRexSeg() {
  const box = $("#seg-rex");
  if (!box) return;
  const ar = archived();
  const todo = ar.filter(t => !(t.rex || "").trim()).length;
  box.innerHTML = "";
  const all = el("button", { type:"button", class:"seg", "data-todo":"0", "aria-pressed": String(!filters.rexTodo) });
  all.append("Toutes ", el("span", { class:"cnt" }, String(ar.length)));
  const td = el("button", { type:"button", class:"seg", "data-todo":"1", "aria-pressed": String(!!filters.rexTodo) });
  td.append("REX à rédiger ", el("span", { class:"cnt" }, String(todo)));
  box.append(all, td);
}
function fillSelect(sel, values, current, placeholder) {
  sel.innerHTML = "";
  sel.appendChild(el("option", { value:"" }, placeholder));
  values.forEach(v => {
    const o = el("option", { value:v }, v);
    if (v === current) o.selected = true;
    sel.appendChild(o);
  });
}

/* ============================================================
   Édition en ligne
   ============================================================ */
function openEditorFor(id, key) {
  // Toute saisie en cours est validée avant d'ouvrir la suivante
  if (editing) { const done = editing; editing = null; done(false); }

  const tr = $(`tr[data-id="${id}"]`);
  if (!tr) return;
  const cellEl = $(`.cell[data-key="${key}"]`, tr);
  const task = data.tasks.find(t => t.id === id);
  const col = cols().find(c => c.key === key);
  if (!cellEl || !task || !col) return;

  /* Statut : liste déroulante, validée au choix */
  if (col.type === "statut") {
    const sel = el("select", { class:"cell-editor" });
    STATUT_ORDER.forEach(k => {
      const o = el("option", { value:k }, STATUTS[k].label);
      if ((task.statut || "en-cours") === k) o.selected = true;
      sel.appendChild(o);
    });
    cellEl.replaceWith(sel);
    sel.focus();
    const done = () => {
      if (sel.value !== (task.statut || "en-cours")) {
        task.statut = sel.value; touch(task); save(); queueSync();
      }
      editing = null; renderTable();
    };
    sel.addEventListener("change", done);
    sel.addEventListener("blur", () => { if (editing) { editing = null; renderTable(); } });
    sel.addEventListener("keydown", e => {
      if (e.key === "Escape") { editing = null; renderTable(); }
    });
    editing = () => {};
    return;
  }

  /* Difficulté : cinq étoiles cliquables directement dans la cellule */
  if (col.type === "score") {
    const box = el("div", { class:"cell-stars" });
    for (let i = 1; i <= 5; i++) {
      const b = el("button", { class:"cell-star" + (i <= (task.score || 0) ? " is-on" : ""),
        "data-v":i, title:i + " sur 5" }, "★");
      b.addEventListener("mousedown", e => {
        e.preventDefault();
        task.score = task.score === i ? null : i;
        touch(task); save(); queueSync();
        editing = null; renderTable();
      });
      box.appendChild(b);
    }
    cellEl.replaceWith(box);
    box.setAttribute("tabindex", "0");
    box.focus();
    box.addEventListener("blur", () => { if (editing) { editing = null; renderTable(); } });
    editing = () => {};
    return;
  }

  const input = col.type === "date"
    ? el("input", { type:"date", class:"cell-editor" })
    : el(col.type === "long" ? "textarea" : "input", { class:"cell-editor", type:"text" });
  input.value = task[key] || "";

  cellEl.replaceWith(input);
  input.focus();
  if (input.select && col.type !== "date") input.select();

  function commit(moveNext) {
    const v = input.value.trim();
    if (v !== (task[key] || "")) {
      task[key] = v;
      touch(task);
      save(); queueSync();
    }
    const target = moveNext ? nextCell(id, key) : null;
    renderTable();
    if (target) openEditorFor(target.id, target.key);
  }
  editing = commit;

  input.addEventListener("blur", () => { if (editing === commit) { editing = null; commit(false); } });
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); editing = null; renderTable(); }
    else if (e.key === "Tab") { e.preventDefault(); editing = null; commit(!e.shiftKey); }
    else if (e.key === "Enter" && (col.type !== "long" || e.ctrlKey || e.metaKey)) {
      e.preventDefault(); editing = null; commit(false);
    }
  });
}
function nextCell(id, key) {
  const keys = visCols().map(c => c.key);
  const i = keys.indexOf(key);
  if (i < keys.length - 1) return { id, key:keys[i + 1] };
  const closed = data.settings.closedGroups || {};
  const list = filteredActives();
  const shown = STATUT_ORDER.filter(st => !closed[st])
    .flatMap(st => list.filter(t => (t.statut || "en-cours") === st));
  const pos = shown.findIndex(t => t.id === id);
  if (pos > -1 && pos < shown.length - 1) return { id:shown[pos + 1].id, key:keys[0] };
  return null;
}

/* ============================================================
   Créer / archiver / restaurer / supprimer
   ============================================================ */
function newTask() {
  const t = { id:uid(), date:todayISO(), sujet:"", collaboration:"", objectif:"",
              echeance:"", action:"", commentaire:"", rex:"",
              archived:false, deleted:false,
              ...taskDefaults(),
              createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  data.tasks.unshift(t);
  save(); queueSync();
  data.settings.sortKey = "date"; data.settings.sortDir = "desc";
  renderTable();
  openSheet(t.id, { isNew:true });
}

/* Duplication : tout est repris sauf l'historique propre à la tâche d'origine */
function duplicateTask(id) {
  const src = data.tasks.find(x => x.id === id);
  if (!src) return;
  const now = new Date().toISOString();
  const copy = {
    ...src,
    id: uid(),
    sujet: (src.sujet || "Sans sujet") + " (copie)",
    date: todayISO(),
    archived: false,
    archivedAt: undefined,
    deleted: false,
    deletedAt: undefined,
    rex: "",
    score: null,
    comments: [],
    linkedTo: [],
    liens: copierLiens(src.liens),
    captures: [],            // recopiées juste après, avec leurs propres identifiants
    notifiedFor: undefined,
    createdAt: now,
    updatedAt: now
  };
  data.tasks.unshift(copy);
  save(); queueSync();
  renderTable(); renderBoard();
  openSheet(copy.id);
  toast("Tâche dupliquée. Ajustez le sujet et l'échéance.", "ok");

  /* Les images sont copiées sous de nouveaux identifiants : retirer une capture
     de la copie ne doit pas l'effacer de l'original. */
  if (PJ() && (src.captures || []).length) {
    PJ().capturesDb.dupliquerVers(src.id, copy.id, PJ().liens.nouvelId).then(copies => {
      copy.captures = copies.map(c => ({ id:c.id, nom:c.nom, largeur:c.largeur, hauteur:c.hauteur,
        taille:c.taille, type:c.type, ajouteLe:c.ajouteLe }));
      touch(copy); save(); queueSync(); renderView();
      if (sheetId === copy.id) openSheet(copy.id);
    }).catch(() => {});
  }
}

function archiveTask(id, sourceEl) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  if (sourceEl) { sourceEl.classList.add("is-on"); burst(sourceEl); }
  ding();
  const tr = $(`tr[data-id="${id}"]`);
  const finish = () => {
    t.archived = true;
    t.archivedAt = new Date().toISOString();
    touch(t);

  // Récurrence
  if (t.recurrence && t.recurrence.freq) {
    const next = { ...t, id:uid(), archived:false, archivedAt:undefined,
                   rex:"", score:null, comments:[], linkedTo:[],
                   liens:copierLiens(t.liens), captures:[],
                   createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    const base = t.echeance ? new Date(t.echeance + "T00:00:00") : new Date();
    const steps = { semaine:7, mois:30, trimestre:91 };
    base.setDate(base.getDate() + (steps[t.recurrence.freq] || 7));
    next.echeance = todayISO(base);
    next.date = todayISO();
    next.recurrence = { ...t.recurrence, count:(t.recurrence.count||0) + 1 };
    data.tasks.unshift(next);
    toast(`Tâche récurrente replanifiée au ${frDate(next.echeance)}.`, "ok");
  }

    save(); queueSync();
    renderTable(); renderArchives(); renderBoard();
    lastUndo = { type:"archive", id };
    toast(`« ${t.sujet || "Tâche"} » archivée. Pensez à écrire le REX.`, "ok", "Annuler", () => undo());
  };
  if (tr) { tr.classList.add("is-leaving"); setTimeout(finish, 420); } else finish();
}
function restoreTask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  t.archived = false; delete t.archivedAt; delete t.deleted; delete t.deletedAt;
  touch(t);
  save(); queueSync(); renderTable(); renderArchives(); renderBoard();
  toast(`« ${t.sujet || "Tâche"} » réactivée.`, "ok");
}
function deleteTask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  t.deleted = true;
  t.deletedAt = new Date().toISOString();
  touch(t);
  save(); queueSync(); renderTable(); renderArchives(); renderBoard();
  lastUndo = { type:"delete", id };
  toast(`« ${t.sujet || "Tâche"} » supprimée.`, "warn", "Annuler", () => undo());
}
function undo() {
  if (!lastUndo) return;
  if (lastUndo.type === "archive") restoreTask(lastUndo.id);
  else if (lastUndo.type === "delete") {
    const t = data.tasks.find(x => x.id === lastUndo.id);
    if (t) {
      delete t.deleted; delete t.deletedAt;
      touch(t);
      save(); queueSync(); renderTable(); renderArchives(); renderBoard();
      toast("Tâche rétablie.", "ok");
    }
  }
  lastUndo = null;
}

/* Éclat de squares Orange à l'archivage */
function burst(anchor) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = anchor.getBoundingClientRect();
  const wrap = el("div", { class:"burst" });
  wrap.style.left = (r.left + r.width / 2) + "px";
  wrap.style.top = (r.top + r.height / 2) + "px";
  const palette = ["#50BE87", "#FF7900", "#4BB4E6", "#FFD200", "#0A6E31"];
  for (let i = 0; i < 12; i++) {
    const p = el("i");
    const ang = (Math.PI * 2 * i) / 12 + Math.random();
    const dist = 42 + Math.random() * 46;
    p.style.background = palette[i % palette.length];
    p.style.setProperty("--bx", Math.cos(ang) * dist + "px");
    p.style.setProperty("--by", Math.sin(ang) * dist + "px");
    p.style.setProperty("--br", (Math.random() * 320 - 160) + "deg");
    p.style.animation = `burstOut ${520 + Math.random() * 260}ms cubic-bezier(.2,.8,.3,1) forwards`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 900);
}
let audioCtx = null;
function ding() {
  if (!data.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.16, now + i * 0.09 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.25);
    });
  } catch (e) { /* audio indisponible */ }
}

/* ============================================================
   Panneau détail
   ============================================================ */
let sheetId = null, sheetIsNew = false;
let sheetPJ = null, sheetRex = null;     // modules montés dans la fiche ouverte

function demonterPJ() {
  if (sheetPJ) { sheetPJ.detruire(); sheetPJ = null; }
  if (sheetRex) { sheetRex.detruire(); sheetRex = null; }
}

/* Liens internet, captures d'écran et, pour une tâche archivée, le choix avant / après du REX */
function buildSheetPJ(t, body) {
  if (!PJ()) return;
  body.appendChild(el("div", { class:"sheet-divider" }, "Liens et captures"));
  const zone = el("div", { class:"form-field sheet-pj" });
  body.appendChild(zone);
  const zoneRex = t.archived ? el("div", { class:"form-field sheet-pj-rex" }) : null;
  if (zoneRex) body.appendChild(zoneRex);

  const monterRex = () => {
    if (!zoneRex || !PJ().rexCaptures) return;
    if (sheetRex) sheetRex.detruire();
    sheetRex = PJ().rexCaptures.monter(zoneRex, { tache:t, onChange: changement });
  };
  function changement() {
    touch(t); save(); queueSync();
    monterRex();               // la liste avant / après suit les captures ajoutées ou retirées
  }
  sheetPJ = PJ().piecesJointes.monter(zone, { tache:t, onChange: changement });
  monterRex();
}

function openSheet(id, opts) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  demonterPJ();
  sheetId = id;
  sheetIsNew = !!(opts && opts.isNew);
  $("#sheet-eyebrow").textContent = sheetIsNew
    ? "Nouvelle tâche"
    : t.archived
      ? "Archivée le " + frDate(String(t.archivedAt || "").slice(0, 10)) + " · REX"
      : "Tâche · créée le " + frDate(t.date || String(t.createdAt || "").slice(0, 10));
  $("#sheet-title").textContent = t.sujet || "Nouvelle tâche";

  const body = $("#sheet-body");
  body.innerHTML = "";
  const col = k => cols().find(c => c.key === k);
  const ordre = ["sujet", "statut", "collaboration", "echeance", "date", "score", "tags", "objectif", "action", "commentaire", "rex"];
  const demi = { collaboration:1, echeance:1, date:1, score:1 };

  ordre.forEach(k => {
    if (k === "tags") { body.appendChild(sheetTags(t)); return; }
    const c = col(k);
    if (!c) return;
    if (c.type === "statut") body.appendChild(sheetStatut(t, c));
    else if (c.type === "score") body.appendChild(sheetScore(t, c, true));
    else body.appendChild(sheetField(t, c, !!demi[k]));
  });
  /* Colonnes éventuellement ajoutées plus tard */
  cols().filter(c => !ordre.includes(c.key)).forEach(c => body.appendChild(sheetField(t, c, false)));

  buildSheetPJ(t, body);

  body.appendChild(el("div", { class:"sheet-divider" }, "Compléments"));
  buildSheetExtra(t, body);

  $("#sheet-archive").hidden = !!t.archived || sheetIsNew;
  $("#sheet-restore").hidden = !t.archived;
  $("#sheet-duplicate").hidden = sheetIsNew;
  $("#sheet-print").hidden = sheetIsNew;
  $("#sheet-validate").textContent = sheetIsNew ? "Créer la tâche" : "Valider";
  $("#sheet-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
  body.scrollTop = 0;

  /* Sur une nouvelle tâche, le curseur se pose directement dans le sujet */
  if (sheetIsNew) {
    const f = $("#f-sujet");
    if (f) f.focus();
  }
}

/* Champ texte, date ou long de la fiche */
function sheetField(t, c, half) {
  const wrap = el("div", { class:"form-field" + (half ? " half" : "") + (c.key === "rex" ? " is-rex" : "") });
  wrap.appendChild(el("label", { for:"f-" + c.key }, c.label));
  let f;
  if (c.type === "date") f = el("input", { type:"date", id:"f-" + c.key });
  else if (c.type === "long") f = el("textarea", { id:"f-" + c.key, rows: c.key === "objectif" ? "2" : "3" });
  else f = el("input", { type:"text", id:"f-" + c.key });
  f.value = t[c.key] || "";
  if (c.key === "rex") f.placeholder = "Ce qui a marché, ce qu'on refait, ce qu'on évite la prochaine fois.";

  let badge = null;
  if (c.key === "echeance") {
    const line = el("div", { class:"field-inline" });
    badge = el("span");
    line.append(f, badge);
    wrap.appendChild(line);
  } else wrap.appendChild(f);

  const majBadge = () => {
    if (!badge) return;
    const r = relOf(f.value);
    badge.className = r ? r.cls : "";
    badge.textContent = r ? r.label : "";
  };
  majBadge();
  f.addEventListener("input", () => {
    t[c.key] = f.value;
    touch(t); save(); queueSync();
    if (c.key === "sujet") $("#sheet-title").textContent = f.value || "Nouvelle tâche";
    majBadge();
  });
  return wrap;
}

/* Statut en boutons, comme dans le filtre de la liste */
function sheetStatut(t, c) {
  const wrap = el("div", { class:"form-field" });
  wrap.appendChild(el("span", { class:"lbl", id:"lbl-statut" }, c.label));
  const grp = el("div", { class:"seg-group", role:"group", "aria-labelledby":"lbl-statut" });
  STATUT_ORDER.forEach(k => {
    const b = el("button", { type:"button", class:"seg", "aria-pressed": String((t.statut || "en-cours") === k) }, STATUTS[k].label);
    b.addEventListener("click", () => {
      t.statut = k; touch(t); save(); queueSync();
      $$(".seg", grp).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      renderView();
    });
    grp.appendChild(b);
  });
  wrap.appendChild(grp);
  return wrap;
}

/* Difficulté : cinq étoiles */
function sheetScore(t, c, half) {
  const wrap = el("div", { class:"form-field" + (half ? " half" : "") });
  wrap.appendChild(el("span", { class:"lbl" }, c.label));
  const row = el("div", { class:"score-row" });
  const note = el("span", { class:"score-note" }, t.score ? t.score + " / 5" : "Non noté");
  for (let i = 1; i <= 5; i++) {
    const b = el("button", { type:"button", class:"star-btn" + (i <= (t.score || 0) ? " is-on" : ""), "aria-label":"Note " + i + " sur 5" }, "★");
    b.addEventListener("click", () => {
      t.score = t.score === i ? null : i;
      touch(t); save(); queueSync();
      $$(".star-btn", row).forEach((x, j) => x.classList.toggle("is-on", j < (t.score || 0)));
      note.textContent = t.score ? t.score + " / 5" : "Non noté";
    });
    row.appendChild(b);
  }
  row.appendChild(note);
  wrap.appendChild(row);
  return wrap;
}

/* Tags en étiquettes : Entrée ou virgule pour ajouter, croix pour retirer */
function sheetTags(t) {
  const wrap = el("div", { class:"form-field" });
  wrap.appendChild(el("label", { for:"s-tags" }, "Tags"));
  const row = el("div", { class:"tag-edit" });
  const input = el("input", { type:"text", id:"s-tags", class:"tag-add", placeholder:"+ Ajouter", list:"tags-connus", autocomplete:"off" });
  const dl = el("datalist", { id:"tags-connus" });
  [...new Set(live().flatMap(x => x.tags || []))].sort((a, b) => a.localeCompare(b, "fr"))
    .forEach(tg => dl.appendChild(el("option", { value:tg })));
  const changed = () => { touch(t); save(); queueSync(); refreshTagSelects(); };
  const render = () => {
    $$(".tag-chip", row).forEach(n => n.remove());
    (t.tags || []).forEach(tg => {
      const chip = el("span", { class:tagCls(tg) }, tg);
      const x = el("button", { type:"button", class:"tag-x", "aria-label":"Retirer le tag " + tg });
      x.innerHTML = ICO.x;
      x.addEventListener("click", () => { t.tags = (t.tags || []).filter(v => v !== tg); changed(); render(); input.focus(); });
      chip.appendChild(x);
      row.insertBefore(chip, input);
    });
  };
  const ajouter = () => {
    const vals = input.value.split(",").map(v => v.trim()).filter(Boolean);
    if (!vals.length) return;
    t.tags = [...new Set([...(t.tags || []), ...vals])];
    input.value = "";
    changed(); render();
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); ajouter(); }
    else if (e.key === "Backspace" && !input.value && (t.tags || []).length) {
      t.tags = t.tags.slice(0, -1); changed(); render();
    }
  });
  input.addEventListener("blur", ajouter);
  row.append(input, dl);
  render();
  wrap.appendChild(row);
  return wrap;
}

/* Validation : une nouvelle tâche restée entièrement vide est abandonnée */
function validateSheet() {
  const t = data.tasks.find(x => x.id === sheetId);
  if (t && sheetIsNew) {
    const keys = ["sujet","collaboration","objectif","echeance","action","commentaire","rex"];
    if (keys.every(k => !String(t[k] || "").trim()) && !aDesPJ(t)) {
      t.deleted = true; t.deletedAt = new Date().toISOString(); touch(t);
      save(); queueSync();
      closeSheet();
      toast("Tâche vide abandonnée.", "warn");
      return;
    }
    toast(`« ${t.sujet || "Tâche"} » créée.`, "ok");
  }
  closeSheet();
}
function closeSheet() {
  demonterPJ();
  $("#sheet-backdrop").hidden = true;
  document.body.style.overflow = "";
  sheetId = null;
  sheetIsNew = false;
  renderTable(); renderArchives(); renderBoard();
}

/* ============================================================
   Archives / REX
   ============================================================ */
function renderArchives() {
  const list = filteredArchives();
  const box = $("#rex-list");
  box.innerHTML = "";
  $("#empty-archives").hidden = list.length > 0;
  renderRexSeg();

  list.forEach((t, i) => {
    const card = el("article", { class:"rex-card", "data-id":t.id });
    card.style.animationDelay = Math.min(i * 30, 400) + "ms";

    /* Colonne de gauche : le contexte */
    const side = el("div", { class:"rex-side" });
    if ((t.tags || []).length) {
      const tr = el("div", { class:"tag-row" });
      t.tags.forEach(tg => tr.appendChild(el("span", { class:tagCls(tg) }, tg)));
      side.appendChild(tr);
    }
    const info = (label, valeur) => {
      const d = el("div");
      d.append(el("span", { class:"ml" }, label));
      if (valeur instanceof Node) d.appendChild(valeur); else d.append(valeur);
      side.appendChild(d);
    };
    info(labelOf("collaboration"), t.collaboration || "—");
    const lt = leadTime(t);
    const fin = String(t.archivedAt || "").slice(0, 10);
    const duree = el("span");
    if (lt !== null) duree.appendChild(el("strong", {}, lt + (lt > 1 ? " jours" : " jour")));
    duree.append((lt !== null ? " · " : "") + "du " + frDate(t.date) + " au " + frDate(fin));
    info("Durée", duree);
    let ech = "sans échéance";
    if (t.echeance && fin) {
      const ecart = Math.round((new Date(fin + "T00:00:00") - new Date(t.echeance + "T00:00:00")) / 864e5);
      ech = ecart <= 0 ? "tenue (" + frDate(t.echeance) + ")" : "dépassée de " + ecart + " j";
    }
    info("Échéance", ech);
    if (t.score) info("Difficulté", "★".repeat(t.score) + "☆".repeat(5 - t.score));
    card.appendChild(side);

    /* Colonne principale : le REX */
    const main = el("div", { class:"rex-main" });
    const top = el("div", { class:"rex-top" });
    const h = el("h3", { class:"rex-sujet" });
    h.appendChild(el("button", { type:"button", "data-act":"open" }, t.sujet || "Sans sujet"));
    const links = el("div", { class:"rex-links" });
    links.append(el("button", { type:"button", class:"link-btn", "data-act":"open" }, "Modifier"),
                 el("button", { type:"button", class:"link-btn", "data-act":"restore" }, "Réactiver"));
    top.append(h, links);
    main.appendChild(top);

    if (t.objectif) {
      const o = el("p", { class:"rex-obj" });
      o.append(el("strong", {}, labelOf("objectif") + " · "), t.objectif);
      main.appendChild(o);
    }
    const aDesCaptures = PJ() && (t.captures || []).length;
    if ((t.rex || "").trim()) {
      main.appendChild(el("div", { class:"rex-text" }, t.rex));
    } else {
      const todo = el("div", { class:"rex-todo" });
      const txt = el("span");
      txt.append(el("strong", {}, "REX à rédiger."), el("span", { class:"muted" }, " Deux lignes suffisent, tant que c'est encore frais."));
      todo.append(txt, el("button", { type:"button", class:"dark-btn", "data-act":"open" }, "Écrire le REX"));
      if (aDesCaptures && !PJ().rexCaptures.aDesCapturesRex(t)) {
        todo.appendChild(el("button", { type:"button", class:"ghost-btn", "data-act":"open" }, "Choisir avant / après"));
      }
      main.appendChild(todo);
    }
    if (PJ() && PJ().rexCaptures.aDesCapturesRex(t)) {
      const slot = el("div", { class:"rex-captures" });
      main.appendChild(slot);
      PJ().rexCaptures.affichage(t).then(b => slot.appendChild(b));
    }
    card.appendChild(main);
    box.appendChild(card);
  });
}
function leadTime(t) {
  if (!t.date || !t.archivedAt) return null;
  const a = new Date(t.date + "T00:00:00"), b = new Date(t.archivedAt);
  const d = Math.round((b - a) / 864e5);
  return d >= 0 ? d : null;
}

/* ============================================================
   Tableau de bord
   ============================================================ */
function renderBoard() {
  const a = actives(), ar = archived(), all = live();
  const late = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d < 0; });
  const soon = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d >= 0 && d <= 7; });
  const blocked = a.filter(t => t.statut === "bloquee");
  const rate = all.length ? Math.round((ar.length / all.length) * 100) : 0;

  const bd = $("#bord-date");
  if (bd) bd.textContent = "Situation au " + new Date().toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });

  /* Chiffres clés */
  const kpis = [
    { n:a.length, l:"Tâches actives" },
    { n:late.length, l:"En retard", c:"is-late" },
    { n:soon.length, l:"Échéance sous 7 jours" },
    { n:blocked.length, l:"Bloquées", c:"is-blocked" },
    { n:ar.length, l:"Archivées en REX" },
    { n:rate + "%", l:`Taux de réalisation · ${ar.length} sur ${all.length}`, c:"is-rate" }
  ];
  const row = $("#kpi-row");
  row.innerHTML = "";
  kpis.forEach(k => {
    const box = el("div", { class:"kpi" + (k.c ? " " + k.c : "") });
    const num = el("span", { class:"kv" }, "0");
    box.append(num, el("span", { class:"kl" }, k.l));
    row.appendChild(box);
    countUp(num, k.n);
  });

  /* Tâches actives par mois de création, sur six mois */
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    /* Clé en heure locale : toISOString() recule d'un mois quand le fuseau est en avance sur UTC. */
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    months.push({ key, name:MONTHS[d.getMonth()], n:0 });
  }
  let anciennes = 0;
  a.forEach(t => {
    const m = months.find(x => x.key === String(t.date || t.createdAt || "").slice(0, 7));
    if (m) m.n++; else anciennes++;
  });
  const mMax = Math.max(1, ...months.map(m => m.n));
  const cm = $("#chart-months");
  cm.innerHTML = "";
  const chart = el("div", { class:"vchart", role:"img",
    "aria-label": months.map(m => m.name + " : " + m.n).join(", ") });
  const labels = el("div", { class:"vlabels", "aria-hidden":"true" });
  months.forEach(m => {
    const c = el("div", { class:"vcol", title:`${m.name} : ${m.n} tâche${m.n > 1 ? "s" : ""} active${m.n > 1 ? "s" : ""} créée${m.n > 1 ? "s" : ""}` });
    const bar = el("div", { class:"vbar" });
    c.append(el("span", { class:"vnum" }, String(m.n)), bar);
    chart.appendChild(c);
    labels.appendChild(el("span", {}, m.name));
    requestAnimationFrame(() => { bar.style.height = Math.max(m.n ? 4 : 0, (m.n / mMax) * 150) + "px"; });
  });
  cm.append(chart, labels);
  if (anciennes) cm.appendChild(el("p", { class:"cfg-note" }, `+ ${anciennes} tâche${anciennes > 1 ? "s" : ""} active${anciennes > 1 ? "s" : ""} créée${anciennes > 1 ? "s" : ""} avant cette période.`));

  /* Horizon des échéances */
  const between = (lo, hi) => a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d >= lo && d <= hi; }).length;
  const horizon = [];
  if (late.length) horizon.push({ l:"En retard", n:late.length, late:true });
  horizon.push({ l:"Sous 7 jours", n:soon.length },
               { l:"8 à 30 jours", n:between(8, 30) },
               { l:"Plus de 30 jours", n:a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d > 30; }).length },
               { l:"Sans date", n:a.filter(t => !t.echeance).length });
  const hMax = Math.max(1, ...horizon.map(h => h.n));
  const ce = $("#chart-echeance");
  ce.innerHTML = "";
  horizon.forEach(h => {
    const r = el("div", { class:"hrow", title:`${h.l} : ${h.n}` });
    const track = el("div", { class:"htrack" });
    const bar = el("span", { class:"hbar" + (h.late ? " is-late" : "") });
    track.appendChild(bar);
    r.append(el("span", { class:"hname" }, h.l), track, el("span", { class:"hnum" }, String(h.n)));
    ce.appendChild(r);
    requestAnimationFrame(() => { bar.style.width = (h.n / hMax) * 100 + "%"; });
  });

  /* Top des collaborations : toutes les tâches, en cours et archivées */
  const topEl = $("#chart-top");
  topEl.innerHTML = "";
  const tally = {};
  all.forEach(t => {
    const name = (t.collaboration || "").trim();
    if (!name) return;
    tally[name] = tally[name] || { total:0, ouvertes:0, closes:0, notes:[] };
    tally[name].total++;
    t.archived ? tally[name].closes++ : tally[name].ouvertes++;
    if (t.score) tally[name].notes.push(t.score);
  });
  const rank = Object.entries(tally).sort((x, y) => y[1].total - x[1].total || x[0].localeCompare(y[0], "fr"));
  const sub = $("#top-sub");
  if (sub) sub.textContent = "Toutes les tâches, en cours et archivées" + (rank.length > 8 ? ` · ${rank.length - 8} autre${rank.length - 8 > 1 ? "s" : ""}` : "");
  if (!rank.length) {
    topEl.appendChild(el("p", { class:"cfg-note" }, "Le classement apparaîtra dès qu'une tâche portera une collaboration."));
  } else {
    const maxT = rank[0][1].total;
    rank.slice(0, 8).forEach(([name, v]) => {
      const dif = v.notes.length ? ` · difficulté ${(v.notes.reduce((s2, n) => s2 + n, 0) / v.notes.length).toFixed(1)}/5` : "";
      const r = el("div", { class:"hrow", title:`${name} : ${v.total} tâche${v.total > 1 ? "s" : ""} · ${v.ouvertes} en cours · ${v.closes} archivée${v.closes > 1 ? "s" : ""}${dif}` });
      const track = el("div", { class:"htrack" });
      const fo = el("span", { class:"hbar" }), fd = el("span", { class:"hbar is-done" });
      track.append(fo, fd);
      r.append(el("span", { class:"hname" }, name), track, el("span", { class:"hnum" }, String(v.total)));
      topEl.appendChild(r);
      requestAnimationFrame(() => {
        fo.style.width = (v.ouvertes / maxT) * 100 + "%";
        fd.style.width = (v.closes / maxT) * 100 + "%";
      });
    });
  }

  /* Prochaines échéances */
  const next = a.filter(t => t.echeance).sort((x, y) => x.echeance.localeCompare(y.echeance)).slice(0, 6);
  const nl = $("#next-list");
  nl.innerHTML = "";
  if (!next.length) nl.appendChild(el("li", { class:"cfg-note", style:"border:0;padding:6px 0" }, "Aucune échéance posée pour l'instant."));
  next.forEach(t => {
    const d = daysUntil(t.echeance);
    const li = el("li");
    const b = el("button", { type:"button", class:"next-row", title: d < 0 ? (-d) + " j de retard" : d === 0 ? "Aujourd'hui" : "Dans " + d + " j" });
    b.append(el("span", { class:"next-date" + (d < 0 ? " is-late" : "") }, frDate(t.echeance).slice(0, 5)),
             el("span", { class:"next-sujet" }, (t.sujet || "Sans sujet") + (t.statut === "bloquee" ? " (bloquée)" : "")),
             el("span", { class:"next-collab" }, t.collaboration || ""));
    b.addEventListener("click", () => openSheet(t.id));
    li.appendChild(b);
    nl.appendChild(li);
  });
}
function countUp(node, target) {
  const isPct = typeof target === "string";
  const end = isPct ? parseInt(target, 10) : target;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || end === 0) {
    node.textContent = isPct ? end + "%" : end; return;
  }
  const dur = 650, t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const v = Math.round(end * (1 - Math.pow(1 - p, 3)));
    node.textContent = isPct ? v + "%" : v;
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ============================================================
   Impression — une seule page A4 paysage
   ============================================================ */
function buildPrint(mode, opts) {
  const o = { filtres:true, grouper:true, notes:true, blancs:true, unePage:true, ...(opts || {}) };
  const area = $("#print-area");
  if (mode === "synthese") return buildPrintSynth(area, o);
  if (mode === "bord") return buildPrintBoard(o);
  if (mode === "fiche") return buildPrintFiche(o.tache, o);
  const list = mode === "archives" ? filteredArchives() : (o.filtres ? filteredActives() : sortList(actives()));
  const printCols = visCols();

  const head = `<div class="p-head">
      <div class="p-title">${esc(APP_TITLE)}</div>
      <div class="p-majin">by Majin</div>
    </div>
    <div class="p-sub">
      <span>${mode === "archives" ? "Archives &amp; retours d'expérience" : "Tâches en cours"} — ${list.length} ligne(s)</span>
      <span>Édité le ${frDate(todayISO())}</span>
    </div>`;

  const ths = printCols.map(c =>
    `<th style="width:${pctWidth(c.key)}%">${esc(c.label)}</th>`).join("");
  const ligne = t => "<tr>" + printCols.map(c => {
    const v = cellValue(t, c);
    return `<td class="${c.key === "sujet" ? "p-sujet" : ""}">${esc(v)}</td>`;
  }).join("") + "</tr>";
  let rows;
  if (mode !== "archives" && o.grouper) {
    rows = STATUT_ORDER.map(st => {
      const g = list.filter(t => (t.statut || "en-cours") === st);
      return g.length ? `<tr class="p-grp"><td colspan="${printCols.length}">${esc(STATUTS[st].label)} · ${g.length}</td></tr>` + g.map(ligne).join("") : "";
    }).join("");
  } else rows = list.map(ligne).join("");

  const pending = (mode === "archives" || !o.notes) ? [] : notes();
  // Lignes vides pour écrire à la main, comme sur le tableau d'origine
  const blanks = o.blancs ? Math.max(0, Math.min(10, 16 - list.length - pending.length)) : 0;
  const blankRows = Array.from({ length: blanks },
    () => `<tr class="p-empty-row">${printCols.map(() => "<td></td>").join("")}</tr>`).join("");
  const notesBlock = pending.length
    ? `<div class="p-notes"><b>Notes en attente</b>${
        pending.map(n => `<span>${esc(n.texte)}</span>`).join("")}</div>`
    : "";

  area.innerHTML = head +
    `<table class="p-table"><thead><tr>${ths}</tr></thead><tbody>${rows}${blankRows}</tbody></table>` +
    notesBlock +
    `<div class="p-foot"><span>TAF — Travail à Faire</span><span>by Majin</span></div>`;

  fitToPage(area, { fit:o.unePage });
}
function buildPrintBoard(opts) {
  const o = { prochaines:true, points:false, ...(opts || {}) };
  const a = actives(), ar = archived(), all = live();
  const late = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d < 0; });
  const week = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d >= 0 && d <= 7; });
  const rate = all.length ? Math.round((ar.length / all.length) * 100) : 0;
  const delays = ar.map(leadTime).filter(v => v !== null);
  const avg = delays.length ? Math.round(delays.reduce((s, v) => s + v, 0) / delays.length) : null;

  /* ── Indicateurs de tête ── */
  const kpis = [
    ["Tâches en cours", a.length],
    ["En retard", late.length],
    ["Sous 7 jours", week.length],
    ["Archivées", ar.length],
    ["Taux de réalisation", rate + "%"],
    ["Délai moyen", avg === null ? "—" : avg + " j"]
  ];

  /* ── Répartition par statut ── */
  const parStatut = STATUT_ORDER.map(k => [
    STATUTS[k].label,
    a.filter(t => (t.statut || "en-cours") === k).length
  ]);

  /* ── État des échéances ── */
  const parEcheance = [
    ["En retard", late.length],
    ["Aujourd'hui", a.filter(t => daysUntil(t.echeance) === 0).length],
    ["Sous 7 jours", week.length],
    ["Plus tard", a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d > 7; }).length],
    ["Sans échéance", a.filter(t => !t.echeance).length]
  ];

  /* ── Top des collaborations ── */
  const tally = {};
  all.forEach(t => {
    const n = (t.collaboration || "").trim();
    if (!n) return;
    tally[n] = tally[n] || { total:0, ouvertes:0, closes:0, notes:[] };
    tally[n].total++;
    t.archived ? tally[n].closes++ : tally[n].ouvertes++;
    if (t.score) tally[n].notes.push(t.score);
  });
  const top = Object.entries(tally)
    .sort((x, y) => y[1].total - x[1].total)
    .slice(0, 10)
    .map(([n, v], i) => [
      i + 1, n, v.total, v.ouvertes, v.closes,
      v.notes.length ? (v.notes.reduce((s, x) => s + x, 0) / v.notes.length).toFixed(1) : "—"
    ]);

  /* ── Activité sur six mois ── */
  const now = new Date(), months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    months.push({ key, name: MONTHS[d.getMonth()], open:0, done:0 });
  }
  all.forEach(t => {
    const c = months.find(m => m.key === String(t.date || t.createdAt || "").slice(0, 7));
    if (c) c.open++;
    if (t.archivedAt) {
      const d = months.find(m => m.key === t.archivedAt.slice(0, 7));
      if (d) d.done++;
    }
  });

  /* ── Tâches à traiter : le cœur du document ── */
  const urgent = a.filter(t => t.echeance)
    .sort((x, y) => x.echeance.localeCompare(y.echeance))
    .slice(0, 14)
    .map(t => {
      const d = daysUntil(t.echeance);
      return [
        frDate(t.echeance),
        d < 0 ? `${-d} j de retard` : d === 0 ? "aujourd'hui" : `dans ${d} j`,
        t.sujet || "—",
        t.collaboration || "—",
        (STATUTS[t.statut || "en-cours"] || STATUTS["en-cours"]).label,
        t.score ? "★".repeat(t.score) : "",
        d < 0 ? "late" : d === 0 ? "today" : ""
      ];
    });

  /* ── Tags les plus employés ── */
  const tagTally = {};
  all.forEach(t => (t.tags || []).forEach(g => { tagTally[g] = (tagTally[g] || 0) + 1; }));
  const tags = Object.entries(tagTally).sort((x, y) => y[1] - x[1]).slice(0, 8);

  /* ── Assemblage ── */
  const miniTable = (title, rows, headers) =>
    `<section class="p-block">
       <h3>${esc(title)}</h3>
       <table class="p-mini">
         ${headers ? `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : ""}
         <tbody>${rows.map(r => `<tr>${r.map((c, i) =>
           `<td class="${i === 0 ? "p-c1" : "p-cn"}">${esc(String(c))}</td>`).join("")}</tr>`).join("")}
         </tbody>
       </table>
     </section>`;

  const head = `<div class="p-head">
      <div class="p-title">${esc(APP_TITLE)} — TABLEAU DE BORD</div>
      <div class="p-majin">by Majin</div>
    </div>
    <div class="p-sub">
      <span>${all.length} tâche(s) suivie(s) · ${Object.keys(tally).length} collaboration(s) ·
        ${ar.filter(t => t.rex).length} REX rédigé(s)</span>
      <span>Édité le ${frDate(todayISO())}</span>
    </div>`;

  const kpiRow = `<div class="p-kpi-row">${kpis.map(([l, n]) =>
    `<div class="p-kpi"><strong>${esc(String(n))}</strong><span>${esc(l)}</span></div>`).join("")}</div>`;

  const urgentTable = (o.prochaines && urgent.length)
    ? `<section class="p-block p-block-wide">
         <h3>Prochaines échéances</h3>
         <table class="p-mini p-urgent">
           <thead><tr><th>Échéance</th><th>Délai</th><th>Sujet</th><th>Collaboration</th><th>Statut</th><th>Diff.</th></tr></thead>
           <tbody>${urgent.map(r =>
             `<tr class="${r[6]}">${r.slice(0, 6).map((c, i) =>
               `<td class="${i === 2 ? "p-sujet" : ""}">${esc(String(c))}</td>`).join("")}</tr>`).join("")}
           </tbody>
         </table>
       </section>`
    : "";

  $("#print-area").innerHTML = head + kpiRow +
    `<div class="p-board-grid">` +
      miniTable("Répartition par statut", parStatut) +
      miniTable("État des échéances", parEcheance) +
      miniTable("Activité par mois", months.map(m => [m.name, m.open, m.done]),
                ["Mois", "Créées", "Archivées"]) +
      (tags.length ? miniTable("Tags les plus employés", tags) : "") +
    `</div>` +
    (top.length
      ? `<section class="p-block p-block-wide">
           <h3>Top des collaborations</h3>
           <table class="p-mini p-top">
             <thead><tr><th>#</th><th>Collaboration</th><th>Total</th><th>En cours</th><th>Archivées</th><th>Difficulté</th></tr></thead>
             <tbody>${top.map(r => `<tr>${r.map((c, i) =>
               `<td class="${i === 1 ? "p-sujet" : ""}">${esc(String(c))}</td>`).join("")}</tr>`).join("")}
             </tbody>
           </table>
         </section>`
      : "") +
    urgentTable +
    (o.points ? `<section class="p-board-extra"><h3>Points à remonter</h3>${'<div class="pf-line"></div>'.repeat(4)}</section>` : "") +
    `<div class="p-foot"><span>TAF — Travail à Faire</span><span>by Majin</span></div>`;

  fitToPage($("#print-area"));
}

function buildPrintSynth(area, opts) {
  const o = { contexte:true, journal:true, vides:true, captures:true, ...(opts || {}) };
  const d = synthData(o.range || synthRange);
  if (!o.vides) {
    Object.keys(d.groups).forEach(k => {
      d.groups[k] = d.groups[k].filter(t => (t.rex || "").trim());
      if (!d.groups[k].length) delete d.groups[k];
    });
  }
  const head = `<div class="p-head">
      <div class="p-title">SYNTHÈSE REX — ${esc(d.bounds.label.toUpperCase())}</div>
      <div class="p-majin">by Majin</div>
    </div>
    <div class="p-sub">
      <span>TAF — Travail à Faire · ${d.stats.closes} tâche(s) close(s) ·
        ${d.stats.avec} REX rédigé(s) · ${d.stats.collabs} collaboration(s) ·
        délai moyen ${d.stats.moyen === null ? "—" : d.stats.moyen + " j"}</span>
      <span>Édité le ${frDate(todayISO())}</span>
    </div>`;

  /* Le REX seul ne dit rien hors contexte : on rappelle la tâche entière. */
  const champ = (label, valeur) => valeur
    ? `<div class="p-f"><span>${esc(label)}</span><p>${esc(valeur)}</p></div>` : "";

  const groups = Object.entries(d.groups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, items]) => `<section class="p-group">
        <h3>${esc(name)} <em>${items.length}</em></h3>
        ${items.map(t => {
          const notes = (t.comments || []).filter(c => !c.deleted)
            .sort((x, y) => String(x.at).localeCompare(String(y.at)));
          return `<div class="p-item">
            <b>${esc(t.sujet || "Sans sujet")}</b>
            <i>Ouverte le ${esc(frDate(t.date))} · close le ${esc(frDate(String(t.archivedAt).slice(0, 10)))}${
              leadTime(t) !== null ? " · " + leadTime(t) + " j de traitement" : ""}${
              t.score ? " · difficulté " + "★".repeat(t.score) : ""}${
              (t.tags || []).length ? " · " + esc(t.tags.join(", ")) : ""}</i>
            ${o.contexte ? champ(labelOf("objectif"), t.objectif) : ""}
            ${o.contexte ? champ(labelOf("action"), t.action) : ""}
            ${o.contexte ? champ(labelOf("commentaire"), t.commentaire) : ""}
            ${o.journal && notes.length ? `<div class="p-f p-journal"><span>Journal de bord</span>${
              notes.map(c => `<p><em>${esc(frDate(c.at.slice(0, 10)))}</em> ${esc(c.texte)}</p>`).join("")
            }</div>` : ""}
            <div class="p-f p-rex"><span>${esc(labelOf("rex"))}</span><p>${
              esc((t.rex || "").trim() || "REX non rédigé.")}</p></div>
            ${o.captures && PJ() && PJ().rexCaptures.aDesCapturesRex(t)
              ? `<div class="p-f p-rexcap"><span>Avant / après</span><div data-rexcap="${esc(t.id)}"></div></div>` : ""}
          </div>`;
        }).join("")}
      </section>`).join("");

  area.innerHTML = head + `<div class="p-synth">${groups}</div>` +
    `<div class="p-foot"><span>Retours d'expérience — ${esc(d.bounds.label)}</span><span>by Majin</span></div>`;

  fitToPage(area);

  /* Vignettes avant / après : chargées depuis IndexedDB, puis on recalcule l'échelle. */
  const slots = $$("[data-rexcap]", area);
  if (!slots.length || !PJ()) return Promise.resolve();
  return Promise.all(slots.map(slot => {
    const t = data.tasks.find(x => x.id === slot.dataset.rexcap);
    return t ? PJ().rexCaptures.affichage(t, { impression:true }).then(b => slot.appendChild(b)) : null;
  })).then(() => fitToPage(area), () => fitToPage(area));
}

function fitToPage(area, opts) {
  const o = opts || {};
  const portrait = !!o.portrait;
  /* Orientation de la page : une règle @page ajoutée en dernier l'emporte. */
  let st = document.getElementById("print-page");
  if (!st) { st = document.createElement("style"); st.id = "print-page"; document.head.appendChild(st); }
  st.textContent = portrait ? "@page{size:A4 portrait;margin:10mm}" : "@page{size:A4 landscape;margin:8mm}";
  if (o.fit === false) { document.documentElement.style.setProperty("--print-scale", "1"); return; }
  const PAGE_W = portrait ? 720 : 1050, PAGE_H = portrait ? 1040 : 720;   // A4 moins les marges, en px @96dpi
  area.style.cssText = "display:block;position:absolute;left:-99999px;top:0;width:" + PAGE_W + "px";
  const h = area.scrollHeight;
  area.style.cssText = "";
  const scale = Math.max(0.45, Math.min(1, (PAGE_H * 0.97) / (h || 1)));   // petite marge de sécurité
  document.documentElement.style.setProperty("--print-scale", scale.toFixed(3));
}

/* Fiche d'une tâche, à imprimer pour un point ou une réunion (A4 portrait) */
function buildPrintFiche(t, opts) {
  const o = { reunion:true, journal:true, pj:true, ...(opts || {}) };
  const area = $("#print-area");
  if (!t) { area.innerHTML = ""; return; }
  const d = daysUntil(t.echeance);
  const st = STATUTS[t.statut || "en-cours"] || STATUTS["en-cours"];
  const sec = (titre, contenu) => contenu ? `<section class="pf-sec"><h3>${esc(titre)}</h3>${contenu}</section>` : "";
  const para = v => (v || "").trim() ? `<p>${esc(v)}</p>` : "";
  const journal = (t.comments || []).filter(c => !c.deleted).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const liens = t.liens || [], caps = t.captures || [];

  let html = `<div class="p-head">
      <div class="p-title">${esc(t.sujet || "Sans sujet")}</div>
      <div class="p-majin">by Majin</div>
    </div>
    <div class="p-sub"><span>TAF — Travail à Faire · fiche tâche${t.archived ? " · archivée" : ""}</span><span>Édité le ${frDate(todayISO())}</span></div>
    <div class="pf-meta">
      <div><span>${esc(labelOf("statut"))}</span><b>${esc(t.archived ? "Archivée" : st.label)}</b></div>
      <div><span>${esc(labelOf("collaboration"))}</span><b>${esc(t.collaboration || "—")}</b></div>
      <div><span>Créée le</span><b>${esc(frDate(t.date) || "—")}</b></div>
      <div><span>${esc(labelOf("echeance"))}</span><b>${t.echeance ? esc(frDate(t.echeance)) + (d !== null && !t.archived ? (d < 0 ? ` · ${-d} j de retard` : d === 0 ? " · aujourd'hui" : ` · J-${d}`) : "") : "—"}</b></div>
      <div><span>Tags</span><b>${esc((t.tags || []).join(", ") || "—")}</b></div>
    </div>`;
  html += sec(labelOf("objectif"), para(t.objectif));
  html += sec(labelOf("action"), para(t.action));
  html += sec(labelOf("commentaire"), para(t.commentaire));
  if (o.journal) html += sec("Journal de bord", journal.length
    ? journal.map(c => `<p><b>${esc(frDate(c.at.slice(0, 10)))}</b> ${esc(c.texte)}</p>`).join("")
    : `<p class="pf-muted">Aucune entrée pour l'instant.</p>`);
  if (t.archived || (t.rex || "").trim()) html += sec(labelOf("rex"), para(t.rex) || `<p class="pf-muted">REX non rédigé.</p>`);
  if (o.pj && (liens.length || caps.length)) {
    html += `<div class="pf-two">` +
      (liens.length ? sec(`Liens (${liens.length})`, liens.map(l => `<div class="pf-lien"><b>${esc(l.titre)}</b><span>${esc(l.url)}</span></div>`).join("")) : "<div></div>") +
      (caps.length ? sec(`Captures d'écran (${caps.length})`, `<div class="pf-shots">${caps.slice(0, 4).map(c =>
        `<figure><img data-cap="${esc(c.id)}" alt="${esc(c.nom)}"><figcaption>${esc(c.nom)}</figcaption></figure>`).join("")}</div>` +
        (caps.length > 4 ? `<p class="pf-muted">+ ${caps.length - 4} autre(s) dans l'application</p>` : "")) : "") +
      `</div>`;
  }
  if (o.reunion) {
    html += `<section class="pf-meeting">
      <h3>Point du ____ / ____ / ________ &nbsp; avec : ______________________</h3>
      <div class="pf-l">Décisions</div><div class="pf-line"></div><div class="pf-line"></div><div class="pf-line"></div>
      <div class="pf-l">Suite à donner</div>
      <table class="pf-tab"><thead><tr><th style="width:16pt"></th><th>Quoi</th><th style="width:110pt">Qui</th><th style="width:80pt">Pour quand</th></tr></thead>
      <tbody>${'<tr><td><span class="pf-box"></span></td><td></td><td></td><td></td></tr>'.repeat(3)}</tbody></table>
      <div class="pf-l">Nouveau statut</div>
      <div class="pf-st">${STATUT_ORDER.map(k => `<span><span class="pf-box"></span>${esc(STATUTS[k].label)}</span>`).join("")}<span><span class="pf-box"></span>Terminée → REX</span></div>
    </section>`;
  }
  html += `<div class="p-foot"><span>TAF — Travail à Faire · ${esc(t.sujet || "")}</span><span>by Majin</span></div>`;
  area.innerHTML = html;
  fitToPage(area, { portrait:true });

  /* Vignettes des captures : lues dans IndexedDB (ou sur R2), puis nouvelle mise à l'échelle */
  const imgs = $$("img[data-cap]", area);
  if (!imgs.length || !PJ()) return Promise.resolve();
  return Promise.all(imgs.map(img => {
    const meta = caps.find(c => c.id === img.dataset.cap);
    return PJ().piecesJointes.obtenirCapture(meta, t.id).then(enr => {
      if (!enr) { img.replaceWith(el("p", { class:"pf-muted" }, "Image absente de cet appareil")); return; }
      return new Promise(ok => { img.onload = img.onerror = ok; img.src = URL.createObjectURL(enr.vignette || enr.blob); });
    }).catch(() => {});
  })).then(() => fitToPage(area, { portrait:true }));
}

function doPrint(mode, opts) {
  /* buildPrint peut rendre une promesse (images à charger) : on l'attend. */
  Promise.resolve(buildPrint(mode, opts)).catch(() => {}).then(() => setTimeout(() => window.print(), 60));
}

/* ============================================================
   Rappels
   ============================================================ */
function checkReminders() {
  if (!data.settings.reminders) return;
  const lead = Number(data.settings.lead);
  const today = todayISO();
  const due = actives().filter(t => {
    const d = daysUntil(t.echeance);
    return d !== null && d <= lead && t.notifiedFor !== today;
  });
  if (!due.length) return;

  due.forEach(t => { t.notifiedFor = today; });
  save();

  const first = due[0];
  const d = daysUntil(first.echeance);
  const when = d < 0 ? `en retard de ${-d} j` : d === 0 ? "à échéance aujourd'hui" : `à échéance dans ${d} j`;
  const msg = due.length === 1
    ? `« ${first.sujet || "Tâche"} » est ${when}.`
    : `${due.length} tâches arrivent à échéance, dont « ${first.sujet || "Tâche"} ».`;

  toast(msg, "warn", "Voir", () => { setView("taches"); $("#f-echeance").value = "7"; filters.ech = "7"; renderTable(); });

  if ("Notification" in window && Notification.permission === "granted" && !data.sync.pushEndpoint) {
    try {
      new Notification("TAF — rappel d'échéance", { body: msg, icon:"icon-192.png", tag:"taf-rappel" });
    } catch (e) { /* iOS hors PWA */ }
  }
}

/* ============================================================
   Toasts
   ============================================================ */
function toast(msg, kind, actionLabel, action) {
  const t = el("div", { class:"toast" + (kind ? " is-" + kind : "") });
  t.appendChild(el("p", {}, msg));
  if (actionLabel) {
    const b = el("button", {}, actionLabel);
    b.addEventListener("click", () => { action && action(); dismiss(); });
    t.appendChild(b);
  }
  $("#toasts").appendChild(t);
  const timer = setTimeout(dismiss, actionLabel ? 7000 : 3800);
  function dismiss() {
    clearTimeout(timer);
    t.classList.add("is-out");
    setTimeout(() => t.remove(), 300);
  }
}

/* ============================================================
   Réglages
   ============================================================ */
function openCfg() {
  const ul = $("#col-list");
  ul.innerHTML = "";
  cols().forEach(c => {
    const li = el("li", { class:"col-item" });
    const chk = el("input", { type:"checkbox" });
    chk.checked = c.visible;
    chk.addEventListener("change", () => { c.visible = chk.checked; touchMeta(); save(); queueSync(); renderTable(); });
    const txt = el("input", { type:"text", value:c.label, "aria-label":"Intitulé de la colonne" });
    txt.addEventListener("input", () => { c.label = txt.value || c.key; touchMeta(); save(); queueSync(); renderTable(); renderArchives(); });
    li.append(chk, txt, el("span", { class:"grip", title:"Colonne " + c.key }, "▤"));
    ul.appendChild(li);
  });
  renderSyncBlock();
  majEtatCaptures();
  majInfoExportImages();
  updatePushState();
  $("#cfg-intro").checked = data.settings.intro !== false;
  $("#cfg-introson").checked = data.settings.introSon !== false;
  $("#cfg-reminders").checked = data.settings.reminders;
  $("#cfg-lead").value = String(data.settings.lead);
  $("#cfg-sound").checked = data.settings.sound;
  $("#cfg-dense").checked = data.settings.dense;
  $("#cfg-theme").value = data.settings.theme || "auto";
  updateNotifState();
  const bytes = new Blob([JSON.stringify(data)]).size;
  $("#storage-state").textContent = `${live().length} tâche(s) · ${(bytes / 1024).toFixed(1)} Ko dans ce navigateur.`;
  $("#cfg-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
function renderSyncBlock() {
  const on = data.sync.enabled;
  $("#sync-form").hidden = on;
  $("#sync-active").hidden = !on;
  $("#sync-fingerprint").textContent = on ? data.sync.space.slice(0, 8) : "";
  setSyncState(on ? (data.sync.lastAt ? "ok" : "pending") : "off");
}

function closeCfg() {
  $("#cfg-backdrop").hidden = true;
  document.body.style.overflow = "";
}
function updateNotifState() {
  const s = $("#notif-state"), btn = $("#cfg-notif-ask");
  if (!("Notification" in window)) {
    s.textContent = "Ce navigateur ne gère pas les notifications système. Les rappels restent affichés dans l'application.";
    btn.hidden = true; return;
  }
  if (Notification.permission === "granted") { s.textContent = "Notifications système autorisées."; btn.hidden = true; }
  else if (Notification.permission === "denied") { s.textContent = "Notifications refusées dans les réglages du navigateur. Les rappels s'affichent dans l'application."; btn.hidden = true; }
  else { s.textContent = "Les notifications système demandent votre autorisation."; btn.hidden = false; }
}

/* Export / import */
function exportJSON() {
  const avecImages = PJ() && $("#cfg-export-images") && $("#cfg-export-images").checked;
  if (!avecImages) {
    download(`pic-majin-${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
    toast("Sauvegarde exportée.", "ok");
    return;
  }
  /* Même format qu'avant, avec un champ « images » en plus : les anciennes
     versions de TAF l'ignorent, la nouvelle restaure les captures. */
  toast("Préparation de la sauvegarde avec les images…", "ok");
  PJ().sauvegarde.collecterImages(data.tasks.filter(t => !t.deleted)).then(r => {
    download(`pic-majin-${todayISO()}.json`, JSON.stringify({ ...data, images:r.images }), "application/json");
    toast(`Sauvegarde exportée avec ${r.nombre} image(s)` +
      (r.manquantes ? ` · ${r.manquantes} introuvable(s) sur cet appareil` : "") + ".", r.manquantes ? "warn" : "ok");
  }, () => toast("Lecture des images impossible : sauvegarde annulée.", "warn"));
}
function majInfoExportImages() {
  const info = $("#export-images-info");
  if (!info || !PJ()) return;
  const e = PJ().sauvegarde.estimer({ taches: live() });
  info.textContent = e.images
    ? `${e.images} capture(s), environ ${PJ().images.formaterPoids(e.octets)} en plus`
    : "aucune capture pour l'instant";
}
function exportCSV(opts) {
  const c = visCols();
  const head = ["Statut", ...c.map(x => x.label)];
  const source = opts && opts.filtres ? filteredActives() : live();
  const rows = source.map(t => [
    t.archived ? "Archivée" : "En cours",
    ...c.map(x => x.type === "date" ? frDate(t[x.key]) : (t[x.key] || ""))
  ]);
  const csv = [head, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  download(`pic-majin-${todayISO()}.csv`, "\uFEFF" + csv, "text/csv");
  toast("Export CSV prêt (séparateur point-virgule, lisible par Excel).", "ok");
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el("a", { href:url, download:name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(r.result);
    } catch (e) {
      toast("Fichier illisible : ce n'est pas du JSON valide.", "warn");
      return;
    }
    if (!parsed || !Array.isArray(parsed.tasks)) {
      toast("Format inattendu : ce fichier n'est pas un export TAF.", "warn");
      return;
    }

    /* Fusion identique à la synchronisation : la version modifiée
       le plus récemment l'emporte, tâche par tâche. */
    const byId = new Map(data.tasks.map(t => [t.id, t]));
    let added = 0, updated = 0, ignored = 0, tombs = 0;

    parsed.tasks.forEach(t => {
      if (!t || typeof t.id !== "string") return;
      if (t.deleted) tombs++;
      const local = byId.get(t.id);
      if (!local) {
        data.tasks.push({ ...taskDefaults(), ...t });
        byId.set(t.id, t);
        if (!t.deleted) added++;      // une trace de suppression n'est pas un ajout
        return;
      }
      if (String(t.updatedAt || "") > String(local.updatedAt || "")) {
        Object.assign(local, t);
        if (!t.deleted) updated++;
      } else if (!t.deleted) {
        ignored++;
      }
    });

    if (Array.isArray(parsed.columns) && parsed.columns.length) {
      data.columns = DEFAULT_COLUMNS.map(def => {
        const f = parsed.columns.find(c => c.key === def.key);
        return f ? { ...def, label:f.label || def.label, visible:f.visible !== false } : { ...def };
      });
      touchMeta();
    }

    migrateTasks();
    save(); queueSync(); renderAll();

    /* Captures contenues dans la sauvegarde : on complète celles qui manquent ici. */
    if (parsed.images && PJ()) {
      PJ().sauvegarde.restaurerImages(parsed.images, data.tasks.filter(t => !t.deleted)).then(n => {
        if (n) { toast(`${n} capture(s) restaurée(s).`, "ok"); renderAll(); }
      });
    }

    /* Compte rendu honnête : on distingue ce qui a été repris de ce
       qui n'était qu'une trace de suppression. */
    const vivantes = (parsed.tasks || []).filter(t => t && !t.deleted).length;
    const parts = [];
    if (added)   parts.push(`${added} ajoutée(s)`);
    if (updated) parts.push(`${updated} mise(s) à jour`);
    if (ignored) parts.push(`${ignored} déjà à jour`);

    if (!vivantes && tombs) {
      toast(`Fichier lu, mais il ne contient aucune tâche vivante : ${tombs} trace(s) de suppression uniquement.`, "warn");
    } else if (!parts.length) {
      toast("Rien à importer : votre version est déjà la plus récente.", "warn");
    } else {
      toast("Import terminé — " + parts.join(", ") + ".", "ok");
    }
  };
  r.onerror = () => toast("Lecture du fichier impossible.", "warn");
  r.readAsText(file);
}


/* ============================================================
   Import CSV — modèle à compléter dans un tableur
   Séparateur point-virgule ou virgule, détecté automatiquement.
   ============================================================ */

/* Découpage respectant les guillemets et les retours à la ligne internes */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");                 // BOM Excel
  const firstLine = text.slice(0, text.indexOf("\n") > -1 ? text.indexOf("\n") : text.length);
  const sep = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";

  const rows = [];
  let row = [], champ = "", dansGuillemets = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i], suivant = text[i + 1];
    if (dansGuillemets) {
      if (c === '"' && suivant === '"') { champ += '"'; i++; }
      else if (c === '"') dansGuillemets = false;
      else champ += c;
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === sep) {
      row.push(champ); champ = "";
    } else if (c === "\n") {
      row.push(champ); champ = "";
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else if (c !== "\r") {
      champ += c;
    }
  }
  row.push(champ);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

/* Les intitulés sont reconnus sans tenir compte des accents ni de la casse */
const sansAccents = s => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

const ENTETES = {
  date:["date","date de creation","creation"],
  sujet:["sujet","titre","tache","tâche"],
  collaboration:["collaboration","collaborateur","avec","qui"],
  objectif:["objectif","but"],
  echeance:["date d'echeance","echeance","date echeance","deadline","pour le"],
  statut:["statut","etat"],
  action:["action","actions","a faire"],
  commentaire:["commentaire","commentaires","note"],
  score:["difficulte","difficulté","score","etoiles"],
  rex:["rex","retour d'experience","retour"],
  tags:["tags","tag","mots cles","etiquettes"]
};

function cleDepuisEntete(h) {
  const n = sansAccents(h);
  for (const [cle, variantes] of Object.entries(ENTETES)) {
    if (variantes.some(v => sansAccents(v) === n)) return cle;
  }
  return null;
}

/* Accepte 25/08/2026, 25-08-2026 et 2026-08-25 */
function dateDepuisTexte(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

function statutDepuisTexte(v) {
  const n = sansAccents(v).replace(/[\s_]+/g, "-");
  if (!n) return "en-cours";
  if (n.startsWith("en-attente") || n === "attente") return "en-attente";
  if (n.startsWith("bloqu")) return "bloquee";
  if (n.startsWith("delegu")) return "deleguee";
  return "en-cours";
}

function scoreDepuisTexte(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const etoiles = (s.match(/★/g) || []).length;
  if (etoiles) return Math.min(5, etoiles);
  const n = parseInt(s, 10);
  return (n >= 1 && n <= 5) ? n : null;
}

function importCSV(file) {
  const r = new FileReader();
  r.onload = () => {
    const rows = parseCSV(String(r.result));
    if (rows.length < 2) {
      toast("Fichier vide : il faut une ligne d'intitulés puis au moins une tâche.", "warn");
      return;
    }

    const entetes = rows[0].map(cleDepuisEntete);
    if (!entetes.includes("sujet")) {
      toast("Colonne « Sujet » introuvable. Repartez du modèle fourni.", "warn");
      return;
    }

    const now = new Date().toISOString();
    let ajoutees = 0, ignorees = 0;

    rows.slice(1).forEach(cells => {
      const brut = {};
      entetes.forEach((cle, i) => { if (cle) brut[cle] = (cells[i] || "").trim(); });

      if (!brut.sujet) { ignorees++; return; }        // une tâche sans sujet n'a pas de sens

      data.tasks.unshift({
        ...taskDefaults(),
        id: uid(),
        date: dateDepuisTexte(brut.date) || todayISO(),
        sujet: brut.sujet,
        collaboration: brut.collaboration || "",
        objectif: brut.objectif || "",
        echeance: dateDepuisTexte(brut.echeance),
        statut: statutDepuisTexte(brut.statut),
        action: brut.action || "",
        commentaire: brut.commentaire || "",
        score: scoreDepuisTexte(brut.score),
        rex: brut.rex || "",
        tags: (brut.tags || "").split(/[,;|]/).map(s => s.trim()).filter(Boolean),
        archived: false,
        createdAt: now,
        updatedAt: now
      });
      ajoutees++;
    });

    if (!ajoutees) {
      toast("Aucune ligne exploitable : la colonne Sujet est vide partout.", "warn");
      return;
    }
    save(); queueSync(); renderAll();
    toast(`${ajoutees} tâche(s) importée(s)` +
          (ignorees ? `, ${ignorees} ligne(s) sans sujet ignorée(s).` : "."), "ok");
  };
  r.onerror = () => toast("Lecture du fichier impossible.", "warn");
  r.readAsText(file, "UTF-8");
}

/* Modèle généré à partir de vos intitulés de colonnes du moment */
function telechargerModele() {
  const entetes = ["Date", labelOf("sujet"), labelOf("collaboration"), labelOf("objectif"),
                   "Date d'échéance", "Statut", labelOf("action"), labelOf("commentaire"),
                   "Difficulté", "Tags", labelOf("rex")];

  const exemples = [
    [frDate(todayISO()), "Préparer la réunion de lancement", "Laurence", "Cadrer le périmètre",
     frDate(todayISO(Date.now() + 7 * 864e5)), "En cours", "Rédiger l'ordre du jour",
     "Support à diffuser 48 h avant", "3", "cadrage,réunion", ""],
    [frDate(todayISO()), "Récupérer la capsule", "Yohan", "Déployer sur la plateforme",
     frDate(todayISO(Date.now() + 14 * 864e5)), "En attente", "Relancer le fournisseur",
     "", "", "déploiement", ""]
  ];

  const ligne = arr => arr.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";");
  const csv = [ligne(entetes), ...exemples.map(ligne)].join("\r\n");

  download(`modele-taches-TAF.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
  toast("Modèle téléchargé. Remplissez-le, puis réimportez-le avec « Importer… ».", "ok");
}

/* ============================================================
   Notes en attente
   Ce qui n'est pas encore une tâche : une idée, une relance,
   un point à creuser. Une note se transforme en tâche d'un clic.
   ============================================================ */
function addNote(text) {
  const v = String(text || "").trim();
  if (!v) return false;
  const now = new Date().toISOString();
  data.tasks.unshift({ id:"n" + uid(), kind:"note", texte:v, createdAt:now, updatedAt:now });
  save(); queueSync(); renderNotes();
  return true;
}

function deleteNote(id) {
  const n = data.tasks.find(t => t.id === id);
  if (!n) return;
  n.deleted = true;
  n.deletedAt = new Date().toISOString();
  touch(n);
  save(); queueSync(); renderNotes();
  lastUndo = { type:"delete", id };
  toast("Note supprimée.", "warn", "Annuler", () => {
    const t = data.tasks.find(x => x.id === id);
    if (t) { delete t.deleted; delete t.deletedAt; touch(t); save(); queueSync(); renderNotes(); }
  });
}

/* La note devient une tâche : son texte passe en sujet, la date du jour
   est posée, et le curseur atterrit sur la collaboration à renseigner. */
function noteToTask(id) {
  const n = data.tasks.find(t => t.id === id);
  if (!n) return;
  const now = new Date().toISOString();
  const t = {
    id:uid(), date:todayISO(), sujet:n.texte, collaboration:"", objectif:"",
    echeance:"", action:"", commentaire:"", rex:"",
    archived:false, createdAt:now, updatedAt:now
  };
  data.tasks.unshift(t);
  n.deleted = true;
  n.deletedAt = now;
  touch(n);
  save(); queueSync();

  setView("taches");
  renderTable(); renderNotes(); renderBoard();
  const tr = $(`tr[data-id="${t.id}"]`);
  if (tr) tr.scrollIntoView({ block:"center", behavior:"smooth" });
  openEditorFor(t.id, "collaboration");
  toast(`« ${t.sujet} » est devenue une tâche. Complétez la collaboration et l'échéance.`, "ok");
}

function renderNotes() {
  const list = notes();
  const box = $("#notes-list");
  if (!box) return;
  box.innerHTML = "";
  $("#notes-count").textContent = list.length;
  $("#notes-empty").hidden = list.length > 0;

  list.forEach((n, i) => {
    const li = el("li", { class:"note", "data-id":n.id });
    li.style.animationDelay = Math.min(i * 25, 300) + "ms";
    li.appendChild(el("span", { class:"note-tick" }));
    li.appendChild(el("span", {
      class:"note-text", "data-act":"edit", tabindex:"0", role:"button",
      title:"Cliquez pour modifier"
    }, n.texte));
    const acts = el("span", { class:"note-acts" });
    acts.appendChild(el("button", { class:"mini-btn", "data-act":"convert" }, "En faire une tâche"));
    acts.appendChild(el("button", { class:"note-x", "data-act":"del", title:"Supprimer la note", "aria-label":"Supprimer la note" }, "✕"));
    li.appendChild(acts);
    box.appendChild(li);
  });
}

function editNote(id) {
  const n = data.tasks.find(t => t.id === id);
  const li = $(`.note[data-id="${id}"]`);
  if (!n || !li) return;
  const span = $(".note-text", li);
  const input = el("input", { type:"text", class:"note-editor" });
  input.value = n.texte;
  span.replaceWith(input);
  input.focus(); input.select();

  let closed = false;
  const commit = () => {
    if (closed) return;
    closed = true;
    const v = input.value.trim();
    if (!v) { deleteNote(id); return; }
    if (v !== n.texte) { n.texte = v; touch(n); save(); queueSync(); }
    renderNotes();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); closed = true; renderNotes(); }
  });
}


/* ── Panneau détail v2 : statut, tags, score, récurrence, liens, fil ── */
function buildSheetExtra(t, body) {
  // Récurrence
  const recWrap = el("div", { class:"form-field" });
  recWrap.appendChild(el("label", {}, "Récurrence après archivage"));
  const recSel = el("select", { id:"f-rec" });
  [["","Aucune"],["semaine","Chaque semaine"],["mois","Chaque mois"],["trimestre","Chaque trimestre"]]
    .forEach(([v, l]) => {
      const o = el("option", { value:v }, l);
      if ((t.recurrence && t.recurrence.freq) === v || (!t.recurrence && v === "")) o.selected = true;
      recSel.appendChild(o);
    });
  recSel.addEventListener("change", () => {
    t.recurrence = recSel.value ? { freq:recSel.value, count:(t.recurrence||{}).count||0 } : null;
    touch(t); save(); queueSync();
  });
  recWrap.appendChild(recSel); body.appendChild(recWrap);

  // Liens vers d'autres tâches
  const lkWrap = el("div", { class:"form-field" });
  lkWrap.appendChild(el("label", {}, "Lié à d'autres tâches"));
  const lkList = el("ul", { class:"link-list" });
  renderLinks(t, lkList);
  lkWrap.appendChild(lkList);
  const lkAdd = el("select", { class:"link-add-sel", "aria-label":"Ajouter un lien" });
  lkAdd.appendChild(el("option", { value:"" }, "Relier à…"));
  actives().filter(x => x.id !== t.id && !(t.linkedTo||[]).includes(x.id)).forEach(x => {
    lkAdd.appendChild(el("option", { value:x.id }, x.sujet || x.id));
  });
  lkAdd.addEventListener("change", () => {
    if (!lkAdd.value) return;
    t.linkedTo = [...new Set([...(t.linkedTo||[]), lkAdd.value])];
    touch(t); save(); queueSync(); renderLinks(t, lkList);
    lkAdd.querySelector("option[value='']").selected = true;
    lkAdd.querySelector(`option[value="${lkAdd.value}"]`)?.remove();
  });
  lkWrap.appendChild(lkAdd); body.appendChild(lkWrap);

  // Fil de commentaires
  const cmWrap = el("div", { class:"form-field" });
  cmWrap.appendChild(el("label", {}, "Journal de bord"));
  const cmFil = el("div", { class:"comment-fil" });
  renderComments(t, cmFil);
  cmWrap.appendChild(cmFil);
  const cmAdd = el("div", { class:"comment-add" });
  const cmIn = el("textarea", { placeholder:"Ajouter une note horodatée…", rows:"2" });
  const cmBtn = el("button", { class:"primary-btn", style:"align-self:flex-end" }, "Ajouter");
  cmBtn.addEventListener("click", () => {
    const v = cmIn.value.trim(); if (!v) return;
    const now = new Date().toISOString();
    const cmt = { id:uid(), texte:v, at:now, updatedAt:now };
    t.comments = [...(t.comments||[]), cmt];
    touch(t); save(); queueSync();
    cmIn.value = ""; renderComments(t, cmFil);
  });
  cmIn.addEventListener("keydown", e => {
    if ((e.ctrlKey||e.metaKey) && e.key==="Enter") { e.preventDefault(); cmBtn.click(); }
  });
  cmAdd.append(cmIn, cmBtn); cmWrap.append(cmAdd); body.appendChild(cmWrap);
}

function renderLinks(t, ul) {
  ul.innerHTML = "";
  (t.linkedTo||[]).forEach(id => {
    const linked = data.tasks.find(x => x.id === id);
    if (!linked) return;
    const li = el("li", { class:"link-item" });
    li.appendChild(el("span", {}, linked.sujet || id));
    const rm = el("button", { class:"note-x", title:"Retirer le lien" }, "✕");
    rm.addEventListener("click", () => {
      t.linkedTo = (t.linkedTo||[]).filter(x => x !== id);
      touch(t); save(); queueSync(); renderLinks(t, ul);
    });
    li.appendChild(rm); ul.appendChild(li);
  });
  if (!(t.linkedTo||[]).length) {
    ul.appendChild(el("li", { class:"cfg-note" }, "Aucun lien."));
  }
}

function renderComments(t, fil) {
  fil.innerHTML = "";
  const list = (t.comments||[]).filter(c => !c.deleted)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  list.forEach(c => {
    const div = el("div", { class:"comment" });
    div.appendChild(el("span", { class:"comment-when" }, frDate(c.at.slice(0,10)) + " " + c.at.slice(11,16)));
    div.appendChild(el("p", { class:"comment-text" }, c.texte));
    const rm = el("button", { class:"note-x", title:"Supprimer" }, "✕");
    rm.addEventListener("click", () => {
      c.deleted = true; touch(t); save(); queueSync(); renderComments(t, fil);
    });
    div.appendChild(rm); fil.appendChild(div);
  });
  if (!list.length) fil.appendChild(el("p", { class:"cfg-note" }, "Aucune note pour l'instant."));
}

function refreshTagSelects() {
  const allTags = [...new Set(live().flatMap(t => t.tags||[]))].sort();
  ["f-tag","f-tag-arch"].forEach(id => {
    const sel = $("#"+id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = "";
    sel.appendChild(el("option", { value:"" }, "Tag"));
    allTags.forEach(tg => {
      const o = el("option", { value:tg }, tg);
      if (tg === cur) o.selected = true;
      sel.appendChild(o);
    });
  });
}



/* ============================================================
   Vue Kanban — colonnes par statut
   ============================================================ */
function renderKanban() {
  const board = $("#kanban-board");
  if (!board) return;
  board.innerHTML = "";
  const list = filteredActives();
  const cols = [
    { key:"en-cours",   label:"En cours" },
    { key:"en-attente", label:"En attente" },
    { key:"bloquee",    label:"Bloquée" },
    { key:"deleguee",   label:"Déléguée" }
  ];
  cols.forEach(col => {
    const items = list.filter(t => (t.statut || "en-cours") === col.key);
    const colEl = el("section", { class:"kb-col", "data-st":col.key, "aria-label":col.label });
    const hd = el("div", { class:"kb-head" });
    hd.style.borderBottomColor = STATUTS[col.key].color;
    hd.appendChild(el("h3", { class:"kb-title" }, col.label));
    hd.appendChild(el("span", { class:"kb-n" }, String(items.length)));
    colEl.appendChild(hd);
    const drop = el("div", { class:"kb-drop" });
    items.forEach(t => {
      const card = el("article", { class:"kb-card", "data-id":t.id,
        draggable:"true", tabindex:"0", role:"button", "aria-label":"Ouvrir « " + (t.sujet || "Sans sujet") + " »" });
      if ((t.tags || []).length) {
        const tg = el("div", { class:"kb-tags" });
        t.tags.forEach(x => tg.appendChild(el("span", { class:tagCls(x) }, x)));
        card.appendChild(tg);
      }
      card.appendChild(el("p", { class:"kb-sujet" }, t.sujet || "Sans sujet"));
      if (t.score) card.appendChild(el("span", { class:"kb-score", title:t.score + " sur 5" }, "★".repeat(t.score)));
      const foot = el("div", { class:"kb-foot" });
      if (t.collaboration) foot.appendChild(el("span", { class:"avatar", "aria-hidden":"true" }, initials(t.collaboration)));
      foot.appendChild(el("span", { class:"kb-collab" }, t.collaboration || ""));
      const r = relOf(t.echeance);
      foot.appendChild(r ? el("span", { class:r.cls }, r.label) : el("span", { class:"no-date" }, "Sans date"));
      card.appendChild(foot);
      if (PJ() && aDesPJ(t)) card.appendChild(PJ().piecesJointes.indicateurs(t));
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(t.id); } });
      // drag
      card.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", t.id);
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
      card.addEventListener("click", () => openSheet(t.id));
      drop.appendChild(card);
    });
    // drop target
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("kb-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("kb-over"));
    drop.addEventListener("drop", e => {
      e.preventDefault(); drop.classList.remove("kb-over");
      const id = e.dataTransfer.getData("text/plain");
      const task = data.tasks.find(x => x.id === id);
      if (task && task.statut !== col.key) {
        task.statut = col.key; touch(task); save(); queueSync();
        renderView(); renderBoard();
      }
    });
    if (!items.length) drop.appendChild(el("div", { class:"kb-empty" }, "Glissez une tâche ici"));
    colEl.appendChild(drop);
    board.appendChild(colEl);
  });
}


/* ============================================================
   Partage en lecture seule
   ============================================================ */
const SHARE_KEY = "taf-share-token";

function openSharePanel() {
  const existing = data.sync.shareToken;
  const pnl = $("#share-panel");
  if (!pnl) return;
  pnl.innerHTML = "";
  if (existing) {
    const url = location.origin + "/?share=" + existing;
    pnl.appendChild(el("p", { class:"cfg-note" },
      "Partagez ce lien en lecture seule. Tous ceux qui l'ont peuvent voir vos tâches en cours, sans pouvoir les modifier."));
    const row = el("div", { class:"sound-pick" });
    const inp = el("input", { type:"text", value:url, readonly:"true" });
    const cp = el("button", { class:"ghost-btn" }, "Copier");
    cp.addEventListener("click", () => {
      navigator.clipboard.writeText(url).catch(() => {});
      cp.textContent = "Copié"; setTimeout(() => cp.textContent = "Copier", 1400);
    });
    row.append(inp, cp); pnl.appendChild(row);
    const rm = el("button", { class:"danger-btn", style:"margin-top:10px" }, "Révoquer le lien");
    rm.addEventListener("click", () => {
      data.sync.shareToken = null; save(); queueSync(); openSharePanel();
      toast("Lien révoqué. L'ancienne URL ne fonctionne plus.", "ok");
    });
    pnl.appendChild(rm);
  } else {
    pnl.appendChild(el("p", { class:"cfg-note" },
      "Créez un lien public en lecture seule pour permettre à un collègue de suivre vos tâches sans accéder aux réglages."));
    const btn = el("button", { class:"primary-btn" }, "Créer un lien de partage");
    btn.addEventListener("click", async () => {
      const token = uid() + uid();
      data.sync.shareToken = token;
      save(); queueSync();
      if (data.sync.enabled) {
        try {
          await fetch("/api/sync", {
            method:"POST", headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({ space:data.sync.space, tasks:data.tasks,
              meta:{ columns:data.columns, settings:{}, updatedAt:data.metaUpdatedAt },
              shareToken:token })
          });
        } catch(e) { /* hors ligne */ }
      }
      openSharePanel();
    });
    pnl.appendChild(btn);
  }
}

/* Lecture seule : on vérifie si on est en mode partage */
function checkShareMode() {
  const url = new URL(location.href);
  const token = url.searchParams.get("share");
  if (!token) return false;
  document.body.classList.add("is-share");
  document.title = "TAF — Vue partagée";
  loadSharedView(token);
  return true;
}

async function loadSharedView(token) {
  const msg = el("div", { class:"share-loading" }, "Chargement de la vue partagée…");
  document.body.innerHTML = ""; document.body.appendChild(msg);
  try {
    const r = await fetch("/api/share/" + token);
    if (!r.ok) throw new Error("Lien invalide ou expiré.");
    const d = await r.json();
    renderReadOnly(d.tasks || [], d.columns || []);
  } catch(e) {
    msg.textContent = "Lien invalide ou expiré. Demandez un nouveau lien au propriétaire.";
  }
}

function renderReadOnly(tasks, cols) {
  document.body.innerHTML = `
    <header class="app-head"><div class="app-head-in">
      <div class="logo-square"><span>TAF</span></div>
      <div class="head-titles">
        <h1>Travail à Faire</h1>
        <p class="head-sub" style="color:var(--o-yellow)">Vue en lecture seule</p>
      </div>
      <div class="majin-block">by Majin</div>
    </div></header>
    <main class="app-main" id="share-main"></main>`;
  const main = document.getElementById("share-main");
  const actives = tasks.filter(t => !t.deleted && !t.archived);
  if (!actives.length) { main.innerHTML = "<p style='padding:40px;color:var(--o-grey-2)'>Aucune tâche en cours à afficher.</p>"; return; }
  const wrap = el("div", { class:"table-scroll", style:"border:2px solid var(--o-black)" });
  const table = el("table", { class:"pic-table" });
  const thead = el("thead"); const tr = el("tr");
  tr.appendChild(el("th", {}, "Statut"));
  (cols.length ? cols : []).filter(c => c.visible).forEach(c => tr.appendChild(el("th",{},c.label)));
  thead.appendChild(tr); table.appendChild(thead);
  const tbody = el("tbody");
  actives.forEach(t => {
    const row = el("tr");
    const st = STATUTS[t.statut||"en-cours"]||STATUTS["en-cours"];
    const td0 = el("td", {}); td0.appendChild(el("span",{class:"statut-badge badge-" + (t.statut||"en-cours")},st.label));
    row.appendChild(td0);
    (cols.length ? cols : []).filter(c => c.visible).forEach(c => {
      const v = c.type==="date" ? frDate(t[c.key]) : (t[c.key]||"—");
      row.appendChild(el("td",{},v));
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody); wrap.appendChild(table); main.appendChild(wrap);
}

/* ============================================================
   Synchronisation multi-appareils (Cloudflare D1)
   Le code d'espace ne quitte jamais l'appareil : seul son
   empreinte SHA-256 est envoyée au serveur.
   ============================================================ */
let syncTimer = null, syncing = false;

async function spaceHash(passphrase) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pic:" + passphrase));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function setSyncState(state, detail) {
  const dot = $("#sync-dot");
  if (!dot) return;
  const labels = {
    off:"Synchronisation désactivée",
    ok:"Synchronisé",
    running:"Synchronisation en cours…",
    pending:"Modifications en attente",
    offline:"Hors ligne — sauvegarde locale",
    error:"Échec de la synchronisation"
  };
  dot.className = "sync-status is-" + state;
  const court = { off:"Sur cet appareil", ok:"Synchronisé", running:"Synchronisation…",
                  pending:"En attente", offline:"Hors ligne", error:"Échec de synchro" };
  const txt = $("#sync-txt");
  if (txt) txt.textContent = court[state] || state;
  const when = data.sync.lastAt ? " · dernier échange à " + new Date(data.sync.lastAt).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "";
  dot.title = (labels[state] || state) + (detail ? " — " + detail : "") + when +
              (data.sync.enabled ? " · cliquer pour synchroniser" : " · cliquer pour l'activer");
  const line = $("#sync-state");
  if (line) line.textContent = (labels[state] || state) + (detail ? " — " + detail : "") + when;
}

function queueSync() {
  if (!data.sync.enabled) return;
  setSyncState("pending");
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(true), 1500);
}

function settingsForSync() {
  return { reminders:data.settings.reminders, lead:data.settings.lead };
}

async function syncNow(silent) {
  if (!data.sync.enabled || !data.sync.space) return;
  if (syncing) return;
  if (!navigator.onLine) { setSyncState("offline"); return; }
  syncing = true;
  setSyncState("running");
  try {
    const res = await fetch(API + "/sync", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        space: data.sync.space,
        tasks: data.tasks,
        meta: { columns:data.columns, settings:settingsForSync(), updatedAt:data.metaUpdatedAt }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || ("HTTP " + res.status));
    }
    const payload = await res.json();
    const changed = mergeRemote(payload);
    data.sync.lastAt = payload.serverTime || new Date().toISOString();
    save();
    setSyncState("ok");
    if (changed) { renderAll(); if (!silent) toast("Données à jour sur cet appareil.", "ok"); }
    else if (!silent) toast("Tout est déjà synchronisé.", "ok");
  } catch (e) {
    setSyncState(navigator.onLine ? "error" : "offline", String(e.message || e));
    if (!silent) toast("Synchronisation impossible : " + (e.message || e), "warn");
  } finally {
    syncing = false;
  }
}

/* Fusion : la version la plus récemment modifiée gagne, tâche par tâche. */
function mergeRemote(payload) {
  let changed = false;
  const byId = new Map(data.tasks.map(t => [t.id, t]));

  (payload.tasks || []).forEach(r => {
    if (!r || !r.id) return;
    const local = byId.get(r.id);
    if (!local) { data.tasks.push(r); changed = true; return; }
    const a = String(r.updatedAt || ""), b = String(local.updatedAt || "");
    if (a > b) { Object.assign(local, r); changed = true; }
  });

  const m = payload.meta;
  if (m && m.updatedAt && String(m.updatedAt) > String(data.metaUpdatedAt)) {
    if (Array.isArray(m.columns) && m.columns.length) {
      data.columns = DEFAULT_COLUMNS.map(def => {
        const f = m.columns.find(c => c.key === def.key);
        return f ? { ...def, label:f.label || def.label, visible:f.visible !== false } : { ...def };
      });
    }
    if (m.settings) {
      if (typeof m.settings.lead === "number") data.settings.lead = m.settings.lead;
      if (typeof m.settings.reminders === "boolean") data.settings.reminders = m.settings.reminders;
    }
    data.metaUpdatedAt = m.updatedAt;
    changed = true;
  }
  return changed;
}

/* Les captures utilisent le même code d'espace que la synchro D1.
   Elles ne partent vers R2 que si le projet a la liaison TAF_CAPTURES
   (vérifié via /api/ping) ; sinon elles restent sur l'appareil. */
async function configurerCaptures() {
  if (!PJ() || !PJ().capturesSync) return;
  const s = PJ().capturesSync;
  if (!data.sync.enabled || !data.sync.space) {
    s.configurer({ espace:"" });
    majEtatCaptures();
    return;
  }
  let r2 = data.sync.r2 === true;          // hors ligne : dernier état connu
  try {
    const r = await fetch(API + "/ping", { cache:"no-store" });
    if (r.ok) { r2 = !!(await r.json()).r2; }
  } catch (e) { /* hors ligne */ }
  if (data.sync.r2 !== r2) { data.sync.r2 = r2; save(); }
  s.configurer({ url: API + "/captures", espace: r2 ? data.sync.space : "" });
  majEtatCaptures();
  if (r2) s.toutSynchroniser(live(), t => { touch(t); save(); queueSync(); }).then(majEtatCaptures);
}
function majEtatCaptures() {
  const line = $("#captures-state");
  if (!line || !PJ() || !PJ().capturesSync) return;
  const s = PJ().capturesSync;
  if (!data.sync.enabled) { line.textContent = ""; return; }
  if (!s.estActif()) {
    line.textContent = "Captures d'écran : sur cet appareil uniquement (aucun bucket R2 relié au projet, voir docs/CLOUDFLARE-R2.md).";
    return;
  }
  const attente = s.enAttente(live());
  line.textContent = attente
    ? `Captures d'écran : ${attente} en attente d'envoi vers R2.`
    : "Captures d'écran : disponibles sur tous vos appareils (Cloudflare R2).";
}

async function enableSync(passphrase) {
  const code = String(passphrase || "").trim();
  if (code.length < 8) { toast("Le code d'espace doit faire au moins 8 caractères.", "warn"); return false; }
  data.sync.space = await spaceHash(code);
  data.sync.enabled = true;
  touchMeta();
  save();
  await writeSpaceForWorker();
  await syncNow(false);
  configurerCaptures();
  return true;
}

function disableSync() {
  data.sync.enabled = false;
  data.sync.space = "";
  data.sync.lastAt = null;
  save();
  configurerCaptures();
  setSyncState("off");
  toast("Synchronisation désactivée. Les données restent sur cet appareil.", "ok");
}

/* Le service worker a besoin de l'espace pour composer la notification. */
async function writeSpaceForWorker() {
  if (!("caches" in window)) return;
  try {
    const c = await caches.open("pic-meta");
    await c.put("/__pic/space", new Response(data.sync.space || ""));
  } catch (e) { /* sans importance */ }
}

/* ============================================================
   Rappels poussés (Web Push)
   ============================================================ */
function b64ToBytes(base64) {
  const pad = "=".repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Ce navigateur ne gère pas les rappels poussés. Sur iPhone, ajoutez d'abord TAF à l'écran d'accueil.", "warn");
    return;
  }
  if (!data.sync.enabled) { toast("Activez d'abord la synchronisation : les rappels s'appuient dessus.", "warn"); return; }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast("Autorisation refusée. Les rappels resteront dans l'application.", "warn"); updatePushState(); return; }

  try {
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await (await fetch(API + "/push/vapid")).json();
    if (!publicKey) throw new Error("clé serveur absente");

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(publicKey)
    });
    const res = await fetch(API + "/push/subscribe", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ space:data.sync.space, subscription:sub.toJSON() })
    });
    if (!res.ok) throw new Error("enregistrement refusé");

    data.sync.pushEndpoint = sub.endpoint;
    save();
    await writeSpaceForWorker();
    toast("Rappels activés. Vous serez prévenu chaque matin, application fermée.", "ok");
  } catch (e) {
    toast("Activation impossible : " + (e.message || e), "warn");
  }
  updatePushState();
}

async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(API + "/push/unsubscribe", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint })
      }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch (e) { /* déjà parti */ }
  data.sync.pushEndpoint = null;
  save();
  updatePushState();
  toast("Rappels poussés désactivés.", "ok");
}

async function updatePushState() {
  const line = $("#push-state"), on = $("#btn-push-on"), off = $("#btn-push-off");
  if (!line) return;
  if (!("PushManager" in window)) {
    line.textContent = "Rappels poussés indisponibles ici. Sur iPhone, ajoutez TAF à l'écran d'accueil puis rouvrez ce réglage.";
    if (on) on.hidden = true; if (off) off.hidden = true;
    return;
  }
  let active = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    active = !!(await reg.pushManager.getSubscription());
  } catch (e) { active = false; }
  line.textContent = active
    ? "Rappels actifs : une notification chaque matin si une échéance approche, même application fermée."
    : "Inactifs. Les rappels ne s'affichent que si TAF est ouvert.";
  if (on) on.hidden = active;
  if (off) off.hidden = !active;
}

/* ============================================================
   Synthèse REX par période
   ============================================================ */
function periodBounds(range) {
  const now = new Date();
  const y = now.getFullYear(), q = Math.floor(now.getMonth() / 3);
  const mk = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);

  if (range === "q-current") return { from:mk(y, q * 3, 1), to:mk(y, q * 3 + 3, 0), label:`T${q + 1} ${y}` };
  if (range === "q-prev") {
    const pq = q === 0 ? 3 : q - 1, py = q === 0 ? y - 1 : y;
    return { from:mk(py, pq * 3, 1), to:mk(py, pq * 3 + 3, 0), label:`T${pq + 1} ${py}` };
  }
  if (range === "year") return { from:mk(y, 0, 1), to:mk(y, 12, 0), label:`Année ${y}` };
  return { from:"0000-01-01", to:"9999-12-31", label:"Depuis le début" };
}

function synthData(range) {
  const b = periodBounds(range);
  const list = archived().filter(t => {
    const d = String(t.archivedAt || "").slice(0, 10);
    return d && d >= b.from && d <= b.to;
  }).sort((x, y) => String(x.archivedAt).localeCompare(String(y.archivedAt)));

  const delays = list.map(leadTime).filter(v => v !== null);
  const groups = {};
  list.forEach(t => {
    const k = (t.collaboration || "").trim() || "Sans collaboration";
    (groups[k] = groups[k] || []).push(t);
  });

  return {
    bounds:b, list, groups,
    stats:{
      closes:list.length,
      avec:list.filter(t => (t.rex || "").trim()).length,
      collabs:Object.keys(groups).length,
      moyen:delays.length ? Math.round(delays.reduce((s, v) => s + v, 0) / delays.length) : null
    }
  };
}

let synthRange = "q-current";

function openSynth() {
  $("#synth-range").value = synthRange;
  renderSynth();
  $("#synth-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSynth() {
  $("#synth-backdrop").hidden = true;
  document.body.style.overflow = "";
}

function renderSynth() {
  const d = synthData(synthRange);
  $("#synth-title").textContent = "Synthèse REX — " + d.bounds.label;
  const box = $("#synth-body");
  box.innerHTML = "";

  if (!d.list.length) {
    box.appendChild(el("p", { class:"synth-empty" },
      "Aucune tâche archivée sur cette période. Choisissez une période plus large."));
    $("#synth-print").disabled = true;
    return;
  }
  $("#synth-print").disabled = false;

  const stats = el("div", { class:"synth-stats" });
  [
    [d.stats.closes, "tâches closes"],
    [d.stats.avec + " / " + d.stats.closes, "REX rédigés"],
    [d.stats.collabs, "collaborations"],
    [d.stats.moyen === null ? "—" : d.stats.moyen + " j", "délai moyen"]
  ].forEach(([n, l]) => {
    const s = el("div", { class:"synth-stat" });
    s.appendChild(el("strong", {}, String(n)));
    s.appendChild(el("span", {}, l));
    stats.appendChild(s);
  });
  box.appendChild(stats);

  Object.entries(d.groups)
    .sort((a, b2) => b2[1].length - a[1].length)
    .forEach(([name, items]) => {
      const sec = el("section", { class:"synth-group" });
      const h = el("h3", { class:"synth-group-title" });
      h.append(name, el("span", { class:"synth-group-n" }, items.length + " tâche" + (items.length > 1 ? "s" : "")));
      sec.appendChild(h);
      items.forEach(t => {
        const it = el("article", { class:"synth-item" + ((t.rex || "").trim() ? "" : " is-void") });
        const head = el("div", { class:"synth-item-head" });
        head.appendChild(el("strong", {}, t.sujet || "Sans sujet"));
        head.appendChild(el("span", { class:"synth-when" },
          frDate(String(t.archivedAt).slice(0, 10)) + (leadTime(t) !== null ? " · " + leadTime(t) + " j" : "")));
        it.appendChild(head);
        if (t.objectif) it.appendChild(el("p", { class:"synth-obj" }, labelOf("objectif") + " : " + t.objectif));
        it.appendChild(el("p", { class:"synth-rex" },
          (t.rex || "").trim() || "REX non rédigé."));
        if (PJ() && PJ().rexCaptures.aDesCapturesRex(t)) {
          const slot = el("div", { class:"rex-captures" });
          it.appendChild(slot);
          PJ().rexCaptures.affichage(t).then(b => slot.appendChild(b));
        }
        sec.appendChild(it);
      });
      box.appendChild(sec);
    });
}

/* ============================================================
   Navigation & événements
   ============================================================ */
/* ============================================================
   Exporter et imprimer — une seule fenêtre pour tous les documents
   ============================================================ */
const EXPORT_DOCS = [
  { k:"liste", title:"Liste des tâches", desc:"Le tableau, tel qu'à l'écran", fmts:["pdf", "csv"], land:true },
  { k:"bord",  title:"Tableau de bord", desc:"Chiffres clés, graphiques, échéances", fmts:["pdf"], land:true },
  { k:"synth", title:"Synthèse REX", desc:"Les retours d'expérience d'une période", fmts:["pdf"], land:true },
  { k:"fiche", title:"Fiche tâche", desc:"Une tâche, pour un point ou une réunion", fmts:["pdf"], land:false },
  { k:"sauv",  title:"Sauvegarde complète", desc:"Tout TAF dans un seul fichier, images comprises", fmts:["json"], land:false }
];
const exp = {
  doc:"liste", fmt:"pdf", tache:null,
  liste:{ filtres:true, grouper:true, notes:true, blancs:true, unePage:true },
  bord:{ prochaines:true, points:false },
  synth:{ contexte:true, journal:true, vides:true, captures:true },
  fiche:{ reunion:true, journal:true, pj:true },
  sauv:{ actives:true, archives:true, images:true }
};

function openExport(doc, tacheId) {
  if (doc) exp.doc = doc;
  if (tacheId) exp.tache = tacheId;
  renderExport();
  $("#export-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
  const on = $("#export-docs .doc.is-on");
  if (on) on.focus();
}
function closeExport() {
  $("#export-backdrop").hidden = true;
  if ($("#sheet-backdrop").hidden && $("#cfg-backdrop").hidden && $("#synth-backdrop").hidden) document.body.style.overflow = "";
}

function renderExport() {
  const cur = EXPORT_DOCS.find(d => d.k === exp.doc) || EXPORT_DOCS[0];
  if (!cur.fmts.includes(exp.fmt)) exp.fmt = cur.fmts[0];

  /* Liste des documents */
  const docs = $("#export-docs");
  docs.innerHTML = "";
  EXPORT_DOCS.forEach(d => {
    const b = el("button", { type:"button", class:"doc" + (d.k === cur.k ? " is-on" : ""), "aria-pressed": String(d.k === cur.k) });
    const t = el("span", { style:"flex:1" });
    t.append(el("span", { class:"dt" }, d.title), el("span", { class:"dd" }, d.desc));
    b.appendChild(t);
    b.addEventListener("click", () => { exp.doc = d.k; renderExport(); $("#export-docs .doc.is-on").focus(); });
    docs.appendChild(b);
  });

  /* Options */
  const box = $("#export-opts");
  box.innerHTML = "";
  const fmtWrap = el("div");
  fmtWrap.appendChild(el("span", { class:"lbl" }, "Format"));
  const grp = el("div", { class:"seg-group", role:"group", "aria-label":"Format" });
  const FL = { pdf:"PDF", csv:"CSV (Excel)", json:"JSON" };
  cur.fmts.forEach(f => {
    const b = el("button", { type:"button", class:"seg", "aria-pressed": String(f === exp.fmt) }, FL[f]);
    b.addEventListener("click", () => { exp.fmt = f; renderExport(); });
    grp.appendChild(b);
  });
  fmtWrap.appendChild(grp);
  const NOTES = {
    pdf:"Mise en page Charte Orange, prête à imprimer ou à enregistrer en PDF depuis la fenêtre d'impression.",
    csv:"Point-virgule, accents conservés : s'ouvre directement dans Excel.",
    json:"Pour sauvegarder, changer d'appareil ou repartir de zéro sans rien perdre."
  };
  fmtWrap.appendChild(el("p", { class:"export-note" }, NOTES[exp.fmt]));
  box.appendChild(fmtWrap);

  const opts = el("div", { style:"display:flex;flex-direction:column;gap:14px" });
  const o = exp[cur.k];
  const chk = (key, label, small) => {
    const l = el("label", { class:"opt" });
    const c = el("input", { type:"checkbox" });
    c.checked = !!o[key];
    c.addEventListener("change", () => { o[key] = c.checked; majApercu(); });
    const t = el("span", {}, label);
    if (small) t.appendChild(el("small", {}, small));
    l.append(c, t);
    opts.appendChild(l);
    return c;
  };
  const filtresActifs = () => {
    const f = [];
    if (filters.q) f.push("recherche « " + filters.q + " »");
    if (filters.statut) f.push(STATUTS[filters.statut].pluriel.toLowerCase());
    if (filters.collab) f.push(filters.collab);
    if (filters.tag) f.push("tag " + filters.tag);
    if (filters.ech) f.push({ late:"en retard", today:"aujourd'hui", "7":"sous 7 jours", none:"sans échéance" }[filters.ech]);
    return f;
  };

  if (cur.k === "liste") {
    opts.appendChild(el("span", { class:"lbl", style:"margin:0" }, "Contenu"));
    const f = filtresActifs();
    chk("filtres", "Appliquer les filtres actifs", `${filteredActives().length} ligne(s) · ${f.length ? f.join(", ") : "aucun filtre en cours"}`);
    if (exp.fmt === "pdf") {
      chk("grouper", "Grouper par statut");
      chk("notes", "Inclure les notes en attente");
      chk("blancs", "Lignes vides pour compléter à la main", "Autant que la page le permet");
      chk("unePage", "Tenir sur une seule page", "Le texte est réduit si besoin");
    }
  } else if (cur.k === "bord") {
    opts.appendChild(el("span", { class:"lbl", style:"margin:0" }, "Contenu"));
    chk("prochaines", "Liste des prochaines échéances");
    chk("points", "Ajouter un encart « Points à remonter »", "Lignes vides pour un entretien ou une réunion");
  } else if (cur.k === "synth") {
    const l = el("label");
    l.appendChild(el("span", { class:"lbl" }, "Période"));
    const sel = el("select", { class:"sel" });
    [["q-current", "Trimestre en cours"], ["q-prev", "Trimestre précédent"], ["year", "Année en cours"], ["all", "Depuis le début"]]
      .forEach(([v, t]) => { const op = el("option", { value:v }, t); if (v === synthRange) op.selected = true; sel.appendChild(op); });
    sel.addEventListener("change", () => { synthRange = sel.value; majApercu(); });
    l.appendChild(sel);
    opts.appendChild(l);
    chk("contexte", "Rappeler la tâche entière", "Objectif, action et commentaire au-dessus du REX");
    chk("journal", "Inclure le journal de bord");
    chk("vides", "Signaler les REX non rédigés");
    if (PJ()) chk("captures", "Captures avant / après");
  } else if (cur.k === "fiche") {
    const l = el("label");
    l.appendChild(el("span", { class:"lbl" }, "Tâche"));
    const sel = el("select", { class:"sel" });
    const liste = actives().concat(archived());
    if (!exp.tache || !liste.some(t => t.id === exp.tache)) exp.tache = liste.length ? liste[0].id : null;
    const grpA = el("optgroup", { label:"En cours" }), grpR = el("optgroup", { label:"Archivées" });
    liste.forEach(t => {
      const op = el("option", { value:t.id }, t.sujet || "Sans sujet");
      if (t.id === exp.tache) op.selected = true;
      (t.archived ? grpR : grpA).appendChild(op);
    });
    if (grpA.children.length) sel.appendChild(grpA);
    if (grpR.children.length) sel.appendChild(grpR);
    sel.addEventListener("change", () => { exp.tache = sel.value; majApercu(); });
    l.appendChild(sel);
    opts.appendChild(l);
    chk("reunion", "Zone de notes de réunion", "Décisions et suite à donner, à remplir à la main");
    chk("journal", "Inclure le journal de bord");
    if (PJ()) chk("pj", "Liens et captures d'écran", "Adresses complètes et vignettes");
  } else if (cur.k === "sauv") {
    opts.appendChild(el("span", { class:"lbl", style:"margin:0" }, "Contenu"));
    chk("actives", "Tâches actives et notes en attente");
    chk("archives", "Archives et REX");
    if (PJ()) {
      const e = PJ().sauvegarde.estimer({ taches: live() });
      chk("images", "Inclure les images", e.images ? `Captures d'écran · ${e.images} image(s), environ ${PJ().images.formaterPoids(e.octets)}` : "Aucune capture pour l'instant");
    }
    const rb = el("div", { class:"restore-box" });
    rb.append(el("strong", {}, "Restaurer une sauvegarde"),
      el("span", {}, "Les tâches déjà présentes sont conservées : seules les plus récentes ou les manquantes sont reprises."));
    const btn = el("button", { type:"button", class:"ghost-btn", style:"height:40px;margin-top:6px;font-size:14px" }, "Choisir un fichier…");
    btn.addEventListener("click", () => $("#file-import").click());
    rb.appendChild(btn);
    opts.appendChild(rb);
  }
  box.appendChild(opts);
  majApercu();

  function majApercu() {
    const pv = $("#export-pv");
    pv.innerHTML = "";
    pv.style.width = cur.land ? "190px" : "134px";
    pv.style.height = cur.land ? "134px" : "190px";
    const top = el("div", { class:"pv-top" });
    top.append(el("i"), el("b"));
    pv.append(top, el("div", { class:"pv-rule" }));
    const L = cur.land ? [100, 92, 96, 88, 100, 90, 94] : [100, 70, 95, 85, 60, 100, 90, 75, 95, 80, 65];
    L.forEach(w => { const d = el("div", { class:"pv-line" }); d.style.width = w + "%"; pv.appendChild(d); });
    let info = "";
    if (cur.k === "liste") {
      const n = exp.liste.filtres ? filteredActives().length : actives().length;
      info = exp.fmt === "csv" ? `Fichier .csv · ${exp.liste.filtres ? n : live().length} ligne(s)` : `A4 paysage · ${n} ligne(s)` + (exp.liste.unePage ? " · 1 page" : "");
    } else if (cur.k === "bord") info = "1 page · A4 paysage";
    else if (cur.k === "synth") info = `A4 paysage · ${synthData(synthRange).list.length} tâche(s) close(s)`;
    else if (cur.k === "fiche") info = exp.tache ? "A4 portrait" : "Aucune tâche à imprimer";
    else info = "Fichier .json · à garder en lieu sûr";
    $("#export-info").textContent = info;
    const go = $("#export-go");
    go.textContent = exp.fmt === "csv" ? "Télécharger le CSV" : exp.fmt === "json" ? "Télécharger la sauvegarde" : "Imprimer / PDF";
    go.disabled = cur.k === "fiche" && !exp.tache;
  }
}

function runExport() {
  const d = exp.doc;
  if (d === "liste" && exp.fmt === "csv") { exportCSV({ filtres:exp.liste.filtres }); closeExport(); return; }
  if (d === "sauv") { exportSauvegarde(exp.sauv); closeExport(); return; }
  closeExport();
  if (d === "liste") doPrint("taches", exp.liste);
  else if (d === "bord") doPrint("bord", exp.bord);
  else if (d === "synth") doPrint("synthese", { ...exp.synth, range:synthRange });
  else if (d === "fiche") doPrint("fiche", { ...exp.fiche, tache: data.tasks.find(t => t.id === exp.tache) });
}

/* Sauvegarde JSON au format habituel, avec les images si demandé */
function exportSauvegarde(o) {
  const garde = t => t.deleted || (t.kind === "note" ? o.actives : t.archived ? o.archives : o.actives);
  const copie = { ...data, tasks: data.tasks.filter(garde) };
  const nom = `pic-majin-${todayISO()}.json`;
  if (!(o.images && PJ())) {
    download(nom, JSON.stringify(copie, null, 2), "application/json");
    toast("Sauvegarde exportée.", "ok");
    return;
  }
  toast("Préparation de la sauvegarde avec les images…", "ok");
  PJ().sauvegarde.collecterImages(copie.tasks.filter(t => !t.deleted)).then(r => {
    download(nom, JSON.stringify({ ...copie, images:r.images }), "application/json");
    toast(`Sauvegarde exportée avec ${r.nombre} image(s)` + (r.manquantes ? ` · ${r.manquantes} introuvable(s) sur cet appareil` : "") + ".",
      r.manquantes ? "warn" : "ok");
  }, () => toast("Lecture des images impossible : sauvegarde annulée.", "warn"));
}

/* ============================================================
   Thème clair / sombre
   ============================================================ */
const mqSombre = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function themeEffectif() {
  const s = data.settings.theme || "auto";
  return (s === "sombre" || (s === "auto" && mqSombre && mqSombre.matches)) ? "dark" : "light";
}
function applyTheme() {
  const th = themeEffectif();
  document.documentElement.setAttribute("data-theme", th);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", th === "dark" ? "#000000" : "#FF7900");
  const b = $("#btn-theme");
  if (b) {
    const lib = th === "dark" ? "Passer en mode clair" : "Passer en mode sombre";
    b.innerHTML = th === "dark" ? ICO.sun : ICO.moon;
    b.title = lib; b.setAttribute("aria-label", lib);
  }
  const sel = $("#cfg-theme");
  if (sel) sel.value = data.settings.theme || "auto";
}
if (mqSombre && mqSombre.addEventListener) {
  mqSombre.addEventListener("change", () => { if ((data.settings.theme || "auto") === "auto") applyTheme(); });
}

/* Liste / Kanban */
function setKanban(on) {
  data.settings.kanban = !!on; save();
  document.body.classList.toggle("is-kanban", data.settings.kanban);
  $("#view-liste").setAttribute("aria-pressed", String(!data.settings.kanban));
  $("#view-kanban").setAttribute("aria-pressed", String(data.settings.kanban));
  $("#view-liste").classList.toggle("is-on", !data.settings.kanban);
  $("#view-kanban").classList.toggle("is-on", data.settings.kanban);
  renderView();
}

function setView(v) {
  view = v;
  $$(".tab").forEach(t => {
    const on = t.dataset.view === v;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  $$(".view").forEach(s => s.classList.toggle("is-active", s.id === "view-" + v));
  if (v === "bord") renderBoard();
  if (v === "archives") renderArchives();
  window.scrollTo({ top:0, behavior:"smooth" });
}

/* Rend la vue des tâches, tableau ou kanban selon le mode actif. */
function renderView() {
  if (data.settings.kanban) { renderKanban(); refreshCounters(); }
  else renderTable();
}

function renderAll() {
  renderView();
  renderNotes(); renderArchives(); renderBoard();
}

function wire() {
  $$(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));

  $("#btn-new").addEventListener("click", newTask);
  $("#empty-taches").addEventListener("click", e => {
    if (e.target.dataset.act === "new-from-empty") newTask();
  });
  $("#btn-print").addEventListener("click", () => openExport("liste"));
  $("#btn-print-arch").addEventListener("click", () => doPrint("archives"));
  $("#btn-columns").addEventListener("click", openCfg);
  $("#btn-settings").addEventListener("click", openCfg);

  /* Filtres */
  let qTimer;
  $("#q").addEventListener("input", e => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { filters.q = e.target.value; renderView(); }, 130);
  });
  $("#f-collab").addEventListener("change", e => { filters.collab = e.target.value; renderView(); });
  $("#f-collab-arch").addEventListener("change", () => refreshCounters());
  $("#f-echeance").addEventListener("change", e => { filters.ech = e.target.value; renderView(); });
  $("#f-tag").addEventListener("change", e => { filters.tag = e.target.value; renderView(); });
  $("#seg-statut").addEventListener("click", e => {
    const b = e.target.closest("[data-statut]");
    if (!b) return;
    filters.statut = b.dataset.statut; renderView();
  });
  $("#seg-rex").addEventListener("click", e => {
    const b = e.target.closest("[data-todo]");
    if (!b) return;
    filters.rexTodo = b.dataset.todo === "1"; renderArchives();
  });
  $("#f-tag-arch").addEventListener("change", e => { filters.tagArch = e.target.value; renderArchives(); refreshCounters(); });
  /* Kanban */
  $("#view-liste").addEventListener("click", () => setKanban(false));
  $("#view-kanban").addEventListener("click", () => setKanban(true));
  $("#q-arch").addEventListener("input", e => { filters.qArch = e.target.value; renderArchives(); });
  $("#f-collab-arch").addEventListener("change", e => { filters.collabArch = e.target.value; renderArchives(); });

  /* Tri */
  $("#head-row").addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const k = th.dataset.sort;
    if (data.settings.sortKey === k) data.settings.sortDir = data.settings.sortDir === "asc" ? "desc" : "asc";
    else { data.settings.sortKey = k; data.settings.sortDir = "asc"; }
    save(); renderTable();
  });
  $("#head-row").addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.dataset.sort) { e.preventDefault(); e.target.click(); }
  });

  /* Actions dans le tableau */
  $("#body-taches").addEventListener("click", e => {
    const g = e.target.closest("[data-grp]");
    if (g) {
      const st = g.dataset.grp;
      data.settings.closedGroups = { ...(data.settings.closedGroups || {}), [st]: !(data.settings.closedGroups || {})[st] };
      save(); renderTable();
      const again = $(`[data-grp="${st}"]`);
      if (again) again.focus();
      return;
    }
    const tr = e.target.closest("tr");
    if (!tr) return;
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const id = tr.dataset.id;
    if (act.dataset.act === "sujet") openSheet(id);
    else if (act.dataset.act === "archive") archiveTask(id, act);
    else if (act.dataset.act === "open") openSheet(id);
    else if (act.dataset.act === "edit") openEditorFor(id, act.dataset.key);
  });
  $("#body-taches").addEventListener("keydown", e => {
    const c = e.target.closest(".cell");
    if (c && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      if (c.dataset.key === "sujet") openSheet(c.closest("tr").dataset.id);
      else openEditorFor(c.closest("tr").dataset.id, c.dataset.key);
    }
  });

  /* Archives */
  $("#rex-list").addEventListener("click", e => {
    const card = e.target.closest(".rex-card");
    const act = e.target.closest("[data-act]");
    if (!card || !act) return;
    if (act.dataset.act === "open") openSheet(card.dataset.id);
    else if (act.dataset.act === "restore") restoreTask(card.dataset.id);
  });

  /* Panneau détail */
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#sheet-print").addEventListener("click", () => { const id = sheetId; openExport("fiche", id); });
  $("#sheet-backdrop").addEventListener("click", e => { if (e.target.id === "sheet-backdrop") closeSheet(); });
  $("#sheet-validate").addEventListener("click", validateSheet);
  $("#sheet-duplicate").addEventListener("click", () => {
    const id = sheetId; closeSheet(); duplicateTask(id);
  });
  $("#sheet-archive").addEventListener("click", () => { const id = sheetId; closeSheet(); archiveTask(id); });
  $("#sheet-restore").addEventListener("click", () => { const id = sheetId; closeSheet(); restoreTask(id); });
  $("#sheet-delete").addEventListener("click", () => {
    const id = sheetId;
    const t = data.tasks.find(x => x.id === id);
    if (!t) return;
    if (confirm(`Supprimer « ${t.sujet || "cette tâche"} » ? Une tâche archivée garde son REX ; une suppression l'efface partout, sur tous vos appareils.`)) {
      closeSheet(); deleteTask(id);
    }
  });

  /* Réglages */
  $("#cfg-close").addEventListener("click", closeCfg);
  $("#cfg-done").addEventListener("click", closeCfg);
  $("#cfg-backdrop").addEventListener("click", e => { if (e.target.id === "cfg-backdrop") closeCfg(); });
  $("#cfg-reminders").addEventListener("change", e => {
    data.settings.reminders = e.target.checked; touchMeta(); save(); queueSync();
  });
  $("#cfg-lead").addEventListener("change", e => {
    data.settings.lead = Number(e.target.value); touchMeta(); save(); queueSync();
  });
  $("#cfg-sound").addEventListener("change", e => { data.settings.sound = e.target.checked; save(); if (e.target.checked) ding(); });
  $("#cfg-dense").addEventListener("change", e => {
    data.settings.dense = e.target.checked; save();
    document.body.classList.toggle("is-dense", data.settings.dense);
  document.body.classList.toggle("is-kanban", !!data.settings.kanban);
  if (data.settings.kanban && $("#btn-kanban")) $("#btn-kanban").textContent = "Tableau";
  });
  $("#cfg-notif-ask").addEventListener("click", () => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(() => {
      updateNotifState();
      if (Notification.permission === "granted") toast("Rappels système activés.", "ok");
    });
  });
  /* Logo → retour aux tâches */
  const logoBtn = $("#logo-btn");
  if (logoBtn) {
    logoBtn.addEventListener("click", () => {
      logoBtn.classList.remove("is-clicked");
      void logoBtn.offsetWidth;            // force reflow pour relancer l'animation
      logoBtn.classList.add("is-clicked");
      setTimeout(() => logoBtn.classList.remove("is-clicked"), 450);
      setView("taches");
    });
  }

  /* Notes en attente */
  $("#note-add").addEventListener("click", () => {
    if (addNote($("#note-input").value)) $("#note-input").value = "";
    $("#note-input").focus();
  });
  $("#note-input").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); $("#note-add").click(); }
  });
  $("#notes-list").addEventListener("click", e => {
    const li = e.target.closest(".note");
    const act = e.target.closest("[data-act]");
    if (!li || !act) return;
    if (act.dataset.act === "convert") noteToTask(li.dataset.id);
    else if (act.dataset.act === "del") deleteNote(li.dataset.id);
    else if (act.dataset.act === "edit") editNote(li.dataset.id);
  });
  $("#notes-list").addEventListener("keydown", e => {
    const t = e.target.closest(".note-text");
    if (t && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      editNote(t.closest(".note").dataset.id);
    }
  });

  /* Synchronisation */
  $("#btn-sync-on").addEventListener("click", async () => {
    const code = $("#cfg-space").value;
    if (await enableSync(code)) { $("#cfg-space").value = ""; renderSyncBlock(); }
  });
  $("#btn-sync-off").addEventListener("click", () => { disableSync(); renderSyncBlock(); });
  $("#btn-sync-now").addEventListener("click", () => syncNow(false));
  $("#sync-dot").addEventListener("click", () => { data.sync.enabled ? syncNow(false) : openCfg(); });
  $("#cfg-space").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-sync-on").click(); });

  /* Rappels poussés */
  $("#btn-push-on").addEventListener("click", enablePush);
  $("#btn-push-off").addEventListener("click", disablePush);

  /* Synthèse REX */
  $("#btn-synth").addEventListener("click", openSynth);
  $("#btn-print-bord").addEventListener("click", () => openExport("bord"));

  /* Exporter et imprimer */
  $("#export-close").addEventListener("click", closeExport);
  $("#export-cancel").addEventListener("click", closeExport);
  $("#export-go").addEventListener("click", runExport);
  $("#export-backdrop").addEventListener("click", e => { if (e.target.id === "export-backdrop") closeExport(); });
  $("#cfg-export-open").addEventListener("click", () => { closeCfg(); openExport("sauv"); });

  /* Thème */
  $("#btn-theme").addEventListener("click", () => {
    data.settings.theme = themeEffectif() === "dark" ? "clair" : "sombre";
    save(); applyTheme();
  });
  $("#cfg-theme").addEventListener("change", e => { data.settings.theme = e.target.value; save(); applyTheme(); });
  $("#synth-close").addEventListener("click", closeSynth);
  $("#synth-print").addEventListener("click", () => doPrint("synthese"));
  $("#synth-range").addEventListener("change", e => { synthRange = e.target.value; renderSynth(); });
  $("#synth-backdrop").addEventListener("click", e => { if (e.target.id === "synth-backdrop") closeSynth(); });

  /* Partage lecture seule */
  $("#btn-share-open").addEventListener("click", openSharePanel);

  /* Ouverture animée */
  $("#cfg-intro").addEventListener("change", e => { data.settings.intro = e.target.checked; save(); });
  $("#cfg-introson").addEventListener("change", e => {
    data.settings.introSon = e.target.checked; save();
  });
  $("#btn-intro-replay").addEventListener("click", () => {
    closeCfg();
    setTimeout(() => window.PICIntro && window.PICIntro.play({ sound: data.settings.introSon !== false }), 250);
  });

  $("#cfg-export").addEventListener("click", exportJSON);
  $("#cfg-csv").addEventListener("click", exportCSV);
  $("#cfg-import").addEventListener("click", () => $("#file-import").click());
  $("#file-import").addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) {
      const nom = f.name.toLowerCase();
      if (nom.endsWith(".csv") || nom.endsWith(".txt")) importCSV(f);
      else importJSON(f);
    }
    e.target.value = "";
  });
  $("#cfg-modele").addEventListener("click", telechargerModele);
  $("#cfg-reset").addEventListener("click", async () => {
    const n = live().length + notes().length;
    const synced = data.sync.enabled;
    const msg = synced
      ? `Effacer ${n} élément(s) ? La suppression sera propagée à tous vos appareils synchronisés. Exportez d'abord si vous voulez les garder.`
      : `Effacer ${n} élément(s) de ce navigateur ? Exportez d'abord si vous voulez les garder.`;
    if (!confirm(msg)) return;

    /* On ne vide pas la liste : on marque tout comme supprimé, sinon la
       synchronisation suivante redescendrait les tâches depuis le serveur. */
    const now = new Date().toISOString();
    data.tasks.forEach(t => {
      if (t.deleted) return;
      t.deleted = true;
      t.deletedAt = now;
      t.updatedAt = now;
    });
    lastUndo = null;
    save();
    closeCfg();
    renderAll();

    if (synced) {
      toast("Effacement en cours de propagation…", "warn");
      await syncNow(true);
      toast("Données effacées ici et sur vos autres appareils.", "ok");
    } else {
      toast("Données effacées.", "warn");
    }
  });

  /* Raccourcis */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (document.querySelector("dialog.pj-visionneuse[open]")) return;   // la visionneuse se ferme d'abord
      if (!$("#export-backdrop").hidden) closeExport();
      else if (!$("#sheet-backdrop").hidden) closeSheet();
      else if (!$("#synth-backdrop").hidden) closeSynth();
      else if (!$("#cfg-backdrop").hidden) closeCfg();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      openExport(!$("#sheet-backdrop").hidden && sheetId ? "fiche" : view === "bord" ? "bord" : view === "archives" ? "synth" : "liste",
                 !$("#sheet-backdrop").hidden ? sheetId : null);
    }
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) &&
        $("#sheet-backdrop").hidden && $("#export-backdrop").hidden && $("#cfg-backdrop").hidden) {
      e.preventDefault();
      if (view === "bord") setView("taches");
      (view === "archives" ? $("#q-arch") : $("#q")).focus();
    }
    if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && view === "taches") {
      e.preventDefault(); newTask();
    }
  });
  window.addEventListener("beforeprint", () => { if (!$("#print-area").innerHTML) buildPrint(view === "archives" ? "archives" : "taches"); });
}

/* Installation PWA */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredPrompt = e;
  const b = $("#btn-install"); b.hidden = false;
  b.onclick = async () => {
    b.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  };
});

/* ---------- Démarrage ---------- */
function boot() {
  if (checkShareMode()) return;
  if (migrated) save();
  purgeTombstones();
  migrateTasks();
  pruneEmptyTasks();
  document.body.classList.toggle("is-dense", data.settings.dense);
  document.body.classList.toggle("is-kanban", !!data.settings.kanban);
  applyTheme();
  /* Refonte 2026 : la liste ne garde que l'essentiel, une seule fois.
     Le statut est porté par les groupes, la date de création s'affiche sous le sujet ;
     tout reste réaffichable depuis « Colonnes ». */
  if (!data.settings.design2026) {
    ["date", "statut", "commentaire", "score", "rex"].forEach(k => {
      const c = data.columns.find(x => x.key === k);
      if (c) c.visible = false;
    });
    data.settings.design2026 = true;
    touchMeta(); save();
  }
  wire();
  $("#view-liste").classList.toggle("is-on", !data.settings.kanban);
  $("#view-liste").setAttribute("aria-pressed", String(!data.settings.kanban));
  $("#view-kanban").classList.toggle("is-on", !!data.settings.kanban);
  $("#view-kanban").setAttribute("aria-pressed", String(!!data.settings.kanban));
  renderAll();
  setSyncState(data.sync.enabled ? "pending" : "off");

  if ("serviceWorker" in navigator) {
    /* Un service worker déjà en place signifie que l'application tournait
       sur une version antérieure : quand la nouvelle prend la main, on
       recharge une fois pour que l'écran corresponde au code servi. */
    const avaitUnControleur = !!navigator.serviceWorker.controller;
    let dejaRecharge = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (avaitUnControleur && !dejaRecharge) {
        dejaRecharge = true;
        location.reload();
      }
    });
    navigator.serviceWorker.register("sw.js")
      .then(reg => {
        reg.update();                                  // au démarrage
        setInterval(() => reg.update(), 15 * 60000);   // puis toutes les 15 min
      })
      .catch(() => {});
  }

  const started = (data.settings.intro !== false && window.PICIntro)
    ? window.PICIntro.play({ sound: data.settings.introSon !== false })
    : Promise.resolve();

  started.then(() => {
    if (data.sync.enabled) { writeSpaceForWorker(); syncNow(true); }
    configurerCaptures();
    checkReminders();
  });

  setInterval(checkReminders, 60000);
  setInterval(() => { if (data.sync.enabled && !document.hidden) syncNow(true); }, 300000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { refreshCounters(); checkReminders(); if (data.sync.enabled) syncNow(true); }
  });
  window.addEventListener("online",  () => { if (data.sync.enabled) { syncNow(true); configurerCaptures(); } });
  window.addEventListener("offline", () => setSyncState("offline"));
}
boot();

})();
