package com.kfrstudio.rumiks.engine

import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.model.Meld
import com.kfrstudio.rumiks.model.Player
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.createDeck
import kotlinx.serialization.Serializable
import kotlin.random.Random

/** Nombre de tuiles distribuées à chaque joueur en début de manche. */
const val INITIAL_RACK_SIZE = 14

/** Raison pour laquelle une manche s'est terminée. */
@Serializable
enum class RoundEndReason {
    /** Un joueur a posé sa dernière tuile : « Rummikub ! ». */
    RUMMIKUB,

    /** La pioche est vide et plus personne ne peut jouer. */
    BLOCKED,
}

@Serializable
data class GameState(
    val players: List<Player>,
    val board: List<Meld>,
    val pool: List<Tile>,
    val currentPlayerIndex: Int,
    /** Tours consécutifs sans pose ; sert à détecter le blocage une fois la pioche vide. */
    val consecutivePasses: Int = 0,
    val endReason: RoundEndReason? = null,
    val winnerIndex: Int? = null,
    val nextMeldId: Long = 1L,
) {
    val currentPlayer: Player get() = players[currentPlayerIndex]
    val isRoundOver: Boolean get() = endReason != null

    fun snapshotFor(playerIndex: Int): TurnSnapshot =
        TurnSnapshot(board, players[playerIndex].rack)
}

/**
 * Distribue une nouvelle manche. [opponents] décrit les joueurs virtuels ; le joueur humain
 * occupe toujours la position 0.
 */
fun startRound(
    humanName: String,
    opponentNames: List<String>,
    difficulty: Difficulty,
    random: Random = Random.Default,
    carriedScores: List<Int> = emptyList(),
): GameState {
    val deck = createDeck().shuffled(random)
    val players = ArrayList<Player>(opponentNames.size + 1)
    var cursor = 0

    players += Player(
        id = 0,
        name = humanName,
        difficulty = null,
        rack = deck.subList(cursor, cursor + INITIAL_RACK_SIZE).toList().sortedForRack(),
        score = carriedScores.getOrElse(0) { 0 },
    )
    cursor += INITIAL_RACK_SIZE

    opponentNames.forEachIndexed { index, name ->
        players += Player(
            id = index + 1,
            name = name,
            difficulty = difficulty,
            rack = deck.subList(cursor, cursor + INITIAL_RACK_SIZE).toList(),
            score = carriedScores.getOrElse(index + 1) { 0 },
        )
        cursor += INITIAL_RACK_SIZE
    }

    return GameState(
        players = players,
        board = emptyList(),
        pool = deck.subList(cursor, deck.size).toList(),
        currentPlayerIndex = random.nextInt(players.size),
    )
}

/** Tri de confort du chevalet : par couleur puis par numéro, jokers en fin de rangée. */
fun List<Tile>.sortedForRack(): List<Tile> =
    sortedWith(compareBy({ it.isJoker }, { it.color.ordinal }, { it.number }, { it.id }))

/** Tri alternatif : par numéro puis par couleur, pratique pour repérer les groupes. */
fun List<Tile>.sortedByNumberThenColor(): List<Tile> =
    sortedWith(compareBy({ it.isJoker }, { it.number }, { it.color.ordinal }, { it.id }))

/**
 * Le joueur courant pioche une tuile (ou passe si la pioche est vide) et la main passe au
 * joueur suivant.
 */
fun GameState.drawAndPass(): GameState {
    val player = currentPlayer
    val drawn = pool.firstOrNull()
    val updatedPlayer = if (drawn != null) {
        player.copy(rack = if (player.isHuman) (player.rack + drawn).sortedForRack() else player.rack + drawn)
    } else {
        player
    }
    val nextPasses = consecutivePasses + 1
    val blocked = pool.isEmpty() && nextPasses >= players.size

    val newPlayers = players.toMutableList().also { it[currentPlayerIndex] = updatedPlayer }
    val base = copy(
        players = newPlayers,
        pool = if (drawn != null) pool.drop(1) else pool,
        consecutivePasses = nextPasses,
    )
    return if (blocked) base.finishBlocked() else base.advanceTurn()
}

/**
 * Applique un tour joué : [newBoard] et [newRack] décrivent l'état voulu en fin de tour. Le
 * tour n'est appliqué que s'il respecte les règles ; sinon la raison du refus est renvoyée.
 */
fun GameState.commitTurn(newBoard: List<Meld>, newRack: List<Tile>): CommitResult {
    val before = snapshotFor(currentPlayerIndex)
    val after = TurnSnapshot(newBoard, newRack)
    return when (val check = validateTurn(before, after, currentPlayer.hasOpened)) {
        is TurnCheck.Rejected -> CommitResult.Rejected(check.reason)
        is TurnCheck.Accepted -> {
            val player = currentPlayer
            val updated = player.copy(
                rack = if (player.isHuman) newRack.sortedForRack() else newRack,
                hasOpened = true,
            )
            val newPlayers = players.toMutableList().also { it[currentPlayerIndex] = updated }
            val state = copy(
                players = newPlayers,
                board = newBoard.filter { it.tiles.isNotEmpty() },
                consecutivePasses = 0,
                nextMeldId = maxOf(nextMeldId, (newBoard.maxOfOrNull { it.id } ?: 0L) + 1L),
            )
            val finished = if (updated.rack.isEmpty()) {
                state.finishWithWinner(currentPlayerIndex, RoundEndReason.RUMMIKUB)
            } else {
                state.advanceTurn()
            }
            CommitResult.Accepted(finished, check.tilesPlayed.size)
        }
    }
}

sealed interface CommitResult {
    data class Accepted(val state: GameState, val tilesPlayed: Int) : CommitResult
    data class Rejected(val reason: String) : CommitResult
}

private fun GameState.advanceTurn(): GameState =
    copy(currentPlayerIndex = (currentPlayerIndex + 1) % players.size)

/** Le joueur [winner] a vidé son chevalet : chacun compte ce qui lui reste en main. */
private fun GameState.finishWithWinner(winner: Int, reason: RoundEndReason): GameState {
    val penalties = players.map { it.rackPenalty }
    val gain = penalties.filterIndexed { index, _ -> index != winner }.sum()
    val scored = players.mapIndexed { index, player ->
        val delta = if (index == winner) gain else -penalties[index]
        player.copy(score = player.score + delta)
    }
    return copy(players = scored, endReason = reason, winnerIndex = winner)
}

/** Pioche épuisée et plus aucun coup possible : c'est le chevalet le plus léger qui l'emporte. */
private fun GameState.finishBlocked(): GameState {
    val winner = players.indices.minByOrNull { players[it].rackPenalty } ?: 0
    return finishWithWinner(winner, RoundEndReason.BLOCKED)
}

/** Points que chaque joueur vient de gagner ou de perdre sur la manche qui s'achève. */
fun GameState.roundDeltas(previousScores: List<Int>): List<Int> =
    players.mapIndexed { index, player -> player.score - previousScores.getOrElse(index) { 0 } }
