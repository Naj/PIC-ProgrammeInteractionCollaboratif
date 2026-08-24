/* ============================================================
   PIC — Programme d'Interaction Collaboratif · by Majin
   Stockage local, aucune dépendance externe.
   ============================================================ */
(function () {
"use strict";

/* ---------- Constantes ---------- */
const STORE_KEY = "pic-majin:v1";
const APP_TITLE = "PIC - PROGRAMME D'INTERACTION COLLABORATIF";

const DEFAULT_COLUMNS = [
  { key:"date",          label:"Date",             type:"date", visible:true },
  { key:"sujet",         label:"Sujet",            type:"text", visible:true },
  { key:"collaboration", label:"Collaboration",    type:"text", visible:true },
  { key:"objectif",      label:"Objectif",         type:"text", visible:true },
  { key:"echeance",      label:"Date d'échéance",  type:"date", visible:true },
  { key:"action",        label:"Action",           type:"long", visible:true },
  { key:"commentaire",   label:"Commentaire",      type:"long", visible:true },
  { key:"rex",           label:"REX",              type:"long", visible:true }
];

const COL_WIDTH = { date:7, sujet:12, collaboration:10, objectif:10,
                    echeance:9, action:15, commentaire:17, rex:15 };

const DEFAULT_SETTINGS = {
  reminders:true, lead:1, sound:true, dense:false, intro:true,
  sortKey:"echeance", sortDir:"asc"
};

const DEFAULT_SYNC = { enabled:false, space:"", lastAt:null, pushEndpoint:null };
const API = "/api";
const TOMBSTONE_DAYS = 120;

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

/* ---------- État ---------- */
let data = load();
let view = "taches";
let filters = { q:"", collab:"", ech:"", qArch:"", collabArch:"" };
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
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
    sync: { ...DEFAULT_SYNC, ...(d.sync || {}) },
    metaUpdatedAt: d.metaUpdatedAt || new Date(0).toISOString()
  };
}

/* Les suppressions laissent une trace le temps que les autres appareils
   la reçoivent, puis disparaissent pour de bon. */
/* Une ligne créée puis laissée entièrement vide ne veut rien dire :
   on la retire au chargement suivant. */
