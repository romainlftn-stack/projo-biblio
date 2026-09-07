/**
 * Banques d'étagères et d'objets. Dimensions en MÈTRES.
 * Les longueurs d'étagères respectent la contrainte de pose :
 * 700 mm minimum, puis pas de 600 mm (entraxe des montants placo).
 */

export const WOODS = [
  { id: 'chene-dore',   label: 'Chêne doré',    color: 0xb98a52, rough: 0.62 },
  { id: 'chene-clair',  label: 'Chêne clair',   color: 0xd4b48a, rough: 0.66 },
  { id: 'chene-nature', label: 'Chêne naturel', color: 0xa87c4e, rough: 0.60 },
  { id: 'noyer',        label: 'Noyer',         color: 0x6b4526, rough: 0.52 },
  { id: 'frene-fume',   label: 'Frêne fumé',    color: 0x8a6a4d, rough: 0.58 },
  { id: 'noir',         label: 'Noir mat',      color: 0x2a2724, rough: 0.78 },
  { id: 'blanc',        label: 'Blanc mat',     color: 0xeceae4, rough: 0.80 },
];

export const DEFAULT_WOOD = 'chene-dore';

/** Étagères : planches simples. w = longueur, d = profondeur, t = épaisseur. */
export const SHELVES = [
  { id: 's700',  label: 'Mini',     w: 0.70, d: 0.20, t: 0.04, note: 'longueur mini' },
  { id: 's900',  label: 'Petite',   w: 0.90, d: 0.22, t: 0.04 },
  { id: 's1200', label: 'Courante', w: 1.20, d: 0.25, t: 0.04 },
  { id: 's1500', label: 'Moyenne',  w: 1.50, d: 0.25, t: 0.04 },
  { id: 's1800', label: 'Grande',   w: 1.80, d: 0.28, t: 0.045 },
  { id: 's2100', label: 'XL',       w: 2.10, d: 0.30, t: 0.045 },
  { id: 's2400', label: 'XXL',      w: 2.40, d: 0.30, t: 0.05 },
  { id: 's3000', label: 'Traverse', w: 3.00, d: 0.25, t: 0.05, note: 'grande traverse' },
];

/** Cadres et tableaux. Les 6 premiers sont les formats testés par maman. */
export const FRAMES = [
  { id: 'f200x300',  label: '20 × 30',   w: 0.20, h: 0.30, test: true, art: 'cercles' },
  { id: 'f300x200',  label: '30 × 20',   w: 0.30, h: 0.20, test: true, art: 'horizon' },
  { id: 'f300x300',  label: '30 × 30',   w: 0.30, h: 0.30, test: true, art: 'lune' },
  { id: 'f600x400',  label: '60 × 40',   w: 0.60, h: 0.40, test: true, art: 'vague' },
  { id: 'f800x600',  label: '80 × 60',   w: 0.80, h: 0.60, test: true, art: 'horizon' },
  { id: 'f600x800',  label: '60 × 80',   w: 0.60, h: 0.80, test: true, art: 'galet' },
  { id: 'f400x400',  label: '40 × 40',   w: 0.40, h: 0.40, art: 'cercles' },
  { id: 'f400x600',  label: '40 × 60',   w: 0.40, h: 0.60, art: 'arche' },
  { id: 'f500x700',  label: '50 × 70',   w: 0.50, h: 0.70, art: 'feuille' },
  { id: 'f700x500',  label: '70 × 50',   w: 0.70, h: 0.50, art: 'vague' },
  { id: 'f1000x700', label: '100 × 70',  w: 1.00, h: 0.70, art: 'colonnes' },
  { id: 'f600x800b', label: '60 × 80 b', w: 0.60, h: 0.80, art: 'colonnes' },
  { id: 'f-graine',  label: 'Tableau graine', w: 0.95, h: 1.22, art: 'graine', note: 'déjà au mur' },
  { id: 'f-danse',   label: 'Tableau danse',  w: 1.20, h: 0.90, art: 'danse',  note: 'déjà au mur' },
];

/**
 * Objets de déco. w = largeur, h = hauteur, d = profondeur.
 * `shape` pilote le maillage généré dans items.js.
 */
export const OBJECTS = [
  { id: 'vase-haut',   label: 'Vase haut',        w: 0.14, h: 0.30, d: 0.14, shape: 'vase',    color: 0xd8cdbc },
  { id: 'vase-boule',  label: 'Vase boule',       w: 0.18, h: 0.18, d: 0.18, shape: 'sphere',  color: 0xc4b9a6 },
  { id: 'vase-long',   label: 'Vase élancé',      w: 0.11, h: 0.45, d: 0.11, shape: 'vase',    color: 0xb9a992 },
  { id: 'livres-pile', label: 'Pile de livres',   w: 0.22, h: 0.16, d: 0.15, shape: 'stack',   color: 0x8a6f5c },
  { id: 'livres-deb',  label: 'Livres debout',    w: 0.30, h: 0.22, d: 0.16, shape: 'books',   color: 0x7d5f4a },
  { id: 'appareil',    label: 'Appareil photo',   w: 0.14, h: 0.10, d: 0.08, shape: 'camera',  color: 0x3a3632 },
  { id: 'bol',         label: 'Coupe / bol',      w: 0.24, h: 0.09, d: 0.24, shape: 'bowl',    color: 0xcfc3ae },
  { id: 'bougeoir',    label: 'Bougeoir',         w: 0.09, h: 0.25, d: 0.09, shape: 'candle',  color: 0x9a8a72 },
  { id: 'statuette',   label: 'Statuette 30 cm',  w: 0.12, h: 0.30, d: 0.12, shape: 'statue',  color: 0xb5a892 },
  { id: 'boite',       label: 'Boîte',            w: 0.20, h: 0.13, d: 0.15, shape: 'box',     color: 0x9c8a6e },
  { id: 'plante-p',    label: 'Petite plante',    w: 0.24, h: 0.35, d: 0.24, shape: 'plant',   color: 0x5f7a4a },
  { id: 'plante-g',    label: 'Grande plante',    w: 0.36, h: 0.60, d: 0.36, shape: 'plant',   color: 0x55703f },
  { id: 'horloge',     label: 'Horloge',          w: 0.25, h: 0.25, d: 0.06, shape: 'clock',   color: 0xd8d2c6 },
  { id: 'cadre-photo', label: 'Cadre photo',      w: 0.13, h: 0.18, d: 0.03, shape: 'frame',   color: 0x8a7358 },
  { id: 'panier',      label: 'Panier',           w: 0.30, h: 0.22, d: 0.30, shape: 'basket',  color: 0xbd9a6a },
  { id: 'lanterne',    label: 'Lanterne',         w: 0.16, h: 0.40, d: 0.16, shape: 'lantern', color: 0x4a453f },
  { id: 'silhouette',  label: 'Silhouette 1 m 70',w: 0.45, h: 1.70, d: 0.25, shape: 'human',   color: 0x6f7d86, ref: true },
];

export const BANKS = { SHELVES, FRAMES, OBJECTS };
