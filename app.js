'use strict';

/* ============================================================================
 * Points — liste à points (Final Version de Mark Forster), version iPhone.
 *
 * ŒUVRE DÉRIVÉE de https://github.com/bsoule/dotlist.
 *   En viennent : l'algorithme et son découpage en fonctions (voir § 2), la
 *   machine à états à quatre modes, la forme des données.
 *   Écrits ici : l'interface, l'historique, la sauvegarde, les thèmes,
 *   l'installation iOS, et le suivi du curseur de revue par identifiant.
 *   La méthode elle-même est de Mark Forster.
 *
 * Code écrit par Claude Code (Opus 5, Anthropic).
 * dotlist est publié sans licence — voir NOTICE.md avant toute réutilisation.
 *
 * Plan du fichier :
 *   1. État + persistance
 *   2. Algorithme (ancre, chaîne, ordre d'exécution)
 *   3. Rendu
 *   4. Actions
 *   5. Feuilles modales
 *   6. Historique
 *   7. Sauvegarde (export / import)
 *   8. Plomberie iOS + démarrage
 * ========================================================================== */


/* ---------------------------------------------------------------------------
 * 1. ÉTAT + PERSISTANCE
 *
 * Un seul objet JSON dans localStorage :
 *   {
 *     v, lastBackupAt, nagDismissedAt,
 *     mode: 'empty' | 'idle' | 'reviewing' | 'executing',
 *     reviewCursor: <id de la tâche en cours de comparaison> | null,
 *     tasks: [{ id, text, dotted, dotOrder, addedAt, doneAt, outcome }]
 *   }
 *
 * Note : le dépôt d'origine repère la candidate par son *index* dans le
 * tableau. On utilise son *id* — un index se décale dès qu'on supprime une
 * tâche pendant une revue.
 * ------------------------------------------------------------------------- */

const STORAGE_KEY = 'points-v1';
const SCHEMA = 1;
const BACKUP_INTERVAL = 30 * 24 * 3600 * 1000;  // 30 jours
const NAG_SNOOZE      =  7 * 24 * 3600 * 1000;  // 7 jours

let state;
let undoSnapshot = null;   // état sérialisé d'avant la dernière action annulable
let toastTimer = null;

function emptyState() {
  return {
    v: SCHEMA,
    tasks: [],
    mode: 'empty',
    reviewCursor: null,
    lastBackupAt: null,
    nagDismissedAt: null,
    theme: 'paper',          // 'paper' (encre électronique) | 'color'
  };
}

// Le thème vit sur <html> ; le CSS fait le reste.
function applyTheme() {
  document.documentElement.dataset.theme = state.theme === 'color' ? 'color' : 'paper';
  // La barre d'état iOS suit la couleur de fond du thème actif.
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = bg || (dark ? '#111110' : '#f4f3ef');
  document.head.appendChild(meta);
}

function makeTask(text) {
  return {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2),
    text,
    dotted: false,
    dotOrder: null,
    addedAt: Date.now(),
    doneAt: null,
    outcome: null,           // 'done' | 'partial' une fois terminée
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return emptyState();
    return normalize(parsed);
  } catch (e) {
    return emptyState();
  }
}

// Complète les champs manquants : tolère les vieilles sauvegardes et les
// fichiers importés d'une autre version.
function normalize(s) {
  const base = emptyState();
  const out = Object.assign(base, s);
  out.v = SCHEMA;
  out.tasks = s.tasks
    .filter(t => t && typeof t.text === 'string')
    .map(t => Object.assign(makeTask(t.text), {
      id:       t.id       || makeTask('').id,
      dotted:   !!t.dotted,
      dotOrder: typeof t.dotOrder === 'number' ? t.dotOrder : null,
      addedAt:  typeof t.addedAt === 'number' ? t.addedAt : Date.now(),
      doneAt:   typeof t.doneAt === 'number' ? t.doneAt : null,
      outcome:  t.outcome === 'partial' ? 'partial' : (t.doneAt ? 'done' : null),
    }));
  if (!['empty', 'idle', 'reviewing', 'executing'].includes(out.mode)) out.mode = 'idle';
  if (out.theme !== 'color') out.theme = 'paper';
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Navigation privée ou stockage plein : on continue sans persister.
  }
}


