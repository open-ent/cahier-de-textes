package fr.openent.diary.controllers;

import fr.openent.diary.core.constants.EventStores;
import fr.openent.diary.security.WorkflowUtils;
import fr.openent.diary.services.DiaryService;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.http.BaseController;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.events.EventStore;
import org.entcore.common.neo4j.Neo;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.user.UserUtils;
import org.vertx.java.core.http.RouteMatcher;

import java.util.Map;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;

public class DiaryController extends BaseController {

    private final static Logger log = LoggerFactory.getLogger(DiaryController.class);

    private Neo neo;

    DiaryService diaryService;
    private final EventStore eventStore;


    public DiaryController(DiaryService diaryService, EventStore eventStore) {
        this.diaryService = diaryService;
        this.eventStore = eventStore;
    }

    @Override
    public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
                     Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
        super.init(vertx, config, rm, securedActions);
        this.neo = new Neo(vertx, eb, log);
    }

    /** Clé de préférence usager portant le choix d'IHM et l'état des bandeaux qui le proposent.
     *  Ex. {"ui":"react","invitationShown":3} — lue par preferredUi(), écrite par public/ui-switch.js,
     *  par le bandeau React et par les paramètres du compte du dashboard. */
    private static final String UI_PREFERENCE = "diaryUi";

    @Get("")
    @SecuredAction(value = WorkflowUtils.VIEW, type = ActionType.WORKFLOW)
    public void view(final HttpServerRequest request) {
        // Choix de l'IHM (CCTP 51C — migration React), par ordre de priorité décroissante :
        //   1. `?ui=react|angular` — dérogation ponctuelle, NON mémorisée (vérification, support) ;
        //   2. la préférence de l'usager (clé `diaryUi`), posée par les bandeaux de bascule ou par
        //      les paramètres du compte dans le dashboard ;
        //   3. la conf `frontend-ui` du module (variable FRONTEND_UI_DEFAULT), défaut angular.
        // Ex. usager ayant choisi « Nouvelle version » : /diary → diary-react.html ; /diary?ui=angular → diary.html.
        final String uiParam = request.params().get("ui");
        final String forcedUi = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : null;
        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            preferredUi(user.getUserId(), forcedUi).onSuccess(ui -> {
                if ("react".equals(ui)) {
                    renderView(request, new JsonObject(), "diary-react.html", null);
                } else {
                    renderView(request);
                }
                this.eventStore.createAndStoreEvent(EventStores.ACCESS, request);
            });
        });
    }

    /**
     * IHM à servir : la dérogation d'URL si elle est présente, sinon le choix mémorisé par l'usager,
     * sinon celui de la plateforme. Le choix est lu à sa source, le nœud {@code UserAppConf} du graphe
     * (celui qu'écrit {@code PUT /userbook/preference/diaryUi}) : ni la session ni le bus ne restituent
     * une clé écrite pendant la session en cours. Clé sans tiret ni point (entcore les retire).
     * Aucune panne de cette lecture ne doit empêcher le cahier de textes de s'afficher : la plateforme tranche.
     */
    private Future<String> preferredUi(String userId, String forcedUi) {
        if (forcedUi != null) return Future.succeededFuture(forcedUi);
        final Promise<String> promise = Promise.promise();
        final String query = "MATCH (:User {id:$userId})-[:PREFERS]->(uac:UserAppConf) RETURN uac." + UI_PREFERENCE + " AS preference";
        Neo4j.getInstance().execute(query, new JsonObject().put("userId", userId), message -> promise.complete(readUi(message.body())));
        return promise.future();
    }

    /** Extrait le choix d'IHM du résultat Neo4j — la préférence y est rangée en CHAÎNE JSON. */
    private String readUi(JsonObject body) {
        try {
            final JsonArray rows = body.getJsonArray("result", new JsonArray());
            if (rows.isEmpty()) return platformUi();
            final String raw = rows.getJsonObject(0).getString("preference");
            if (raw == null || raw.trim().isEmpty()) return platformUi();
            final String ui = new JsonObject(raw).getString("ui");
            return ("react".equals(ui) || "angular".equals(ui)) ? ui : platformUi();
        } catch (Exception e) {
            // Préférence illisible ou graphe en échec : jamais d'erreur 500 pour un choix d'habillage.
            log.warn("[Diary@readUi] préférence " + UI_PREFERENCE + " illisible", e);
            return platformUi();
        }
    }

    /** IHM de la plateforme quand l'usager n'a rien choisi ; repli « angular », dont la parité est acquise. */
    private String platformUi() {
        return "react".equals(this.config.getString("frontend-ui", "angular")) ? "react" : "angular";
    }

    @Get("/children/list")
    @ApiDoc("Get all children for current user (if applicable)")
    @SecuredAction(value = WorkflowUtils.CHILDREN_READ, type = ActionType.AUTHENTICATED)
    public void listChildren(final HttpServerRequest request) {

        UserUtils.getUserInfos(eb, request, user -> {
            if (user != null) {
                diaryService.listChildren(user.getUserId(), arrayResponseHandler(request));
            } else {
                badRequest(request, "diary.invalid.login");
            }
        }
        );
    }

    @SecuredAction(value = WorkflowUtils.VIEW_CALENDAR, type = ActionType.WORKFLOW)
    public void workflow1(final HttpServerRequest request) { }

    @SecuredAction(value = WorkflowUtils.VIEW_LIST, type = ActionType.WORKFLOW)
    public void workflow2(final HttpServerRequest request) { }

    @SecuredAction(value = WorkflowUtils.ACCESS_OWN_DATA, type = ActionType.WORKFLOW)
    public void workflow3(final HttpServerRequest request) { }

    @SecuredAction(value = WorkflowUtils.ACCESS_CHILD_DATA, type = ActionType.WORKFLOW)
    public void workflow4(final HttpServerRequest request) { }
}
