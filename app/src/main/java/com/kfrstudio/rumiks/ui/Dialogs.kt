package com.kfrstudio.rumiks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kfrstudio.rumiks.GameUiState
import com.kfrstudio.rumiks.engine.INITIAL_MELD_POINTS
import com.kfrstudio.rumiks.engine.RoundEndReason
import com.kfrstudio.rumiks.model.JOKER_PENALTY

@Composable
fun RoundEndDialog(
    ui: GameUiState,
    onNextRound: () -> Unit,
    onHome: () -> Unit,
    onDismiss: () -> Unit,
) {
    val game = ui.game ?: return
    val winner = game.winnerIndex?.let { game.players[it] }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = FeltRaised,
        title = {
            Text(
                when (game.endReason) {
                    RoundEndReason.RUMMIKUB -> "Rummikub !"
                    RoundEndReason.BLOCKED -> "Partie bloquée"
                    null -> "Fin de manche"
                },
                color = Gold,
                fontWeight = FontWeight.Bold,
            )
        },
        text = {
            Column {
                Text(
                    when (game.endReason) {
                        RoundEndReason.RUMMIKUB ->
                            "${winner?.name} a posé sa dernière tuile."
                        RoundEndReason.BLOCKED ->
                            "La pioche est épuisée et plus personne ne peut jouer. " +
                                "${winner?.name} conserve le chevalet le plus léger."
                        null -> ""
                    },
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(12.dp))
                game.players.forEachIndexed { index, player ->
                    Row(
                        Modifier.fillMaxWidth().height(26.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            player.name,
                            color = if (index == game.winnerIndex) Gold else MaterialTheme.colorScheme.onSurface,
                            fontWeight = if (index == game.winnerIndex) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "${player.rack.size} tuile(s) en main",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                        )
                        Spacer(Modifier.weight(0.15f))
                        Text(
                            "${if (player.score > 0) "+" else ""}${player.score}",
                            color = if (player.score >= 0) Gold else Alert,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Un joker resté en main coûte $JOKER_PENALTY points.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onNextRound) {
                Text("Manche suivante", color = Gold, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onHome) {
                Text("Menu", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    )
}

private val RULES = listOf(
    "Le matériel" to
        "106 tuiles : les numéros 1 à 13 dans quatre couleurs, chacun en double, plus deux " +
        "jokers. Chaque joueur reçoit 14 tuiles au début de la manche.",
    "Les combinaisons" to
        "Une suite réunit au moins trois numéros consécutifs d'une même couleur ; le 13 ne se " +
        "relie jamais au 1. Un groupe réunit trois ou quatre fois le même numéro, toutes les " +
        "couleurs étant différentes.",
    "La pose initiale" to
        "Tant qu'un joueur n'a pas posé $INITIAL_MELD_POINTS points d'un seul coup, il ne peut " +
        "rien faire d'autre. Cette première pose se fait uniquement avec ses propres tuiles : " +
        "interdiction d'utiliser celles déjà sur la table.",
    "Manipuler la table" to
        "Une fois ouvert, un joueur peut découper, fusionner et réarranger librement les " +
        "combinaisons posées, à deux conditions : descendre au moins une tuile de son chevalet " +
        "et laisser, à la fin de son tour, une table entièrement valide.",
    "Les jokers" to
        "Un joker remplace la tuile de son choix. Posé sur la table, il peut être récupéré en " +
        "le remplaçant par la tuile qu'il représente, mais il doit alors être rejoué dans le " +
        "même tour : il ne retourne jamais sur un chevalet.",
    "Piocher" to
        "Un joueur qui ne peut ou ne veut rien poser pioche une tuile et son tour s'achève.",
    "Fin de la manche" to
        "Le premier joueur à poser sa dernière tuile crie « Rummikub » et remporte la manche. " +
        "Si la pioche s'épuise sans que personne ne puisse jouer, c'est le chevalet le plus " +
        "léger qui l'emporte.",
    "Le décompte" to
        "Chaque perdant totalise en négatif les points restants sur son chevalet, un joker " +
        "comptant $JOKER_PENALTY. Le gagnant marque en positif la somme de ces pénalités.",
)

@Composable
fun RulesDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = FeltRaised,
        title = { Text("Règles du jeu", color = Gold, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                RULES.forEach { (title, body) ->
                    Column {
                        Text(title, color = Gold, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(
                            body,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 13.sp,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Fermer", color = Gold, fontWeight = FontWeight.Bold)
            }
        },
    )
}
