package fr.openent.diary.services.impl;

import fr.openent.diary.eventbus.Viescolaire;
import fr.openent.diary.models.Audience;
import fr.openent.diary.models.Person.User;
import fr.openent.diary.services.AudienceSettingsService;
import fr.openent.diary.services.GroupService;
import fr.openent.diary.services.UserService;
import io.vertx.core.CompositeFuture;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;

import java.util.*;

public class DefaultAudienceSettingsService implements AudienceSettingsService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DefaultAudienceSettingsService.class);
    private static final String TABLE = "diary.audience_settings";

    private final EventBus eb;
    private final GroupService groupService;
    private final UserService userService;

    public DefaultAudienceSettingsService(EventBus eb) {
        this.eb = eb;
        this.groupService = new DefaultGroupService(eb);
        this.userService = new DefaultUserService();
    }

    /**
     * Groupes fonctionnels de l'établissement (le pipeline "classe.*" ci-dessous ne
     * renvoie jamais que des classes ; sans cet appel, les groupes n'apparaissent jamais
     * sur l'écran de paramétrage MOD11, quel que soit l'environnement).
     */
    private Future<JsonArray> fetchAllFunctionalGroups(String structureId) {
        Promise<JsonArray> promise = Promise.promise();
        JsonObject action = new JsonObject()
                .put("action", "groupe.search")
                .put("q", "")
                .put("fields", new JsonArray().add("displayNameSearchField"))
                .put("structureId", structureId);

        eb.request("viescolaire", action, event -> {
            if (event.failed()) {
                promise.fail(event.cause());
            } else {
                JsonObject body = (JsonObject) event.result().body();
                if ("error".equals(body.getString("status"))) {
                    promise.fail(body.getString("message"));
                } else {
                    promise.complete(body.getJsonArray("results"));
                }
            }
        });
        return promise.future();
    }

    /** Groupes manuels (ManualGroup), non couverts par l'action bus "groupe.search". */
    private Future<JsonArray> fetchAllManualGroups(String structureId) {
        Promise<JsonArray> promise = Promise.promise();
        String query = "MATCH (g:ManualGroup)-[:BELONGS|:DEPENDS]->(s:Structure {id: {structureId}}) " +
                "RETURN DISTINCT g.id as id, g.name as name";
        Neo4j.getInstance().execute(query, new JsonObject().put("structureId", structureId),
                Neo4jResult.validResultHandler(either -> {
                    if (either.isRight()) {
                        promise.complete(either.right().getValue());
                    } else {
                        promise.fail(either.left().getValue());
                    }
                }));
        return promise.future();
    }

    private void mergeGroupsInto(Map<String, Audience> merged, JsonArray groups) {
        for (int i = 0; i < groups.size(); i++) {
            JsonObject g = groups.getJsonObject(i);
            merged.putIfAbsent(g.getString("id"), new Audience(g));
        }
    }

    @Override
    public Future<JsonArray> getAudienceSettings(String structureId) {
        // Les appels vers le bus "viescolaire" sont volontairement enchaînés en séquence, pas en
        // parallèle (CompositeFuture) : deux requêtes concurrentes sur ce même bus ne renvoient
        // jamais leur réponse (constaté empiriquement, cause non élucidée côté framework) alors
        // que les mêmes appels fonctionnent correctement l'un après l'autre.
        Promise<JsonArray> classIdsPromise = Promise.promise();
        Viescolaire.getInstance().getClasses(structureId, classIdsPromise::handle);

        return classIdsPromise.future().compose(classIdsRaw -> {
            JsonArray classIds = new JsonArray();
            for (int i = 0; i < classIdsRaw.size(); i++) {
                classIds.add(classIdsRaw.getJsonObject(i).getString("idClasse"));
            }

            Promise<JsonArray> servicesPromise = Promise.promise();
            Viescolaire.getInstance().getServices(structureId, servicesPromise::handle);

            return servicesPromise.future().compose(services -> {
                Promise<List<Audience>> audiencesPromise = Promise.promise();
                groupService.getGroups(classIds, audiencesPromise);

                // Ajout des vrais groupes (fonctionnels + manuels), absents du pipeline "classe.*"
                // ci-dessus : sans cela l'écran de paramétrage MOD11 ne liste jamais que des classes.
                Future<List<Audience>> mergedAudiencesFuture = audiencesPromise.future().compose(classAudiences ->
                        fetchAllFunctionalGroups(structureId).compose(functionalGroupsRaw ->
                                fetchAllManualGroups(structureId).map(manualGroupsRaw -> {
                                    Map<String, Audience> merged = new LinkedHashMap<>();
                                    for (Audience a : classAudiences) {
                                        merged.put(a.getId(), a);
                                    }
                                    mergeGroupsInto(merged, functionalGroupsRaw);
                                    mergeGroupsInto(merged, manualGroupsRaw);
                                    return new ArrayList<>(merged.values());
                                })
                        ));

                return mergedAudiencesFuture.compose(audiences -> {
                    // enseignant.id -> classe.id (déduit des services vie-scolaire, lecture seule)
                    Map<String, Set<String>> teacherIdsByAudience = new HashMap<>();
                    Set<String> allTeacherIds = new HashSet<>();
                    for (int i = 0; i < services.size(); i++) {
                        JsonObject s = services.getJsonObject(i);
                        String groupId = s.getString("id_groupe");
                        String teacherId = s.getString("id_enseignant");
                        if (groupId == null || teacherId == null) continue;
                        teacherIdsByAudience.computeIfAbsent(groupId, k -> new HashSet<>()).add(teacherId);
                        allTeacherIds.add(teacherId);
                    }

                    // Ces deux appels ne touchent pas le bus "viescolaire" (SQL direct / Neo4j direct) :
                    // sans risque connu à les paralléliser entre eux.
                    Promise<JsonArray> overridesPromise = Promise.promise();
                    Sql.getInstance().prepared(
                            "SELECT audience_id, enabled FROM " + TABLE + " WHERE structure_id = ?",
                            new JsonArray().add(structureId),
                            SqlResult.validResultHandler(either -> {
                                if (either.isRight()) {
                                    overridesPromise.complete(either.right().getValue());
                                } else {
                                    overridesPromise.fail(either.left().getValue());
                                }
                            }));

                    Promise<List<User>> teachersPromise = Promise.promise();
                    userService.getTeachers(new JsonArray(new ArrayList<>(allTeacherIds)), teachersPromise);

                    return CompositeFuture.all(overridesPromise.future(), teachersPromise.future())
                            .map(cf -> {
                                JsonArray overrides = overridesPromise.future().result();
                                Map<String, Boolean> enabledByAudience = new HashMap<>();
                                for (int i = 0; i < overrides.size(); i++) {
                                    JsonObject o = overrides.getJsonObject(i);
                                    enabledByAudience.put(o.getString("audience_id"), o.getBoolean("enabled"));
                                }

                                Map<String, String> teacherNameById = new HashMap<>();
                                for (User teacher : teachersPromise.future().result()) {
                                    teacherNameById.put(teacher.getId(), teacher.toJSON().getString("displayName", teacher.getId()));
                                }

                                JsonArray result = new JsonArray();
                                for (Audience audience : audiences) {
                                    String id = audience.getId();
                                    JsonArray teacherNames = new JsonArray();
                                    for (String teacherId : teacherIdsByAudience.getOrDefault(id, Collections.emptySet())) {
                                        teacherNames.add(teacherNameById.getOrDefault(teacherId, teacherId));
                                    }
                                    result.add(new JsonObject()
                                            .put("id", id)
                                            .put("name", audience.getName())
                                            .put("enabled", enabledByAudience.getOrDefault(id, true))
                                            .put("teacherNames", teacherNames));
                                }
                                return result;
                            });
                });
            });
        }).onFailure(err ->
                LOGGER.error("[Diary@DefaultAudienceSettingsService::getAudienceSettings] " + err.getMessage()));
    }

    @Override
    public Future<JsonObject> setAudienceEnabled(String structureId, String audienceId, boolean enabled) {
        Promise<JsonObject> promise = Promise.promise();
        String query = "INSERT INTO " + TABLE + " (structure_id, audience_id, enabled) VALUES (?, ?, ?) " +
                "ON CONFLICT (structure_id, audience_id) DO UPDATE SET enabled = ?";
        JsonArray params = new JsonArray().add(structureId).add(audienceId).add(enabled).add(enabled);
        Sql.getInstance().prepared(query, params, SqlResult.validUniqueResultHandler(either -> {
            if (either.isRight()) {
                promise.complete(new JsonObject().put("audience_id", audienceId).put("enabled", enabled));
            } else {
                LOGGER.error("[Diary@DefaultAudienceSettingsService::setAudienceEnabled] " + either.left().getValue());
                promise.fail(either.left().getValue());
            }
        }));
        return promise.future();
    }
}
