# Rumiks

Jeu de tuiles reprenant les règles officielles du Rummikub, avec des joueurs virtuels de trois
niveaux. Deux versions partagent le même moteur et les mêmes règles :

- **`web/`** — version web installable sur l'écran d'accueil d'un iPad, jouable hors ligne.
  C'est la version destinée à l'usage réel ; voir [web/README.md](web/README.md).
  **Jouer : <https://theops-hub.github.io/rumiks/>**
- **`app/`** — application Android native en Kotlin et Jetpack Compose, décrite ci-dessous.

> Le nom « Rummikub » est une marque déposée de Lemada Light Industries. Les règles d'un jeu ne
> sont pas protégeables, mais le nom l'est : l'application s'appelle donc *Rumiks*.

## Ce que le jeu implémente

**Matériel et mise en place.** 106 tuiles — les numéros 1 à 13 en quatre couleurs, chacun en
double, plus deux jokers. Quatorze tuiles par joueur, de 2 à 4 joueurs.

**Combinaisons.** Les suites (au moins trois numéros consécutifs d'une même couleur, sans
bouclage du 13 vers le 1) et les groupes (trois ou quatre fois le même numéro, couleurs toutes
différentes). Les jokers remplacent n'importe quelle tuile ; une combinaison doit contenir au
moins une tuile réelle.

**Pose initiale.** 30 points minimum en une seule fois, formés uniquement avec les tuiles de son
chevalet. Tant qu'elle n'est pas faite, les combinaisons déjà sur la table sont intouchables.

**Manipulation de la table.** Une fois ouvert, un joueur découpe, fusionne et réarrange
librement ce qui est posé, à condition de descendre au moins une tuile de sa main et de laisser
une table entièrement valide en fin de tour.

**Jokers.** Un joker posé peut être récupéré en le remplaçant par la tuile qu'il représente,
mais il doit être rejoué dans le même tour : il ne retourne jamais sur un chevalet. Plus
généralement, aucune tuile posée ne peut être reprise en main.

**Fin de manche et décompte.** Le premier joueur à vider son chevalet remporte la manche. Si la
pioche s'épuise et que plus personne ne peut jouer, c'est le chevalet le plus léger qui gagne.
Chaque perdant compte en négatif les points qui lui restent (30 pour un joker), le gagnant
marque la somme de ces pénalités. Les scores se cumulent de manche en manche.

## Les joueurs virtuels

Les trois niveaux ne reposent pas sur un handicap artificiel mais sur l'étendue des coups
envisagés :

| Niveau | Coups envisagés | Jokers | Recherche |
|---|---|---|---|
| Facile | Uniquement les combinaisons formées avec son seul chevalet | Dépensés sans compter | 3 000 nœuds |
| Modérée | Complète en plus les combinaisons déjà posées | Ménagés | 30 000 nœuds |
| Difficile | Refond la table entière pour caser un maximum de tuiles | Préservés | 250 000 nœuds |

Le moteur de décision est un solveur de partitionnement (`ai/MeldSolver.kt`) : il raisonne sur
des compteurs de tuiles plutôt que sur des tuiles individuelles, explore en profondeur avec
mémoïsation, et maximise un score pondérant tuiles posées, points et consommation de jokers.
Un plafond de nœuds et une limite de temps garantissent que l'interface ne se fige jamais.

`DifficultyTest` fait s'affronter les niveaux et vérifie que la hiérarchie se traduit bien en
manches gagnées et en tuiles descendues.

## Jouer

L'interaction se fait par sélection puis dépôt, plus fiable au doigt qu'un glisser-déposer :

1. toucher une ou plusieurs tuiles du chevalet — ou de la table — pour les sélectionner ;
2. toucher le bouton `+` d'une combinaison pour y déposer la sélection, ou
   « + Nouvelle combinaison » pour en créer une ;
3. une combinaison invalide s'entoure de rouge ; le bouton **Valider** ne s'active que lorsque
   toute la table est correcte et qu'au moins une tuile a été descendue.

**Reprendre** ramène en main les tuiles descendues pendant le tour, **Annuler** rétablit la
situation du début de tour, **Piocher** termine le tour.

## Sauvegarde

La partie est écrite sur disque après chaque coup, y compris ceux des joueurs virtuels. Quitter
vers le menu, fermer l'application ou la voir tuée par le système ne perd rien : l'accueil
propose alors **Reprendre** à côté de **Nouvelle partie**.

Seul l'état validé est conservé. Un tour entamé mais non validé est abandonné à la reprise —
mieux vaut repartir d'une table nette que de restaurer un remaniement dont le joueur a perdu le
fil. Le fichier vit dans le stockage privé de l'application (`files/partie-en-cours.json`,
quelques kilo-octets) et porte un numéro de version : une sauvegarde issue d'une version
incompatible est écartée sans faire échouer le démarrage.

## Construire

Prérequis : le SDK Android (plateforme 35) et un JDK 21. Le chemin du JDK est fixé dans
`gradle.properties`, celui du SDK dans `local.properties` — à ajuster sur une autre machine.

```
./gradlew assembleDebug        # APK de test : app/build/outputs/apk/debug/Rumiks-debug.apk
./gradlew testDebugUnitTest    # suite de tests
./gradlew assembleRelease      # Rumiks-release.apk, à signer avant distribution
```

Installer sur un appareil branché en débogage USB :

```
adb install -r app/build/outputs/apk/debug/Rumiks-debug.apk
```

Un appareil virtuel `rumiks_test` (Pixel 5, Android 15) est déjà créé sur cette machine :

```
%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd rumiks_test -gpu swiftshader_indirect
```

## Organisation du code

```
model/      Tuiles, combinaisons et leur validation, joueurs
engine/     État de partie, règles du tour, distribution, décompte
ai/         Solveur de combinaisons et stratégies des joueurs virtuels
storage/    Sérialisation et fichier de sauvegarde
ui/         Thème, rendu des tuiles, écrans et dialogues
GameViewModel.kt   Enchaînement des tours et manipulation en cours
```

## Limites connues

- L'interface a été essayée sur un émulateur Pixel 5 sous Android 15, en paysage uniquement —
  l'orientation est verrouillée dans le manifeste. Elle n'a pas été confrontée à une tablette
  ni à un très petit écran.
- Lorsqu'une position d'une suite peut être occupée par une tuile réelle, le solveur n'explore
  pas la variante consistant à lui préférer un joker. Avec deux jokers dans tout le jeu, le coup
  manqué est marginal.
- Quand plusieurs lectures d'une combinaison chargée en jokers sont possibles, c'est la plus
  avantageuse en points qui est retenue — ce que ferait un joueur déclarant ce que remplace son
  joker.
- Une seule partie est mémorisée à la fois : en commencer une nouvelle écrase la précédente.