function pruneEmptyTasks() {
  const keys = ["sujet", "collaboration", "objectif", "echeance", "action", "commentaire", "rex"];
  let n = 0;
  live().forEach(t => {
    if (keys.every(k => !String(t[k] || "").trim())) {
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
  data.tasks = data.tasks.filter(t => !t.deleted || new Date(t.deletedAt || 0).getTime() > limit);
  if (data.tasks.length !== before) save();
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
  const isDate = col && col.type === "date";
  return list.slice().sort((a, b) => {
    const va = a[k] || "", vb = b[k] || "";
    if (!va && !vb) return 0;
    if (!va) return 1;          // les vides toujours en fin
    if (!vb) return -1;
    if (isDate) return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
    return va.localeCompare(vb, "fr", { sensitivity:"base", numeric:true }) * sign;
  });
}
function filteredArchives() {
  let list = archived().filter(t => matches(t, filters.qArch));
  if (filters.collabArch) list = list.filter(t => (t.collaboration || "") === filters.collabArch);
  return list.sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
}

/* ============================================================
   RENDU — Tableau des tâches
   ============================================================ */
function renderTable() {
  const head = $("#head-row");
  head.innerHTML = "";
  head.appendChild(el("th", { class:"col-status", "aria-label":"Statut" }));
  head.appendChild(el("th", { class:"col-check", title:"Cocher pour archiver" }, "✓"));
  visCols().forEach(c => {
    const arrow = data.settings.sortKey === c.key ? (data.settings.sortDir === "asc" ? "▲" : "▼") : "";
    const th = el("th", {
      class:"sortable" + (data.settings.sortKey === c.key ? " is-sorted" : ""),
      "data-sort":c.key, title:"Trier par " + c.label, tabindex:"0", role:"button",
      style:"width:" + pctWidth(c.key) + "%"
    });
    th.append(c.label, el("span", { class:"sort-mark" }, arrow));
    head.appendChild(th);
  });
  head.appendChild(el("th", { class:"col-tools", "aria-label":"Détail" }));

  const body = $("#body-taches");
  body.innerHTML = "";
  const list = filteredActives();

  list.forEach((t, i) => {
    const st = statusOf(t);
    const tr = el("tr", { "data-id":t.id });
    tr.style.animationDelay = Math.min(i * 22, 420) + "ms";

    const tdS = el("td", { class:"col-status" });
    tdS.appendChild(el("span", { class:"status-rail " + st.cls, title:st.label }));
    tr.appendChild(tdS);

    const tdC = el("td", { class:"col-check" });
    const box = el("button", { class:"check-box", "data-act":"archive",
      title:"Archiver la tâche", "aria-label":"Archiver " + (t.sujet || "cette tâche") });
    tdC.appendChild(box);
    tr.appendChild(tdC);

    visCols().forEach(c => {
      const td = el("td", { class:"k-" + c.key, "data-label":c.label });
      const val = t[c.key] || "";
      const shown = c.type === "date" ? frDate(val) : val;
      const cell = el("div", {
        class:"cell" + (shown ? "" : " is-empty"),
        "data-act":"edit", "data-key":c.key, tabindex:"0", role:"button",
        title:c.label + " — cliquez pour modifier"
      });
      if (shown) cell.appendChild(el("span", { class:"cell-text" }, shown));
      td.appendChild(cell);
      tr.appendChild(td);
    });

    const tdT = el("td", { class:"col-tools" });
    tdT.appendChild(el("button", { class:"tool-open", "data-act":"open", title:"Ouvrir le détail" }, "⤢"));
    tr.appendChild(tdT);

    body.appendChild(tr);
  });

  $("#empty-taches").hidden = list.length > 0;
  $(".table-scroll").hidden = list.length === 0;
  $(".hint").hidden = list.length === 0;
  refreshCounters();
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
  $("#head-count").textContent = a.length;
  $("#head-late").textContent = late;
  $("#head-sub-word").textContent = a.length > 1 ? "tâches en cours" : "tâche en cours";
  $("#badge-taches").textContent = a.length;
  $("#badge-archives").textContent = archived().length;
  const opts = list => {
    const set = [...new Set(list.map(t => (t.collaboration || "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, "fr"));
    return set;
  };
  fillSelect($("#f-collab"), opts(actives()), filters.collab, "Toutes collaborations");
  fillSelect($("#f-collab-arch"), opts(archived()), filters.collabArch, "Toutes collaborations");
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
  const list = filteredActives();
  const pos = list.findIndex(t => t.id === id);
  if (pos > -1 && pos < list.length - 1) return { id:list[pos + 1].id, key:keys[0] };
  return null;
}

/* ============================================================
   Créer / archiver / restaurer / supprimer
   ============================================================ */
function newTask() {
  const t = { id:uid(), date:todayISO(), sujet:"", collaboration:"", objectif:"",
              echeance:"", action:"", commentaire:"", rex:"",
              archived:false, deleted:false,
              createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  data.tasks.unshift(t);
  save(); queueSync();
  data.settings.sortKey = "date"; data.settings.sortDir = "desc";
  renderTable();
  const tr = $(`tr[data-id="${t.id}"]`);
  if (tr) {
    tr.scrollIntoView({ block:"center", behavior:"smooth" });
    openEditorFor(t.id, "sujet");
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
let sheetId = null;
function openSheet(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  sheetId = id;
  const st = statusOf(t);
  $("#sheet-eyebrow").textContent = t.archived ? "Archivée · REX" : st.label;
  $("#sheet-title").textContent = t.sujet || "Nouvelle tâche";

  const body = $("#sheet-body");
  body.innerHTML = "";
  cols().forEach(c => {
    const wrap = el("div", { class:"form-field" + (c.key === "rex" ? " is-rex" : "") });
    wrap.appendChild(el("label", { for:"f-" + c.key }, c.label));
    let f;
    if (c.type === "date") f = el("input", { type:"date", id:"f-" + c.key, value:t[c.key] || "" });
    else if (c.type === "long") { f = el("textarea", { id:"f-" + c.key }); f.value = t[c.key] || ""; }
    else { f = el("input", { type:"text", id:"f-" + c.key }); f.value = t[c.key] || ""; }
    if (c.key === "rex") f.placeholder = "Ce qui a marché, ce qu'on refait, ce qu'on évite la prochaine fois.";
    f.addEventListener("input", () => {
      t[c.key] = f.value;
      touch(t);
      save(); queueSync();
      if (c.key === "sujet") $("#sheet-title").textContent = f.value || "Nouvelle tâche";
    });
    wrap.appendChild(f);
    body.appendChild(wrap);
  });

  $("#sheet-archive").hidden = !!t.archived;
  $("#sheet-restore").hidden = !t.archived;
  $("#sheet-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  $("#sheet-backdrop").hidden = true;
  document.body.style.overflow = "";
  sheetId = null;
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

  list.forEach((t, i) => {
    const card = el("article", { class:"rex-card", "data-id":t.id });
    card.style.animationDelay = Math.min(i * 30, 400) + "ms";

    const top = el("div", { class:"rex-top" });
    top.appendChild(el("h3", { class:"rex-sujet" }, t.sujet || "Sans sujet"));
    const meta = el("div", { class:"rex-meta" });
    if (t.collaboration) meta.appendChild(el("span", { class:"chip chip-collab" }, t.collaboration));
    if (t.date) meta.appendChild(el("span", { class:"chip chip-date" }, "Ouverte le " + frDate(t.date)));
    if (t.archivedAt) meta.appendChild(el("span", { class:"chip chip-date" }, "Close le " + frDate(t.archivedAt.slice(0, 10))));
    const delay = leadTime(t);
    if (delay !== null) meta.appendChild(el("span", { class:"chip chip-delay" }, delay + " j de traitement"));
    top.appendChild(meta);
    card.appendChild(top);

    const bodyEl = el("div", { class:"rex-body" });
    ["objectif", "action", "commentaire", "rex"].forEach(k => {
      if (!t[k]) return;
      const f = el("div", { class:"rex-field" + (k === "rex" ? " is-rex" : "") });
      f.appendChild(el("span", { class:"rex-label" }, labelOf(k)));
      f.appendChild(el("p", { class:"rex-value" }, t[k]));
      bodyEl.appendChild(f);
    });
    if (!t.rex) {
      const f = el("div", { class:"rex-field is-rex" });
      f.appendChild(el("span", { class:"rex-label" }, labelOf("rex")));
      f.appendChild(el("p", { class:"rex-value", style:"color:#8F8F8F" }, "À écrire — que retenir de cette tâche ?"));
      bodyEl.appendChild(f);
    }
    card.appendChild(bodyEl);

    const acts = el("div", { class:"rex-actions" });
    acts.appendChild(el("button", { class:"mini-btn", "data-act":"open" }, t.rex ? "Modifier le REX" : "Écrire le REX"));
    acts.appendChild(el("button", { class:"mini-btn", "data-act":"restore" }, "Réactiver"));
    card.appendChild(acts);
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
  const week = a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d >= 0 && d <= 7; });
  const rate = all.length ? Math.round((ar.length / all.length) * 100) : 0;
  const delays = ar.map(leadTime).filter(v => v !== null);
  const avg = delays.length ? Math.round(delays.reduce((s, v) => s + v, 0) / delays.length) : null;

  const kpis = [
    { n:a.length,   l:"Tâches en cours", c:"k-blue",   note:`${new Set(a.map(t => t.collaboration).filter(Boolean)).size} collaboration(s) engagée(s)` },
    { n:late.length,l:"En retard",       c:"k-orange", note:late.length ? "À traiter en priorité" : "Rien ne traîne" },
    { n:week.length,l:"Sous 7 jours",    c:"k-yellow", note:"Échéances de la semaine" },
    { n:ar.length,  l:"Archivées",       c:"k-green",  note:`${ar.filter(t => t.rex).length} REX rédigés` },
    { n:rate + "%", l:"Taux de réalisation", c:"k-purple", note: avg !== null ? `${avg} j en moyenne par tâche` : "Pas encore de moyenne" }
  ];
  const row = $("#kpi-row");
  row.innerHTML = "";
  kpis.forEach(k => {
    const c = el("article", { class:"kpi " + k.c });
    c.appendChild(el("span", { class:"kpi-label" }, k.l));
    const num = el("div", { class:"kpi-num" }, "0");
    c.appendChild(num);
    c.appendChild(el("p", { class:"kpi-note" }, k.note));
    row.appendChild(c);
    countUp(num, k.n);
  });

  /* Par collaboration */
  const map = {};
  all.forEach(t => {
    const key = (t.collaboration || "").trim() || "Non attribuée";
    map[key] = map[key] || { open:0, done:0 };
    t.archived ? map[key].done++ : map[key].open++;
  });
  const entries = Object.entries(map).sort((x, y) => (y[1].open + y[1].done) - (x[1].open + x[1].done)).slice(0, 8);
  const max = Math.max(1, ...entries.map(([, v]) => v.open + v.done));
  const cc = $("#chart-collab");
  cc.innerHTML = "";
  if (!entries.length) cc.appendChild(el("p", { class:"cfg-note" }, "Les chiffres apparaîtront dès la première tâche."));
  entries.forEach(([name, v]) => {
    const r = el("div", { class:"bar-row" });
    const h = el("div", { class:"bar-head" });
    h.appendChild(el("span", {}, name));
    h.appendChild(el("span", { class:"muted" }, `${v.open} en cours · ${v.done} archivées`));
    r.appendChild(h);
    const track = el("div", { class:"bar-track" });
    const f1 = el("span", { class:"bar-fill f-open" });
    const f2 = el("span", { class:"bar-fill f-done" });
    track.append(f1, f2); r.appendChild(track); cc.appendChild(r);
    requestAnimationFrame(() => {
      f1.style.width = (v.open / max) * 100 + "%";
      f2.style.width = (v.done / max) * 100 + "%";
    });
  });

  /* Activité par mois */
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), name: MONTHS[d.getMonth()], open:0, done:0 });
  }
  all.forEach(t => {
    const c = months.find(m => m.key === String(t.date || t.createdAt || "").slice(0, 7));
    if (c) c.open++;
    if (t.archivedAt) {
      const d = months.find(m => m.key === t.archivedAt.slice(0, 7));
      if (d) d.done++;
    }
  });
  const mMax = Math.max(1, ...months.map(m => Math.max(m.open, m.done)));
  const cm = $("#chart-months");
  cm.innerHTML = "";
  months.forEach(m => {
    const wrap = el("div", { class:"month" });
    const colsBox = el("div", { class:"month-cols" });
    const c1 = el("span", { class:"month-col c-open", title:`${m.open} créée(s)` });
    const c2 = el("span", { class:"month-col c-done", title:`${m.done} archivée(s)` });
    colsBox.append(c1, c2);
    wrap.append(colsBox, el("span", { class:"month-name" }, m.name));
    cm.appendChild(wrap);
    requestAnimationFrame(() => {
      c1.style.height = Math.max(2, (m.open / mMax) * 100) + "%";
      c2.style.height = Math.max(2, (m.done / mMax) * 100) + "%";
    });
  });

  /* État des échéances */
  const segs = [
    { l:"En retard",     cls:"st-late",  n:late.length },
    { l:"Aujourd'hui",   cls:"st-today", n:a.filter(t => daysUntil(t.echeance) === 0).length },
    { l:"Sous 7 jours",  cls:"st-soon",  n:week.length },
    { l:"Plus tard",     cls:"st-far",   n:a.filter(t => { const d = daysUntil(t.echeance); return d !== null && d > 7; }).length },
    { l:"Sans échéance", cls:"st-none",  n:a.filter(t => !t.echeance).length }
  ];
  const sMax = Math.max(1, ...segs.map(s => s.n));
  const ce = $("#chart-echeance");
  ce.innerHTML = "";
  segs.forEach(s => {
    const r = el("div", { class:"seg-row" });
    const key = el("div", { class:"seg-key" });
    const sq = el("i", { class:"dot " + s.cls });
    sq.style.width = "12px"; sq.style.height = "12px";
    if (s.cls === "st-none") sq.style.border = "1px solid #D6D6D6";
    key.append(sq, document.createTextNode(s.l));
    const track = el("div", { class:"seg-track" });
    const fill = el("span", { class:"seg-fill " + s.cls });
    track.appendChild(fill);
    r.append(key, track, el("span", { class:"seg-num" }, String(s.n)));
    ce.appendChild(r);
    requestAnimationFrame(() => { fill.style.width = (s.n / sMax) * 100 + "%"; });
  });

  /* Prochaines échéances */
  const next = a.filter(t => t.echeance)
    .sort((x, y) => x.echeance.localeCompare(y.echeance)).slice(0, 6);
  const nl = $("#next-list");
  nl.innerHTML = "";
  if (!next.length) nl.appendChild(el("li", { class:"cfg-note" }, "Aucune échéance posée pour l'instant."));
  next.forEach(t => {
    const d = daysUntil(t.echeance);
    const cls = d < 0 ? "n-late" : d === 0 ? "n-today" : "";
    const li = el("li", { class:"next-item " + cls, "data-id":t.id, tabindex:"0" });
    li.appendChild(el("span", { class:"next-sujet" }, t.sujet || "Sans sujet"));
    const when = d < 0 ? `${-d} j de retard` : d === 0 ? "Aujourd'hui" : `dans ${d} j`;
    li.appendChild(el("span", { class:"next-when" }, `${frDate(t.echeance)} · ${when}`));
    li.addEventListener("click", () => openSheet(t.id));
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
function buildPrint(mode) {
  const area = $("#print-area");
  if (mode === "synthese") return buildPrintSynth(area);
  const list = mode === "archives" ? filteredArchives() : filteredActives();
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
  const rows = list.map(t => "<tr>" + printCols.map(c => {
    const v = c.type === "date" ? frDate(t[c.key]) : (t[c.key] || "");
    return `<td class="${c.key === "sujet" ? "p-sujet" : ""}">${esc(v)}</td>`;
  }).join("") + "</tr>").join("");

  // Lignes vides pour écrire à la main, comme sur le tableau d'origine
  const blanks = Math.max(0, Math.min(10, 16 - list.length - (mode === "archives" ? 0 : notes().length)));
  const blankRows = Array.from({ length: blanks },
    () => `<tr class="p-empty-row">${printCols.map(() => "<td></td>").join("")}</tr>`).join("");

  const pending = mode === "archives" ? [] : notes();
  const notesBlock = pending.length
    ? `<div class="p-notes"><b>Notes en attente</b>${
        pending.map(n => `<span>${esc(n.texte)}</span>`).join("")}</div>`
    : "";

  area.innerHTML = head +
    `<table class="p-table"><thead><tr>${ths}</tr></thead><tbody>${rows}${blankRows}</tbody></table>` +
    notesBlock +
    `<div class="p-foot"><span>PIC — Programme d'Interaction Collaboratif</span><span>by Majin</span></div>`;

  fitToPage(area);
}
function buildPrintSynth(area) {
  const d = synthData(synthRange);
  const head = `<div class="p-head">
      <div class="p-title">SYNTHÈSE REX — ${esc(d.bounds.label.toUpperCase())}</div>
      <div class="p-majin">by Majin</div>
    </div>
    <div class="p-sub">
      <span>PIC — Programme d'Interaction Collaboratif · ${d.stats.closes} tâche(s) close(s) ·
        ${d.stats.avec} REX rédigé(s) · ${d.stats.collabs} collaboration(s) ·
        délai moyen ${d.stats.moyen === null ? "—" : d.stats.moyen + " j"}</span>
      <span>Édité le ${frDate(todayISO())}</span>
    </div>`;

  const groups = Object.entries(d.groups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, items]) => `<section class="p-group">
        <h3>${esc(name)} <em>${items.length}</em></h3>
        ${items.map(t => `<div class="p-item">
            <b>${esc(t.sujet || "Sans sujet")}</b>
            <i>${esc(frDate(String(t.archivedAt).slice(0, 10)))}${leadTime(t) !== null ? " · " + leadTime(t) + " j" : ""}</i>
            <p>${esc((t.rex || "").trim() || "REX non rédigé.")}</p>
          </div>`).join("")}
      </section>`).join("");

  area.innerHTML = head + `<div class="p-synth">${groups}</div>` +
    `<div class="p-foot"><span>Retours d'expérience — ${esc(d.bounds.label)}</span><span>by Majin</span></div>`;

  fitToPage(area);
}

function fitToPage(area) {
  const PAGE_W = 1050, PAGE_H = 720;   // A4 paysage moins les marges, en px @96dpi
  area.style.cssText = "display:block;position:absolute;left:-99999px;top:0;width:" + PAGE_W + "px";
  const h = area.scrollHeight;
  area.style.cssText = "";
  const scale = Math.max(0.45, Math.min(1, PAGE_H / (h || 1)));
  document.documentElement.style.setProperty("--print-scale", scale.toFixed(3));
}

function doPrint(mode) {
  buildPrint(mode);
  setTimeout(() => window.print(), 60);
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
      new Notification("PIC — rappel d'échéance", { body: msg, icon:"icon-192.png", tag:"pic-rappel" });
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
  updatePushState();
  $("#cfg-intro").checked = data.settings.intro !== false;
  $("#cfg-reminders").checked = data.settings.reminders;
  $("#cfg-lead").value = String(data.settings.lead);
  $("#cfg-sound").checked = data.settings.sound;
  $("#cfg-dense").checked = data.settings.dense;
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
  download(`pic-majin-${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
  toast("Sauvegarde exportée.", "ok");
}
function exportCSV() {
  const c = visCols();
  const head = ["Statut", ...c.map(x => x.label)];
  const rows = live().map(t => [
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
    try {
      const parsed = JSON.parse(r.result);
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error("format");
      const existing = new Set(data.tasks.map(t => t.id));
      let added = 0;
      parsed.tasks.forEach(t => { if (t && t.id && !existing.has(t.id)) { data.tasks.push(t); added++; } });
      if (Array.isArray(parsed.columns)) {
        data.columns = DEFAULT_COLUMNS.map(def => {
          const f = parsed.columns.find(c => c.key === def.key);
          return f ? { ...def, label:f.label || def.label, visible:f.visible !== false } : { ...def };
        });
      }
      save(); renderAll();
      toast(`Import terminé : ${added} tâche(s) ajoutée(s).`, "ok");
    } catch (e) {
      toast("Fichier illisible. Attendu : un export JSON de PIC.", "warn");
    }
  };
  r.readAsText(file);
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
  dot.className = "sync-dot is-" + state;
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

async function enableSync(passphrase) {
  const code = String(passphrase || "").trim();
  if (code.length < 8) { toast("Le code d'espace doit faire au moins 8 caractères.", "warn"); return false; }
  data.sync.space = await spaceHash(code);
  data.sync.enabled = true;
  touchMeta();
  save();
  await writeSpaceForWorker();
  await syncNow(false);
  return true;
}

function disableSync() {
  data.sync.enabled = false;
  data.sync.space = "";
  data.sync.lastAt = null;
  save();
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
    toast("Ce navigateur ne gère pas les rappels poussés. Sur iPhone, ajoutez d'abord PIC à l'écran d'accueil.", "warn");
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
    line.textContent = "Rappels poussés indisponibles ici. Sur iPhone, ajoutez PIC à l'écran d'accueil puis rouvrez ce réglage.";
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
    : "Inactifs. Les rappels ne s'affichent que si PIC est ouvert.";
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
        sec.appendChild(it);
      });
      box.appendChild(sec);
    });
}

/* ============================================================
   Navigation & événements
   ============================================================ */
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

function renderAll() { renderTable(); renderNotes(); renderArchives(); renderBoard(); }

function wire() {
  $$(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));

  $("#btn-new").addEventListener("click", newTask);
  $("#empty-taches").addEventListener("click", e => {
    if (e.target.dataset.act === "new-from-empty") newTask();
  });
  $("#btn-print").addEventListener("click", () => doPrint("taches"));
  $("#btn-print-arch").addEventListener("click", () => doPrint("archives"));
  $("#btn-columns").addEventListener("click", openCfg);
  $("#btn-settings").addEventListener("click", openCfg);

  /* Filtres */
  let qTimer;
  $("#q").addEventListener("input", e => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { filters.q = e.target.value; renderTable(); }, 130);
  });
  $("#f-collab").addEventListener("change", e => { filters.collab = e.target.value; renderTable(); });
  $("#f-echeance").addEventListener("change", e => { filters.ech = e.target.value; renderTable(); });
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
    const tr = e.target.closest("tr");
    if (!tr) return;
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const id = tr.dataset.id;
    if (act.dataset.act === "archive") archiveTask(id, act);
    else if (act.dataset.act === "open") openSheet(id);
    else if (act.dataset.act === "edit") openEditorFor(id, act.dataset.key);
  });
  $("#body-taches").addEventListener("keydown", e => {
    const c = e.target.closest(".cell");
    if (c && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openEditorFor(c.closest("tr").dataset.id, c.dataset.key);
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
  $("#sheet-backdrop").addEventListener("click", e => { if (e.target.id === "sheet-backdrop") closeSheet(); });
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
  });
  $("#cfg-notif-ask").addEventListener("click", () => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(() => {
      updateNotifState();
      if (Notification.permission === "granted") toast("Rappels système activés.", "ok");
    });
  });
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
  $("#synth-close").addEventListener("click", closeSynth);
  $("#synth-print").addEventListener("click", () => doPrint("synthese"));
  $("#synth-range").addEventListener("change", e => { synthRange = e.target.value; renderSynth(); });
  $("#synth-backdrop").addEventListener("click", e => { if (e.target.id === "synth-backdrop") closeSynth(); });

  /* Ouverture animée */
  $("#cfg-intro").addEventListener("change", e => { data.settings.intro = e.target.checked; save(); });
  $("#btn-intro-replay").addEventListener("click", () => {
    closeCfg();
    setTimeout(() => window.PICIntro && window.PICIntro.play({ sound: data.settings.sound }), 250);
  });

  $("#cfg-export").addEventListener("click", exportJSON);
  $("#cfg-csv").addEventListener("click", exportCSV);
  $("#cfg-import").addEventListener("click", () => $("#file-import").click());
  $("#file-import").addEventListener("change", e => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = "";
  });
  $("#cfg-reset").addEventListener("click", () => {
    if (confirm("Effacer toutes les tâches et tous les REX de ce navigateur ? Exportez d'abord si vous voulez les garder.")) {
      data.tasks = []; save(); closeCfg(); renderAll();
      toast("Données effacées.", "warn");
    }
  });

  /* Raccourcis */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("#sheet-backdrop").hidden) closeSheet();
      else if (!$("#synth-backdrop").hidden) closeSynth();
      else if (!$("#cfg-backdrop").hidden) closeCfg();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p" && view === "taches") {
      e.preventDefault(); doPrint("taches");
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
  purgeTombstones();
  pruneEmptyTasks();
  document.body.classList.toggle("is-dense", data.settings.dense);
  wire();
  renderAll();
  setSyncState(data.sync.enabled ? "pending" : "off");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  const started = (data.settings.intro !== false && window.PICIntro)
    ? window.PICIntro.play({ sound: data.settings.sound })
    : Promise.resolve();

  started.then(() => {
    if (data.sync.enabled) { writeSpaceForWorker(); syncNow(true); }
    checkReminders();
  });

  setInterval(checkReminders, 60000);
  setInterval(() => { if (data.sync.enabled && !document.hidden) syncNow(true); }, 300000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { refreshCounters(); checkReminders(); if (data.sync.enabled) syncNow(true); }
  });
  window.addEventListener("online",  () => { if (data.sync.enabled) syncNow(true); });
  window.addEventListener("offline", () => setSyncState("offline"));
}
boot();

})();
