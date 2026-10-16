import { MediaLibrary, Modal, useEdificeClient, useMediaLibrary } from '@open-ent/react';
import { Editor, type EditorInstance } from '@open-ent/react/editor';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api } from '../api';
import { isStudentOrRelative } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import {
  canEditHomework,
  dayWorkload,
  draftFromHomeworkPage,
  emptyHomeworkPage,
  futureSessions as pickFutureSessions,
  HomeworkPageDraft,
  HomeworkPageError,
  homeworkPagePayload,
  isPastDue,
  progressState,
  validateHomeworkPage,
  workloadColor,
} from '../homeworkForm';
import { addResources, PickedFile, SessionResource, workspaceResource } from '../resources';
import { isExceptional } from '../sessionForm';
import { ymd } from '../utils';
import { MediacentrePicker } from './MediacentrePicker';

const editorContent = (html: string) => (html && html.trim() ? html : '<p></p>');
const COLOR = { green: '#00ab6f', yellow: '#f5b700', red: '#e13a3a' } as const;

/**
 * Devoir, comme l'AngularJS (homework/homework-page.html, homework-form.html) : création
 * (`#/devoir/nouveau`), modification ou consultation (`#/devoir/:id`). Matière, classe, type,
 * échéance (séance future ou date), durée, charge de travail du jour, publication, description riche
 * et documents ; suppression ; case « fait » pour l'élève. Ex. « Apprendre la leçon 4 » en 401.
 */
