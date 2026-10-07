package fr.openent.diary.controllers;

import fr.openent.diary.security.workflow.ViescoSettingInitialisationData;
import fr.openent.diary.services.AudienceSettingsService;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;

/**
 * Paramétrage du cahier de textes par classe/groupe (MOD11 CCTP) — même droit que
 * l'initialisation générale du module ({@link InitController}), même population cible
 * (Personnel gérant le paramétrage vie scolaire de l'établissement).
 */
public class AudienceSettingsController extends ControllerHelper {

    private final AudienceSettingsService audienceSettingsService;

    public AudienceSettingsController(AudienceSettingsService audienceSettingsService) {
        this.audienceSettingsService = audienceSettingsService;
    }

    @Get("/structures/:id/audience-settings")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ViescoSettingInitialisationData.class)
    @ApiDoc("Liste les classes/groupes de l'établissement avec l'état du cahier de textes " +
            "(activé/désactivé) et les enseignants qui y interviennent, en lecture seule")
    public void getAudienceSettings(HttpServerRequest request) {
        String structureId = request.getParam("id");
        audienceSettingsService.getAudienceSettings(structureId)
                .onSuccess(result -> renderJson(request, result))
                .onFailure(err -> {
                    log.error("[Diary@AudienceSettingsController::getAudienceSettings] " + err.getMessage());
                    renderError(request);
                });
    }

    @Put("/structures/:id/audience-settings/:audienceId")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ViescoSettingInitialisationData.class)
    @ApiDoc("Active/désactive le cahier de textes pour une classe/groupe donné")
    public void setAudienceEnabled(HttpServerRequest request) {
        String structureId = request.getParam("id");
        String audienceId = request.getParam("audienceId");
        RequestUtils.bodyToJson(request, body -> {
            Boolean enabled = body.getBoolean("enabled");
            if (enabled == null) {
                badRequest(request, "invalid.enabled");
                return;
            }
            audienceSettingsService.setAudienceEnabled(structureId, audienceId, enabled)
                    .onSuccess(result -> renderJson(request, result))
                    .onFailure(err -> {
                        log.error("[Diary@AudienceSettingsController::setAudienceEnabled] " + err.getMessage());
                        renderError(request);
                    });
        });
    }
}
