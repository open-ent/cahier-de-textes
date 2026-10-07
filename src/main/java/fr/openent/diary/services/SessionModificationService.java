package fr.openent.diary.services;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import org.entcore.common.user.UserInfos;

public interface SessionModificationService {

    /**
     * Propose une création (session_id absent, courseId+date renseignés) ou une modification
     * (session_id renseigné) de séance, à la charge de l'enseignant destinataire (teacher_id).
     */
    void propose(JsonObject modification, UserInfos user, Handler<Either<String, JsonObject>> handler);

    /**
     * Liste les propositions en attente pour l'enseignant connecté (destinataire).
     */
    void listPendingForTeacher(String teacherId, Handler<Either<String, JsonObject>> handler);

    /**
     * Liste les propositions (tous statuts) rattachées à une séance donnée.
     */
    void listForSession(long sessionId, Handler<Either<String, JsonObject>> handler);

    /**
     * Accepte ou refuse une proposition. Sur acceptation, applique le payload à la vraie séance
     * (création ou mise à jour selon le cas) via SessionService, puis marque la proposition.
     * Sur refus, marque uniquement la proposition — aucun effet sur la séance.
     */
    void process(long modificationId, JsonObject body, UserInfos user, Handler<Either<String, JsonObject>> handler);
}