/* ---------------------------------------------------------------------------
 * 2. ALGORITHME
 *
 * Actives = doneAt === null.
 * Repère (benchmark) = tâche active pointée au plus grand dotOrder.
 * Ancre = tâche active la plus haute ; toujours pointée, dotOrder 0.
 * Chaîne = actives pointées triées par dotOrder ; on l'exécute à l'envers.
 * ------------------------------------------------------------------------- */

const activeTasks = () => state.tasks.filter(t => t.doneAt === null);
const doneTasks   = () => state.tasks.filter(t => t.doneAt !== null);
const taskById    = id => state.tasks.find(t => t.id === id);

function chain() {
  return activeTasks().filter(t => t.dotted).sort((a, b) => a.dotOrder - b.dotOrder);
}

function nextDotOrder() {
  const c = chain();
  return c.length ? c[c.length - 1].dotOrder + 1 : 0;
}

// La tâche active la plus haute doit toujours porter un point (dotOrder 0).
function recomputeAnchor() {
  const active = activeTasks();
  if (!active.length) return;
  if (!active.some(t => t.dotted && t.dotOrder === 0)) {
    active[0].dotted = true;
    active[0].dotOrder = 0;
  }
}

// Index de la prochaine tâche active NON pointée strictement sous `fromIndex`.
// -1 signifie « on a atteint le bas » — fin de la revue.
function nextCandidateIndex(fromIndex) {
  for (let i = fromIndex + 1; i < state.tasks.length; i++) {
    const t = state.tasks[i];
    if (t.doneAt === null && !t.dotted) return i;
  }
  return -1;
}

// Index du repère : plus grand dotOrder parmi les actives pointées.
function benchmarkIndex() {
  let best = -1, bestOrder = -1;
  state.tasks.forEach((t, i) => {
    if (t.doneAt === null && t.dotted && t.dotOrder > bestOrder) {
      bestOrder = t.dotOrder;
      best = i;
    }
  });
  return best;
}

// Remet l'état d'aplomb après n'importe quelle mutation : mode cohérent,
// ancre présente, curseur de revue valide.
function reconcile() {
  if (activeTasks().length === 0) {
    state.mode = 'empty';
    state.reviewCursor = null;
    return;
  }
  if (state.mode === 'empty') state.mode = 'idle';

  if (state.mode === 'reviewing') {
    const cur = state.reviewCursor ? taskById(state.reviewCursor) : null;
    // La candidate a disparu, a été terminée ou pointée entre-temps : on avance.
    if (!cur || cur.doneAt !== null || cur.dotted) {
      const from = cur ? state.tasks.indexOf(cur) : benchmarkIndex();
      const next = nextCandidateIndex(from);
      if (next === -1) { state.mode = 'executing'; state.reviewCursor = null; }
      else state.reviewCursor = state.tasks[next].id;
    }
  }

  if (state.mode === 'executing' && chain().length === 0) state.mode = 'idle';
  if (state.mode !== 'reviewing') state.reviewCursor = null;

  // Pas de ré-ancrage pendant l'exécution : ça pointerait une tâche non revue.
  if (state.mode !== 'executing') recomputeAnchor();
}

// Enregistre / persiste / redessine, en une fois.
function commit() {
  reconcile();
  save();
  render();
}


/* ---------------------------------------------------------------------------
 * 3. RENDU
 * ------------------------------------------------------------------------- */

const $ = id => document.getElementById(id);
const $panel = $('panel');
const $list = $('task-list');
const $composer = $('composer');
const $input = $('task-input');

function render() {
  renderPanel();
  renderList();
  renderNag();
  // Le champ d'ajout disparaît pendant la revue : on compare, on ne capture pas.
  $composer.hidden = state.mode === 'reviewing';
}

