package fr.openent.diary.controllers;

import fr.openent.diary.security.workflow.SessionModificationPropose;
import fr.openent.diary.security.workflow.SessionModificationRespond;
import fr.openent.diary.security.workflow.SessionRead;
import fr.openent.diary.services.SessionModificationService;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.response.DefaultResponseHandler;
import org.entcore.common.user.UserUtils;

public class SessionModificationController extends ControllerHelper {

    private final SessionModificationService sessionModificationService;

    public SessionModificationController(SessionModificationService sessionModificationService) {
        this.sessionModificationService = sessionModificationService;
    }

    @Post("/session/modification")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(SessionModificationPropose.class)
    public void propose(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> RequestUtils.bodyToJson(request, modification ->
                sessionModificationService.propose(modification, user, DefaultResponseHandler.defaultResponseHandler(request))));
    }

    @Get("/session/:id/modifications")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(SessionRead.class)
    public void listForSession(final HttpServerRequest request) {
        long sessionId = Long.parseLong(request.getParam("id"));
        sessionModificationService.listForSession(sessionId, renderAllAsArray(request));
    }

    @Get("/session/modification/pending")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void listPendingForTeacher(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user ->
                sessionModificationService.listPendingForTeacher(user.getUserId(), renderAllAsArray(request)));
    }

    // array_to_json(array_agg(...)) renvoie une chaîne JSON brute côté driver SQL (pas un
    // JsonArray déjà décodé) — d'où le désérialisation manuelle ci-dessous ; absent (0 ligne),
    // la colonne vaut NULL, jamais une chaîne vide.
    private Handler<Either<String, JsonObject>> renderAllAsArray(final HttpServerRequest request) {
        return result -> {
            if (result.isLeft()) {
                renderError(request, new JsonObject().put("error", result.left().getValue()));
                return;
            }
            Object rawAll = result.right().getValue().getValue("all");
            JsonArray all = (rawAll instanceof String) ? new JsonArray((String) rawAll) : new JsonArray();
            renderJson(request, all);
        };
    }

    @Put("/session/modification/:id/process")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(SessionModificationRespond.class)
    public void process(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> RequestUtils.bodyToJson(request, body -> {
            long modificationId = Long.parseLong(request.getParam("id"));
            sessionModificationService.process(modificationId, body, user, DefaultResponseHandler.defaultResponseHandler(request));
        }));
    }
}
