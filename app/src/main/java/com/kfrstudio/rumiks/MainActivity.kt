package com.kfrstudio.rumiks

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kfrstudio.rumiks.feedback.rememberFeedbackPlayer
import com.kfrstudio.rumiks.ui.feltBrush
import com.kfrstudio.rumiks.ui.GameScreen
import com.kfrstudio.rumiks.ui.HomeScreen
import com.kfrstudio.rumiks.ui.RulesDialog
import com.kfrstudio.rumiks.ui.RumiksTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            RumiksTheme {
                RumiksApp()
            }
        }
    }
}

@Composable
fun RumiksApp(
    vm: GameViewModel = viewModel(factory = GameViewModel.factory(LocalContext.current)),
) {
    val ui = vm.ui

    val play = rememberFeedbackPlayer(
        soundEnabled = { vm.ui.soundEnabled },
        hapticsEnabled = { vm.ui.hapticsEnabled },
    )
    LaunchedEffect(vm) {
        vm.feedback.collect(play)
    }

    // Le tapis est peint sous les barres système : sans cela, la bordure de l'écran trancherait
    // avec le dégradé du contenu.
    Box(
        Modifier
            .fillMaxSize()
            .background(feltBrush())
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        // Le passage du menu à la table se fait par un fondu enchaîné avec un léger zoom :
        // la table semble s'approcher plutôt que se substituer d'un coup au menu.
        AnimatedContent(
            targetState = ui.screen,
            transitionSpec = {
                (fadeIn(tween(320)) + scaleIn(tween(320), initialScale = 0.94f)) togetherWith
                    (fadeOut(tween(220)) + scaleOut(tween(220), targetScale = 1.04f))
            },
            label = "ecran",
        ) { screen ->
            when (screen) {
                Screen.HOME -> HomeScreen(
                    difficulty = ui.difficulty,
                    opponentCount = ui.opponentCount,
                    canResume = ui.canResume,
                    onDifficulty = vm::chooseDifficulty,
                    onOpponentCount = vm::chooseOpponentCount,
                    onStart = vm::startGame,
                    onResume = vm::resumeGame,
                    onShowRules = { vm.toggleRules(true) },
                )
                Screen.GAME -> GameScreen(ui = ui, vm = vm)
            }
        }
    }
    if (ui.showRules) {
        RulesDialog(onDismiss = { vm.toggleRules(false) })
    }
}
