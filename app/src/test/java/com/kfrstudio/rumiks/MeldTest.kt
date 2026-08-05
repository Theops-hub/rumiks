package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.model.MeldKind
import com.kfrstudio.rumiks.model.analyseMeld
import com.kfrstudio.rumiks.model.createDeck
import com.kfrstudio.rumiks.model.isValidMeld
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MeldTest {

    private val t = Tiles()

    @Test
    fun `le sabot compte 106 tuiles dont 2 jokers`() {
        val deck = createDeck()
        assertEquals(106, deck.size)
        assertEquals(2, deck.count { it.isJoker })
        assertEquals(8, deck.count { !it.isJoker && it.number == 7 })
        assertEquals(106, deck.map { it.id }.distinct().size)
    }

    @Test
    fun `un groupe de trois couleurs distinctes est valide`() {
        val meld = analyseMeld(listOf(t.red(7), t.blue(7), t.black(7)))
        assertNotNull(meld)
        assertEquals(MeldKind.GROUP, meld!!.kind)
        assertEquals(21, meld.points)
    }

    @Test
    fun `un groupe de quatre couleurs est valide`() {
        val meld = analyseMeld(listOf(t.red(9), t.blue(9), t.black(9), t.orange(9)))
        assertNotNull(meld)
        assertEquals(36, meld!!.points)
    }

    @Test
    fun `un groupe avec deux fois la meme couleur est refuse`() {
        assertFalse(isValidMeld(listOf(t.red(7), t.red(7), t.black(7))))
    }

    @Test
    fun `un groupe de cinq tuiles est impossible`() {
        assertFalse(
            isValidMeld(listOf(t.red(4), t.blue(4), t.black(4), t.orange(4), t.joker())),
        )
    }

    @Test
    fun `une suite de trois numeros consecutifs est valide`() {
        val meld = analyseMeld(listOf(t.blue(5), t.blue(6), t.blue(7)))
        assertNotNull(meld)
        assertEquals(MeldKind.RUN, meld!!.kind)
        assertEquals(18, meld.points)
    }

    @Test
    fun `une suite doit etre monochrome`() {
        assertFalse(isValidMeld(listOf(t.blue(5), t.red(6), t.blue(7))))
    }

    @Test
    fun `une suite avec un trou est refusee`() {
        assertFalse(isValidMeld(listOf(t.blue(5), t.blue(6), t.blue(8))))
    }

    @Test
    fun `le 13 ne se relie pas au 1`() {
        assertFalse(isValidMeld(listOf(t.orange(12), t.orange(13), t.orange(1))))
        assertFalse(isValidMeld(listOf(t.orange(13), t.orange(1), t.orange(2))))
    }

    @Test
    fun `deux tuiles ne suffisent pas`() {
        assertFalse(isValidMeld(listOf(t.orange(5), t.orange(6))))
    }

    @Test
    fun `un joker comble un trou dans une suite`() {
        val meld = analyseMeld(listOf(t.black(4), t.joker(), t.black(6)))
        assertNotNull(meld)
        assertEquals(MeldKind.RUN, meld!!.kind)
        assertEquals(15, meld.points)
        assertEquals(listOf(4, 0, 6), meld.ordered.map { it.number })
    }

    @Test
    fun `un joker complete un groupe`() {
        val meld = analyseMeld(listOf(t.black(11), t.red(11), t.joker()))
        assertNotNull(meld)
        assertEquals(MeldKind.GROUP, meld!!.kind)
        assertEquals(33, meld.points)
    }

    @Test
    fun `une combinaison uniquement composee de jokers n a pas de sens`() {
        assertFalse(isValidMeld(listOf(t.joker(), t.joker(), t.joker())))
    }

    @Test
    fun `l interpretation retenue est la plus avantageuse pour le joueur`() {
        // 7 + deux jokers : lu comme groupe cela vaut 21, lu comme la suite 7-8-9 cela vaut 24.
        val meld = analyseMeld(listOf(t.red(7), t.joker(), t.joker()))
        assertNotNull(meld)
        assertEquals(24, meld!!.points)
    }

    @Test
    fun `une suite ne peut pas depasser le 13`() {
        // 12 et 13 encadrés d'un joker : la seule lecture possible est 11-12-13.
        val meld = analyseMeld(listOf(t.blue(12), t.blue(13), t.joker()))
        assertNotNull(meld)
        assertEquals(36, meld!!.points)
    }

    @Test
    fun `une suite peut courir sur toute la couleur`() {
        val tiles = (1..13).map { t.orange(it) }
        val meld = analyseMeld(tiles)
        assertNotNull(meld)
        assertEquals(91, meld!!.points)
    }

    @Test
    fun `une suite avec un numero en double est refusee`() {
        assertNull(analyseMeld(listOf(t.red(5), t.red(5), t.red(6), t.red(7))))
    }

    @Test
    fun `un joker peut prolonger une suite par le bas`() {
        val meld = analyseMeld(listOf(t.joker(), t.black(2), t.black(3)))
        assertNotNull(meld)
        assertTrue(meld!!.points > 0)
    }
}
