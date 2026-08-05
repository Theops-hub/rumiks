package com.kfrstudio.rumiks.storage

import android.content.Context
import android.util.Log
import com.kfrstudio.rumiks.engine.GameState
import com.kfrstudio.rumiks.model.Difficulty
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Partie mise de côté pour être reprise plus tard.
 *
 * Seul l'état validé est conservé : un tour entamé mais non validé est abandonné à la reprise,
 * ce qui évite de restaurer une table à moitié remaniée dont le joueur aurait perdu le fil.
 */
@Serializable
data class SavedGame(
    val difficulty: Difficulty,
    val opponentCount: Int,
    val game: GameState,
    val log: List<String> = emptyList(),
    /** Version du format, pour ignorer proprement une sauvegarde devenue illisible. */
    val version: Int = CURRENT_VERSION,
) {
    companion object {
        const val CURRENT_VERSION = 1
    }
}

interface GameStorage {
    fun save(snapshot: SavedGame)
    fun load(): SavedGame?
    fun clear()
}

/** Implémentation neutre utilisée par les tests et par les aperçus Compose. */
object NoGameStorage : GameStorage {
    override fun save(snapshot: SavedGame) = Unit
    override fun load(): SavedGame? = null
    override fun clear() = Unit
}

/**
 * Sauvegarde dans un simple fichier JSON du stockage privé de l'application. L'état d'une partie
 * pèse quelques dizaines de kilo-octets : ni base de données ni sérialisation binaire ne se
 * justifient ici.
 */
class FileGameStorage(context: Context) : GameStorage {

    private val file = File(context.filesDir, FILE_NAME)
    private val json = Json { ignoreUnknownKeys = true }

    override fun save(snapshot: SavedGame) {
        try {
            file.writeText(json.encodeToString(SavedGame.serializer(), snapshot))
        } catch (error: Exception) {
            // Une sauvegarde ratée ne doit jamais interrompre la partie en cours.
            Log.w(TAG, "sauvegarde impossible", error)
        }
    }

    override fun load(): SavedGame? {
        if (!file.exists()) return null
        return try {
            val saved = json.decodeFromString(SavedGame.serializer(), file.readText())
            if (saved.version != SavedGame.CURRENT_VERSION) null else saved
        } catch (error: Exception) {
            Log.w(TAG, "sauvegarde illisible, elle est écartée", error)
            clear()
            null
        }
    }

    override fun clear() {
        runCatching { file.delete() }
    }

    private companion object {
        const val FILE_NAME = "partie-en-cours.json"
        const val TAG = "RumiksStorage"
    }
}
