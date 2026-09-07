/**
 * Géométrie relevée du salon.
 * Toutes les mesures sont en MÈTRES, déduites de l'élévation cotée de maman
 * (captures/échelles-et-tests.png) recalée sur les cotes SketchUp
 * (captures/dimensions-salon.png). Échelle établie : 4.7519 mm/px.
 *
 * Repère : x = 0 au coin gauche du mur rouge, x croît vers la droite.
 *          y = 0 au sol, y croît vers le haut.
 *          z = 0 sur la face du mur, z croît vers l'intérieur du salon.
 */

export const WALL = {
  width: 8.14,          // cote SketchUp 8140 mm
  hLeft: 3.95,          // hauteur au coin gauche
  hRight: 2.98,         // hauteur au coin droit
  apexX: 2.69,          // abscisse du faîtage
  apexH: 4.85,          // hauteur au faîtage
  thickness: 0.2,
};

/** Hauteur du plafond rampant à l'abscisse x. */
export function ceilingAt(x) {
  const { width, hLeft, hRight, apexX, apexH } = WALL;
  if (x <= apexX) return hLeft + ((apexH - hLeft) * x) / apexX;
  return apexH + ((hRight - apexH) * (x - apexX)) / (width - apexX);
}

/** Contour du mur (pentagon), sens horaire depuis le bas gauche. */
export const WALL_OUTLINE = [
  [0, 0],
  [0, WALL.hLeft],
  [WALL.apexX, WALL.apexH],
  [WALL.width, WALL.hRight],
  [WALL.width, 0],
];

/**
 * Volumes existants. `blocks` = zone où l'on ne peut pas poser d'étagère.
 * x0/x1 = emprise horizontale, y0/y1 = emprise verticale, d = profondeur.
 */
export const FIXTURES = [
  { id: 'porte',      label: 'Porte',              x0: 0.05,  x1: 1.08,  y0: 0,    y1: 2.10,  d: 0.06, kind: 'door',    blocks: true },
  { id: 'meuble-bas', label: 'Meuble bas 3000×700', x0: 1.08,  x1: 4.08,  y0: 0,    y1: 0.70,  d: 0.45, kind: 'wood',    blocks: false },
  { id: 'foyer-socle',label: 'Socle cheminée',      x0: 4.495, x1: 5.745, y0: 0,    y1: 0.50,  d: 0.42, kind: 'white',   blocks: true },
  { id: 'foyer',      label: 'Foyer',               x0: 4.60,  x1: 5.50,  y0: 0.50, y1: 1.39,  d: 0.38, kind: 'firebox', blocks: true },
  { id: 'linteau',    label: 'Linteau bois',        x0: 4.55,  x1: 5.57,  y0: 1.39, y1: 1.45,  d: 0.44, kind: 'wood',    blocks: true },
  { id: 'hotte',      label: 'Hotte 1230',          x0: 4.505, x1: 5.735, y0: 1.45, y1: 2.01,  d: 0.50, kind: 'white',   blocks: true },
  { id: 'conduit',    label: 'Conduit',             x0: 4.776, x1: 5.446, y0: 2.01, y1: null,  d: 0.35, kind: 'white',   blocks: true },
  { id: 'buches',     label: 'Range-bûches 640×700',x0: 5.76,  x1: 6.40,  y0: 0,    y1: 0.70,  d: 0.45, kind: 'wood',    blocks: false },
  { id: 'vitrine',    label: 'Vitrine 1464×2268',   x0: 6.61,  x1: 8.074, y0: 0,    y1: 2.268, d: 0.50, kind: 'cabinet', blocks: true },
];

/** Meubles offrant un plateau où poser des objets : [id, hauteur, profondeur]. */
export const SUPPORT_TOPS = ['meuble-bas', 'buches', 'foyer-socle', 'vitrine'];

/** Tableaux déjà en place sur le mur (repris de l'élévation). */
export const EXISTING_ART = [
  { id: 'art-graine',  label: 'Tableau graine',  w: 0.95, h: 1.22, cx: 3.62, cy: 1.86 },
  { id: 'art-danse',   label: 'Tableau danse',   w: 1.20, h: 0.90, cx: 6.30, cy: 2.95 },
];

/**
 * Contrainte de pose (slide « Nos contraintes ») : fixations invisibles
 * vissées dans les rails du placo, entraxe 600 mm, d'où une longueur minimale
 * de 700 mm pour attraper deux montants.
 *
 * ATTENTION : l'entraxe vient de la note de maman, mais la position du premier
 * montant n'a été relevée par personne — 30 cm n'est qu'une valeur de départ.
 * Elle se règle dans le panneau, une fois les montants repérés sur place.
 */
export const STUDS = { spacing: 0.60, offset: 0.30 };
export const MIN_SHELF_WIDTH = 0.70;

/** Abscisses des montants placo sur toute la largeur du mur. */
export function studPositions(offset = STUDS.offset, spacing = STUDS.spacing) {
  const step = Math.max(spacing, 0.15);
  const out = [];
  for (let x = ((offset % step) + step) % step; x < WALL.width; x += step) out.push(+x.toFixed(3));
  return out;
}

/**
 * Points d'aimantation horizontaux : les montants eux-mêmes et les milieux
 * d'entraxe. Centrer une planche de 120 sur un montant lui met les deux
 * extrémités pile sur deux montants, ce qui ne laisse pas de matière pour
 * fixer ; le milieu d'entraxe donne au contraire deux appuis bien intérieurs.
 */
export function snapPositions(offset = STUDS.offset, spacing = STUDS.spacing) {
  const out = [];
  for (const s of studPositions(offset, spacing)) {
    out.push(s, +(s + spacing / 2).toFixed(3));
  }
  return out.filter((x) => x > 0 && x < WALL.width).sort((a, b) => a - b);
}

/** Vues caméra prédéfinies : [position, cible]. */
export const VIEWS = {
  face:    { pos: [4.07, 2.05, 8.60], target: [4.07, 2.05, 0] },
  large:   { pos: [4.07, 2.60, 11.50], target: [4.07, 2.20, 0] },
  gauche:  { pos: [0.30, 1.75, 7.20], target: [3.30, 2.00, 0] },
  droite:  { pos: [7.90, 1.75, 7.20], target: [4.90, 2.00, 0] },
  rasante: { pos: [8.30, 1.60, 2.40], target: [1.40, 1.90, 0] },
};

export const COLORS = {
  wall:    0x6d3324,   // terracotta relevé sur les photos
  side:    0xd8d2c8,
  ceiling: 0xe4e0d8,
  floor:   0x8e8880,
  beam:    0xeceae4,
  white:   0xe6e3dc,
};