function renderPanel() {
  $panel.innerHTML = '';

  if (state.mode === 'empty') return;

  if (state.mode === 'idle') {
    const idx = benchmarkIndex();
    $panel.innerHTML = `
      <p class="label">Ton repère</p>
      <p class="question"><span class="subject"></span></p>
      <div class="row"><button class="btn primary" id="start-review">Commencer la revue</button></div>`;
    $panel.querySelector('.subject').textContent = idx >= 0 ? state.tasks[idx].text : '';
    $('start-review').onclick = startReview;
    return;
  }

  if (state.mode === 'reviewing') {
    const cand = taskById(state.reviewCursor);
    const bIdx = benchmarkIndex();
    if (!cand || bIdx < 0) { finishReview(); return; }
    $panel.innerHTML = `
      <p class="label">Tu veux faire</p>
      <p class="question">
        <span class="subject candidate-text"></span>
        <span class="versus">plus que <b class="bench"></b> ?</span>
      </p>
      <div class="row">
        <button class="btn" id="review-no">Non</button>
        <button class="btn primary" id="review-yes">Oui</button>
      </div>
      <div class="row"><button class="btn ghost" id="end-review">Arrêter la revue et travailler</button></div>`;
    $panel.querySelector('.candidate-text').textContent = cand.text;
    $panel.querySelector('.bench').textContent = state.tasks[bIdx].text;
    $('review-yes').onclick = reviewYes;
    $('review-no').onclick = reviewNo;
    $('end-review').onclick = finishReview;
    return;
  }

  if (state.mode === 'executing') {
    const idx = benchmarkIndex();
    if (idx < 0) { commit(); return; }
    $panel.innerHTML = `
      <p class="label">En cours</p>
      <p class="question"><span class="subject"></span></p>
      <div class="row">
        <button class="btn" id="partial">Commencé</button>
        <button class="btn primary" id="done">Terminé</button>
      </div>
      <p class="hint-inline">« Commencé » raye la tâche et en remet une copie en bas de la liste.</p>`;
    $panel.querySelector('.subject').textContent = state.tasks[idx].text;
    $('done').onclick = () => completeCurrent(false);
    $('partial').onclick = () => completeCurrent(true);
  }
}

