package fr.openent.diary.services.impl;

import fr.openent.diary.Diary;
import fr.openent.diary.core.enums.SessionModificationStatus;
import fr.openent.diary.db.DBService;
import fr.openent.diary.services.SessionModificationService;
import fr.openent.diary.services.SessionService;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.notification.TimelineHelper;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;

import java.util.Collections;
import java.util.List;

public class SessionModificationServiceImpl extends DBService implements SessionModificationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SessionModificationServiceImpl.class);

    private final SessionService sessionService;
    private final TimelineHelper timeline;
    private final String pathPrefix;

    public SessionModificationServiceImpl(SessionService sessionService, TimelineHelper timeline, String pathPrefix) {
        this.sessionService = sessionService;
        this.timeline = timeline;
        this.pathPrefix = pathPrefix;
    }

    @Override
    public void propose(JsonObject modification, UserInfos user, Handler<Either<String, JsonObject>> handler) {
        String query = "INSERT INTO " + Diary.DIARY_SCHEMA + ".session_modification " +
                "(session_id, course_id, date, structure_id, teacher_id, proposed_by, status, payload, created, modified) " +
                "VALUES (?, ?, " +
                "CASE WHEN ?::text IS NULL THEN NULL ELSE to_date(?, 'YYYY-MM-DD') END, " +
                "?, ?, ?, ?, ?::jsonb, NOW(), NOW()) RETURNING id";

        JsonArray values = new JsonArray();
        Long sessionId = modification.getLong("sessionId");
        if (sessionId != null) {
            values.add(sessionId);
        } else {
            values.addNull();
        }
        String courseId = modification.getString("courseId");
        if (courseId != null) {
            values.add(courseId);
        } else {
            values.addNull();
        }
        String date = modification.getString("date");
        // La date est utilisée deux fois dans la requête (CASE WHEN ... to_date(?,...)) : le driver
        // SQL positionnel attend donc deux paramètres identiques à la suite.
        if (date != null) {
            values.add(date);
            values.add(date);
        } else {
            values.addNull();
            values.addNull();
        }
        values.add(modification.getString("structureId"));
        values.add(modification.getString("teacherId"));
        values.add(user.getUserId());
        values.add(SessionModificationStatus.PENDING.status());
        values.add(modification.getJsonObject("payload", new JsonObject()).encode());

        sql.prepared(query, values, SqlResult.validUniqueResultHandler(event -> {
            handler.handle(event);
            if (event.isRight()) {
                notifyProposed(modification, user, event.right().getValue().getLong("id"));
            } else {
                LOGGER.error("[Diary@SessionModificationServiceImpl::propose] Failed to insert proposal: " + event.left().getValue());
            }
        }));
    }

    @Override
    public void listPendingForTeacher(String teacherId, Handler<Either<String, JsonObject>> handler) {
        String query = "SELECT array_to_json(array_agg(row_to_json(m))) AS all FROM (" +
                " SELECT * FROM " + Diary.DIARY_SCHEMA + ".session_modification" +
                " WHERE teacher_id = ? AND status = ? ORDER BY created DESC" +
                " ) m";
        JsonArray params = new JsonArray()
                .add(teacherId)
                .add(SessionModificationStatus.PENDING.status());
        sql.prepared(query, params, SqlResult.validUniqueResultHandler(handler));
    }

    @Override
    public void listForSession(long sessionId, Handler<Either<String, JsonObject>> handler) {
        String query = "SELECT array_to_json(array_agg(row_to_json(m))) AS all FROM (" +
                " SELECT * FROM " + Diary.DIARY_SCHEMA + ".session_modification" +
                " WHERE session_id = ? ORDER BY created DESC" +
                " ) m";
        JsonArray params = new JsonArray().add(sessionId);
        sql.prepared(query, params, SqlResult.validUniqueResultHandler(handler));
    }

    @Override
    public void process(long modificationId, JsonObject body, UserInfos user, Handler<Either<String, JsonObject>> handler) {
        getModification(modificationId, getResult -> {
            if (getResult.isLeft()) {
                handler.handle(getResult);
                return;
            }
            JsonObject modification = getResult.right().getValue();
            int status = body.getInteger("status", SessionModificationStatus.PENDING.status());

            if (status == SessionModificationStatus.ACCEPTED.status()) {
                applyAndAccept(modification, modificationId, user, handler);
            } else {
                String refusalReason = body.getString("refusalReason");
                markStatus(modificationId, SessionModificationStatus.REFUSED.status(), refusalReason, updateResult -> {
                    handler.handle(updateResult);
                    if (updateResult.isRight()) {
                        notifyProcessed(modification, user, false);
                    }
                });
            }
        });
    }

    // Une colonne JSONB relue depuis une ligne SQL (SELECT *) arrive comme une chaîne JSON brute
    // côté driver, jamais déjà décodée en JsonObject — contrairement à un JsonObject construit
    // directement en mémoire (ex. le corps de requête HTTP dans propose()).
    private JsonObject getJsonbColumn(JsonObject row, String column) {
        Object raw = row.getValue(column);
        return (raw instanceof String) ? new JsonObject((String) raw) : new JsonObject();
    }

    private void getModification(long modificationId, Handler<Either<String, JsonObject>> handler) {
        String query = "SELECT * FROM " + Diary.DIARY_SCHEMA + ".session_modification WHERE id = ?";
        JsonArray params = new JsonArray().add(modificationId);
        sql.prepared(query, params, SqlResult.validUniqueResultHandler(handler));
    }

    private void applyAndAccept(JsonObject modification, long modificationId, UserInfos user,
                                 Handler<Either<String, JsonObject>> handler) {
        JsonObject payload = getJsonbColumn(modification, "payload");
        Long sessionId = modification.getLong("session_id");

        Handler<Either<String, JsonObject>> afterApply = applyResult -> {
            if (applyResult.isLeft()) {
                handler.handle(applyResult);
                LOGGER.error("[Diary@SessionModificationServiceImpl::applyAndAccept] Failed to apply proposal to session: "
                        + applyResult.left().getValue());
                return;
            }
            Handler<Either<String, JsonObject>> afterMark = updateResult -> {
                handler.handle(updateResult);
                if (updateResult.isRight()) {
                    notifyProcessed(modification, user, true);
                }
            };
            if (sessionId != null) {
                markStatus(modificationId, SessionModificationStatus.ACCEPTED.status(), null, afterMark);
            } else {
                // Proposition de création : on rattache la ligne au session_id fraîchement créé
                // avant de marquer le statut, pour garder une traçabilité correcte.
                Long createdSessionId = applyResult.right().getValue().getLong("id");
                linkCreatedSession(modificationId, createdSessionId, linkResult -> {
                    if (linkResult.isLeft()) {
                        handler.handle(linkResult);
                        return;
                    }
                    markStatus(modificationId, SessionModificationStatus.ACCEPTED.status(), null, afterMark);
                });
            }
        };

        if (sessionId != null) {
            sessionService.updateSession(sessionId, payload, afterApply);
        } else {
            sessionService.createSession(payload, user, afterApply);
        }
    }

    private void linkCreatedSession(long modificationId, Long createdSessionId, Handler<Either<String, JsonObject>> handler) {
        String query = "UPDATE " + Diary.DIARY_SCHEMA + ".session_modification SET session_id = ?, modified = NOW() WHERE id = ?";
        JsonArray params = new JsonArray().add(createdSessionId).add(modificationId);
        sql.prepared(query, params, SqlResult.validUniqueResultHandler(handler));
    }

    private void markStatus(long modificationId, int status, String refusalReason, Handler<Either<String, JsonObject>> handler) {
        String query = "UPDATE " + Diary.DIARY_SCHEMA + ".session_modification" +
                " SET status = ?, refusal_reason = ?, modified = NOW() WHERE id = ? RETURNING id";
        JsonArray params = new JsonArray();
        params.add(status);
        if (refusalReason != null) {
            params.add(refusalReason);
        } else {
            params.addNull();
        }
        params.add(modificationId);
        sql.prepared(query, params, SqlResult.validUniqueResultHandler(handler));
    }

    private void notifyProposed(JsonObject modification, UserInfos proposer, Long modificationId) {
        String teacherId = modification.getString("teacherId");
        if (teacherId == null || timeline == null) {
            return;
        }
        JsonObject params = new JsonObject()
                .put("username", proposer.getUsername())
                .put("uri", "/userbook/annuaire#" + proposer.getUserId() + "#" + proposer.getType())
                .put("resourcepath", pathPrefix + "#/session/modification/" + modificationId);
        List<String> recipients = Collections.singletonList(teacherId);
        timeline.notifyTimeline(null, "diary.session-modification-proposed", proposer, recipients,
                String.valueOf(modificationId), params);
    }

    private void notifyProcessed(JsonObject modification, UserInfos responder, boolean accepted) {
        String proposedBy = modification.getString("proposed_by");
        if (proposedBy == null || timeline == null) {
            return;
        }
        JsonObject params = new JsonObject()
                .put("username", responder.getUsername())
                .put("uri", "/userbook/annuaire#" + responder.getUserId() + "#" + responder.getType())
                .put("resourcepath", pathPrefix + "#/session/modification/" + modification.getLong("id"));
        List<String> recipients = Collections.singletonList(proposedBy);
        String notificationName = accepted ? "diary.session-modification-accepted" : "diary.session-modification-refused";
        timeline.notifyTimeline(null, notificationName, responder, recipients,
                String.valueOf(modification.getLong("id")), params);
    }
}
