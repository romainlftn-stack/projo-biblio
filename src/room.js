import * as THREE from 'three';
import { WALL, WALL_OUTLINE, FIXTURES, COLORS, ceilingAt } from './config.js';
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

/**
 * Vitrine : une carcasse ouverte plutôt qu'un bloc plein, pour qu'on voie
 * qu'elle est garnie. Bas fermé, trois tablettes d'objets, montant central
 * et deux battants vitrés.
 */
function buildVitrine(f, y1) {
  const g = new THREE.Group();
  g.name = 'fixture:' + f.id;
  const bois = mat(0x7a5a3c, 0.62);
  const fond = mat(0x5d442c, 0.8);
  const w = f.x1 - f.x0;
  const cx = (f.x0 + f.x1) / 2;
  const put = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };

  put(box(w, y1, 0.04, fond), cx, y1 / 2, 0.02);                    // fond
  put(box(0.05, y1, f.d, bois), f.x0 + 0.025, y1 / 2, f.d / 2);      // joue gauche
  put(box(0.05, y1, f.d, bois), f.x1 - 0.025, y1 / 2, f.d / 2);      // joue droite
  put(box(w, 0.07, f.d, bois), cx, y1 - 0.035, f.d / 2);             // dessus
  put(box(w, 0.55, f.d, bois), cx, 0.275, f.d / 2);                  // bas fermé
  put(box(0.05, y1 - 0.55, 0.05, bois), cx, 0.55 + (y1 - 0.55) / 2, f.d - 0.03);  // montant central

  // Tablettes et leur garniture
  const objets = mat(0xcfc3ae, 0.85);
  const livres = mat(0x8a6f5c, 0.8);
  const verre = mat(0xb7c2bd, 0.35);
  for (const [ty, contenu] of [
    [0.95, [[-0.46, 0.22, 0.16, livres], [-0.10, 0.15, 0.13, objets], [0.34, 0.26, 0.11, verre]]],
    [1.38, [[-0.38, 0.17, 0.12, objets], [0.02, 0.24, 0.15, livres], [0.44, 0.19, 0.13, objets]]],
    [1.80, [[-0.30, 0.20, 0.14, verre], [0.20, 0.16, 0.18, livres]]],
  ]) {
    put(box(w - 0.12, 0.03, f.d - 0.10, bois), cx, ty, f.d / 2);
    for (const [dx, h, bw, material] of contenu) {
      put(box(bw, h, 0.13, material), cx + dx, ty + 0.015 + h / 2, f.d * 0.45);
    }
  }

  // Battants vitrés, de part et d'autre du montant
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fb0ab, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.28,
  });
  const bw = (w - 0.16) / 2;
  for (const dir of [-1, 1]) {
    const p = box(bw, y1 - 0.62, 0.012, glass);
    p.castShadow = false;
    put(p, cx + dir * (bw / 2 + 0.035), 0.55 + (y1 - 0.62) / 2, f.d - 0.008);
  }
  return g;
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
    if (f.id === 'vitrine') {
      group.add(buildVitrine(f, y1));
      continue;
    }

    const m = placeBox(f.x0, f.x1, f.y0, y1, f.d, mats[f.kind] || mats.wood);
    m.name = 'fixture:' + f.id;
    group.add(m);
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

}

/** Table basse ovale : un cylindre aplati sur trois pieds fuyants. */
function ovalTable(cx, cz, rx, rz, h, wood) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 36), wood);
  top.scale.set(rx, 1, rz);
  top.position.set(0, h, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, h, 8), wood);
    leg.position.set(Math.cos(a) * rx * 0.66, h / 2, Math.sin(a) * rz * 0.66);
    leg.rotation.z = -Math.cos(a) * 0.09;
    leg.rotation.x = Math.sin(a) * 0.09;
    leg.castShadow = true;
    g.add(leg);
  }
  g.position.set(cx, 0, cz);
  return g;
}

/** Fauteuil : assise, dossier incliné, accoudoirs. Le dos est côté -z. */
function armchair(cream, wood) {
  const g = new THREE.Group();
  const seat = box(0.78, 0.20, 0.74, cream);
  seat.position.set(0, 0.40, 0);
  const back = box(0.78, 0.62, 0.16, cream);
  back.position.set(0, 0.78, -0.32);
  // Rotation X positive = le haut du dossier bascule vers +z, donc vers
  // l'assise : il penchait en avant. Négative, il s'incline en arrière.
  back.rotation.x = -0.15;
  const armL = box(0.10, 0.16, 0.68, wood);
  armL.position.set(-0.40, 0.58, 0.02);
  const armR = armL.clone();
  armR.position.x = 0.40;
  g.add(seat, back, armL, armR);
  for (const [lx, lz] of [[-0.34, 0.30], [0.34, 0.30], [-0.34, -0.28], [0.34, -0.28]]) {
    const leg = box(0.05, 0.32, 0.05, wood);
    leg.position.set(lx, 0.16, lz);
    g.add(leg);
  }
  return g;
}

