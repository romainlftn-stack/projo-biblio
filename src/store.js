/**
 * État de la projection : items posés + réglages, avec historique,
 * sauvegarde automatique locale et export / import de fichier .json.
 */
import { SHELVES, FRAMES, OBJECTS, DEFAULT_WOOD } from './catalog.js';

export const FILE_VERSION = 1;
const LS_KEY = 'projo-biblio:auto';
const LS_TOUR = 'projo-biblio:tour-vu';

const listeners = new Set();
let uid = 0;

const defaultSettings = () => ({
  showDims: false,
  showStuds: false,
  showDecor: true,
  showArt: true,
  showRuler: false,
  snapGrid: true,
  gridStep: 0.05,
  snapStuds: true,
  snapAlign: true,
});

let state = {
  name: 'Nouvelle projection',
  items: [],
  settings: defaultSettings(),
  selection: null,
};

let past = [];
let future = [];

/* ------------------------------------------------------------- abonnement */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  for (const fn of listeners) fn(state, reason);
  scheduleAutosave();
}

export const getState = () => state;
export const getItem = (id) => state.items.find((i) => i.id === id) || null;
export const getSelected = () => getItem(state.selection);

/* ------------------------------------------------------------- historique */

function snapshot() {
  return JSON.stringify({ name: state.name, items: state.items, settings: state.settings });
}

function pushHistory() {
  past.push(snapshot());
  if (past.length > 60) past.shift();
  future = [];
}

function restore(json) {
  const d = JSON.parse(json);
  state.name = d.name;
  state.items = d.items;
  state.settings = d.settings;
  if (!state.items.some((i) => i.id === state.selection)) state.selection = null;
}

export function undo() {
  if (!past.length) return false;
  future.push(snapshot());
  restore(past.pop());
  emit('history');
  return true;
}

export function redo() {
  if (!future.length) return false;
  past.push(snapshot());
  restore(future.pop());
  emit('history');
  return true;
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

/* ------------------------------------------------------------------ items */

function entryFor(type, catalogId) {
  const bank = type === 'shelf' ? SHELVES : type === 'frame' ? FRAMES : OBJECTS;
  return bank.find((e) => e.id === catalogId) || bank[0];
}

/** Crée un item à partir d'une entrée de catalogue, aux dimensions du catalogue. */
export function makeItem(type, catalogId, x, y, extra = {}) {
  const e = entryFor(type, catalogId);
  const base = {
    id: `i${Date.now().toString(36)}${(uid++).toString(36)}`,
    type,
    catalogId: e.id,
    label: e.label,
    x, y,
    wood: DEFAULT_WOOD,
    ...extra,
  };
  if (type === 'shelf') Object.assign(base, { w: e.w, d: e.d, t: e.t });
  else if (type === 'frame') Object.assign(base, { w: e.w, h: e.h, d: 0.05 });
  else Object.assign(base, { w: e.w, h: e.h, d: e.d, color: e.color });
  return base;
}

export function addItem(item, { select = true } = {}) {
  pushHistory();
  state.items = [...state.items, item];
  if (select) state.selection = item.id;
  emit('add');
  return item;
}

/** Met à jour un item. `transient` = pendant un glisser, sans entrée d'historique. */
export function updateItem(id, patch, { transient = false } = {}) {
  const item = getItem(id);
  if (!item) return;
  if (!transient) pushHistory();
  Object.assign(item, patch);
  state.items = [...state.items];
  emit(transient ? 'drag' : 'update');
}

/** À appeler à la fin d'un glisser pour figer une entrée d'historique. */
export function commitTransient(before) {
  past.push(before);
  if (past.length > 60) past.shift();
  future = [];
  emit('update');
}

export const beginTransient = () => snapshot();

export function removeItem(id) {
  pushHistory();
  state.items = state.items.filter((i) => i.id !== id);
  if (state.selection === id) state.selection = null;
  emit('remove');
}

export function duplicateItem(id) {
  const src = getItem(id);
  if (!src) return null;
  const copy = { ...src, id: `i${Date.now().toString(36)}${(uid++).toString(36)}`, x: src.x + 0.12, y: src.y - 0.12 };
  return addItem(copy);
}

export function select(id) {
  if (state.selection === id) return;
  state.selection = id;
  emit('select');
}

export function clearAll() {
  pushHistory();
  state.items = [];
  state.selection = null;
  emit('clear');
}

/* --------------------------------------------------------------- réglages */

export function setSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  emit('settings');
}

/* ------------------------------------------------------- fichier / stockage */

export function toJSON() {
  return {
    format: 'projo-biblio',
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    name: state.name,
    settings: state.settings,
    items: state.items,
  };
}

/** Valide et charge un fichier de configuration. Renvoie { ok, error }. */
export function fromJSON(data, { history = true } = {}) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Fichier illisible.' };
  if (data.format !== 'projo-biblio') return { ok: false, error: "Ce fichier n'est pas une projection bibliothèque." };
  if (!Array.isArray(data.items)) return { ok: false, error: 'Aucune planche trouvée dans le fichier.' };
  const clean = [];
  for (const raw of data.items) {
    if (!raw || !['shelf', 'frame', 'object'].includes(raw.type)) continue;
    const n = (v, def) => (Number.isFinite(+v) ? +v : def);
    clean.push({
      ...raw,
      id: raw.id || `i${Date.now().toString(36)}${(uid++).toString(36)}`,
      x: n(raw.x, 1), y: n(raw.y, 1),
      w: n(raw.w, 1), d: n(raw.d, 0.25),
      h: raw.h === undefined ? undefined : n(raw.h, 0.3),
      t: raw.t === undefined ? undefined : n(raw.t, 0.04),
      wood: raw.wood || DEFAULT_WOOD,
    });
  }
  if (history) pushHistory();
  state.name = typeof data.name === 'string' ? data.name : 'Projection importée';
  state.items = clean;
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  state.selection = null;
  emit('load');
  return { ok: true, count: clean.length };
}

export function setName(name) {
  state.name = name;
  emit('rename');
}

let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(toJSON())); } catch { /* quota ou mode privé */ }
  }, 400);
}

/** Recharge la dernière session. Renvoie true si quelque chose a été restauré. */
export function restoreAutosave() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const r = fromJSON(JSON.parse(raw), { history: false });
    past = []; future = [];
    return r.ok && r.count > 0;
  } catch { return false; }
}

export const tourSeen = () => { try { return localStorage.getItem(LS_TOUR) === '1'; } catch { return false; } };
export const markTourSeen = () => { try { localStorage.setItem(LS_TOUR, '1'); } catch { /* ignore */ } };
