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

## Jouer

**On attrape une tuile et on la pose**, comme sur une vraie table : depuis le chevalet vers le
tapis pour créer une combinaison, sur une combinaison existante pour la compléter — la tuile
s'insère à l'endroit visé —, d'une combinaison à l'autre pour remanier la table, et vers le
chevalet pour reprendre une tuile descendue par erreur. Une tuile posée avant le tour, elle,
reste sur la table : les règles l'exigent, et le jeu le refuse avec un message.

L'ordre à l'intérieur d'une combinaison est libre : les tuiles — joker compris — restent à la
place où on les dépose, et dans une suite le joker vaut la place qu'il occupe, points compris.
Une combinaison s'attrape entière, par sa poignée (⠿) ou son cadre, pour organiser le tapis à
sa façon ; cet ordre survit aux tours suivants. Déposée sur une combinaison compatible, elle
fusionne avec elle, numéros remis en ordre — la cible s'illumine quand la fusion est possible.
À l'inverse, prélever un chiffre au milieu d'une longue suite la divise d'elle-même en deux
moitiés valables. La tuile fraîchement piochée pulse en doré quelques instants, le temps de la
repérer dans le chevalet retrié.

La tuile soulevée quitte réellement sa place et suit le doigt, légèrement remontée pour rester
visible. Il n'est pas demandé de viser juste : dès que la tuile frôle une combinaison, celle-ci
devient la destination, et un liseré doré montre où la pièce va s'intercaler. Sans cette
tolérance, former un groupe de trois relèverait de l'adresse, une combinaison naissante ne
faisant qu'une tuile de large.

Le chevalet tient sur **deux rangées**, comme le vrai : toutes les tuiles restent visibles d'un
coup d'œil, sans défilement, et elles se resserrent d'elles-mêmes si la main gonfle à force de
piocher.

Toucher une tuile sans la déplacer la sélectionne ; glisser une tuile sélectionnée emporte tout
le groupe, ce qui permet de déplacer une combinaison entière d'un geste. Les boutons `+` restent
disponibles pour qui préfère désigner sa cible plutôt que viser, et les tuiles sont atteignables
au clavier.

Une combinaison incomplète ou fausse s'entoure de rouge, et **Valider** ne s'active que lorsque
toute la table est correcte et qu'au moins une tuile a été descendue. **Annuler** revient d'un
déplacement en arrière — répété, il ramène au début du tour —, **Piocher** termine le tour. Les
tuiles posées par les adversaires restent surlignées jusqu'à la fin de votre tour.

## Essayer depuis cet ordinateur

```
cd web
node tools/serve.js          # puis http://localhost:8080/
node --test tests/*.test.js        # la suite de tests du moteur et de la progression
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
js/ai.js            stratégie des joueurs virtuels, dosée par le niveau du joueur
js/progression.js   expérience gagnée en fin de partie et niveaux qui en découlent
js/game.js          enchaînement des tours, manipulation en cours, sauvegarde
js/ui.js            rendu de l'interface
js/feedback.js      sons et vibrations
js/storage.js       sauvegarde locale
sw.js               service worker : tout en cache, jeu jouable sans réseau
tests/              suite de tests du moteur, portée depuis la version Android
```

Le moteur est un port fidèle du Kotlin, enrichi depuis : 60 cas de tests, dont des parties
entières jouées par l'IA en vérifiant chaque coup.

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
