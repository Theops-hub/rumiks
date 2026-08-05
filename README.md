# Rumiks — version web

Le même jeu que la version Android, porté en HTML/CSS/JavaScript pour être **ajouté à l'écran
d'accueil d'un iPad** et jouable **entièrement hors ligne**.

Aucune dépendance, aucune étape de construction : les fichiers sont servis tels quels et le
navigateur les lit directement en modules ES.

## Installer sur un iPad

Adresse du jeu : **<https://theops-hub.github.io/rumiks/>**

1. ouvrir cette adresse dans **Safari** (pas dans Chrome : sur iOS, seul Safari sait ajouter
   une application à l'écran d'accueil) ;
2. bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter** ;
3. lancer le jeu depuis la nouvelle icône : il s'ouvre en plein écran, sans barre d'adresse.

La première ouverture met tout en cache. Ensuite le jeu démarre et se joue sans aucune
connexion — c'est vérifié par un test automatisé qui recharge la page réseau coupé.

> L'ajout à l'écran d'accueil demande une adresse en **https**. En http, le jeu se joue mais le
> mode hors ligne ne s'active pas : Safari refuse d'installer un service worker sur une origine
> non sécurisée.

## Essayer depuis cet ordinateur

```
cd web
node tools/serve.js          # puis http://localhost:8080/
node --test tests/           # la suite de tests du moteur
```

Le serveur affiche aussi l'adresse à utiliser depuis un appareil du même réseau Wi-Fi, pratique
pour un essai rapide sur l'iPad — sans le hors-ligne, faute de https.

## Organisation

```
index.html          structure de la page et métadonnées d'installation
app.css             habillage complet, tailles calées sur la taille de l'écran
js/rules.js         tuiles, combinaisons et leur validation
js/engine.js        état de partie, légalité d'un tour, distribution, décompte
js/solver.js        solveur de combinaisons
js/ai.js            stratégies des trois niveaux de joueurs virtuels
js/game.js          enchaînement des tours, manipulation en cours, sauvegarde
js/ui.js            rendu de l'interface
js/feedback.js      sons et vibrations
js/storage.js       sauvegarde locale
sw.js               service worker : tout en cache, jeu jouable sans réseau
tests/              suite de tests du moteur, portée depuis la version Android
```

Le moteur est un port fidèle du Kotlin : mêmes règles, mêmes cas limites, et la même suite de
tests (45 cas, dont des manches entières jouées par l'IA en vérifiant chaque coup).

## Occupation de l'écran

La page ne défile jamais dans son ensemble : `html`, `body` et le conteneur sont fixés à la
hauteur visible, seuls la table et le chevalet défilent en cas de besoin. Les marges de
sécurité (encoche, indicateur de bas d'écran) sont reprises avec `env(safe-area-inset-*)`, et
la taille des tuiles se calcule à partir de la plus contraignante des deux dimensions, de sorte
qu'un chevalet de quatorze tuiles tienne sans être comprimé, en paysage comme en portrait.

Vérifié à 1180×820 et 820×1180 : `scrollHeight` égale `clientHeight` et `scrollWidth` égale
`clientWidth`, donc aucun débordement dans les deux sens.

## Limites connues

- **Pas de vibration sur iPad.** Safari sur iOS n'implémente pas l'API Vibration : le retour
  haptique de la version Android n'a pas d'équivalent web. Le code est conservé pour les
  navigateurs qui l'exposent, et le réglage est masqué là où il ne servirait à rien.
- Le son démarre au premier contact avec l'écran : iOS interdit toute lecture audio avant un
  geste de l'utilisateur.
- Une seule partie est mémorisée à la fois ; en commencer une nouvelle écrase la précédente.
- La réflexion d'un joueur virtuel occupe le fil principal quelques centaines de millisecondes.
  L'affichage est rafraîchi avant le calcul pour que « réfléchit… » apparaisse bien.
