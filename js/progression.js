// Progression du joueur : expérience et niveau.
//
// L'expérience se gagne à la fin de chaque partie, selon ce que le joueur y a accompli :
// tuiles posées, victoire en criant Rummikub, et position au classement final. Le niveau
// découle de l'expérience cumulée, et c'est lui qui règle la force des adversaires : plus le
// joueur progresse, plus le jeu devient coriace.

/** Au-delà, la difficulté ne progresse plus : c'est le jeu le plus fort que le solveur offre. */
export const MAX_LEVEL = 10;

/** Chaque tuile posée pendant la partie rapporte ce montant. */
export const XP_PER_TILE = 1;

/** Supplément quand la partie est gagnée en criant Rummikub (chevalet vidé). */
export const XP_RUMMIKUB_BONUS = 10;

/** Prime de classement final : 1er, 2e, 3e, 4e. Tout le monde gagne quelque chose. */
export const XP_BY_RANK = [40, 20, 10, 5];

/**
 * Expérience totale requise pour atteindre un niveau. L'écart entre deux niveaux successifs
 * croît linéairement (100, 200, 300…) : les premiers niveaux tombent en une partie ou deux,
 * les derniers se méritent.
 */
export function xpFloorForLevel(level) {
  const clamped = Math.min(Math.max(Math.round(level), 1), MAX_LEVEL);
  return 50 * clamped * (clamped - 1);
}

/** Expérience à accumuler pour passer du niveau donné au suivant. */
export function xpForNextLevel(level) {
  return 100 * Math.min(Math.max(Math.round(level), 1), MAX_LEVEL);
}

/** Niveau correspondant à une expérience cumulée. */
export function levelForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpFloorForLevel(level + 1)) level += 1;
  return level;
}

/**
 * Ramène une progression enregistrée à sa forme courante `{ xp }`. Les enregistrements de la
 * première version ne connaissaient que le niveau : il est converti en son plancher
 * d'expérience, pour que personne ne reparte de zéro.
 */
export function normalizeProgress(raw) {
  const xp = Number(raw?.xp);
  if (Number.isFinite(xp)) return { xp: Math.max(0, Math.round(xp)) };
  const level = Number(raw?.level);
  if (Number.isFinite(level)) return { xp: xpFloorForLevel(level) };
  return { xp: 0 };
}

/**
 * Expérience gagnée à la fin d'une partie. `rank` est la position au classement final,
 * à partir de 1 ; `rummikub` vaut vrai quand la partie est gagnée en vidant son chevalet.
 */
export function computeGameXp({ tilesLaid, rummikub, rank }) {
  const tiles = tilesLaid * XP_PER_TILE;
  const rummikubBonus = rummikub ? XP_RUMMIKUB_BONUS : 0;
  const position = XP_BY_RANK[Math.min(Math.max(Math.round(rank), 1), XP_BY_RANK.length) - 1];
  return {
    tiles,
    rummikubBonus,
    position,
    total: tiles + rummikubBonus + position,
  };
}
