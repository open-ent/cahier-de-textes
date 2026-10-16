import { Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '../api';
import { buildItems, CalendarHomework, CalendarItem, COLORS, dailyHomeworks, hourRange } from '../calendarItems';
import { useCalendarOptions } from '../hooks/useCalendarOptions';
import { SearchBar } from '../components/SearchBar';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { useReadScope } from '../hooks/useReadScope';
import { dateLocale } from '../locale';
import { daysPerWeek, initialAnchor, periodOf, step, ViewMode, VIEW_MODES, visibleDays } from '../period';
import { scopeKey } from '../searchScope';
import { stripHtml, ymd } from '../utils';

const HOUR_PX = 48;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Colonnes côte à côte pour les éléments simultanés d'un jour. Ex. deux séances à 8 h → 2 voies. */
function lanes(items: CalendarItem[]): Map<string, { lane: number; count: number }> {
  const out = new Map<string, { lane: number; count: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: CalendarItem[] = [];
  let groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    const assigned = group.map((it) => {
      let lane = ends.findIndex((e) => e <= it.start);
      if (lane === -1) lane = ends.push(it.end) - 1;
      else ends[lane] = it.end;
      return [it.key, lane] as const;
    });
    for (const [k, lane] of assigned) out.set(k, { lane, count: ends.length });
    group = [];
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

/**
 * Calendrier du cahier de textes, comme l'AngularJS (main.html, main/calendar-view.html) : vues
 * jour, semaine, quinzaine et mois, samedi et dimanche au choix (préférence partagée), séances et
 * cours de l'emploi du temps à renseigner, bandeau « Travail à faire », légende des couleurs,
 * détail au clic et publication rapide. Ex. lundi 8 h « Mathématiques » gris clair = à renseigner.
 */
export function Calendar() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const rs = useReadScope();
  const { options, set: setOptions, ready: optionsReady } = useCalendarOptions();
  const dialogId = useId();
  const navigate = useNavigate();

  const [mode, setMode] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(() => initialAnchor(new Date()));
  const period = useMemo(() => periodOf(mode, anchor), [mode, anchor]);
  const days = useMemo(() => visibleDays(period.days, mode, options), [period, mode, options]);
  const start = ymd(period.first);
  const end = ymd(period.last);

  const sessionsQuery = useQuery({
    queryKey: ['diary', 'calendar', 'sessions', structureId, start, end, scopeKey(rs.scope)],
    queryFn: () => api.readSessions(rs.scope, start, end, structureId),
    enabled: !!structureId,
  });
  const homeworksQuery = useQuery({
    queryKey: ['diary', 'calendar', 'homeworks', structureId, start, end, scopeKey(rs.scope)],
    queryFn: () => api.readHomeworks(rs.scope, start, end, structureId),
    enabled: !!structureId,
  });
  const coursesQuery = useQuery({
    queryKey: ['diary', 'calendar', 'courses', structureId, start, end, JSON.stringify(rs.courses)],
    queryFn: () => api.getCourses(structureId, start, end, rs.courses),
    enabled: !!structureId && !!ctx.userId,
  });
  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });
  const slotsQuery = useQuery({ queryKey: ['diary', 'timeslots', structureId], queryFn: () => api.getTimeSlots(structureId), enabled: !!structureId });

  const subjectName = useMemo(() => new Map((subjectsQuery.data ?? []).filter((s) => !s.exceptional).map((s) => [s.id, s.name])), [subjectsQuery.data]);
  const className = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])), [classesQuery.data]);
  const homeworks = (homeworksQuery.data ?? []) as CalendarHomework[];
  const items = useMemo(
    () => buildItems(sessionsQuery.data ?? [], coursesQuery.data ?? [], homeworks, false),
    [sessionsQuery.data, coursesQuery.data, homeworks],
  );
  const daily = useMemo(() => dailyHomeworks(homeworks, false), [homeworks]);
  const range = hourRange(items, slotsQuery.data ?? []);

  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [selectedHomework, setSelectedHomework] = useState<CalendarHomework | null>(null);
  const [legend, setLegend] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['diary', 'calendar'] });
  const publishSession = useMutation({ mutationFn: (id: number) => api.publishSession(id), onSuccess: () => { setSelected(null); refresh(); } });
  const publishHomework = useMutation({ mutationFn: (id: number) => api.publishHomework(id), onSuccess: () => { setSelectedHomework(null); refresh(); } });

  const label = (it: CalendarItem): string => {
    if (it.kind === 'course') return it.course?.exceptionnal || it.course?.subject?.name || subjectName.get(it.course?.subjectId ?? '') || '';
    const s = it.session!;
    return s.title || s.exceptional_label || subjectName.get(s.subject_id ?? '') || '';
  };
  const audience = (it: CalendarItem): string =>
    it.kind === 'course' ? [...(it.course?.classes ?? []), ...(it.course?.groups ?? [])].join(', ') : className.get(it.session?.audience_id ?? '') ?? '';
  const hwLabel = (h: CalendarHomework) => h.exceptional_label || subjectName.get(h.subject_id ?? '') || t('diary.homework', { defaultValue: 'Devoir' });

  const dayTitle = (d: Date) => d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: mode === 'month' ? undefined : 'long' });
  const periodLabel =
    mode === 'day'
      ? period.first.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${period.first.toLocaleDateString(dateLocale())} – ${period.last.toLocaleDateString(dateLocale())}`;
  const loading = sessionsQuery.isLoading || homeworksQuery.isLoading || coursesQuery.isLoading;
  const loadError = sessionsQuery.isError || homeworksQuery.isError || coursesQuery.isError;
  const timeGrid = mode === 'day' || mode === 'week';

  const itemBox = (it: CalendarItem, compact: boolean) => (
    <button
      type="button"
      key={it.key}
      data-item={it.key}
      data-kind={it.kind}
      onClick={() => setSelected(it)}
      title={`${hhmm(it.start)}–${hhmm(it.end)} ${label(it)}`}
      className="text-start w-100 border-0"
      style={{
        background: it.color,
        color: it.color === COLORS.course ? '#333' : '#fff',
        border: it.color === COLORS.course ? '1px dashed #999' : undefined,
        borderRadius: 4,
        padding: '2px 4px',
        fontSize: 12,
        lineHeight: 1.25,
        overflow: 'hidden',
        height: compact ? undefined : '100%',
      }}
    >
      <strong>{compact ? `${hhmm(it.start)} ` : ''}{label(it)}</strong>
      {!it.published && <span aria-label={t('session.or.homework.not.published', { defaultValue: 'non publié' })} title={t('session.or.homework.not.published', { defaultValue: 'non publié' })}> ⦸</span>}
      {!compact && <div>{audience(it)}</div>}
      {!compact && it.homeworks.published + it.homeworks.draft > 0 && (
        <div>📝 {it.homeworks.published + it.homeworks.draft}</div>
      )}
    </button>
  );

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between gap-8 flex-wrap mb-12">
        <h1 className="m-0">{t('diary.calendar.title', { defaultValue: 'Calendrier' })}</h1>
        <button type="button" className="btn btn-secondary" onClick={() => setLegend(true)}>
          {t('diary.calendar.legend', { defaultValue: 'Légende' })}
        </button>
      </div>

      {rs.canSearch && <SearchBar structureId={structureId} teacher={rs.teacher} onTeacher={rs.setTeacher} classes={rs.classes} onClasses={rs.setClasses} />}

      <div className="d-flex gap-8 flex-wrap align-items-center mb-12">
        <button type="button" className="btn btn-secondary" onClick={() => setAnchor((a) => step(mode, a, -1))}>← {t('diary.calendar.prev', { defaultValue: 'Précédent' })}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setAnchor(initialAnchor(new Date()))}>{t('diary.calendar.today', { defaultValue: "Aujourd'hui" })}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setAnchor((a) => step(mode, a, 1))}>{t('diary.calendar.next', { defaultValue: 'Suivant' })} →</button>
        <input
          type="date"
          className="form-control"
          style={{ width: 'auto' }}
          aria-label={t('diary.calendar.goto', { defaultValue: 'Aller à la date' })}
          value={ymd(anchor)}
          onChange={(e) => e.target.value && setAnchor(new Date(`${e.target.value}T12:00:00`))}
        />
        <span className="text-muted" role="status" data-period>{periodLabel}</span>
      </div>
      <div className="d-flex gap-12 flex-wrap align-items-center mb-12">
        <div className="btn-group" role="group" aria-label={t('diary.calendar.view', { defaultValue: 'Affichage' })}>
          {VIEW_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} className={`btn btn-${mode === m ? 'primary' : 'secondary'}`} onClick={() => setMode(m)}>
              {t(`diary.calendar.mode.${m}`, { defaultValue: { day: 'Jour', week: 'Semaine', fortnight: 'Quinzaine', month: 'Mois' }[m] })}
            </button>
          ))}
        </div>
        {mode !== 'day' && (
          <>
            <label className="d-flex align-items-center gap-4 m-0">
              <input type="checkbox" disabled={!optionsReady} checked={options.displaySaturday} onChange={(e) => setOptions({ displaySaturday: e.target.checked })} />
              {t('diary.calendar.show.saturday', { defaultValue: 'Afficher le samedi' })}
            </label>
            <label className="d-flex align-items-center gap-4 m-0">
              <input type="checkbox" disabled={!optionsReady} checked={options.displaySunday} onChange={(e) => setOptions({ displaySunday: e.target.checked })} />
              {t('diary.calendar.show.sunday', { defaultValue: 'Afficher le dimanche' })}
            </label>
          </>
        )}
      </div>

      {loading && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}
      {loadError && <div className="alert alert-warning" role="alert">{t('diary.calendar.error', { defaultValue: 'Le calendrier n’a pas pu être chargé.' })}</div>}

      {timeGrid ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, minmax(110px, 1fr))`, minWidth: 56 + 110 * days.length }}>
            <div />
            {days.map((d) => (
              <div key={ymd(d)} className="text-center fw-bold p-4" style={{ textTransform: 'capitalize', fontSize: 13, borderBottom: '1px solid #ddd' }}>{dayTitle(d)}</div>
            ))}
            {/* Travail à faire : devoirs sans séance, au jour d'échéance (masqué en quinzaine et mois, comme l'AngularJS). */}
            <div className="text-muted" style={{ fontSize: 11, padding: 2 }}>{t('diary.calendar.todo', { defaultValue: 'Travail à faire' })}</div>
            {days.map((d) => (
              <div key={`hw-${ymd(d)}`} data-todo-day={ymd(d)} style={{ borderBottom: '1px solid #ddd', padding: 2, minHeight: 24 }}>
                {(daily.get(ymd(d)) ?? []).map((h) => (
                  <button key={h.id} type="button" className="btn btn-sm w-100 text-start mb-2" data-homework={h.id} style={{ background: COLORS.emptyWithHomeworks, color: '#fff', fontSize: 11, padding: '1px 4px' }} onClick={() => setSelectedHomework(h)}>
                    {hwLabel(h)}{!h.is_published ? ' ⦸' : ''}
                  </button>
                ))}
              </div>
            ))}
            <div style={{ position: 'relative', height: ((range.to - range.from) / 60) * HOUR_PX }}>
              {Array.from({ length: (range.to - range.from) / 60 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: i * HOUR_PX, right: 4, fontSize: 11, color: '#666' }}>{hhmm(range.from + i * 60)}</div>
              ))}
            </div>
            {days.map((d) => {
              const key = ymd(d);
              const dayItems = items.filter((i) => i.day === key);
              const lane = lanes(dayItems);
              return (
                <div key={`g-${key}`} data-day={key} style={{ position: 'relative', height: ((range.to - range.from) / 60) * HOUR_PX, borderLeft: '1px solid #eee' }}>
                  {Array.from({ length: (range.to - range.from) / 60 }, (_, i) => (
                    <div key={i} aria-hidden style={{ position: 'absolute', top: i * HOUR_PX, left: 0, right: 0, borderTop: '1px solid #eee' }} />
                  ))}
                  {dayItems.map((it) => {
                    const l = lane.get(it.key) ?? { lane: 0, count: 1 };
                    return (
                      <div
                        key={it.key}
                        style={{
                          position: 'absolute',
                          top: ((it.start - range.from) / 60) * HOUR_PX,
                          height: Math.max(18, ((it.end - it.start) / 60) * HOUR_PX - 2),
                          left: `${(l.lane / l.count) * 100}%`,
                          width: `${100 / l.count}%`,
                          padding: '0 1px',
                        }}
                      >
                        {itemBox(it, false)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${daysPerWeek(options)}, minmax(110px, 1fr))`, minWidth: 110 * daysPerWeek(options), border: '1px solid #e0e0e0' }}>
            {days.slice(0, daysPerWeek(options)).map((d) => (
              <div key={`h-${ymd(d)}`} className="text-center fw-bold p-4" style={{ textTransform: 'capitalize', fontSize: 13, borderBottom: '1px solid #e0e0e0' }}>
                {d.toLocaleDateString(dateLocale(), { weekday: 'long' })}
              </div>
            ))}
            {days.map((d) => {
              const key = ymd(d);
              const outside = mode === 'month' && d.getMonth() !== anchor.getMonth();
              return (
                <div key={key} data-day={key} style={{ minHeight: 96, padding: 4, borderRight: '1px solid #eee', borderBottom: '1px solid #eee', background: outside ? '#fafafa' : undefined }}>
                  <div className="text-muted" style={{ fontSize: 12 }}>{d.getDate()}</div>
                  <div className="d-flex flex-column gap-2">{items.filter((i) => i.day === key).map((it) => itemBox(it, true))}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <Modal id={dialogId} isOpen onModalClose={() => setSelected(null)} size="md">
          <Modal.Header onModalClose={() => setSelected(null)}>{label(selected) || t('diary.session', { defaultValue: 'Séance' })}</Modal.Header>
          <Modal.Body>
            <p className="mb-8">
              {new Date(`${selected.day}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {hhmm(selected.start)} – {hhmm(selected.end)}
            </p>
            <p className="mb-8">{audience(selected)}</p>
            {selected.kind === 'course' ? (
              <div className="alert alert-info mb-0" role="status">{t('diary.calendar.course.empty', { defaultValue: "Cours de l'emploi du temps : séance pas encore renseignée." })}</div>
            ) : (
              <>
                <p className="mb-8" data-session-status>
                  {selected.published ? t('diary.published', { defaultValue: 'Publiée' }) : t('diary.unpublished', { defaultValue: 'Non publiée' })}
                  {' · '}
                  {t('diary.calendar.homeworks.count', { defaultValue: '[[count]] devoir(s)', count: selected.homeworks.published + selected.homeworks.draft })}
                </p>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>{t('diary.close', { defaultValue: 'Fermer' })}</button>
            {selected.kind === 'course' && ctx.has('manageSession') && (
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/seance/nouvelle?course=${selected.course!._id}&date=${selected.day}`)}>
                {t('diary.calendar.fill', { defaultValue: 'Renseigner la séance' })}
              </button>
            )}
            {selected.kind === 'session' && (
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/seance/${selected.session!.id}`)}>
                {ctx.has('manageSession')
                  ? selected.session?.teacher_id === ctx.userId
                    ? t('diary.calendar.edit', { defaultValue: 'Modifier' })
                    : t('diary.calendar.propose', { defaultValue: 'Proposer une modification' })
                  : t('diary.calendar.open', { defaultValue: 'Consulter' })}
              </button>
            )}
            {selected.kind === 'session' && !selected.published && ctx.has('publishSession') && selected.session?.teacher_id === ctx.userId && (
              <button type="button" className="btn btn-primary" disabled={publishSession.isPending} onClick={() => publishSession.mutate(selected.session!.id)}>
                {t('diary.publish', { defaultValue: 'Publier' })}
              </button>
            )}
          </Modal.Footer>
        </Modal>
      )}

      {selectedHomework && (
        <Modal id={`${dialogId}-hw`} isOpen onModalClose={() => setSelectedHomework(null)} size="md">
          <Modal.Header onModalClose={() => setSelectedHomework(null)}>{hwLabel(selectedHomework)}</Modal.Header>
          <Modal.Body>
            <p className="mb-8">
              {t('diary.due', { defaultValue: 'À rendre le' })} {new Date(`${selectedHomework.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString(dateLocale())}
              {' · '}
              {className.get(selectedHomework.audience_id ?? '') ?? ''}
            </p>
            <p className="mb-0">{stripHtml(selectedHomework.description)}</p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setSelectedHomework(null)}>{t('diary.close', { defaultValue: 'Fermer' })}</button>
            {!selectedHomework.is_published && ctx.has('publishHomework') && (
              <button type="button" className="btn btn-primary" disabled={publishHomework.isPending} onClick={() => publishHomework.mutate(selectedHomework.id)}>
                {t('diary.publish', { defaultValue: 'Publier' })}
              </button>
            )}
          </Modal.Footer>
        </Modal>
      )}

      {legend && (
        <Modal id={`${dialogId}-legend`} isOpen onModalClose={() => setLegend(false)} size="md">
          <Modal.Header onModalClose={() => setLegend(false)}>{t('diary.calendar.legend', { defaultValue: 'Légende' })}</Modal.Header>
          <Modal.Body>
            <ul className="list-unstyled d-flex flex-column gap-8 m-0" data-legend>
              {[
                [COLORS.course, 'session.official', "Séance issue de l'emploi du temps"],
                [COLORS.filled, 'session.official.update', "Séance issue de l'emploi du temps remplie"],
                [COLORS.emptyWithHomeworks, 'session.official.empty', "Séance issue de l'emploi du temps vide avec devoir(s)"],
                [COLORS.punctual, 'session.punctual', 'Séance hors emploi du temps'],
              ].map(([color, key, def]) => (
                <li key={key} className="d-flex align-items-center gap-8">
                  <span aria-hidden style={{ width: 24, height: 16, background: color, border: '1px solid #999', borderRadius: 3 }} />
                  {t(key, { defaultValue: def })}
                </li>
              ))}
              <li className="d-flex align-items-center gap-8">
                <span aria-hidden style={{ width: 24, textAlign: 'center' }}>⦸</span>
                {t('session.or.homework.not.published', { defaultValue: 'Travail à faire ou séance non publié(e)' })}
              </li>
            </ul>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-secondary" onClick={() => setLegend(false)}>{t('diary.close', { defaultValue: 'Fermer' })}</button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default Calendar;
