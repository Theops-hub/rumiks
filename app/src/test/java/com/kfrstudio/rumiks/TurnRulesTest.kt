package com.kfrstudio.rumiks

import com.kfrstudio.rumiks.engine.TurnCheck
import com.kfrstudio.rumiks.engine.TurnSnapshot
import com.kfrstudio.rumiks.engine.validateTurn
import com.kfrstudio.rumiks.model.Meld
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TurnRulesTest {

    private val t = Tiles()

    private fun assertRejected(check: TurnCheck): String {
        assertTrue("le tour aurait dû être refusé", check is TurnCheck.Rejected)
        return (check as TurnCheck.Rejected).reason
    }

    @Test
    fun `une pose initiale de moins de 30 points est refusee`() {
        val red1 = t.red(1)
        val red2 = t.red(2)
        val red3 = t.red(3)
        val spare = t.blue(9)
        val before = TurnSnapshot(emptyList(), listOf(red1, red2, red3, spare))
        val after = TurnSnapshot(listOf(meldOf(red1, red2, red3)), listOf(spare))

        val reason = assertRejected(validateTurn(before, after, hasOpened = false))
        assertTrue(reason.contains("30"))
    }

    @Test
    fun `une pose initiale de 30 points exactement est acceptee`() {
        val ten1 = t.red(10)
        val ten2 = t.blue(10)
        val ten3 = t.black(10)
        val spare = t.orange(2)
        val before = TurnSnapshot(emptyList(), listOf(ten1, ten2, ten3, spare))
        val after = TurnSnapshot(listOf(meldOf(ten1, ten2, ten3)), listOf(spare))

        val check = validateTurn(before, after, hasOpened = false)
        assertTrue(check is TurnCheck.Accepted)
        assertEquals(30, (check as TurnCheck.Accepted).openingPoints)
        assertEquals(3, check.tilesPlayed.size)
    }

    @Test
    fun `la pose initiale peut cumuler plusieurs combinaisons`() {
        val group = listOf(t.red(5), t.blue(5), t.black(5))
        val run = listOf(t.orange(5), t.orange(6), t.orange(7))
        val rack = group + run
        val before = TurnSnapshot(emptyList(), rack)
        val after = TurnSnapshot(listOf(meldOf(group), meldOf(run)), emptyList())

        val check = validateTurn(before, after, hasOpened = false)
        assertTrue(check is TurnCheck.Accepted)
        assertEquals(33, (check as TurnCheck.Accepted).openingPoints)
    }

    @Test
    fun `avant sa pose initiale un joueur ne peut pas completer la table`() {
        val existing = listOf(t.blue(4), t.blue(5), t.blue(6))
        val addition = t.blue(7)
        val group = listOf(t.red(11), t.black(11), t.orange(11))
        val rack = listOf(addition) + group

        val before = TurnSnapshot(listOf(meldOf(existing)), rack)
        val after = TurnSnapshot(
            listOf(meldOf(existing + addition), meldOf(group)),
            emptyList(),
        )

        val reason = assertRejected(validateTurn(before, after, hasOpened = false))
        assertTrue(reason.contains("pose initiale"))
    }

    @Test
    fun `un tour sans aucune tuile posee est refuse`() {
        val existing = listOf(t.blue(4), t.blue(5), t.blue(6))
        val rack = listOf(t.red(1), t.red(2))
        val before = TurnSnapshot(listOf(meldOf(existing)), rack)
        val after = TurnSnapshot(listOf(meldOf(existing)), rack)

        val reason = assertRejected(validateTurn(before, after, hasOpened = true))
        assertTrue(reason.contains("au moins une tuile"))
    }

    @Test
    fun `une tuile ne peut ni apparaitre ni disparaitre`() {
        val rack = listOf(t.red(1), t.red(2), t.red(3))
        val before = TurnSnapshot(emptyList(), rack)
        val after = TurnSnapshot(listOf(meldOf(rack)), listOf(t.blue(8)))

        assertRejected(validateTurn(before, after, hasOpened = true))
    }

    @Test
    fun `la table ne peut pas contenir de combinaison invalide en fin de tour`() {
        val existing = listOf(t.blue(4), t.blue(5), t.blue(6))
        val played = t.red(9)
        val before = TurnSnapshot(listOf(meldOf(existing)), listOf(played))
        // Le joueur greffe un 9 rouge sur une suite bleue.
        val after = TurnSnapshot(listOf(meldOf(existing + played)), emptyList())

        val reason = assertRejected(validateTurn(before, after, hasOpened = true))
        assertTrue(reason.contains("n'est pas valide"))
    }

    @Test
    fun `une manipulation de la table est permise apres la pose initiale`() {
        // Table : groupe de 5. Chevalet : le 5 orange et les 3 et 4 noirs.
        val black5 = t.black(5)
        val blue5 = t.blue(5)
        val red5 = t.red(5)
        val orange5 = t.orange(5)
        val black3 = t.black(3)
        val black4 = t.black(4)

        val before = TurnSnapshot(
            listOf(meldOf(black5, blue5, red5)),
            listOf(orange5, black3, black4),
        )
        // Le 5 noir migre vers une suite noire ; le groupe est reconstitué avec le 5 orange.
        val after = TurnSnapshot(
            listOf(meldOf(blue5, red5, orange5), meldOf(black3, black4, black5)),
            emptyList(),
        )

        val check = validateTurn(before, after, hasOpened = true)
        assertTrue(check is TurnCheck.Accepted)
        assertEquals(3, (check as TurnCheck.Accepted).tilesPlayed.size)
    }

    @Test
    fun `un joker repris sur la table ne peut pas rester en main`() {
        val joker = t.joker()
        val blue5 = t.blue(5)
        val blue7 = t.blue(7)
        val blue4 = t.blue(4)
        val blue6 = t.blue(6)
        val filler = listOf(t.red(1), t.red(2), t.red(3))

        // Table : 5-JOKER-7 en bleu, le joker tenant lieu de 6 bleu.
        val before = TurnSnapshot(
            listOf(meldOf(blue5, joker, blue7)),
            listOf(blue4, blue6) + filler,
        )
        // Le joueur remplace bien le joker par le vrai 6, mais le garde en main.
        val after = TurnSnapshot(
            listOf(meldOf(blue4, blue5, blue6, blue7), meldOf(filler)),
            listOf(joker),
        )

        val reason = assertRejected(validateTurn(before, after, hasOpened = true))
        assertTrue(reason.contains("joker"))
    }

    @Test
    fun `un joker repris peut etre rejoue dans le meme tour`() {
        val joker = t.joker()
        val blue5 = t.blue(5)
        val blue7 = t.blue(7)
        val blue6 = t.blue(6)
        val red12 = t.red(12)
        val black12 = t.black(12)

        val before = TurnSnapshot(
            listOf(meldOf(blue5, joker, blue7)),
            listOf(blue6, red12, black12),
        )
        val after = TurnSnapshot(
            listOf(meldOf(blue5, blue6, blue7), meldOf(red12, black12, joker)),
            emptyList(),
        )

        val check = validateTurn(before, after, hasOpened = true)
        assertTrue(check is TurnCheck.Accepted)
    }

    @Test
    fun `une tuile posee ne peut pas revenir dans le chevalet`() {
        val red1 = t.red(1)
        val red2 = t.red(2)
        val red3 = t.red(3)
        val red4 = t.red(4)
        val group = listOf(t.blue(8), t.black(8), t.orange(8))

        val before = TurnSnapshot(listOf(meldOf(red1, red2, red3, red4)), listOf(group[0], group[1], group[2]))
        // Le joueur pose bien un groupe, mais en profite pour reprendre le 4 rouge.
        val after = TurnSnapshot(
            listOf(meldOf(red1, red2, red3), meldOf(group)),
            listOf(red4),
        )

        val reason = assertRejected(validateTurn(before, after, hasOpened = true))
        assertTrue(reason.contains("déjà posée"))
    }

    @Test
    fun `une combinaison de deux tuiles laissee sur la table est refusee`() {
        val red1 = t.red(1)
        val red2 = t.red(2)
        val red3 = t.red(3)
        val played = t.blue(8)
        val before = TurnSnapshot(listOf(meldOf(red1, red2, red3)), listOf(played))
        val after = TurnSnapshot(
            listOf(Meld(99L, listOf(red1, red2)), Meld(100L, listOf(red3, played))),
            emptyList(),
        )

        assertRejected(validateTurn(before, after, hasOpened = true))
    }
}
