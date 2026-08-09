// État d'une partie, légalité d'un tour, distribution et décompte.

import {
  INITIAL_MELD_POINTS,
  MIN_MELD_SIZE,
  analyseMeld,
  createDeck,
  describeMeld,
  penaltyValue,
  sortByColor,
} from './rules.js';

/** Nombre de tuiles distribuées à chaque joueur en début de manche. */
export const INITIAL_RACK_SIZE = 14;

export const ROUND_END_RUMMIKUB = 'rummikub';
export const ROUND_END_BLOCKED = 'blocked';

/** Index du joueur humain, toujours en tête de table. */
export const HUMAN_INDEX = 0;

let meldCounter = 1;

export function newMeld(tiles, id = null) {
  return { id: id === null ? meldCounter++ : id, tiles };
}

/** Réserve un identifiant de combinaison supérieur à tous ceux déjà utilisés. */
export function reserveMeldIds(state) {
  for (const meld of state.board) {
    if (meld.id >= meldCounter) meldCounter = meld.id + 1;
  }
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32). Une graine explicite rend les parties
 * reproductibles dans les tests, ce qu'un `Math.random` global ne permet pas.
 */
export function makeRandom(seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Distribue une nouvelle manche. Le joueur humain occupe toujours la position 0.
 */
export function startRound({
  humanName = 'Vous',
  opponentNames,
  difficulty,
  random = makeRandom(),
  carriedScores = [],
}) {
  const deck = shuffled(createDeck(), random);
  const players = [];
  let cursor = 0;

  players.push({
    id: 0,
    name: humanName,
    difficulty: null,
    rack: sortByColor(deck.slice(cursor, cursor + INITIAL_RACK_SIZE)),
    hasOpened: false,
    score: carriedScores[0] ?? 0,
  });
  cursor += INITIAL_RACK_SIZE;

  opponentNames.forEach((name, index) => {
    players.push({
      id: index + 1,
      name,
      difficulty,
      rack: deck.slice(cursor, cursor + INITIAL_RACK_SIZE),
      hasOpened: false,
      score: carriedScores[index + 1] ?? 0,
    });
    cursor += INITIAL_RACK_SIZE;
  });

  return {
    players,
    board: [],
    pool: deck.slice(cursor),
    currentPlayerIndex: Math.floor(random() * players.length),
    consecutivePasses: 0,
    endReason: null,
    winnerIndex: null,
  };
}

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function isRoundOver(state) {
  return state.endReason !== null;
}

export function rackPenalty(player) {
  return player.rack.reduce((sum, t) => sum + penaltyValue(t), 0);
}

function tileIds(board, rack) {
  const ids = [];
  for (const meld of board) for (const t of meld.tiles) ids.push(t.id);
  for (const t of rack) ids.push(t.id);
  return ids.sort((a, b) => a - b);
}

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/**
 * Vérifie qu'un tour est conforme aux règles de la maison.
 *
 * Sont contrôlés, dans l'ordre : la conservation des tuiles, la validité de toutes les
 * combinaisons laissées sur la table, la pose d'au moins une tuile du chevalet, le blocage des
 * combinaisons contenant un joker, les contraintes propres à la pose initiale, puis
 * l'interdiction de reprendre en main une tuile déjà posée.
 */
export function validateTurn(before, after, hasOpened) {
  if (!sameIds(tileIds(before.board, before.rack), tileIds(after.board, after.rack))) {
    return { ok: false, reason: 'Des tuiles ont été ajoutées ou perdues pendant le tour.' };
  }

  for (const meld of after.board) {
    if (meld.tiles.length < MIN_MELD_SIZE) {
      return {
        ok: false,
        reason: `Une combinaison ne compte que ${meld.tiles.length} tuile(s) : il en faut au moins ${MIN_MELD_SIZE}.`,
      };
    }
    if (analyseMeld(meld.tiles) === null) {
      return { ok: false, reason: `La combinaison ${describeMeld(meld)} n'est pas valide.` };
    }
  }

  const rackAfterIds = new Set(after.rack.map((t) => t.id));
  const rackBeforeIds = new Set(before.rack.map((t) => t.id));
  const tilesPlayed = before.rack.filter((t) => !rackAfterIds.has(t.id));
  if (tilesPlayed.length === 0) {
    return { ok: false, reason: 'Il faut poser au moins une tuile de son chevalet.' };
  }

  // Une combinaison qui contient un joker est bloquée : ses tuiles réelles doivent rester
  // ensemble. On peut la compléter, ou remplacer le joker (qui devra être rejoué), mais jamais
  // en disperser les tuiles.
  for (const meld of before.board) {
    if (!meld.tiles.some((t) => t.isJoker)) continue;
    const realIds = meld.tiles.filter((t) => !t.isJoker).map((t) => t.id);
    const together = after.board.some((m) => {
      const ids = new Set(m.tiles.map((t) => t.id));
      return realIds.every((id) => ids.has(id));
    });
    if (!together) {
      return {
        ok: false,
        reason: 'Une combinaison qui contient un joker est bloquée : on peut la compléter ou remplacer le joker, pas en reprendre les tuiles.',
      };
    }
  }

  let openingPoints = 0;
  if (!hasOpened) {
    // La pose initiale se compte sur les combinaisons formées uniquement de tuiles du chevalet,
    // jokers exclus. Une fois les points atteints, le reste du tour est libre : on peut
    // enchaîner d'autres poses et compléter la table dans la foulée.
    openingPoints = after.board
      .filter((meld) => meld.tiles.every((t) => rackBeforeIds.has(t.id) && !t.isJoker))
      .reduce((sum, meld) => sum + (analyseMeld(meld.tiles)?.points ?? 0), 0);
    if (openingPoints < INITIAL_MELD_POINTS) {
      return {
        ok: false,
        reason: `La pose initiale doit totaliser au moins ${INITIAL_MELD_POINTS} points, en combinaisons formées de vos seules tuiles, sans joker (actuellement ${openingPoints}).`,
      };
    }
  }

  const tilesOnBoardBefore = before.board.flatMap((meld) => meld.tiles);
  if (tilesOnBoardBefore.some((t) => t.isJoker && rackAfterIds.has(t.id))) {
    return {
      ok: false,
      reason: 'Un joker repris sur la table doit être rejoué dans le même tour, pas gardé en main.',
    };
  }
  // Cas général : ce qui est descendu sur la table y reste. Seule la circulation entre
  // combinaisons est permise.
  if (tilesOnBoardBefore.some((t) => rackAfterIds.has(t.id))) {
    return { ok: false, reason: 'Une tuile déjà posée ne peut pas revenir dans un chevalet.' };
  }

  return { ok: true, tilesPlayed, openingPoints };
}

function advanceTurn(state) {
  return { ...state, currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length };
}

/** Le joueur `winner` a vidé son chevalet : chacun compte ce qui lui reste en main. */
function finishWithWinner(state, winner, reason) {
  const penalties = state.players.map(rackPenalty);
  const gain = penalties.reduce((sum, value, index) => (index === winner ? sum : sum + value), 0);
  const players = state.players.map((player, index) => ({
    ...player,
    score: player.score + (index === winner ? gain : -penalties[index]),
  }));
  return { ...state, players, endReason: reason, winnerIndex: winner };
}

/** Pioche épuisée et plus aucun coup possible : c'est le chevalet le plus léger qui l'emporte. */
function finishBlocked(state) {
  let winner = 0;
  let best = Infinity;
  state.players.forEach((player, index) => {
    const penalty = rackPenalty(player);
    if (penalty < best) {
      best = penalty;
      winner = index;
    }
  });
  return finishWithWinner(state, winner, ROUND_END_BLOCKED);
}

/**
 * Le joueur courant pioche une tuile (ou passe si la pioche est vide) et la main passe au
 * joueur suivant.
 */
export function drawAndPass(state) {
  const player = currentPlayer(state);
  const drawn = state.pool[0] ?? null;
  const isHuman = state.currentPlayerIndex === HUMAN_INDEX;
  const updated = drawn === null
    ? player
    : { ...player, rack: isHuman ? sortByColor([...player.rack, drawn]) : [...player.rack, drawn] };

  const nextPasses = state.consecutivePasses + 1;
  const blocked = state.pool.length === 0 && nextPasses >= state.players.length;

  const players = state.players.slice();
  players[state.currentPlayerIndex] = updated;
  const base = {
    ...state,
    players,
    pool: drawn === null ? state.pool : state.pool.slice(1),
    consecutivePasses: nextPasses,
  };
  return blocked ? finishBlocked(base) : advanceTurn(base);
}

/**
 * Applique un tour joué : `newBoard` et `newRack` décrivent l'état voulu en fin de tour. Le
 * tour n'est appliqué que s'il respecte les règles ; sinon la raison du refus est renvoyée.
 */
export function commitTurn(state, newBoard, newRack) {
  const player = currentPlayer(state);
  const check = validateTurn(
    { board: state.board, rack: player.rack },
    { board: newBoard, rack: newRack },
    player.hasOpened,
  );
  if (!check.ok) return { ok: false, reason: check.reason };

  const isHuman = state.currentPlayerIndex === HUMAN_INDEX;
  const updated = {
    ...player,
    rack: isHuman ? sortByColor(newRack) : newRack,
    hasOpened: true,
  };
  const players = state.players.slice();
  players[state.currentPlayerIndex] = updated;

  let next = {
    ...state,
    players,
    board: newBoard.filter((meld) => meld.tiles.length > 0),
    consecutivePasses: 0,
  };
  reserveMeldIds(next);
  next = updated.rack.length === 0
    ? finishWithWinner(next, state.currentPlayerIndex, ROUND_END_RUMMIKUB)
    : advanceTurn(next);
  return { ok: true, state: next, tilesPlayed: check.tilesPlayed };
}

/** Total des tuiles en jeu : sert de garde-fou contre toute perte de tuile. */
export function totalTiles(state) {
  return state.pool.length
    + state.players.reduce((sum, p) => sum + p.rack.length, 0)
    + state.board.reduce((sum, m) => sum + m.tiles.length, 0);
}
