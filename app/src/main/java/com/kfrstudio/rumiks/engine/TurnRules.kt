package com.kfrstudio.rumiks.engine

import com.kfrstudio.rumiks.model.MIN_MELD_SIZE
import com.kfrstudio.rumiks.model.Meld
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.analyseMeld

/** Points minimum à poser d'un seul coup pour effectuer sa pose initiale. */
const val INITIAL_MELD_POINTS = 30

/** Photographie de la table et du chevalet du joueur, avant ou après ses manipulations. */
data class TurnSnapshot(val board: List<Meld>, val rack: List<Tile>)

sealed interface TurnCheck {
    /** [tilesPlayed] : tuiles descendues du chevalet ; [openingPoints] : total de la pose initiale. */
    data class Accepted(val tilesPlayed: List<Tile>, val openingPoints: Int) : TurnCheck

    data class Rejected(val reason: String) : TurnCheck
}

private fun idsOf(snapshot: TurnSnapshot): List<Int> =
    (snapshot.board.flatMap { it.tiles } + snapshot.rack).map { it.id }

/**
 * Vérifie qu'un tour est conforme aux règles officielles.
 *
 * Sont contrôlés, dans l'ordre :
 *  1. la conservation des tuiles (rien n'apparaît ni ne disparaît) ;
 *  2. la validité de toutes les combinaisons laissées sur la table ;
 *  3. la pose d'au moins une tuile du chevalet ;
 *  4. pour un joueur qui n'a pas encore ouvert : interdiction de toucher aux combinaisons
 *     déjà en place et obligation d'atteindre 30 points avec ses seules tuiles ;
 *  5. l'interdiction de remonter dans son chevalet un joker pris sur la table — un joker
 *     récupéré doit être rejoué dans le tour même.
 */
fun validateTurn(
    before: TurnSnapshot,
    after: TurnSnapshot,
    hasOpened: Boolean,
): TurnCheck {
    if (idsOf(before).sorted() != idsOf(after).sorted()) {
        return TurnCheck.Rejected("Des tuiles ont été ajoutées ou perdues pendant le tour.")
    }

    for (meld in after.board) {
        if (meld.tiles.size < MIN_MELD_SIZE) {
            return TurnCheck.Rejected(
                "Une combinaison ne compte que ${meld.tiles.size} tuile(s) : il en faut au moins $MIN_MELD_SIZE.",
            )
        }
        if (analyseMeld(meld.tiles) == null) {
            return TurnCheck.Rejected("La combinaison ${describe(meld)} n'est pas valide.")
        }
    }

    val rackBefore = before.rack.associateBy { it.id }
    val rackAfterIds = after.rack.map { it.id }.toSet()
    val tilesPlayed = before.rack.filter { it.id !in rackAfterIds }
    if (tilesPlayed.isEmpty()) {
        return TurnCheck.Rejected("Il faut poser au moins une tuile de son chevalet.")
    }

    var openingPoints = 0
    if (!hasOpened) {
        val afterSets = after.board.map { meld -> meld.tiles.map { it.id }.toSet() }.toMutableList()
        for (meld in before.board) {
            val ids = meld.tiles.map { it.id }.toSet()
            if (!afterSets.remove(ids)) {
                return TurnCheck.Rejected(
                    "Tant que la pose initiale de $INITIAL_MELD_POINTS points n'est pas faite, " +
                        "les combinaisons déjà sur la table ne peuvent pas être modifiées.",
                )
            }
        }
        // Ce qui reste dans afterSets ne peut venir que du chevalet : la table était intacte
        // et le total des tuiles est conservé.
        val newMelds = after.board.filter { meld -> meld.tiles.map { it.id }.toSet() in afterSets }
        openingPoints = newMelds.sumOf { analyseMeld(it.tiles)?.points ?: 0 }
        if (openingPoints < INITIAL_MELD_POINTS) {
            return TurnCheck.Rejected(
                "La pose initiale doit totaliser au moins $INITIAL_MELD_POINTS points " +
                    "(actuellement $openingPoints).",
            )
        }
    }

    val tilesOnBoardBefore = before.board.flatMap { it.tiles }
    if (tilesOnBoardBefore.any { it.isJoker && it.id in rackAfterIds }) {
        return TurnCheck.Rejected(
            "Un joker repris sur la table doit être rejoué dans le même tour, pas gardé en main.",
        )
    }
    // Cas général : ce qui est descendu sur la table y reste. Seule la circulation entre
    // combinaisons est permise.
    if (tilesOnBoardBefore.any { it.id in rackAfterIds }) {
        return TurnCheck.Rejected("Une tuile déjà posée ne peut pas revenir dans un chevalet.")
    }
    // Un joker déjà présent dans le chevalet en début de tour peut évidemment y rester.
    if (after.rack.any { it.isJoker && rackBefore[it.id] == null }) {
        return TurnCheck.Rejected("Un joker ne peut pas rejoindre le chevalet.")
    }

    return TurnCheck.Accepted(tilesPlayed, openingPoints)
}

private fun describe(meld: Meld): String =
    meld.tiles.joinToString(" ") { if (it.isJoker) "JOKER" else "${it.number} ${it.color.label}" }
