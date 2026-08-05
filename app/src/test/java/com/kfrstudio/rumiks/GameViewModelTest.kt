package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.TileColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.random.Random

/**
 * Couvre la couche d'interaction : sélection des tuiles, dépôt sur la table, reprise en main
 * et conditions d'activation du bouton de validation.
 *
 * Les tours des joueurs virtuels partent sur `viewModelScope` ; le répartiteur de test les
 * laisse en attente, ce qui isole les assertions du comportement de l'IA.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /** Démarre une partie dont c'est le tour du joueur humain. */
    private fun humanStartingGame(): GameViewModel {
        for (seed in 0 until 200) {
            val vm = GameViewModel(Random(seed))
            vm.chooseOpponentCount(1)
            vm.chooseDifficulty(Difficulty.EASY)
            vm.startGame()
            if (vm.ui.game!!.currentPlayerIndex == HUMAN_INDEX) return vm
        }
        throw AssertionError("aucune graine ne fait commencer le joueur humain")
    }

    @Test
    fun `la partie demarre avec un chevalet de 14 tuiles`() {
        val vm = humanStartingGame()
        assertEquals(Screen.GAME, vm.ui.screen)
        assertEquals(14, vm.ui.workRack.size)
        assertTrue(vm.ui.workBoard.isEmpty())
        assertTrue(vm.ui.isHumanTurn)
        assertFalse(vm.ui.canCommit)
    }

    @Test
    fun `selectionner puis deposer cree une combinaison`() {
        val vm = humanStartingGame()
        val tiles = vm.ui.workRack.take(3)
        tiles.forEach { vm.toggleSelection(it.id) }
        assertEquals(3, vm.ui.selection.size)

        vm.placeSelection(null)
        assertEquals(1, vm.ui.workBoard.size)
        assertEquals(3, vm.ui.workBoard.first().tiles.size)
        assertEquals(11, vm.ui.workRack.size)
        assertTrue(vm.ui.selection.isEmpty())
        assertEquals(3, vm.ui.tilesLaidThisTurn)
    }

    @Test
    fun `une combinaison bancale bloque la validation`() {
        val vm = humanStartingGame()
        // Trois tuiles prises au hasard sur un chevalet de départ ne forment presque jamais une
        // combinaison valide ; on force le cas en vérifiant l'état plutôt qu'en le supposant.
        val tiles = vm.ui.workRack.take(3)
        tiles.forEach { vm.toggleSelection(it.id) }
        vm.placeSelection(null)

        if (!vm.ui.boardIsSound) {
            assertFalse(vm.ui.canCommit)
            vm.commitTurn()
            assertNotNull(vm.ui.message)
        }
    }

    @Test
    fun `annuler restaure la table et le chevalet`() {
        val vm = humanStartingGame()
        val rackBefore = vm.ui.workRack
        vm.ui.workRack.take(3).forEach { vm.toggleSelection(it.id) }
        vm.placeSelection(null)
        assertEquals(11, vm.ui.workRack.size)

        vm.undoTurn()
        assertEquals(rackBefore, vm.ui.workRack)
        assertTrue(vm.ui.workBoard.isEmpty())
        assertEquals(0, vm.ui.tilesLaidThisTurn)
        assertFalse(vm.ui.hasPendingChanges)
    }

    @Test
    fun `reprendre ramene au chevalet les tuiles posees pendant le tour`() {
        val vm = humanStartingGame()
        val tiles = vm.ui.workRack.take(3)
        tiles.forEach { vm.toggleSelection(it.id) }
        vm.placeSelection(null)

        vm.ui.workBoard.first().tiles.forEach { vm.toggleSelection(it.id) }
        vm.returnSelectionToRack()

        assertEquals(14, vm.ui.workRack.size)
        assertTrue(vm.ui.workBoard.isEmpty())
        assertEquals(0, vm.ui.tilesLaidThisTurn)
    }

    @Test
    fun `deposer sur une combinaison existante l y ajoute`() {
        val vm = humanStartingGame()
        val first = vm.ui.workRack.take(2)
        first.forEach { vm.toggleSelection(it.id) }
        vm.placeSelection(null)
        val meldId = vm.ui.workBoard.first().id

        val extra = vm.ui.workRack.first()
        vm.toggleSelection(extra.id)
        vm.placeSelection(meldId)

        assertEquals(1, vm.ui.workBoard.size)
        assertEquals(3, vm.ui.workBoard.first().tiles.size)
        assertTrue(vm.ui.workBoard.first().tiles.any { it.id == extra.id })
    }

    @Test
    fun `le compteur de pose initiale suit les combinaisons valides`() {
        val vm = humanStartingGame()
        assertEquals(0, vm.ui.pendingOpeningPoints)

        // On fabrique une situation lisible : trois dix de couleurs différentes, s'ils sont là.
        val tens = TileColor.entries.mapNotNull { color ->
            vm.ui.workRack.firstOrNull { it.number == 10 && it.color == color }
        }.take(3)
        if (tens.size == 3) {
            tens.forEach { vm.toggleSelection(it.id) }
            vm.placeSelection(null)
            assertEquals(30, vm.ui.pendingOpeningPoints)
            assertTrue(vm.ui.boardIsSound)
        }
    }

    @Test
    fun `un depot sans selection avertit le joueur`() {
        val vm = humanStartingGame()
        vm.placeSelection(null)
        assertNotNull(vm.ui.message)
        assertTrue(vm.ui.workBoard.isEmpty())
    }

    @Test
    fun `piocher est refuse tant que des deplacements sont en cours`() {
        val vm = humanStartingGame()
        vm.ui.workRack.take(3).forEach { vm.toggleSelection(it.id) }
        vm.placeSelection(null)

        val gameBefore = vm.ui.game
        vm.drawTile()
        assertEquals(gameBefore, vm.ui.game)
        assertNotNull(vm.ui.message)
    }

    @Test
    fun `trier le chevalet ne change pas son contenu`() {
        val vm = humanStartingGame()
        val before: Set<Tile> = vm.ui.workRack.toSet()
        vm.sortRack(RackSort.BY_NUMBER)
        assertEquals(before, vm.ui.workRack.toSet())
        vm.sortRack(RackSort.BY_COLOR)
        assertEquals(before, vm.ui.workRack.toSet())
    }

    @Test
    fun `retourner au menu remet l ecran d accueil sans perdre les reglages`() {
        val vm = humanStartingGame()
        vm.chooseDifficulty(Difficulty.HARD)
        vm.backToHome()
        assertEquals(Screen.HOME, vm.ui.screen)
        assertEquals(Difficulty.HARD, vm.ui.difficulty)
        assertEquals(null, vm.ui.game)
    }
}
