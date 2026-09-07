import * as THREE from 'three';
import { WOODS, SHELVES, FRAMES, OBJECTS } from './catalog.js';

/** Texture de veinage générée à la volée, teintée par le matériau. */
const grainCache = new Map();
function grainTexture() {
  if (grainCache.has('g')) return grainCache.get('g');
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * 128;
    ctx.strokeStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.06})`;
    ctx.lineWidth = 0.4 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin((x + i * 30) / 70) * 2.2 + (Math.random() - 0.5) * 1.4);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  grainCache.set('g', t);
  return t;
}

const woodMats = new Map();
export function woodMaterial(id) {
  if (woodMats.has(id)) return woodMats.get(id);
  const w = WOODS.find((x) => x.id === id) || WOODS[0];
  const m = new THREE.MeshStandardMaterial({ color: w.color, roughness: w.rough, metalness: 0.02, map: grainTexture() });
  m.userData.shared = true;  // mutualisé entre toutes les pièces : ne jamais le libérer
  woodMats.set(id, m);
  return m;
}

/**
 * Toiles abstraites pour les cadres, écrites comme le tableau existant :
 * aplats, formes organiques, et la palette du salon — terre, ocre, crème,
 * bleu-gris, brun profond.
 */
const PALETTE = {
  fond:   ['#c3ccd2', '#e7ddcd', '#d9cfbc', '#b9c8d2', '#e0d6c4'],
  terre:  '#a85a3e', ocre: '#d9963f', creme: '#efe7d9',
  brun:   '#3f2f24', olive: '#7d8a5f', sable: '#cbb08a', ardoise: '#6f7d86',
};

const artCache = new Map();

/** Motifs disponibles ; `art` d'un cadre désigne l'un d'eux. */
export const ART_KEYS = ['graine', 'danse', 'galet', 'arche', 'horizon', 'feuille', 'cercles', 'vague', 'colonnes', 'lune'];

export function artCanvasTexture(key, seed = 0) {
  const id = key + ':' + seed;
  if (artCache.has(id)) return artCache.get(id);
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 400;
  const x = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const P = PALETTE;
  x.fillStyle = P.fond[seed % P.fond.length];
  x.fillRect(0, 0, W, H);

  const blob = (cx, cy, rx, ry, rot, fill) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    x.fillStyle = fill;
    x.beginPath();
    x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  };

  switch (key) {
    case 'graine':
      // le tableau du salon : la goutte ocre et l'amande en suspension
      x.fillStyle = '#b9c8d2';
      x.fillRect(0, 0, W, H);
      x.fillStyle = P.ocre;
      x.beginPath();
      x.moveTo(W * 0.30, H * 0.44);
      x.bezierCurveTo(W * 0.16, H * 0.66, W * 0.26, H * 0.88, W * 0.50, H * 0.88);
      x.bezierCurveTo(W * 0.80, H * 0.88, W * 0.90, H * 0.60, W * 0.78, H * 0.40);
      x.bezierCurveTo(W * 0.70, H * 0.27, W * 0.56, H * 0.30, W * 0.56, H * 0.46);
      x.bezierCurveTo(W * 0.56, H * 0.60, W * 0.62, H * 0.70, W * 0.55, H * 0.74);
      x.bezierCurveTo(W * 0.44, H * 0.79, W * 0.36, H * 0.60, W * 0.30, H * 0.44);
      x.fill();
      blob(W * 0.47, H * 0.20, W * 0.16, H * 0.045, -0.32, P.brun);
      break;
    case 'danse': {
      // la ronde de silhouettes, façon papiers découpés
      x.fillStyle = '#e7ddcd';
      x.fillRect(0, 0, W, H);
      const poses = [
        [0.14, 0.62, 0.10, 0.34, -0.30, '#8a4a33'],
        [0.34, 0.50, 0.11, 0.40, 0.22, '#3f2f28'],
        [0.53, 0.58, 0.10, 0.36, -0.16, '#c08a63'],
        [0.72, 0.48, 0.11, 0.42, 0.30, '#6b3a2a'],
        [0.88, 0.64, 0.09, 0.32, -0.24, '#3f2f28'],
      ];
      for (const [cx, cy, bw, bh, rot, col] of poses) {
        blob(W * cx, H * cy, W * bw * 0.5, H * bh * 0.5, rot, col);
        x.save();
        x.translate(W * cx, H * cy);
        x.rotate(rot);
        x.fillStyle = col;
        x.beginPath();
        x.arc(0, -H * bh * 0.62, W * bw * 0.34, 0, Math.PI * 2);
        x.fill();
        x.restore();
      }
      break;
    }
    case 'galet':
      blob(W * 0.54, H * 0.62, W * 0.29, H * 0.26, -0.2, P.ocre);
      blob(W * 0.42, H * 0.26, W * 0.15, H * 0.05, -0.35, P.brun);
      break;
    case 'arche':
      x.fillStyle = P.terre;
      x.beginPath();
      x.moveTo(W * 0.24, H * 0.82);
      x.lineTo(W * 0.24, H * 0.44);
      x.arc(W * 0.5, H * 0.44, W * 0.26, Math.PI, 0);
      x.lineTo(W * 0.76, H * 0.82);
      x.fill();
      x.fillStyle = P.creme;
      x.fillRect(W * 0.36, H * 0.58, W * 0.28, H * 0.24);
      break;
    case 'horizon': {
      const bandes = [[0.42, 0.16, P.sable], [0.58, 0.09, P.terre], [0.67, 0.2, P.ardoise]];
      for (const [y0, h, col] of bandes) {
        x.fillStyle = col;
        x.fillRect(W * 0.12, H * y0, W * 0.76, H * h);
      }
      break;
    }
    case 'feuille':
      x.fillStyle = P.olive;
      x.beginPath();
      x.moveTo(W * 0.5, H * 0.16);
      x.bezierCurveTo(W * 0.86, H * 0.36, W * 0.8, H * 0.72, W * 0.5, H * 0.86);
      x.bezierCurveTo(W * 0.2, H * 0.72, W * 0.14, H * 0.36, W * 0.5, H * 0.16);
      x.fill();
      x.strokeStyle = P.creme;
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(W * 0.5, H * 0.22);
      x.lineTo(W * 0.5, H * 0.8);
      x.stroke();
      break;
    case 'cercles':
      blob(W * 0.4, H * 0.44, W * 0.24, W * 0.24, 0, P.terre);
      blob(W * 0.62, H * 0.6, W * 0.2, W * 0.2, 0, P.ocre);
      break;
    case 'vague':
      x.fillStyle = P.ardoise;
      x.beginPath();
      x.moveTo(0, H * 0.66);
      x.bezierCurveTo(W * 0.3, H * 0.44, W * 0.7, H * 0.84, W, H * 0.56);
      x.lineTo(W, H);
      x.lineTo(0, H);
      x.fill();
      blob(W * 0.68, H * 0.28, W * 0.13, W * 0.13, 0, P.ocre);
      break;
    case 'colonnes': {
      const cols = [P.terre, P.sable, P.brun, P.ocre];
      for (let i = 0; i < 4; i++) {
        x.fillStyle = cols[(i + seed) % cols.length];
        const h = H * (0.34 + ((i * 7 + seed * 3) % 5) * 0.08);
        x.fillRect(W * (0.16 + i * 0.18), H * 0.78 - h, W * 0.1, h);
      }
      break;
    }
    case 'lune':
      blob(W * 0.5, H * 0.46, W * 0.28, W * 0.28, 0, P.creme);
      blob(W * 0.63, H * 0.4, W * 0.24, W * 0.24, 0, P.fond[seed % P.fond.length]);
      x.fillStyle = P.brun;
      x.fillRect(W * 0.2, H * 0.76, W * 0.6, H * 0.03);
      break;
    default:
      blob(W * 0.5, H * 0.5, W * 0.26, H * 0.2, 0, P.ocre);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  artCache.set(id, t);
  return t;
}

export function catalogEntry(type, catalogId) {
  const bank = type === 'shelf' ? SHELVES : type === 'frame' ? FRAMES : OBJECTS;
  return bank.find((e) => e.id === catalogId) || bank[0];
}

function mesh(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ---------------------------------------------------------------- objets */

function buildShape(shape, w, h, d, material) {
  const g = new THREE.Group();
  const add = (m) => { g.add(m); return m; };
  switch (shape) {
    case 'vase': {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = (w / 2) * (0.42 + 0.58 * Math.sin(Math.PI * (0.18 + t * 0.74)));
        pts.push(new THREE.Vector2(Math.max(r, 0.012), t * h));
      }
      add(mesh(new THREE.LatheGeometry(pts, 20), material));
      break;
    }
    case 'sphere':
      add(mesh(new THREE.SphereGeometry(w / 2, 20, 14), material)).position.y = h / 2;
      break;
    case 'bowl': {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new THREE.Vector2(Math.max((w / 2) * (0.28 + 0.72 * t), 0.01), t * h));
      }
      add(mesh(new THREE.LatheGeometry(pts, 20), material));
      break;
    }
    case 'stack': {
      let y = 0;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const th = h / n;
        const b = add(mesh(new THREE.BoxGeometry(w * (1 - i * 0.06), th * 0.86, d * (1 - i * 0.05)), material));
        b.position.y = y + th / 2;
        y += th;
      }
      break;
    }
    case 'books': {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const bw = w / n;
        const bh = h * (0.78 + Math.random() * 0.22);
        const b = add(mesh(new THREE.BoxGeometry(bw * 0.86, bh, d), material));
        b.position.set(-w / 2 + bw * (i + 0.5), bh / 2, 0);
      }
      break;
    }
    case 'camera': {
      const body = add(mesh(new THREE.BoxGeometry(w, h, d), material));
      body.position.y = h / 2;
      const lens = add(mesh(new THREE.CylinderGeometry(h * 0.3, h * 0.3, d * 0.55, 16), material));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, h * 0.5, d * 0.6);
      break;
    }
    case 'candle': {
      const base = add(mesh(new THREE.CylinderGeometry(w / 2, w / 2 * 1.15, h * 0.16, 16), material));
      base.position.y = h * 0.08;
      const stem = add(mesh(new THREE.CylinderGeometry(w * 0.16, w * 0.16, h * 0.84, 12), material));
      stem.position.y = h * 0.58;
      break;
    }
    case 'statue': {
      const b = add(mesh(new THREE.CylinderGeometry(w * 0.34, w * 0.42, h * 0.18, 14), material));
      b.position.y = h * 0.09;
      const t = add(mesh(new THREE.SphereGeometry(w * 0.38, 16, 12), material));
      t.scale.set(1, h * 0.55 / (w * 0.76), 0.8);
      t.position.y = h * 0.62;
      break;
    }
    case 'box':
      add(mesh(new THREE.BoxGeometry(w, h, d), material)).position.y = h / 2;
      break;
    case 'plant': {
      const pot = add(mesh(new THREE.CylinderGeometry(w * 0.34, w * 0.26, h * 0.3, 16), material));
      pot.position.y = h * 0.15;
      const leaves = add(mesh(new THREE.IcosahedronGeometry(w * 0.5, 1),
        new THREE.MeshStandardMaterial({ color: 0x5f7a4a, roughness: 0.85 })));
      leaves.position.y = h * 0.3 + w * 0.42;
      leaves.scale.y = (h * 0.7) / (w * 1.0);
      break;
    }
    case 'clock': {
      const r = add(mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 28), material));
      r.rotation.x = Math.PI / 2;
      r.position.y = h / 2;
      break;
    }
    case 'frame': {
      const f = add(mesh(new THREE.BoxGeometry(w, h, d), material));
      f.position.y = h / 2;
      break;
    }
    case 'basket': {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push(new THREE.Vector2((w / 2) * (0.72 + 0.28 * t), t * h));
      }
      add(mesh(new THREE.LatheGeometry(pts, 18), material));
      break;
    }
    case 'lantern': {
      const b = add(mesh(new THREE.BoxGeometry(w, h * 0.8, d), material));
      b.position.y = h * 0.4;
      const top = add(mesh(new THREE.ConeGeometry(w * 0.75, h * 0.2, 4), material));
      top.position.y = h * 0.9;
      top.rotation.y = Math.PI / 4;
      break;
    }
    case 'human': {
      const skin = new THREE.MeshStandardMaterial({ color: 0x6f7d86, roughness: 0.9, transparent: true, opacity: 0.5 });
      const torso = add(mesh(new THREE.CapsuleGeometry(w * 0.26, h * 0.34, 4, 12), skin));
      torso.position.y = h * 0.63;
      const head = add(mesh(new THREE.SphereGeometry(h * 0.075, 14, 12), skin));
      head.position.y = h * 0.93;
      const legs = add(mesh(new THREE.CapsuleGeometry(w * 0.2, h * 0.4, 4, 12), skin));
      legs.position.y = h * 0.25;
      break;
    }
    default:
      add(mesh(new THREE.BoxGeometry(w, h, d), material)).position.y = h / 2;
  }
  return g;
}

/**
 * Cadre monté en baguettes autour d'une toile encastrée.
 * Une toile posée *devant* le cadre projetait sa propre ombre décalée de
 * quelques centimètres : c'est le trait parasite qu'on voyait à gauche des
 * tableaux. Ici la toile est en retrait et ne projette pas d'ombre, le
 * cadre porte seul la silhouette.
 */
export function buildFramedArt(w, h, frameMat, canvasMat) {
  const g = new THREE.Group();
  const depth = 0.042;
  const border = Math.min(0.04, w * 0.07, h * 0.07);

  const back = mesh(new THREE.BoxGeometry(w, h, 0.018), frameMat);
  back.position.z = 0.009;
  g.add(back);

  const inner = [Math.max(w - border * 2, 0.02), Math.max(h - border * 2, 0.02)];
  const canvas = mesh(new THREE.BoxGeometry(inner[0], inner[1], 0.006), canvasMat);
  canvas.position.z = 0.021;
  canvas.castShadow = false;
  g.add(canvas);

  // Baguettes : haut, bas, gauche, droite
  const bars = [
    [w, border, 0, (h - border) / 2],
    [w, border, 0, -(h - border) / 2],
    [border, h - border * 2, -(w - border) / 2, 0],
    [border, h - border * 2, (w - border) / 2, 0],
  ];
  for (const [bw, bh, bx, by] of bars) {
    const b = mesh(new THREE.BoxGeometry(bw, bh, depth), frameMat);
    b.position.set(bx, by, depth / 2);
    g.add(b);
  }
  g.userData.frameDepth = depth;
  return g;
}

/* ---------------------------------------------------------------- fabrique */

/**
 * Construit le maillage d'un item.
 * Repères : étagère → y = dessous de la planche ; cadre → y = centre ;
 * objet → y = base posée.
 */
/** Matériau qui n'écrit ni couleur ni profondeur : invisible mais toujours cliquable. */
function pickMaterial() {
  return new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
}

/**
 * Boîte de préhension : une planche de 4 cm ne fait que quelques pixels à
 * l'écran. On lui ajoute un volume invisible plus généreux pour pouvoir
 * l'attraper sans viser au pixel près.
 */
function addPickProxy(group, item) {
  const b = itemBounds(item);
  const pad = 0.055;
  const geo = new THREE.BoxGeometry(
    Math.max(b.w, 0.06) + pad,
    Math.max(b.h, 0.10) + pad,
    Math.max(b.d, 0.10) + pad
  );
  const proxy = new THREE.Mesh(geo, pickMaterial());
  proxy.position.set(0, b.y0 + Math.max(b.h, 0.10) / 2, Math.max(b.d, 0.10) / 2);
  proxy.renderOrder = -1;
  proxy.userData.pickable = true;
  proxy.userData.isProxy = true;
  group.add(proxy);
}

export function buildItem(item) {
  const g = new THREE.Group();
  g.name = 'item:' + item.id;
  g.userData.itemId = item.id;

  if (item.type === 'shelf') {
    const m = mesh(new THREE.BoxGeometry(item.w, item.t, item.d), woodMaterial(item.wood));
    m.position.set(0, item.t / 2, item.d / 2);
    m.userData.pickable = true;
    g.add(m);
  } else if (item.type === 'frame') {
    const canvasMat = item.art
      ? new THREE.MeshStandardMaterial({ map: artCanvasTexture(item.art, item.artSeed ?? 0), roughness: 0.94 })
      : new THREE.MeshStandardMaterial({ color: item.canvasColor ?? 0xe8e1d4, roughness: 0.94 });
    const art = buildFramedArt(item.w, item.h, woodMaterial(item.wood), canvasMat);
    art.traverse((o) => { if (o.isMesh) o.userData.pickable = true; });
    g.add(art);
  } else {
    const entry = catalogEntry('object', item.catalogId);
    const material = new THREE.MeshStandardMaterial({ color: item.color ?? entry.color, roughness: 0.82 });
    const sub = buildShape(entry.shape, item.w, item.h, item.d, material);
    sub.traverse((o) => { if (o.isMesh) o.userData.pickable = true; });
    g.add(sub);
  }
  addPickProxy(g, item);
  return g;
}

/** Boîte englobante locale d'un item (pour la sélection et les cotes). */
export function itemBounds(item) {
  if (item.type === 'shelf') return { w: item.w, h: item.t, d: item.d, y0: 0 };
  if (item.type === 'frame') return { w: item.w, h: item.h, d: 0.05, y0: -item.h / 2 };
  return { w: item.w, h: item.h, d: item.d, y0: 0 };
}
