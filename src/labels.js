/** Cotes affichées à côté des planches et des objets, + contour de sélection. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { itemBounds } from './items.js';

const cm = (m) => `${Math.round(m * 100)}`;

/** Libellé de cote d'un item, en centimètres. */
export function dimText(item) {
  if (item.type === 'shelf') return `${cm(item.w)} × ${cm(item.d)} cm · ép. ${cm(item.t)}`;
  if (item.type === 'frame') return `${cm(item.w)} × ${cm(item.h)} cm`;
  return `${cm(item.w)} × ${cm(item.h)} cm`;
}

/** Hauteur du dessus de l'item par rapport au sol. */
export function topOf(item) {
  if (item.type === 'shelf') return item.y + item.t;
  if (item.type === 'frame') return item.y + item.h / 2;
  return item.y + item.h;
}

export class LabelLayer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'cotes';
    scene.add(this.group);
    this.byId = new Map();
    this.visible = true;
  }

  /**
   * Reconstruit les étiquettes.
   * Par défaut seule la pièce sélectionnée est cotée : tout afficher d'un coup
   * devient illisible dès une dizaine de planches. Le réglage « toutes les
   * cotes » lève cette restriction.
   */
  sync(items, showAll, selection) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item.id);
      let rec = this.byId.get(item.id);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'cote';
        const obj = new CSS2DObject(el);
        this.group.add(obj);
        rec = { el, obj };
        this.byId.set(item.id, rec);
      }
      const b = itemBounds(item);
      rec.el.textContent = dimText(item);
      rec.el.dataset.type = item.type;
      rec.obj.visible = !!showAll || item.id === selection;
      // Au-dessus et centrée : à droite, elle tombait sur la poignée de bord.
      rec.obj.position.set(item.x, item.y + b.y0 + b.h + 0.19, b.d + 0.02);
    }
    for (const [id, rec] of this.byId) {
      if (seen.has(id)) continue;
      this.group.remove(rec.obj);
      rec.el.remove();
      this.byId.delete(id);
    }
  }

  /** Met en avant l'étiquette de l'item sélectionné. */
  setSelection(id) {
    for (const [key, rec] of this.byId) rec.el.classList.toggle('is-selected', key === id);
  }
}

/** Contour jaune autour de l'item sélectionné. */
export class SelectionOutline {
  constructor(scene) {
    this.mesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffc857, depthTest: false, transparent: true, opacity: 0.95 })
    );
    this.mesh.renderOrder = 998;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(item) {
    if (!item) { this.mesh.visible = false; return; }
    const b = itemBounds(item);
    this.mesh.scale.set(b.w + 0.012, b.h + 0.012, b.d + 0.012);
    this.mesh.position.set(item.x, item.y + b.y0 + b.h / 2, b.d / 2);
    this.mesh.visible = true;
  }
}

/**
 * Contours rouges des pièces mal posées.
 * Teinter le matériau, comme on le faisait, repeignait la planche : sur un
 * chêne clair la nuance passait, sur du noir mat la pièce virait au rouge. Un
 * contour signale aussi bien sans toucher à la teinte choisie.
 */
export class IssueMarkers {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'defauts';
    scene.add(this.group);
    this.byId = new Map();
    this.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.material = new THREE.LineBasicMaterial({
      color: 0xe8542f, depthTest: false, transparent: true, opacity: 0.95,
    });
  }

  sync(items, badIds) {
    for (const item of items) {
      const bad = badIds.has(item.id);
      let box = this.byId.get(item.id);
      if (!bad) {
        if (box) { this.group.remove(box); this.byId.delete(item.id); }
        continue;
      }
      if (!box) {
        box = new THREE.LineSegments(this.geometry, this.material);
        box.renderOrder = 997;
        this.group.add(box);
        this.byId.set(item.id, box);
      }
      const b = itemBounds(item);
      box.scale.set(b.w + 0.03, b.h + 0.03, b.d + 0.03);
      box.position.set(item.x, item.y + b.y0 + b.h / 2, b.d / 2);
    }
    for (const [id, box] of this.byId) {
      if (items.some((i) => i.id === id)) continue;
      this.group.remove(box);
      this.byId.delete(id);
    }
  }
}

/**
 * Règle verticale de rappel : graduations tous les 50 cm sur la gauche du mur,
 * pour situer les hauteurs d'un coup d'œil.
 */
export function buildHeightRuler(maxHeight) {
  const g = new THREE.Group();
  g.name = 'regle';
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
  for (let h = 0.5; h <= maxHeight; h += 0.5) {
    const long = Math.abs(h % 1) < 0.01;
    const len = long ? 0.22 : 0.12;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.03, h, 0.01), new THREE.Vector3(-0.03 - len, h, 0.01),
    ]);
    g.add(new THREE.Line(geo, mat));
    if (long) {
      const el = document.createElement('div');
      el.className = 'cote cote--regle';
      el.textContent = `${h.toFixed(0)} m`;
      const o = new CSS2DObject(el);
      o.position.set(-0.32, h, 0.01);
      g.add(o);
    }
  }
  g.visible = false;
  return g;
}
