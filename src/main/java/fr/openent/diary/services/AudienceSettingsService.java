package fr.openent.diary.services;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/**
 * Paramétrage du cahier de textes par classe/groupe (MOD11 CCTP) : chaque classe/groupe de
 * l'établissement peut être activé/désactivé pour le cahier de textes (activé par défaut), avec
 * en lecture seule les enseignants qui y interviennent (le paramétrage enseignant+matière+classe
 * reste piloté par les services vie-scolaire, jamais dupliqué ici).
 */
public interface AudienceSettingsService {

    Future<JsonArray> getAudienceSettings(String structureId);

    Future<JsonObject> setAudienceEnabled(String structureId, String audienceId, boolean enabled);
}
