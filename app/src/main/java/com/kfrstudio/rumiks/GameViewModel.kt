package com.kfrstudio.rumiks

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.kfrstudio.rumiks.ai.AiMove
import com.kfrstudio.rumiks.ai.AiPlayer
import com.kfrstudio.rumiks.engine.CommitResult
import com.kfrstudio.rumiks.engine.GameState
import com.kfrstudio.rumiks.engine.INITIAL_MELD_POINTS
import com.kfrstudio.rumiks.engine.RoundEndReason
import com.kfrstudio.rumiks.engine.commitTurn
import com.kfrstudio.rumiks.engine.drawAndPass
import com.kfrstudio.rumiks.engine.sortedByNumberThenColor
import com.kfrstudio.rumiks.engine.sortedForRack
import com.kfrstudio.rumiks.engine.startRound
import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.model.Meld
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.feedback.FeedbackEvent
import com.kfrstudio.rumiks.feedback.GameFeedback
import com.kfrstudio.rumiks.model.analyseMeld
import com.kfrstudio.rumiks.storage.FileGameStorage
import com.kfrstudio.rumiks.storage.GameStorage
import com.kfrstudio.rumiks.storage.InMemorySettings
import com.kfrstudio.rumiks.storage.NoGameStorage
import com.kfrstudio.rumiks.storage.SavedGame
import com.kfrstudio.rumiks.storage.SettingsStore
import com.kfrstudio.rumiks.storage.SharedPreferencesSettings
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.random.Random

const val HUMAN_INDEX = 0

private val OPPONENT_NAMES = listOf("Alice", "Bruno", "Chloé")

enum class Screen { HOME, GAME }

enum class RackSort { BY_COLOR, BY_NUMBER }

data class GameUiState(
    val screen: Screen = Screen.HOME,
    val difficulty: Difficulty = Difficulty.MEDIUM,
    val opponentCount: Int = 2,
    val game: GameState? = null,
    /** Table telle que le joueur est en train de la remanier. */
    val workBoard: List<Meld> = emptyList(),
    /** Chevalet du joueur humain en cours de tour. */
    val workRack: List<Tile> = emptyList(),
    val selection: Set<Int> = emptySet(),
    val message: String? = null,
    val log: List<String> = emptyList(),
    val aiThinking: Boolean = false,
    val showRules: Boolean = false,
    val showRoundEnd: Boolean = false,
    /** Une partie interrompue attend d'être reprise depuis l'accueil. */
    val canResume: Boolean = false,
    val soundEnabled: Boolean = true,
    val hapticsEnabled: Boolean = true,
) {
    val isHumanTurn: Boolean
        get() = game != null && !game.isRoundOver && game.currentPlayerIndex == HUMAN_INDEX && !aiThinking

    /** Tuiles descendues du chevalet depuis le début du tour. */
    val tilesLaidThisTurn: Int
        get() = (game?.players?.get(HUMAN_INDEX)?.rack?.size ?: 0) - workRack.size

    val boardIsSound: Boolean
        get() = workBoard.all { it.tiles.size >= 3 && analyseMeld(it.tiles) != null }

    val canCommit: Boolean
        get() {
            val game = game ?: return false
            if (!isHumanTurn || tilesLaidThisTurn <= 0 || !boardIsSound) return false
            // Sans pose initiale, inutile de proposer la validation avant le seuil.
            return game.players[HUMAN_INDEX].hasOpened ||
                pendingOpeningPoints >= INITIAL_MELD_POINTS
        }

    /**
     * Points de la pose initiale en cours de constitution, pour que le joueur qui n'a pas encore
     * ouvert voie où il en est du seuil des 30 points.
     */
    val pendingOpeningPoints: Int
        get() {
            val game = game ?: return 0
            if (game.players[HUMAN_INDEX].hasOpened) return 0
            val alreadyThere = game.board.map { meld -> meld.tiles.map { it.id }.toSet() }
            return workBoard
                .filter { meld -> meld.tiles.map { it.id }.toSet() !in alreadyThere }
                .sumOf { analyseMeld(it.tiles)?.points ?: 0 }
        }

    /**
     * Vrai si la table ou le chevalet diffèrent réellement du début de tour. La comparaison porte
     * sur la répartition des tuiles, pas sur leur ordre : ranger une combinaison ne compte pas
     * comme un coup entamé.
     */
    val hasPendingChanges: Boolean
        get() {
            val game = game ?: return false
            if (workRack.size != game.players[HUMAN_INDEX].rack.size) return true
            val before = game.board.map { meld -> meld.tiles.map { it.id }.toSet() }.toSet()
            val after = workBoard.map { meld -> meld.tiles.map { it.id }.toSet() }.toSet()
            return before != after
        }
}

