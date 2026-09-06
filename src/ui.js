/** Panneau de gauche : banques, inspecteur, réglages, récapitulatif, fichiers. */
import { SHELVES, FRAMES, OBJECTS, WOODS } from './catalog.js';
import { MIN_SHELF_WIDTH } from './config.js';
import * as store from './store.js';
import { validate } from './interaction.js';

const $ = (sel) => document.querySelector(sel);
const cm = (m) => Math.round(m * 100);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

let ctx = null;
let activeTab = 'shelf';

export function initUI(context) {
  ctx = context;
  bindTabs();
  bindSettings();
  bindFiles();
  bindToolbar();
  renderBank();
  store.subscribe(() => { renderInspector(); renderRecap(); syncSettings(); });
  syncSettings();
  renderRecap();
}

/* ------------------------------------------------------------- banques */

function bankFor(tab) {
  return tab === 'shelf' ? SHELVES : tab === 'frame' ? FRAMES : OBJECTS;
}

function bindTabs() {
  for (const t of document.querySelectorAll('.tab')) {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
      renderBank();
    });
  }
}

function renderBank() {
  const bank = $('#bank');
  bank.replaceChildren();
  for (const e of bankFor(activeTab)) {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.draggable = true;
    if (e.test) chip.dataset.test = '1';

    const top = el('div', 'chip-top');
    if (activeTab === 'shelf') {
      const viz = el('span', 'chip-viz');
      viz.style.width = `${Math.round((e.w / 3.0) * 74) + 12}px`;
      top.append(viz);
    } else {
      const box = el('span', 'chip-box');
      const s = 26 / Math.max(e.w, e.h);
      box.style.width = `${Math.max(6, e.w * s)}px`;
      box.style.height = `${Math.max(6, e.h * s)}px`;
      top.append(box);
    }
    top.append(el('span', 'chip-name', e.label));
    chip.append(top);

    const dims = activeTab === 'shelf'
      ? `${cm(e.w)} × ${cm(e.d)} cm`
      : `${cm(e.w)} × ${cm(e.h)} cm`;
    chip.append(el('div', 'chip-dim', dims));
    if (e.note) chip.append(el('div', 'chip-note', e.note));

    chip.addEventListener('click', () => ctx.addFromCatalog(activeTab, e.id));
    chip.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('application/x-projo', JSON.stringify({ type: activeTab, id: e.id }));
      ev.dataTransfer.effectAllowed = 'copy';
    });
    bank.append(chip);
  }
}

/* ---------------------------------------------------------- inspecteur */

function numField(label, value, step, onCommit, opts = {}) {
  const f = el('div', 'field' + (opts.wide ? ' field--wide' : ''));
  f.append(el('label', null, label));
  const input = el('input');
  input.type = 'number';
  input.value = value;
  input.step = step;
  if (opts.min !== undefined) input.min = opts.min;
  const commit = () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) onCommit(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); input.blur(); } });
  f.append(input);
  return f;
}

function renderInspector() {
  const box = $('#inspector');
  const item = store.getSelected();
  if (!item) { box.hidden = true; box.replaceChildren(); ctx.setWarnings([]); return; }
  box.hidden = false;
  box.replaceChildren();

  const head = el('div', 'insp-head');
  head.append(el('span', 'insp-title', item.label));
  head.append(el('span', 'insp-kind',
    item.type === 'shelf' ? 'Planche' : item.type === 'frame' ? 'Cadre' : 'Objet'));
  box.append(head);

  const fields = el('div', 'fields');
  const set = (patch) => store.updateItem(item.id, patch);

  if (item.type === 'shelf') {
    fields.append(numField('Longueur (cm)', cm(item.w), 1, (v) => set({ w: Math.max(0.30, v / 100) }), { min: 30 }));
    fields.append(numField('Profondeur (cm)', cm(item.d), 1, (v) => set({ d: Math.max(8, v) / 100 }), { min: 8 }));
    fields.append(numField('Épaisseur (cm)', cm(item.t), 0.5, (v) => set({ t: Math.max(1.5, v) / 100 }), { min: 1.5 }));
    fields.append(numField('Hauteur sol (cm)', cm(item.y), 1, (v) => set({ y: v / 100 })));
  } else if (item.type === 'frame') {
    fields.append(numField('Largeur (cm)', cm(item.w), 1, (v) => set({ w: Math.max(0.05, v / 100) })));
    fields.append(numField('Hauteur (cm)', cm(item.h), 1, (v) => set({ h: Math.max(0.05, v / 100) })));
    fields.append(numField('Centre / sol (cm)', cm(item.y), 1, (v) => set({ y: v / 100 })));
  } else {
    fields.append(numField('Largeur (cm)', cm(item.w), 1, (v) => set({ w: Math.max(0.02, v / 100) })));
    fields.append(numField('Hauteur (cm)', cm(item.h), 1, (v) => set({ h: Math.max(0.02, v / 100) })));
    fields.append(numField('Profondeur (cm)', cm(item.d), 1, (v) => set({ d: Math.max(0.02, v / 100) })));
    fields.append(numField('Base / sol (cm)', cm(item.y), 1, (v) => set({ y: v / 100 })));
  }
  fields.append(numField('Position X (cm)', cm(item.x), 1, (v) => set({ x: v / 100 }), { wide: item.type === 'frame' }));

  if (item.type !== 'object') {
    const f = el('div', 'field field--wide');
    f.append(el('label', null, 'Teinte du bois'));
    const sel = el('select');
    for (const w of WOODS) {
      const o = el('option', null, w.label);
      o.value = w.id;
      if (w.id === item.wood) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => set({ wood: sel.value }));
    f.append(sel);
    fields.append(f);
  }
  box.append(fields);

  const actions = el('div', 'insp-actions');
  const dup = el('button', 'btn', 'Dupliquer');
  dup.addEventListener('click', () => store.duplicateItem(item.id));
  const del = el('button', 'btn btn-danger', 'Supprimer');
  del.addEventListener('click', () => store.removeItem(item.id));
  actions.append(dup, del);
  box.append(actions);

  ctx.setWarnings(validate(item, store.getState().items));
}

