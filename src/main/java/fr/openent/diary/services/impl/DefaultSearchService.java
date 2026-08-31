package fr.openent.diary.services.impl;

import fr.openent.diary.core.constants.Field;
import fr.openent.diary.helper.FutureHelper;
import fr.openent.diary.services.SearchService;
import fr.wseduc.webutils.Either;
import io.vertx.core.*;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DefaultSearchService implements SearchService {
    private static final Logger LOGGER = LoggerFactory.getLogger(DefaultSearchService.class);

    private final EventBus eb;

    public DefaultSearchService(EventBus eb) {
        this.eb = eb;
    }

    @Override
    public void search(String query, String structureId, Handler<Either<String, JsonArray>> handler) {
        Promise<JsonArray> userAndGroupPromise = Promise.promise();
        Promise<JsonArray> manualGroupPromise = Promise.promise();
        Future<Set<String>> disabledAudienceIdsFuture = getDisabledAudienceIds(structureId);

        Future.all(userAndGroupPromise.future(), manualGroupPromise.future(), disabledAudienceIdsFuture).onComplete(event -> {
            if (event.failed()) {
                String message = "[Presences@DefaultSearchService::search] Failed to retrieve users and groups " + event.cause();
                LOGGER.error(message);
                handler.handle(new Either.Left<>(message));
            } else {
                List items = Stream.concat(userAndGroupPromise.future().result().stream(), manualGroupPromise.future().result().stream())
                        .collect(Collectors.toList());
                Set<String> disabledAudienceIds = disabledAudienceIdsFuture.result();
                items.removeIf(item -> disabledAudienceIds.contains(((JsonObject) item).getString("id")));
                items.sort((Comparator<JsonObject>) (o1, o2) -> o1.getString("displayName").compareToIgnoreCase(o2.getString("displayName")));
                handler.handle(new Either.Right<>(new JsonArray(items)));
            }
        });
        searchUserAndGroup(query, structureId, FutureHelper.handlerEitherPromise(userAndGroupPromise));
        searchManualGroup(query, structureId, FutureHelper.handlerEitherPromise(manualGroupPromise));
    }

    @Override
    public void searchGroups(String query, List<String> fields, String structure_id, Handler<Either<String, JsonArray>> handler) {
        Promise<JsonArray> groupsPromise = Promise.promise();
        Promise<JsonArray> manualGroupsPromise = Promise.promise();
        Future<Set<String>> disabledAudienceIdsFuture = getDisabledAudienceIds(structure_id);

        Future.all(groupsPromise.future(), manualGroupsPromise.future(), disabledAudienceIdsFuture).onComplete(event -> {
            if (event.failed()) {
                String message = "[Presences@DefaultSearchService::searchGroups] Failed to retrieve groups " + event.cause();
                LOGGER.error(message);
                handler.handle(new Either.Left<>(message));
            } else {
                // correct format like groupsFuture.result() {id, name}
                manualGroupsPromise.future().result().forEach(manualGroup -> {
                    ((JsonObject) manualGroup).put("name", ((JsonObject) manualGroup).getString("displayName"));
                });
                Set<String> disabledAudienceIds = disabledAudienceIdsFuture.result();
                JsonArray groups = filterDisabledGroups(groupsPromise.future().result(), disabledAudienceIds);
                JsonArray manualGroups = filterDisabledGroups(manualGroupsPromise.future().result(), disabledAudienceIds);
                handler.handle(new Either.Right<>(groups.addAll(manualGroups)));
            }
        });

        searchGroupsEventBus(query, fields, structure_id, FutureHelper.handlerEitherPromise(groupsPromise));
        searchManualGroup(query, structure_id, FutureHelper.handlerEitherPromise(manualGroupsPromise));
    }

    /**
     * Classes/groupes désactivés via l'écran de paramétrage MOD11 (table diary.audience_settings) :
     * à exclure de toute suggestion de recherche, sans quoi le paramétrage n'a aucun effet réel.
     */
    private Future<Set<String>> getDisabledAudienceIds(String structureId) {
        Promise<Set<String>> promise = Promise.promise();
        Sql.getInstance().prepared(
                "SELECT audience_id FROM diary.audience_settings WHERE structure_id = ? AND enabled = false",
                new JsonArray().add(structureId),
                SqlResult.validResultHandler(either -> {
                    if (either.isRight()) {
                        Set<String> ids = new HashSet<>();
                        JsonArray rows = either.right().getValue();
                        for (int i = 0; i < rows.size(); i++) {
                            ids.add(rows.getJsonObject(i).getString("audience_id"));
                        }
                        promise.complete(ids);
                    } else {
                        promise.fail(either.left().getValue());
                    }
                }));
        return promise.future();
    }

    private JsonArray filterDisabledGroups(JsonArray groups, Set<String> disabledAudienceIds) {
        JsonArray filtered = new JsonArray();
        for (int i = 0; i < groups.size(); i++) {
            JsonObject group = groups.getJsonObject(i);
            if (!disabledAudienceIds.contains(group.getString("id"))) {
                filtered.add(group);
            }
        }
        return filtered;
    }

    private void searchGroupsEventBus(String query, List<String> fields, String structure_id, Handler<Either<String, JsonArray>> handler) {
        JsonObject action = new JsonObject()
                .put("action", "groupe.search")
                .put("q", query)
                .put("fields", new JsonArray(fields))
                .put("structureId", structure_id);

        eb.request("viescolaire", action, event -> {
            if (event.failed()) {
                String message = String.format("[Presences@DefaultSearchService::searchGroupsEventBus] Failed to search for groups %s", event.cause().getMessage());
                LOGGER.error(message);
                handler.handle(new Either.Left<>(event.cause().getMessage()));
            } else if (Field.ERROR.equals(((JsonObject) event.result().body()).getString(Field.STATUS))) {
                String message = String.format("[Presences@DefaultSearchService::searchGroupsEventBus] Failed to search for groups %s" + ((JsonObject) event.result().body()).getString(Field.MESSAGE));
                LOGGER.error(message);
                handler.handle(new Either.Left<>(event.cause().getMessage()));
            } else {
                handler.handle(new Either.Right<>(((JsonObject) event.result().body()).getJsonArray(Field.RESULTS)));
            }
        });
    }

    private void searchManualGroup(String query, String structureId, Handler<Either<String, JsonArray>> handler) {
        String searchQuery = "MATCH (User {profiles:['Student']})-[:IN]->(g:ManualGroup)-[:BELONGS|:DEPENDS]->(s:Structure {id: {structureId}}) " +
                "WHERE toLower(g.name) CONTAINS {query} " +
                "RETURN DISTINCT g.id as id, g.name as displayName, 'GROUP' as type, g.id as groupId, g.name as groupName ";

        JsonObject params = new JsonObject().put("structureId", structureId).put("query", query);;
        Neo4j.getInstance().execute(searchQuery, params, Neo4jResult.validResultHandler(handler));
    }

    private void searchUserAndGroup(String query, String structureId, Handler<Either<String, JsonArray>> handler) {
        String searchQuery = "MATCH (u:User {profiles: ['Student']})-[:IN]->(:ProfileGroup)-[:DEPENDS]->(c:Class)-[:BELONGS]->(s:Structure {id:{structureId}}) " +
                "WHERE toLower(u.firstName) CONTAINS {query} " +
                "OR toLower(u.lastName) CONTAINS {query} " +
                "RETURN distinct u.id as id, (u.lastName + ' ' + u.firstName) as displayName, 'USER' as type, c.id as groupId, c.name as groupName " +
                "UNION " +
                // MATCHING Functional Group
                "MATCH (g)-[:BELONGS|:DEPENDS]->(s:Structure {id:{structureId}}) " +
                "WHERE toLower(g.name) CONTAINS {query} " +
                "AND (g:Class OR g:FunctionalGroup) " +
                "RETURN g.id as id, g.name as displayName, 'GROUP' as type, g.id as groupId, g.name as groupName ";

        JsonObject params = new JsonObject().put("structureId", structureId).put("query", query);;
        Neo4j.getInstance().execute(searchQuery, params, Neo4jResult.validResultHandler(handler));
    }
}

