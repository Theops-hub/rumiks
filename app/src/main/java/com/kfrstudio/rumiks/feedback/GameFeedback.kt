package com.kfrstudio.rumiks.feedback

/**
 * Les moments du jeu qui méritent un retour sonore ou tactile.
 *
 * Volontairement isolé du reste du paquet : le modèle de partie émet ces événements sans rien
 * savoir d'Android, ce qui le laisse testable sur une simple machine virtuelle Java.
 */
enum class GameFeedback {
    /** Une tuile est saisie ou reposée sur le chevalet. */
    SELECT,

    /** Des tuiles sont déposées sur la table. */
    PLACE,

    /** Le tour est validé. */
    COMMIT,

    /** Une tuile est piochée. */
    DRAW,

    /** Le coup est refusé par les règles. */
    REJECT,

    /** La manche s'achève. */
    ROUND_END,
}

/**
 * Un effet à restituer. [haptic] est faux pour les coups des joueurs virtuels : leurs poses
 * s'entendent, mais faire vibrer l'appareil pour un geste qui n'est pas celui du joueur serait
 * déroutant.
 */
data class FeedbackEvent(val effect: GameFeedback, val haptic: Boolean = true)
