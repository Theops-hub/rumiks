package com.kfrstudio.rumiks.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kfrstudio.rumiks.GameUiState
import com.kfrstudio.rumiks.GameViewModel
import com.kfrstudio.rumiks.HUMAN_INDEX
import com.kfrstudio.rumiks.RackSort
import com.kfrstudio.rumiks.engine.INITIAL_MELD_POINTS
import com.kfrstudio.rumiks.model.Meld
import com.kfrstudio.rumiks.model.Player
import com.kfrstudio.rumiks.model.analyseMeld

@Composable
fun GameScreen(ui: GameUiState, vm: GameViewModel) {
    val game = ui.game ?: return
    Column(Modifier.fillMaxSize()) {
        PlayersBar(ui, vm, onQuit = vm::backToHome)
        BoardArea(ui, vm, Modifier.weight(1f))
        StatusLine(ui)
        ActionBar(ui, vm)
        RackArea(ui, vm)
    }
    if (game.isRoundOver && ui.showRoundEnd) {
        RoundEndDialog(
            ui,
            onNextRound = vm::nextRound,
            onHome = vm::backToHome,
            onDismiss = vm::dismissRoundEnd,
        )
    }
}

// ------------------------------------------------------------------ en-tête

@Composable
private fun PlayersBar(ui: GameUiState, vm: GameViewModel, onQuit: () -> Unit) {
    val game = ui.game ?: return
    Row(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(FeltEdge, FeltDeep)))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        game.players.forEachIndexed { index, player ->
            PlayerChip(player, active = index == game.currentPlayerIndex && !game.isRoundOver)
        }
        Spacer(Modifier.weight(1f))
        Text(
            "Pioche ${game.pool.size}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
        )
        Spacer(Modifier.width(10.dp))
        // Le fond doré signale le réglage actif.
        SmallAction("Son", enabled = true, primary = ui.soundEnabled, onClick = vm::toggleSound)
        SmallAction(
            "Vibration",
            enabled = true,
            primary = ui.hapticsEnabled,
            onClick = vm::toggleHaptics,
        )
        SmallAction(label = "Quitter", enabled = true, onClick = onQuit)
    }
}

@Composable
private fun PlayerChip(player: Player, active: Boolean) {
    // Le joueur dont c'est le tour respire doucement : on repère la main d'un coup d'œil.
    val pulse = rememberInfiniteTransition(label = "tour")
    val glow by pulse.animateFloat(
        initialValue = 0.16f,
        targetValue = 0.34f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Reverse),
        label = "halo",
    )
    val background by animateColorAsState(
        if (active) Gold.copy(alpha = glow) else Color.Transparent,
        label = "fond-joueur",
    )
    val borderColor by animateColorAsState(
        if (active) Gold else TileEdge.copy(alpha = 0.3f),
        label = "bord-joueur",
    )
    Row(
        Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(background)
            .border(1.dp, borderColor, RoundedCornerShape(9.dp))
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(if (player.hasOpened) Gold else TileEdge),
        )
        Text(
            player.name,
            color = if (active) GoldBright else MaterialTheme.colorScheme.onBackground,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
            fontSize = 13.sp,
        )
        Text(
            "${player.rack.size} · ${player.score}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
        )
    }
}

// ------------------------------------------------------------------ table

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BoardArea(ui: GameUiState, vm: GameViewModel, modifier: Modifier) {
    Box(modifier.fillMaxWidth()) {
        AnimatedVisibility(
            visible = ui.workBoard.isEmpty() && ui.selection.isEmpty(),
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.Center),
        ) {
            Text(
                "La table est vide. Composez vos combinaisons pour ouvrir avec " +
                    "$INITIAL_MELD_POINTS points.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                modifier = Modifier.padding(16.dp),
            )
        }
        FlowRow(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 8.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ui.workBoard.forEach { meld ->
                key(meld.id) {
                    MeldView(
                        meld = meld,
                        selection = ui.selection,
                        interactive = ui.isHumanTurn,
                        onTileClick = vm::toggleSelection,
                        onDrop = { vm.placeSelection(meld.id) },
                    )
                }
            }
            AnimatedVisibility(
                visible = ui.selection.isNotEmpty() && ui.isHumanTurn,
                enter = fadeIn() + expandHorizontally(),
                exit = fadeOut() + shrinkHorizontally(),
            ) {
                NewMeldDropZone(onDrop = { vm.placeSelection(null) })
            }
        }
    }
}

@Composable
private fun MeldView(
    meld: Meld,
    selection: Set<Int>,
    interactive: Boolean,
    onTileClick: (Int) -> Unit,
    onDrop: () -> Unit,
) {
    val sound = meld.tiles.size >= 3 && analyseMeld(meld.tiles) != null
    val borderColor by animateColorAsState(
        if (sound) TileEdge.copy(alpha = 0.35f) else Alert,
        animationSpec = tween(250),
        label = "bord-combinaison",
    )
    // Une combinaison qui vient d'être posée grandit en place au lieu d'apparaître d'un bloc.
    val appearance = remember { MutableTransitionState(false).apply { targetState = true } }

    androidx.compose.animation.AnimatedVisibility(
        visibleState = appearance,
        enter = fadeIn(tween(200)) + scaleIn(initialScale = 0.85f),
        exit = fadeOut() + scaleOut(),
    ) {
        Row(
            Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Brush.verticalGradient(listOf(FeltRaised, Felt)))
                .border(
                    width = if (sound) 1.dp else 2.dp,
                    color = borderColor,
                    shape = RoundedCornerShape(12.dp),
                )
                .horizontalScroll(rememberScrollState())
                .padding(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            meld.tiles.forEach { tile ->
                key(tile.id) {
                    TileView(
                        tile = tile,
                        selected = tile.id in selection,
                        size = TileSize.BOARD,
                        onClick = if (interactive) ({ onTileClick(tile.id) }) else null,
                    )
                }
            }
            AnimatedVisibility(
                visible = interactive && selection.isNotEmpty(),
                enter = fadeIn() + expandHorizontally(),
                exit = fadeOut() + shrinkHorizontally(),
            ) {
                DropButton(onDrop)
            }
        }
    }
}

