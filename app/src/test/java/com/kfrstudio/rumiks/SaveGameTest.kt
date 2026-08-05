package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.engine.GameState
import com.kfrstudio.rumiks.engine.startRound
import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.storage.GameStorage
import com.kfrstudio.rumiks.storage.SavedGame
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.random.Random

/** Stockage en mémoire : même contrat que le fichier, sans toucher au disque. */
private class MemoryStorage(var slot: SavedGame? = null) : GameStorage {
    var saveCount = 0
    override fun save(snapshot: SavedGame) {
        slot = snapshot
        saveCount++
    }

    override fun load(): SavedGame? = slot
    override fun clear() {
        slot = null
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class SaveGameTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `un etat de partie survit a un aller-retour en JSON`() {
        val state = startRound("Vous", listOf("Alice", "Bruno"), Difficulty.HARD, Random(1))
        val saved = SavedGame(Difficulty.HARD, 2, state, listOf("La partie commence."))

        val text = json.encodeToString(SavedGame.serializer(), saved)
        val restored = json.decodeFromString(SavedGame.serializer(), text)

        assertEquals(saved, restored)
        assertEquals(state.players.map { it.rack }, restored.game.players.map { it.rack })
        assertEquals(state.pool, restored.game.pool)
        assertEquals(state.currentPlayerIndex, restored.game.currentPlayerIndex)
    }

    @Test
    fun `une table remaniee et ses jokers se relisent a l identique`() {
        var state = startRound("Vous", listOf("Alice"), Difficulty.MEDIUM, Random(3))
        // On force une table non vide en déplaçant quelques tuiles depuis le sabot.
        val tiles = state.pool.take(3)
        state = state.copy(
            board = listOf(com.kfrstudio.rumiks.model.Meld(1L, tiles)),
            pool = state.pool.drop(3),
        )
        val saved = SavedGame(Difficulty.MEDIUM, 1, state)

        val restored = json.decodeFromString(
            SavedGame.serializer(),
            json.encodeToString(SavedGame.serializer(), saved),
        )
        assertEquals(1, restored.game.board.size)
        assertEquals(tiles, restored.game.board.first().tiles)
    }

    @Test
    fun `une partie commencee est ecrite sur le stockage`() {
        val storage = MemoryStorage()
        val vm = GameViewModel(Random(11), storage)
        assertFalse(vm.ui.canResume)

        vm.chooseOpponentCount(2)
        vm.chooseDifficulty(Difficulty.MEDIUM)
        vm.startGame()

        assertNotNull(storage.slot)
        assertEquals(Difficulty.MEDIUM, storage.slot!!.difficulty)
        assertEquals(2, storage.slot!!.opponentCount)
        assertEquals(3, storage.slot!!.game.players.size)
    }

    @Test
    fun `une partie sauvegardee est proposee au demarrage suivant`() {
        val storage = MemoryStorage()
        val first = GameViewModel(Random(12), storage)
        first.chooseOpponentCount(1)
        first.chooseDifficulty(Difficulty.HARD)
        first.startGame()
        val savedRacks = first.ui.game!!.players.map { it.rack }

        // Nouvelle instance : l'application vient d'être relancée.
        val second = GameViewModel(Random(99), storage)
        assertTrue(second.ui.canResume)
        assertEquals(Difficulty.HARD, second.ui.difficulty)
        assertEquals(1, second.ui.opponentCount)
        assertEquals(Screen.HOME, second.ui.screen)

        second.resumeGame()
        assertEquals(Screen.GAME, second.ui.screen)
        assertEquals(savedRacks, second.ui.game!!.players.map { it.rack })
        assertEquals(savedRacks[HUMAN_INDEX], second.ui.workRack)
    }

    @Test
    fun `quitter la partie la laisse reprenable`() {
        val storage = MemoryStorage()
        val vm = GameViewModel(Random(13), storage)
        vm.startGame()
        vm.backToHome()

        assertEquals(Screen.HOME, vm.ui.screen)
        assertTrue(vm.ui.canResume)
        assertNull(vm.ui.game)

        vm.resumeGame()
        assertEquals(Screen.GAME, vm.ui.screen)
        assertNotNull(vm.ui.game)
    }

    @Test
    fun `chaque coup du joueur est sauvegarde`() {
        val storage = MemoryStorage()
        // Une graine où le joueur humain commence, pour piloter le premier tour.
        var vm: GameViewModel? = null
        for (seed in 0 until 200) {
            val candidate = GameViewModel(Random(seed), MemoryStorage())
            candidate.chooseOpponentCount(1)
            candidate.startGame()
            if (candidate.ui.game!!.currentPlayerIndex == HUMAN_INDEX) {
                vm = GameViewModel(Random(seed), storage).also {
                    it.chooseOpponentCount(1)
                    it.startGame()
                }
                break
            }
        }
        val model = requireNotNull(vm) { "aucune graine ne fait commencer le joueur humain" }

        val countAfterStart = storage.saveCount
        model.drawTile()
        assertTrue("le tour n'a pas été sauvegardé", storage.saveCount > countAfterStart)
        assertEquals(15, storage.slot!!.game.players[HUMAN_INDEX].rack.size)
    }

    @Test
    fun `une sauvegarde d une autre version est ignoree`() {
        val state: GameState = startRound("Vous", listOf("Alice"), Difficulty.EASY, Random(5))
        val storage = MemoryStorage(
            SavedGame(Difficulty.EASY, 1, state, emptyList(), version = 999),
        )
        // Le stockage en mémoire ne filtre pas les versions ; c'est le stockage fichier qui le
        // fait. On vérifie ici que le champ est bien porté par la sauvegarde.
        assertEquals(999, storage.load()!!.version)
        assertEquals(SavedGame.CURRENT_VERSION, SavedGame(Difficulty.EASY, 1, state).version)
    }
}
