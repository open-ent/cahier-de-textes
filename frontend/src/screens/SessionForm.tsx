import { MediaLibrary, Modal, useEdificeClient, useMediaLibrary } from '@open-ent/react';
import { Editor, type EditorInstance } from '@open-ent/react/editor';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api, defaultSessionType } from '../api';
import { isStudentOrRelative } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { addResources, PickedFile, SessionResource, workspaceResource } from '../resources';
import {
  canDeleteSession,
  canEditSession,
  draftFromCourse,
  draftFromSession,
  emptyDraft,
  exceptionalLabelOf,
  isExceptional,
  SessionDraft,
  SessionError,
  sessionPayload,
  TITLE_MAX,
  validateSession,
} from '../sessionForm';
import { draftFromHomework, futureSessions as pickFutureSessions, HomeworkDraft, homeworkPayload } from '../homeworkForm';
import { MediacentrePicker } from './MediacentrePicker';
import { SaveAsProgression } from './SaveAsProgression';
import { SessionHomeworks } from './SessionHomeworks';

/** Une chaîne VIDE fait planter l'éditeur du socle (erreur React #321) : paragraphe vide à la place. */
/** Libellé de la matière choisie : intitulé libre, ou nom de la matière de l'établissement. */
const subjectLabelOf = (key: string, subjects: Array<{ id: string; name: string }>): string =>
  exceptionalLabelOf(key) ?? subjects.find((s) => s.id === key)?.name ?? '';

const editorContent = (html: string) => (html && html.trim() ? html : '<p></p>');

/**
 * Séance du cahier de textes, comme l'AngularJS (session/session-page.html, session-form.html) :
 * création (`#/seance/nouvelle`), depuis un cours de l'emploi du temps (`?course=…`), modification
 * ou consultation (`#/seance/:id`). Matière, classe, type, titre, date et horaires, salle et
 * réservations, publication, description riche, documents (espace documentaire, médiacentre) et
 * suppression (bloquée par un visa). Ex. cours de maths du lundi 8 h → séance pré-remplie.
 */
