/**
 * Sélection, déplacement dans le plan du mur, poignées de redimensionnement,
 * aimantations (grille, montants placo, alignement) et contrôle des collisions.
 */
import * as THREE from 'three';
import { FIXTURES, WALL, MIN_SHELF_WIDTH, ceilingAt, studPositions, snapPositions } from './config.js';
import { itemBounds } from './items.js';
import * as store from './store.js';

const WALL_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * Glyphe de poignée : un chevron « > » orienté, ou un double chevron pour la
 * profondeur qui se tire et se pousse. Dessiné en sprite, donc toujours face
 * à la caméra et lisible sous tous les angles.
 */
const chevronCache = new Map();
function chevronTexture(glyph, rot, color) {
  const key = glyph + rot.toFixed(2) + color;
  if (chevronCache.has(key)) return chevronCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  x.rotate(rot);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const paths = glyph === 'double'
    ? [[[0, -40], [0, 40]], [[-17, -23], [0, -40], [17, -23]], [[-17, 23], [0, 40], [17, 23]]]
    : [[[-16, -30], [18, 0], [-16, 30]]];
  for (const pass of [{ w: 24, c: 'rgba(18,14,11,.5)' }, { w: 13, c: '#' + color.toString(16).padStart(6, '0') }]) {
    x.lineWidth = pass.w;
    x.strokeStyle = pass.c;
    for (const pts of paths) {
      x.beginPath();
      pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  chevronCache.set(key, t);
  return t;
}
const ALIGN_TOL = 0.035;
const STUD_TOL = 0.05;

/** Emprise (x0,x1,y0,y1) d'un item dans le plan du mur. */
export function footprint(item) {
  const b = itemBounds(item);
  return { x0: item.x - b.w / 2, x1: item.x + b.w / 2, y0: item.y + b.y0, y1: item.y + b.y0 + b.h };
}

const overlaps = (a, b, m = 0) =>
  a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.y0 < b.y1 - m && a.y1 > b.y0 + m;

/**
 * Contrôle de pose. Renvoie la liste des problèmes rencontrés.
 * Les objets posés sur une étagère ne sont pas contrôlés (ils suivent la planche).
 */
export function validate(item, items) {
  const issues = [];
  if (item.type === 'object') return issues;
  const fp = footprint(item);

  if (fp.x0 < -0.01 || fp.x1 > WALL.width + 0.01) issues.push('Déborde du mur.');
  const topLeft = ceilingAt(Math.max(fp.x0, 0));
  const topRight = ceilingAt(Math.min(fp.x1, WALL.width));
  if (fp.y1 > Math.min(topLeft, topRight)) issues.push('Passe sous le rampant du plafond.');
  if (fp.y0 < 0) issues.push('Passe sous le sol.');

  for (const f of FIXTURES) {
    if (!f.blocks) continue;
    const y1 = f.y1 ?? ceilingAt((f.x0 + f.x1) / 2);
    if (overlaps(fp, { x0: f.x0, x1: f.x1, y0: f.y0, y1 }, 0.005)) issues.push(`Bute sur : ${f.label}.`);
  }

  if (item.type === 'shelf') {
    if (item.w < MIN_SHELF_WIDTH - 1e-6) {
      issues.push(`Moins de ${Math.round(MIN_SHELF_WIDTH * 100)} cm : fixation invisible impossible.`);
    }
    const studs = studPositions().filter((s) => s > fp.x0 + 0.03 && s < fp.x1 - 0.03);
    if (studs.length < 2) issues.push('Ne couvre pas 2 montants placo : fixation à revoir.');
  }

  for (const other of items) {
    if (other.id === item.id || other.type === 'object') continue;
    if (overlaps(fp, footprint(other), 0.004)) { issues.push('Chevauche une autre pièce.'); break; }
  }
  return issues;
}

/** Étagère qui peut porter un objet à la position donnée. */
export function supportingShelf(item, items) {
  const fp = footprint(item);
  let best = null;
  for (const s of items) {
    if (s.type !== 'shelf' || s.id === item.id) continue;
    const sf = footprint(s);
    if (fp.x1 < sf.x0 + 0.02 || fp.x0 > sf.x1 - 0.02) continue;
    const top = s.y + s.t;
    const gap = item.y - top;
    if (gap > -0.06 && gap < 0.40 && (!best || top > best.y + best.t)) best = s;
  }
  return best;
}

export class Interaction {
  constructor({ dom, camera, controls, scene, getMeshFor, onChange }) {
    this.dom = dom;
    this.camera = camera;
    this.controls = controls;
    this.scene = scene;
    this.getMeshFor = getMeshFor;
    this.onChange = onChange;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.drag = null;
    this.navOnly = false;
    // Au doigt, il faut une cible plus généreuse qu'à la souris.
    this.handlePx = window.matchMedia('(pointer: coarse)').matches ? 46 : 30;
    this.guides = new THREE.Group();
    this.guides.name = 'reperes';
    scene.add(this.guides);
    this.handles = this.buildHandles();
    scene.add(this.handles);

    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
  }

  buildHandles() {
    const g = new THREE.Group();
    g.name = 'poignees';
    this.handleMeshes = {};
    const specs = [
      ['left',  'chevron', Math.PI, 0xffc857],
      ['right', 'chevron', 0, 0xffc857],
      ['top',   'chevron', -Math.PI / 2, 0xffc857],
      ['depth', 'double', 0, 0x4fd6c2],
    ];
    for (const [key, glyph, rot, color] of specs) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: chevronTexture(glyph, rot, color),
        depthTest: false,
        transparent: true,
      }));
      sp.renderOrder = 999;
      sp.userData.handle = key;
      g.add(sp);
      this.handleMeshes[key] = sp;
    }
    g.visible = false;
    return g;
  }

  /**
   * Repositionne les poignées. Elles sont posées *à l'écart* de la pièce :
   * collées à ses bords, elles se chevauchaient entre elles et avec la planche
   * dès qu'on posait une petite étagère.
   */
  syncHandles(item) {
    if (!item) { this.handles.visible = false; return; }
    const b = itemBounds(item);
    const cy = item.y + b.y0 + b.h / 2;
    const z = b.d / 2;
    const gap = 0.07;
    this.handleMeshes.left.position.set(item.x - b.w / 2 - gap, cy, z);
    this.handleMeshes.right.position.set(item.x + b.w / 2 + gap, cy, z);
    this.handleMeshes.depth.position.set(item.x, cy, b.d + gap);
    this.handleMeshes.depth.visible = item.type !== 'frame';
    this.handleMeshes.top.position.set(item.x, item.y + b.y0 + b.h + gap, z);
    this.handleMeshes.top.visible = item.type !== 'shelf';
    this.handles.visible = true;
    this.scaleHandles();
  }

  /**
   * Taille des poignées fixée en pixels écran : ni minuscules de loin, ni
   * envahissantes de près, et toujours cliquables.
   */
  scaleHandles() {
    if (!this.handles.visible) return;
    const h = this.dom.clientHeight || 800;
    const k = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
    for (const m of this.handles.children) {
      const s = this.handlePx * k * this.camera.position.distanceTo(m.position);
      m.scale.set(s, s, 1);
    }
    // La double flèche suit l'axe de profondeur tel qu'il se projette à l'écran.
    const depth = this.handleMeshes.depth;
    if (depth?.visible) {
      const ax = this.depthAxis(depth.position);
      depth.material.rotation = Math.atan2(-ax.x, -ax.y);
    }
  }

  /** Bascule en navigation seule : plus aucune sélection ni édition. */
  setNavOnly(on) {
    this.navOnly = on;
    if (on) {
      this.drag = null;
      this.handles.visible = false;
      this.guides.clear();
    }
  }

  setPointer(e) {
    const r = this.dom.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    // Les positions viennent d'être modifiées hors boucle de rendu : sans cette
    // mise à jour, le rayon travaille sur des matrices d'une frame de retard
    // (et rate les poignées quand le rendu est ralenti ou en pause).
    this.scene.updateMatrixWorld(true);
  }

  /**
   * Projette l'axe de profondeur (+z) à l'écran depuis un point donné :
   * renvoie sa direction en pixels et le nombre de pixels par mètre, pour que
   * le glisser suive le geste quel que soit l'angle de la caméra.
   */
  depthAxis(origin) {
    const r = this.dom.getBoundingClientRect();
    const toPx = (v) => {
      const p = v.clone().project(this.camera);
      return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height };
    };
    const a = toPx(origin);
    const b = toPx(origin.clone().add(new THREE.Vector3(0, 0, 0.1)));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const pxPerM = len / 0.1;
    // Vu presque de face, l'axe pointe vers la caméra et ne se projette
    // quasiment pas : le glisser deviendrait hypersensible. On retombe alors
    // sur un glisser vertical, et on borne la sensibilité dans tous les cas.
    if (pxPerM < 80) return { x: 0, y: 1, pxPerM: 320 };
    return { x: dx / len, y: dy / len, pxPerM: Math.min(Math.max(pxPerM, 160), 3000) };
  }

  /** Point d'intersection avec le plan du mur. */
  wallPoint() {
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(WALL_PLANE, p) ? p : null;
  }

  onDown(e) {
    // ⌘ / Ctrl maintenu : le glisser appartient à la navigation, pas à l'édition.
    if (e.button !== 0 || this.navOnly || e.metaKey || e.ctrlKey) return;
    this.setPointer(e);

    if (this.handles.visible) {
      const hit = this.ray.intersectObjects(this.handles.children.filter((c) => c.visible), false)[0];
      if (hit) {
        const item = store.getSelected();
        const edge = hit.object.userData.handle;
        const b = itemBounds(item);
        const wp = this.wallPoint();
        // La poignée est décalée du bord : on mémorise l'écart pour que la
        // pièce ne saute pas au moment de la prise.
        const edgeX = edge === 'left' ? item.x - b.w / 2 : item.x + b.w / 2;
        const edgeY = item.y + b.y0 + b.h;
        this.drag = { mode: 'resize', edge, id: item.id,
          start: { ...item }, before: store.beginTransient(), moved: false,
          client: { x: e.clientX, y: e.clientY },
          grab: wp ? { x: edgeX - wp.x, y: edgeY - wp.y } : { x: 0, y: 0 } };
        if (edge === 'depth') this.drag.axis = this.depthAxis(hit.object.position);
        this.controls.enabled = false;
        return;
      }
    }

    const meshes = [];
    this.scene.traverse((o) => { if (o.userData.pickable) meshes.push(o); });
    const hit = this.ray.intersectObjects(meshes, false)[0];
    if (!hit) { this.pendingDeselect = { x: e.clientX, y: e.clientY }; return; }

    let node = hit.object;
    while (node && node.userData.itemId === undefined) node = node.parent;
    if (!node) { this.pendingDeselect = { x: e.clientX, y: e.clientY }; return; }

    const id = node.userData.itemId;
    store.select(id);
    const item = store.getItem(id);
    const wp = this.wallPoint();
    this.drag = { mode: 'move', id, before: store.beginTransient(), moved: false,
      offset: wp ? { x: item.x - wp.x, y: item.y - wp.y } : { x: 0, y: 0 } };
    this.controls.enabled = false;
  }

  onMove(e) {
    if (!this.drag) return;
    this.setPointer(e);
    const p = this.wallPoint();
    if (!p) return;
    this.drag.moved = true;
    const item = store.getItem(this.drag.id);
    if (!item) return;

    if (this.drag.mode === 'move') this.applyMove(item, p, e);
    else this.applyResize(item, p, e);
    this.onChange();
  }

  applyMove(item, p, e) {
    const s = store.getState().settings;
    const free = e.altKey;
    let x = p.x + this.drag.offset.x;
    let y = p.y + this.drag.offset.y;

    if (!free && s.snapGrid) {
      x = Math.round(x / s.gridStep) * s.gridStep;
      y = Math.round(y / s.gridStep) * s.gridStep;
    }

    const guides = [];
    if (!free && s.snapAlign) {
      for (const o of store.getState().items) {
        if (o.id === item.id) continue;
        if (Math.abs(o.y - y) < ALIGN_TOL) { y = o.y; guides.push(['h', y]); break; }
      }
      const b = itemBounds(item);
      for (const o of store.getState().items) {
        if (o.id === item.id) continue;
        const ob = itemBounds(o);
        for (const [mine, theirs] of [[x - b.w / 2, o.x - ob.w / 2], [x + b.w / 2, o.x + ob.w / 2],
                                      [x - b.w / 2, o.x + ob.w / 2], [x + b.w / 2, o.x - ob.w / 2]]) {
          if (Math.abs(mine - theirs) < ALIGN_TOL) { x += theirs - mine; guides.push(['v', theirs]); break; }
        }
      }
    }

    if (!free && s.snapStuds && item.type === 'shelf') {
      for (const st of snapPositions()) {
        if (Math.abs(x - st) < STUD_TOL) { x = st; guides.push(['v', st]); break; }
      }
    }

    const patch = { x, y };
    if (item.type === 'object') {
      const probe = { ...item, x, y };
      const shelf = supportingShelf(probe, store.getState().items);
      if (shelf && !free) { patch.y = shelf.y + shelf.t; patch.onShelf = shelf.id; }
      else patch.onShelf = null;
    }
    store.updateItem(item.id, patch, { transient: true });
    this.drawGuides(guides);
  }

  applyResize(item, p, e) {
    const s = store.getState().settings;
    const step = e.altKey ? 0.005 : s.gridStep;
    const round = (v) => Math.round(v / step) * step;
    const st = this.drag.start;
    const patch = {};

    if (this.drag.edge === 'left' || this.drag.edge === 'right') {
      const fixed = this.drag.edge === 'left' ? st.x + st.w / 2 : st.x - st.w / 2;
      let w = Math.abs(round(p.x + this.drag.grab.x) - fixed);
      const min = item.type === 'shelf' ? 0.30 : 0.05;
      w = Math.max(min, Math.min(w, WALL.width));
      patch.w = w;
      patch.x = this.drag.edge === 'left' ? fixed - w / 2 : fixed + w / 2;
      if (item.type === 'frame' && e.shiftKey) patch.h = st.h * (w / st.w);
      if (item.type === 'object' && e.shiftKey) {
        patch.h = st.h * (w / st.w);
        patch.d = st.d * (w / st.w);
      }
    } else if (this.drag.edge === 'top') {
      const bottom = item.type === 'frame' ? st.y - st.h / 2 : st.y;
      let h = Math.max(0.05, round(p.y + this.drag.grab.y) - bottom);
      patch.h = h;
      if (item.type === 'frame') patch.y = bottom + h / 2;
    } else if (this.drag.edge === 'depth') {
      const ax = this.drag.axis;
      const along = ((e.clientX - this.drag.client.x) * ax.x + (e.clientY - this.drag.client.y) * ax.y) / ax.pxPerM;
      patch.d = Math.max(0.08, Math.min(0.60, round(st.d + along)));
    }
    store.updateItem(item.id, patch, { transient: true });
  }

  /** Lignes d'aimantation temporaires. */
  drawGuides(list) {
    this.guides.clear();
    const mat = new THREE.LineBasicMaterial({ color: 0x6fd3c4, transparent: true, opacity: 0.75, depthTest: false });
    for (const [dir, v] of list) {
      const pts = dir === 'h'
        ? [new THREE.Vector3(0, v, 0.02), new THREE.Vector3(WALL.width, v, 0.02)]
        : [new THREE.Vector3(v, 0, 0.02), new THREE.Vector3(v, ceilingAt(v), 0.02)];
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      l.renderOrder = 997;
      this.guides.add(l);
    }
  }

  onUp(e) {
    this.controls.enabled = true;
    this.guides.clear();
    if (this.pendingDeselect && !this.drag) {
      // Ne désélectionner que sur un vrai clic : un glisser sert à pivoter la vue.
      const p = this.pendingDeselect;
      this.pendingDeselect = null;
      const moved = Math.hypot((e?.clientX ?? p.x) - p.x, (e?.clientY ?? p.y) - p.y);
      if (moved < 5) store.select(null);
      return;
    }
    this.pendingDeselect = null;
    if (!this.drag) return;
    if (this.drag.moved) store.commitTransient(this.drag.before);
    this.drag = null;
  }
}
