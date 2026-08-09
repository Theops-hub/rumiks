// Suite de tests du moteur web, portée depuis celle de la version Android.
// Exécution : node --test web/tests/engine.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLORS,
  INITIAL_MELD_POINTS,
  analyseMeld,
  createDeck,
  isValidMeld,
  tile,
} from '../js/rules.js';
import {
  HUMAN_INDEX,
  INITIAL_RACK_SIZE,
  commitTurn,
  drawAndPass,
  isRoundOver,
  makeRandom,
  newMeld,
  startRound,
  totalTiles,
  validateTurn,
} from '../js/engine.js';
import { createSolver, materialize, solutionPoints, solutionTiles } from '../js/solver.js';
import {
  EXTENDS_FROM_LEVEL,
  MAX_LEVEL,
  REARRANGES_FROM_LEVEL,
  chooseMove,
  profileForLevel,
} from '../js/ai.js';

let nextId = 0;
const t = (number, color) => tile(nextId++, number, color);
const joker = () => tile(nextId++, 0, 'red', true);
const black = (n) => t(n, 'black');
const red = (n) => t(n, 'red');
const blue = (n) => t(n, 'blue');
const orange = (n) => t(n, 'orange');
const meld = (...tiles) => newMeld(tiles.flat());

// ------------------------------------------------------------------ combinaisons

test('le sabot compte 106 tuiles dont 2 jokers', () => {
  const deck = createDeck();
  assert.equal(deck.length, 106);
  assert.equal(deck.filter((x) => x.isJoker).length, 2);
  assert.equal(deck.filter((x) => !x.isJoker && x.number === 7).length, 8);
  assert.equal(new Set(deck.map((x) => x.id)).size, 106);
});

test('un groupe de trois couleurs distinctes est valide', () => {
  const analysis = analyseMeld([red(7), blue(7), black(7)]);
  assert.ok(analysis);
  assert.equal(analysis.kind, 'group');
  assert.equal(analysis.points, 21);
});

test('un groupe de quatre couleurs vaut 36 pour des 9', () => {
  assert.equal(analyseMeld([red(9), blue(9), black(9), orange(9)]).points, 36);
});

test('un groupe avec deux fois la meme couleur est refuse', () => {
  assert.equal(isValidMeld([red(7), red(7), black(7)]), false);
});

test('un groupe de cinq tuiles est impossible', () => {
  assert.equal(isValidMeld([red(4), blue(4), black(4), orange(4), joker()]), false);
});

test('une suite de trois numeros consecutifs est valide', () => {
  const analysis = analyseMeld([blue(5), blue(6), blue(7)]);
  assert.equal(analysis.kind, 'run');
  assert.equal(analysis.points, 18);
});

test('une suite doit etre monochrome', () => {
  assert.equal(isValidMeld([blue(5), red(6), blue(7)]), false);
});

test('une suite avec un trou est refusee', () => {
  assert.equal(isValidMeld([blue(5), blue(6), blue(8)]), false);
});

test('le 13 ne se relie pas au 1', () => {
  assert.equal(isValidMeld([orange(12), orange(13), orange(1)]), false);
  assert.equal(isValidMeld([orange(13), orange(1), orange(2)]), false);
});

test('deux tuiles ne suffisent pas', () => {
  assert.equal(isValidMeld([orange(5), orange(6)]), false);
});

test('un joker comble un trou dans une suite', () => {
  const analysis = analyseMeld([black(4), joker(), black(6)]);
  assert.equal(analysis.kind, 'run');
  assert.equal(analysis.points, 15);
  assert.deepEqual(analysis.ordered.map((x) => x.number), [4, 0, 6]);
});

test('un joker complete un groupe', () => {
  const analysis = analyseMeld([black(11), red(11), joker()]);
  assert.equal(analysis.kind, 'group');
  assert.equal(analysis.points, 33);
});

test('une combinaison uniquement composee de jokers n a pas de sens', () => {
  assert.equal(isValidMeld([joker(), joker(), joker()]), false);
});

test('l interpretation retenue est la plus avantageuse pour le joueur', () => {
  // 7 plus deux jokers : lu comme groupe cela vaut 21, lu comme la suite 7-8-9 cela vaut 24.
  assert.equal(analyseMeld([red(7), joker(), joker()]).points, 24);
});

test('une suite ne peut pas depasser le 13', () => {
  assert.equal(analyseMeld([blue(12), blue(13), joker()]).points, 36);
});

test('une suite peut courir sur toute la couleur', () => {
  const tiles = [];
  for (let n = 1; n <= 13; n += 1) tiles.push(orange(n));
  assert.equal(analyseMeld(tiles).points, 91);
});

