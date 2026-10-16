import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { isStudentOrRelative } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { dayLabels } from '../locale';
import { addDays, formatDate, mondayOf, sortKey, stripHtml, weekLabel, ymd } from '../utils';

/** Écran devoirs : vue calendrier/liste des devoirs + création + gestion des types. */
export function Homeworks() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const canManage = ctx.has('manageHomework');
  const canPublish = ctx.has('publishHomework');
  const canManageTypes = ctx.has('settingTypesManage');
  const pupilView = isStudentOrRelative(ctx.profile);

  const [view, setView] = useState<'calendar' | 'list'>(() => (pupilView ? 'list' : 'calendar'));
  const [monday, setMonday] = useState(() => mondayOf(new Date()));

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

  const subjects = subjectsQuery.data ?? [];
  const classes = classesQuery.data ?? [];
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
  const deleteMut = useMutation({ mutationFn: (id: number) => api.deleteHomework(id), onSuccess: invalidate });

  // Gestion des types de devoir (incrément 2)
  const [newType, setNewType] = useState('');
  const invalidateTypes = () => qc.invalidateQueries({ queryKey: ['diary', 'types', structureId] });
  const createTypeMut = useMutation({
    mutationFn: () => api.createHomeworkType(structureId, newType.trim()),
    onSuccess: () => { setNewType(''); invalidateTypes(); },
  });
  const deleteTypeMut = useMutation({ mutationFn: (id: number) => api.deleteHomeworkType(id, structureId), onSuccess: invalidateTypes });

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
    return (
      <div>
        <h1>{t('diary.title', { defaultValue: 'Cahier de textes' })}</h1>
        <div className="alert alert-info" role="alert">
          {t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">{t('diary.title', { defaultValue: 'Cahier de textes' })}</h1>

      {/* Création : page complète (droit de gestion des devoirs) */}
      {canManage && (
        <p>
          <Link to="/devoir/nouveau" className="btn btn-primary">{t('diary.homework.new', { defaultValue: 'Nouveau devoir' })}</Link>
        </p>
      )}

      {/* Gestion des types de devoir (droit de paramétrage, comme le sniplet AngularJS) */}
      {canManageTypes && <section className="card p-16 mb-16" style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 18 }} className="mb-12">
          {t('diary.types', { defaultValue: 'Types de devoir' })}{' '}
          <span className="text-muted" style={{ fontSize: 14 }}>({types.length})</span>
        </h2>
        <form
          className="d-flex gap-8 align-items-end mb-8"
          onSubmit={(e) => { e.preventDefault(); if (newType.trim()) createTypeMut.mutate(); }}
        >
          <div className="flex-grow-1">
            <label htmlFor="hw-newtype" className="form-label">{t('diary.type.new', { defaultValue: 'Nouveau type' })}</label>
            <input id="hw-newtype" className="form-control" value={newType} onChange={(e) => setNewType(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={createTypeMut.isPending || !newType.trim()}>
            {t('diary.type.add', { defaultValue: 'Ajouter le type' })}
          </button>
        </form>
        {types.length > 0 && (
          <ul className="list-unstyled mb-0">
            {types.map((ty) => (
              <li key={ty.id} className="d-flex justify-content-between align-items-center py-4 border-bottom">
                <span>{ty.label}</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-danger"
                  onClick={() => { if (window.confirm(t('diary.type.delete.confirm', { defaultValue: 'Supprimer ce type ?' }))) deleteTypeMut.mutate(ty.id); }}
                >
                  {t('diary.delete', { defaultValue: 'Supprimer' })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {/* Barre d'affichage : calendrier / liste + navigation semaine */}
      <div className="d-flex gap-16 flex-wrap align-items-center justify-content-between mb-12">
        <div className="btn-group" role="group" aria-label={t('diary.view', { defaultValue: 'Mode d\'affichage' })}>
          <button type="button" className={`btn btn-${view === 'calendar' ? 'primary' : 'secondary'}`} onClick={() => setView('calendar')}>
            {t('diary.view.calendar', { defaultValue: 'Calendaire' })}
          </button>
          <button type="button" className={`btn btn-${view === 'list' ? 'primary' : 'secondary'}`} onClick={() => setView('list')}>
            {t('diary.view.list', { defaultValue: 'Liste' })}
          </button>
        </div>
        {view === 'calendar' && (
          <div className="d-flex gap-8 align-items-center">
            <button type="button" className="btn btn-secondary" onClick={() => setMonday((m) => addDays(m, -7))}>{t('diary.week.prev', { defaultValue: '← Semaine précédente' })}</button>
            <span className="text-muted" style={{ minWidth: 150, textAlign: 'center' }}>{weekLabel(monday)}</span>
            <button type="button" className="btn btn-secondary" onClick={() => setMonday((m) => addDays(m, 7))}>{t('diary.week.next', { defaultValue: 'Semaine suivante →' })}</button>
          </div>
        )}
      </div>

      {homeworksQuery.isLoading && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}

      {/* Vue CALENDRIER : « Travail à faire » (devoirs par jour) + créneaux horaires */}
      {view === 'calendar' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ tableLayout: 'fixed', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }} />
                {weekDays.map((d) => <th key={d.key} className="text-center">{d.label}<br /><span className="text-muted" style={{ fontSize: 12 }}>{formatDate(d.key)}</span></th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-muted" style={{ fontWeight: 400 }}>{t('diary.todo', { defaultValue: 'Travail à faire' })}</th>
                {weekDays.map((d) => (
                  <td key={d.key} style={{ verticalAlign: 'top', background: '#fff7ec' }}>
                    {(byDay.get(d.key) ?? []).map((h) => (
                      <div key={h.id} title={stripHtml(h.description)} style={{ background: '#f6a623', color: '#fff', borderRadius: 3, padding: '3px 6px', marginBottom: 4, fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{h.exceptional_label || subjectName.get(h.subject_id) || h.subject_id}</div>
                        <div>{className.get(h.audience_id) ?? ''}</div>
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
              {slots.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="text-muted" style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>{s.name}</th>
                  {weekDays.map((d) => (
                    <td key={d.key} style={{ verticalAlign: 'top' }}>
                      {(sessionsByCell.get(`${s.id}|${d.key}`) ?? []).map((se) => (
                        <div key={se.id} title={stripHtml(se.description ?? '')} style={{ background: se.color || '#4bafd5', color: '#fff', borderRadius: 3, padding: '3px 6px', marginBottom: 4, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{se.title || subjectName.get(se.subject_id) || ''}</div>
                          <div>{className.get(se.audience_id) ?? ''}</div>
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
          {!homeworksQuery.isLoading && homeworks.length === 0 && (
            <p className="text-muted">{t('diary.homeworks.empty', { defaultValue: 'Aucun devoir sur la période.' })}</p>
          )}
          {homeworks.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('diary.due', { defaultValue: 'À rendre le' })}</th>
                  <th>{t('diary.subject', { defaultValue: 'Matière' })}</th>
                  <th>{t('diary.class', { defaultValue: 'Classe' })}</th>
                  <th>{t('diary.type', { defaultValue: 'Type' })}</th>
                  <th>{t('diary.description', { defaultValue: 'Description' })}</th>
                  {ctx.has('setProgressHomework') && ctx.profile === 'student' && <th>{t('diary.homework.done', { defaultValue: 'Fait' })}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {homeworks.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.due_date)}</td>
                    <td>{h.exceptional_label || subjectName.get(h.subject_id) || h.subject_id}</td>
                    <td>{className.get(h.audience_id) ?? h.audience_id}</td>
                    <td>{h.type_id ? typeLabel.get(h.type_id) ?? '' : ''}</td>
                    <td>
                      <Link to={`/devoir/${h.id}`}>{stripHtml(h.description) || t('diary.homework', { defaultValue: 'Devoir' })}</Link>
                    </td>
                    {ctx.has('setProgressHomework') && ctx.profile === 'student' && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${t('diary.homework.done', { defaultValue: 'Fait' })} : ${stripHtml(h.description)}`}
                          checked={doneLocal[h.id] ?? h.progress?.state_label === 'done'}
                          onChange={(e) => progressMut.mutate({ id: h.id, done: e.target.checked })}
                        />
                      </td>
                    )}
                    <td className="text-end">
                      {canManage && <button
                        type="button"
                        className="btn btn-link p-0 text-danger"
                        onClick={() => {
                          if (window.confirm(t('diary.homework.confirm.delete', { defaultValue: 'Supprimer ce devoir ?' }))) deleteMut.mutate(h.id);
                        }}
                      >
                        {t('diary.delete', { defaultValue: 'Supprimer' })}
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default Homeworks;
