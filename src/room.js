import * as THREE from 'three';
import { WALL, WALL_OUTLINE, FIXTURES, EXISTING_ART, COLORS, ceilingAt, studPositions } from './config.js';
import { buildFramedArt } from './items.js';

const W = WALL.width;

/** Point de référence à l'intérieur du salon, pour orienter les normales. */
const INSIDE = new THREE.Vector3(4.07, 1.5, 3.2);

/**
 * Marque une surface d'enveloppe : dès que la caméra passe de l'autre côté,
 * elle s'efface en voile translucide au lieu de masquer toute la scène.
 * `a`, `b`, `c` sont trois points du plan.
 */
function tagFade(mesh, a, b, c) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  if (n.dot(new THREE.Vector3().subVectors(INSIDE, a)) < 0) n.negate();
  mesh.userData.fade = { point: a.clone(), normal: n };
  return mesh;
}

/**
 * Rend translucides les surfaces derrière lesquelles la caméra est passée.
 * Le basculement n'a lieu qu'au changement d'état : muter `transparent`
 * recompile le shader, on évite de le faire à chaque image.
 */
export function updateEnvelopeFade(root, camera) {
  root.traverse((o) => {
    const f = o.userData.fade;
    if (!f || !o.material) return;
    const outside = camera.position.clone().sub(f.point).dot(f.normal) < 0;
    if (o.userData.faded === outside) return;
    o.userData.faded = outside;
    const m = o.material;
    m.transparent = outside;
    m.opacity = outside ? 0.12 : 1;
    m.depthWrite = !outside;
    m.needsUpdate = true;
  });
}

/**
 * Toiles des tableaux déjà accrochés, redessinées à plat dans la même
 * direction artistique que le reste de la scène.
 */
