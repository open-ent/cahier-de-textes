package fr.openent.diary.services.impl;

import io.vertx.core.AsyncResult;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.sql.Sql;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

/**
 * Pont vers RBS (réservation de ressources) pour le cahier de texte — calqué sur
 * fr.cgi.edt.services.impl.RbsBridgeService (module EDT).
 * <p>
 * Uniquement utilisé pour les séances créées DIRECTEMENT (sans cours EDT associé, course_id
 * absent) : une séance dérivée d'un cours EDT affiche les ressources RBS du cours en lecture
 * seule, sans jamais créer sa propre réservation (déjà créée côté EDT, éviter le doublon).
 */
public class DiaryRbsBridgeService {

    private static final Logger log = LoggerFactory.getLogger(DiaryRbsBridgeService.class);
    private static final String RBS_BUS  = "net.atos.entng.rbs";
    private static final String RBS_IANA = "Europe/Paris";
    private static final ZoneId ZONE     = ZoneId.of(RBS_IANA);
    private static final String SESSION_TABLE = "diary.session";

    private DiaryRbsBridgeService() {
        throw new IllegalStateException("Utility class");
    }

    /**
     * Construit un message "save-bookings" RBS pour une séance créée directement (course_id
     * absent) portant des rbsResourceIds, persiste les ids de réservation obtenus sur la séance
     * (rbs_booking_ids), et renvoie les ids de ressources qui n'ont PAS pu être réservés (conflit
     * de créneau côté RBS) pour que le contrôleur puisse le signaler à l'enseignant.
     *
     * @param eb        Vert.x EventBus
     * @param session   JsonObject de la séance (tel que soumis par le contrôleur)
     * @param sessionId id de la séance déjà créée en base
     * @param userId    utilisateur propriétaire de la réservation
     * @return {@link Future<JsonArray>} ids des ressources demandées mais non réservées (vide si
     *         tout s'est bien passé ou si aucune réservation n'était demandée).
     */
    public static Future<JsonArray> createBookings(EventBus eb, JsonObject session, long sessionId, String userId) {
        Promise<JsonArray> promise = Promise.promise();
        JsonArray noConflict = new JsonArray();

        if (eb == null || session == null || userId == null) { promise.complete(noConflict); return promise.future(); }
        if (session.getString("course_id") != null) { promise.complete(noConflict); return promise.future(); } // séance dérivée d'EDT : jamais de réservation ici

        JsonArray rbsResourceIds = session.getJsonArray("rbsResourceIds");
        if (rbsResourceIds == null || rbsResourceIds.isEmpty()) { promise.complete(noConflict); return promise.future(); }

        long startEpoch, endEpoch;
        try {
            LocalDate date = LocalDate.parse(session.getString("date"));
            LocalTime start = LocalTime.parse(session.getString("start_time"));
            LocalTime end = LocalTime.parse(session.getString("end_time"));
            startEpoch = LocalDateTime.of(date, start).atZone(ZONE).toEpochSecond();
            endEpoch = LocalDateTime.of(date, end).atZone(ZONE).toEpochSecond();
        } catch (DateTimeParseException e) {
            log.warn("[Diary@DiaryRbsBridgeService] Cannot parse date/time for session " + sessionId + ": " + e.getMessage());
            promise.complete(noConflict);
            return promise.future();
        }

        JsonArray slots = new JsonArray().add(
                new JsonObject().put("start_date", startEpoch).put("end_date", endEpoch).put("iana", RBS_IANA)
        );

        JsonArray bookings = new JsonArray();
        JsonArray requestedResourceIds = new JsonArray();
        for (int i = 0; i < rbsResourceIds.size(); i++) {
            Integer resourceId = rbsResourceIds.getInteger(i);
            if (resourceId == null) continue;
            requestedResourceIds.add(resourceId);
            bookings.add(new JsonObject()
                    .put("resource",       new JsonObject().put("id", resourceId))
                    .put("slots",          slots)
                    .put("booking_reason", "Cahier de texte")
                    .put("iana",           RBS_IANA)
            );
        }
        if (bookings.isEmpty()) { promise.complete(noConflict); return promise.future(); }

        JsonObject msg = new JsonObject()
                .put("action",   "save-bookings")
                .put("userId",   userId)
                .put("bookings", bookings);

        eb.request(RBS_BUS, msg, reply -> {
            if (reply.failed()) {
                log.error("[Diary@DiaryRbsBridgeService] RBS bus error for session " + sessionId + ": " + reply.cause().getMessage());
                promise.complete(requestedResourceIds);
                return;
            }
            JsonArray created = extractCreatedBookings((JsonObject) reply.result().body());
            JsonArray bookingIds = new JsonArray();
            JsonArray succeededResourceIds = new JsonArray();
            for (int i = 0; i < created.size(); i++) {
                JsonObject b = created.getJsonObject(i);
                Integer bookingId = b.getInteger("id");
                if (bookingId != null) bookingIds.add(bookingId);
                Integer rid = b.getInteger("resource_id");
                if (rid != null) succeededResourceIds.add(rid);
            }

            JsonArray conflictResourceIds = new JsonArray();
            for (int i = 0; i < requestedResourceIds.size(); i++) {
                Integer rid = requestedResourceIds.getInteger(i);
                if (!succeededResourceIds.contains(rid)) conflictResourceIds.add(rid);
            }

            if (bookingIds.isEmpty()) { promise.complete(conflictResourceIds); return; }

            Sql.getInstance().prepared(
                    "UPDATE " + SESSION_TABLE + " SET rbs_booking_ids = ?::jsonb WHERE id = ?",
                    new JsonArray().add(bookingIds.encode()).add(sessionId),
                    res -> {
                        if (!"ok".equals(res.body().getString("status"))) {
                            log.error("[Diary@DiaryRbsBridgeService] Failed to persist rbs_booking_ids on session " + sessionId);
                        }
                        promise.complete(conflictResourceIds);
                    }
            );
        });

        return promise.future();
    }