test('une suite avec un numero en double est refusee', () => {
  assert.equal(analyseMeld([red(5), red(5), red(6), red(7)]), null);
});

test('le joker occupe la place choisie dans une suite, points compris', () => {
  const leading = analyseMeld([joker(), blue(5), blue(6), blue(7)]);
  assert.equal(leading.points, 22, 'devant, le joker vaut 4');
  assert.equal(leading.ordered[0].isJoker, true);

  const trailing = analyseMeld([blue(5), blue(6), blue(7), joker()]);
  assert.equal(trailing.points, 26, 'derrière, le joker vaut 8');
  assert.equal(trailing.ordered[3].isJoker, true);

  const middle = analyseMeld([blue(5), joker(), blue(7)]);
  assert.equal(middle.points, 18, 'au milieu, le joker vaut 6');
  assert.equal(middle.ordered[1].isJoker, true);
});

test('des tuiles posees dans le desordre sont remises en suite', () => {
  const analysis = analyseMeld([blue(6), blue(8), blue(7)]);
  assert.equal(analysis.kind, 'run');
  assert.deepEqual(analysis.ordered.map((x) => x.number), [6, 7, 8]);
});

// ------------------------------------------------------------------ règles du tour

const snapshot = (board, rack) => ({ board, rack });

test('une pose initiale de moins de 30 points est refusee', () => {
  const [a, b, c, spare] = [red(1), red(2), red(3), blue(9)];
  const check = validateTurn(
    snapshot([], [a, b, c, spare]),
    snapshot([meld(a, b, c)], [spare]),
    false,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /30/);
});

test('une pose initiale de 30 points exactement est acceptee', () => {
  const [a, b, c, spare] = [red(10), blue(10), black(10), orange(2)];
  const check = validateTurn(
    snapshot([], [a, b, c, spare]),
    snapshot([meld(a, b, c)], [spare]),
    false,
  );
  assert.equal(check.ok, true);
  assert.equal(check.openingPoints, 30);
  assert.equal(check.tilesPlayed.length, 3);
});

test('la pose initiale peut cumuler plusieurs combinaisons', () => {
  const group = [red(5), blue(5), black(5)];
  const run = [orange(5), orange(6), orange(7)];
  const check = validateTurn(
    snapshot([], [...group, ...run]),
    snapshot([meld(group), meld(run)], []),
    false,
  );
  assert.equal(check.ok, true);
  assert.equal(check.openingPoints, 33);
});

test('sans ses 30 points un joueur ne peut pas completer la table', () => {
  const existing = [blue(4), blue(5), blue(6)];
  const addition = blue(7);
  const group = [red(5), black(5), orange(5)];
  const check = validateTurn(
    snapshot([meld(existing)], [addition, ...group]),
    snapshot([meld([...existing, addition]), meld(group)], []),
    false,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /pose initiale/);
});

test('les 30 points atteints, le tour d ouverture se poursuit librement', () => {
  const existing = [blue(4), blue(5), blue(6)];
  const addition = blue(7);
  const group = [red(11), black(11), orange(11)];
  const check = validateTurn(
    snapshot([meld(existing)], [addition, ...group]),
    snapshot([meld([...existing, addition]), meld(group)], []),
    false,
  );
  assert.equal(check.ok, true);
  assert.equal(check.openingPoints, 33);
});

test('un joker ne compte pas dans la pose initiale', () => {
  const [a, b, j, spare] = [red(12), blue(12), joker(), orange(2)];
  const check = validateTurn(
    snapshot([], [a, b, j, spare]),
    snapshot([meld(a, b, j)], [spare]),
    false,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /joker/);
});

test('une combinaison avec joker est bloquee : ses tuiles ne se dispersent pas', () => {
  const j = joker();
  const [b5, b7] = [blue(5), blue(7)];
  const [b3, b4, b8, b9] = [blue(3), blue(4), blue(8), blue(9)];
  const [r12, n12] = [red(12), black(12)];
  const check = validateTurn(
    snapshot([meld(b5, j, b7)], [b3, b4, b8, b9, r12, n12]),
    snapshot([meld(b3, b4, b5), meld(b7, b8, b9), meld(r12, n12, j)], []),
    true,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /joker/);
});

test('completer une combinaison avec joker reste permis', () => {
  const j = joker();
  const [b5, b7, b8] = [blue(5), blue(7), blue(8)];
  const check = validateTurn(
    snapshot([meld(b5, j, b7)], [b8]),
    snapshot([meld(b5, j, b7, b8)], []),
    true,
  );
  assert.equal(check.ok, true);
});

