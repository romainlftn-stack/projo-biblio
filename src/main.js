/** Point d'entrée : scène, rendu, synchronisation des items, raccourcis. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { WALL, VIEWS, ceilingAt } from './config.js';
import { buildRoom, buildStudGuides, updateEnvelopeFade } from './room.js';
import { buildItem } from './items.js';
import { LabelLayer, SelectionOutline, buildHeightRuler } from './labels.js';
import { Interaction, supportingShelf, validate } from './interaction.js';
import * as store from './store.js';
import { initUI } from './ui.js';
import { initTour } from './tour.js';

const canvas = document.getElementById('scene');
const stage = document.getElementById('stage');

/* ------------------------------------------------------------- rendu */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8a49c);  // lu comme la lumière du dehors, pas comme un trou

const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 120);
camera.position.set(...VIEWS.face.pos);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.7;
controls.minDistance = 0.4;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.86;
controls.target.set(...VIEWS.face.target);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

/* ------------------------------------------------------------ lumières */

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

scene.add(new THREE.HemisphereLight(0xe8ddc9, 0x3a332c, 0.55));

const sun = new THREE.DirectionalLight(0xffeed6, 1.45);
sun.position.set(11.5, 7.4, 8.5);
sun.castShadow = true;
// La cible par défaut est l'origine, c'est-à-dire le coin bas gauche du mur :
// le frustum d'ombre était décentré et gaspillait sa résolution. On le vise au
// milieu du mur et on le resserre sur la pièce.
sun.target.position.set(4.07, 1.8, 1.2);
scene.add(sun.target);
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -7.5;
sun.shadow.camera.right = 7.5;
sun.shadow.camera.top = 6.5;
sun.shadow.camera.bottom = -4.5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 34;
// normalBias décolle l'ombre de son objet : à 2 cm cela produisait un trait
// d'ombre détaché à côté des pièces plaquées au mur.
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.006;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfd8e6, 0.28);
fill.position.set(-5, 4, 6);
scene.add(fill);

for (const [x, z, h] of [[1.9, 2.6, 3.0], [3.5, 2.2, 3.4], [5.9, 2.4, 2.5]]) {
  const p = new THREE.PointLight(0xffc98d, 4.5, 6.5, 2);
  p.position.set(x, h - 0.2, z);
  scene.add(p);
}

/* -------------------------------------------------------------- salon */

const room = buildRoom(scene);
const studs = buildStudGuides();
scene.add(studs);
const ruler = buildHeightRuler(WALL.apexH);
scene.add(ruler);

const labels = new LabelLayer(scene);
const outline = new SelectionOutline(scene);

/* -------------------------------------------------------------- items */

const itemsGroup = new THREE.Group();
itemsGroup.name = 'projection';
scene.add(itemsGroup);

const meshes = new Map();

/** Retire un groupe de la scène et libère ses ressources GPU. */
function disposeGroup(group) {
  itemsGroup.remove(group);
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    // Les matériaux bois sont mutualisés entre pièces : seuls les matériaux
    // propres à cette pièce (proxy, toile, clone de signalement) sont libérés.
    for (const m of [o.material, o.userData.baseMaterial]) {
      if (m && !m.userData?.shared) m.dispose();
    }
  });
}

/** Signature géométrique : un changement force la reconstruction du maillage. */
function sig(item) {
  return [item.type, item.catalogId, item.w, item.h, item.d, item.t, item.wood, item.color].join('|');
}

/** Profondeur (z) du centre d'un item. */
function zFor(item, items) {
  if (item.type !== 'object') return 0;
  const shelf = supportingShelf(item, items);
  return shelf ? shelf.d / 2 : 0.16;
}

function syncItems() {
  const { items, selection } = store.getState();
  const seen = new Set();

  for (const item of items) {
    seen.add(item.id);
    let rec = meshes.get(item.id);
    const s = sig(item);
    if (!rec || rec.sig !== s) {
      if (rec) disposeGroup(rec.group);
      const group = buildItem(item);
      itemsGroup.add(group);
      rec = { group, sig: s };
      meshes.set(item.id, rec);
    }
    // Repères locaux : étagère → y = dessous, cadre → y = centre, objet → y = base.
    rec.group.position.set(item.x, item.y, item.type === 'frame' ? 0 : zFor(item, items));

    // Signalement visuel des poses invalides.
    // On ne teinte que les matériaux qui gèrent l'émissif : la boîte de
    // préhension est un MeshBasicMaterial, lui ajouter un `emissive` casse
    // les uniformes du shader au rendu.
    const bad = item.type !== 'object' && validate(item, items).length > 0;
    if (rec.bad !== bad) {
      rec.bad = bad;
      rec.group.traverse((o) => {
        if (!o.isMesh || o.userData.isProxy) return;
        if (!o.userData.baseMaterial) o.userData.baseMaterial = o.material;
        const src = o.userData.baseMaterial;
        if (src.emissive === undefined) return;
        if (bad) {
          const m = src.clone();
          m.emissive = new THREE.Color(0x8a2413);
          m.emissiveIntensity = 0.75;
          o.material = m;
        } else {
          if (o.material !== src) o.material.dispose();
          o.material = src;
        }
      });
    }
  }

  for (const [id, rec] of meshes) {
    if (seen.has(id)) continue;
    disposeGroup(rec.group);
    meshes.delete(id);
  }

  labels.sync(items, store.getState().settings.showDims, selection);
  labels.setSelection(selection);
  const sel = store.getSelected();
  outline.update(sel);
  interaction.syncHandles(sel);
}

