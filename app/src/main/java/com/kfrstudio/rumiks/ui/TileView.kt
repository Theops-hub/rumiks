package com.kfrstudio.rumiks.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kfrstudio.rumiks.model.Tile

/** Gabarits de tuile : le chevalet mérite plus de place que la table, souvent chargée. */
enum class TileSize(val width: Dp, val height: Dp, val fontSize: Int) {
    RACK(46.dp, 62.dp, 26),
    BOARD(38.dp, 52.dp, 21),
}

private val tileShape = RoundedCornerShape(8.dp)

/**
 * Une tuile, dessinée en relief : face en dégradé éclairée par le haut, liseré clair sur
 * l'arête supérieure, ombre portée sur le tapis.
 *
 * La sélection soulève la tuile et l'agrandit légèrement, avec un ressort plutôt qu'une
 * interpolation linéaire : le mouvement se cale sur le geste du doigt.
 */
@Composable
fun TileView(
    tile: Tile,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    size: TileSize = TileSize.RACK,
    dimmed: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    val lift by animateDpAsState(
        targetValue = if (selected) (-10).dp else 0.dp,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "elevation-tuile",
    )
    val scale by animateFloatAsState(
        targetValue = when {
            pressed -> 0.94f
            selected -> 1.06f
            else -> 1f
        },
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "echelle-tuile",
    )
    val elevation by animateDpAsState(
        targetValue = if (selected) 12.dp else 4.dp,
        label = "ombre-tuile",
    )

    val ink = inkColor(tile.color)
    Column(
        modifier = modifier
            .graphicsLayer {
                translationY = lift.toPx()
                scaleX = scale
                scaleY = scale
            }
            .size(size.width, size.height)
            .shadow(elevation, tileShape, ambientColor = TileShadow, spotColor = TileShadow)
            .clip(tileShape)
            .background(if (dimmed) tileFaceDimBrush else tileFaceBrush)
            .border(
                width = if (selected) 2.5.dp else 1.dp,
                color = if (selected) Gold else TileEdge.copy(alpha = 0.55f),
                shape = tileShape,
            )
            .then(
                if (onClick != null) {
                    Modifier.clickable(interactionSource = interaction, indication = null, onClick = onClick)
                } else {
                    Modifier
                }
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Reflet sur l'arête supérieure, qui donne l'épaisseur à la tuile.
        Box(
            Modifier
                .fillMaxWidth()
                .height(size.height * 0.06f)
                .background(
                    Brush.verticalGradient(
                        listOf(Color.White.copy(alpha = 0.75f), Color.Transparent),
                    ),
                ),
        )
        Spacer(Modifier.height(size.height * 0.05f))
        Text(
            text = if (tile.isJoker) "☺" else tile.number.toString(),
            color = ink,
            fontSize = size.fontSize.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(size.height * 0.05f))
        Box(
            Modifier
                .size(size.width * 0.17f)
                .clip(CircleShape)
                .background(
                    Brush.verticalGradient(listOf(ink, ink.copy(alpha = 0.6f))),
                ),
        )
    }
}

/** Dos de tuile, pour représenter la main d'un adversaire ou la pioche. */
@Composable
fun TileBack(modifier: Modifier = Modifier, size: TileSize = TileSize.BOARD) {
    Box(
        modifier
            .size(size.width, size.height)
            .shadow(3.dp, tileShape, ambientColor = TileShadow, spotColor = TileShadow)
            .clip(tileShape)
            .background(Brush.verticalGradient(listOf(RackWoodLight, RackWoodDark)))
            .border(1.dp, TileEdge.copy(alpha = 0.4f), tileShape),
    )
}

/** Réserve de la place d'une tuile, utile pour aligner une rangée incomplète. */
@Composable
fun TileSpacerWidth(size: TileSize = TileSize.RACK) {
    Spacer(Modifier.width(size.width).padding(0.dp))
}
