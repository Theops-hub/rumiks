package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.feedback.FeedbackEvent
import com.kfrstudio.rumiks.feedback.GameFeedback
import com.kfrstudio.rumiks.storage.InMemorySettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.random.Random

/**
 * Vérifie que la partie signale bien ses moments marquants. Le son lui-même relève d'Android et
 * n'est pas joué ici : ce qui est testé, c'est que le bon événement part au bon moment, et que
 * les coups des joueurs virtuels ne déclenchent pas de vibration.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedbackTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /**
     * Tout modèle créé ici reçoit le répartiteur de test : un joueur virtuel qui réfléchirait sur
     * le répartiteur par défaut échapperait à l'ordonnanceur et ferait échouer le test.
     */
    private fun TestScope.newViewModel(seed: Int) = GameViewModel(
        random = Random(seed),
        settings = InMemorySettings(),
        aiDispatcher = UnconfinedTestDispatcher(testScheduler),
    )

    /** Démarre une partie dont c'est le tour du joueur, en collectant les événements émis. */
    private fun TestScope.gameWithFeedback(): Pair<GameViewModel, MutableList<FeedbackEvent>> {
        for (seed in 0 until 200) {
            val probe = newViewModel(seed)
            probe.chooseOpponentCount(1)
            probe.startGame()
            if (probe.ui.game!!.currentPlayerIndex != HUMAN_INDEX) continue

            val vm = newViewModel(seed)
            val events = mutableListOf<FeedbackEvent>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                vm.feedback.collect { events += it }
            }
            runCurrent()
            vm.chooseOpponentCount(1)
            vm.startGame()
            return vm to events
        }
        throw AssertionError("aucune graine ne fait commencer le joueur humain")
    }

    @Test
    fun `saisir une tuile emet un retour de selection`() = runTest {
        val (vm, events) = gameWithFeedback()
        vm.toggleSelection(vm.ui.workRack.first().id)
        assertEquals(listOf(GameFeedback.SELECT), events.map { it.effect })
        assertTrue(events.single().haptic)
    }

    @Test
    fun `deposer des tuiles emet un retour de pose`() = runTest {
        val (vm, events) = gameWithFeedback()
        vm.ui.workRack.take(3).forEach { vm.toggleSelection(it.id) }
        events.clear()

        vm.placeSelection(null)
        assertEquals(listOf(GameFeedback.PLACE), events.map { it.effect })
        assertTrue("la pose du joueur doit se sentir", events.single().haptic)
    }

    @Test
    fun `piocher emet un retour de pioche`() = runTest {
        val (vm, events) = gameWithFeedback()
        events.clear()
        vm.drawTile()
        assertTrue(events.map { it.effect }.contains(GameFeedback.DRAW))
    }

    @Test
    fun `un coup refuse emet un retour de rejet`() = runTest {
        val (vm, events) = gameWithFeedback()
        events.clear()

        // Aucune tuile n'est sélectionnée : le dépôt ne peut pas aboutir.
        vm.placeSelection(null)
        assertEquals(listOf(GameFeedback.REJECT), events.map { it.effect })
    }

    @Test
    fun `valider une pose initiale trop faible emet un rejet`() = runTest {
        val (vm, events) = gameWithFeedback()
        vm.ui.workRack.take(3).forEach { vm.toggleSelection(it.id) }
        vm.placeSelection(null)
        events.clear()

        // Trois tuiles prises au hasard n'atteignent pratiquement jamais les 30 points requis ;
        // si par chance elles y arrivent, le tour part et ce n'est plus le cas testé ici.
        if (!vm.ui.canCommit) {
            vm.commitTurn()
            assertEquals(listOf(GameFeedback.REJECT), events.map { it.effect })
        }
    }

    @Test
    fun `couper le son est retenu par les reglages`() {
        val settings = InMemorySettings()
        val vm = GameViewModel(Random(4), settings = settings)
        assertTrue(vm.ui.soundEnabled)

        vm.toggleSound()
        assertFalse(vm.ui.soundEnabled)
        assertFalse(settings.soundEnabled)

        vm.toggleHaptics()
        assertFalse(vm.ui.hapticsEnabled)
        assertFalse(settings.hapticsEnabled)

        // Une nouvelle instance repart des réglages enregistrés.
        val next = GameViewModel(Random(4), settings = settings)
        assertFalse(next.ui.soundEnabled)
        assertFalse(next.ui.hapticsEnabled)
    }

    @Test
    fun `les coups des joueurs virtuels ne font pas vibrer`() = runTest {
        // Une graine où c'est un joueur virtuel qui ouvre la manche.
        for (seed in 0 until 200) {
            val probe = newViewModel(seed)
            probe.chooseOpponentCount(1)
            probe.startGame()
            if (probe.ui.game!!.currentPlayerIndex == HUMAN_INDEX) continue

            val vm = newViewModel(seed)
            val events = mutableListOf<FeedbackEvent>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                vm.feedback.collect { events += it }
            }
            runCurrent()
            vm.chooseOpponentCount(1)
            vm.startGame()

            testScheduler.advanceTimeBy(4_000)
            runCurrent()

            assertTrue("le joueur virtuel n'a rien joué", events.isNotEmpty())
            assertTrue(
                "un coup adverse ne doit pas déclencher de vibration",
                events.none { it.haptic },
            )
            return@runTest
        }
        throw AssertionError("aucune graine ne fait commencer un joueur virtuel")
    }
}
