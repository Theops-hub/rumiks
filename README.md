# Rumiks

Jeu de tuiles reprenant les règles officielles du Rummikub, contre des joueurs virtuels de trois
niveaux. Il s'ajoute à l'écran d'accueil d'un iPad et se joue **entièrement hors ligne**.

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
chevalet. Tant qu'elle n'est pas faite, les combinaisons déjà sur la table sont intouchables.

**Manipulation de la table.** Une fois ouvert, un joueur découpe, fusionne et réarrange librement
ce qui est posé, à condition de descendre au moins une tuile de sa main et de laisser une table
entièrement valide en fin de tour.

**Jokers.** Un joker posé peut être récupéré en le remplaçant par la tuile qu'il représente, mais
il doit être rejoué dans le même tour : il ne retourne jamais sur un chevalet. Plus généralement,
aucune tuile posée ne peut être reprise en main.

**Fin de manche et décompte.** Le premier joueur à vider son chevalet remporte la manche. Si la
pioche s'épuise et que plus personne ne peut jouer, c'est le chevalet le plus léger qui gagne.
Chaque perdant compte en négatif les points qui lui restent (30 pour un joker), le gagnant marque
la somme de ces pénalités. Les scores se cumulent de manche en manche.

## Les joueurs virtuels

Les trois niveaux ne reposent pas sur un handicap artificiel mais sur l'étendue des coups
envisagés :

| Niveau | Coups envisagés | Jokers | Recherche |
|---|---|---|---|
| Facile | Uniquement les combinaisons formées avec son seul chevalet | Dépensés sans compter | 3 000 nœuds |
| Modérée | Complète en plus les combinaisons déjà posées | Ménagés | 30 000 nœuds |
| Difficile | Refond la table entière pour caser un maximum de tuiles | Préservés | 120 000 nœuds |

Le moteur de décision est un solveur de partitionnement (`web/js/solver.js`) : il raisonne sur
des compteurs de tuiles plutôt que sur des tuiles individuelles, explore en profondeur avec
mémoïsation, et maximise un score pondérant tuiles posées, points et consommation de jokers. Un
plafond de nœuds et une limite de temps garantissent que l'interface ne se fige jamais.

Un test fait s'affronter les niveaux et vérifie que la hiérarchie se traduit bien en tuiles
descendues.

## Tests

```
cd web
node --test tests/engine.test.js
```

45 cas couvrent les combinaisons, la légalité d'un tour, le solveur, et des manches entières
jouées par les joueurs virtuels en contrôlant chaque coup et la conservation des 106 tuiles.

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
