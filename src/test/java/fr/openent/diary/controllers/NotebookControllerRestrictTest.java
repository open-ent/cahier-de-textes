package fr.openent.diary.controllers;

import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Liste des cahiers d'un inspecteur : restreinte aux enseignants pour lesquels il est habilité. */
public class NotebookControllerRestrictTest {

    private final Set<String> habilite = new HashSet<>(Arrays.asList("T1", "T2"));

    @Test
    public void pasInspecteurFiltreInchange() {
        List<String> demande = Arrays.asList("T3");
        Assert.assertSame(demande, NotebookController.restrictTeachers(demande, null));
    }

    @Test
    public void sansFiltreTousLesEnseignantsHabilites() {
        Assert.assertEquals(Arrays.asList("T1", "T2"), NotebookController.restrictTeachers(Collections.emptyList(), habilite));
    }

    @Test
    public void filtreDemandeCroiseAvecLesHabilitations() {
        Assert.assertEquals(Collections.singletonList("T2"), NotebookController.restrictTeachers(Arrays.asList("T2", "T3"), habilite));
    }

    @Test
    public void enseignantNonHabiliteListeVide() {
        Assert.assertEquals(Collections.singletonList(NotebookController.AUCUN_ENSEIGNANT),
                NotebookController.restrictTeachers(Collections.singletonList("T3"), habilite));
    }
}
