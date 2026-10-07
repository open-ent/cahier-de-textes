package fr.openent.diary.security.workflow;

import fr.openent.diary.Diary;
import fr.openent.diary.db.DB;
import fr.openent.diary.db.DBService;
import fr.openent.diary.helper.FutureHelper;
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
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;

import java.util.Collections;

public class SessionModificationRespond extends DBService implements ResourcesProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(SessionModificationRespond.class);

    @Override
    public void authorize(HttpServerRequest resourceRequest, Binding binding, UserInfos user,
                           Handler<Boolean> handler) {
        if (user.isADMC()) {
            handler.handle(true);
            return;
        }

        String stringId = resourceRequest.getParam("id");
        if (stringId == null) {
            handler.handle(false);
            return;
        }
        long modificationId = Long.parseLong(stringId);

        resourceRequest.pause();
        getModificationTeacherId(modificationId)
                .onFailure(fail -> {
                    resourceRequest.resume();
                    LOGGER.error("[Diary@SessionModificationRespond::authorize] " +
                            "An error occurred while checking sessionModificationRespond authorization. " + fail.getMessage());
                    handler.handle(false);
                })
                .onSuccess(result -> {
                    resourceRequest.resume();
                    handler.handle(user.getUserId().equals(result.getString("teacher_id")));
                });
    }

    private Future<JsonObject> getModificationTeacherId(long modificationId) {
        Promise<JsonObject> promise = Promise.promise();
        String query = " SELECT teacher_id" +
                " FROM " + Diary.DIARY_SCHEMA + ".session_modification" +
                " WHERE id = ? ";
        if (sql == null) {
            this.sql = DB.getInstance().sql();
        }
        sql.prepared(query, new JsonArray(Collections.singletonList(modificationId)),
                SqlResult.validUniqueResultHandler(FutureHelper.handlerJsonObject(promise)));
        return promise.future();
    }
}
