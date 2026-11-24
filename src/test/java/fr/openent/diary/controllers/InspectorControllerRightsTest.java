package fr.openent.diary.controllers;

import org.entcore.common.user.DefaultFunctions;
import org.entcore.common.user.UserInfos;
import org.junit.Assert;
import org.junit.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Habilitations d'inspection : partie immédiate de la règle (super-administrateur, ADML de l'établissement).
 * Le chef d'établissement (groupe Direction) est vérifié ensuite par requête, hors de ce test.
 */
public class InspectorControllerRightsTest {

    private static UserInfos utilisateur(String fonction, String... scope) {
        UserInfos user = new UserInfos();
        user.setUserId("u1");
        Map<String, UserInfos.Function> fonctions = new HashMap<>();
        if (fonction != null) {
            UserInfos.Function f = new UserInfos.Function();
            f.setScope(java.util.Arrays.asList(scope));
            fonctions.put(fonction, f);
        }
        user.setFunctions(fonctions);
        return user;
    }

    @Test
    public void superAdministrateurPartout() {
        Assert.assertTrue(InspectorController.canManageHabilitations(utilisateur(DefaultFunctions.SUPER_ADMIN), "S"));
    }

    @Test
    public void admlDeSonEtablissementSeulement() {
        UserInfos adml = utilisateur(DefaultFunctions.ADMIN_LOCAL, "S");
        Assert.assertTrue(InspectorController.canManageHabilitations(adml, "S"));
        Assert.assertFalse(InspectorController.canManageHabilitations(adml, "L"));
    }

    @Test
    public void inspecteurOuEnseignantRefuse() {
        Assert.assertFalse(InspectorController.canManageHabilitations(utilisateur(null), "S"));
        Assert.assertFalse(InspectorController.canManageHabilitations(null, "S"));
        Assert.assertFalse(InspectorController.canManageHabilitations(utilisateur(DefaultFunctions.ADMIN_LOCAL, "S"), null));
    }
}
