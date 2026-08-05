package com.kfrstudio.rumiks.ai

import com.kfrstudio.rumiks.engine.GameState
import com.kfrstudio.rumiks.engine.INITIAL_MELD_POINTS
import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.model.Meld
import com.kfrstudio.rumiks.model.Player
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.analyseMeld

sealed interface AiMove {
    /** Le joueur virtuel laisse la table dans l'état [board] et garde [rack] en main. */
    data class Play(val board: List<Meld>, val rack: List<Tile>) : AiMove

    data object Draw : AiMove
}

/** Réglages de recherche propres à chaque niveau. */
private data class Profile(
    val nodeBudget: Int,
    val timeLimitMs: Long,
    /** Coût, en centièmes de tuile, de la consommation d'un joker. */
    val jokerPenalty: Int,
    val extendsExistingMelds: Boolean,
    val rearrangesBoard: Boolean,
)

private fun profileOf(difficulty: Difficulty) = when (difficulty) {
    Difficulty.EASY -> Profile(
        nodeBudget = 3_000,
        timeLimitMs = 800L,
        jokerPenalty = 0,
        extendsExistingMelds = false,
        rearrangesBoard = false,
    )
    Difficulty.MEDIUM -> Profile(
        nodeBudget = 30_000,
        timeLimitMs = 2_000L,
        jokerPenalty = 60,
        extendsExistingMelds = true,
        rearrangesBoard = false,
    )
    Difficulty.HARD -> Profile(
        nodeBudget = 250_000,
        timeLimitMs = 5_000L,
        jokerPenalty = 140,
        extendsExistingMelds = true,
        rearrangesBoard = true,
    )
}

/**
 * Décide du coup d'un joueur virtuel.
 *
 * Les trois niveaux ne diffèrent pas par un handicap artificiel mais par l'étendue des coups
 * qu'ils envisagent : un débutant ne voit que les combinaisons qu'il peut former seul, un
 * joueur moyen sait aussi compléter ce qui est déjà posé, un joueur fort refond la table entière.
 */