@Composable
private fun DropButton(onDrop: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.9f else 1f, label = "echelle-depot")
    Box(
        Modifier
            .padding(start = 3.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .size(30.dp, TileSize.BOARD.height)
            .shadow(4.dp, RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(Brush.verticalGradient(listOf(GoldBright, Gold)))
            .clickable(interactionSource = interaction, indication = null, onClick = onDrop),
        contentAlignment = Alignment.Center,
    ) {
        Text("+", color = FeltDeep, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun NewMeldDropZone(onDrop: () -> Unit) {
    val pulse = rememberInfiniteTransition(label = "zone-depot")
    val alpha by pulse.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Reverse),
        label = "appel",
    )
    Row(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(FeltRaised.copy(alpha = 0.55f))
            .border(2.dp, Gold.copy(alpha = alpha), RoundedCornerShape(12.dp))
            .clickable(onClick = onDrop)
            .padding(horizontal = 16.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("+ Nouvelle combinaison", color = GoldBright, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

// ------------------------------------------------------------------ bandeau d'état

@Composable
private fun StatusLine(ui: GameUiState) {
    val game = ui.game ?: return
    val opened = game.players[HUMAN_INDEX].hasOpened
    val text = when {
        ui.message != null -> ui.message
        ui.aiThinking -> "${game.currentPlayer.name} réfléchit…"
        !opened && !game.isRoundOver ->
            "Pose initiale : ${ui.pendingOpeningPoints} / $INITIAL_MELD_POINTS points"
        else -> ui.log.lastOrNull().orEmpty()
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(FeltDeep, FeltEdge)))
            .padding(horizontal = 12.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AnimatedVisibility(visible = ui.aiThinking, enter = fadeIn(), exit = fadeOut()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(12.dp), color = Gold, strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
        }
        AnimatedContent(
            targetState = text.orEmpty(),
            transitionSpec = {
                (slideInVertically { it / 2 } + fadeIn()) togetherWith
                    (slideOutVertically { -it / 2 } + fadeOut())
            },
            label = "statut",
        ) { value ->
            Text(
                value,
                color = if (ui.message != null) Alert else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
        }
    }
}

// ------------------------------------------------------------------ actions

@Composable
private fun ActionBar(ui: GameUiState, vm: GameViewModel) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SmallAction(
            "Reprendre",
            ui.isHumanTurn && ui.selection.isNotEmpty(),
            onClick = vm::returnSelectionToRack,
        )
        SmallAction("Trier couleur", ui.isHumanTurn) { vm.sortRack(RackSort.BY_COLOR) }
        SmallAction("Trier numéro", ui.isHumanTurn) { vm.sortRack(RackSort.BY_NUMBER) }
        SmallAction("Règles", true) { vm.toggleRules(true) }
        Spacer(Modifier.weight(1f))
        SmallAction("Annuler", ui.isHumanTurn && ui.hasPendingChanges, onClick = vm::undoTurn)
        SmallAction("Piocher", ui.isHumanTurn && !ui.hasPendingChanges, onClick = vm::drawTile)
        SmallAction("Valider", ui.canCommit, primary = true, onClick = vm::commitTurn)
    }
}

@Composable
fun SmallAction(
    label: String,
    enabled: Boolean,
    primary: Boolean = false,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.93f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessHigh),
        label = "echelle-bouton",
    )
    val background by animateColorAsState(
        when {
            !enabled -> FeltEdge
            primary -> Gold
            else -> FeltRaised
        },
        animationSpec = tween(220),
        label = "fond-bouton",
    )
    val textColor by animateColorAsState(
        when {
            !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
            primary -> FeltDeep
            else -> MaterialTheme.colorScheme.onBackground
        },
        animationSpec = tween(220),
        label = "texte-bouton",
    )
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(if (enabled) 3.dp else 0.dp, RoundedCornerShape(9.dp))
            .clip(RoundedCornerShape(9.dp))
            .background(background)
            .border(
                1.dp,
                if (enabled && primary) GoldBright else TileEdge.copy(alpha = 0.3f),
                RoundedCornerShape(9.dp),
            )
            .clickable(
                enabled = enabled,
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(label, color = textColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

// ------------------------------------------------------------------ chevalet

@Composable
private fun RackArea(ui: GameUiState, vm: GameViewModel) {
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = TileSize.RACK.height + 26.dp)
            .background(rackBrush),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (ui.workRack.isEmpty()) {
                Text(
                    "Chevalet vide",
                    color = TileFaceDim,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 22.dp),
                )
            }
            ui.workRack.forEach { tile ->
                key(tile.id) {
                    TileView(
                        tile = tile,
                        selected = tile.id in ui.selection,
                        size = TileSize.RACK,
                        onClick = if (ui.isHumanTurn) ({ vm.toggleSelection(tile.id) }) else null,
                    )
                }
            }
            Spacer(Modifier.height(TileSize.RACK.height))
        }
    }
}
