// Joueurs virtuels.
//
// Les trois niveaux ne diffèrent pas par un handicap artificiel mais par l'étendue des coups
// qu'ils envisagent : un débutant ne voit que les combinaisons qu'il peut former seul, un
// joueur moyen sait aussi compléter ce qui est déjà posé, un joueur fort refond la table.

import { newMeld } from './engine.js';
import { INITIAL_MELD_POINTS, analyseMeld } from './rules.js';
import { createSolver, materialize, solutionPoints } from './solver.js';

export const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'Facile',
    description: "Ne pose que les combinaisons qu'il forme avec son seul chevalet et dépense ses jokers sans compter.",
    nodeBudget: 3000,
    timeLimitMs: 250,
    jokerPenalty: 0,
    extendsExistingMelds: false,
    rearrangesBoard: false,
  },
  medium: {
    key: 'medium',
    label: 'Modérée',
    description: "Complète aussi les combinaisons déjà posées et ménage ses jokers, mais ne défait jamais la table.",
    nodeBudget: 30000,
    timeLimitMs: 600,
    jokerPenalty: 60,
    extendsExistingMelds: true,
    rearrangesBoard: false,
  },
  hard: {
    key: 'hard',
    label: 'Difficile',
    description: "Refond toute la table pour caser un maximum de tuiles et garde ses jokers pour les coups qui comptent.",
    nodeBudget: 120000,
    timeLimitMs: 1400,
    jokerPenalty: 140,
    extendsExistingMelds: true,
    rearrangesBoard: true,
  },
};

function solverFor(profile, tileWeight, pointWeight) {
  return createSolver({
    nodeBudget: profile.nodeBudget,
    timeLimitMs: profile.timeLimitMs,
    tileWeight,
    pointWeight,
    jokerPenalty: profile.jokerPenalty,
  });
}

/**
 * Pose initiale : au moins 30 points, formés exclusivement avec les tuiles du chevalet — et
 * sans joker, qui n'a pas le droit de servir à l'ouverture.
 */
function openingMove(state, player, profile) {
  const rack = player.rack.filter((t) => !t.isJoker);
  const jokers = player.rack.filter((t) => t.isJoker);
  const byPoints = solverFor(profile, 1, 100).solve(rack, []);
  if (byPoints === null || solutionPoints(byPoints) < INITIAL_MELD_POINTS) return { type: 'draw' };

  // Un joueur fort préfère, à seuil atteint, la pose qui vide le plus son chevalet.
  let chosen = byPoints;
  if (profile.rearrangesBoard) {
    const byTiles = solverFor(profile, 100, 1).solve(rack, []);
    if (byTiles !== null && solutionPoints(byTiles) >= INITIAL_MELD_POINTS) chosen = byTiles;
  }

  const laid = materialize(chosen.melds, [], rack, (tiles) => newMeld(tiles));
  if (laid === null || laid.melds.length === 0) return { type: 'draw' };
  return {
    type: 'play',
    board: [...state.board, ...laid.melds],
    rack: [...laid.remainingRack, ...jokers],
  };
}

/**
 * Refonte complète : toutes les tuiles de la table doivent se retrouver dans une combinaison
 * valide, et on cherche l'agencement qui accueille le plus de tuiles du chevalet. Les
 * combinaisons contenant un joker sont bloquées : elles restent en place, tout au plus
 * complétées, et seul le reste de la table est refondu.
 */
function rearrangeWholeBoard(state, player, profile) {
  if (state.board.length === 0) return null;
  const isFrozen = (meld) => meld.tiles.some((t) => t.isJoker);
  const extended = extendExistingMelds(state.board.filter(isFrozen), player.rack);
  const boardTiles = state.board.filter((m) => !isFrozen(m)).flatMap((meld) => meld.tiles);

  const solution = solverFor(profile, 100, 1)
    .solve([...boardTiles, ...extended.remaining], boardTiles);
  if (solution === null) return null;
  const laid = materialize(solution.melds, boardTiles, extended.remaining, (tiles) => newMeld(tiles));
  if (laid === null) return null;

  // Réorganiser sans rien descendre de sa main est interdit par les règles.
  if (player.rack.length - laid.remainingRack.length <= 0) return null;
  return { type: 'play', board: [...extended.melds, ...laid.melds], rack: laid.remainingRack };
}

/**
 * Ajoute gloutonnement les tuiles du chevalet aux combinaisons déjà posées, tant que celles-ci
 * restent valides. Les jokers sont épargnés : les dépenser en simple rallonge revient à
 * gaspiller la tuile la plus précieuse du jeu.
 */
function extendExistingMelds(board, rack) {
  const melds = board.map((meld) => ({ ...meld, tiles: meld.tiles.slice() }));
  const remaining = rack.slice();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let index = 0; index < melds.length; index += 1) {
      const at = remaining.findIndex(
        (t) => !t.isJoker && analyseMeld([...melds[index].tiles, t]) !== null,
      );
      if (at >= 0) {
        const [picked] = remaining.splice(at, 1);
        melds[index] = {
          ...melds[index],
          tiles: analyseMeld([...melds[index].tiles, picked]).ordered,
        };
        progressed = true;
      }
    }
  }
  return { melds, remaining };
}

/**
 * Coup sans casse : on complète éventuellement les combinaisons en place, puis on pose de
 * nouvelles combinaisons avec ce qui reste en main.
 */
function incrementalMove(state, player, profile) {
  let board = state.board;
  let rack = player.rack;

  if (profile.extendsExistingMelds) {
    const extended = extendExistingMelds(board, rack);
    board = extended.melds;
    rack = extended.remaining;
  }

  const solution = solverFor(profile, 100, 1).solve(rack, []);
  let finalBoard = board;
  let finalRack = rack;
  if (solution !== null && solution.melds.length > 0) {
    const laid = materialize(solution.melds, [], rack, (tiles) => newMeld(tiles));
    if (laid !== null) {
      finalBoard = [...board, ...laid.melds];
      finalRack = laid.remainingRack;
    }
  }

  if (finalRack.length === player.rack.length) return { type: 'draw' };
  return { type: 'play', board: finalBoard, rack: finalRack };
}

/** Décide du coup d'un joueur virtuel. */
export function chooseMove(state, difficultyKey) {
  const profile = DIFFICULTIES[difficultyKey] ?? DIFFICULTIES.medium;
  const player = state.players[state.currentPlayerIndex];
  if (!player.hasOpened) return openingMove(state, player, profile);
  if (profile.rearrangesBoard) {
    const rearranged = rearrangeWholeBoard(state, player, profile);
    if (rearranged !== null) return rearranged;
  }
  return incrementalMove(state, player, profile);
}