/* --------------------------------------------------------- interaction */

const interaction = new Interaction({
  dom: canvas, camera, controls, scene,
  getMeshFor: (id) => meshes.get(id)?.group,
  onChange: syncItems,
});

/* ------------------------------------------------------------- réglages */

function applySettings() {
  const s = store.getState().settings;
  studs.visible = !!s.showStuds;
  ruler.visible = !!s.showRuler;
  if (room.userData.furniture) room.userData.furniture.visible = s.showDecor !== false;
  if (room.userData.art) room.userData.art.visible = s.showArt !== false;
  sun.castShadow = s.showShadows !== false;
}

store.subscribe(() => { syncItems(); applySettings(); });

/* ------------------------------------------------------------- ajouts */

/** Point du mur visé par le centre de l'écran, pour poser un nouvel élément. */
function viewCenterOnWall() {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) {
    return { x: WALL.width / 2, y: 1.6 };
  }
  return { x: p.x, y: p.y };
}

function clampToWall(type, catalogId, x, y) {
  const half = 0.4;
  return {
    x: Math.min(Math.max(x, half), WALL.width - half),
    y: Math.min(Math.max(y, 0.15), ceilingAt(x) - 0.2),
  };
}

function addFromCatalog(type, catalogId, at) {
  const p = at || viewCenterOnWall();
  const c = clampToWall(type, catalogId, p.x, p.y);
  const item = store.makeItem(type, catalogId, c.x, c.y);
  store.addItem(item);
  return item;
}

// Glisser une vignette du panneau directement sur le mur
canvas.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('application/x-projo')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
canvas.addEventListener('drop', (e) => {
  const raw = e.dataTransfer.getData('application/x-projo');
  if (!raw) return;
  e.preventDefault();
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  const r = canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const p = new THREE.Vector3();
  const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p);
  addFromCatalog(payload.type, payload.id, hit ? { x: p.x, y: p.y } : null);
});

/* --------------------------------------------------------------- vues */

let flight = null;
let currentView = 'face';

/**
 * Distance à laquelle une zone de demi-largeur `halfW` et de demi-hauteur
 * `halfH` tient dans le cadre. En portrait, le champ horizontal se referme :
 * sans ce recul on ne verrait qu'une tranche du mur.
 */
function fitDistance(halfW, halfH) {
  const vHalf = (camera.fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  return Math.max(halfH / Math.tan(vHalf), halfW / Math.tan(hHalf));
}

function viewTargets(name) {
  const v = VIEWS[name];
  const target = new THREE.Vector3(...v.target);
  const pos = new THREE.Vector3(...v.pos);
  const dir = pos.clone().sub(target).normalize();
  const base = pos.distanceTo(target);
  // En portrait, tout faire tenir demanderait un recul énorme et l'image
  // deviendrait minuscule : on borne, quitte à laisser l'utilisateur
  // balayer le mur. La vue « Large », plus reculée d'origine, garde sa marge.
  const dist = Math.min(
    Math.max(base, fitDistance(WALL.width / 2 + 0.2, 2.7)),
    Math.max(base * 1.9, 17)
  );
  return { pos: target.clone().addScaledVector(dir, dist), target };
}

function goToView(name, instant = false) {
  if (!VIEWS[name]) return;
  currentView = name;
  const { pos, target } = viewTargets(name);
  if (instant) {
    camera.position.copy(pos);
    controls.target.copy(target);
    flight = null;
  } else {
    flight = { t: 0, fromPos: camera.position.clone(), toPos: pos,
      fromTar: controls.target.clone(), toTar: target };
  }
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('is-active', b.dataset.view === name);
}
for (const b of document.querySelectorAll('[data-view]')) {
  b.addEventListener('click', () => { userMovedCamera = false; goToView(b.dataset.view); });
}
document.querySelector('[data-view="face"]').classList.add('is-active');

/* -------------------------------------------------------------- messages */

let toastTimer = null;
function toast(msg, kind = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.dataset.kind = kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

function setWarnings(list) {
  const box = document.getElementById('warnings');
  if (!list || !list.length) { box.hidden = true; return; }
  box.replaceChildren();
  const h = document.createElement('strong');
  h.textContent = 'À revoir';
  const ul = document.createElement('ul');
  for (const w of list) {
    const li = document.createElement('li');
    li.textContent = w;
    ul.append(li);
  }
  box.append(h, ul);
  box.hidden = false;
}

/*
 * ⌘ (ou Ctrl) maintenu : le glisser translate au lieu de pivoter. Au trackpad
 * c'est bien plus praticable que le clic droit.
 */
function setPanModifier(on) {
  controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  stage.classList.toggle('is-panning', on);
}
window.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setPanModifier(true); });
window.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setPanModifier(false); });
window.addEventListener('blur', () => setPanModifier(false));

