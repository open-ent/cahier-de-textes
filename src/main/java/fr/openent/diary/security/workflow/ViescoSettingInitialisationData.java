package fr.openent.diary.security.workflow;

import fr.openent.diary.security.WorkflowUtils;
import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.http.filter.ResourcesProvider;
import org.entcore.common.user.UserInfos;

public class ViescoSettingInitialisationData implements ResourcesProvider {

    @Override
    public void authorize(HttpServerRequest resourceRequest, Binding binding, UserInfos user,
                          Handler<Boolean> handler) {
        // Le super-admin plateforme n'a pas forcément les rôles calculés par structure sur un
        // établissement auquel il n'est pas rattaché ; sans ce contournement, l'administration
        // du cahier de textes (paramétrage vie scolaire) lui est inaccessible.
        handler.handle(user.isADMC() || WorkflowUtils.hasRight(user, WorkflowUtils.VIESCO_SETTING_INIT_DATA));
    }
}