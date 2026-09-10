package fr.openent.diary.security.workflow;

import fr.openent.diary.security.WorkflowUtils;
import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
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

public class SessionRead implements ResourcesProvider {

    private static final Logger log = LoggerFactory.getLogger(SessionRead.class);

    @Override
    public void authorize(HttpServerRequest resourceRequest, Binding binding, UserInfos user,
                          Handler<Boolean> handler) {
        // Le super-admin plateforme n'a pas forcément le droit fonction SESSION_READ ni de
        // rattachement à l'établissement du propriétaire consulté ; sans ce contournement, il
        // ne peut jamais consulter les séances/progressions d'un établissement tiers.
        if (user.isADMC()) {
            handler.handle(true);
            return;
        }
        if (!WorkflowUtils.hasRight(user, WorkflowUtils.SESSION_READ)) {
            handler.handle(false);
            return;
        }

        // Ce filtre protège aussi des routes SANS :ownerId (session/:id, subjects/exceptional/...) :
        // le contrôle ci-dessous ne s'applique que si ce paramètre est présent — cas de
        // GET /diary/progressions/:ownerId, où il désigne l'enseignant dont on lit les données.
        // Sans lui, n'importe quel utilisateur ayant le droit SESSION_READ pouvait lire les
        // progressions d'un enseignant de N'IMPORTE QUEL autre établissement en forgeant l'appel
        // (IDOR — l'IHM ne permet pas de le déclencher, seul un appel API forgé le pouvait).
        final String ownerId = resourceRequest.params().get("ownerId");
        if (ownerId == null || ownerId.trim().isEmpty() || ownerId.equals(user.getUserId())) {
            handler.handle(true);
            return;
        }

        String query = "MATCH (owner:User {id:{ownerId}})-[:IN]->(:ProfileGroup)-[:DEPENDS]->(s:Structure) " +
                "RETURN collect(DISTINCT s.id) as structureIds";
        JsonObject params = new JsonObject().put("ownerId", ownerId);
        Neo4j.getInstance().execute(query, params, Neo4jResult.validUniqueResultHandler(result -> {
            if (result.isLeft()) {
                log.error("[Diary@SessionRead::authorize] Erreur Neo4j lors de la vérification de l'établissement du propriétaire : "
                        + result.left().getValue());
                handler.handle(false);
                return;
            }

            final JsonArray ownerStructures = result.right().getValue().getJsonArray("structureIds", new JsonArray());
            final List<String> callerStructures = user.getStructures();
            boolean sameStructure = false;
            if (callerStructures != null) {
                for (Object structureId : ownerStructures) {
                    if (callerStructures.contains(String.valueOf(structureId))) {
                        sameStructure = true;
                        break;
                    }
                }
            }
            handler.handle(sameStructure);
        }));
    }

    public Future<Boolean> canAccessSession(HttpServerRequest request, UserInfos userInfos) {
        Promise<Boolean> promise = Promise.promise();
        this.authorize(request, null, userInfos, promise::complete);
        return promise.future();
    }

}
