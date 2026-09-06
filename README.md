# Projo Biblio

Outil de projection 3D pour dessiner la bibliothèque du mur rouge du salon :
poser des planches, les redimensionner, les meubler d'objets à l'échelle, et
vérifier au passage que la pose est réalisable.

→ **[Ouvrir l'outil](https://projo-biblio.vercel.app)**

## Le relevé

Le salon est reconstruit à ses vraies dimensions. L'échelle vient de
l'élévation cotée (`captures/échelles-et-tests.png`), recalée sur les cotes
SketchUp (`captures/dimensions-salon.png`) : **4,7519 mm par pixel**.

| Élément | Mesure retenue | Recoupement |
|---|---|---|
| Largeur du mur rouge | 8 140 mm | cote SketchUp |
| Hauteur au coin gauche | 3 950 mm | relevé |
| Hauteur au faîtage (à 2 690 mm du coin gauche) | 4 850 mm | relevé |
| Hauteur au coin droit | 2 980 mm | relevé |
| Porte (à gauche) | 1 000 × 2 100 mm | cote SketchUp « 1000 » |
| Meuble bas | 3 000 × 700 mm | contrainte écrite |
| Hotte de cheminée | 1 230 mm de large | cote portée sur l'élévation |
| Socle de cheminée | 500 mm de haut | cote SketchUp « 500 » |
| Bas du conduit | 2 010 mm | cote SketchUp « 2000.2 » |
| Range-bûches | 640 × 700 mm | contrainte écrite |
| Vitrine | 1 464 × 2 268 mm | cotes SketchUp |

Les trois dernières colonnes se recoupent à moins de 1,5 % près, ce qui valide
l'échelle.

## Les contraintes de pose

Reprises de la slide « Nos contraintes » :

- Fixations invisibles vissées dans les **montants placo, entraxe 600 mm**.
- D'où une **longueur minimale de 700 mm** par planche.
- L'outil signale en rouge toute planche qui passe sous 70 cm, qui ne couvre
  pas deux montants exploitables, qui déborde du rampant, ou qui bute sur la
  porte, la cheminée ou la vitrine.

### Ce que l'outil sait, et ce qu'il suppose

L'entraxe de 600 mm est une donnée sûre : il vient de la note de maman. La
position du premier montant, elle, n'a été relevée par personne. Le contrôle
sépare donc les deux :

- **Au-delà de 1 270 mm de long**, une planche couvre deux
  montants *quelle que soit* la position de la trame — c'est une conséquence de
  l'entraxe seul. L'outil ne dit rien, il n'y a rien à vérifier.
  (Le seuil vaut 2 × entraxe + 60 mm de marge de fixation.)
- **En dessous**, le résultat dépend du calage. L'outil annonce alors
  explicitement qu'il s'appuie sur une trame supposée, et rappelle la longueur
  à partir de laquelle le doute disparaît.

Le champ « 1ᵉʳ montant » du panneau permet de recaler la trame une fois les
montants repérés sur place (détecteur, ou aimant passé sur les vis). Le réglage
est enregistré avec le projet.

L'aimantation propose les montants **et les milieux d'entraxe** : centrer une
planche de 120 cm pile sur un montant lui met les deux bouts sur les deux
montants suivants, sans matière pour fixer. Le milieu d'entraxe donne au
contraire deux appuis bien intérieurs.

## Les tailles d'étagères

| Nom | Longueur | Profondeur | Épaisseur |
|---|---|---|---|
| Mini | 70 cm | 20 cm | 4 cm |
| Petite | 90 cm | 22 cm | 4 cm |
| Courante | 120 cm | 25 cm | 4 cm |
| Moyenne | 150 cm | 25 cm | 4 cm |
| Grande | 180 cm | 28 cm | 4,5 cm |
| XL | 210 cm | 30 cm | 4,5 cm |
| XXL | 240 cm | 30 cm | 5 cm |
| Traverse | 300 cm | 25 cm | 5 cm |

Toutes se redimensionnent librement, à la poignée ou au centimètre près dans
le panneau. Sept teintes de bois sont proposées.

Les cadres reprennent les six formats testés sur la slide (20 × 30, 30 × 20,
30 × 30, 60 × 40, 80 × 60, 60 × 80), complétés des formats courants et du grand
tableau existant (95 × 122).

## Utilisation

- **Naviguer** : clic gauche pour pivoter, clic droit pour translater, molette
  pour avancer. Cinq vues de référence en haut, plus un mode plein écran
  navigation seule (bouton ⤢).
- **Poser** : cliquer une taille dans le panneau, ou la glisser sur le mur.
- **Redimensionner** : les pastilles jaunes aux extrémités changent la
  longueur, celle de devant la profondeur. `Maj` conserve les proportions,
  `Alt` ignore les aimants.
- **Meubler** : un objet lâché au-dessus d'une planche s'y pose tout seul.
- **Enregistrer** : bouton *Enregistrer* → fichier `.json`. Pour reprendre,
  glisser ce fichier sur la zone en bas du panneau. Le travail en cours est
  aussi gardé automatiquement dans le navigateur.
- **Raccourcis** : `Cmd+Z` / `Cmd+Maj+Z`, `Cmd+S`, `D` pour dupliquer,
  `Suppr` pour supprimer, `Échap` pour désélectionner.

`exemples/proposition-de-depart.json` contient une première proposition
(8 planches, 10,60 m linéaires) à charger pour démarrer.

## Technique

Page statique, sans étape de build : `three.js` 0.168 chargé en ES modules
depuis jsDelivr via un import map.

```
index.html          structure et panneau
css/style.css       interface
src/config.js       géométrie relevée du salon
src/catalog.js      banques d'étagères, cadres et objets
src/room.js         construction du salon en 3D
src/items.js        maillages des planches et objets
src/interaction.js  sélection, déplacement, poignées, aimantation, contrôles
src/labels.js       cotes et contour de sélection
src/store.js        état, historique, sauvegarde et chargement
src/ui.js           panneau de gauche
src/tour.js         mode d'emploi
src/main.js         scène, rendu, raccourcis
```

Pour travailler en local, servir le dossier en HTTP (les modules ES ne se
chargent pas en `file://`) :

```bash
python3 -m http.server 4321
```
