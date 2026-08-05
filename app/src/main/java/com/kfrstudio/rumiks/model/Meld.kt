package com.kfrstudio.rumiks.model

/** Les deux formes de combinaison autorisées. */
enum class MeldKind {
    /** Même numéro, 3 ou 4 tuiles, toutes de couleurs différentes. */
    GROUP,

    /** Au moins 3 numéros consécutifs de la même couleur. Le 13 ne se relie pas au 1. */
    RUN,
}

const val MIN_MELD_SIZE = 3

/**
 * Résultat de l'analyse d'un ensemble de tuiles.
 *
 * [points] retient l'interprétation la plus avantageuse pour le joueur : les règles laissent
 * celui qui pose déclarer la tuile que chaque joker remplace, il choisira donc toujours la
 * lecture qui rapporte le plus (ce qui ne compte que pour le seuil des 30 points de la pose
 * initiale). [ordered] donne les tuiles dans l'ordre d'affichage correspondant.
 */
data class MeldAnalysis(
    val kind: MeldKind,
    val points: Int,
    val ordered: List<Tile>,
)

/**
 * Une combinaison posée sur la table. L'identifiant permet à l'interface de suivre une
 * combinaison à travers les manipulations.
 */
@kotlinx.serialization.Serializable
data class Meld(val id: Long, val tiles: List<Tile>) {
    val analysis: MeldAnalysis? get() = analyseMeld(tiles)
    val isValid: Boolean get() = analysis != null
    val points: Int get() = analysis?.points ?: 0
}

/** Analyse un groupe : même numéro, couleurs distinctes, 3 ou 4 tuiles. */
private fun analyseGroup(tiles: List<Tile>): MeldAnalysis? {
    val size = tiles.size
    if (size < MIN_MELD_SIZE || size > TileColor.entries.size) return null

    val reals = tiles.filter { !it.isJoker }
    // Une combinaison entièrement composée de jokers n'a pas de sens : il faut au moins une
    // tuile réelle pour déterminer ce que les jokers remplacent.
    if (reals.isEmpty()) return null

    val number = reals.first().number
    if (reals.any { it.number != number }) return null
    if (reals.map { it.color }.distinct().size != reals.size) return null

    val ordered = reals.sortedBy { it.color.ordinal } + tiles.filter { it.isJoker }
    return MeldAnalysis(MeldKind.GROUP, number * size, ordered)
}

/** Analyse une suite : numéros consécutifs d'une même couleur, les jokers comblant les trous. */
private fun analyseRun(tiles: List<Tile>): MeldAnalysis? {
    val size = tiles.size
    if (size < MIN_MELD_SIZE || size > MAX_NUMBER) return null

    val reals = tiles.filter { !it.isJoker }
    if (reals.isEmpty()) return null

    val color = reals.first().color
    if (reals.any { it.color != color }) return null

    val numbers = reals.map { it.number }
    if (numbers.distinct().size != numbers.size) return null

    // La suite occupe une fenêtre [start, start + size - 1] contenant toutes les tuiles réelles ;
    // les jokers occupent les positions libres, qu'elles soient internes ou aux extrémités.
    val lowest = numbers.min()
    val highest = numbers.max()
    val startMin = maxOf(MIN_NUMBER, highest - size + 1)
    val startMax = minOf(lowest, MAX_NUMBER - size + 1)
    if (startMin > startMax) return null

    // Fenêtre la plus haute possible : c'est celle qui rapporte le plus de points.
    val start = startMax
    val byNumber = reals.associateBy { it.number }
    val jokers = tiles.filter { it.isJoker }.toMutableList()
    val ordered = (start until start + size).map { n ->
        byNumber[n] ?: jokers.removeAt(0)
    }
    val points = (start until start + size).sum()
    return MeldAnalysis(MeldKind.RUN, points, ordered)
}

/**
 * Analyse un ensemble de tuiles et renvoie `null` s'il ne forme aucune combinaison valide.
 * Quand les deux lectures sont possibles (cas d'une combinaison très chargée en jokers), c'est
 * la plus avantageuse en points qui est retenue.
 */
fun analyseMeld(tiles: List<Tile>): MeldAnalysis? {
    val group = analyseGroup(tiles)
    val run = analyseRun(tiles)
    return when {
        group == null -> run
        run == null -> group
        else -> if (run.points >= group.points) run else group
    }
}

fun isValidMeld(tiles: List<Tile>): Boolean = analyseMeld(tiles) != null
