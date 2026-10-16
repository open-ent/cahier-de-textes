import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { isStudentOrRelative } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { formatDate, hhmm, sortKey, stripHtml } from '../utils';

/**
 * Séances (leçons) du cahier de textes (parité IHM AngularJS) : liste des séances de l'enseignant
 * sur l'année, création d'une séance (matière/classe/date/horaire/description) et
 * publication/dépublication (visibilité élèves). Matière & classe résolues en clair.
 */
export function Sessions() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const canManage = ctx.has('manageSession');
  const canPublish = ctx.has('publishSession');

  // Période : l'année scolaire de l'établissement (ex. du 01/09/2026 au 04/07/2027) ; à défaut,
  // l'année scolaire calendaire en cours. Remplace une période figée qui masquait l'année en cours.
  const schoolYearQuery = useQuery({ queryKey: ['diary', 'schoolyear', structureId], queryFn: () => api.getSchoolYear(structureId), enabled: !!structureId });
  const fallbackYear = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const start = schoolYearQuery.data?.start ?? `${fallbackYear}-08-01`;
  const end = schoolYearQuery.data?.end ?? `${fallbackYear + 1}-07-31`;

  const sessionsQuery = useQuery({ queryKey: ['diary', 'sessions', structureId, start, end], queryFn: () => (ctx.profile === 'personnel' ? api.getExternalSessions(start, end, ctx.userId) : api.getOwnSessions(start, end, structureId)), enabled: !!structureId && !schoolYearQuery.isLoading });
  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId, isStudentOrRelative(ctx.profile)), enabled: !!structureId });

  const subjectById = useMemo(() => new Map((subjectsQuery.data ?? []).filter((s) => !s.exceptional).map((s) => [s.id, s.name])), [subjectsQuery.data]);
  const classById = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])), [classesQuery.data]);

  const sessions = useMemo(
    () => [...(sessionsQuery.data ?? [])].sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)) || (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [sessionsQuery.data],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ['diary', 'sessions', structureId] });
  const publishMut = useMutation({ mutationFn: (id: number) => api.publishSession(id), onSuccess: invalidate });
  const unpublishMut = useMutation({ mutationFn: (id: number) => api.unpublishSession(id), onSuccess: invalidate });

  if (ctx.ready && !structureId) {
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

      {/* Création : formulaire complet (droit de gestion des séances) */}
      {canManage && (
        <p>
          <Link to="/seance/nouvelle" className="btn btn-primary">{t('diary.session.new', { defaultValue: 'Nouvelle séance' })}</Link>
        </p>
      )}

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
                  <td>{s.exceptional_label || subjectById.get(s.subject_id) || s.subject_id}</td>
                  <td>{classById.get(s.audience_id) ?? s.audience_id}</td>
                  <td>
                    <Link to={`/seance/${s.id}`}>{s.title || t('diary.session', { defaultValue: 'Séance' })}</Link>
                  </td>
                  <td>{stripHtml(s.description)}</td>
                  <td className="text-center">
                    {!canPublish ? (
                      s.is_published ? t('diary.published', { defaultValue: 'Publiée' }) : t('diary.unpublished', { defaultValue: 'Non publiée' })
                    ) : s.is_published ? (
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
