import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { addDays, formatDate, mondayOf, sortKey, stripHtml, weekLabel, ymd } from '../utils';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

/** Écran devoirs : vue calendrier/liste des devoirs + création + gestion des types. */
export function Homeworks() {
  const { t } = useTranslation(['diary', 'common']);
  const { user, init } = useEdificeClient();
  const qc = useQueryClient();
  const structureId = user?.structures?.[0] ?? '';

  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [monday, setMonday] = useState(() => mondayOf(new Date()));

  // Fenêtre large autour d'aujourd'hui pour lister les devoirs.
  const start = ymd(addDays(new Date(), -30));
  const end = ymd(addDays(new Date(), 180));

  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });
  const slotsQuery = useQuery({ queryKey: ['diary', 'timeslots', structureId], queryFn: () => api.getTimeSlots(structureId), enabled: !!structureId });
  const typesQuery = useQuery({ queryKey: ['diary', 'types', structureId], queryFn: () => api.getHomeworkTypes(structureId), enabled: !!structureId });
  const homeworksKey = ['diary', 'homeworks', structureId, start, end];
  const homeworksQuery = useQuery({ queryKey: homeworksKey, queryFn: () => api.getOwnHomeworks(start, end, structureId), enabled: !!structureId });
  const invalidate = () => qc.invalidateQueries({ queryKey: homeworksKey });

  const subjectName = useMemo(() => new Map((subjectsQuery.data ?? []).map((s) => [s.id, s.name])), [subjectsQuery.data]);
  const className = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])), [classesQuery.data]);
  const typeLabel = useMemo(() => new Map((typesQuery.data ?? []).map((t2) => [t2.id, t2.label])), [typesQuery.data]);

  const subjects = subjectsQuery.data ?? [];
  const classes = classesQuery.data ?? [];
  const types = typesQuery.data ?? [];

  const [subjectId, setSubjectId] = useState('');
  const [audienceId, setAudienceId] = useState('');
  const [typeId, setTypeId] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedTime, setEstimatedTime] = useState(30);
  const [formError, setFormError] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      api.createHomework({
        subject_id: subjectId,
        structure_id: structureId,
        audience_id: audienceId,
        type_id: Number(typeId),
        due_date: dueDate,
        description: description.trim(),
        color: '#4bafd5',
        estimatedTime,
        is_published: true,
        session_id: null,
      }),
    onSuccess: () => {
      setDescription('');
      setDueDate('');
      setFormError('');
      invalidate();
    },
    onError: () => setFormError(t('diary.homework.error', { defaultValue: "L'enregistrement a échoué." })),
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!subjectId || !audienceId || !typeId || !dueDate || !description.trim()) {
      setFormError(t('diary.homework.incomplete', { defaultValue: 'Renseignez la matière, la classe, le type, la date et la description.' }));
      return;
    }
    setFormError('');
    createMut.mutate();
  };

  const homeworks = [...(homeworksQuery.data ?? [])].sort((a, b) => sortKey(a.due_date).localeCompare(sortKey(b.due_date)));

  // Jours ouvrés de la semaine affichée + devoirs indexés par jour (due_date).
  const weekDays = JOURS.map((label, i) => ({ label, date: addDays(monday, i), key: ymd(addDays(monday, i)) }));
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

  if (init && !structureId) {
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

      {/* Formulaire de création de devoir */}
      <form className="card p-16 mb-16" onSubmit={onSubmit}>
        <h2 style={{ fontSize: 18 }} className="mb-12">{t('diary.homework.new', { defaultValue: 'Nouveau devoir' })}</h2>
        <div className="d-flex gap-16 flex-wrap mb-8">
          <div>
            <label htmlFor="hw-subject" className="form-label">{t('diary.subject', { defaultValue: 'Matière' })}</label>
            <select id="hw-subject" className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">—</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hw-class" className="form-label">{t('diary.class', { defaultValue: 'Classe' })}</label>
            <select id="hw-class" className="form-select" value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
              <option value="">—</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hw-type" className="form-label">{t('diary.type', { defaultValue: 'Type' })}</label>
            <select id="hw-type" className="form-select" value={typeId} onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hw-due" className="form-label">{t('diary.due', { defaultValue: 'À rendre le' })}</label>
            <input id="hw-due" type="date" className="form-control" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div style={{ maxWidth: 130 }}>
            <label htmlFor="hw-time" className="form-label">{t('diary.esttime', { defaultValue: 'Durée (min)' })}</label>
            <input id="hw-time" type="number" min={0} className="form-control" value={estimatedTime} onChange={(e) => setEstimatedTime(Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>
        <div className="mb-8">
          <label htmlFor="hw-desc" className="form-label">{t('diary.description', { defaultValue: 'Description' })}</label>
          <textarea id="hw-desc" className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {formError && <div className="alert alert-warning" role="alert">{formError}</div>}
        <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>{t('diary.homework.add', { defaultValue: 'Ajouter le devoir' })}</button>
      </form>

      {/* Gestion des types de devoir */}
      <section className="card p-16 mb-16" style={{ maxWidth: 520 }}>
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
      </section>

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
                        <div style={{ fontWeight: 600 }}>{subjectName.get(h.subject_id) ?? h.subject_id}</div>
                        <div>{className.get(h.audience_id) ?? ''}</div>
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
              {slots.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="text-muted" style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>{s.name}</th>
                  {weekDays.map((d) => <td key={d.key} />)}
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {homeworks.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.due_date)}</td>
                    <td>{subjectName.get(h.subject_id) ?? h.subject_id}</td>
                    <td>{className.get(h.audience_id) ?? h.audience_id}</td>
                    <td>{h.type_id ? typeLabel.get(h.type_id) ?? '' : ''}</td>
                    <td>{stripHtml(h.description)}</td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-link p-0 text-danger"
                        onClick={() => {
                          if (window.confirm(t('diary.homework.confirm.delete', { defaultValue: 'Supprimer ce devoir ?' }))) deleteMut.mutate(h.id);
                        }}
                      >
                        {t('diary.delete', { defaultValue: 'Supprimer' })}
                      </button>
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
