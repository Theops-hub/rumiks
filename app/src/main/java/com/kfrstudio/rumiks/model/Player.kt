package com.kfrstudio.rumiks.model

import kotlinx.serialization.Serializable

/** Niveau des joueurs virtuels, choisi avant le début de la partie. */
@Serializable
enum class Difficulty(val label: String, val description: String) {
    EASY(
        "Facile",
        "Ne pose que les combinaisons qu'il forme avec son seul chevalet et dépense ses " +
            "jokers sans compter.",
    ),
    MEDIUM(
        "Modérée",
        "Complète aussi les combinaisons déjà posées et ménage ses jokers, mais ne défait " +
            "jamais la table.",
    ),
    HARD(
        "Difficile",
        "Refond toute la table pour caser un maximum de tuiles et garde ses jokers pour les " +
            "coups qui comptent.",
    ),
}

@Serializable
data class Player(
    val id: Int,
    val name: String,
    /** `null` pour le joueur humain. */
    val difficulty: Difficulty?,
    val rack: List<Tile> = emptyList(),
    /** Passe à `true` dès que la pose initiale de 30 points a été effectuée. */
    val hasOpened: Boolean = false,
    /** Score cumulé sur l'ensemble des manches. */
    val score: Int = 0,
) {
    val isHuman: Boolean get() = difficulty == null

    /** Points restant en main, comptés contre le joueur en fin de manche. */
    val rackPenalty: Int get() = rack.sumOf { it.penaltyValue }
}
