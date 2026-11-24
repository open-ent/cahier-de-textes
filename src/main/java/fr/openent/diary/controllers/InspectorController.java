package fr.openent.diary.controllers;

import fr.openent.diary.services.InspectorService;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.response.DefaultResponseHandler;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.user.DefaultFunctions;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

public class InspectorController extends ControllerHelper {
    private InspectorService inspectorService;

    public InspectorController(InspectorService inspectorService) {
        this.inspectorService = inspectorService;
    }

    @Post("/inspector-habilitation")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void createInspectorHabilitation(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> RequestUtils.bodyToJson(request, habilitation -> {
            checkCanManageHabilitations(user, habilitation.getString("structureId"), allowed -> {
                if (!allowed) {
                    unauthorized(request);
                    return;
                }
                inspectorService.createInspectorHabilitation(habilitation,
                        DefaultResponseHandler.arrayResponseHandler(request));
            });
        }));
    }

    @Delete("/inspector-habilitation/:inspectorId/:teacherId/:structureId")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void deleteInspectorHabilitation(final HttpServerRequest request) {
        String inspectorId = request.params().get("inspectorId");
        String teacherId = request.params().get("teacherId");
        String structureId = request.params().get("structureId");

        UserUtils.getUserInfos(eb, request, user -> {
            checkCanManageHabilitations(user, structureId, allowed -> {
                if (!allowed) {
                    unauthorized(request);
                    return;
                }
                inspectorService.deleteInspectorHabilitation(inspectorId, teacherId, structureId,
                        DefaultResponseHandler.arrayResponseHandler(request));
            });
        });
    }

    @Get("/inspector-habilitations/:inspectorId/:structureId")
    @ApiDoc("Get the habilitation of the structure of the inspector")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void getInspectorHabilitation(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            String inspectorId = request.params().get("inspectorId");
            String structureId = request.params().get("structureId");

            inspectorService.getInspectorHabilitations(inspectorId, structureId, user, DefaultResponseHandler.arrayResponseHandler(request));
        });
    }

    @Get("/inspector/structures")
    @ApiDoc("Get the structures where the connected user holds an inspection habilitation")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void getOwnInspectorStructures(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            // L'inspecteur est celui de la session : aucune identité n'est lue depuis l'URL, sans
            // quoi tout compte authentifié pourrait consulter le périmètre d'inspection d'autrui.
            inspectorService.getInspectorStructures(user.getUserId(),
                    DefaultResponseHandler.arrayResponseHandler(request));
        });
    }

    @Delete("/inspector/:id")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void deleteInspector(final HttpServerRequest request) {
        String inspectorId = request.params().get("id");
        UserUtils.getUserInfos(eb, request, user -> {
            // Supprime les habilitations de l'inspecteur dans TOUS les établissements : réservé au super-administrateur.
            if (user == null || !user.isADMC()) {
                unauthorized(request);
                return;
            }
            inspectorService.deleteInspector(inspectorId, DefaultResponseHandler.arrayResponseHandler(request));
        });
    }

    /**
     * Qui peut donner ou retirer une habilitation d'inspection dans un établissement : le super-administrateur,
     * l'administrateur local (ADML) de CET établissement, ou un membre de son groupe Direction (chef
     * d'établissement). Ex. : le chef du collège S peut habiliter un inspecteur sur un enseignant de S, pas sur un
     * enseignant du lycée L ; un inspecteur ne peut pas s'habiliter lui-même.
     */
    private void checkCanManageHabilitations(UserInfos user, String structureId, Handler<Boolean> handler) {
        if (canManageHabilitations(user, structureId)) {
            handler.handle(true);
            return;
        }
        if (user == null || structureId == null) {
            handler.handle(false);
            return;
        }
        // Chef d'établissement : membre du groupe Direction rattaché à la structure (sa fonction AAF « DIR »
        // n'est pas portée par la session).
        String query = "MATCH (u:User {id: $userId})-[:IN]->(g:DirectionGroup)-[:DEPENDS]->(s:Structure {id: $structureId}) " +
                "RETURN count(g) AS n";
        Neo4j.getInstance().execute(query, new JsonObject().put("userId", user.getUserId()).put("structureId", structureId),
                Neo4jResult.validUniqueResultHandler(result -> handler.handle(result.isRight()
                        && result.right().getValue().getInteger("n", 0) > 0)));
    }

    /** Partie immédiate de la règle (sans requête) : super-administrateur, ou ADML de l'établissement. */
    static boolean canManageHabilitations(UserInfos user, String structureId) {
        if (user == null) return false;
        if (user.isADMC()) return true;
        if (structureId == null || user.getFunctions() == null) return false;
        UserInfos.Function adml = user.getFunctions().get(DefaultFunctions.ADMIN_LOCAL);
        return adml != null && adml.getScope() != null && adml.getScope().contains(structureId);
    }
}
