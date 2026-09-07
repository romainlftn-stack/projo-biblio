/**
 * Sélection, déplacement dans le plan du mur, poignées de redimensionnement,
 * aimantations (grille, montants placo, alignement) et contrôle des collisions.
 */
import * as THREE from 'three';
import { FIXTURES, WALL, MIN_SHELF_WIDTH, SUPPORT_TOPS, ceilingAt, studPositions, snapPositions } from './config.js';
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
  /*
   * Profondeur : une double flèche alignée sur l'axe réel devenait verticale
   * vu de face, où cet axe pointe vers la caméra — on croyait pouvoir monter
   * ou descendre la planche. Le pictogramme est donc fixe et littéral : le
   * mur à gauche, la planche en débord, et la cote qu'on règle en dessous.
   */
  const paths = [[[-16, -30], [18, 0], [-16, 30]]];
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

/** Profondeur du centre d'un objet : sa valeur propre, sinon le milieu de son support. */
export function objectDepth(item, items) {
  if (Number.isFinite(item.z)) return item.z;
  const sup = supportingSurface(item, items);
  return sup ? sup.depth / 2 : 0.16;
}

/** Volume d'un objet, pour le confronter aux meubles existants. */
function volume(item, items) {
  const fp = footprint(item);
  const z = objectDepth(item, items);
  return { ...fp, z0: z - item.d / 2, z1: z + item.d / 2 };
}

const overlaps = (a, b, m = 0) =>
  a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.y0 < b.y1 - m && a.y1 > b.y0 + m;

/**
 * Contrôle de pose. Renvoie une liste de `{ text, level }` :
 * `error` = pose à corriger (la pièce vire au rouge), `note` = information.
 * Les objets posés sur une étagère ne sont pas contrôlés, ils suivent la planche.
 */
export function validate(item, items, settings = store.getState().settings) {
  const out = [];
  const err = (text) => out.push({ text, level: 'error' });
  const note = (text) => out.push({ text, level: 'note' });

  if (item.type === 'object') {
    // Un objet ne peut pas se retrouver dans un volume plein : le foyer, la
    // hotte, le conduit. On confronte donc les trois dimensions, la seule
    // emprise sur le mur ne suffirait pas.
    const v = volume(item, items);
    for (const f of FIXTURES) {
      if (!f.blocks) continue;
      const y1 = f.y1 ?? ceilingAt((f.x0 + f.x1) / 2);
      if (overlaps(v, { x0: f.x0, x1: f.x1, y0: f.y0, y1 }, 0.005) && v.z0 < f.d - 0.005) {
        err(`Traverse : ${f.label}.`);
        break;
      }
    }
    return out;
  }

  const offset = settings.studOffset ?? 0.30;
  const spacing = settings.studSpacing ?? 0.60;
  const fp = footprint(item);

  if (fp.x0 < -0.01 || fp.x1 > WALL.width + 0.01) err('Déborde du mur.');
  const top = Math.min(ceilingAt(Math.max(fp.x0, 0)), ceilingAt(Math.min(fp.x1, WALL.width)));
  if (fp.y1 > top) err('Passe sous le rampant du plafond.');
  if (fp.y0 < 0) err('Passe sous le sol.');

  for (const f of FIXTURES) {
    if (!f.blocks) continue;
    const y1 = f.y1 ?? ceilingAt((f.x0 + f.x1) / 2);
    if (overlaps(fp, { x0: f.x0, x1: f.x1, y0: f.y0, y1 }, 0.005)) err(`Bute sur : ${f.label}.`);
  }

  if (item.type === 'shelf') {
    if (item.w < MIN_SHELF_WIDTH - 1e-6) {
      err(`Moins de ${Math.round(MIN_SHELF_WIDTH * 100)} cm : fixation invisible impossible.`);
    }
    /*
     * L'entraxe est une donnée sûre (note de maman), la position de la trame
     * ne l'est pas. On sépare donc ce qui se déduit de l'entraxe seul — vrai
     * quelle que soit la trame — de ce qui dépend du calage supposé.
     */
    const span = item.w - 0.06;                       // 3 cm de marge à chaque bout
    const garantis = Math.ceil(span / spacing) - 1;   // pire cas sur toutes les positions
    const sûre = Math.ceil((2 * spacing + 0.061) * 100);
    if (garantis < 2) {
      const reels = studPositions(offset, spacing)
        .filter((v) => v > fp.x0 + 0.03 && v < fp.x1 - 0.03).length;
      if (reels >= 2) {
        note(`Deux montants d'après la trame supposée. À partir de ${sûre} cm, c'est vrai quelle que soit sa position réelle.`);
      } else {
        err(`N'attrape qu'un montant avec la trame supposée. À partir de ${sûre} cm, deux appuis sont garantis où qu'elle tombe.`);
      }
    }
  }

  for (const other of items) {
    if (other.id === item.id || other.type === 'object') continue;
    if (overlaps(fp, footprint(other), 0.004)) { err('Chevauche une autre pièce.'); break; }
  }
  return out;
}

/** Vrai si la pose comporte au moins un vrai défaut (et non une simple note). */
export const hasError = (issues) => issues.some((i) => i.level === 'error');

/**
 * Surface capable de porter un objet à cette position : une planche posée, ou
 * le plateau d'un meuble existant (meuble bas, range-bûches, socle, vitrine).
 */
