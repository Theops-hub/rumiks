// Solveur de combinaisons : comment répartir un ensemble de tuiles en combinaisons valides.
//
// Le problème posé est celui d'un tour de Rummikub avec manipulation de la table : toutes les
// tuiles déjà posées doivent se retrouver dans une combinaison valide, et on veut y caser en
// plus le maximum de tuiles du chevalet. Comme deux tuiles de même couleur et même numéro sont
// interchangeables, le solveur raisonne sur des compteurs plutôt que sur des tuiles
// individuelles ; les identités sont réattribuées ensuite par `materialize`.

import { COLORS, MAX_NUMBER, MIN_MELD_SIZE, MIN_NUMBER } from './rules.js';

const SLOTS = COLORS.length * MAX_NUMBER;

const slotIndex = (color, number) => color * MAX_NUMBER + (number - 1);

/**
 * @param {object} options
 * @param {number} options.nodeBudget plafond de nœuds explorés
 * @param {number} options.timeLimitMs garde-fou pour que l'interface ne se fige jamais
 * @param {number} options.tileWeight gain par tuile posée
 * @param {number} options.pointWeight gain par point de combinaison
 * @param {number} options.jokerPenalty coût de la consommation d'un joker
 */
export function createSolver({
  nodeBudget = 60000,
  timeLimitMs = 1200,
  tileWeight = 100,
  pointWeight = 0,
  jokerPenalty = 0,
} = {}) {
  const avail = new Int32Array(SLOTS);
  const req = new Int32Array(SLOTS);
  let availJokers = 0;
  let reqJokers = 0;
  let nodes = 0;
  let deadline = Infinity;
  let exhausted = false;
  let memo = new Map();

  function key() {
    let out = '';
    for (let i = 0; i < SLOTS; i += 4) {
      out += String.fromCharCode(
        avail[i] | (avail[i + 1] << 2) | (avail[i + 2] << 4) | (avail[i + 3] << 6),
      );
    }
    out += String.fromCharCode(availJokers);
    for (let i = 0; i < SLOTS; i += 4) {
      out += String.fromCharCode(
        req[i] | (req[i + 1] << 2) | (req[i + 2] << 4) | (req[i + 3] << 6),
      );
    }
    out += String.fromCharCode(reqJokers);
    return out;
  }

  function addGroups(color, number, out) {
    const others = [];
    for (let c = 0; c < COLORS.length; c += 1) {
      if (c !== color && avail[slotIndex(c, number)] > 0) others.push(c);
    }
    for (let mask = 0; mask < (1 << others.length); mask += 1) {
      const chosen = [color];
      others.forEach((c, bit) => {
        if (mask & (1 << bit)) chosen.push(c);
      });
      for (let jokers = 0; jokers <= availJokers; jokers += 1) {
        const size = chosen.length + jokers;
        if (size < MIN_MELD_SIZE || size > COLORS.length) continue;
        const slots = chosen.map((c) => ({ color: c, number }));
        for (let j = 0; j < jokers; j += 1) slots.push({ color: null, number });
        out.push({ slots, points: number * size, jokerCount: jokers });
      }
    }
  }

  function addRuns(color, number, out) {
    for (let start = MIN_NUMBER; start <= number; start += 1) {
      // Une fenêtre trop pauvre en tuiles réelles épuise les jokers ; l'allonger encore ne peut
      // qu'aggraver le manque, on abandonne donc ce point de départ.
      let abandon = false;
      for (let end = Math.max(number, start + MIN_MELD_SIZE - 1); end <= MAX_NUMBER; end += 1) {
        let jokersNeeded = 0;
        let points = 0;
        const slots = [];
        for (let p = start; p <= end; p += 1) {
          if (avail[slotIndex(color, p)] > 0) {
            slots.push({ color, number: p });
          } else {
            jokersNeeded += 1;
            if (jokersNeeded > availJokers) {
              abandon = true;
              break;
            }
            slots.push({ color: null, number: p });
          }
          points += p;
        }
        if (abandon) break;
        out.push({ slots, points, jokerCount: jokersNeeded });
      }
      if (abandon) continue;
    }
  }

  function candidates(color, number) {
    const out = [];
    addGroups(color, number, out);
    addRuns(color, number, out);
    return out;
  }

  function applyPlan(plan) {
    const clearedSlots = [];
    let clearedJokers = 0;
    for (const slot of plan.slots) {
      if (slot.color === null) {
        availJokers -= 1;
        if (reqJokers > 0) {
          reqJokers -= 1;
          clearedJokers += 1;
        }
      } else {
        const i = slotIndex(slot.color, slot.number);
        avail[i] -= 1;
        if (req[i] > 0) {
          req[i] -= 1;
          clearedSlots.push(i);
        }
      }
    }
    return { clearedSlots, clearedJokers };
  }

  function undoPlan(plan, undo) {
    for (const slot of plan.slots) {
      if (slot.color === null) availJokers += 1;
      else avail[slotIndex(slot.color, slot.number)] += 1;
    }
    for (const i of undo.clearedSlots) req[i] += 1;
    reqJokers += undo.clearedJokers;
  }

  function tryPlan(plan) {
    const undo = applyPlan(plan);
    const rest = search();
    undoPlan(plan, undo);
    if (rest === null) return null;
    const gain = plan.slots.length * tileWeight
      + plan.points * pointWeight
      - plan.jokerCount * jokerPenalty;
    return { score: rest.score + gain, melds: [plan, ...rest.melds] };
  }

  function branchOn(slot, mandatory) {
    const color = Math.floor(slot / MAX_NUMBER);
    const number = (slot % MAX_NUMBER) + 1;

    let best = null;
    if (!mandatory) {
      // Brancher « cette tuile reste au chevalet ».
      avail[slot] -= 1;
      best = search();
      avail[slot] += 1;
    }
    for (const plan of candidates(color, number)) {
      const outcome = tryPlan(plan);
      if (outcome !== null && (best === null || outcome.score > best.score)) best = outcome;
    }
    return best;
  }

  /**
   * Cas rare : il ne reste plus à replacer que des jokers venus de la table. Toute combinaison
   * contenant un joker contient aussi au moins une tuile réelle, on énumère donc les
   * combinaisons passant par chaque tuile encore disponible.
   */
  function branchOnJoker() {
    let best = null;
    const seen = new Set();
    for (let slot = 0; slot < SLOTS; slot += 1) {
      if (avail[slot] === 0) continue;
      const color = Math.floor(slot / MAX_NUMBER);
      const number = (slot % MAX_NUMBER) + 1;
      for (const plan of candidates(color, number)) {
        if (plan.jokerCount === 0) continue;
        const signature = plan.slots.map((s) => `${s.color}:${s.number}`).join('|');
        if (seen.has(signature)) continue;
        seen.add(signature);
        const outcome = tryPlan(plan);
        if (outcome !== null && (best === null || outcome.score > best.score)) best = outcome;
      }
    }
    return best;
  }

  function search() {
    if (exhausted) return null;
    nodes += 1;
    if (nodes > nodeBudget) {
      exhausted = true;
      return null;
    }
    if ((nodes & 0x3ff) === 0 && Date.now() > deadline) {
      exhausted = true;
      return null;
    }

    const cacheKey = key();
    if (memo.has(cacheKey)) return memo.get(cacheKey);

    let forcedSlot = -1;
    for (let i = 0; i < SLOTS; i += 1) {
      if (req[i] > 0) {
        forcedSlot = i;
        break;
      }
    }

    let result;
    if (forcedSlot >= 0) {
      result = branchOn(forcedSlot, true);
    } else if (reqJokers > 0) {
      result = branchOnJoker();
    } else {
      let free = -1;
      for (let i = 0; i < SLOTS; i += 1) {
        if (avail[i] > 0) {
          free = i;
          break;
        }
      }
      result = free < 0 ? { score: 0, melds: [] } : branchOn(free, false);
    }

    if (!exhausted) memo.set(cacheKey, result);
    return result;
  }

  return {
    /**
     * @param {Array} available toutes les tuiles utilisables (table + chevalet)
     * @param {Array} required les tuiles qui doivent finir dans une combinaison
     */
    solve(available, required) {
      avail.fill(0);
      req.fill(0);
      availJokers = 0;
      reqJokers = 0;
      nodes = 0;
      exhausted = false;
      deadline = Date.now() + timeLimitMs;
      memo = new Map();

      for (const t of available) {
        if (t.isJoker) availJokers += 1;
        else avail[slotIndex(COLORS.indexOf(t.color), t.number)] += 1;
      }
      for (const t of required) {
        if (t.isJoker) reqJokers += 1;
        else req[slotIndex(COLORS.indexOf(t.color), t.number)] += 1;
      }
      return search();
    },
  };
}

