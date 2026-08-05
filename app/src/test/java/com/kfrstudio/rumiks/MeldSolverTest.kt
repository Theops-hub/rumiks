package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.ai.MeldSolver
import com.kfrstudio.rumiks.ai.materialize
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.analyseMeld
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MeldSolverTest {

    private val t = Tiles()

    private fun solver(pointWeight: Int = 1) =
        MeldSolver(nodeBudget = 200_000, tileWeight = 100, pointWeight = pointWeight)

    @Test
    fun `le solveur repere une suite evidente`() {
        val rack = listOf(t.red(4), t.red(5), t.red(6), t.blue(12))
        val solution = solver().solve(rack, emptyList())
        assertNotNull(solution)
        assertEquals(3, solution!!.tilesUsed)
    }

    @Test
    fun `le solveur laisse en main ce qui ne se combine pas`() {
        val rack = listOf(t.red(4), t.blue(9), t.black(2))
        val solution = solver().solve(rack, emptyList())
        assertNotNull(solution)
        assertEquals(0, solution!!.tilesUsed)
    }

    @Test
    fun `le solveur casse un groupe pour placer davantage de tuiles`() {
        // Table : le groupe des 5. Chevalet : le 5 orange et les 3 et 4 noirs.
        // Ajouter simplement le 5 orange ne poserait qu'une tuile ; déplacer le 5 noir vers une
        // suite noire permet d'en poser trois.
        val black5 = t.black(5)
        val blue5 = t.blue(5)
        val red5 = t.red(5)
        val board = listOf(black5, blue5, red5)
        val rack = listOf(t.orange(5), t.black(3), t.black(4))

        val solution = solver().solve(board + rack, board)
        assertNotNull(solution)
        assertEquals(6, solution!!.tilesUsed)
    }

    @Test
    fun `le solveur replace obligatoirement les tuiles de la table`() {
        val board = listOf(t.blue(1), t.blue(2), t.blue(3))
        val rack = listOf(t.red(10), t.black(10), t.orange(10))
        val solution = solver().solve(board + rack, board)
        assertNotNull(solution)
        assertEquals(6, solution!!.tilesUsed)
        assertEquals(2, solution.melds.size)
    }

    @Test
    fun `un jeu impossible a replacer ne donne aucune solution`() {
        // Une paire seule sur la table ne peut faire partie d'aucune combinaison valide.
        val board = listOf(t.blue(1), t.blue(2))
        val solution = solver().solve(board, board)
        assertEquals(null, solution)
    }

    @Test
    fun `la penalite de joker dissuade de le gaspiller`() {
        // 10 et 11 bleus plus un joker : la suite 10-11-12 est possible, mais elle consomme le
        // joker pour ne poser que trois tuiles.
        val rack = listOf(t.blue(10), t.blue(11), t.joker())
        val economical = MeldSolver(nodeBudget = 50_000, tileWeight = 100, jokerPenalty = 400)
            .solve(rack, emptyList())
        val spendthrift = MeldSolver(nodeBudget = 50_000, tileWeight = 100, jokerPenalty = 0)
            .solve(rack, emptyList())

        assertEquals(0, economical!!.tilesUsed)
        assertEquals(3, spendthrift!!.tilesUsed)
    }

    @Test
    fun `le solveur maximise les points quand on le lui demande`() {
        // Le chevalet permet soit la suite 1-2-3 (6 points), soit le groupe des 13 (39 points).
        val rack = listOf(
            t.red(1), t.red(2), t.red(3),
            t.red(13), t.blue(13), t.black(13),
        )
        val byPoints = MeldSolver(nodeBudget = 50_000, tileWeight = 1, pointWeight = 100)
            .solve(rack, emptyList())
        assertNotNull(byPoints)
        assertTrue(byPoints!!.points >= 45)
    }

    @Test
    fun `les combinaisons produites sont toutes valides une fois materialisees`() {
        val board = listOf(t.black(5), t.blue(5), t.red(5))
        val rack = listOf(t.orange(5), t.black(3), t.black(4), t.blue(9))

        val solution = solver().solve(board + rack, board)!!
        val laid = materialize(solution.melds, board, rack, firstMeldId = 1L)
        assertNotNull(laid)

        for (meld in laid!!.melds) {
            assertNotNull("combinaison invalide : ${meld.tiles}", analyseMeld(meld.tiles))
        }
        // Toutes les tuiles de la table sont bien replacées, aucune n'est dupliquée.
        val placed: List<Tile> = laid.melds.flatMap { it.tiles }
        assertTrue(placed.map { it.id }.containsAll(board.map { it.id }))
        assertEquals(placed.size, placed.map { it.id }.distinct().size)
        assertEquals((board + rack).size, placed.size + laid.remainingRack.size)
    }
}