test('un tour sans aucune tuile posee est refuse', () => {
  const existing = [blue(4), blue(5), blue(6)];
  const rack = [red(1), red(2)];
  const check = validateTurn(snapshot([meld(existing)], rack), snapshot([meld(existing)], rack), true);
  assert.equal(check.ok, false);
  assert.match(check.reason, /au moins une tuile/);
});

test('une tuile ne peut ni apparaitre ni disparaitre', () => {
  const rack = [red(1), red(2), red(3)];
  const check = validateTurn(snapshot([], rack), snapshot([meld(rack)], [blue(8)]), true);
  assert.equal(check.ok, false);
});

test('la table ne peut pas contenir de combinaison invalide en fin de tour', () => {
  const existing = [blue(4), blue(5), blue(6)];
  const played = red(9);
  const check = validateTurn(
    snapshot([meld(existing)], [played]),
    snapshot([meld([...existing, played])], []),
    true,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /n'est pas valide/);
});

test('une manipulation de la table est permise apres la pose initiale', () => {
  const black5 = black(5);
  const blue5 = blue(5);
  const red5 = red(5);
  const orange5 = orange(5);
  const black3 = black(3);
  const black4 = black(4);
  const check = validateTurn(
    snapshot([meld(black5, blue5, red5)], [orange5, black3, black4]),
    snapshot([meld(blue5, red5, orange5), meld(black3, black4, black5)], []),
    true,
  );
  assert.equal(check.ok, true);
  assert.equal(check.tilesPlayed.length, 3);
});

test('un joker repris sur la table ne peut pas rester en main', () => {
  const j = joker();
  const [b5, b7, b4, b6] = [blue(5), blue(7), blue(4), blue(6)];
  const filler = [red(1), red(2), red(3)];
  const check = validateTurn(
    snapshot([meld(b5, j, b7)], [b4, b6, ...filler]),
    snapshot([meld(b4, b5, b6, b7), meld(filler)], [j]),
    true,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /joker/);
});

test('un joker repris peut etre rejoue dans le meme tour', () => {
  const j = joker();
  const [b5, b7, b6] = [blue(5), blue(7), blue(6)];
  const [r12, n12] = [red(12), black(12)];
  const check = validateTurn(
    snapshot([meld(b5, j, b7)], [b6, r12, n12]),
    snapshot([meld(b5, b6, b7), meld(r12, n12, j)], []),
    true,
  );
  assert.equal(check.ok, true);
});

test('une tuile posee ne peut pas revenir dans le chevalet', () => {
  const [r1, r2, r3, r4] = [red(1), red(2), red(3), red(4)];
  const group = [blue(8), black(8), orange(8)];
  const check = validateTurn(
    snapshot([meld(r1, r2, r3, r4)], group),
    snapshot([meld(r1, r2, r3), meld(group)], [r4]),
    true,
  );
  assert.equal(check.ok, false);
  assert.match(check.reason, /déjà posée/);
});

test('une combinaison de deux tuiles laissee sur la table est refusee', () => {
  const [r1, r2, r3, played] = [red(1), red(2), red(3), blue(8)];
  const check = validateTurn(
    snapshot([meld(r1, r2, r3)], [played]),
    snapshot([newMeld([r1, r2]), newMeld([r3, played])], []),
    true,
  );
  assert.equal(check.ok, false);
});

test('une combinaison provisoire recoit un identifiant definitif a la validation', () => {
  const group = [red(9), blue(9), black(9)];
  const spare = red(1);
  const state = {
    players: [
      { id: 0, name: 'A', difficulty: null, rack: [...group, spare], hasOpened: true, score: 0 },
      { id: 1, name: 'B', difficulty: null, rack: [blue(2)], hasOpened: true, score: 0 },
    ],
    board: [],
    pool: [orange(4)],
    currentPlayerIndex: 0,
    consecutivePasses: 0,
    endReason: null,
    winnerIndex: null,
  };
  // Une combinaison créée à la main porte un identifiant provisoire négatif : s'il survivait à
  // la validation, il pourrait resurgir en double et une pose viserait deux combinaisons.
  const result = commitTurn(state, [newMeld(group, -7)], [spare]);
  assert.equal(result.ok, true);
  assert.ok(result.state.board.every((m) => m.id > 0), 'identifiant provisoire persisté');
});

// ------------------------------------------------------------------ solveur

const solver = (pointWeight = 1) => createSolver({ nodeBudget: 200000, timeLimitMs: 8000, tileWeight: 100, pointWeight });

test('le solveur repere une suite evidente', () => {
  const rack = [red(4), red(5), red(6), blue(12)];
  assert.equal(solutionTiles(solver().solve(rack, [])), 3);
});

test('le solveur laisse en main ce qui ne se combine pas', () => {
  assert.equal(solutionTiles(solver().solve([red(4), blue(9), black(2)], [])), 0);
});

test('le solveur casse un groupe pour placer davantage de tuiles', () => {
  // Ajouter simplement le 5 orange ne poserait qu'une tuile ; déplacer le 5 noir vers une suite
  // noire permet d'en poser trois.
  const board = [black(5), blue(5), red(5)];
  const rack = [orange(5), black(3), black(4)];
  assert.equal(solutionTiles(solver().solve([...board, ...rack], board)), 6);
});

test('le solveur replace obligatoirement les tuiles de la table', () => {
  const board = [blue(1), blue(2), blue(3)];
  const rack = [red(10), black(10), orange(10)];
  const solution = solver().solve([...board, ...rack], board);
  assert.equal(solutionTiles(solution), 6);
  assert.equal(solution.melds.length, 2);
});

test('un jeu impossible a replacer ne donne aucune solution', () => {
  const board = [blue(1), blue(2)];
  assert.equal(solver().solve(board, board), null);
});

test('la penalite de joker dissuade de le gaspiller', () => {
  const rack = [blue(10), blue(11), joker()];
  const economical = createSolver({ nodeBudget: 50000, tileWeight: 100, jokerPenalty: 400 });
  const spendthrift = createSolver({ nodeBudget: 50000, tileWeight: 100, jokerPenalty: 0 });
  assert.equal(solutionTiles(economical.solve(rack, [])), 0);
  assert.equal(solutionTiles(spendthrift.solve(rack, [])), 3);
});

test('le solveur maximise les points quand on le lui demande', () => {
  const rack = [red(1), red(2), red(3), red(13), blue(13), black(13)];
  const byPoints = createSolver({ nodeBudget: 50000, tileWeight: 1, pointWeight: 100 });
  assert.ok(solutionPoints(byPoints.solve(rack, [])) >= 45);
});

test('les combinaisons produites sont toutes valides une fois materialisees', () => {
  const board = [black(5), blue(5), red(5)];
  const rack = [orange(5), black(3), black(4), blue(9)];
  const solution = solver().solve([...board, ...rack], board);
  const laid = materialize(solution.melds, board, rack, (tiles) => newMeld(tiles));
  assert.ok(laid);
  for (const m of laid.melds) {
    assert.ok(analyseMeld(m.tiles), `combinaison invalide : ${JSON.stringify(m.tiles)}`);
  }
  const placed = laid.melds.flatMap((m) => m.tiles);
  const placedIds = new Set(placed.map((x) => x.id));
  for (const boardTile of board) assert.ok(placedIds.has(boardTile.id));
  assert.equal(placed.length, placedIds.size);
  assert.equal(board.length + rack.length, placed.length + laid.remainingRack.length);
});

// ------------------------------------------------------------------ déroulé de partie

function playRound(difficulty, seed) {
  let state = startRound({
    humanName: 'IA 1',
    opponentNames: ['IA 2', 'IA 3'],
    difficulty,
    random: makeRandom(seed),
  });
  assert.equal(totalTiles(state), 106);

  let turns = 0;
  while (!isRoundOver(state) && turns < 3000) {
    const before = state.currentPlayerIndex;
    const move = chooseMove(state, difficulty);
    if (move.type === 'play') {
      const result = commitTurn(state, move.board, move.rack);
      assert.ok(result.ok, `coup illégal en ${difficulty} (graine ${seed}) : ${result.reason}`);
      state = result.state;
    } else {
      state = drawAndPass(state);
    }
    assert.equal(totalTiles(state), 106, 'des tuiles se sont volatilisées');
    for (const m of state.board) {
      assert.ok(analyseMeld(m.tiles), `combinaison invalide laissée sur la table`);
    }
    if (!isRoundOver(state)) {
      assert.equal(state.currentPlayerIndex, (before + 1) % state.players.length);
    }
    turns += 1;
  }
  assert.ok(isRoundOver(state), "la manche ne s'est jamais terminée");
  return state;
}

test('la distribution initiale respecte les regles', () => {
  const state = startRound({
    opponentNames: ['A', 'B', 'C'],
    difficulty: 'easy',
    random: makeRandom(7),
  });
  assert.equal(state.players.length, 4);
  for (const p of state.players) assert.equal(p.rack.length, INITIAL_RACK_SIZE);
  assert.equal(state.pool.length, 106 - 4 * INITIAL_RACK_SIZE);
  assert.equal(state.board.length, 0);
  assert.ok(state.players.every((p) => !p.hasOpened));
});

test('une manche en difficulte facile se termine proprement', () => {
  for (let seed = 0; seed < 4; seed += 1) playRound('easy', seed);
});

test('une manche en difficulte moderee se termine proprement', () => {
  for (let seed = 0; seed < 2; seed += 1) playRound('medium', 100 + seed);
});

test('une manche en difficulte difficile se termine proprement', () => {
  playRound('hard', 42);
});

test('le score de la manche recompense le gagnant du total des mains adverses', () => {
  const state = playRound('medium', 2024);
  const winner = state.winnerIndex;
  const losses = state.players
    .filter((_, index) => index !== winner)
    .reduce((sum, p) => sum - p.score, 0);
  assert.equal(state.players[winner].score, losses);
  assert.equal(state.players.reduce((sum, p) => sum + p.score, 0), 0);
});

test('un joueur virtuel n ouvre jamais en dessous de 30 points', () => {
  for (let seed = 0; seed < 3; seed += 1) {
    let state = startRound({
      humanName: 'IA 1',
      opponentNames: ['IA 2'],
      difficulty: 'medium',
      random: makeRandom(500 + seed),
    });
    let turns = 0;
    while (!isRoundOver(state) && turns < 400) {
      const index = state.currentPlayerIndex;
      const openedBefore = state.players[index].hasOpened;
      const boardBefore = state.board.map((m) => m.tiles.map((x) => x.id).sort().join(','));
      const move = chooseMove(state, 'medium');
      state = move.type === 'play'
        ? commitTurn(state, move.board, move.rack).state
        : drawAndPass(state);
      if (!openedBefore && state.players[index].hasOpened) {
        const points = state.board
          .filter((m) => !boardBefore.includes(m.tiles.map((x) => x.id).sort().join(',')))
          .reduce((sum, m) => sum + analyseMeld(m.tiles).points, 0);
        assert.ok(points >= INITIAL_MELD_POINTS, `pose initiale de ${points} points seulement`);
      }
      turns += 1;
    }
  }
});

test('la force des adversaires progresse avec le niveau du joueur', () => {
  let previousBudget = 0;
  let previousTime = 0;
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const profile = profileForLevel(level);
    assert.ok(profile.nodeBudget > previousBudget, `budget en recul au niveau ${level}`);
    assert.ok(profile.timeLimitMs >= previousTime, `temps en recul au niveau ${level}`);
    previousBudget = profile.nodeBudget;
    previousTime = profile.timeLimitMs;
  }
  assert.equal(profileForLevel(1).extendsExistingMelds, false);
  assert.equal(profileForLevel(EXTENDS_FROM_LEVEL).extendsExistingMelds, true);
  assert.equal(profileForLevel(REARRANGES_FROM_LEVEL - 1).rearrangesBoard, false);
  assert.equal(profileForLevel(REARRANGES_FROM_LEVEL).rearrangesBoard, true);
  // Hors bornes, le profil est ramené dans l'échelle au lieu de produire des réglages absurdes.
  assert.equal(profileForLevel(0).level, 1);
  assert.equal(profileForLevel(99).level, MAX_LEVEL);
});

test('une manche au niveau maximal se termine proprement', () => {
  playRound(MAX_LEVEL, 11);
});

test('le niveau modere fait mieux que le niveau facile', () => {
  let tilesMedium = 0;
  let tilesEasy = 0;
  for (let seed = 0; seed < 8; seed += 1) {
    let state = startRound({
      humanName: 'Modérée',
      opponentNames: ['Facile'],
      difficulty: 'easy',
      random: makeRandom(9000 + seed),
    });
    const levels = ['medium', 'easy'];
    let turns = 0;
    while (!isRoundOver(state) && turns < 1500) {
      const move = chooseMove(state, levels[state.currentPlayerIndex]);
      state = move.type === 'play'
        ? commitTurn(state, move.board, move.rack).state
        : drawAndPass(state);
      turns += 1;
    }
    tilesMedium += state.players[0].rack.length;
    tilesEasy += state.players[1].rack.length;
  }
  assert.ok(
    tilesMedium < tilesEasy,
    `modéré ${tilesMedium} tuiles restantes contre ${tilesEasy} pour facile`,
  );
});

test('les couleurs officielles sont au nombre de quatre', () => {
  assert.equal(COLORS.length, 4);
  assert.equal(HUMAN_INDEX, 0);
});
