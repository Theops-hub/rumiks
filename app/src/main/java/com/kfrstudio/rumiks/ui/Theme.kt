package com.kfrstudio.rumiks.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.kfrstudio.rumiks.model.TileColor

// Feutre de la table, éclairé au centre comme sous une suspension.
val FeltCenter = Color(0xFF1E4A38)
val Felt = Color(0xFF14352A)
val FeltRaised = Color(0xFF1D4A3A)
val FeltEdge = Color(0xFF0D2119)
val FeltDeep = Color(0xFF081711)

// Bois du chevalet.
val RackWood = Color(0xFF3E2C1E)
val RackWoodLight = Color(0xFF57402C)
val RackWoodDark = Color(0xFF27190E)

// Faces de tuile : un ivoire légèrement chaud, plus lumineux en haut.
val TileTop = Color(0xFFFBF5E8)
val TileBottom = Color(0xFFE8DCC2)
val TileFace = Color(0xFFF6EEDD)
val TileFaceDim = Color(0xFFD9CFBB)
val TileEdge = Color(0xFF8C7A5C)
val TileShadow = Color(0xFF0A1A12)

val Gold = Color(0xFFE0B252)
val GoldBright = Color(0xFFF3CE7C)
val Alert = Color(0xFFE05C4B)

/** Couleur d'encre d'une tuile, fidèle aux quatre couleurs du jeu. */
fun inkColor(color: TileColor): Color = when (color) {
    TileColor.BLACK -> Color(0xFF23201C)
    TileColor.RED -> Color(0xFFC0392B)
    TileColor.BLUE -> Color(0xFF1F6FA8)
    TileColor.ORANGE -> Color(0xFFD98014)
}

/**
 * Halo de lumière au-dessus du tapis : le centre de la table est plus clair que les bords. Le
 * dégradé s'arrête sur [FeltEdge] et non sur le vert le plus sombre, sans quoi le contour de
 * l'écran tranche avec la zone des encoches et des barres système.
 */
fun feltBrush(): Brush = Brush.radialGradient(
    colors = listOf(FeltCenter, Felt, FeltEdge),
    center = Offset.Unspecified,
    radius = Float.POSITIVE_INFINITY,
)

/** Relief d'une face de tuile, éclairée par le haut. */
val tileFaceBrush: Brush = Brush.verticalGradient(listOf(TileTop, TileBottom))

/** Même face, éteinte : sert aux tuiles que le joueur ne peut pas manipuler. */
val tileFaceDimBrush: Brush = Brush.verticalGradient(listOf(TileFaceDim, Color(0xFFC4B99F)))

/** Veinage du chevalet, plus clair sur la lèvre supérieure. */
val rackBrush: Brush = Brush.verticalGradient(
    0f to RackWoodLight,
    0.12f to RackWood,
    1f to RackWoodDark,
)

private val scheme = darkColorScheme(
    primary = Gold,
    onPrimary = Color(0xFF2A1F08),
    secondary = FeltRaised,
    onSecondary = Color.White,
    background = Felt,
    onBackground = Color(0xFFEDE7DA),
    surface = FeltRaised,
    onSurface = Color(0xFFEDE7DA),
    surfaceVariant = FeltEdge,
    onSurfaceVariant = Color(0xFFCFC7B6),
    error = Alert,
    onError = Color.White,
)

@Composable
fun RumiksTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