/* ------------------------------------------------------------ raccourcis */

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (typing) return;
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  } else if (meta && e.key.toLowerCase() === 's') {
    e.preventDefault();
    import('./ui.js').then((m) => m.saveToFile());
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    const sel = store.getState().selection;
    if (sel) { e.preventDefault(); store.removeItem(sel); }
  } else if (e.key.toLowerCase() === 'd') {
    const sel = store.getState().selection;
    if (sel) store.duplicateItem(sel);
  } else if (e.key === 'Escape') {
    if (document.body.classList.contains('is-nav')) toggleNav();
    else store.select(null);
  }
});

/* ------------------------------------------------ plein écran navigation */

const exitBtn = document.getElementById('btn-exit-full');

/** Mode navigation : plus que le visualiseur et les boutons de vue. */
function setNavMode(on) {
  document.body.classList.toggle('is-nav', on);
  exitBtn.hidden = !on;
  interaction.setNavOnly(on);
  if (on) store.select(null);
  resize();
}

/**
 * Le mode navigation ne dépend pas du plein écran : certains contextes
 * (iframe sans autorisation) refusent `requestFullscreen` sans lever d'erreur.
 * On bascule donc toujours l'interface, et le plein écran est un bonus.
 */
async function toggleNav() {
  const on = !document.body.classList.contains('is-nav');
  setNavMode(on);
  try {
    if (on && !document.fullscreenElement) await stage.requestFullscreen();
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch { /* plein écran indisponible : la navigation reste utilisable */ }
}

document.getElementById('btn-full').addEventListener('click', toggleNav);
exitBtn.addEventListener('click', toggleNav);
document.addEventListener('fullscreenchange', () => {
  // Sortie du plein écran par Échap : on quitte aussi le mode navigation.
  if (!document.fullscreenElement && document.body.classList.contains('is-nav')) setNavMode(false);
});

document.getElementById('btn-shot').addEventListener('click', () => {
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) return toast('Export impossible.', 'error');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'projo-biblio.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Image exportée.');
  }, 'image/png');
});

/* ------------------------------------------------------------ dimension */

let userMovedCamera = false;
controls.addEventListener('start', () => { userMovedCamera = true; });

function resize() {
  const w = Math.max(stage.clientWidth, 1);
  const h = Math.max(stage.clientHeight, 1);
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Rotation d'écran ou fenêtre redimensionnée : on recadre, sauf si
  // l'utilisateur a lui-même déplacé la caméra depuis la dernière vue.
  if (!userMovedCamera && !flight) goToView(currentView, true);
}
new ResizeObserver(resize).observe(stage);
resize();
goToView('face', true);

/* ------------------------------------------------------------- boucle */

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (flight) {
    flight.t = Math.min(1, flight.t + dt * 1.9);
    const k = flight.t < 0.5 ? 2 * flight.t * flight.t : 1 - Math.pow(-2 * flight.t + 2, 2) / 2;
    camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
    controls.target.lerpVectors(flight.fromTar, flight.toTar, k);
    if (flight.t >= 1) flight = null;
  }

  controls.update();
  updateEnvelopeFade(room, camera);
  interaction.scaleHandles();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

/* ------------------------------------------------------------ démarrage */

// Poignée de débogage : utile pour inspecter la scène depuis la console.
window.__projo = { scene, camera, controls, renderer, store, meshes, syncItems, interaction };

initUI({ addFromCatalog, toast, setWarnings, goToView });
initTour();

if (store.restoreAutosave()) toast('Session précédente restaurée.');
syncItems();
applySettings();
tick();
