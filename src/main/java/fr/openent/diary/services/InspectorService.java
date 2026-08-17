package fr.openent.diary.services;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.user.UserInfos;

public interface InspectorService {

    void createInspectorHabilitation(JsonObject habilitation, Handler<Either<String, JsonArray>> handler);

    void deleteInspectorHabilitation(String inspectorId, String teacherId, String structureId, Handler<Either<String, JsonArray>> handler);

    void deleteInspector(String inspectorId, Handler<Either<String, JsonArray>> handler);

    void getInspectorHabilitations(String inspectorId, String structureId, UserInfos user, Handler<Either<String, JsonArray>> handler);

    /**
     * Établissements sur lesquels un inspecteur détient au moins une habilitation, avec leur nom.
     *
     * Le périmètre d'un inspecteur est défini par ses habilitations, et non par ses rattachements
     * de session : sans cette énumération, une interface ne peut lui proposer que les
     * établissements auxquels il est rattaché — soit, le plus souvent, son seul service académique.
     *
     * @param inspectorId identifiant de l'inspecteur
     * @param handler     tableau d'objets {@code {id, name}}, vide si aucune habilitation
     */
    void getInspectorStructures(String inspectorId, Handler<Either<String, JsonArray>> handler);
}
