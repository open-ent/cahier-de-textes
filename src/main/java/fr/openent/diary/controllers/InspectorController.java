package fr.openent.diary.controllers;

import fr.openent.diary.services.InspectorService;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.response.DefaultResponseHandler;
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
            inspectorService.createInspectorHabilitation(habilitation,
                    DefaultResponseHandler.arrayResponseHandler(request));
        }));
    }

    @Delete("/inspector-habilitation/:inspectorId/:teacherId/:structureId")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void deleteInspectorHabilitation(final HttpServerRequest request) {
        String inspectorId = request.params().get("inspectorId");
        String teacherId = request.params().get("teacherId");
        String structureId = request.params().get("structureId");

        inspectorService.deleteInspectorHabilitation(inspectorId, teacherId, structureId,
                DefaultResponseHandler.arrayResponseHandler(request));
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
        inspectorService.deleteInspector(inspectorId, DefaultResponseHandler.arrayResponseHandler(request));
    }
}