export function SessionForm() {
  const { id } = useParams();
  const sessionId = id && id !== 'nouvelle' ? Number(id) : undefined;
  const [params] = useSearchParams();
  const courseParam = params.get('course');
  const dateParam = params.get('date');
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const { appCode } = useEdificeClient();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();
  const dialogId = useId();
  const structureId = ctx.structure?.id ?? '';
  const pupil = isStudentOrRelative(ctx.profile);
  const canManage = ctx.has('manageSession');
  const canPublish = ctx.has('publishSession');

  const [draft, setDraft] = useState<SessionDraft>(emptyDraft());
  const [loaded, setLoaded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [mediacentre, setMediacentre] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rbsPick, setRbsPick] = useState('');
  const [homeworks, setHomeworks] = useState<HomeworkDraft[]>([]);

  const sessionQuery = useQuery({ queryKey: ['diary', 'session', sessionId], queryFn: () => api.getSession(sessionId!), enabled: !!sessionId });
  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId, pupil), enabled: !!structureId });
  const typesQuery = useQuery({ queryKey: ['diary', 'session-types', structureId], queryFn: () => api.getSessionTypes(structureId), enabled: !!structureId });
  const rbsQuery = useQuery({ queryKey: ['diary', 'rbs', structureId], queryFn: () => api.getRbsResources(structureId), enabled: !!structureId });
  const courseQuery = useQuery({
    queryKey: ['diary', 'course', structureId, courseParam, dateParam, ctx.userId],
    queryFn: async () => (await api.getCourses(structureId, dateParam!, dateParam!, { teacherIds: [ctx.userId] })).find((c) => c._id === courseParam) ?? null,
    enabled: !!structureId && !!courseParam && !!dateParam && !!ctx.userId,
  });
  const homeworkTypesQuery = useQuery({ queryKey: ['diary', 'types', structureId], queryFn: () => api.getHomeworkTypes(structureId), enabled: !!structureId });
  // Séances de la classe dans les 28 jours suivants : échéances possibles d'un devoir.
  const horizon = draft.date ? new Date(`${draft.date}T12:00:00`) : null;
  const horizonEnd = horizon ? new Date(horizon.getTime() + 28 * 86_400_000) : null;
  const futureQuery = useQuery({
    queryKey: ['diary', 'future-sessions', structureId, draft.audienceId, draft.date],
    queryFn: () => {
      const end = `${horizonEnd!.getFullYear()}-${String(horizonEnd!.getMonth() + 1).padStart(2, '0')}-${String(horizonEnd!.getDate()).padStart(2, '0')}`;
      // Un personnel lit par la route « external » (la route « own » ne lui renvoie rien), comme l'AngularJS.
      return ctx.profile === 'personnel' ? api.getExternalSessions(draft.date, end, ctx.userId) : api.getOwnSessions(draft.date, end, structureId);
    },
    enabled: !!structureId && !!draft.date && !!draft.audienceId,
  });
  const futureSessions = pickFutureSessions(futureQuery.data ?? [], { id: sessionId, date: draft.date, audienceId: draft.audienceId });
  const subjects = subjectsQuery.data ?? [];
  const classes = classesQuery.data ?? [];
  const types = typesQuery.data ?? [];
  const rbs = rbsQuery.data ?? [];

  // Chargement du brouillon : séance existante, cours de l'emploi du temps, ou formulaire vide.
  useEffect(() => {
    if (loaded) return;
    if (sessionId) {
      if (sessionQuery.data) {
        setDraft(draftFromSession(sessionQuery.data));
        setHomeworks((sessionQuery.data.from_homeworks ?? []).map((h) => draftFromHomework(h as never)));
        setLoaded(true);
      }
    } else if (courseParam) {
      if (courseQuery.data && classes.length) {
        const c = courseQuery.data;
        const audience = classes.find((k) => k.name === [...(c.classes ?? []), ...(c.groups ?? [])][0]);
        setDraft(draftFromCourse({ ...c, rbsResourceIds: (c as { rbsResourceIds?: number[] }).rbsResourceIds }, audience?.id ?? ''));
        setLoaded(true);
      }
    } else if (!courseParam) {
      setDraft((d) => ({ ...d, date: dateParam ?? d.date }));
      setLoaded(true);
    }
  }, [loaded, sessionId, sessionQuery.data, courseParam, courseQuery.data, classes, dateParam]);

  // Type par défaut : le premier de rang > 0.
  useEffect(() => {
    if (loaded && !draft.typeId && types.length) setDraft((d) => ({ ...d, typeId: String(defaultSessionType(types)?.id ?? '') }));
  }, [loaded, draft.typeId, types]);

  const fromCourse = !!draft.courseId;
  const editable = loaded && canEditSession(draft, ctx.userId, canManage);
  const errors = useMemo(() => validateSession(draft), [draft]);
  const errorText: Record<SessionError, string> = {
    subject: t('diary.session.error.subject', { defaultValue: 'Choisissez une matière.' }),
    audience: t('diary.session.error.audience', { defaultValue: 'Choisissez une classe ou un groupe.' }),
    type: t('diary.session.error.type', { defaultValue: 'Choisissez un type de séance.' }),
    date: t('diary.session.error.date', { defaultValue: 'Renseignez la date.' }),
    start: t('diary.session.error.start', { defaultValue: "Renseignez l'heure de début." }),
    end: t('diary.session.error.end', { defaultValue: "Renseignez l'heure de fin." }),
    duration: t('diary.session.duration', { defaultValue: 'La séance doit durer au moins 15 minutes.' }),
    title: t('diary.session.error.title', { defaultValue: 'Le titre est limité à 50 caractères.' }),
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = sessionPayload(draft, structureId);
      let savedId = sessionId;
      let conflicts: number[] = [];
      if (sessionId) conflicts = (await api.updateSession(sessionId, body)).rbsConflictResourceIds ?? [];
      else {
        const created = (await api.createSession(body as never)) as { id: number; rbsConflictResourceIds?: number[] };
        savedId = created.id;
        conflicts = created.rbsConflictResourceIds ?? [];
      }
      // Devoirs donnés pendant la séance : suppression, modification (objet complet), création.
      const label = exceptionalLabelOf(draft.subjectKey);
      const original = new Map((sessionQuery.data?.from_homeworks ?? []).map((h) => [h.id, !!h.is_published]));
      for (const h of homeworks) {
        if (h.deleted && h.id) {
          await api.deleteHomework(h.id);
          continue;
        }
        if (h.deleted) continue;
        const dueSession = futureSessions.find((x) => String(x.id) === h.dueSessionId);
        const hw = homeworkPayload(h, {
          sessionId: savedId!,
          subjectId: label !== undefined ? 'exceptional' : draft.subjectKey,
          exceptionalLabel: label,
          structureId,
          audienceId: draft.audienceId,
          teacherId: ctx.userId,
          dueSessionDate: dueSession?.date.slice(0, 10),
        });
        if (h.id) await api.updateHomework(h.id, original.get(h.id) !== h.published, hw);
        else await api.saveHomework(hw);
      }
      return { conflicts };
    },
    onSuccess: ({ conflicts }) => {
      qc.invalidateQueries({ queryKey: ['diary'] });
      if (conflicts.length) {
        const names = conflicts.map((rid) => rbs.find((r) => r.id === rid)?.name ?? String(rid)).join(', ');
        setNotice({ ok: false, text: `${t('diary.notify.rbs.conflict', { defaultValue: "La séance est enregistrée, mais ces ressources n'ont pas pu être réservées (déjà prises sur ce créneau) : " })}${names}` });
      } else navigate('/');
    },
    onError: () => setNotice({ ok: false, text: t('diary.session.error', { defaultValue: "L'enregistrement de la séance a échoué." }) }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSession(sessionId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diary'] });
      navigate('/');
    },
    onError: () => {
      setConfirmDelete(false);
      setNotice({ ok: false, text: t('diary.session.delete.error', { defaultValue: 'La séance n’a pas pu être supprimée.' }) });
    },
  });

  const onSubmit = () => {
    setSubmitted(true);
    if (errors.length === 0) save.mutate();
  };
  const onPickFiles = (result: unknown) => {
    const picked = (Array.isArray(result) ? result : [result]) as PickedFile[];
    const incoming = picked.map(workspaceResource).filter((r): r is SessionResource => r !== null);
    setDraft((d) => ({ ...d, resources: addResources(d.resources, incoming).resources }));
    mediaLibraryRef.current?.hide();
  };
  const set = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const rbsLabel = (rid: number) => {
    const r = rbs.find((x) => x.id === rid);
    return r ? (r.typeName ? `${r.name} (${r.typeName})` : r.name) : String(rid);
  };

  if (!loaded) return <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>;
  const title = !sessionId
    ? t('diary.session.new', { defaultValue: 'Nouvelle séance' })
    : editable
      ? t('diary.session.edit', { defaultValue: 'Modifier la séance' })
      : t('diary.session.view', { defaultValue: 'Consulter la séance' });

  return (
    <div>
      <p>
        <Link to="/">← {t('diary.back', { defaultValue: 'Retour' })}</Link>
      </p>
      <h1 className="mb-16">{title}</h1>
      {notice && (
        <div className={`alert ${notice.ok ? 'alert-success' : 'alert-warning'}`} role={notice.ok ? 'status' : 'alert'}>
          {notice.text}
          {!notice.ok && (
            <div className="mt-8">
              <Link to="/" className="btn btn-sm btn-secondary">{t('diary.back', { defaultValue: 'Retour' })}</Link>
            </div>
          )}
        </div>
      )}
      {sessionId && !editable && canManage && (
        <div className="alert alert-info" role="status">
          {t('diary.session.propose.hint', { defaultValue: "Cette séance appartient à un collègue : vous pouvez la consulter." })}
        </div>
      )}

      <form className="card p-16 mb-16" onSubmit={(e) => { e.preventDefault(); if (editable) onSubmit(); }}>
        <fieldset disabled={!editable} className="border-0 p-0 m-0">
          <div className="d-flex gap-16 flex-wrap mb-12">
            <div style={{ minWidth: 240 }}>
              <label htmlFor="ss-subject" className="form-label" style={{ fontWeight: 700 }}>{t('diary.subject', { defaultValue: 'Matière' })} *</label>
              <select id="ss-subject" className="form-select" disabled={fromCourse || !editable} value={draft.subjectKey} onChange={(e) => set('subjectKey', e.target.value)}>
                <option value="">—</option>
                {subjects.map((s) =>
                  s.exceptional ? <option key={`x-${s.name}`} value={`exceptional:${s.name}`}>{s.name}</option> : <option key={s.id} value={s.id}>{s.name}</option>,
                )}
                {isExceptional(draft.subjectKey) && !subjects.some((s) => s.exceptional && `exceptional:${s.name}` === draft.subjectKey) && (
                  <option value={draft.subjectKey}>{draft.subjectKey.slice('exceptional:'.length)}</option>
                )}
              </select>
            </div>
            <div style={{ minWidth: 200 }}>
              <label htmlFor="ss-class" className="form-label" style={{ fontWeight: 700 }}>{t('diary.class', { defaultValue: 'Classe' })} *</label>
              <select id="ss-class" className="form-select" disabled={fromCourse || !editable} value={draft.audienceId} onChange={(e) => set('audienceId', e.target.value)}>
                <option value="">—</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 160 }}>
              <label htmlFor="ss-type" className="form-label" style={{ fontWeight: 700 }}>{t('diary.session.type', { defaultValue: 'Type de séance' })} *</label>
              <select id="ss-type" className="form-select" value={draft.typeId} onChange={(e) => set('typeId', e.target.value)}>
                <option value="">—</option>
                {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.label}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-12" style={{ maxWidth: 520 }}>
            <label htmlFor="ss-title" className="form-label" style={{ fontWeight: 700 }}>{t('diary.session.label', { defaultValue: 'Titre' })}</label>
            <input id="ss-title" className="form-control" maxLength={TITLE_MAX} value={draft.title} placeholder={t('diary.session.title.placeholder', { defaultValue: 'Travail de la séance du jj/mm/aaaa' })} onChange={(e) => set('title', e.target.value)} />
          </div>

          <div className="d-flex gap-16 flex-wrap mb-12">
            <div>
              <label htmlFor="ss-date" className="form-label" style={{ fontWeight: 700 }}>{t('diary.date', { defaultValue: 'Date' })} *</label>
              <input id="ss-date" type="date" className="form-control" disabled={fromCourse || !editable} value={draft.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div>
              <label htmlFor="ss-start" className="form-label" style={{ fontWeight: 700 }}>{t('diary.start', { defaultValue: 'Début' })} *</label>
              <input id="ss-start" type="time" className="form-control" disabled={fromCourse || !editable} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <div>
              <label htmlFor="ss-end" className="form-label" style={{ fontWeight: 700 }}>{t('diary.end', { defaultValue: 'Fin' })} *</label>
              <input id="ss-end" type="time" className="form-control" disabled={fromCourse || !editable} value={draft.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
            {canPublish && (
              <label className="d-flex align-items-center gap-4 m-0 align-self-end">
                <input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />
                {t('diary.publish', { defaultValue: 'Publier' })}
              </label>
            )}
          </div>

          {/* Salle de l'emploi du temps (lecture seule) et réservations */}
          {draft.room && (
            <p className="mb-12" data-room>
              <strong>{t('diary.session.room', { defaultValue: 'Salle' })} :</strong> {draft.room}
            </p>
          )}
          {!fromCourse && rbs.length > 0 && (
            <div className="mb-12" style={{ maxWidth: 520 }}>
              <label htmlFor="ss-rbs" className="form-label" style={{ fontWeight: 700 }}>{t('diary.session.rbs', { defaultValue: 'Salle ou matériel à réserver' })}</label>
              <select
                id="ss-rbs"
                className="form-select"
                value={rbsPick}
                onChange={(e) => {
                  const rid = Number(e.target.value);
                  setRbsPick('');
                  if (rid && !draft.rbsResourceIds.includes(rid)) set('rbsResourceIds', [...draft.rbsResourceIds, rid]);
                }}
              >
                <option value="">{t('diary.session.rbs.choose', { defaultValue: 'Choisir une ressource…' })}</option>
                {rbs.map((r) => <option key={r.id} value={r.id}>{r.typeName ? `${r.name} (${r.typeName})` : r.name}</option>)}
              </select>
            </div>
          )}
          {draft.rbsResourceIds.length > 0 && (
            <ul className="list-inline mb-12" data-rbs-list>
              {draft.rbsResourceIds.map((rid) => (
                <li key={rid} className="d-inline-flex align-items-center gap-4 me-8 badge bg-secondary">
                  {rbsLabel(rid)}
                  {editable && !fromCourse && (
                    <button type="button" className="btn btn-link p-0 text-white" aria-label={`${t('diary.remove', { defaultValue: 'Retirer' })} ${rbsLabel(rid)}`} onClick={() => set('rbsResourceIds', draft.rbsResourceIds.filter((x) => x !== rid))}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mb-12">
            <div className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('diary.description', { defaultValue: 'Contenu' })}</div>
            <Editor
              key={sessionId ?? 'new'}
              content={editorContent(draft.description)}
              mode={editable ? 'edit' : 'read'}
              focus={false}
              variant={editable ? 'outline' : 'ghost'}
              visibility="protected"
              onContentChange={({ editor }: { editor: EditorInstance }) => set('description', editor.isEmpty ? '' : editor.getHTML())}
            />
          </div>

          <section className="mb-12" aria-labelledby="ss-resources">
            <div id="ss-resources" className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('diary.session.resources', { defaultValue: 'Documents attachés' })}</div>
            {editable && (
              <div className="d-flex gap-8 mb-8 flex-wrap">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => mediaLibraryRef.current?.show('attachment')}>
                  {t('diary.resources.add.workspace', { defaultValue: "Ajouter un document de l'espace documentaire" })}
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMediacentre(true)}>
                  {t('diary.resources.add.mediacentre', { defaultValue: 'Ajouter une ressource du médiacentre' })}
                </button>
              </div>
            )}
            {draft.resources.length === 0 ? (
              <p className="text-muted mb-0">{t('diary.session.resources.none', { defaultValue: 'Aucun document attaché.' })}</p>
            ) : (
              <ul className="list-unstyled mb-0" data-resources>
                {draft.resources.map((r) => (
                  <li key={`${r.type}-${r.id}`} className="d-flex align-items-center gap-8 py-4 border-bottom">
                    <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
                    {r.type === 'mediacentre' && <span className="text-muted small">{t('diary.resources.mediacentre', { defaultValue: 'médiacentre' })}</span>}
                    {editable && (
                      <button type="button" className="btn btn-link p-0 text-danger ms-auto" onClick={() => set('resources', draft.resources.filter((x) => !(x.type === r.type && x.id === r.id)))}>
                        {t('diary.remove', { defaultValue: 'Retirer' })}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SessionHomeworks
            drafts={homeworks}
            onChange={setHomeworks}
            types={homeworkTypesQuery.data ?? []}
            structureId={structureId}
            audienceId={draft.audienceId}
            futureSessions={futureSessions}
            canPublish={ctx.has('publishHomework')}
            readOnly={!editable || !ctx.has('manageHomework')}
          />
        </fieldset>

        {canManage && (
          <SaveAsProgression
            ownerId={ctx.userId}
            title={draft.title}
            description={draft.description}
            subjectLabel={subjectLabelOf(draft.subjectKey, subjects)}
            homeworks={((sessionQuery.data?.homeworks ?? []) as Array<{ description: string; estimatedTime?: number; estimatedtime?: number }>).map((h) => ({ description: h.description, estimatedTime: h.estimatedTime ?? h.estimatedtime ?? 0 }))}
          />
        )}

        {submitted && errors.length > 0 && (
          <div className="alert alert-warning" role="alert">
            <ul className="m-0">{errors.map((e) => <li key={e}>{errorText[e]}</li>)}</ul>
          </div>
        )}
        <div className="d-flex gap-8 flex-wrap">
          {editable && (
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {sessionId ? t('diary.save', { defaultValue: 'Enregistrer' }) : t('diary.session.add', { defaultValue: 'Créer' })}
            </button>
          )}
          <Link to="/" className="btn btn-secondary">{t('diary.cancel', { defaultValue: 'Annuler' })}</Link>
          {sessionId && canDeleteSession(draft, ctx.userId, canManage) && (
            <button type="button" className="btn btn-outline-danger ms-auto" onClick={() => setConfirmDelete(true)}>{t('diary.delete', { defaultValue: 'Supprimer' })}</button>
          )}
        </div>
        {sessionId && editable && draft.hasVisa && (
          <p className="text-muted mt-8 mb-0" role="note">{t('diary.session.visa.warning', { defaultValue: 'Un visa est posé sur cette séance : elle ne peut plus être supprimée.' })}</p>
        )}
      </form>

      {mediacentre && (
        <MediacentrePicker attached={draft.resources} onAdd={(resource) => setDraft((d) => ({ ...d, resources: addResources(d.resources, [resource]).resources }))} onClose={() => setMediacentre(false)} />
      )}
      <MediaLibrary appCode={appCode} ref={mediaLibraryRef} multiple visibility="protected" {...mediaLibraryHandlers} onSuccess={onPickFiles} />
      {confirmDelete && (
        <Modal id={dialogId} isOpen onModalClose={() => setConfirmDelete(false)} size="md">
          <Modal.Header onModalClose={() => setConfirmDelete(false)}>{t('diary.delete', { defaultValue: 'Supprimer' })}</Modal.Header>
          <Modal.Body>
            <p className="m-0">{t('diary.session.delete.confirm', { defaultValue: 'Supprimer cette séance et ses devoirs ?' })}</p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
            <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{t('diary.delete', { defaultValue: 'Supprimer' })}</button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default SessionForm;
