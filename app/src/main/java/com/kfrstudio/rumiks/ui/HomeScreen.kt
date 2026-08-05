package com.kfrstudio.rumiks.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kfrstudio.rumiks.model.Difficulty
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.TileColor

@Composable
fun HomeScreen(
    difficulty: Difficulty,
    opponentCount: Int,
    canResume: Boolean,
    onDifficulty: (Difficulty) -> Unit,
    onOpponentCount: (Int) -> Unit,
    onStart: () -> Unit,
    onResume: () -> Unit,
    onShowRules: () -> Unit,
) {
    Box(
        Modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier
                .widthIn(max = 900.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Title()
            Spacer(Modifier.height(14.dp))

            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SectionLabel("Adversaires")
                (1..3).forEach { count ->
                    ChoicePill(
                        label = "$count",
                        selected = count == opponentCount,
                        onClick = { onOpponentCount(count) },
                    )
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = onShowRules) {
                    Text("Voir les règles", color = Gold)
                }
                AnimatedVisibility(
                    visible = canResume,
                    enter = fadeIn() + expandHorizontally(),
                    exit = fadeOut() + shrinkHorizontally(),
                ) {
                    Row {
                        MainButton("Reprendre", primary = false, onClick = onResume)
                        Spacer(Modifier.widthIn(min = 10.dp))
                    }
                }
                MainButton(
                    if (canResume) "Nouvelle partie" else "Commencer la partie",
                    primary = true,
                    onClick = onStart,
                )
            }

            Spacer(Modifier.height(14.dp))
            SectionLabel("Niveau des joueurs virtuels", Modifier.fillMaxWidth())
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Difficulty.entries.forEach { level ->
                    DifficultyCard(
                        difficulty = level,
                        selected = level == difficulty,
                        onClick = { onDifficulty(level) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun Title() {
    // Les trois tuiles du titre oscillent très légèrement, comme posées de travers sur la table.
    val sway = rememberInfiniteTransition(label = "titre")
    val angle by sway.animateFloat(
        initialValue = -1.6f,
        targetValue = 1.6f,
        animationSpec = infiniteRepeatable(tween(3200), RepeatMode.Reverse),
        label = "balancement",
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        listOf(
            Tile(-1, 1, TileColor.RED),
            Tile(-2, 3, TileColor.BLUE),
            Tile(-3, 0, TileColor.BLACK, isJoker = true),
        ).forEachIndexed { index, tile ->
            TileView(
                tile = tile,
                size = TileSize.BOARD,
                modifier = Modifier.graphicsLayer { rotationZ = angle * (index - 1) },
            )
        }
        Column(Modifier.padding(start = 12.dp)) {
            Text(
                "RUMIKS",
                color = GoldBright,
                fontSize = 34.sp,
                fontWeight = FontWeight.Black,
            )
            Text(
                "Le jeu de tuiles, règles officielles",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        color = Gold,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = modifier,
        textAlign = TextAlign.Start,
    )
}

@Composable
private fun MainButton(label: String, primary: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.95f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessHigh),
        label = "echelle-bouton-principal",
    )
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(if (primary) 8.dp else 3.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (primary) {
                    Brush.verticalGradient(listOf(GoldBright, Gold))
                } else {
                    Brush.verticalGradient(listOf(FeltRaised, Felt))
                },
            )
            .border(
                1.dp,
                if (primary) GoldBright else TileEdge.copy(alpha = 0.45f),
                RoundedCornerShape(12.dp),
            )
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 13.dp),
    ) {
        Text(
            label,
            color = if (primary) FeltDeep else MaterialTheme.colorScheme.onBackground,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun ChoicePill(label: String, selected: Boolean, onClick: () -> Unit) {
    val background by animateColorAsState(
        if (selected) Gold else FeltRaised,
        animationSpec = tween(220),
        label = "fond-pastille",
    )
    val textColor by animateColorAsState(
        if (selected) FeltDeep else MaterialTheme.colorScheme.onBackground,
        animationSpec = tween(220),
        label = "texte-pastille",
    )
    val scale by animateFloatAsState(
        targetValue = if (selected) 1.08f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "echelle-pastille",
    )
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(if (selected) 6.dp else 1.dp, RoundedCornerShape(11.dp))
            .clip(RoundedCornerShape(11.dp))
            .background(background)
            .border(
                1.dp,
                if (selected) GoldBright else TileEdge.copy(alpha = 0.4f),
                RoundedCornerShape(11.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 11.dp),
    ) {
        Text(label, color = textColor, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

@Composable
private fun DifficultyCard(
    difficulty: Difficulty,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val borderColor by animateColorAsState(
        if (selected) Gold else TileEdge.copy(alpha = 0.3f),
        animationSpec = tween(240),
        label = "bord-carte",
    )
    val elevation by animateDpAsState(
        targetValue = if (selected) 10.dp else 2.dp,
        label = "ombre-carte",
    )
    Column(
        modifier
            .shadow(elevation, RoundedCornerShape(14.dp))
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (selected) {
                    Brush.verticalGradient(listOf(FeltRaised, FeltCenter))
                } else {
                    Brush.verticalGradient(listOf(FeltEdge, FeltDeep))
                },
            )
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            difficulty.label,
            color = if (selected) GoldBright else MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            fontSize = 17.sp,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            difficulty.description,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
        )
    }
}
