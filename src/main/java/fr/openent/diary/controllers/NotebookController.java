package fr.openent.diary.controllers;


import fr.openent.diary.core.constants.Field;
import fr.openent.diary.helper.FutureHelper;
import fr.openent.diary.security.workflow.HomeworkRead;
import fr.openent.diary.security.workflow.NotebookRead;
import fr.openent.diary.security.workflow.SessionRead;
import fr.openent.diary.services.InspectorService;
import fr.openent.diary.services.NotebookService;
import fr.openent.diary.services.impl.DefaultNotebookService;
import fr.openent.diary.services.impl.InspectorServiceImpl;
import fr.openent.diary.services.impl.VisaServiceImpl;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;

import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.http.BaseController;

import io.vertx.core.Future;
import io.vertx.core.MultiMap;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;

import io.vertx.core.json.JsonObject;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.response.DefaultResponseHandler;
import org.entcore.common.storage.Storage;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;


public class NotebookController extends BaseController {
    private final NotebookService notebookService;
    private final InspectorService inspectorService = new InspectorServiceImpl();

    /** Identifiant qui ne désigne aucun enseignant : liste vide, même forme de réponse. */
    static final String AUCUN_ENSEIGNANT = "__aucun-enseignant-habilite__";

    public NotebookController(EventBus eb, Vertx vertx, Storage storage, JsonObject config) {
        super();
        this.notebookService = new DefaultNotebookService(eb, vertx, storage, config);
    }

    @Get("/notebooks")
    @ApiDoc("Get global notebooks")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(NotebookRead.class)
    public void getNotebooks(final HttpServerRequest request) {
        MultiMap params = request.params();
        String structure_id = params.get(Field.STRUCTURE_ID);

        String start_at = params.get(Field.START_AT);
        String end_at = params.get(Field.END_AT);

        List<String> teacher_id = params.getAll(Field.TEACHER_ID);
        List<String> audience_id = params.getAll(Field.AUDIENCE_ID);

        Boolean isVisa = params.get(Field.VISA) != null ? Boolean.parseBoolean(params.get(Field.VISA)) : null;
        String visaOrder = params.get(Field.ORDERVISA);
        Boolean isPublished = params.get(Field.IS_PUBLISHED) != null ? Boolean.parseBoolean(params.get(Field.IS_PUBLISHED)) : null;

        Integer page = params.get(Field.PAGE) != null ? Integer.parseInt(params.get(Field.PAGE)) : null;
        String limit = params.get(Field.LIMIT);
        String offset = params.get(Field.OFFSET);
        UserUtils.getUserInfos(eb, request, user -> {
            // Un inspecteur ne voit que les cahiers des enseignants pour lesquels il est habilité dans cet
            // établissement (mêmes règles que le visa, cf. VisaServiceImpl.refusedTeacher).
            if (user == null || !"PERSONNEL".equals(user.getType()) || structure_id == null) {
                notebookService.get(structure_id, start_at, end_at, teacher_id, audience_id, isVisa, visaOrder, isPublished, page,
                        limit, offset, DefaultResponseHandler.defaultResponseHandler(request));
                return;
            }
            inspectorService.getInspectorTeachers(user.getUserId(), Collections.singletonList(structure_id), result -> {
                if (result.isLeft()) {
                    DefaultResponseHandler.defaultResponseHandler(request).handle(new fr.wseduc.webutils.Either.Left<>(result.left().getValue()));
                    return;
                }
                List<String> teachers = restrictTeachers(teacher_id,
                        VisaServiceImpl.habilitationsByStructure(result.right().getValue()).get(structure_id));
                notebookService.get(structure_id, start_at, end_at, teachers, audience_id, isVisa, visaOrder, isPublished, page,
                        limit, offset, DefaultResponseHandler.defaultResponseHandler(request));
            });
        });
    }

    /**
     * Enseignants à interroger pour un appelant donné.
     * Ex. : inspecteur habilité pour T1 et T2 → aucun filtre demandé : [T1, T2] ; [T2, T3] demandés : [T2] ;
     * [T3] demandé : [AUCUN_ENSEIGNANT] (liste vide) ; pas inspecteur ({@code habilitated} null) : filtre inchangé.
     */
    static List<String> restrictTeachers(List<String> requested, Set<String> habilitated) {
        if (habilitated == null) return requested;
        List<String> allowed = new ArrayList<>();
        if (requested == null || requested.isEmpty()) {
            allowed.addAll(habilitated);
        } else {
            for (String id : requested) if (habilitated.contains(id)) allowed.add(id);
        }
        Collections.sort(allowed);
        return allowed.isEmpty() ? Collections.singletonList(AUCUN_ENSEIGNANT) : allowed;
    }

    @Get("/notebooks/sessions/homeworks")
    @ApiDoc("fetch all sessions/homeworks from a notebook")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(NotebookRead.class)
    public void getNotebooksSessions(final HttpServerRequest request) {
        MultiMap params = request.params();

        String structure_id = params.get(Field.STRUCTURE_ID);

        String start_at = params.get(Field.START_AT);
        String end_at = params.get(Field.END_AT);

        String subject_id = params.get(Field.SUBJECT_ID);
        String teacher_id = params.get(Field.TEACHER_ID);
        String audience_id = params.get(Field.AUDIENCE_ID);
        Boolean isVisa = params.get(Field.VISA) != null ? Boolean.parseBoolean(params.get(Field.VISA)) : null;
        Boolean isPublished = params.get(Field.IS_PUBLISHED) != null ? Boolean.parseBoolean(params.get(Field.IS_PUBLISHED)) : null;

        notebookService.getNotebookHomeworksSessions(structure_id, start_at, end_at, subject_id, teacher_id, audience_id,
                isVisa, isPublished, DefaultResponseHandler.arrayResponseHandler(request));
    }
}