/** Mobilier du salon : canapé d'angle, tables ovales, fauteuil, tapis, plantes. */
function buildFurniture() {
  const g = new THREE.Group();
  g.name = 'mobilier';
  const cream = mat(0xd9d5cb, 0.92);
  const wood = mat(0x9a7a55, 0.7);
  const rug = mat(0xa39684, 0.96);
  const pot = mat(0xa8916f, 0.8);

  // Tapis : x 2.30 → 5.90, z 2.25 → 4.85
  const r = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), rug);
  r.rotation.x = -Math.PI / 2;
  r.position.set(4.1, 0.006, 3.55);
  r.receiveShadow = true;
  g.add(r);

  /*
   * Canapé d'angle en L : la grande longueur borde le tapis côté salon, et
   * le retour remonte le long du bord gauche jusqu'à l'avant du tapis, vers
   * le mur rouge.
   */
  const sofa = new THREE.Group();
  const piece = (w, h, d, x, y, z) => {
    const m = box(w, h, d, cream);
    m.position.set(x, y, z);
    sofa.add(m);
    return m;
  };
  piece(3.60, 0.42, 1.00, 4.10, 0.21, 4.85);   // assise, grande longueur
  piece(3.60, 0.56, 0.26, 4.10, 0.70, 5.22);   // dossier
  piece(3.30, 0.16, 0.86, 4.25, 0.50, 4.78);   // coussins
  piece(0.26, 0.32, 1.00, 5.77, 0.58, 4.85);   // accoudoir droit
  piece(1.05, 0.42, 1.90, 2.82, 0.21, 3.45);   // retour du L
  piece(0.26, 0.56, 1.90, 2.43, 0.70, 3.45);   // dossier du retour
  piece(0.92, 0.16, 1.70, 2.88, 0.50, 3.45);   // coussins du retour
  piece(1.05, 0.30, 0.24, 2.82, 0.57, 2.62);   // accoudoir bas, côté mur
  g.add(sofa);

  // Deux tables ovales devant le canapé
  g.add(ovalTable(4.45, 3.55, 0.58, 0.38, 0.40, wood));
  g.add(ovalTable(5.28, 4.10, 0.38, 0.30, 0.33, wood));

  // Fauteuil en diagonale, côté avant droit du tapis
  const chair = armchair(cream, wood);
  chair.position.set(5.55, 0, 2.85);
  chair.rotation.y = -2.5 + Math.PI / 2;   // quart de tour vers la gauche
  g.add(chair);

  // Trois plantes devant la baie
  for (const [x, z, s2] of [[7.72, 2.30, 1.15], [7.48, 4.25, 0.9], [7.86, 5.70, 1.0]]) {
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 16), pot);
    p2.position.set(x, 0.17, z);
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46 * s2, 1),
      mat(0x55703f, 0.85));
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

/**
 * Baie vitrée du mur de droite. Volontairement sans paysage derrière : une
 * surface claire et non éclairée suffit à lire « lumière du dehors ».
 */
function buildBay() {
  const g = new THREE.Group();
  g.name = 'baie';
  const x = WALL.width - 0.02;
  const z0 = 1.7;
  const z1 = 6.0;
  const y0 = 0.22;
  const y1 = 2.70;

  const jour = new THREE.Mesh(
    new THREE.PlaneGeometry(z1 - z0, y1 - y0),
    new THREE.MeshBasicMaterial({ color: 0xeef2f2 })
  );
  jour.rotation.y = -Math.PI / 2;
  jour.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
  g.add(jour);

  const cadre = mat(0x4a453f, 0.7);
  const bar = (h, d, y, z) => {
    const m = box(0.06, h, d, cadre);
    m.position.set(x - 0.03, y, z);
    g.add(m);
  };
  bar(0.07, z1 - z0, y0, (z0 + z1) / 2);
  bar(0.07, z1 - z0, y1, (z0 + z1) / 2);
  for (const z of [z0, (z0 + z1) / 2, z1]) bar(y1 - y0, 0.07, (y0 + y1) / 2, z);
  return g;
}

export function buildRoom(scene) {
  const room = new THREE.Group();
  room.name = 'salon';
  room.add(buildWall());
  buildEnvelope(room);
  buildFixtures(room);
  const furniture = buildFurniture();
  furniture.add(buildBay());
  room.add(furniture);
  room.userData.furniture = furniture;
  scene.add(room);
  return room;
}

/** Repères des montants placo, reconstruits quand la trame est recalée. */
export function buildStudGuides() {
  const g = new THREE.Group();
  g.name = 'montants';
  g.visible = false;
  return g;
}

export function updateStudGuides(g, positions) {
  for (const child of [...g.children]) {
    child.geometry?.dispose();
    g.remove(child);
  }
  const m = new THREE.LineBasicMaterial({ color: 0x6fd3c4, transparent: true, opacity: 0.5 });
  for (const x of positions) {
    const top = ceilingAt(x);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.02, 0.004), new THREE.Vector3(x, top - 0.02, 0.004),
    ]);
    g.add(new THREE.Line(geo, m));
  }
}
