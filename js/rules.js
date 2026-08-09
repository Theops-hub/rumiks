// Tuiles et combinaisons du Rummikub.
//
// Port fidèle du moteur Kotlin de la version Android : mêmes règles, mêmes choix
// d'interprétation, mêmes cas limites. La suite de tests est portée avec.

export const COLORS = ['black', 'red', 'blue', 'orange'];

export const COLOR_LABELS = {
  black: 'noir',
  red: 'rouge',
  blue: 'bleu',
  orange: 'orange',
};

export const MIN_NUMBER = 1;
export const MAX_NUMBER = 13;
export const MIN_MELD_SIZE = 3;

/** Points de pénalité d'un joker resté en main à la fin d'une manche. */
export const JOKER_PENALTY = 30;

/** Points minimum à poser d'un seul coup pour effectuer sa pose initiale. */
export const INITIAL_MELD_POINTS = 30;

/**
 * Crée une tuile. `id` est une identité unique et stable sur toute la partie : deux tuiles
 * identiques existent en double et doivent rester distinguables.
 */
export function tile(id, number, color, isJoker = false) {
  return { id, number, color, isJoker };
}

/** Le sabot complet : 2 x (1..13 x 4 couleurs) + 2 jokers = 106 tuiles. */
export function createDeck() {
  const tiles = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of COLORS) {
      for (let n = MIN_NUMBER; n <= MAX_NUMBER; n += 1) {
        tiles.push(tile(id, n, color));
        id += 1;
      }
    }
  }
  tiles.push(tile(id, 0, 'red', true));
  tiles.push(tile(id + 1, 0, 'black', true));
  return tiles;
}

/** Valeur de pénalité d'une tuile restée sur le chevalet en fin de manche. */
export function penaltyValue(t) {
  return t.isJoker ? JOKER_PENALTY : t.number;
}

/** Analyse un groupe : même numéro, couleurs distinctes, 3 ou 4 tuiles. */
function analyseGroup(tiles) {
  const size = tiles.length;
  if (size < MIN_MELD_SIZE || size > COLORS.length) return null;

  const reals = tiles.filter((t) => !t.isJoker);
  // Une combinaison entièrement composée de jokers n'a pas de sens : il faut au moins une
  // tuile réelle pour déterminer ce que les jokers remplacent.
  if (reals.length === 0) return null;

  const number = reals[0].number;
  if (reals.some((t) => t.number !== number)) return null;
  if (new Set(reals.map((t) => t.color)).size !== reals.length) return null;

  // L'ordre d'un groupe n'a pas de sens pour les règles : chaque tuile — joker compris —
  // reste donc à la place où le joueur l'a déposée.
  return { kind: 'group', points: number * size, ordered: tiles.slice() };
}

/** Analyse une suite : numéros consécutifs d'une même couleur, les jokers comblant les trous. */
function analyseRun(tiles) {
  const size = tiles.length;
  if (size < MIN_MELD_SIZE || size > MAX_NUMBER) return null;

  const reals = tiles.filter((t) => !t.isJoker);
  if (reals.length === 0) return null;

  const color = reals[0].color;
  if (reals.some((t) => t.color !== color)) return null;

  const numbers = reals.map((t) => t.number);
  if (new Set(numbers).size !== numbers.length) return null;

  // La combinaison telle que posée d'abord : si l'ordre donné se lit comme une suite, chaque
  // joker vaut la place qu'il occupe. C'est ce qui permet de choisir où mettre son joker —
  // avant, au milieu ou après les tuiles — et ce choix fait foi, points compris.
  const firstReal = tiles.findIndex((t) => !t.isJoker);
  const givenStart = tiles[firstReal].number - firstReal;
  if (
    givenStart >= MIN_NUMBER
    && givenStart + size - 1 <= MAX_NUMBER
    && tiles.every((t, index) => t.isJoker || t.number === givenStart + index)
  ) {
    let points = 0;
    for (let n = givenStart; n < givenStart + size; n += 1) points += n;
    return { kind: 'run', points, ordered: tiles.slice() };
  }

  // Sinon, la suite occupe une fenêtre [start, start + size - 1] contenant toutes les tuiles
  // réelles ; les jokers occupent les positions libres, internes comme aux extrémités.
  const lowest = Math.min(...numbers);
  const highest = Math.max(...numbers);
  const startMin = Math.max(MIN_NUMBER, highest - size + 1);
  const startMax = Math.min(lowest, MAX_NUMBER - size + 1);
  if (startMin > startMax) return null;

  // Fenêtre la plus haute possible : c'est celle qui rapporte le plus de points.
  const start = startMax;
  const byNumber = new Map(reals.map((t) => [t.number, t]));
  const jokers = tiles.filter((t) => t.isJoker);
  let jokerIndex = 0;
  const ordered = [];
  let points = 0;
  for (let n = start; n < start + size; n += 1) {
    const real = byNumber.get(n);
    ordered.push(real !== undefined ? real : jokers[jokerIndex++]);
    points += n;
  }
  return { kind: 'run', points, ordered };
}

/**
 * Analyse un ensemble de tuiles et renvoie `null` s'il ne forme aucune combinaison valide.
 *
 * Quand les deux lectures sont possibles (cas d'une combinaison très chargée en jokers), c'est
 * la plus avantageuse en points qui est retenue : les règles laissent celui qui pose déclarer
 * ce que remplace chaque joker, il choisira donc toujours la lecture qui rapporte le plus.
 */
export function analyseMeld(tiles) {
  const group = analyseGroup(tiles);
  const run = analyseRun(tiles);
  if (group === null) return run;
  if (run === null) return group;
  return run.points >= group.points ? run : group;
}

export function isValidMeld(tiles) {
  return analyseMeld(tiles) !== null;
}

export function meldPoints(tiles) {
  const analysis = analyseMeld(tiles);
  return analysis === null ? 0 : analysis.points;
}

/** Tri de confort du chevalet : par couleur puis par numéro, jokers en fin de rangée. */
export function sortByColor(tiles) {
  return tiles.slice().sort((a, b) => (
    Number(a.isJoker) - Number(b.isJoker)
    || COLORS.indexOf(a.color) - COLORS.indexOf(b.color)
    || a.number - b.number
    || a.id - b.id
  ));
}

/** Tri alternatif : par numéro puis par couleur, pratique pour repérer les groupes. */
export function sortByNumber(tiles) {
  return tiles.slice().sort((a, b) => (
    Number(a.isJoker) - Number(b.isJoker)
    || a.number - b.number
    || COLORS.indexOf(a.color) - COLORS.indexOf(b.color)
    || a.id - b.id
  ));
}

export function describeMeld(meld) {
  return meld.tiles
    .map((t) => (t.isJoker ? 'JOKER' : `${t.number} ${COLOR_LABELS[t.color]}`))
    .join(' ');
}
