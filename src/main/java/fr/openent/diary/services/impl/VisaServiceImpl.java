package fr.openent.diary.services.impl;

import fr.openent.diary.Diary;
import fr.openent.diary.services.ExportPDFService;
import fr.openent.diary.services.InspectorService;
import fr.openent.diary.services.VisaService;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.storage.Storage;
import org.entcore.common.user.UserInfos;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

public class VisaServiceImpl implements VisaService {

    private static final Logger log = LoggerFactory.getLogger(VisaServiceImpl.class);
    private final ExportPDFService exportPDFService;
    private final InspectorService inspectorService;
    private int indexAsync = 0;

    public VisaServiceImpl(Storage storage, EventBus eb, Vertx vertx, JsonObject config, InspectorService inspectorService) {
        this.exportPDFService = new ExportPDFServiceImpl(eb, vertx, storage, config);
        this.inspectorService = inspectorService;
    }

    @Override
    public void getVisasFromSessionsAndHomework(String structure_id, List<String> sessionsIds, List<String> homeworkIds,
                                                Handler<Either<String, JsonArray>> handler) {
        String query = "WITH visa_ids AS (SELECT visa_id FROM diary.session_visa WHERE " +
                " session_id IN " + (!sessionsIds.isEmpty() ? Sql.listPrepared(sessionsIds) : "(null) ") +
                " UNION SELECT visa_id FROM diary.homework_visa WHERE " +
                " homework_id IN " + (!homeworkIds.isEmpty() ? Sql.listPrepared(homeworkIds) : "(null) ") +
                " ) SELECT * FROM diary.visa WHERE structure_id = ? AND id IN (SELECT visa_id FROM visa_ids) ORDER BY created DESC";

        JsonArray params = new JsonArray()
                .addAll(new JsonArray(sessionsIds))
                .addAll(new JsonArray(homeworkIds))
                .add(structure_id);

        Sql.getInstance().prepared(query, params, SqlResult.validResultHandler(handler));
    }

    @Override
    public void createVisas(final HttpServerRequest request, JsonArray visas, UserInfos user, Handler<Either<String, JsonArray>> handler) {
        // Seul un PERSONNEL peut être déclaré inspecteur : pour les autres profils, aucun contrôle ni requête.
        if (!"PERSONNEL".equals(user.getType()) || visas == null || visas.isEmpty()) {
            createVisasAs(request, visas, user, Collections.emptyMap(), handler);
            return;
        }
        List<String> structureIds = new ArrayList<>();
        for (int i = 0; i < visas.size(); i++) {
            String structureId = visas.getJsonObject(i).getString("structure_id");
            if (structureId != null && !structureIds.contains(structureId)) structureIds.add(structureId);
        }
        inspectorService.getInspectorTeachers(user.getUserId(), structureIds, result -> {
            if (result.isLeft()) {
                handler.handle(new Either.Left<>(result.left().getValue()));
                return;
            }
            Map<String, Set<String>> habilitations = habilitationsByStructure(result.right().getValue());
            String refused = refusedTeacher(visas, habilitations);
            if (refused != null) {
                log.warn("[Diary@VisaServiceImpl::createVisas] visa refusé : inspecteur " + user.getUserId()
                        + " non habilité pour l'enseignant " + refused);
                handler.handle(new Either.Left<>("diary.visa.inspector.not.habilitated"));
                return;
            }
            createVisasAs(request, visas, user, habilitations, handler);
        });
    }

    /**
     * Habilitations regroupées par établissement : {@code structure_id → {teacher_id…}}.
     * Ex. : lignes [{S, T1}, {S, T2}] → {S: [T1, T2]}.
     */
    static Map<String, Set<String>> habilitationsByStructure(JsonArray rows) {
        Map<String, Set<String>> map = new HashMap<>();
        if (rows == null) return map;
        for (int i = 0; i < rows.size(); i++) {
            JsonObject row = rows.getJsonObject(i);
            map.computeIfAbsent(row.getString("structure_id"), k -> new HashSet<>()).add(row.getString("teacher_id"));
        }
        return map;
    }

    /**
     * Règle d'habilitation : dans un établissement où l'appelant est déclaré inspecteur (au moins une habilitation),
     * il ne vise que les enseignants pour lesquels il est habilité. Ailleurs (chef d'établissement…), rien ne change.
     * Ex. : habilité pour T1 au collège S, visa demandé sur T2 en S → renvoie T2 ; visa sur T2 au lycée L sans
     * habilitation en L → null (autorisé, visa de chef d'établissement).
     *
     * @return l'identifiant du premier enseignant refusé, ou {@code null} si tous les visas sont autorisés
     */
    static String refusedTeacher(JsonArray visas, Map<String, Set<String>> habilitations) {
        for (int i = 0; i < visas.size(); i++) {
            JsonObject visa = visas.getJsonObject(i);
            Set<String> teachers = habilitations.get(visa.getString("structure_id"));
            if (teachers != null && !teachers.contains(visa.getString("teacher_id"))) return visa.getString("teacher_id");
        }
        return null;
    }

