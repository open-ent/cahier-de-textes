package fr.openent.diary.services.impl;

import fr.openent.diary.Diary;
import fr.openent.diary.services.InspectorService;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;

import java.util.Collections;


public class InspectorServiceImpl implements InspectorService {
    private final Neo4j neo = Neo4j.getInstance();

    @Override
    public void createInspectorHabilitation(JsonObject habilitation, Handler<Either<String, JsonArray>> handler) {
        JsonArray values = new JsonArray();
        String query = "INSERT INTO " + Diary.DIARY_SCHEMA + ".inspector_habilitation (inspector_id, teacher_id, structure_id) " +
                "VALUES (?, ?, ?);";
        values.add(habilitation.getString("inspectorId"));
        values.add(habilitation.getString("teacherId"));
        values.add(habilitation.getString("structureId"));

        Sql.getInstance().prepared(query, values, SqlResult.validResultHandler(handler));
    }

    @Override
    public void deleteInspectorHabilitation(String inspectorId, String teacherId, String structureId, Handler<Either<String, JsonArray>> handler) {
        JsonArray values = new JsonArray();
        String query = "DELETE FROM " + Diary.DIARY_SCHEMA + ".inspector_habilitation " +
                "WHERE inspector_id = ? " +
                "AND teacher_id = ? " +
                "AND structure_id = ? ";

        values.add(inspectorId);
        values.add(teacherId);
        values.add(structureId);

        Sql.getInstance().prepared(query, values, SqlResult.validResultHandler(handler));
    }

    @Override
    public void deleteInspector(String inspectorId, Handler<Either<String, JsonArray>> handler) {
        String query = "DELETE FROM " + Diary.DIARY_SCHEMA + ".inspector_habilitation WHERE inspector_id = ?";
        JsonArray params = new JsonArray(Collections.singletonList(inspectorId));
        Sql.getInstance().prepared(query, params, SqlResult.validResultHandler(handler));
    }


    @Override
    public void getInspectorHabilitations(String inspectorId, String structureId, UserInfos user, Handler<Either<String, JsonArray>> handler) {
        JsonArray values = new JsonArray();
        String query = "SELECT * FROM " + Diary.DIARY_SCHEMA + ".inspector_habilitation " +
                " WHERE inspector_id = ? " +
                " AND structure_id = ? ";
        values.add(inspectorId);
        values.add(structureId);

        Sql.getInstance().prepared(query, values, SqlResult.validResultHandler(handler));
    }

    @Override
    public void getInspectorStructures(String inspectorId, Handler<Either<String, JsonArray>> handler) {
        String query = "SELECT DISTINCT structure_id FROM " + Diary.DIARY_SCHEMA + ".inspector_habilitation " +
                " WHERE inspector_id = ? ";
        JsonArray values = new JsonArray().add(inspectorId);

        Sql.getInstance().prepared(query, values, SqlResult.validResultHandler(sqlResult -> {
            if (sqlResult.isLeft()) {
                handler.handle(new Either.Left<>(sqlResult.left().getValue()));
                return;
            }

            JsonArray rows = sqlResult.right().getValue();
            JsonArray structureIds = new JsonArray();
            for (int i = 0; i < rows.size(); i++) {
                String structureId = rows.getJsonObject(i).getString("structure_id");
                if (structureId != null && !structureIds.contains(structureId)) {
                    structureIds.add(structureId);
                }
            }

            // Aucune habilitation : on renvoie un tableau vide plutôt que d'interroger l'annuaire
            // avec une liste vide, qui ramènerait toutes les structures sur certains pilotes.
            if (structureIds.isEmpty()) {
                handler.handle(new Either.Right<>(new JsonArray()));
                return;
            }

            // Les noms d'établissement vivent dans l'annuaire, pas dans le schéma du module : le
            // tableau des habilitations ne porte que des identifiants.
            String neoQuery = "MATCH (s:Structure) WHERE s.id IN {structureIds} " +
                    "RETURN s.id AS id, s.name AS name ORDER BY name";
            neo.execute(neoQuery, new JsonObject().put("structureIds", structureIds),
                    Neo4jResult.validResultHandler(handler));
        }));
    }
}
