package fr.openent.diary.security.workflow;

import fr.openent.diary.security.WorkflowUtils;
import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.http.filter.ResourcesProvider;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.user.UserInfos;

import java.util.List;

public class SessionModificationPropose implements ResourcesProvider {

    private static final Logger log = LoggerFactory.getLogger(SessionModificationPropose.class);

    @Override
    public void authorize(HttpServerRequest resourceRequest, Binding binding, UserInfos user,
                           Handler<Boolean> handler) {
        if (user.isADMC()) {
            handler.handle(true);
            return;
        }
        if (!WorkflowUtils.hasRight(user, WorkflowUtils.SESSION_MANAGE)) {
            handler.handle(false);
            return;
        }

        String teacherId = resourceRequest.params().get("teacherId");
        if (teacherId == null || teacherId.trim().isEmpty()) {
            handler.handle(false);
            return;
        }
        // Le chemin normal (PUT /session/:id, filtre SessionManage) reste réservé au propriétaire :
        // une proposition n'a de sens que pour un enseignant tiers.
        if (teacherId.equals(user.getUserId())) {
            handler.handle(false);
            return;
        }

        resourceRequest.pause();
        String query = "MATCH (owner:User {id:{teacherId}})-[:IN]->(:ProfileGroup)-[:DEPENDS]->(s:Structure) " +
                "RETURN collect(DISTINCT s.id) as structureIds";
        JsonObject params = new JsonObject().put("teacherId", teacherId);
        Neo4j.getInstance().execute(query, params, Neo4jResult.validUniqueResultHandler(result -> {
            resourceRequest.resume();
            if (result.isLeft()) {
                log.error("[Diary@SessionModificationPropose::authorize] Erreur Neo4j lors de la vérification de l'établissement de l'enseignant ciblé : "
                        + result.left().getValue());
                handler.handle(false);
                return;
            }

            final JsonArray teacherStructures = result.right().getValue().getJsonArray("structureIds", new JsonArray());
            final List<String> callerStructures = user.getStructures();
            boolean sameStructure = false;
            if (callerStructures != null) {
                for (Object structureId : teacherStructures) {
                    if (callerStructures.contains(String.valueOf(structureId))) {
                        sameStructure = true;
                        break;
                    }
                }
            }
            handler.handle(sameStructure);
        }));
    }
}
