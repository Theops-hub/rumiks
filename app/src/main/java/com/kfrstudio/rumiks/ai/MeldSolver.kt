package com.kfrstudio.rumiks.ai

import com.kfrstudio.rumiks.model.MAX_NUMBER
import com.kfrstudio.rumiks.model.MIN_MELD_SIZE
import com.kfrstudio.rumiks.model.MIN_NUMBER
import com.kfrstudio.rumiks.model.MeldKind
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.TileColor

private const val COLORS = 4
private const val SLOTS = COLORS * MAX_NUMBER

/** Emplacement d'une combinaison planifiée : une tuile précise, ou un joker si [color] est nul. */
data class PlannedTile(val color: TileColor?, val number: Int) {
    val isJoker: Boolean get() = color == null
}

/** Combinaison planifiée par le solveur, pas encore rattachée à des tuiles concrètes. */
data class MeldPlan(val kind: MeldKind, val slots: List<PlannedTile>, val points: Int) {
    val size: Int get() = slots.size
    val jokerCount: Int get() = slots.count { it.isJoker }
}

data class Solution(val score: Int, val melds: List<MeldPlan>) {
    val tilesUsed: Int get() = melds.sumOf { it.size }
    val points: Int get() = melds.sumOf { it.points }
}

private data class SolverKey(val a: Long, val b: Long, val c: Long, val d: Long)

private fun index(color: Int, number: Int) = color * MAX_NUMBER + (number - 1)

/**
 * Cherche comment répartir un ensemble de tuiles en combinaisons valides.
 *
 * Le problème posé est celui d'un tour de Rummikub avec manipulation de la table : toutes les
 * tuiles déjà posées (`required`) doivent se retrouver dans une combinaison valide, et on veut
 * y caser en plus le maximum de tuiles du chevalet. Comme deux tuiles de même couleur et même
 * numéro sont interchangeables, le solveur raisonne sur des compteurs plutôt que sur des tuiles
 * individuelles ; les identités sont réattribuées ensuite par [materialize].
 *
 * La recherche est une exploration en profondeur avec mémoïsation, plafonnée par [nodeBudget] :
 * c'est ce plafond, avec les pondérations, qui distingue les niveaux de difficulté.
 *
 * Le score maximisé vaut `tileWeight` par tuile posée plus `pointWeight` par point de
 * combinaison, moins `jokerPenalty` par joker consommé.
 *
 * Limite assumée : lorsqu'une tuile réelle est disponible à une position d'une suite, le
 * solveur ne teste pas la variante consistant à lui préférer un joker. Avec deux jokers dans
 * tout le jeu, le coup manqué est marginal.
 */
