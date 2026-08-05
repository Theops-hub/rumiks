package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.model.Meld
import com.kfrstudio.rumiks.model.Tile
import com.kfrstudio.rumiks.model.TileColor

/** Fabrique de tuiles pour les tests : chaque tuile reçoit une identité unique. */
class Tiles {
    private var nextId = 0

    fun tile(number: Int, color: TileColor): Tile = Tile(nextId++, number, color)
    fun joker(): Tile = Tile(nextId++, 0, TileColor.RED, isJoker = true)

    fun black(number: Int) = tile(number, TileColor.BLACK)
    fun red(number: Int) = tile(number, TileColor.RED)
    fun blue(number: Int) = tile(number, TileColor.BLUE)
    fun orange(number: Int) = tile(number, TileColor.ORANGE)
}

private var meldCounter = 0L

fun meldOf(vararg tiles: Tile) = Meld(++meldCounter, tiles.toList())
fun meldOf(tiles: List<Tile>) = Meld(++meldCounter, tiles)
