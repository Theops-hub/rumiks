package com.kfrstudio.rumiks.feedback

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import com.kfrstudio.rumiks.R

private val soundResources = mapOf(
    GameFeedback.SELECT to R.raw.tile_select,
    GameFeedback.PLACE to R.raw.tile_place,
    GameFeedback.COMMIT to R.raw.turn_commit,
    GameFeedback.DRAW to R.raw.tile_draw,
    GameFeedback.REJECT to R.raw.move_reject,
    GameFeedback.ROUND_END to R.raw.round_end,
)

/** Volume relatif de chaque effet : la pose doit dominer, la sélection rester discrète. */
private val volumes = mapOf(
    GameFeedback.SELECT to 0.35f,
    GameFeedback.PLACE to 0.85f,
    GameFeedback.COMMIT to 0.70f,
    GameFeedback.DRAW to 0.55f,
    GameFeedback.REJECT to 0.60f,
    GameFeedback.ROUND_END to 0.75f,
)

/**
 * Joue les effets courts du jeu.
 *
 * [SoundPool] est préféré à `MediaPlayer` : les échantillons sont décodés une fois pour toutes
 * et déclenchés sans latence perceptible, ce qui compte quand le son doit coller au doigt.
 */
class SoundBoard(context: Context) {

    private val pool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()

    private val ids = soundResources.mapValues { (_, res) -> pool.load(context, res, 1) }
    private val ready = HashSet<Int>()

    init {
        pool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) synchronized(ready) { ready += sampleId }
        }
    }

    fun play(effect: GameFeedback) {
        val id = ids[effect] ?: return
        // Un échantillon encore en cours de décodage est simplement ignoré : mieux vaut un son
        // manquant au tout premier tour qu'un blocage de l'interface.
        val loaded = synchronized(ready) { id in ready }
        if (!loaded) return
        val volume = volumes[effect] ?: 0.6f
        pool.play(id, volume, volume, 1, 0, 1f)
    }

    fun release() {
        pool.release()
    }
}

@Composable
fun rememberSoundBoard(): SoundBoard {
    val context = LocalContext.current.applicationContext
    val board = remember { SoundBoard(context) }
    DisposableEffect(board) {
        onDispose { board.release() }
    }
    return board
}

/**
 * Retour tactile associé à un événement.
 *
 * On passe par [View.performHapticFeedback] plutôt que par le vibreur : aucune permission n'est
 * nécessaire, et le système respecte le réglage « retour haptique » de l'utilisateur — un jeu
 * n'a pas à passer outre.
 */
fun View.hapticFor(effect: GameFeedback) {
    val constant = when (effect) {
        GameFeedback.SELECT -> HapticFeedbackConstants.CLOCK_TICK
        GameFeedback.PLACE -> HapticFeedbackConstants.KEYBOARD_TAP
        GameFeedback.DRAW -> HapticFeedbackConstants.CLOCK_TICK
        GameFeedback.COMMIT ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
        GameFeedback.REJECT ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.REJECT
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
        GameFeedback.ROUND_END ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
    }
    performHapticFeedback(constant)
}

/**
 * Restitue les événements de la partie. Les réglages sont lus au moment de jouer l'effet, pas
 * capturés à la composition : couper le son doit faire effet immédiatement.
 */
@Composable
fun rememberFeedbackPlayer(
    soundEnabled: () -> Boolean,
    hapticsEnabled: () -> Boolean,
): (FeedbackEvent) -> Unit {
    val board = rememberSoundBoard()
    val view = LocalView.current
    return { event ->
        if (soundEnabled()) board.play(event.effect)
        if (event.haptic && hapticsEnabled()) view.hapticFor(event.effect)
    }
}