class MeldSolver(
    private val nodeBudget: Int = 60_000,
    private val tileWeight: Int = 100,
    private val pointWeight: Int = 0,
    private val jokerPenalty: Int = 0,
    /** Garde-fou supplémentaire pour que l'interface ne se fige jamais sur un cas pathologique. */
    private val timeLimitMs: Long = 4_000L,
) {
    private var deadline = Long.MAX_VALUE

    private val avail = IntArray(SLOTS)
    private var availJokers = 0
    private val req = IntArray(SLOTS)
    private var reqJokers = 0

    private var nodes = 0
    private var exhausted = false
    private val memo = HashMap<SolverKey, Solution?>()

    /** `true` si la recherche a été interrompue par le plafond de nœuds. */
    var budgetExceeded: Boolean = false
        private set

    /**
     * @param available toutes les tuiles utilisables (table + chevalet).
     * @param required les tuiles qui doivent impérativement finir dans une combinaison, c'est
     *   à dire celles déjà posées sur la table.
     */
    fun solve(available: List<Tile>, required: List<Tile>): Solution? {
        avail.fill(0)
        req.fill(0)
        availJokers = 0
        reqJokers = 0
        nodes = 0
        exhausted = false
        budgetExceeded = false
        deadline = System.currentTimeMillis() + timeLimitMs
        memo.clear()

        for (tile in available) {
            if (tile.isJoker) availJokers++ else avail[index(tile.color.ordinal, tile.number)]++
        }
        for (tile in required) {
            if (tile.isJoker) reqJokers++ else req[index(tile.color.ordinal, tile.number)]++
        }

        val result = search()
        budgetExceeded = exhausted
        return result
    }

    private fun key(): SolverKey {
        var a = 0L
        var b = 0L
        var c = 0L
        var d = 0L
        for (i in 0 until 32) {
            a = a or (avail[i].toLong() shl (i * 2))
            c = c or (req[i].toLong() shl (i * 2))
        }
        for (i in 32 until SLOTS) {
            b = b or (avail[i].toLong() shl ((i - 32) * 2))
            d = d or (req[i].toLong() shl ((i - 32) * 2))
        }
        b = b or (availJokers.toLong() shl 40)
        d = d or (reqJokers.toLong() shl 40)
        return SolverKey(a, b, c, d)
    }

    private fun search(): Solution? {
        if (exhausted) return null
        if (++nodes > nodeBudget) {
            exhausted = true
            return null
        }
        if (nodes and 0x3FF == 0 && System.currentTimeMillis() > deadline) {
            exhausted = true
            return null
        }

        val cacheKey = key()
        memo[cacheKey]?.let { return it }
        if (memo.containsKey(cacheKey)) return null

        val forcedSlot = (0 until SLOTS).firstOrNull { req[it] > 0 }
        val result: Solution? = when {
            forcedSlot != null -> branchOn(forcedSlot, mandatory = true)
            reqJokers > 0 -> branchOnJoker()
            else -> branchFree()
        }

        if (!exhausted) memo[cacheKey] = result
        return result
    }

    /** Toutes les combinaisons passant par [slot], plus l'option de renoncer à cette tuile. */
    private fun branchOn(slot: Int, mandatory: Boolean): Solution? {
        val color = slot / MAX_NUMBER
        val number = slot % MAX_NUMBER + 1

        var best: Solution? = null
        if (!mandatory) {
            // Brancher « cette tuile reste au chevalet ».
            avail[slot]--
            best = search()
            avail[slot]++
        }

        for (plan in candidates(color, number)) {
            val outcome = tryPlan(plan) ?: continue
            if (best == null || outcome.score > best.score) best = outcome
        }
        return best
    }

    /**
     * Cas de figure rare : il ne reste plus à replacer que des jokers venus de la table. Toute
     * combinaison contenant un joker contient aussi au moins une tuile réelle, on énumère donc
     * les combinaisons passant par chaque tuile encore disponible.
     */
    private fun branchOnJoker(): Solution? {
        var best: Solution? = null
        val seen = HashSet<MeldPlan>()
        for (slot in 0 until SLOTS) {
            if (avail[slot] == 0) continue
            val color = slot / MAX_NUMBER
            val number = slot % MAX_NUMBER + 1
            for (plan in candidates(color, number)) {
                if (plan.jokerCount == 0 || !seen.add(plan)) continue
                val outcome = tryPlan(plan) ?: continue
                if (best == null || outcome.score > best.score) best = outcome
            }
        }
        return best
    }

    /** Plus aucune obligation : on continue tant qu'on peut encore poser des tuiles. */
    private fun branchFree(): Solution? {
        val slot = (0 until SLOTS).firstOrNull { avail[it] > 0 } ?: return Solution(0, emptyList())
        return branchOn(slot, mandatory = false)
    }

    /** Applique un plan, poursuit la recherche, puis rétablit l'état exactement comme il était. */
    private fun tryPlan(plan: MeldPlan): Solution? {
        val undo = applyPlan(plan)
        val rest = search()
        undoPlan(plan, undo)
        if (rest == null) return null
        val gain = plan.size * tileWeight + plan.points * pointWeight - plan.jokerCount * jokerPenalty
        return Solution(rest.score + gain, listOf(plan) + rest.melds)
    }

    /**
     * Consomme les tuiles du plan. Le retour retient précisément les obligations qui ont été
     * levées, faute de quoi le retour arrière les rétablirait de travers.
     */
    private fun applyPlan(plan: MeldPlan): PlanUndo {
        val clearedSlots = ArrayList<Int>(plan.size)
        var clearedJokers = 0
        for (slotTile in plan.slots) {
            if (slotTile.isJoker) {
                availJokers--
                if (reqJokers > 0) {
                    reqJokers--
                    clearedJokers++
                }
            } else {
                val i = index(slotTile.color!!.ordinal, slotTile.number)
                avail[i]--
                if (req[i] > 0) {
                    req[i]--
                    clearedSlots += i
                }
            }
        }
        return PlanUndo(clearedSlots, clearedJokers)
    }

    private fun undoPlan(plan: MeldPlan, undo: PlanUndo) {
        for (slotTile in plan.slots) {
            if (slotTile.isJoker) {
                availJokers++
            } else {
                avail[index(slotTile.color!!.ordinal, slotTile.number)]++
            }
        }
        for (i in undo.clearedSlots) req[i]++
        reqJokers += undo.clearedJokers
    }

    private class PlanUndo(val clearedSlots: List<Int>, val clearedJokers: Int)

    private fun candidates(color: Int, number: Int): List<MeldPlan> {
        val plans = ArrayList<MeldPlan>(32)
        addGroups(color, number, plans)
        addRuns(color, number, plans)
        return plans
    }

    private fun addGroups(color: Int, number: Int, out: MutableList<MeldPlan>) {
        val others = (0 until COLORS).filter { it != color && avail[index(it, number)] > 0 }
        for (mask in 0 until (1 shl others.size)) {
            val chosen = ArrayList<Int>(COLORS)
            chosen += color
            others.forEachIndexed { bit, c -> if (mask and (1 shl bit) != 0) chosen += c }
            for (jokers in 0..availJokers) {
                val size = chosen.size + jokers
                if (size < MIN_MELD_SIZE || size > COLORS) continue
                val slots = chosen.map { PlannedTile(TileColor.entries[it], number) } +
                    List(jokers) { PlannedTile(null, number) }
                out += MeldPlan(MeldKind.GROUP, slots, number * size)
            }
        }
    }

    private fun addRuns(color: Int, number: Int, out: MutableList<MeldPlan>) {
        val tileColor = TileColor.entries[color]
        for (start in MIN_NUMBER..number) {
            // Une fenêtre trop pauvre en tuiles réelles épuise les jokers ; l'allonger encore ne
            // peut qu'aggraver le manque, on abandonne donc ce point de départ.
            windows@ for (end in maxOf(number, start + MIN_MELD_SIZE - 1)..MAX_NUMBER) {
                var jokersNeeded = 0
                val slots = ArrayList<PlannedTile>(end - start + 1)
                for (p in start..end) {
                    if (avail[index(color, p)] > 0) {
                        slots += PlannedTile(tileColor, p)
                    } else {
                        jokersNeeded++
                        if (jokersNeeded > availJokers) break@windows
                        slots += PlannedTile(null, p)
                    }
                }
                out += MeldPlan(MeldKind.RUN, slots, (start..end).sum())
            }
        }
    }
}
