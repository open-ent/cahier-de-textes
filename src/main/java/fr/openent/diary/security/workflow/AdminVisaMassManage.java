package fr.openent.diary.security.workflow;

import fr.openent.diary.security.WorkflowUtils;
import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.http.filter.ResourcesProvider;
import org.entcore.common.user.UserInfos;

// Distinct de AdminVisaManage : ADMIN_VISA_MASS_MANAGE n'est jamais accordé par défaut avec le
// visa unitaire, il doit être attribué explicitement à part (demande utilisateur).
public class AdminVisaMassManage implements ResourcesProvider {

    @Override
    public void authorize(HttpServerRequest resourceRequest, Binding binding, UserInfos user,
                          Handler<Boolean> handler) {
        handler.handle(user.isADMC() || WorkflowUtils.hasRight(user, WorkflowUtils.ADMIN_VISA_MASS_MANAGE));
    }

}