class AiPlayer(
    private val difficulty: Difficulty,
    /** Permet de brider le temps de réflexion, notamment pour les tests. */
    timeLimitMsOverride: Long? = null,
) {

    private val profile = profileOf(difficulty).let { base ->
        if (timeLimitMsOverride == null) base else base.copy(timeLimitMs = timeLimitMsOverride)
    }

    fun chooseMove(state: GameState): AiMove {
        val player = state.currentPlayer
        return if (!player.hasOpened) openingMove(state, player) else regularMove(state, player)
    }

    /**
     * Pose initiale : au moins 30 points, formés exclusivement avec les tuiles du chevalet, sans
     * toucher à ce qui est déjà sur la table.
     */
    private fun openingMove(state: GameState, player: Player): AiMove {
        val rack = player.rack
        val byPoints = solver(tileWeight = 1, pointWeight = 100).solve(rack, emptyList())
        if (byPoints == null || byPoints.points < INITIAL_MELD_POINTS) return AiMove.Draw

        // Un joueur fort préfère, à seuil atteint, la pose qui vide le plus son chevalet.
        val chosen = if (difficulty == Difficulty.HARD) {
            val byTiles = solver(tileWeight = 100, pointWeight = 1).solve(rack, emptyList())
            if (byTiles != null && byTiles.points >= INITIAL_MELD_POINTS) byTiles else byPoints
        } else {
            byPoints
        }

        val laid = materialize(chosen.melds, emptyList(), rack, state.nextMeldId) ?: return AiMove.Draw
        if (laid.melds.isEmpty()) return AiMove.Draw
        return AiMove.Play(state.board + laid.melds, laid.remainingRack)
    }

    /** Tour ordinaire, une fois la pose initiale effectuée. */
    private fun regularMove(state: GameState, player: Player): AiMove {
        if (profile.rearrangesBoard) {
            rearrangeWholeBoard(state, player)?.let { return it }
        }
        return incrementalMove(state, player)
    }

    /**
     * Refonte complète : toutes les tuiles de la table doivent se retrouver dans une
     * combinaison valide, et on cherche l'agencement qui accueille le plus de tuiles du chevalet.
     */
    private fun rearrangeWholeBoard(state: GameState, player: Player): AiMove? {
        val boardTiles = state.board.flatMap { it.tiles }
        if (boardTiles.isEmpty()) return null

        val solution = solver(tileWeight = 100, pointWeight = 1)
            .solve(boardTiles + player.rack, boardTiles) ?: return null
        val laid = materialize(solution.melds, boardTiles, player.rack, state.nextMeldId) ?: return null

        val tilesPlayed = player.rack.size - laid.remainingRack.size
        // Réorganiser sans rien descendre de sa main est interdit par les règles.
        if (tilesPlayed <= 0) return null
        return AiMove.Play(laid.melds, laid.remainingRack)
    }

    /**
     * Coup sans casse : on complète éventuellement les combinaisons en place, puis on pose de
     * nouvelles combinaisons avec ce qui reste en main.
     */
    private fun incrementalMove(state: GameState, player: Player): AiMove {
        var board = state.board
        var rack = player.rack

        if (profile.extendsExistingMelds) {
            val extended = extendExistingMelds(board, rack)
            board = extended.first
            rack = extended.second
        }

        val solution = solver(tileWeight = 100, pointWeight = 1).solve(rack, emptyList())
        var finalBoard = board
        var finalRack = rack
        if (solution != null && solution.melds.isNotEmpty()) {
            val laid = materialize(solution.melds, emptyList(), rack, state.nextMeldId)
            if (laid != null) {
                finalBoard = board + laid.melds
                finalRack = laid.remainingRack
            }
        }

        if (finalRack.size == player.rack.size) return AiMove.Draw
        return AiMove.Play(finalBoard, finalRack)
    }

    /**
     * Ajoute gloutonnement les tuiles du chevalet aux combinaisons déjà posées, tant que
     * celles-ci restent valides. Les jokers sont épargnés : les dépenser en simple rallonge
     * revient à gaspiller la tuile la plus précieuse du jeu.
     */
    private fun extendExistingMelds(
        board: List<Meld>,
        rack: List<Tile>,
    ): Pair<List<Meld>, List<Tile>> {
        val melds = board.toMutableList()
        val remaining = rack.toMutableList()
        var progressed = true
        while (progressed) {
            progressed = false
            for (meldIndex in melds.indices) {
                val candidateIndex = remaining.indexOfFirst { tile ->
                    !tile.isJoker && analyseMeld(melds[meldIndex].tiles + tile) != null
                }
                if (candidateIndex >= 0) {
                    val tile = remaining.removeAt(candidateIndex)
                    val meld = melds[meldIndex]
                    val ordered = analyseMeld(meld.tiles + tile)!!.ordered
                    melds[meldIndex] = meld.copy(tiles = ordered)
                    progressed = true
                }
            }
        }
        return melds to remaining
    }

    private fun solver(tileWeight: Int, pointWeight: Int) = MeldSolver(
        nodeBudget = profile.nodeBudget,
        tileWeight = tileWeight,
        pointWeight = pointWeight,
        jokerPenalty = profile.jokerPenalty,
        timeLimitMs = profile.timeLimitMs,
    )
}

/** Combinaisons concrètes obtenues à partir d'un plan, et ce qu'il reste au chevalet. */
data class MaterializedMelds(val melds: List<Meld>, val remainingRack: List<Tile>)

/**
 * Rattache des tuiles réelles aux emplacements planifiés par le solveur.
 *
 * Les tuiles venant de la table sont servies en premier : elles doivent toutes être replacées,
 * alors que celles du chevalet peuvent rester en main. Renvoie `null` si le plan ne correspond
 * pas aux tuiles fournies, ce qui ne devrait pas arriver et vaut mieux qu'un coup incohérent.
 */
fun materialize(
    plans: List<MeldPlan>,
    boardTiles: List<Tile>,
    rackTiles: List<Tile>,
    firstMeldId: Long,
): MaterializedMelds? {
    val pools = HashMap<Int, ArrayDeque<Tile>>()
    val jokerPool = ArrayDeque<Tile>()
    fun register(tile: Tile) {
        if (tile.isJoker) {
            jokerPool.addLast(tile)
        } else {
            pools.getOrPut(tile.color.ordinal * 100 + tile.number) { ArrayDeque() }.addLast(tile)
        }
    }
    boardTiles.forEach(::register)
    rackTiles.forEach(::register)

    val consumed = HashSet<Int>()
    var meldId = firstMeldId
    val melds = ArrayList<Meld>(plans.size)
    for (plan in plans) {
        val tiles = ArrayList<Tile>(plan.size)
        for (slot in plan.slots) {
            val tile = if (slot.isJoker) {
                jokerPool.removeFirstOrNull()
            } else {
                pools[slot.color!!.ordinal * 100 + slot.number]?.removeFirstOrNull()
            } ?: return null
            consumed += tile.id
            tiles += tile
        }
        melds += Meld(meldId++, tiles)
    }
    return MaterializedMelds(melds, rackTiles.filter { it.id !in consumed })
}
