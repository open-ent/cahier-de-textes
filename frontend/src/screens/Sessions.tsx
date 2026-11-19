import { Alert, Badge, Button, Loading, Table } from '@open-ent/react';
import { IconPlus } from '@open-ent/react/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api';
import { Empty } from '../components/Empty';
import { canWrite, isStudentOrRelative } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { formatDate, hhmm, sortKey, stripHtml } from '../utils';
import { LoadError } from '../components/LoadError';

/**
 * Séances (leçons) du cahier de textes (parité IHM AngularJS) : liste des séances de l'enseignant
 * sur l'année, création d'une séance (matière/classe/date/horaire/description) et
 * publication/dépublication (visibilité élèves). Matière & classe résolues en clair.
 */
export function Sessions() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const structureId = ctx.structure?.id ?? '';
  const canManage = canWrite(ctx.has, ctx.profile, 'manageSession');
  const canPublish = canWrite(ctx.has, ctx.profile, 'publishSession');

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
    return <Alert type="info">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</Alert>;
  }

  return (
    <div>
      <div className="d-flex gap-16 flex-wrap align-items-center justify-content-between mb-16">
        <p className="m-0 text-gray-700">
          {t('diary.sessions.count', { defaultValue: '[[count]] séance(s) sur l’année scolaire', count: sessions.length })}
        </p>
        {canManage && (
          <Button type="button" color="primary" variant="filled" leftIcon={<IconPlus />} onClick={() => navigate('/seance/nouvelle')}>
            {t('diary.session.new', { defaultValue: 'Nouvelle séance' })}
          </Button>
        )}
      </div>

      {sessionsQuery.isLoading && <Loading isLoading />}
      <LoadError failed={sessionsQuery.isError} />
      {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
        <Empty
          illustration="folder"
          title={t('diary.sessions.empty', { defaultValue: 'Aucune séance.' })}
          text={canManage ? t('diary.sessions.empty.hint', { defaultValue: 'Créez une séance, ou renseignez un cours depuis le calendrier.' }) : undefined}
        />
      )}
      {sessions.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('diary.date', { defaultValue: 'Date' })}</Table.Th>
              <Table.Th>{t('diary.slot', { defaultValue: 'Créneau' })}</Table.Th>
              <Table.Th>{t('diary.subject', { defaultValue: 'Matière' })}</Table.Th>
              <Table.Th>{t('diary.class', { defaultValue: 'Classe' })}</Table.Th>
              <Table.Th>{t('diary.session.label', { defaultValue: 'Titre' })}</Table.Th>
              <Table.Th>{t('diary.content', { defaultValue: 'Contenu' })}</Table.Th>
              <Table.Th className="text-center">{t('diary.status', { defaultValue: 'Statut' })}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td className="text-nowrap">{formatDate(s.date)}</Table.Td>
                <Table.Td className="text-nowrap">{hhmm(s.start_time)}{s.end_time ? ` – ${hhmm(s.end_time)}` : ''}</Table.Td>
                <Table.Td>{s.exceptional_label || subjectById.get(s.subject_id) || s.subject_id}</Table.Td>
                <Table.Td>{classById.get(s.audience_id) ?? s.audience_id}</Table.Td>
                <Table.Td>
                  <Link to={`/seance/${s.id}`}>{s.title || t('diary.session', { defaultValue: 'Séance' })}</Link>
                </Table.Td>
                <Table.Td>{stripHtml(s.description)}</Table.Td>
                <Table.Td className="text-center">
                  {/* L'état se lit d'un coup d'œil ; le bouton n'apparaît que si on peut le changer. */}
                  {!canPublish ? (
                    <Badge variant={{ type: 'content', level: s.is_published ? 'success' : 'warning', background: true }}>
                      {s.is_published ? t('diary.published', { defaultValue: 'Publiée' }) : t('diary.unpublished', { defaultValue: 'Non publiée' })}
                    </Badge>
                  ) : s.is_published ? (
                    <div className="d-flex align-items-center justify-content-center gap-8">
                      <Badge variant={{ type: 'content', level: 'success', background: true }}>
                        {t('diary.published', { defaultValue: 'Publiée' })}
                      </Badge>
                      <Button type="button" color="tertiary" variant="ghost" size="sm" isLoading={unpublishMut.isPending} onClick={() => unpublishMut.mutate(s.id)}>
                        {t('diary.unpublish', { defaultValue: 'Dépublier' })}
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" color="secondary" variant="outline" size="sm" isLoading={publishMut.isPending} onClick={() => publishMut.mutate(s.id)}>
                      {t('diary.publish', { defaultValue: 'Publier' })}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </div>
  );
}

export default Sessions;
