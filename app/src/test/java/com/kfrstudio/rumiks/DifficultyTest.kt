package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.ai.AiMove
import com.kfrstudio.rumiks.ai.AiPlayer
import com.kfrstudio.rumiks.engine.CommitResult
import com.kfrstudio.rumiks.engine.commitTurn
import com.kfrstudio.rumiks.engine.drawAndPass
import com.kfrstudio.rumiks.engine.startRound
import com.kfrstudio.rumiks.model.Difficulty
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/**
 * Vérifie que les trois niveaux ne sont pas trois étiquettes sur le même joueur : un niveau
 * supérieur doit se traduire par des tuiles descendues plus vite et des manches gagnées.
 */
class DifficultyTest {

    private class Duel(val a: Difficulty, val b: Difficulty, val timeLimitMs: Long?) {
        var tilesLeftA = 0
        var tilesLeftB = 0
        var winsA = 0
        var winsB = 0
    }

    private fun runDuel(duel: Duel, rounds: Int) {
        val players = listOf(
            AiPlayer(duel.a, duel.timeLimitMs),
            AiPlayer(duel.b, duel.timeLimitMs),
        )
        repeat(rounds) { seed ->
            var state = startRound(
                humanName = duel.a.label,
                opponentNames = listOf(duel.b.label),
                difficulty = duel.b,
                random = Random(9_000 + seed),
            )
            var turns = 0
            while (!state.isRoundOver && turns < 1_500) {
                val ai = players[state.currentPlayerIndex]
                state = when (val move = ai.chooseMove(state)) {
                    is AiMove.Play -> when (val result = state.commitTurn(move.board, move.rack)) {
                        is CommitResult.Accepted -> result.state
                        is CommitResult.Rejected -> throw AssertionError(result.reason)
                    }
                    AiMove.Draw -> state.drawAndPass()
                }
                turns++
            }
            duel.tilesLeftA += state.players[0].rack.size
            duel.tilesLeftB += state.players[1].rack.size
            when (state.winnerIndex) {
                0 -> duel.winsA++
                1 -> duel.winsB++
            }
        }
    }

    @Test
    fun `le niveau modere fait mieux que le niveau facile`() {
        val duel = Duel(Difficulty.MEDIUM, Difficulty.EASY, timeLimitMs = null)
        runDuel(duel, rounds = 12)
        assertTrue(
            "modéré : ${duel.winsA} manches et ${duel.tilesLeftA} tuiles restantes ; " +
                "facile : ${duel.winsB} manches et ${duel.tilesLeftB} tuiles restantes",
            duel.tilesLeftA < duel.tilesLeftB,
        )
    }

    @Test
    fun `le niveau difficile fait mieux que le niveau facile`() {
        val duel = Duel(Difficulty.HARD, Difficulty.EASY, timeLimitMs = 600L)
        runDuel(duel, rounds = 10)
        assertTrue(
            "difficile : ${duel.winsA} manches et ${duel.tilesLeftA} tuiles restantes ; " +
                "facile : ${duel.winsB} manches et ${duel.tilesLeftB} tuiles restantes",
            duel.tilesLeftA < duel.tilesLeftB,
        )
        assertTrue("le niveau difficile devrait gagner la majorité", duel.winsA > duel.winsB)
    }
}
