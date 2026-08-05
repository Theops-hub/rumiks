package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.ai.AiMove
import com.kfrstudio.rumiks.ai.AiPlayer
import com.kfrstudio.rumiks.engine.CommitResult
import com.kfrstudio.rumiks.engine.GameState
import com.kfrstudio.rumiks.engine.INITIAL_RACK_SIZE
import com.kfrstudio.rumiks.engine.drawAndPass
import com.kfrstudio.rumiks.engine.commitTurn
import com.kfrstudio.rumiks.engine.startRound
import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.model.analyseMeld
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class GameFlowTest {

    private fun totalTiles(state: GameState): Int =
        state.pool.size + state.players.sumOf { it.rack.size } + state.board.sumOf { it.tiles.size }

    /** Joue une manche complète entre joueurs virtuels en contrôlant chaque coup. */
    private fun playRound(difficulty: Difficulty, seed: Int, timeLimitMs: Long?): GameState {
        var state = startRound(
            humanName = "IA 1",
            opponentNames = listOf("IA 2", "IA 3"),
            difficulty = difficulty,
            random = Random(seed),
        )
        assertEquals(106, totalTiles(state))

        val ai = AiPlayer(difficulty, timeLimitMs)
        var turns = 0
        while (!state.isRoundOver && turns < 3_000) {
            val playerBefore = state.currentPlayerIndex
            when (val move = ai.chooseMove(state)) {
                is AiMove.Play -> {
                    when (val result = state.commitTurn(move.board, move.rack)) {
                        is CommitResult.Rejected ->
                            throw AssertionError(
                                "coup illégal proposé par le niveau $difficulty (graine $seed) : " +
                                    result.reason,
                            )
                        is CommitResult.Accepted -> state = result.state
                    }
                }
                AiMove.Draw -> state = state.drawAndPass()
            }

            assertEquals("des tuiles se sont volatilisées", 106, totalTiles(state))
            for (meld in state.board) {
                assertNotNull(
                    "combinaison invalide laissée sur la table : ${meld.tiles}",
                    analyseMeld(meld.tiles),
                )
            }
            if (!state.isRoundOver) {
                assertEquals(
                    "la main n'a pas changé de joueur",
                    (playerBefore + 1) % state.players.size,
                    state.currentPlayerIndex,
                )
            }
            turns++
        }
        assertTrue("la manche ne s'est jamais terminée", state.isRoundOver)
        return state
    }

    @Test
    fun `la distribution initiale respecte les regles`() {
        val state = startRound("Moi", listOf("A", "B", "C"), Difficulty.EASY, Random(7))
        assertEquals(4, state.players.size)
        state.players.forEach { assertEquals(INITIAL_RACK_SIZE, it.rack.size) }
        assertEquals(106 - 4 * INITIAL_RACK_SIZE, state.pool.size)
        assertTrue(state.board.isEmpty())
        assertTrue(state.players.none { it.hasOpened })
    }

    @Test
    fun `une manche en difficulte facile se termine proprement`() {
        repeat(5) { seed -> playRound(Difficulty.EASY, seed, timeLimitMs = null) }
    }

    @Test
    fun `une manche en difficulte moderee se termine proprement`() {
        repeat(3) { seed -> playRound(Difficulty.MEDIUM, 100 + seed, timeLimitMs = null) }
    }

    @Test
    fun `une manche en difficulte difficile se termine proprement`() {
        // Le temps de réflexion est bridé pour que la suite de tests reste rapide ; la logique
        // exercée est la même.
        playRound(Difficulty.HARD, 42, timeLimitMs = 250L)
    }

    @Test
    fun `le score de la manche recompense le gagnant du total des mains adverses`() {
        val state = playRound(Difficulty.MEDIUM, 2024, timeLimitMs = null)
        val winner = state.winnerIndex!!
        val losses = state.players.filterIndexed { index, _ -> index != winner }.sumOf { -it.score }
        assertEquals(losses, state.players[winner].score)
        assertEquals(0, state.players.sumOf { it.score })
    }

    @Test
    fun `un joueur virtuel n ouvre pas en dessous de 30 points`() {
        // Sur plusieurs manches, aucun joueur ne doit passer à l'état « ouvert » sans avoir
        // franchi le seuil : c'est le moteur qui l'empêche, on vérifie que l'IA ne triche pas.
        repeat(3) { seed ->
            var state = startRound("IA 1", listOf("IA 2"), Difficulty.MEDIUM, Random(500 + seed))
            val ai = AiPlayer(Difficulty.MEDIUM)
            var turns = 0
            while (!state.isRoundOver && turns < 400) {
                val index = state.currentPlayerIndex
                val openedBefore = state.players[index].hasOpened
                val boardBefore = state.board
                state = when (val move = ai.chooseMove(state)) {
                    is AiMove.Play -> (state.commitTurn(move.board, move.rack) as CommitResult.Accepted).state
                    AiMove.Draw -> state.drawAndPass()
                }
                if (!openedBefore && state.players[index].hasOpened) {
                    val previousIds = boardBefore.map { meld -> meld.tiles.map { it.id }.toSet() }
                    val fresh = state.board.filter { meld ->
                        meld.tiles.map { it.id }.toSet() !in previousIds
                    }
                    val points = fresh.sumOf { analyseMeld(it.tiles)!!.points }
                    assertTrue("pose initiale de $points points seulement", points >= 30)
                }
                turns++
            }
        }
    }
}
