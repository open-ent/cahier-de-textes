import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { formatDate, hhmm, mondayOf, sortKey, stripHtml, ymd } from '../utils';

/**
 * Séances (leçons) du cahier de textes (parité IHM AngularJS) : liste des séances de l'enseignant
 * sur l'année, création d'une séance (matière/classe/date/horaire/description) et
 * publication/dépublication (visibilité élèves). Matière & classe résolues en clair.
 */
export function Sessions() {
  const { t } = useTranslation(['diary', 'common']);
  const { user, init } = useEdificeClient();
  const qc = useQueryClient();
  const structureId = user?.structures?.[0] ?? '';

  const start = '2025-09-01';
  const end = '2026-07-31';

  const sessionsQuery = useQuery({ queryKey: ['diary', 'sessions', structureId], queryFn: () => api.getOwnSessions(start, end, structureId), enabled: !!structureId });
  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });

  const subjectById = useMemo(() => new Map((subjectsQuery.data ?? []).map((s) => [s.id, s.name])), [subjectsQuery.data]);
  const classById = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])), [classesQuery.data]);

  const sessions = useMemo(
    () => [...(sessionsQuery.data ?? [])].sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)) || (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [sessionsQuery.data],
  );

  // Formulaire de création
  const today = mondayOf(new Date());
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [audienceId, setAudienceId] = useState('');
  const [date, setDate] = useState(ymd(today));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['diary', 'sessions', structureId] });
  const createMut = useMutation({
    mutationFn: () =>
      api.createSession({
        title: title.trim(),
        subject_id: subjectId,
        structure_id: structureId,
        audience_id: audienceId,
        date,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        description: description.trim(),
        color: '#2ecc71',
        course_id: '',
      }),
    onSuccess: () => { setTitle(''); setDescription(''); setFormError(''); invalidate(); },
    onError: () => setFormError(t('diary.session.error', { defaultValue: 'La création de la séance a échoué.' })),
  });
  const publishMut = useMutation({ mutationFn: (id: number) => api.publishSession(id), onSuccess: invalidate });
  const unpublishMut = useMutation({ mutationFn: (id: number) => api.unpublishSession(id), onSuccess: invalidate });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subjectId || !audienceId) {
      setFormError(t('diary.session.required', { defaultValue: 'Titre, matière et classe sont obligatoires.' }));
      return;
    }
    setFormError('');
    createMut.mutate();
  };

  if (init && !structureId) {
    return (
      <div>
        <h1>{t('diary.title', { defaultValue: 'Cahier de textes' })}</h1>
        <div className="alert alert-info" role="alert">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">{t('diary.sessions.title', { defaultValue: 'Séances' })}</h1>

      {/* Création d'une séance */}
      <section className="card p-16 mb-24">
        <h2 style={{ fontSize: 18 }} className="mb-12">{t('diary.session.new', { defaultValue: 'Nouvelle séance' })}</h2>
        <form onSubmit={onCreate} className="d-flex flex-column gap-12">
          <div className="d-flex gap-12 flex-wrap">
            <div className="flex-grow-1" style={{ minWidth: 220 }}>
              <label htmlFor="s-title" className="form-label">{t('diary.session.label', { defaultValue: 'Titre' })}</label>
              <input id="s-title" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div style={{ minWidth: 200 }}>
              <label htmlFor="s-subject" className="form-label">{t('diary.subject', { defaultValue: 'Matière' })}</label>
              <select id="s-subject" className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">{t('diary.choose', { defaultValue: 'Choisir…' })}</option>
                {(subjectsQuery.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 200 }}>
              <label htmlFor="s-class" className="form-label">{t('diary.class', { defaultValue: 'Classe' })}</label>
              <select id="s-class" className="form-select" value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
                <option value="">{t('diary.choose', { defaultValue: 'Choisir…' })}</option>
                {(classesQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="d-flex gap-12 flex-wrap align-items-end">
            <div>
              <label htmlFor="s-date" className="form-label">{t('diary.date', { defaultValue: 'Date' })}</label>
              <input id="s-date" type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="s-start" className="form-label">{t('diary.start', { defaultValue: 'Début' })}</label>
              <input id="s-start" type="time" className="form-control" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="s-end" className="form-label">{t('diary.end', { defaultValue: 'Fin' })}</label>
              <input id="s-end" type="time" className="form-control" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="flex-grow-1" style={{ minWidth: 220 }}>
              <label htmlFor="s-desc" className="form-label">{t('diary.description', { defaultValue: 'Contenu' })}</label>
              <input id="s-desc" className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>{t('diary.session.add', { defaultValue: 'Créer' })}</button>
          </div>
          {formError && <div className="alert alert-warning mb-0" role="alert">{formError}</div>}
        </form>
      </section>

      {/* Liste des séances */}
      <h2 style={{ fontSize: 18 }} className="mb-12">{t('diary.sessions.list', { defaultValue: 'Mes séances' })} <span className="text-muted" style={{ fontSize: 14 }}>({sessions.length})</span></h2>
      {sessionsQuery.isLoading && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}
      {!sessionsQuery.isLoading && sessions.length === 0 && <p className="text-muted">{t('diary.sessions.empty', { defaultValue: 'Aucune séance.' })}</p>}
      {sessions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table table-bordered mb-0">
            <thead>
              <tr>
                <th>{t('diary.date', { defaultValue: 'Date' })}</th>
                <th>{t('diary.slot', { defaultValue: 'Créneau' })}</th>
                <th>{t('diary.subject', { defaultValue: 'Matière' })}</th>
                <th>{t('diary.class', { defaultValue: 'Classe' })}</th>
                <th>{t('diary.session.label', { defaultValue: 'Titre' })}</th>
                <th>{t('diary.content', { defaultValue: 'Contenu' })}</th>
                <th className="text-center">{t('diary.status', { defaultValue: 'Statut' })}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.date)}</td>
                  <td>{hhmm(s.start_time)}{s.end_time ? ` – ${hhmm(s.end_time)}` : ''}</td>
                  <td>{subjectById.get(s.subject_id) ?? s.subject_id}</td>
                  <td>{classById.get(s.audience_id) ?? s.audience_id}</td>
                  <td>{s.title}</td>
                  <td>{stripHtml(s.description)}</td>
                  <td className="text-center">
                    {s.is_published ? (
                      <button type="button" className="btn btn-sm btn-success" disabled={unpublishMut.isPending} onClick={() => unpublishMut.mutate(s.id)}>
                        {t('diary.published', { defaultValue: 'Publiée' })} ✓
                      </button>
                    ) : (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={publishMut.isPending} onClick={() => publishMut.mutate(s.id)}>
                        {t('diary.publish', { defaultValue: 'Publier' })}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Sessions;
