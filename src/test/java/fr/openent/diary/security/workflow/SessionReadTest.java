package fr.openent.diary.security.workflow;

import fr.openent.diary.security.WorkflowUtils;
import io.vertx.core.MultiMap;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.user.UserInfos;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Ne couvre que les branches qui ne touchent pas Neo4j (aucun outillage de mock statique
 * disponible dans ce module pour Neo4j.getInstance()) : le vrai contrôle inter-établissement
 * (ownerId différent de l'appelant) est à vérifier en e2e/manuel avec deux comptes de structures
 * différentes — cf. mémoire du trou IDOR corrigé ici.
 */
public class SessionReadTest {

    private UserInfos userWithSessionRead(String userId, String... structures) {
        UserInfos user = new UserInfos();
        user.setUserId(userId);
        user.setStructures(Arrays.asList(structures));
        UserInfos.Action action = new UserInfos.Action();
        action.setDisplayName(WorkflowUtils.SESSION_READ);
        user.setAuthorizedActions(Collections.singletonList(action));
        return user;
    }

    private HttpServerRequest requestWithOwnerId(String ownerId) {
        HttpServerRequest request = mock(HttpServerRequest.class);
        MultiMap params = MultiMap.caseInsensitiveMultiMap();
        if (ownerId != null) {
            params.set("ownerId", ownerId);
        }
        when(request.params()).thenReturn(params);
        return request;
    }

    @Test
    public void deniedWhenSessionReadRightMissing() {
        UserInfos user = new UserInfos();
        user.setUserId("teacher1");
        user.setAuthorizedActions(Collections.emptyList());
        HttpServerRequest request = requestWithOwnerId(null);

        final boolean[] result = { true };
        new SessionRead().authorize(request, null, user, (r) -> result[0] = r);

        assertEquals(false, result[0]);
    }

    @Test
    public void allowedWhenNoOwnerIdParam() {
        // Les 3 autres routes protégées par ce filtre (session/:id, subjects/exceptional/...)
        // n'ont pas de :ownerId : le contrôle IDOR ne doit jamais les bloquer.
        UserInfos user = userWithSessionRead("teacher1", "structureA");
        HttpServerRequest request = requestWithOwnerId(null);

        final boolean[] result = { false };
        new SessionRead().authorize(request, null, user, (r) -> result[0] = r);

        assertEquals(true, result[0]);
    }

    @Test
    public void allowedWhenOwnerIdIsSelf() {
        UserInfos user = userWithSessionRead("teacher1", "structureA");
        HttpServerRequest request = requestWithOwnerId("teacher1");

        final boolean[] result = { false };
        new SessionRead().authorize(request, null, user, (r) -> result[0] = r);

        assertEquals(true, result[0]);
    }
}