export function supportingSurface(item, items) {
  const fp = footprint(item);
  let best = null;
  const consider = (top, depth, id) => {
    const gap = item.y - top;
    if (gap < -0.06 || gap > 0.40) return;
    if (!best || top > best.top) best = { top, depth, id };
  };
  for (const s of items) {
    if (s.type !== 'shelf' || s.id === item.id) continue;
    const sf = footprint(s);
    if (fp.x1 < sf.x0 + 0.02 || fp.x0 > sf.x1 - 0.02) continue;
    consider(s.y + s.t, s.d, s.id);
  }
  for (const f of FIXTURES) {
    if (!SUPPORT_TOPS.includes(f.id)) continue;
    if (fp.x1 < f.x0 + 0.02 || fp.x0 > f.x1 - 0.02) continue;
    consider(f.y1, f.d, f.id);
  }
  return best;
}

/** Compatibilité : l'étagère qui porte l'objet, si c'en est une. */
export function supportingShelf(item, items) {
  const sup = supportingSurface(item, items);
  return sup ? items.find((i) => i.id === sup.id) || null : null;
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
    this.panModifier = false;
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
      ['left',  Math.PI, 0xffc857],
      ['right', 0, 0xffc857],
      ['top',   -Math.PI / 2, 0xffc857],
    ];
    for (const [key, rot, color] of specs) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: chevronTexture('chevron', rot, color),
        depthTest: false,
        transparent: true,
      }));
      sp.renderOrder = 999;
      sp.userData.handle = key;
      g.add(sp);
      this.handleMeshes[key] = sp;
    }

    /*
     * Profondeur : aucune vignette. Quatre pictogrammes successifs ont échoué
     * à dire « ceci règle la profondeur ». On prend le chemin des outils 3D :
     * la poignée EST le chant de la pièce. On tire le bord avant, le geste
     * n'a plus besoin d'être expliqué.
     */
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x86b3c4, depthTest: false })
    );
    lip.renderOrder = 999;
    lip.userData.handle = 'depth';
    g.add(lip);
    this.handleMeshes.depth = lip;

    // Zone de préhension invisible : la barre visible reste fine, mais on ne
    // doit pas avoir à viser au pixel près pour l'attraper.
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    grip.userData.handle = 'depth';
    grip.userData.grip = true;
    g.add(grip);
    this.handleMeshes.depthGrip = grip;
    g.visible = false;
    return g;
  }

  /**
   * Repositionne les poignées. Elles sont posées *à l'écart* de la pièce :
   * collées à ses bords, elles se chevauchaient entre elles et avec la planche
   * dès qu'on posait une petite étagère.
   */
  syncHandles(item) {
    // Les objets de déco sont des étalons : on ne les redimensionne pas, et
    // leurs poignées ne feraient que gêner la prise pour les déplacer.
    if (!item) { this.handles.visible = false; return; }
    const b = itemBounds(item);
    const cy = item.y + b.y0 + b.h / 2;
    const z = b.d / 2;
    const gap = 0.07;
    // Un objet garde sa taille : seule sa profondeur sur le meuble se règle.
    const objet = item.type === 'object';
    const zc = objet ? objectDepth(item, store.getState().items) : b.d / 2;
    this.handleMeshes.left.position.set(item.x - b.w / 2 - gap, cy, zc);
    this.handleMeshes.right.position.set(item.x + b.w / 2 + gap, cy, zc);
    this.handleMeshes.left.visible = !objet;
    this.handleMeshes.right.visible = !objet;
    const lip = this.handleMeshes.depth;
    const zLip = objet ? zc + b.d / 2 : b.d;
    lip.position.set(item.x, cy, zLip);
    lip.userData.spanX = b.w;
    lip.visible = item.type !== 'frame';
    const grip = this.handleMeshes.depthGrip;
    grip.position.copy(lip.position);
    grip.userData.spanX = b.w;
    grip.visible = lip.visible;
    this.handleMeshes.top.position.set(item.x, item.y + b.y0 + b.h + gap, zc);
    this.handleMeshes.top.visible = item.type === 'frame';
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
      if (m.userData.handle === 'depth') {
        // La barre garde la longueur de la pièce, et une épaisseur lisible
        // quel que soit le zoom. Sa zone de préhension est bien plus large.
        const e = m.userData.grip ? s * 1.05 : s * 0.34;
        m.scale.set(m.userData.spanX ?? 1, e, e);
      } else {
        m.scale.set(s, s, 1);
      }
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
    // ⌘ / Ctrl / Maj / Espace : le glisser appartient à la navigation.
    if (e.button !== 0 || this.navOnly || this.panModifier
        || e.metaKey || e.ctrlKey || e.shiftKey) return;
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
      for (const st of snapPositions(s.studOffset ?? 0.30, s.studSpacing ?? 0.60)) {
        if (Math.abs(x - st) < STUD_TOL) { x = st; guides.push(['v', st]); break; }
      }
    }

    const patch = { x, y };
    if (item.type === 'object') {
      const probe = { ...item, x, y };
      const sup = supportingSurface(probe, store.getState().items);
      if (sup && !free) {
        patch.y = sup.top;
        patch.onShelf = sup.id;
        const half = item.d / 2;
        const zMax = Math.max(sup.depth - half, half);
        patch.z = Math.min(Math.max(objectDepth(item, store.getState().items), half), zMax);
      } else {
        patch.onShelf = null;
      }
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
      if (item.type === 'object') {
        // Sur un objet, la poignée ne change pas la taille : elle l'avance ou
        // le recule sur son support.
        const items = store.getState().items;
        const sup = supportingSurface(item, items);
        const half = item.d / 2;
        const zMax = sup ? Math.max(sup.depth - half, half) : 0.6;
        const base = Number.isFinite(st.z) ? st.z : objectDepth(st, items);
        patch.z = Math.min(Math.max(round(base + along), half), zMax);
      } else {
        patch.d = Math.max(0.08, Math.min(0.60, round(st.d + along)));
      }
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