/** Nombre de tuiles d'une solution, et total de points. */
export function solutionTiles(solution) {
  return solution.melds.reduce((sum, plan) => sum + plan.slots.length, 0);
}

export function solutionPoints(solution) {
  return solution.melds.reduce((sum, plan) => sum + plan.points, 0);
}

/**
 * Rattache des tuiles réelles aux emplacements planifiés.
 *
 * Les tuiles venant de la table sont servies en premier : elles doivent toutes être replacées,
 * alors que celles du chevalet peuvent rester en main. Renvoie `null` si le plan ne correspond
 * pas aux tuiles fournies — ce qui ne devrait pas arriver, et vaut mieux qu'un coup incohérent.
 */
export function materialize(plans, boardTiles, rackTiles, makeMeld) {
  const pools = new Map();
  const jokerPool = [];
  const register = (t) => {
    if (t.isJoker) {
      jokerPool.push(t);
      return;
    }
    const poolKey = `${t.color}:${t.number}`;
    if (!pools.has(poolKey)) pools.set(poolKey, []);
    pools.get(poolKey).push(t);
  };
  boardTiles.forEach(register);
  rackTiles.forEach(register);

  const consumed = new Set();
  const melds = [];
  for (const plan of plans) {
    const tiles = [];
    for (const slot of plan.slots) {
      const picked = slot.color === null
        ? jokerPool.shift()
        : (pools.get(`${COLORS[slot.color]}:${slot.number}`) ?? []).shift();
      if (picked === undefined) return null;
      consumed.add(picked.id);
      tiles.push(picked);
    }
    melds.push(makeMeld(tiles));
  }
  return { melds, remainingRack: rackTiles.filter((t) => !consumed.has(t.id)) };
}