    private void createVisasAs(final HttpServerRequest request, JsonArray visas, UserInfos user,
                               Map<String, Set<String>> habilitations, Handler<Either<String, JsonArray>> handler) {
        final JsonArray statements = new JsonArray();
        indexAsync = visas.size();

        DateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd_HH:mm:ss");
        Date date = new Date();
        final String currentTime = dateFormat.format(date);

        for (int i = 0, imax = visas.size(); i < imax; i++) {
            final JsonObject visa = visas.getJsonObject(i);

            visa.put("owner_id", user.getUserId());
            visa.put("owner_name", user.getUsername());
            visa.put("created", currentTime);
            visa.put("modified", currentTime);

            final Consumer<Boolean> proceedWithOwnerType = isInspector -> {
                visa.put("owner_type", Boolean.TRUE.equals(isInspector) ? "inspector" : "headmaster");

                String fileName = getPDFName(visa);

                generatePDF(request, user, visa, pdf -> {
                    this.exportPDFService.storePDF(pdf, fileName, response -> {

                        if (response.isLeft()) {
                            handler.handle(new Either.Left<>("Stored pdf failed"));
                        }
                        if (response.isRight()) {
                            JsonObject file = response.right().getValue();
                            visa.put("pdf_details", file.getString("_id"));
                            statements.add(get_VisaSession_Statement(visa));
                            indexAsync--;

                            if (indexAsync <= 0) {
                                Sql.getInstance().transaction(statements, SqlResult.validResultHandler(handler));
                            }
                        }
                    });
                });
            };

            // Visa d'inspecteur si l'appelant est habilité pour cet enseignant dans cet établissement
            // (déjà vérifié par createVisas), sinon visa de chef d'établissement.
            Set<String> teachers = habilitations.get(visa.getString("structure_id"));
            proceedWithOwnerType.accept(teachers != null && teachers.contains(visa.getString("teacher_id")));
        }
    }

    @Override
    public void getVisaPdfDetails(String visaId, Handler<Either<String, JsonObject>> handler) {
        StringBuilder query = new StringBuilder();
        query.append(" SELECT *");
        query.append(" FROM " + Diary.DIARY_SCHEMA + ".visa visa");
        query.append(" WHERE visa.id = ?");


        JsonArray params = new JsonArray(Collections.singletonList(visaId));
        Sql.getInstance().prepared(query.toString(), params, SqlResult.validUniqueResultHandler(handler));
    }

    private JsonObject get_VisaSession_Statement(JsonObject visa) {
        StringBuilder query = new StringBuilder();
        JsonArray values = new JsonArray();
        query.append("INSERT INTO diary.visa (comment, structure_id, teacher_id, nb_sessions, pdf_details, owner_id, owner_name, owner_type, created, modified) ");
        query.append("VALUES ");

        JsonArray sessionIds = visa.getJsonArray("sessionIds");
        JsonArray homeworkIds = visa.getJsonArray("homeworkIds");
        query.append("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
        String comment = visa.getString("comment");
        values.add(comment == null || comment.isEmpty() ? "" : comment);
        values.add(visa.getString("structure_id"));
        values.add(visa.getString("teacher_id"));
        values.add(visa.getJsonArray("sessionIds").size());
        values.add(visa.getString("pdf_details"));
        values.add(visa.getString("owner_id"));
        values.add(visa.getString("owner_name"));
        values.add(visa.getString("owner_type"));
        values.add(visa.getString("created"));
        values.add(visa.getString("modified"));

        query.append(createRelationnalVisaQuery(sessionIds,
                Diary.DIARY_SCHEMA + ".session_visa",
                "session_id", values));

        query.append(createRelationnalVisaQuery(homeworkIds,
                Diary.DIARY_SCHEMA + ".homework_visa",
                "homework_id", values));

        return new JsonObject().put("statement", query.toString())
                .put("values", values).put("action", "prepared");

    }

    private StringBuilder createRelationnalVisaQuery(JsonArray ids, String tableUsed, String tableIdName, JsonArray values) {
        StringBuilder query = new StringBuilder();
        for (int j = 0; j < ids.size(); j++) {
            Integer tableId = ids.getInteger(j);
            query.append("INSERT INTO ").append(tableUsed).append(" (").append(tableIdName).append(", visa_id) ");
            query.append("VALUES ");
            query.append("(?, (SELECT currval(pg_get_serial_sequence('diary.visa', 'id'))));");
            values.add(tableId);
        }
        return query;
    }

    private void generatePDF(final HttpServerRequest request, UserInfos user, final JsonObject arrayVisaSessions, final Handler<Buffer> handler) {
        this.exportPDFService.generatePDF(request, user, arrayVisaSessions, "visa.xhtml", handler);
    }


    public String getPDFName(final JsonObject visa) {
        final String fileName = visa.getString("teacher_id") + "_" + visa.getString("structure_id") + visa.getString("owner_id") + "_" + visa.getString("created") + ".pdf";
        return fileName;
    }
}
