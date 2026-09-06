/** Mode d'emploi : s'ouvre à la première visite, puis via le bouton « ? ». */
import { markTourSeen, tourSeen } from './store.js';

const STEPS = [
  {
    t: 'Se déplacer dans le salon',
    d: 'Quatre gestes, et rien d’autre à retenir :',
    list: [
      ['Pivoter autour du mur', 'un doigt sur le trackpad, ou clic gauche maintenu, et on fait glisser.'],
      ['Avancer / reculer', 'deux doigts qui glissent vers le haut ou vers le bas, ou la molette.'],
      ['Se décaler sans pivoter', 'maintenir ⌘ et faire glisser. Le clic droit maintenu fait la même chose.'],
      ['Revenir à une vue nette', 'les cinq boutons en haut (Face, Large, ¾ gauche, ¾ droite, Rasante).'],
    ],
  },
  {
    t: 'Poser une planche',
    d: 'Dans l’onglet Étagères, cliquez une taille pour la poser au centre de la vue, ou faites-la glisser directement à l’endroit voulu sur le mur.',
  },
  {
    t: 'Déplacer et redimensionner',
    d: 'Faites glisser une planche pour la déplacer. Sélectionnée, elle s’entoure de flèches qui pointent dans le sens où on peut les tirer :',
    list: [
      ['Flèches jaunes des deux bouts', 'allongent ou raccourcissent la planche.'],
      ['Flèche turquoise devant', 'tire ou pousse la profondeur.'],
      ['Flèche jaune du dessus', 'sur un cadre ou un objet, règle la hauteur.'],
      ['Champs du panneau', 'donnent la taille exacte au centimètre, et la hauteur depuis le sol.'],
    ],
  },
  {
    t: 'Meubler les étagères',
    d: 'Les onglets Cadres et Objets contiennent les formats classiques et des objets de déco à l’échelle. Un objet lâché juste au-dessus d’une planche s’y pose tout seul.',
  },
  {
    t: 'Vérifier la faisabilité',
    d: 'Les fixations invisibles se vissent dans les montants placo, d’où une planche de 70 cm minimum. L’outil prévient si une planche est trop courte, déborde du rampant ou bute sur la porte, la cheminée ou la vitrine. Pour les montants, il distingue deux cas :',
    list: [
      ['Au-delà de 127 cm', 'la planche attrape forcément deux montants, où que tombe la trame. Rien à vérifier.'],
      ['En dessous', 'cela dépend d’où commence la trame — que personne n’a relevée. L’outil le dit, et vous pouvez saisir la position du premier montant dans le panneau une fois repérée sur place.'],
    ],
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
    if (s.list) {
      const ul = document.createElement('ul');
      ul.className = 'tour-gestes';
      for (const [nom, texte] of s.list) {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = nom;
        li.append(b, document.createTextNode(' — ' + texte));
        ul.append(li);
      }
      body.append(ul);
    }
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
