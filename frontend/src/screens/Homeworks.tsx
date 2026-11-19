import { Alert, Badge, Button, Checkbox, IconButton, Loading, Modal, SegmentedControl, Table, Tooltip } from '@open-ent/react';
import { IconDelete, IconPlus, IconSettings } from '@open-ent/react/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { Empty } from '../components/Empty';
import { PeriodNav } from '../components/PeriodNav';
import { canWrite, isStudentOrRelative } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { dayLabels } from '../locale';
import { addDays, formatDate, mondayOf, sortKey, stripHtml, weekLabel, ymd } from '../utils';
import { LoadError } from '../components/LoadError';

/** Couleurs de la grille, en parité avec l'IHM AngularJS (public/ts/model). */
const COLOR = { homework: '#f6a623', session: '#4bafd5' } as const;

/** Écran devoirs : vue calendrier/liste des devoirs + création + gestion des types. */
export function Homeworks() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const structureId = ctx.structure?.id ?? '';
  const pupilView = isStudentOrRelative(ctx.profile);
  // Écrire est réservé à l'enseignant et au personnel (cf. canWrite) : sur certains
  // établissements le profil Élève porte quand même ces droits de workflow.
  const canManage = canWrite(ctx.has, ctx.profile, 'manageHomework');
  const canManageTypes = canWrite(ctx.has, ctx.profile, 'settingTypesManage');

  const [view, setView] = useState<'calendar' | 'list'>(() => (pupilView ? 'list' : 'calendar'));
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [typesOpen, setTypesOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'homework' | 'type'; id: number; label: string } | null>(null);

  // Période : l'année scolaire de l'établissement (à défaut, l'année scolaire calendaire en cours),
  // au lieu d'une fenêtre fixe J-30 / J+180 qui laissait la navigation par semaine sans données.
  const schoolYearQuery = useQuery({ queryKey: ['diary', 'schoolyear', structureId], queryFn: () => api.getSchoolYear(structureId), enabled: !!structureId });
  const fallbackYear = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const start = schoolYearQuery.data?.start ?? `${fallbackYear}-08-01`;
  const end = schoolYearQuery.data?.end ?? `${fallbackYear + 1}-07-31`;

  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId, pupilView), enabled: !!structureId });
  const slotsQuery = useQuery({ queryKey: ['diary', 'timeslots', structureId], queryFn: () => api.getTimeSlots(structureId), enabled: !!structureId });
  const typesQuery = useQuery({ queryKey: ['diary', 'types', structureId], queryFn: () => api.getHomeworkTypes(structureId), enabled: !!structureId });
  const homeworksKey = ['diary', 'homeworks', structureId, start, end];
  const homeworksQuery = useQuery({ queryKey: homeworksKey, queryFn: () => (ctx.profile === 'personnel' ? api.getExternalHomeworks(start, end, ctx.userId) : api.getOwnHomeworks(start, end, structureId)), enabled: !!structureId && !schoolYearQuery.isLoading });
  // Séances de la semaine affichée (la grille suit `monday`, pas la fenêtre des devoirs).
  const weekStart = ymd(monday);
  const weekEnd = ymd(addDays(monday, 6));
  const sessionsQuery = useQuery({ queryKey: ['diary', 'sessions', structureId, weekStart, weekEnd], queryFn: () => (ctx.profile === 'personnel' ? api.getExternalSessions(weekStart, weekEnd, ctx.userId) : api.getOwnSessions(weekStart, weekEnd, structureId)), enabled: !!structureId });
  const invalidate = () => qc.invalidateQueries({ queryKey: homeworksKey });

  const subjectName = useMemo(() => new Map((subjectsQuery.data ?? []).filter((s) => !s.exceptional).map((s) => [s.id, s.name])), [subjectsQuery.data]);
  const className = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])), [classesQuery.data]);
  const typeLabel = useMemo(() => new Map((typesQuery.data ?? []).map((t2) => [t2.id, t2.label])), [typesQuery.data]);

  const types = typesQuery.data ?? [];

  // Élève : marque un devoir « fait » ou « à faire » depuis la liste. La case change tout de suite
  // (valeur locale), puis la liste est relue ; en cas d'échec on revient à l'état du serveur.
  const [doneLocal, setDoneLocal] = useState<Record<number, boolean>>({});
  const progressMut = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => api.setHomeworkProgress(id, done ? 'done' : 'todo'),
    onMutate: ({ id, done }) => setDoneLocal((m) => ({ ...m, [id]: done })),
    onError: (_e, { id }) => setDoneLocal((m) => { const n = { ...m }; delete n[id]; return n; }),
    onSettled: () => invalidate(),
  });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.deleteHomework(id), onSuccess: () => { setConfirm(null); invalidate(); } });

  // Gestion des types de devoir (incrément 2)
  const [newType, setNewType] = useState('');
  const invalidateTypes = () => qc.invalidateQueries({ queryKey: ['diary', 'types', structureId] });
  const createTypeMut = useMutation({
    mutationFn: () => api.createHomeworkType(structureId, newType.trim()),
    onSuccess: () => { setNewType(''); invalidateTypes(); },
  });
  const deleteTypeMut = useMutation({ mutationFn: (id: number) => api.deleteHomeworkType(id, structureId), onSuccess: () => { setConfirm(null); invalidateTypes(); } });

  // Élève et parent : devoirs non publiés masqués (calendar-view.ts:232-244).
  const homeworks = [...(homeworksQuery.data ?? [])].filter((h) => !pupilView || h.is_published).sort((a, b) => sortKey(a.due_date).localeCompare(sortKey(b.due_date)));

  // Jours ouvrés de la semaine affichée + devoirs indexés par jour (due_date).
  // Libellés lus au rendu et non figés à l'import : la locale n'est posée qu'une fois la
  // session chargée (cf. locale.ts).
  const weekDays = dayLabels().slice(0, 5).map((label, i) => ({ label, date: addDays(monday, i), key: ymd(addDays(monday, i)) }));
  const byDay = useMemo(() => {
    const m = new Map<string, typeof homeworks>();
    for (const h of homeworks) {
      const k = (h.due_date || '').slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h);
    }
    return m;
  }, [homeworks]);
  const slots = slotsQuery.data ?? [];

  // Séances indexées par (créneau, jour) : une séance est rangée dans le créneau dont
  // l'intervalle horaire contient son heure de début (parité Angular : séances dans la grille).
  const sessions = sessionsQuery.data ?? [];
  const sessionsByCell = useMemo(() => {
    const toMin = (s?: string) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
      return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    };
    const m = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const day = (s.date || '').slice(0, 10);
      const startMin = toMin(s.start_time);
      const slot = slots.find((sl) => toMin(sl.startHour) <= startMin && startMin < toMin(sl.endHour));
      if (!slot) continue;
      const k = `${slot.id}|${day}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [sessions, slots]);

  if (ctx.ready && !structureId) {
    return <Alert type="info">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</Alert>;
  }

  const chip = (color: string, title: string, subtitle: string, hint: string) => (
    <div className="diary-chip small px-4 py-2 mb-2" style={{ '--diary-color': color } as CSSProperties} title={hint}>
      <div className="fw-bold text-truncate">{title}</div>
      <div className="text-truncate">{subtitle}</div>
    </div>
  );

  return (
    <div>
      {/* Ce qu'on regarde à gauche, ce qu'on peut faire à droite. */}
      <div className="d-flex gap-16 flex-wrap align-items-center justify-content-between mb-16">
        <SegmentedControl
          aria-label={t('diary.view', { defaultValue: "Mode d'affichage" })}
          value={view}
          onChange={(value) => setView(value as 'calendar' | 'list')}
          options={[
            { value: 'calendar', label: t('diary.view.calendar', { defaultValue: 'Calendaire' }) },
            { value: 'list', label: t('diary.view.list', { defaultValue: 'Liste' }) },
          ]}
        />
        <div className="d-flex gap-8 align-items-center">
          {/* Le paramétrage des types quitte le plan de travail : il s'ouvre à la demande. */}
          {canManageTypes && (
            <Tooltip message={t('diary.types', { defaultValue: 'Types de devoir' })} placement="top">
              <IconButton
                type="button"
                color="tertiary"
                variant="ghost"
                icon={<IconSettings />}
                aria-label={t('diary.types', { defaultValue: 'Types de devoir' })}
                onClick={() => setTypesOpen(true)}
              />
            </Tooltip>
          )}
          {canManage && (
            <Button type="button" color="primary" variant="filled" leftIcon={<IconPlus />} onClick={() => navigate('/devoir/nouveau')}>
              {t('diary.homework.new', { defaultValue: 'Nouveau devoir' })}
            </Button>
          )}
        </div>
      </div>

      {view === 'calendar' && (
        <div className="d-flex justify-content-center mb-16">
          <PeriodNav
            label={weekLabel(monday)}
            prevLabel={t('diary.week.prev', { defaultValue: 'Semaine précédente' })}
            nextLabel={t('diary.week.next', { defaultValue: 'Semaine suivante' })}
            onShift={(direction) => setMonday((m) => addDays(m, 7 * direction))}
            onToday={() => setMonday(mondayOf(new Date()))}
          />
        </div>
      )}

      {homeworksQuery.isLoading && <Loading isLoading />}
      <LoadError failed={homeworksQuery.isError} />

      {/* Vue CALENDRIER : « Travail à faire » (devoirs par jour) + créneaux horaires */}
      {view === 'calendar' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ tableLayout: 'fixed', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ width: '9rem' }} />
                {weekDays.map((d) => <th key={d.key} className="text-center">{d.label}<br /><span className="small text-gray-700">{formatDate(d.key)}</span></th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="small text-gray-700 fw-normal">{t('diary.todo', { defaultValue: 'Travail à faire' })}</th>
                {weekDays.map((d) => (
                  <td key={d.key} className="align-top">
                    {(byDay.get(d.key) ?? []).map((h) => (
                      <div key={h.id}>
                        {chip(
                          COLOR.homework,
                          h.exceptional_label || subjectName.get(h.subject_id) || h.subject_id,
                          className.get(h.audience_id) ?? '',
                          stripHtml(h.description),
                        )}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
              {slots.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="small text-gray-700 fw-normal text-nowrap">{s.name}</th>
                  {weekDays.map((d) => (
                    <td key={d.key} className="align-top">
                      {(sessionsByCell.get(`${s.id}|${d.key}`) ?? []).map((se) => (
                        <div key={se.id}>
                          {chip(
                            se.color || COLOR.session,
                            se.title || subjectName.get(se.subject_id) || '',
                            className.get(se.audience_id) ?? '',
                            stripHtml(se.description ?? ''),
                          )}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vue LISTE */}
      {view === 'list' && (
        <>
          {!homeworksQuery.isLoading && !homeworksQuery.isError && homeworks.length === 0 && (
            <Empty
              title={t('diary.homeworks.empty', { defaultValue: 'Aucun devoir sur la période.' })}
              text={canManage ? t('diary.homeworks.empty.hint', { defaultValue: 'Créez un devoir pour qu’il apparaisse ici et dans le cahier de textes des élèves.' }) : undefined}
            />
          )}
          {homeworks.length > 0 && (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('diary.due', { defaultValue: 'À rendre le' })}</Table.Th>
                  <Table.Th>{t('diary.subject', { defaultValue: 'Matière' })}</Table.Th>
                  <Table.Th>{t('diary.class', { defaultValue: 'Classe' })}</Table.Th>
                  <Table.Th>{t('diary.type', { defaultValue: 'Type' })}</Table.Th>
                  <Table.Th>{t('diary.description', { defaultValue: 'Description' })}</Table.Th>
                  {ctx.has('setProgressHomework') && ctx.profile === 'student' && <Table.Th>{t('diary.homework.done', { defaultValue: 'Fait' })}</Table.Th>}
                  {canManage && <Table.Th className="text-end">{t('diary.actions', { defaultValue: 'Actions' })}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {homeworks.map((h) => (
                  <Table.Tr key={h.id}>
                    <Table.Td className="text-nowrap">{formatDate(h.due_date)}</Table.Td>
                    <Table.Td>{h.exceptional_label || subjectName.get(h.subject_id) || h.subject_id}</Table.Td>
                    <Table.Td>{className.get(h.audience_id) ?? h.audience_id}</Table.Td>
                    <Table.Td>{h.type_id ? typeLabel.get(h.type_id) ?? '' : ''}</Table.Td>
                    <Table.Td>
                      <Link to={`/devoir/${h.id}`}>{stripHtml(h.description) || t('diary.homework', { defaultValue: 'Devoir' })}</Link>
                    </Table.Td>
                    {ctx.has('setProgressHomework') && ctx.profile === 'student' && (
                      <Table.Td>
                        <Checkbox
                          aria-label={`${t('diary.homework.done', { defaultValue: 'Fait' })} : ${stripHtml(h.description)}`}
                          checked={doneLocal[h.id] ?? h.progress?.state_label === 'done'}
                          onChange={(e) => progressMut.mutate({ id: h.id, done: e.target.checked })}
                        />
                      </Table.Td>
                    )}
                    {canManage && (
                      <Table.Td className="text-end">
                        <Tooltip message={t('diary.delete', { defaultValue: 'Supprimer' })} placement="left">
                          <IconButton
                            type="button"
                            color="danger"
                            variant="ghost"
                            size="sm"
                            icon={<IconDelete />}
                            aria-label={`${t('diary.delete', { defaultValue: 'Supprimer' })} : ${stripHtml(h.description)}`}
                            onClick={() => setConfirm({ kind: 'homework', id: h.id, label: stripHtml(h.description) })}
                          />
                        </Tooltip>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}

      {/* Paramétrage des types de devoir (droit de paramétrage, comme le sniplet AngularJS) */}
      {typesOpen && (
        <Modal id="diary-types" isOpen onModalClose={() => setTypesOpen(false)} size="md">
          <Modal.Header onModalClose={() => setTypesOpen(false)}>
            {t('diary.types', { defaultValue: 'Types de devoir' })}
          </Modal.Header>
          <Modal.Body>
            <form
              className="d-flex gap-8 align-items-end mb-16"
              onSubmit={(e) => { e.preventDefault(); if (newType.trim()) createTypeMut.mutate(); }}
            >
              <div className="flex-grow-1">
                <label htmlFor="hw-newtype" className="form-label">{t('diary.type.new', { defaultValue: 'Nouveau type' })}</label>
                <input id="hw-newtype" className="form-control" value={newType} onChange={(e) => setNewType(e.target.value)} />
              </div>
              <Button type="submit" color="primary" variant="filled" isLoading={createTypeMut.isPending} disabled={!newType.trim()}>
                {t('diary.type.add', { defaultValue: 'Ajouter le type' })}
              </Button>
            </form>
            {types.length === 0 ? (
              <p className="text-gray-700 m-0">{t('diary.types.empty', { defaultValue: 'Aucun type de devoir pour le moment.' })}</p>
            ) : (
              <ul className="list-unstyled m-0">
                {types.map((ty) => (
                  <li key={ty.id} className="d-flex justify-content-between align-items-center py-8 border-bottom">
                    <span>{ty.label}</span>
                    <Tooltip message={t('diary.delete', { defaultValue: 'Supprimer' })} placement="left">
                      <IconButton
                        type="button"
                        color="danger"
                        variant="ghost"
                        size="sm"
                        icon={<IconDelete />}
                        aria-label={`${t('diary.delete', { defaultValue: 'Supprimer' })} : ${ty.label}`}
                        onClick={() => setConfirm({ kind: 'type', id: ty.id, label: ty.label })}
                      />
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" color="tertiary" variant="ghost" onClick={() => setTypesOpen(false)}>
              {t('diary.close', { defaultValue: 'Fermer' })}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'type'
            ? t('diary.type.delete', { defaultValue: 'Supprimer le type' })
            : t('diary.homework.delete', { defaultValue: 'Supprimer le devoir' })}
          text={confirm.kind === 'type'
            ? t('diary.type.delete.confirm', { defaultValue: 'Supprimer ce type ?' })
            : t('diary.homework.confirm.delete', { defaultValue: 'Supprimer ce devoir ?' })}
          isLoading={deleteMut.isPending || deleteTypeMut.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => (confirm.kind === 'type' ? deleteTypeMut.mutate(confirm.id) : deleteMut.mutate(confirm.id))}
        />
      )}
    </div>
  );
}

export default Homeworks;
