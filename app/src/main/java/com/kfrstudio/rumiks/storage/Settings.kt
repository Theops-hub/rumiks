package com.kfrstudio.rumiks.storage

import android.content.Context

/**
 * Réglages qui survivent aux parties : ils ne font pas partie d'une sauvegarde et doivent
 * rester valables même quand aucune partie n'est en cours.
 */
interface SettingsStore {
    var soundEnabled: Boolean
    var hapticsEnabled: Boolean
}

/** Réglages volatils, utilisés par les tests. */
class InMemorySettings(
    override var soundEnabled: Boolean = true,
    override var hapticsEnabled: Boolean = true,
) : SettingsStore

class SharedPreferencesSettings(context: Context) : SettingsStore {

    private val prefs = context.getSharedPreferences("rumiks-reglages", Context.MODE_PRIVATE)

    override var soundEnabled: Boolean
        get() = prefs.getBoolean(KEY_SOUND, true)
        set(value) = prefs.edit().putBoolean(KEY_SOUND, value).apply()

    override var hapticsEnabled: Boolean
        get() = prefs.getBoolean(KEY_HAPTICS, true)
        set(value) = prefs.edit().putBoolean(KEY_HAPTICS, value).apply()

    private companion object {
        const val KEY_SOUND = "son"
        const val KEY_HAPTICS = "haptique"
    }
}