export function HomeworkForm() {
  const { id } = useParams();
  const homeworkId = id && id !== 'nouveau' ? Number(id) : undefined;
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const { appCode } = useEdificeClient();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();
  const dialogId = useId();
  const structureId = ctx.structure?.id ?? '';
  const pupil = isStudentOrRelative(ctx.profile);
  const canManage = ctx.has('manageHomework');
  const canPublish = ctx.has('publishHomework');
  const today = ymd(new Date());

  const [draft, setDraft] = useState<HomeworkPageDraft>(emptyHomeworkPage());
  const [loaded, setLoaded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mediacentre, setMediacentre] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const homeworkQuery = useQuery({ queryKey: ['diary', 'homework', homeworkId, ctx.profile === 'student' ? ctx.userId : ''], queryFn: () => api.getHomework(homeworkId!, ctx.profile === 'student' ? ctx.userId : undefined), enabled: !!homeworkId && ctx.ready });
  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId, pupil), enabled: !!structureId });
  const typesQuery = useQuery({ queryKey: ['diary', 'types', structureId], queryFn: () => api.getHomeworkTypes(structureId), enabled: !!structureId });
  const end28 = ymd(new Date(Date.now() + 28 * 86_400_000));
  const personnel = ctx.profile === 'personnel';
  const futureQuery = useQuery({
    queryKey: ['diary', 'future-sessions-hw', structureId, draft.audienceId],
    queryFn: () => (personnel ? api.getExternalSessions(today, end28, ctx.userId) : api.getOwnSessions(today, end28, structureId)),
    enabled: !!structureId && !!draft.audienceId && !pupil,
  });
  const futureSessions = pickFutureSessions(futureQuery.data ?? [], { date: '0000-00-00', audienceId: draft.audienceId });
  const subjects = subjectsQuery.data ?? [];
  const classes = classesQuery.data ?? [];
  const types = typesQuery.data ?? [];

  useEffect(() => {
    if (loaded) return;
    if (homeworkId) {
      if (homeworkQuery.data) {
        setDraft(draftFromHomeworkPage(homeworkQuery.data as never));
        setLoaded(true);
      }
    } else setLoaded(true);
  }, [loaded, homeworkId, homeworkQuery.data]);

  const editable = loaded && canEditHomework(draft, ctx.userId, canManage) && !isPastDue(draft, today);
  const errors = useMemo(() => validateHomeworkPage(draft), [draft]);
  const errorText: Record<HomeworkPageError, string> = {
    subject: t('diary.session.error.subject', { defaultValue: 'Choisissez une matière.' }),
    audience: t('diary.session.error.audience', { defaultValue: 'Choisissez une classe ou un groupe.' }),
    type: t('diary.homework.error.type', { defaultValue: 'Choisissez un type de devoir.' }),
    due: t('diary.homework.error.due', { defaultValue: "Choisissez l'échéance (séance ou date)." }),
    time: t('diary.homework.error.time', { defaultValue: 'La durée estimée doit être positive ou nulle.' }),
  };
  const dueDay = draft.dueMode === 'session' ? futureSessions.find((s) => String(s.id) === draft.dueSessionId)?.date.slice(0, 10) ?? '' : draft.dueDate;
  const workload = useQuery({
    queryKey: ['diary', 'workload', structureId, draft.audienceId, dueDay, draft.published],
    queryFn: () => api.getWorkload(structureId, draft.audienceId, dueDay, draft.published),
    enabled: editable && !!dueDay && !!draft.audienceId,
  });
  const load = workload.data ? dayWorkload(workload.data, dueDay) : null;

  const save = useMutation({
    mutationFn: async () => {
      const dueSession = futureSessions.find((x) => String(x.id) === draft.dueSessionId);
      const body = homeworkPagePayload(draft, { structureId, teacherId: ctx.userId, dueSessionDate: dueSession?.date.slice(0, 10) });
      if (homeworkId) await api.updateHomework(homeworkId, !!homeworkQuery.data && !!homeworkQuery.data.is_published !== draft.published, body);
      else await api.saveHomework(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diary'] });
      navigate('/devoirs');
    },
    onError: () => setNotice(t('diary.homework.error', { defaultValue: "L'enregistrement a échoué." })),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteHomework(homeworkId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diary'] });
      navigate('/devoirs');
    },
    onError: () => {
      setConfirmDelete(false);
      setNotice(t('diary.homework.delete.error', { defaultValue: "Le devoir n'a pas pu être supprimé." }));
    },
  });
  const progress = useMutation({
    mutationFn: (done: boolean) => api.setHomeworkProgress(homeworkId!, progressState(done)),
    // La case change tout de suite ; retour à l'état précédent si l'enregistrement échoue.
    onMutate: (done) => {
      const previous = !!draft.done;
      setDraft((d) => ({ ...d, done }));
      return { previous };
    },
    onError: (_e, _done, ctxPrev) => setDraft((d) => ({ ...d, done: ctxPrev?.previous })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['diary', 'homeworks'] }),
  });

  const set = <K extends keyof HomeworkPageDraft>(k: K, v: HomeworkPageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const onPickFiles = (result: unknown) => {
    const picked = (Array.isArray(result) ? result : [result]) as PickedFile[];
    const incoming = picked.map(workspaceResource).filter((r): r is SessionResource => r !== null);
    setDraft((d) => ({ ...d, resources: addResources(d.resources, incoming).resources }));
    mediaLibraryRef.current?.hide();
  };

  if (!loaded) return <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>;
  const title = !homeworkId
    ? t('diary.homework.new', { defaultValue: 'Nouveau devoir' })
    : editable
      ? t('diary.homework.edit', { defaultValue: 'Modifier le devoir' })
      : t('diary.homework.view', { defaultValue: 'Consulter le devoir' });

  return (
    <div>
      <p>
        <Link to="/devoirs">← {t('diary.back', { defaultValue: 'Retour' })}</Link>
      </p>
      <h1 className="mb-16">{title}</h1>
      {notice && <div className="alert alert-warning" role="alert">{notice}</div>}
      {homeworkId && !editable && canManage && isPastDue(draft, today) && (
        <div className="alert alert-info" role="status">{t('diary.homework.past', { defaultValue: "L'échéance de ce devoir est passée : il n'est plus modifiable." })}</div>
      )}

      {/* Élève : case « fait » (droit de suivi des devoirs, profil élève comme `isChild` de l'AngularJS) */}
      {homeworkId && ctx.has('setProgressHomework') && ctx.profile === 'student' && (
        <label className="d-flex align-items-center gap-8 mb-16" data-done style={{ fontWeight: 700 }}>
          <input type="checkbox" checked={!!draft.done} disabled={progress.isPending} onChange={(e) => progress.mutate(e.target.checked)} />
          {draft.done ? t('diary.homework.done', { defaultValue: 'Fait' }) : t('diary.homework.todo', { defaultValue: 'À faire' })}
        </label>
      )}

      <form className="card p-16 mb-16" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (editable && errors.length === 0) save.mutate(); }}>
        <fieldset disabled={!editable} className="border-0 p-0 m-0">
          <div className="d-flex gap-16 flex-wrap mb-12">
            <div style={{ minWidth: 240 }}>
              <label htmlFor="hp-subject" className="form-label" style={{ fontWeight: 700 }}>{t('diary.subject', { defaultValue: 'Matière' })} *</label>
              <select id="hp-subject" className="form-select" value={draft.subjectKey} onChange={(e) => set('subjectKey', e.target.value)}>
                <option value="">—</option>
                {subjects.map((s) => (s.exceptional ? <option key={`x-${s.name}`} value={`exceptional:${s.name}`}>{s.name}</option> : <option key={s.id} value={s.id}>{s.name}</option>))}
                {isExceptional(draft.subjectKey) && !subjects.some((s) => s.exceptional && `exceptional:${s.name}` === draft.subjectKey) && (
                  <option value={draft.subjectKey}>{draft.subjectKey.slice('exceptional:'.length)}</option>
                )}
              </select>
            </div>
            <div style={{ minWidth: 200 }}>
              <label htmlFor="hp-class" className="form-label" style={{ fontWeight: 700 }}>{t('diary.class', { defaultValue: 'Classe' })} *</label>
              <select id="hp-class" className="form-select" value={draft.audienceId} onChange={(e) => set('audienceId', e.target.value)}>
                <option value="">—</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 200 }}>
              <label htmlFor="hp-type" className="form-label" style={{ fontWeight: 700 }}>{t('diary.homework.type', { defaultValue: 'Type' })} *</label>
              <select id="hp-type" className="form-select" value={draft.typeId} onChange={(e) => set('typeId', e.target.value)}>
                <option value="">—</option>
                {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.label}</option>)}
              </select>
            </div>
          </div>

          <div className="d-flex gap-16 flex-wrap mb-12">
            <fieldset>
              <legend className="form-label" style={{ fontSize: 14, fontWeight: 700 }}>{t('diary.homework.due', { defaultValue: 'À rendre pour' })} *</legend>
              <div className="d-flex gap-12">
                <label className="d-flex gap-4 align-items-center m-0">
                  <input type="radio" name="hp-due-mode" checked={draft.dueMode === 'session'} onChange={() => set('dueMode', 'session')} />
                  {t('diary.homework.due.session', { defaultValue: 'Une séance' })}
                </label>
                <label className="d-flex gap-4 align-items-center m-0">
                  <input type="radio" name="hp-due-mode" checked={draft.dueMode === 'date'} onChange={() => set('dueMode', 'date')} />
                  {t('diary.homework.due.date', { defaultValue: 'Une date' })}
                </label>
              </div>
            </fieldset>
            {draft.dueMode === 'session' ? (
              <div style={{ minWidth: 240 }}>
                <label htmlFor="hp-session" className="form-label" style={{ fontWeight: 700 }}>{t('diary.homework.due.session', { defaultValue: 'Séance' })}</label>
                <select id="hp-session" className="form-select" value={draft.dueSessionId} onChange={(e) => set('dueSessionId', e.target.value)}>
                  <option value="">—</option>
                  {draft.dueSessionId && !futureSessions.some((s) => String(s.id) === draft.dueSessionId) && <option value={draft.dueSessionId}>{t('diary.homework.due.session', { defaultValue: 'Séance' })} #{draft.dueSessionId}</option>}
                  {futureSessions.map((s) => <option key={s.id} value={s.id}>{new Date(`${s.date.slice(0, 10)}T12:00:00`).toLocaleDateString()} {s.start_time?.slice(0, 5)} — {s.title}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="hp-date" className="form-label" style={{ fontWeight: 700 }}>{t('diary.due', { defaultValue: 'À rendre le' })}</label>
                <input id="hp-date" type="date" className="form-control" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
              </div>
            )}
            <div style={{ maxWidth: 130 }}>
              <label htmlFor="hp-time" className="form-label" style={{ fontWeight: 700 }}>{t('diary.homework.time', { defaultValue: 'Durée (min)' })}</label>
              <input id="hp-time" type="number" min={0} className="form-control" value={draft.estimatedTime} onChange={(e) => set('estimatedTime', Math.max(0, Number(e.target.value) || 0))} />
            </div>
            {canPublish && (
              <label className="d-flex align-items-center gap-4 m-0 align-self-end">
                <input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />
                {t('diary.publish', { defaultValue: 'Publier' })}
              </label>
            )}
          </div>
          {editable && dueDay && load && (
            <p className="mb-12" data-workload role="status">
              <span aria-hidden style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: COLOR[workloadColor(load.count)], marginRight: 6 }} />
              {t('diary.homework.workload', { defaultValue: 'Charge de travail ce jour-là : [[count]] devoir(s), [[total]] min', count: load.count, total: load.total })}
            </p>
          )}

          <div className="mb-12">
            <div className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('diary.description', { defaultValue: 'Contenu' })}</div>
            <Editor
              key={homeworkId ?? 'new'}
              content={editorContent(draft.description)}
              mode={editable ? 'edit' : 'read'}
              focus={false}
              variant={editable ? 'outline' : 'ghost'}
              visibility="protected"
              onContentChange={({ editor }: { editor: EditorInstance }) => set('description', editor.isEmpty ? '' : editor.getHTML())}
            />
          </div>

          <section className="mb-12" aria-labelledby="hp-resources">
            <div id="hp-resources" className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('diary.session.resources', { defaultValue: 'Documents attachés' })}</div>
            {editable && (
              <div className="d-flex gap-8 mb-8 flex-wrap">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => mediaLibraryRef.current?.show('attachment')}>{t('diary.resources.add.workspace', { defaultValue: "Ajouter un document de l'espace documentaire" })}</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMediacentre(true)}>{t('diary.resources.add.mediacentre', { defaultValue: 'Ajouter une ressource du médiacentre' })}</button>
              </div>
            )}
            {draft.resources.length === 0 ? (
              <p className="text-muted mb-0">{t('diary.session.resources.none', { defaultValue: 'Aucun document attaché.' })}</p>
            ) : (
              <ul className="list-unstyled mb-0" data-resources>
                {draft.resources.map((r) => (
                  <li key={`${r.type}-${r.id}`} className="d-flex align-items-center gap-8 py-4 border-bottom">
                    <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
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
        </fieldset>

        {submitted && errors.length > 0 && (
          <div className="alert alert-warning" role="alert">
            <ul className="m-0">{errors.map((e) => <li key={e}>{errorText[e]}</li>)}</ul>
          </div>
        )}
        <div className="d-flex gap-8 flex-wrap">
          {editable && (
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {homeworkId ? t('diary.save', { defaultValue: 'Enregistrer' }) : t('diary.homework.add', { defaultValue: 'Ajouter le devoir' })}
            </button>
          )}
          <Link to="/devoirs" className="btn btn-secondary">{t('diary.cancel', { defaultValue: 'Annuler' })}</Link>
          {homeworkId && canEditHomework(draft, ctx.userId, canManage) && (
            <button type="button" className="btn btn-outline-danger ms-auto" onClick={() => setConfirmDelete(true)}>{t('diary.delete', { defaultValue: 'Supprimer' })}</button>
          )}
        </div>
      </form>

      {mediacentre && <MediacentrePicker attached={draft.resources} onAdd={(resource) => setDraft((d) => ({ ...d, resources: addResources(d.resources, [resource]).resources }))} onClose={() => setMediacentre(false)} />}
      <MediaLibrary appCode={appCode} ref={mediaLibraryRef} multiple visibility="protected" {...mediaLibraryHandlers} onSuccess={onPickFiles} />
      {confirmDelete && (
        <Modal id={dialogId} isOpen onModalClose={() => setConfirmDelete(false)} size="md">
          <Modal.Header onModalClose={() => setConfirmDelete(false)}>{t('diary.delete', { defaultValue: 'Supprimer' })}</Modal.Header>
          <Modal.Body><p className="m-0">{t('diary.homework.confirm.delete', { defaultValue: 'Supprimer ce devoir ?' })}</p></Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
            <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{t('diary.delete', { defaultValue: 'Supprimer' })}</button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default HomeworkForm;