    /**
     * Supprime des réservations RBS déjà créées (ids de réservation) — symétrique de
     * {@link #createBookings}, à appeler à la suppression d'une séance directe ou quand ses
     * rbsResourceIds changent/disparaissent.
     */
    public static void deleteBookings(EventBus eb, JsonArray bookingIds, String userId) {
        if (eb == null || bookingIds == null || bookingIds.isEmpty() || userId == null) return;

        JsonObject msg = new JsonObject()
                .put("action",   "delete-bookings")
                .put("userId",   userId)
                .put("bookings", bookingIds);

        eb.request(RBS_BUS, msg, reply -> {
            if (reply.failed()) {
                log.error("[Diary@DiaryRbsBridgeService] RBS delete-bookings error: " + reply.cause().getMessage());
            } else {
                log.info("[Diary@DiaryRbsBridgeService] RBS bookings deleted: " + bookingIds);
            }
        });
    }

    /**
     * Liste, sans filtrage par droits RBS, les types et ressources RBS d'une structure — même
     * contrat de bus que fr.cgi.edt.services.impl.RbsBridgeService#listResourcesForStructure.
     */
    public static Future<JsonObject> listResourcesForStructure(EventBus eb, String structureId) {
        Promise<JsonObject> promise = Promise.promise();
        if (eb == null || structureId == null) {
            promise.complete(new JsonObject().put("types", new JsonArray()).put("resources", new JsonArray()));
            return promise.future();
        }

        JsonObject msg = new JsonObject()
                .put("action",      "list-resources")
                .put("structureId", structureId);

        eb.request(RBS_BUS, msg, (AsyncResult<Message<Object>> reply) -> {
            if (reply.failed()) {
                log.error("[Diary@DiaryRbsBridgeService] RBS list-resources error: " + reply.cause().getMessage());
                promise.fail(reply.cause());
                return;
            }
            promise.complete((JsonObject) reply.result().body());
        });

        return promise.future();
    }

    private static JsonArray extractCreatedBookings(JsonObject busReply) {
        if (busReply == null || !"ok".equals(busReply.getString("status"))) return new JsonArray();
        JsonArray result = busReply.getJsonArray("result");
        return result != null ? result : new JsonArray();
    }
}