function renderList() {
  $list.innerHTML = '';
  const active = activeTasks();
  $('list-empty').hidden = active.length > 0;

  const bIdx = benchmarkIndex();
  const benchmarkId = bIdx >= 0 ? state.tasks[bIdx].id : null;
  const anchor = active.find(t => t.dotted && t.dotOrder === 0);

  active.forEach(t => {
    const li = document.createElement('li');
    const cls = [];
    if (t.dotted) cls.push('dotted');
    if (anchor && t.id === anchor.id) cls.push('anchor');
    if (state.mode === 'reviewing' && t.id === state.reviewCursor) cls.push('candidate');
    if (state.mode === 'executing' && t.id === benchmarkId) cls.push('next-up');
    li.className = cls.join(' ');

    const dot = document.createElement('span');
    dot.className = 'dot-marker';
    dot.textContent = t.dotted ? '●' : '';
    li.appendChild(dot);

    // Toute la ligne est une cible tactile : tap → feuille d'actions.
    const btn = document.createElement('button');
    btn.className = 'task-text';
    btn.type = 'button';
    btn.textContent = t.text;
    btn.onclick = () => openTaskSheet(t.id);
    li.appendChild(btn);

    const check = document.createElement('button');
    check.className = 'task-check';
    check.type = 'button';
    check.textContent = '✓';
    check.setAttribute('aria-label', `Marquer « ${t.text} » comme terminée`);
    check.onclick = e => { e.stopPropagation(); completeTask(t.id, 'done'); };
    li.appendChild(check);

    li.dataset.id = t.id;
    $list.appendChild(li);
  });

  // Pendant la revue, garder la tâche comparée sous les yeux.
  if (state.mode === 'reviewing') {
    const el = $list.querySelector(`li[data-id="${CSS.escape(state.reviewCursor || '')}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}


/* ---------------------------------------------------------------------------
 * 4. ACTIONS
 * ------------------------------------------------------------------------- */

function snapshot() { undoSnapshot = JSON.stringify(state); }

function undo() {
  if (!undoSnapshot) return;
  state = JSON.parse(undoSnapshot);
  undoSnapshot = null;
  hideToast();
  save();
  render();
}

function addTask(text) {
  text = text.trim();
  if (!text) return;
  state.tasks.push(makeTask(text));
  commit();
}

function startReview() {
  const from = benchmarkIndex();
  const next = nextCandidateIndex(from);
  if (next === -1) {
    state.mode = 'executing';       // rien sous l'ancre : droit au travail
  } else {
    state.mode = 'reviewing';
    state.reviewCursor = state.tasks[next].id;
  }
  commit();
}

function reviewYes() {
  const cand = taskById(state.reviewCursor);
  if (!cand) return;
  cand.dotted = true;
  cand.dotOrder = nextDotOrder();
  advanceCursorFrom(state.tasks.indexOf(cand));
}

function reviewNo() {
  const cand = taskById(state.reviewCursor);
  if (!cand) return;
  advanceCursorFrom(state.tasks.indexOf(cand));
}

// Descend à la candidate suivante, ou bascule en exécution si on est en bas.
function advanceCursorFrom(index) {
  const next = nextCandidateIndex(index);
  if (next === -1) { finishReview(); return; }
  state.reviewCursor = state.tasks[next].id;
  commit();
}

function finishReview() {
  state.mode = 'executing';
  state.reviewCursor = null;
  commit();
}

// Termine la tâche en tête de chaîne, depuis le panneau d'exécution.
function completeCurrent(partial) {
  const idx = benchmarkIndex();
  if (idx < 0) return;
  const t = state.tasks[idx];
  snapshot();
  t.doneAt = Date.now();
  t.dotted = false;
  t.outcome = partial ? 'partial' : 'done';
  // « Commencé, pas fini » : une copie neuve repart en bas de la liste.
  if (partial) state.tasks.push(makeTask(t.text));
  commit();
  toast(partial ? 'Repoussée en bas de liste' : 'Terminé');
}

// Termine n'importe quelle tâche, même hors chaîne (le ✓ de la ligne).
function completeTask(id, outcome) {
  const t = taskById(id);
  if (!t || t.doneAt !== null) return;
  snapshot();
  t.doneAt = Date.now();
  t.dotted = false;
  t.outcome = outcome || 'done';
  commit();
  toast('Terminé');
}

function deleteTask(id) {
  const t = taskById(id);
  if (!t) return;
  snapshot();
  // Si on supprime la tâche affichée en revue, choisir la suivante AVANT
  // de retirer l'élément — après, son index n'existe plus.
  if (state.mode === 'reviewing' && state.reviewCursor === id) {
    const next = nextCandidateIndex(state.tasks.indexOf(t));
    state.reviewCursor = next === -1 ? null : state.tasks[next].id;
    if (next === -1) state.mode = 'executing';
  }
  state.tasks = state.tasks.filter(x => x.id !== id);
  commit();
  toast('Supprimée');
}

// Renvoie une tâche tout en bas de la liste, sans point.
function sendToBottom(id) {
  const t = taskById(id);
  if (!t) return;
  snapshot();
  if (state.mode === 'reviewing' && state.reviewCursor === id) {
    const next = nextCandidateIndex(state.tasks.indexOf(t));
    state.reviewCursor = next === -1 ? null : state.tasks[next].id;
    if (next === -1) state.mode = 'executing';
  }
  t.dotted = false;
  t.dotOrder = null;
  state.tasks = state.tasks.filter(x => x.id !== id);
  state.tasks.push(t);
  commit();
  toast('Renvoyée en bas');
}

// Ajoute une tâche à la chaîne du jour sans passer par la revue (l'« urgent »
// du dépôt d'origine) : elle devient la prochaine à faire.
function dotNow(id) {
  const t = taskById(id);
  if (!t || t.dotted || t.doneAt !== null) return;
  t.dotted = true;
  t.dotOrder = nextDotOrder();
  if (state.mode === 'idle') state.mode = 'executing';
  commit();
}

function renameTask(id, text) {
  const t = taskById(id);
  if (!t || !text.trim()) return;
  t.text = text.trim();
  commit();
}

function reopenTask(id) {
  const t = taskById(id);
  if (!t) return;
  snapshot();
  t.doneAt = null;
  t.outcome = null;
  t.dotted = false;
  t.dotOrder = null;
  // Elle revient en bas de la liste active.
  state.tasks = state.tasks.filter(x => x.id !== id);
  state.tasks.push(t);
  commit();
}


/* ---------------------------------------------------------------------------
 * 5. FEUILLES MODALES
 * ------------------------------------------------------------------------- */

const $sheet = $('sheet');
const $scrim = $('scrim');

function openSheet(html, wire) {
  $sheet.innerHTML = `<div class="grabber"></div>` + html;
  $sheet.hidden = false;
  $scrim.hidden = false;
  if (wire) wire($sheet);
  $sheet.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
}

function closeSheet() {
  $sheet.hidden = true;
  $scrim.hidden = true;
  $sheet.innerHTML = '';
}

$scrim.onclick = closeSheet;

function openTaskSheet(id) {
  const t = taskById(id);
  if (!t) return;
  // Texte seul, sans pictogrammes : c'est la convention des feuilles iOS, et
  // ça évite les symboles qui basculent en emoji couleur selon la police.
  const rows = [];
  if (t.doneAt === null) {
    rows.push(`<button class="sheet-btn" data-act="done">Marquer terminée</button>`);
    if (!t.dotted) rows.push(`<button class="sheet-btn" data-act="dot">Faire maintenant</button>`);
    rows.push(`<button class="sheet-btn" data-act="bottom">Renvoyer en bas de liste</button>`);
  } else {
    rows.push(`<button class="sheet-btn" data-act="reopen">Remettre dans la liste</button>`);
  }
  rows.push(`<button class="sheet-btn" data-act="rename">Renommer</button>`);
  rows.push(`<button class="sheet-btn danger" data-act="delete">Supprimer</button>`);
  rows.push(`<button class="sheet-btn cancel" data-close>Annuler</button>`);

  openSheet(`<h3></h3>${rows.join('')}`, el => {
    el.querySelector('h3').textContent = t.text;
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'rename') { openRenameSheet(id); return; }
      closeSheet();
      if (act === 'done')   completeTask(id, 'done');
      if (act === 'dot')    dotNow(id);
      if (act === 'bottom') sendToBottom(id);
      if (act === 'reopen') reopenTask(id);
      if (act === 'delete') deleteTask(id);
    });
  });
}

function openRenameSheet(id) {
  const t = taskById(id);
  if (!t) return;
  openSheet(`
    <h3>Renommer</h3>
    <input type="text" id="rename-input" enterkeyhint="done">
    <button class="sheet-btn" id="rename-save">Enregistrer</button>
    <button class="sheet-btn cancel" data-close>Annuler</button>`, el => {
    const input = el.querySelector('#rename-input');
    input.value = t.text;
    const commitRename = () => { renameTask(id, input.value); closeSheet(); };
    el.querySelector('#rename-save').onclick = commitRename;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') commitRename(); });
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}

function openMenu() {
  openSheet(`
    <button class="sheet-btn" data-act="history">Historique</button>
    <button class="sheet-btn" data-act="backup">Sauvegarde</button>
    <button class="sheet-btn" data-act="theme">Apparence</button>
    <button class="sheet-btn" data-act="help">Comment ça marche</button>
    <button class="sheet-btn danger" data-act="reset">Tout effacer</button>
    <button class="sheet-btn cancel" data-close>Annuler</button>`, el => {
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'theme') { openThemeSheet(); return; }
      closeSheet();
      if (act === 'history') openHistory();
      if (act === 'backup')  openBackupSheet();
      if (act === 'help')    openPage('page-help');
      if (act === 'reset')   confirmReset();
    });
  });
}

function openThemeSheet() {
  const mark = t => state.theme === t ? ' ✓' : '';
  openSheet(`
    <h3>Apparence</h3>
    <button class="sheet-btn" data-set-theme="paper">Papier${mark('paper')}</button>
    <button class="sheet-btn" data-set-theme="color">Couleur${mark('color')}</button>
    <p class="hint">Papier : monochrome, façon encre électronique.
       Les deux suivent le mode clair/sombre du téléphone.</p>
    <button class="sheet-btn cancel" data-close>Fermer</button>`, el => {
    el.querySelectorAll('[data-set-theme]').forEach(b => b.onclick = () => {
      state.theme = b.dataset.setTheme;
      save();
      applyTheme();
      openThemeSheet();      // redessine la feuille pour déplacer la coche
    });
  });
}

function confirmReset() {
  openSheet(`
    <h3>Effacer toutes les tâches et l'historique ? C'est définitif.</h3>
    <button class="sheet-btn danger" id="reset-yes">Tout effacer</button>
    <button class="sheet-btn cancel" data-close>Annuler</button>`, el => {
    el.querySelector('#reset-yes').onclick = () => {
      snapshot();
      // Effacer les tâches ne doit pas réinitialiser les préférences.
      const keep = { lastBackupAt: state.lastBackupAt, theme: state.theme };
      state = Object.assign(emptyState(), keep);
      closeSheet();
      commit();
      toast('Liste effacée');
    };
  });
}

/* ---- Toast (avec annulation) ---- */
function toast(msg) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    $('dock').appendChild(el);      // flotte au-dessus du dock
  }
  el.innerHTML = `<span></span><button class="linklike">Annuler</button>`;
  el.querySelector('span').textContent = msg;
  el.querySelector('button').onclick = undo;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  const el = $('toast');
  if (el) el.hidden = true;
}


/* ---------------------------------------------------------------------------
 * 6. HISTORIQUE
 * ------------------------------------------------------------------------- */

function openPage(id) { $(id).hidden = false; }
function closePage(el) { el.hidden = true; }

document.querySelectorAll('[data-close-page]').forEach(b => {
  b.onclick = () => closePage(b.closest('.page'));
});

const DAY_MS = 24 * 3600 * 1000;
const dayKey = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

function openHistory() {
  renderHistory();
  openPage('page-history');
}

function renderHistory() {
  const body = $('history-body');
  const done = doneTasks().sort((a, b) => b.doneAt - a.doneAt);

  const today = dayKey(Date.now());
  const nToday = done.filter(t => dayKey(t.doneAt) === today).length;
  const nWeek  = done.filter(t => t.doneAt > Date.now() - 7 * DAY_MS).length;

  body.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${nToday}</b><span>aujourd'hui</span></div>
      <div class="stat"><b>${nWeek}</b><span>7 jours</span></div>
      <div class="stat"><b>${done.length}</b><span>en tout</span></div>
    </div>`;

  if (!done.length) {
    body.insertAdjacentHTML('beforeend',
      `<p class="list-empty">Rien d'accompli pour l'instant.<br>Ça viendra.</p>`);
    return;
  }

  let lastDay = null;
  done.forEach(t => {
    const k = dayKey(t.doneAt);
    if (k !== lastDay) {
      lastDay = k;
      const h = document.createElement('div');
      h.className = 'day-head';
      h.textContent = labelForDay(k);
      body.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'hist-item' + (t.outcome === 'partial' ? ' partial' : '');
    const txt = document.createElement('span');
    txt.className = 't';
    txt.textContent = t.text;
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = new Date(t.doneAt)
      .toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    row.append(txt, when);
    body.appendChild(row);
  });
}

function labelForDay(k) {
  const today = dayKey(Date.now());
  if (k === today) return "Aujourd'hui";
  if (k === today - DAY_MS) return 'Hier';
  return new Date(k).toLocaleDateString('fr-CA',
    { weekday: 'long', day: 'numeric', month: 'long' });
}

$('clear-history').onclick = () => {
  openSheet(`
    <h3>Vider l'historique ? Les tâches terminées seront supprimées définitivement.</h3>
    <button class="sheet-btn danger" id="ch-yes">Vider</button>
    <button class="sheet-btn cancel" data-close>Annuler</button>`, el => {
    el.querySelector('#ch-yes').onclick = () => {
      snapshot();
      state.tasks = state.tasks.filter(t => t.doneAt === null);
      closeSheet();
      commit();
      renderHistory();
    };
  });
};


/* ---------------------------------------------------------------------------
 * 7. SAUVEGARDE
 *
 * Le stockage local d'iOS n'est pas éternel : Safari peut le purger, et une
 * réinstallation de l'app le vide. L'export est le seul vrai filet.
 * ------------------------------------------------------------------------- */

function backupJSON() {
  return JSON.stringify({ ...state, exportedAt: Date.now() }, null, 2);
}

function backupFilename() {
  return `points-${new Date().toISOString().slice(0, 10)}.json`;
}

function markBackedUp() {
  state.lastBackupAt = Date.now();
  save();
  renderNag();
}

async function exportBackup() {
  const json = backupJSON();
  const file = new File([json], backupFilename(), { type: 'application/json' });

  // Sur iOS, la feuille de partage est la bonne voie : elle donne accès à
  // « Enregistrer dans Fichiers », iCloud Drive, Mail…
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Points' });
      markBackedUp();
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // partage annulé : pas une erreur
    }
  }

  // Repli navigateur de bureau : téléchargement classique.
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markBackedUp();
}

async function copyBackup() {
  try {
    await navigator.clipboard.writeText(backupJSON());
    closeSheet();
    toast('Copié dans le presse-papier');
    markBackedUp();
  } catch (e) {
    closeSheet();
    toast('Copie impossible');
  }
}

function openBackupSheet() {
  const last = state.lastBackupAt
    ? `Dernière sauvegarde : ${new Date(state.lastBackupAt).toLocaleDateString('fr-CA',
        { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : `Aucune sauvegarde pour l'instant.`;

  openSheet(`
    <h3>Sauvegarde</h3>
    <p class="hint">${last} Les tâches vivent uniquement sur cet appareil ;
       exporte de temps en temps vers Fichiers ou iCloud.</p>
    <button class="sheet-btn" id="bk-export">Exporter un fichier</button>
    <button class="sheet-btn" id="bk-copy">Copier dans le presse-papier</button>
    <button class="sheet-btn" id="bk-import">Importer un fichier</button>
    <button class="sheet-btn cancel" data-close>Fermer</button>`, el => {
    el.querySelector('#bk-export').onclick = () => { exportBackup(); closeSheet(); };
    el.querySelector('#bk-copy').onclick = copyBackup;
    el.querySelector('#bk-import').onclick = () => { closeSheet(); $('import-file').click(); };
  });
}

$('import-file').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';                 // permet de réimporter le même fichier
  if (!file) return;
  let incoming;
  try {
    incoming = normalize(JSON.parse(await file.text()));
  } catch (err) {
    toast('Fichier illisible');
    return;
  }
  const nActive = incoming.tasks.filter(t => t.doneAt === null).length;
  openSheet(`
    <h3>Importer ${incoming.tasks.length} tâches (${nActive} actives) ?
        Ta liste actuelle sera remplacée.</h3>
    <button class="sheet-btn danger" id="imp-yes">Remplacer</button>
    <button class="sheet-btn cancel" data-close>Annuler</button>`, el => {
    el.querySelector('#imp-yes').onclick = () => {
      snapshot();
      // L'apparence est une préférence de cet appareil, pas une donnée à
      // importer : on garde celle en cours.
      incoming.theme = state.theme;
      state = incoming;
      closeSheet();
      commit();
      toast('Liste importée');
    };
  });
});