class GameViewModel(
    /** Injectable pour rendre les manches reproductibles dans les tests. */
    private val random: Random = Random.Default,
    private val storage: GameStorage = NoGameStorage,
    private val settings: SettingsStore = InMemorySettings(),
    /** Fil sur lequel tourne la recherche des joueurs virtuels ; substituable dans les tests. */
    private val aiDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    var ui by mutableStateOf(GameUiState())
        private set

    /**
     * Événements sonores et tactiles à jouer. Le canal est à capacité limitée et sans suspension :
     * si une rafale de coups arrive plus vite que la lecture, mieux vaut perdre un effet que
     * retarder la partie.
     */
    private val _feedback = MutableSharedFlow<FeedbackEvent>(extraBufferCapacity = 8)
    val feedback: SharedFlow<FeedbackEvent> = _feedback.asSharedFlow()

    private var savedGame: SavedGame? = null

    init {
        savedGame = storage.load()
        ui = ui.copy(
            soundEnabled = settings.soundEnabled,
            hapticsEnabled = settings.hapticsEnabled,
        )
        savedGame?.let { saved ->
            ui = ui.copy(
                canResume = true,
                difficulty = saved.difficulty,
                opponentCount = saved.opponentCount,
            )
        }
    }

    private fun emit(effect: GameFeedback, haptic: Boolean = true) {
        _feedback.tryEmit(FeedbackEvent(effect, haptic))
    }

    fun toggleSound() {
        val enabled = !ui.soundEnabled
        settings.soundEnabled = enabled
        ui = ui.copy(soundEnabled = enabled)
        if (enabled) emit(GameFeedback.SELECT)
    }

    fun toggleHaptics() {
        val enabled = !ui.hapticsEnabled
        settings.hapticsEnabled = enabled
        ui = ui.copy(hapticsEnabled = enabled)
        if (enabled) emit(GameFeedback.SELECT)
    }

    /**
     * Les combinaisons créées par le joueur prennent des identifiants négatifs : les joueurs
     * virtuels et le moteur n'utilisent que des positifs, aucune collision n'est possible.
     */
    private var nextTempMeldId = -1L

    // ---------------------------------------------------------------- écran d'accueil

    fun chooseDifficulty(difficulty: Difficulty) {
        ui = ui.copy(difficulty = difficulty)
    }

    fun chooseOpponentCount(count: Int) {
        ui = ui.copy(opponentCount = count.coerceIn(1, OPPONENT_NAMES.size))
    }

    fun toggleRules(show: Boolean) {
        ui = ui.copy(showRules = show)
    }

    fun startGame() = startRoundWith(emptyList())

    fun nextRound() {
        val scores = ui.game?.players?.map { it.score } ?: emptyList()
        startRoundWith(scores)
    }

    /** Quitter la partie la laisse en suspens : elle reste reprenable depuis l'accueil. */
    fun backToHome() {
        ui = GameUiState(
            difficulty = ui.difficulty,
            opponentCount = ui.opponentCount,
            canResume = savedGame != null,
        )
    }

    /** Reprend la partie interrompue, en relançant les joueurs virtuels si la main est à eux. */
    fun resumeGame() {
        val saved = savedGame ?: return
        ui = ui.copy(
            screen = Screen.GAME,
            difficulty = saved.difficulty,
            opponentCount = saved.opponentCount,
            game = saved.game,
            workBoard = saved.game.board,
            workRack = saved.game.players[HUMAN_INDEX].rack,
            selection = emptySet(),
            message = null,
            log = saved.log.ifEmpty { listOf("Partie reprise.") },
            aiThinking = false,
            showRoundEnd = saved.game.isRoundOver,
        )
        val state = saved.game
        if (!state.isRoundOver && state.currentPlayerIndex != HUMAN_INDEX) runAiTurns()
    }

    /**
     * Écrit l'état validé sur disque. L'opération est synchrone : le fichier fait quelques
     * dizaines de kilo-octets, et une écriture différée risquerait d'être perdue si le système
     * ferme l'application juste après.
     */
    private fun persist() {
        val state = ui.game ?: return
        val snapshot = SavedGame(
            difficulty = ui.difficulty,
            opponentCount = ui.opponentCount,
            game = state,
            log = ui.log,
        )
        savedGame = snapshot
        storage.save(snapshot)
    }

    private fun startRoundWith(carriedScores: List<Int>) {
        val state = startRound(
            humanName = "Vous",
            opponentNames = OPPONENT_NAMES.take(ui.opponentCount),
            difficulty = ui.difficulty,
            random = random,
            carriedScores = carriedScores,
        )
        ui = ui.copy(
            screen = Screen.GAME,
            game = state,
            workBoard = state.board,
            workRack = state.players[HUMAN_INDEX].rack,
            selection = emptySet(),
            message = null,
            log = listOf("La partie commence. C'est à ${state.currentPlayer.name}."),
            showRoundEnd = false,
            canResume = true,
        )
        persist()
        if (state.currentPlayerIndex != HUMAN_INDEX) runAiTurns()
    }

    // ---------------------------------------------------------------- manipulation des tuiles

    fun toggleSelection(tileId: Int) {
        if (!ui.isHumanTurn) return
        val selection = ui.selection
        ui = ui.copy(
            selection = if (tileId in selection) selection - tileId else selection + tileId,
            message = null,
        )
        emit(GameFeedback.SELECT)
    }

    fun clearSelection() {
        ui = ui.copy(selection = emptySet())
    }

    /** Envoie la sélection sur une combinaison existante, ou en crée une si [meldId] est nul. */
    fun placeSelection(meldId: Long?) {
        if (!ui.isHumanTurn) return
        val selection = ui.selection
        if (selection.isEmpty()) {
            ui = ui.copy(message = "Choisissez d'abord une ou plusieurs tuiles.")
            emit(GameFeedback.REJECT)
            return
        }

        val moved = collectSelected(selection)
        if (moved.isEmpty()) return

        var board = ui.workBoard.map { meld ->
            meld.copy(tiles = meld.tiles.filter { it.id !in selection })
        }
        val rack = ui.workRack.filter { it.id !in selection }

        board = if (meldId == null) {
            board.filter { it.tiles.isNotEmpty() } + Meld(nextTempMeldId--, reorder(moved))
        } else {
            board.map { meld ->
                if (meld.id == meldId) meld.copy(tiles = reorder(meld.tiles + moved)) else meld
            }.filter { it.tiles.isNotEmpty() }
        }

        ui = ui.copy(workBoard = board, workRack = rack, selection = emptySet(), message = null)
        emit(GameFeedback.PLACE)
    }

    /** Ramène la sélection au chevalet ; seules les tuiles posées durant ce tour sont reprenables. */
    fun returnSelectionToRack() {
        if (!ui.isHumanTurn) return
        val game = ui.game ?: return
        val committedBoardIds = game.board.flatMap { it.tiles }.map { it.id }.toSet()
        val selection = ui.selection
        // Seules les tuiles actuellement sur la table sont concernées, et uniquement celles que
        // le joueur vient d'y descendre.
        val moved = ui.workBoard.flatMap { it.tiles }
            .filter { it.id in selection && it.id !in committedBoardIds }
        if (moved.isEmpty()) {
            ui = ui.copy(
                message = "Ces tuiles étaient déjà sur la table avant votre tour : elles y restent.",
                selection = emptySet(),
            )
            emit(GameFeedback.REJECT)
            return
        }
        val movedIds = moved.map { it.id }.toSet()
        val board = ui.workBoard
            .map { meld -> meld.copy(tiles = meld.tiles.filter { it.id !in movedIds }) }
            .filter { it.tiles.isNotEmpty() }
        ui = ui.copy(
            workBoard = board,
            workRack = (ui.workRack + moved).sortedForRack(),
            selection = emptySet(),
            message = null,
        )
        emit(GameFeedback.SELECT)
    }

    fun sortRack(mode: RackSort) {
        ui = ui.copy(
            workRack = when (mode) {
                RackSort.BY_COLOR -> ui.workRack.sortedForRack()
                RackSort.BY_NUMBER -> ui.workRack.sortedByNumberThenColor()
            },
        )
    }

    fun undoTurn() {
        val game = ui.game ?: return
        ui = ui.copy(
            workBoard = game.board,
            workRack = game.players[HUMAN_INDEX].rack,
            selection = emptySet(),
            message = null,
        )
    }

    private fun collectSelected(selection: Set<Int>): List<Tile> {
        val fromRack = ui.workRack.filter { it.id in selection }
        val fromBoard = ui.workBoard.flatMap { it.tiles }.filter { it.id in selection }
        return fromRack + fromBoard
    }

    /** Range les tuiles dans l'ordre naturel de la combinaison dès qu'elle est valide. */
    private fun reorder(tiles: List<Tile>): List<Tile> =
        analyseMeld(tiles)?.ordered ?: tiles

    // ---------------------------------------------------------------- fin de tour

    fun commitTurn() {
        val game = ui.game ?: return
        if (!ui.isHumanTurn) return
        when (val result = game.commitTurn(ui.workBoard, ui.workRack)) {
            is CommitResult.Rejected -> {
                ui = ui.copy(message = result.reason)
                emit(GameFeedback.REJECT)
            }
            is CommitResult.Accepted -> {
                emit(GameFeedback.COMMIT)
                val laid = result.tilesPlayed
                applyNewState(
                    result.state,
                    "Vous posez $laid tuile${if (laid > 1) "s" else ""}.",
                )
            }
        }
    }

    fun drawTile() {
        val game = ui.game ?: return
        if (!ui.isHumanTurn) return
        if (ui.hasPendingChanges) {
            ui = ui.copy(message = "Annulez d'abord vos déplacements en cours.")
            emit(GameFeedback.REJECT)
            return
        }
        val message = if (game.pool.isEmpty()) "Pioche vide : vous passez." else "Vous piochez une tuile."
        emit(GameFeedback.DRAW)
        applyNewState(game.drawAndPass(), message)
    }

    private fun applyNewState(state: GameState, logLine: String) {
        ui = ui.copy(
            game = state,
            workBoard = state.board,
            workRack = state.players[HUMAN_INDEX].rack,
            selection = emptySet(),
            message = null,
            log = (ui.log + logLine).takeLast(30),
        )
        persist()
        if (state.isRoundOver) {
            announceRoundEnd(state)
        } else if (state.currentPlayerIndex != HUMAN_INDEX) {
            runAiTurns()
        }
    }

    private fun announceRoundEnd(state: GameState) {
        val winner = state.winnerIndex?.let { state.players[it].name } ?: "personne"
        val reason = when (state.endReason) {
            RoundEndReason.RUMMIKUB -> "Rummikub ! $winner a posé sa dernière tuile."
            RoundEndReason.BLOCKED -> "Pioche épuisée : $winner a le chevalet le plus léger."
            null -> ""
        }
        ui = ui.copy(log = (ui.log + reason).takeLast(30), showRoundEnd = true, aiThinking = false)
        emit(GameFeedback.ROUND_END)
        persist()
    }

    fun dismissRoundEnd() {
        ui = ui.copy(showRoundEnd = false)
    }

    fun dismissMessage() {
        ui = ui.copy(message = null)
    }

    // ---------------------------------------------------------------- tours des joueurs virtuels

    private fun runAiTurns() {
        viewModelScope.launch {
            ui = ui.copy(aiThinking = true)
            while (true) {
                val state = ui.game ?: break
                if (state.isRoundOver || state.currentPlayerIndex == HUMAN_INDEX) break

                val player = state.currentPlayer
                delay(500)
                val move = withContext(aiDispatcher) {
                    AiPlayer(player.difficulty ?: ui.difficulty).chooseMove(state)
                }

                val next: GameState
                val line: String
                when (move) {
                    is AiMove.Play -> {
                        when (val result = state.commitTurn(move.board, move.rack)) {
                            is CommitResult.Accepted -> {
                                next = result.state
                                val laid = result.tilesPlayed
                                line = "${player.name} pose $laid tuile${if (laid > 1) "s" else ""}."
                                emit(GameFeedback.PLACE, haptic = false)
                            }
                            is CommitResult.Rejected -> {
                                // Filet de sécurité : plutôt que d'imposer un coup douteux, le
                                // joueur virtuel pioche.
                                next = state.drawAndPass()
                                line = "${player.name} pioche."
                                emit(GameFeedback.DRAW, haptic = false)
                            }
                        }
                    }
                    AiMove.Draw -> {
                        next = state.drawAndPass()
                        line = if (state.pool.isEmpty()) "${player.name} passe." else "${player.name} pioche."
                        emit(GameFeedback.DRAW, haptic = false)
                    }
                }

                ui = ui.copy(
                    game = next,
                    workBoard = next.board,
                    workRack = next.players[HUMAN_INDEX].rack,
                    log = (ui.log + line).takeLast(30),
                )
                persist()
                if (next.isRoundOver) {
                    announceRoundEnd(next)
                    return@launch
                }
            }
            ui = ui.copy(aiThinking = false, selection = emptySet())
        }
    }

    companion object {
        /** Relie le modèle au stockage sur disque ; l'application n'a qu'à fournir son contexte. */
        fun factory(context: Context): ViewModelProvider.Factory {
            val application = context.applicationContext
            val storage = FileGameStorage(application)
            val settings = SharedPreferencesSettings(application)
            return viewModelFactory {
                initializer { GameViewModel(storage = storage, settings = settings) }
            }
        }
    }
}
