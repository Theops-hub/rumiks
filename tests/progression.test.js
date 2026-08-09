// Tests de la progression : expérience, niveaux, migration des anciens enregistrements.
// Exécution : node --test web/tests/progression.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MANCHES_PER_GAME,
  MAX_LEVEL,
  XP_BY_RANK,
  XP_PER_MANCHE_WON,
  XP_PER_TILE,
  XP_RUMMIKUB_BONUS,
  computeGameXp,
  levelForXp,
  normalizeProgress,
  xpFloorForLevel,
  xpForNextLevel,
} from '../js/progression.js';

test('le niveau part de 1 et ne depasse jamais le maximum', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(xpFloorForLevel(2) - 1), 1);
  assert.equal(levelForXp(xpFloorForLevel(2)), 2);
  assert.equal(levelForXp(xpFloorForLevel(MAX_LEVEL)), MAX_LEVEL);
  assert.equal(levelForXp(10 * xpFloorForLevel(MAX_LEVEL)), MAX_LEVEL);
});

test('les seuils de niveau croissent et restent coherents', () => {
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    assert.equal(
      xpFloorForLevel(level) + xpForNextLevel(level),
      xpFloorForLevel(level + 1),
      `seuil incohérent entre les niveaux ${level} et ${level + 1}`,
    );
  }
});

test('l experience d une partie se decompose et s additionne', () => {
  const gain = computeGameXp({ tilesLaid: 40, manchesWon: 2, rummikubs: 1, rank: 1 });
  assert.equal(gain.tiles, 40 * XP_PER_TILE);
  assert.equal(gain.manches, 2 * XP_PER_MANCHE_WON);
  assert.equal(gain.rummikubBonus, XP_RUMMIKUB_BONUS);
  assert.equal(gain.position, XP_BY_RANK[0]);
  assert.equal(gain.total, gain.tiles + gain.manches + gain.rummikubBonus + gain.position);
});

test('meme dernier, un joueur gagne un peu d experience', () => {
  const gain = computeGameXp({ tilesLaid: 0, manchesWon: 0, rummikubs: 0, rank: 4 });
  assert.ok(gain.total > 0);
});

test('un rang hors bornes est ramene dans le bareme', () => {
  assert.equal(computeGameXp({ tilesLaid: 0, manchesWon: 0, rummikubs: 0, rank: 0 }).position, XP_BY_RANK[0]);
  assert.equal(
    computeGameXp({ tilesLaid: 0, manchesWon: 0, rummikubs: 0, rank: 9 }).position,
    XP_BY_RANK[XP_BY_RANK.length - 1],
  );
});

test('les progressions de l ancienne version sont converties sans perte de niveau', () => {
  assert.deepEqual(normalizeProgress({ level: 4 }), { xp: xpFloorForLevel(4) });
  assert.equal(levelForXp(normalizeProgress({ level: 4 }).xp), 4);
  assert.deepEqual(normalizeProgress({ xp: 250 }), { xp: 250 });
  assert.deepEqual(normalizeProgress(null), { xp: 0 });
  assert.deepEqual(normalizeProgress({ level: 'abc' }), { xp: 0 });
});

test('une partie compte plusieurs manches', () => {
  assert.ok(MANCHES_PER_GAME >= 2);
});
