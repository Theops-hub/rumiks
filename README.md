# Rumiks

Jeu de tuiles reprenant les règles du Rummikub, contre des joueurs virtuels dont la force suit
le niveau du joueur. Il s'ajoute à l'écran d'accueil d'un iPad et se joue **entièrement hors
ligne**.

**Jouer : <https://theops-hub.github.io/rumiks/>**

Tout le jeu tient dans [`web/`](web/) — aucune dépendance, aucune étape de construction. Voir
[web/README.md](web/README.md) pour l'installation sur iPad, le détail de l'interface et
l'organisation du code.

> Le nom « Rummikub » est une marque déposée de Lemada Light Industries. Les règles d'un jeu ne
> sont pas protégeables, mais le nom l'est : le jeu s'appelle donc *Rumiks*.

## Ce que le jeu implémente

**Matériel et mise en place.** 106 tuiles — les numéros 1 à 13 en quatre couleurs, chacun en
double, plus deux jokers. Quatorze tuiles par joueur, de 2 à 4 joueurs.

**Combinaisons.** Les suites (au moins trois numéros consécutifs d'une même couleur, sans
bouclage du 13 vers le 1) et les groupes (trois ou quatre fois le même numéro, couleurs toutes
différentes). Les jokers remplacent n'importe quelle tuile ; une combinaison doit contenir au
moins une tuile réelle.

**Pose initiale.** 30 points minimum en une seule fois, formés uniquement avec les tuiles de son
chevalet et sans joker. Une fois le seuil atteint, le tour se poursuit librement : le joueur peut
enchaîner d'autres poses et compléter la table dans la foulée.

**Manipulation de la table.** Une fois ouvert, un joueur découpe, fusionne et réarrange librement
ce qui est posé, à condition de descendre au moins une tuile de sa main et de laisser une table
entièrement valide en fin de tour.

**Jokers.** Deux jokers circulent, un rouge et un noir. Une combinaison qui contient un joker est
bloquée : on peut la compléter, mais pas en reprendre les tuiles. Le joker se récupère en posant,
depuis son chevalet — jamais une tuile prise sur la table —, la tuile qu'il représente : il
revient alors dans la main du joueur, avec l'obligation d'être rejoué avant la fin du tour. Plus
généralement, aucune autre tuile posée ne peut être reprise en main.

**Fin de manche et décompte.** Le premier joueur à vider son chevalet remporte la manche. Si la
pioche s'épuise et que plus personne ne peut jouer, c'est le chevalet le plus léger qui gagne.
Chaque perdant compte en négatif les points qui lui restent (30 pour un joker), le gagnant marque
la somme de ces pénalités. **Une partie se joue en trois manches**, scores cumulés : le
classement final tombe à la dernière.

## Expérience, niveau et joueurs virtuels

La difficulté n'est pas un choix mais une progression. À la fin de chaque partie, le joueur
gagne de l'expérience selon ce qu'il y a accompli :

| Source | Expérience |
|---|---|
| Chaque tuile posée pendant la partie | +1 XP |
| Chaque manche gagnée | +15 XP |
| Manche gagnée en criant Rummikub | +5 XP de plus |
| Position au classement final | 1ᵉʳ +50, 2ᵉ +25, 3ᵉ +10, 4ᵉ +5 |

L'expérience cumulée détermine le niveau, de 1 à 10 ; l'écart entre deux niveaux croît
(100 XP, puis 200, puis 300…), les premiers tombent donc vite et les derniers se méritent. La
force des adversaires suit ce niveau — elle ne repose pas sur un handicap artificiel mais sur
l'étendue des coups envisagés :

| Niveaux | Coups envisagés | Jokers | Recherche |
|---|---|---|---|
| 1 – 2 | Uniquement les combinaisons formées avec son seul chevalet | Dépensés sans compter | ≈ 2 000 – 3 000 nœuds |
| 3 – 6 | Complète en plus les combinaisons déjà posées | De mieux en mieux ménagés | ≈ 5 000 – 20 000 nœuds |
| 7 – 10 | Refond la table entière pour caser un maximum de tuiles | Préservés | ≈ 30 000 – 120 000 nœuds |

Entre deux paliers, les moyens de recherche du solveur croissent continûment. L'expérience est
enregistrée à part de la partie en cours : commencer une nouvelle partie ne remet rien à zéro,
et les progressions de l'ancienne version (un niveau sans expérience) sont converties sans
perte.

Le moteur de décision est un solveur de partitionnement (`web/js/solver.js`) : il raisonne sur
des compteurs de tuiles plutôt que sur des tuiles individuelles, explore en profondeur avec
mémoïsation, et maximise un score pondérant tuiles posées, points et consommation de jokers. Un
plafond de nœuds et une limite de temps garantissent que l'interface ne se fige jamais.

Un test fait s'affronter les niveaux et vérifie que la hiérarchie se traduit bien en tuiles
descendues.

## Tests

```
cd web
node --test tests/*.test.js
```

58 cas couvrent les combinaisons, la légalité d'un tour, le solveur, la progression
d'expérience, et des manches entières jouées par les joueurs virtuels en contrôlant chaque coup
et la conservation des 106 tuiles.

## Limites connues

- **Pas de vibration sur iPad.** Safari sur iOS n'implémente pas l'API Vibration ; le réglage est
  masqué là où il ne servirait à rien.
- Lorsqu'une position d'une suite peut être occupée par une tuile réelle, le solveur n'explore
  pas la variante consistant à lui préférer un joker. Avec deux jokers dans tout le jeu, le coup
  manqué est marginal.
- Quand plusieurs lectures d'une combinaison chargée en jokers sont possibles, c'est la plus
  avantageuse en points qui est retenue — ce que ferait un joueur déclarant ce que remplace son
  joker.
- Une seule partie est mémorisée à la fois : en commencer une nouvelle écrase la précédente.

## Historique

Une application Android en Kotlin et Jetpack Compose a précédé cette version, avant que la cible
ne devienne l'iPad. Elle a été retirée du dépôt ; son code reste consultable dans l'historique
(`git show 6ae9a2d:app/` ou `git checkout 6ae9a2d -- app/`).