/* ---- Rappel discret quand la sauvegarde date ---- */
function renderNag() {
  const nag = $('backup-nag');
  const snoozed = state.nagDismissedAt && Date.now() - state.nagDismissedAt < NAG_SNOOZE;
  const worthProtecting = state.tasks.length >= 10;
  const stale = !state.lastBackupAt || Date.now() - state.lastBackupAt > BACKUP_INTERVAL;
  const show = worthProtecting && stale && !snoozed;
  nag.hidden = !show;
  if (show) {
    $('backup-nag-text').textContent = state.lastBackupAt
      ? 'Ta dernière sauvegarde remonte à plus d\'un mois.'
      : 'Tes tâches ne sont que sur cet appareil.';
  }
}

$('backup-nag-go').onclick = openBackupSheet;
$('backup-nag-dismiss').onclick = () => {
  state.nagDismissedAt = Date.now();
  save();
  renderNag();
};


/* ---------------------------------------------------------------------------
 * 8. PLOMBERIE iOS + DÉMARRAGE
 * ------------------------------------------------------------------------- */

$('menu-btn').onclick = openMenu;

$composer.addEventListener('submit', e => {
  e.preventDefault();
  addTask($input.value);
  $input.value = '';
  $input.focus();          // garde le clavier ouvert pour enchaîner
});

// Le clavier iOS ne redimensionne pas la fenêtre : il fait glisser toute la
// page vers le haut. On suit visualViewport pour que le dock reste collé au
// clavier au lieu de sortir de l'écran.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}

// Échap ferme ce qui est ouvert (utile sur ordinateur).
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$sheet.hidden) { closeSheet(); return; }
  const page = [...document.querySelectorAll('.page')].find(p => !p.hidden);
  if (page) closePage(page);
});

// Hors ligne : le service worker sert l'app depuis le cache.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}

state = load();
applyTheme();
reconcile();
render();

// Le thème clair/sombre du système peut changer pendant que l'app est ouverte.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
