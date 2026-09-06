/** Mode d'emploi : s'ouvre à la première visite, puis via le bouton « ? ». */
import { markTourSeen, tourSeen } from './store.js';

const STEPS = [
  {
    t: 'Se déplacer dans le salon',
    d: 'Clic gauche maintenu pour pivoter autour du mur, clic droit pour translater, molette pour avancer ou reculer. Les cinq boutons en haut ramènent à une vue de référence.',
  },
  {
    t: 'Poser une planche',
    d: 'Dans l’onglet Étagères, cliquez une taille pour la poser au centre de la vue, ou faites-la glisser directement à l’endroit voulu sur le mur.',
  },
  {
    t: 'Déplacer et redimensionner',
    d: 'Faites glisser une planche pour la déplacer. Une fois sélectionnée, tirez les billes jaunes des extrémités pour changer la longueur, et le cône turquoise de devant pour tirer ou pousser la profondeur. Les champs du panneau donnent la taille exacte au centimètre.',
  },
  {
    t: 'Meubler les étagères',
    d: 'Les onglets Cadres et Objets contiennent les formats classiques et des objets de déco à l’échelle. Un objet lâché juste au-dessus d’une planche s’y pose tout seul.',
  },
  {
    t: 'Vérifier la faisabilité',
    d: 'Les fixations invisibles se vissent dans les montants placo (entraxe 60 cm), d’où une planche de 70 cm minimum. L’outil prévient si une planche est trop courte, tombe mal ou bute sur la cheminée.',
  },
  {
    t: 'Enregistrer et reprendre',
    d: 'Le bouton Enregistrer télécharge un fichier .json. Pour reprendre plus tard, glissez ce fichier sur la zone en bas du panneau. Votre travail en cours est aussi gardé automatiquement dans ce navigateur.',
  },
];

export function initTour() {
  const root = document.getElementById('tour');

  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Mode d’emploi');

  const h = document.createElement('h2');
  h.textContent = 'Projeter la bibliothèque du salon';
  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'Le mur rouge est reconstruit à ses vraies dimensions (8,14 m de large, 4,85 m au faîtage). Tout ce que vous posez est à l’échelle.';
  card.append(h, sub);

  const ol = document.createElement('ol');
  ol.className = 'tour-steps';
  STEPS.forEach((s, i) => {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'tour-num';
    num.textContent = String(i + 1);
    const body = document.createElement('div');
    const t = document.createElement('h3');
    t.textContent = s.t;
    const d = document.createElement('p');
    d.textContent = s.d;
    body.append(t, d);
    li.append(num, body);
    ol.append(li);
  });
  card.append(ol);

  const foot = document.createElement('div');
  foot.className = 'tour-foot';
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = 'Ce mode d’emploi reste accessible par le « ? » en haut du panneau.';
  const ok = document.createElement('button');
  ok.className = 'btn btn-primary';
  ok.textContent = 'C’est parti';
  foot.append(hint, ok);
  card.append(foot);
  root.append(card);

  const close = () => { root.hidden = true; markTourSeen(); };
  ok.addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) close(); });

  const open = () => { root.hidden = false; ok.focus(); };
  document.getElementById('btn-help').addEventListener('click', open);

  if (!tourSeen()) open();
  return { open, close };
}
