package com.kfrstudio.rumiks.model

import kotlinx.serialization.Serializable

/** Les quatre couleurs officielles du jeu. */
@Serializable
enum class TileColor(val label: String) {
    BLACK("noir"),
    RED("rouge"),
    BLUE("bleu"),
    ORANGE("orange"),
}

const val MIN_NUMBER = 1
const val MAX_NUMBER = 13

/** Points de pénalité d'un joker resté en main à la fin d'une manche. */
const val JOKER_PENALTY = 30

/**
 * Une tuile du jeu. [id] est une identité unique et stable sur toute la partie : deux tuiles
 * identiques (même numéro, même couleur) existent en double et doivent rester distinguables.
 *
 * Pour un joker, [number] vaut 0 et [color] n'est que la couleur d'impression (un joker rouge
 * et un joker noir), sans incidence sur les règles.
 */
@Serializable
data class Tile(
    val id: Int,
    val number: Int,
    val color: TileColor,
    val isJoker: Boolean = false,
) {
    /** Valeur de pénalité de la tuile lorsqu'elle reste sur le chevalet en fin de manche. */
    val penaltyValue: Int get() = if (isJoker) JOKER_PENALTY else number

    override fun toString(): String =
        if (isJoker) "JOKER#$id" else "$number${color.name.first()}#$id"
}

/** Le sabot complet : 2 x (1..13 x 4 couleurs) + 2 jokers = 106 tuiles. */
fun createDeck(): List<Tile> {
    val tiles = ArrayList<Tile>(106)
    var id = 0
    repeat(2) {
        for (color in TileColor.entries) {
            for (number in MIN_NUMBER..MAX_NUMBER) {
                tiles += Tile(id++, number, color)
            }
        }
    }
    tiles += Tile(id++, 0, TileColor.RED, isJoker = true)
    tiles += Tile(id, 0, TileColor.BLACK, isJoker = true)
    return tiles
}