/* ---------------------------------------------------------- récap */

function renderRecap() {
  const s = store.getState();
  const shelves = s.items.filter((i) => i.type === 'shelf');
  const frames = s.items.filter((i) => i.type === 'frame');
  const objects = s.items.filter((i) => i.type === 'object');
  const ml = shelves.reduce((a, i) => a + i.w, 0);
  const tooShort = shelves.filter((i) => i.w < MIN_SHELF_WIDTH - 1e-6).length;
  const faulty = s.items.filter((i) => i.type !== 'object' && validate(i, s.items).length).length;

  const box = $('#recap');
  box.replaceChildren();
  const row = (k, v) => {
    const r = el('div', 'recap-row');
    r.append(el('span', null, k));
    const b = el('b', null, v);
    r.append(b);
    return r;
  };
  box.append(row('Planches', String(shelves.length)));
  box.append(row('Mètres linéaires', `${ml.toFixed(2)} m`));
  box.append(row('Cadres', String(frames.length)));
  box.append(row('Objets', String(objects.length)));
  if (tooShort) box.append(row('Sous 70 cm', `${tooShort} ⚠`));
  if (faulty) box.append(row('À revoir', `${faulty} ⚠`));
}

/* ---------------------------------------------------------- réglages */

const SETTING_INPUTS = {
  'opt-dims': 'showDims', 'opt-studs': 'showStuds', 'opt-decor': 'showDecor',
  'opt-grid': 'snapGrid', 'opt-align': 'snapAlign', 'opt-snapstuds': 'snapStuds',
  'opt-ruler': 'showRuler', 'opt-art': 'showArt',
};

function bindSettings() {
  for (const [id, key] of Object.entries(SETTING_INPUTS)) {
    const input = document.getElementById(id);
    if (input) input.addEventListener('change', () => store.setSetting(key, input.checked));
  }
  const name = $('#proj-name');
  name.addEventListener('change', () => store.setName(name.value.trim() || 'Projection'));
  $('#btn-dims').addEventListener('click', () => store.setSetting('showDims', !store.getState().settings.showDims));
}

let syncing = false;
function syncSettings() {
  if (syncing) return;
  syncing = true;
  const s = store.getState();
  for (const [id, key] of Object.entries(SETTING_INPUTS)) {
    const input = document.getElementById(id);
    if (input) input.checked = !!s.settings[key];
  }
  const btn = $('#btn-dims');
  btn.classList.toggle('is-active', !!s.settings.showDims);
  btn.setAttribute('aria-pressed', String(!!s.settings.showDims));
  btn.textContent = s.settings.showDims ? 'Masquer les mesures' : 'Afficher les mesures';
  const name = $('#proj-name');
  if (document.activeElement !== name) name.value = s.name;
  $('#btn-undo').disabled = !store.canUndo();
  $('#btn-redo').disabled = !store.canRedo();
  syncing = false;
}

/* ---------------------------------------------------------- fichiers */

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projection';
}

export function saveToFile() {
  const data = store.toJSON();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(data.name)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ctx.toast('Projection enregistrée dans vos téléchargements.');
}

function loadFile(file) {
  if (!file) return;
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    return ctx.toast('Il faut un fichier .json enregistré depuis cet outil.', 'error');
  }
  const reader = new FileReader();
  reader.onerror = () => ctx.toast('Lecture du fichier impossible.', 'error');
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(String(reader.result)); }
    catch { return ctx.toast('Fichier JSON illisible.', 'error'); }
    const r = store.fromJSON(parsed);
    ctx.toast(r.ok ? `« ${store.getState().name} » chargée — ${r.count} pièce(s).` : r.error, r.ok ? 'info' : 'error');
  };
  reader.readAsText(file);
}

function bindFiles() {
  const dz = $('#dropzone');
  const input = $('#file-input');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });
  $('#btn-open').addEventListener('click', () => input.click());
  $('#btn-save').addEventListener('click', saveToFile);
  $('#btn-clear').addEventListener('click', () => {
    if (!store.getState().items.length) return;
    if (confirm('Vider la projection ? Un Cmd+Z permet de revenir en arrière.')) store.clearAll();
  });

  for (const target of [dz, document.getElementById('stage'), document.body]) {
    target.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dz.classList.add('is-over');
    });
    target.addEventListener('dragleave', () => dz.classList.remove('is-over'));
    target.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      dz.classList.remove('is-over');
      loadFile(e.dataTransfer.files[0]);
    });
  }
}

function bindToolbar() {
  $('#btn-undo').addEventListener('click', () => store.undo());
  $('#btn-redo').addEventListener('click', () => store.redo());
}