function artTexture(id) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = id === 'art-graine' ? 658 : 384;
  const x = c.getContext('2d');
  const W2 = c.width;
  const H2 = c.height;

  if (id === 'art-graine') {
    x.fillStyle = '#b9c8d2';
    x.fillRect(0, 0, W2, H2);
    // la forme orange, en goutte renversée
    x.fillStyle = '#d9963f';
    x.beginPath();
    x.moveTo(W2 * 0.30, H2 * 0.44);
    x.bezierCurveTo(W2 * 0.16, H2 * 0.66, W2 * 0.26, H2 * 0.88, W2 * 0.50, H2 * 0.88);
    x.bezierCurveTo(W2 * 0.80, H2 * 0.88, W2 * 0.90, H2 * 0.60, W2 * 0.78, H2 * 0.40);
    x.bezierCurveTo(W2 * 0.70, H2 * 0.27, W2 * 0.56, H2 * 0.30, W2 * 0.56, H2 * 0.46);
    x.bezierCurveTo(W2 * 0.56, H2 * 0.60, W2 * 0.62, H2 * 0.70, W2 * 0.55, H2 * 0.74);
    x.bezierCurveTo(W2 * 0.44, H2 * 0.79, W2 * 0.36, H2 * 0.60, W2 * 0.30, H2 * 0.44);
    x.fill();
    // l'amande sombre en suspension
    x.save();
    x.translate(W2 * 0.47, H2 * 0.20);
    x.rotate(-0.32);
    x.fillStyle = '#3f2f24';
    x.beginPath();
    x.ellipse(0, 0, W2 * 0.16, H2 * 0.055, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  } else {
    x.fillStyle = '#e7ddcd';
    x.fillRect(0, 0, W2, H2);
    // ronde de silhouettes, façon papiers découpés
    const poses = [
      [0.14, 0.62, 0.10, 0.34, -0.30, '#8a4a33'],
      [0.34, 0.50, 0.11, 0.40, 0.22, '#3f2f28'],
      [0.53, 0.58, 0.10, 0.36, -0.16, '#c08a63'],
      [0.72, 0.48, 0.11, 0.42, 0.30, '#6b3a2a'],
      [0.88, 0.64, 0.09, 0.32, -0.24, '#3f2f28'],
    ];
    for (const [cx, cy, w, h, rot, col] of poses) {
      x.save();
      x.translate(W2 * cx, H2 * cy);
      x.rotate(rot);
      x.fillStyle = col;
      x.beginPath();
      x.ellipse(0, 0, W2 * w * 0.5, H2 * h * 0.5, 0, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.arc(0, -H2 * h * 0.62, W2 * w * 0.34, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mat(color, rough = 0.9, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Place une boîte par son emprise (x0..x1, y0..y1) et sa profondeur depuis le mur. */
function placeBox(x0, x1, y0, y1, d, material) {
  const m = box(x1 - x0, y1 - y0, d, material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, d / 2);
  return m;
}

/** Le mur rouge, découpé en pentagone, avec l'ouverture de la porte. */
function buildWall() {
  const shape = new THREE.Shape();
  WALL_OUTLINE.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();

  const door = FIXTURES.find((f) => f.id === 'porte');
  const hole = new THREE.Path();
  hole.moveTo(door.x0, 0);
  hole.lineTo(door.x0, door.y1);
  hole.lineTo(door.x1, door.y1);
  hole.lineTo(door.x1, 0);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL.thickness, bevelEnabled: false });
  geo.translate(0, 0, -WALL.thickness);
  const m = new THREE.Mesh(geo, mat(COLORS.wall, 0.95));
  m.receiveShadow = true;
  m.name = 'mur-rouge';
  return m;
}

/** Sol, murs de retour, plafond rampant et pannes. */
function buildEnvelope(group) {
  const depth = 9.5;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 3, depth), mat(COLORS.floor, 0.85));
  floor.name = 'sol';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, depth / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // Retours latéraux : matériaux distincts, chacun s'efface indépendamment
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(depth, 6), mat(COLORS.side, 0.95));
  sideL.rotation.y = Math.PI / 2;
  sideL.position.set(0, 3, depth / 2);
  sideL.receiveShadow = true;
  sideL.material.side = THREE.DoubleSide;
  tagFade(sideL, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  group.add(sideL);

  const sideR = new THREE.Mesh(new THREE.PlaneGeometry(depth, 6), mat(COLORS.side, 0.95));
  sideR.rotation.y = -Math.PI / 2;
  sideR.position.set(W, 3, depth / 2);
  sideR.receiveShadow = true;
  sideR.material.side = THREE.DoubleSide;
  tagFade(sideR, new THREE.Vector3(W, 0, 0), new THREE.Vector3(W, 1, 0), new THREE.Vector3(W, 0, 1));
  group.add(sideR);

  // Plafond rampant : deux pans suivant le faîtage du mur
  const mkSlope = (x0, x1) => {
    const ceilMat = mat(COLORS.ceiling, 0.95);
    ceilMat.side = THREE.DoubleSide;
    const h0 = ceilingAt(x0);
    const h1 = ceilingAt(x1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, h0, 0,  x1, h1, 0,  x1, h1, depth,
      x0, h0, 0,  x1, h1, depth,  x0, h0, depth,
    ], 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, ceilMat);
    m.receiveShadow = true;
    m.name = 'rampant';
    tagFade(m, new THREE.Vector3(x0, h0, 0), new THREE.Vector3(x1, h1, 0), new THREE.Vector3(x1, h1, depth));
    return m;
  };
  group.add(mkSlope(0, WALL.apexX), mkSlope(WALL.apexX, W));

  // Pannes blanches sous le rampant
  [[1.35, 0.35], [WALL.apexX, 0.16], [5.4, 0.35]].forEach(([x, len]) => {
    const h = ceilingAt(x);
    const b = box(0.16, 0.22, depth * 0.92, mat(COLORS.beam, 0.85));
    b.position.set(x, h - 0.13 - len * 0.1, depth * 0.46);
    const x1 = x <= WALL.apexX ? WALL.apexX : W;
    const x0 = x <= WALL.apexX ? 0 : WALL.apexX;
    tagFade(b, new THREE.Vector3(x0, ceilingAt(x0), 0), new THREE.Vector3(x1, ceilingAt(x1), 0),
            new THREE.Vector3(x1, ceilingAt(x1), depth));
    group.add(b);
  });
}

/** Volumes existants : meuble bas, cheminée, vitrine, porte… */
function buildFixtures(group) {
  const mats = {
    wood:    mat(0x8a6a4a, 0.7),
    white:   mat(COLORS.white, 0.85),
    cabinet: mat(0x7a5a3c, 0.62),
    firebox: new THREE.MeshStandardMaterial({ color: 0x1b1917, roughness: 0.4, metalness: 0.35 }),
    door:    mat(0x6e4a30, 0.75),
  };

  for (const f of FIXTURES) {
    const y1 = f.y1 ?? ceilingAt((f.x0 + f.x1) / 2);
    if (f.kind === 'door') {
      const d = placeBox(f.x0, f.x1, f.y0, y1, 0.05, mats.door);
      d.position.z = -0.08;
      d.name = 'fixture:' + f.id;
      group.add(d);
      continue;
    }
    const m = placeBox(f.x0, f.x1, f.y0, y1, f.d, mats[f.kind] || mats.wood);
    m.name = 'fixture:' + f.id;
    group.add(m);

    if (f.id === 'vitrine') {
      // Vitrage : deux portes vitrées
      const glass = new THREE.MeshStandardMaterial({
        color: 0x3a463f, roughness: 0.14, metalness: 0.05, transparent: true, opacity: 0.62,
      });
      const g = box(f.x1 - f.x0 - 0.16, y1 - 0.5, 0.02, glass);
      g.position.set((f.x0 + f.x1) / 2, 0.30 + (y1 - 0.5) / 2, f.d + 0.005);
      group.add(g);
    }
    if (f.id === 'meuble-bas') {
      // Rainures des portes
      const line = mat(0x6d5238, 0.8);
      for (let i = 1; i < 6; i++) {
        const s = box(0.008, f.y1 - 0.06, 0.006, line);
        s.position.set(f.x0 + ((f.x1 - f.x0) * i) / 6, f.y1 / 2, f.d + 0.004);
        group.add(s);
      }
    }
  }

  // Tableaux déjà accrochés
  const art = new THREE.Group();
  art.name = 'tableaux-existants';
  group.add(art);
  for (const a of EXISTING_ART) {
    const canvasMat = new THREE.MeshStandardMaterial({ map: artTexture(a.id), roughness: 0.92 });
    const piece = buildFramedArt(a.w, a.h, mat(0x8c7355, 0.7), canvasMat);
    piece.position.set(a.cx, a.cy, 0);
    piece.name = 'art:' + a.id;
    art.add(piece);
  }
}

/** Mobilier du salon, simplifié mais à l'échelle : canapé, tables, fauteuil, tapis, plantes. */
function buildFurniture() {
  const g = new THREE.Group();
  g.name = 'mobilier';
  const cream = mat(0xd9d5cb, 0.92);
  const wood = mat(0x9a7a55, 0.7);
  const rug = mat(0xb0a89b, 0.95);
  const leaf = mat(0x55703f, 0.85);
  const pot = mat(0xa8916f, 0.8);

  // Tapis
  const r = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), rug);
  r.rotation.x = -Math.PI / 2;
  r.position.set(3.9, 0.006, 3.5);
  r.receiveShadow = true;
  g.add(r);

  // Canapé d'angle : assise + dossiers
  const sofa = new THREE.Group();
  const seat = box(3.3, 0.42, 1.0, cream);
  seat.position.set(0, 0.34, 0);
  const backA = box(3.3, 0.55, 0.28, cream);
  backA.position.set(0, 0.68, -0.36);
  const armL = box(0.26, 0.30, 1.0, cream);
  armL.position.set(-1.52, 0.62, 0);
  const armR = armL.clone();
  armR.position.x = 1.52;
  sofa.add(seat, backA, armL, armR);
  const wing = box(1.05, 0.42, 0.95, cream);
  wing.position.set(-1.62, 0.34, 0.97);
  const wingBack = box(0.26, 0.55, 0.95, cream);
  wingBack.position.set(-2.02, 0.68, 0.97);
  sofa.add(wing, wingBack);
  sofa.position.set(3.6, 0, 4.5);
  sofa.rotation.y = Math.PI;
  g.add(sofa);

  // Tables basses
  const t1 = box(1.15, 0.06, 0.72, wood);
  t1.position.set(4.15, 0.42, 3.15);
  g.add(t1);
  const t2 = box(0.72, 0.06, 0.62, wood);
  t2.position.set(5.05, 0.35, 3.62);
  g.add(t2);
  for (const [tx, tz, ty] of [[3.72, 2.92, 0.42], [4.58, 2.92, 0.42], [4.15, 3.42, 0.42],
                              [4.78, 3.42, 0.35], [5.32, 3.42, 0.35], [5.05, 3.86, 0.35]]) {
    const leg = box(0.035, ty, 0.035, wood);
    leg.position.set(tx, ty / 2, tz);
    g.add(leg);
  }

  // Fauteuil à bascule
  const chair = new THREE.Group();
  const cseat = box(0.72, 0.22, 0.72, cream);
  cseat.position.set(0, 0.42, 0);
  chair.add(cseat);
  const cb = box(0.72, 0.62, 0.18, cream);
  cb.position.set(0, 0.78, -0.30);
  cb.rotation.x = -0.18;
  chair.add(cb);
  chair.position.set(6.55, 0, 3.6);
  chair.rotation.y = -0.55;
  g.add(chair);

  // Plantes
  for (const [x, z, s2] of [[7.7, 2.5, 1.15], [7.5, 4.4, 0.9]]) {
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 16), pot);
    p2.position.set(x, 0.17, z);
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46 * s2, 1), leaf);
    foliage.position.set(x, 0.34 + 0.46 * s2, z);
    p2.castShadow = foliage.castShadow = true;
    g.add(p2, foliage);
  }

  // Suspensions en rotin
  const rat = new THREE.MeshStandardMaterial({
    color: 0xb08a5e, roughness: 0.92, side: THREE.DoubleSide, transparent: true, opacity: 0.72,
  });
  for (const [x, z, h, s3] of [[1.9, 2.6, 3.1, 0.55], [3.5, 2.2, 3.5, 0.48], [5.9, 2.4, 2.6, 0.44]]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(s3, 0.20, 24, 1, true), rat);
    shade.position.set(x, h, z);
    const cord = box(0.006, 1.2, 0.006, rat);
    cord.position.set(x, h + 0.6, z);
    // Un fil de 6 mm ne projette rien de lisible, juste un trait parasite.
    cord.castShadow = false;
    g.add(shade, cord);
  }

  return g;
}

export function buildRoom(scene) {
  const room = new THREE.Group();
  room.name = 'salon';
  room.add(buildWall());
  buildEnvelope(room);
  buildFixtures(room);
  const furniture = buildFurniture();
  room.add(furniture);
  room.userData.furniture = furniture;
  room.userData.art = room.getObjectByName('tableaux-existants');
  scene.add(room);
  return room;
}

/** Repères des montants placo (entraxe 600 mm), masquables. */
export function buildStudGuides() {
  const g = new THREE.Group();
  g.name = 'montants';
  const m = new THREE.LineBasicMaterial({ color: 0x6fd3c4, transparent: true, opacity: 0.5 });
  for (const x of studPositions()) {
    const top = ceilingAt(x);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.02, 0.004), new THREE.Vector3(x, top - 0.02, 0.004),
    ]);
    g.add(new THREE.Line(geo, m));
  }
  g.visible = false;
  return g;
}
