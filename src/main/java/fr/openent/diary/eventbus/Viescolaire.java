package fr.openent.diary.eventbus;


import fr.openent.diary.helper.FutureHelper;
import fr.openent.diary.message.MessageResponseHandler;
import io.vertx.core.AsyncResult;
import io.vertx.core.Handler;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;

public class Viescolaire {

    private String address = "viescolaire";
    private EventBus eb;

    private Viescolaire() {}

    public static Viescolaire getInstance() {
        return ViescolaireHolder.instance;
    }

    public void init(EventBus eb) {
        this.eb = eb;
    }


    public void getSchoolYearPeriod(String structureId, Handler<AsyncResult<JsonObject>> handler) {
        JsonObject action = new JsonObject()
                .put("structureId", structureId)
                .put("action", "periode.getSchoolYearPeriod");

        eb.request(address, action, MessageResponseHandler.messageJsonObjectHandler(FutureHelper.handlerJsonObject(handler)));
    }

    /**
     * Liste les classes de l'établissement (audiences potentielles pour le paramétrage du
     * cahier de textes par classe, MOD11).
     * <p>
     * N'utilise PAS {@link MessageResponseHandler#messageJsonArrayHandler} : ce helper lit le
     * champ singulier "result", alors que {@code getJsonArrayBusResultHandler} côté vie-scolaire
     * répond avec le champ pluriel "results" (cf. EventBusController.java) — avec le mauvais
     * helper, le tableau extrait est toujours {@code null}.
     */
    public void getClasses(String structureId, Handler<AsyncResult<JsonArray>> handler) {
        JsonObject action = new JsonObject()
                .put("idEtablissement", structureId)
                .put("action", "classe.getClasseEtablissement");

        eb.request(address, action, (AsyncResult<io.vertx.core.eventbus.Message<JsonObject>> event) -> handleArrayReply(event, handler));
    }

    /**
     * Liste tous les services (enseignant+matière+classe/groupe) de l'établissement — utilisé
     * en lecture seule pour afficher, par classe, les enseignants qui y interviennent (le
     * paramétrage enseignant+matière+classe reste piloté par vie-scolaire, pas dupliqué ici).
     */
    public void getServices(String structureId, Handler<AsyncResult<JsonArray>> handler) {
        JsonObject action = new JsonObject()
                .put("idStructure", structureId)
                .put("action", "service.getAllServices");

        eb.request(address, action, (AsyncResult<io.vertx.core.eventbus.Message<JsonObject>> event) -> handleArrayReply(event, handler));
    }

    private void handleArrayReply(AsyncResult<io.vertx.core.eventbus.Message<JsonObject>> event, Handler<AsyncResult<JsonArray>> handler) {
        if (event.succeeded() && "ok".equals(event.result().body().getString("status"))) {
            handler.handle(io.vertx.core.Future.succeededFuture(event.result().body().getJsonArray("results")));
        } else {
            String message = event.succeeded() ? event.result().body().getString("message") : event.cause().getMessage();
            handler.handle(io.vertx.core.Future.failedFuture(message));
        }
    }


    private static class ViescolaireHolder {
        private static final Viescolaire instance = new Viescolaire();

        private ViescolaireHolder() {}
    }
}
