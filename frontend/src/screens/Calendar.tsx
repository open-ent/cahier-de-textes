import { Alert, Badge, Button, Checkbox, Loading, Modal, SegmentedControl, Tooltip } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CSSProperties, DragEvent, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '../api';
import { buildItems, CalendarHomework, CalendarItem, COLORS, dailyHomeworks, hourRange } from '../calendarItems';
import { useCalendarOptions } from '../hooks/useCalendarOptions';
import { LoadError } from '../components/LoadError';
import { SearchBar } from '../components/SearchBar';
import { PeriodNav } from '../components/PeriodNav';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { useReadScope } from '../hooks/useReadScope';
import { dateLocale } from '../locale';
import { daysPerWeek, initialAnchor, periodOf, step, ViewMode, VIEW_MODES, visibleDays } from '../period';
import { buildTree, flatten, ProgressionSession } from '../progressions';
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
  const today = ymd(new Date());

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

  // Progressions de l'enseignant : proposées en glisser-déposer sur un cours ou une séance.
  const canUseProgressions = ctx.has('manageSession') && (ctx.profile === 'teacher' || ctx.profile === 'personnel');
  const progressionsQuery = useQuery({ queryKey: ['diary', 'progression-folders', ctx.userId], queryFn: () => api.getProgressionFolders(ctx.userId), enabled: canUseProgressions && !!ctx.userId });
  const progressionList: Array<{ folder: string; p: ProgressionSession }> = useMemo(
    () => flatten(buildTree(progressionsQuery.data ?? [], t('diary.progressions.root', { defaultValue: 'Mes dossiers' }))).flatMap((f) => f.sessions.map((p) => ({ folder: f.title, p }))),
    [progressionsQuery.data, t],
  );
  const [pickProgression, setPickProgression] = useState('');
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

  /** Détail d'un élément, lu au survol comme au clavier : une ligne, sans ouvrir la fenêtre. */
  const tipOf = (it: CalendarItem): string =>
    [
      label(it) || t('diary.session', { defaultValue: 'Séance' }),
      `${hhmm(it.start)} – ${hhmm(it.end)}`,
      audience(it),
      it.kind === 'course'
        ? t('diary.calendar.course.empty', { defaultValue: "Cours de l'emploi du temps : séance pas encore renseignée." })
        : it.published
          ? t('diary.published', { defaultValue: 'Publiée' })
          : t('diary.unpublished', { defaultValue: 'Non publiée' }),
    ]
      .filter(Boolean)
      .join(' · ');

  const dayTitle = (d: Date) => d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: mode === 'month' ? undefined : 'long' });
  const periodLabel =
    mode === 'day'
      ? period.first.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${period.first.toLocaleDateString(dateLocale())} – ${period.last.toLocaleDateString(dateLocale())}`;
  const loading = sessionsQuery.isLoading || homeworksQuery.isLoading || coursesQuery.isLoading;
  const loadError = sessionsQuery.isError || homeworksQuery.isError || coursesQuery.isError;
  const timeGrid = mode === 'day' || mode === 'week';

  /** Cours → nouvelle séance pré-remplie ; séance → sa modification avec la progression appliquée. */
  const applyProgression = (it: CalendarItem, progressionId: string) => {
    if (!progressionId) return;
    if (it.kind === 'course') navigate(`/seance/nouvelle?course=${it.course!._id}&date=${it.day}&progression=${progressionId}`);
    else navigate(`/seance/${it.session!.id}?progression=${progressionId}`);
  };
  const dropProgression = (e: DragEvent, it: CalendarItem) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/x-diary-progression-id');
    if (id && ctx.has('manageSession')) applyProgression(it, id);
  };

  const itemBox = (it: CalendarItem, compact: boolean) => (
    <Tooltip key={it.key} message={tipOf(it)} placement="bottom">
      <button
        type="button"
        data-item={it.key}
        data-kind={it.kind}
        onClick={() => setSelected(it)}
        onDragOver={canUseProgressions ? (e) => e.preventDefault() : undefined}
        onDrop={canUseProgressions ? (e) => dropProgression(e, it) : undefined}
        className={`diary-chip small px-4 py-2 ${it.color === COLORS.course ? 'diary-chip--todo' : ''} ${compact ? 'mb-2' : 'h-100'}`}
        style={{ '--diary-color': it.color } as CSSProperties}
      >
        <strong>{compact ? `${hhmm(it.start)} ` : ''}{label(it)}</strong>
        {!it.published && <span aria-label={t('session.or.homework.not.published', { defaultValue: 'non publié' })}> ⦸</span>}
        {!compact && <div className="text-truncate">{audience(it)}</div>}
        {!compact && it.homeworks.published + it.homeworks.draft > 0 && (
          <div>📝 {it.homeworks.published + it.homeworks.draft}</div>
        )}
      </button>
    </Tooltip>
  );

  return (
    <div>
      {/* Barre de l'écran : d'abord ce qu'on regarde (la vue), puis quand, puis la légende. */}
      <div className="d-flex align-items-center justify-content-between gap-16 flex-wrap mb-16">
        {/* Le choix de vue est subordonné à la navigation du module : un sélecteur segmenté,
            pas une seconde rangée d'onglets qui lui ressemblerait. */}
        <SegmentedControl
          aria-label={t('diary.calendar.view', { defaultValue: 'Affichage' })}
          value={mode}
          onChange={(value) => setMode(value as ViewMode)}
          options={VIEW_MODES.map((m) => ({
            value: m,
            label: t(`diary.calendar.mode.${m}`, { defaultValue: { day: 'Jour', week: 'Semaine', fortnight: 'Quinzaine', month: 'Mois' }[m] }),
          }))}
        />
        <PeriodNav
          label={periodLabel}
          prevLabel={t('diary.calendar.prev', { defaultValue: 'Précédent' })}
          nextLabel={t('diary.calendar.next', { defaultValue: 'Suivant' })}
          onShift={(direction) => setAnchor((a) => step(mode, a, direction))}
          onToday={() => setAnchor(initialAnchor(new Date()))}
        >
          <input
            type="date"
            className="form-control w-auto"
            aria-label={t('diary.calendar.goto', { defaultValue: 'Aller à la date' })}
            value={ymd(anchor)}
            onChange={(e) => e.target.value && setAnchor(new Date(`${e.target.value}T12:00:00`))}
          />
          <Button type="button" color="tertiary" variant="ghost" size="sm" onClick={() => setLegend(true)}>
            {t('diary.calendar.legend', { defaultValue: 'Légende' })}
          </Button>
        </PeriodNav>
      </div>

      {rs.canSearch && <SearchBar structureId={structureId} teacher={rs.teacher} onTeacher={rs.setTeacher} classes={rs.classes} onClasses={rs.setClasses} />}

      {mode !== 'day' && (
        <div className="d-flex gap-16 flex-wrap align-items-center mb-16">
          <Checkbox
            label={t('diary.calendar.show.saturday', { defaultValue: 'Afficher le samedi' })}
            disabled={!optionsReady}
            checked={options.displaySaturday}
            onChange={(e) => setOptions({ displaySaturday: e.target.checked })}
          />
          <Checkbox
            label={t('diary.calendar.show.sunday', { defaultValue: 'Afficher le dimanche' })}
            disabled={!optionsReady}
            checked={options.displaySunday}
            onChange={(e) => setOptions({ displaySunday: e.target.checked })}
          />
        </div>
      )}

      {canUseProgressions && progressionList.length > 0 && (
        <details className="mb-16" data-progressions-panel>
          <summary className="diary-draggable fw-bold">{t('diary.calendar.progressions', { defaultValue: 'Mes progressions : glissez-en une sur un cours ou une séance' })}</summary>
          <ul className="list-unstyled d-flex flex-wrap gap-8 mt-8 mb-0">
            {progressionList.map(({ folder, p }) => (
              <li
                key={p.id}
                className="card diary-draggable small p-8"
                draggable
                data-progression={p.id}
                title={`${folder} › ${p.title}`}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-diary-progression-id', String(p.id)); e.dataTransfer.effectAllowed = 'copy'; }}
              >
                <strong>{p.title}</strong>
                {(p.className || p.subjectLabel) && <span className="text-gray-700"> · {[p.subjectLabel, p.className].filter(Boolean).join(' · ')}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {loading && <Loading isLoading />}
      <LoadError failed={loadError} />

      {timeGrid ? (
        <div className="diary-timegrid">
          <div className="d-grid diary-timegrid-head" style={{ gridTemplateColumns: `5.6rem repeat(${days.length}, minmax(11rem, 1fr))`, minWidth: 56 + 110 * days.length }}>
            <div />
            {days.map((d) => (
              <div key={ymd(d)} className={`text-center small fw-bold diary-first-letter p-4 ${ymd(d) === today ? 'diary-day--today' : ''}`}>{dayTitle(d)}</div>
            ))}
          </div>
          {/* Travail à faire : devoirs sans séance, au jour d'échéance (masqué en quinzaine et mois, comme l'AngularJS). */}
          <div className="d-grid diary-timegrid-head" style={{ gridTemplateColumns: `5.6rem repeat(${days.length}, minmax(11rem, 1fr))`, minWidth: 56 + 110 * days.length }}>
            <div className="small text-gray-700 p-4">{t('diary.calendar.todo', { defaultValue: 'Travail à faire' })}</div>
            {days.map((d) => (
              <div key={`hw-${ymd(d)}`} data-todo-day={ymd(d)} className="diary-day-col p-2">
                {(daily.get(ymd(d)) ?? []).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="diary-chip small text-truncate px-4 mb-2"
                    data-homework={h.id}
                    style={{ '--diary-color': COLORS.emptyWithHomeworks } as CSSProperties}
                    onClick={() => setSelectedHomework(h)}
                  >
                    {hwLabel(h)}{!h.is_published ? ' ⦸' : ''}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="d-grid" style={{ gridTemplateColumns: `5.6rem repeat(${days.length}, minmax(11rem, 1fr))`, minWidth: 56 + 110 * days.length }}>
            <div>
              {Array.from({ length: (range.to - range.from) / 60 }, (_, i) => (
                <div key={i} className="small text-gray-700 text-end pe-4" style={{ height: HOUR_PX }}>{hhmm(range.from + i * 60)}</div>
              ))}
            </div>
            {days.map((d) => {
              const key = ymd(d);
              const dayItems = items.filter((i) => i.day === key);
              const lane = lanes(dayItems);
              return (
                <div key={`g-${key}`} data-day={key} className="diary-day-col position-relative" style={{ height: ((range.to - range.from) / 60) * HOUR_PX }}>
                  {Array.from({ length: (range.to - range.from) / 60 }, (_, i) => (
                    <div key={i} aria-hidden className="diary-hour-line" style={{ height: HOUR_PX }} />
                  ))}
                  {dayItems.map((it) => {
                    const l = lane.get(it.key) ?? { lane: 0, count: 1 };
                    return (
                      <div
                        key={it.key}
                        className="position-absolute px-2"
                        style={{
                          top: ((it.start - range.from) / 60) * HOUR_PX,
                          height: Math.max(18, ((it.end - it.start) / 60) * HOUR_PX - 2),
                          left: `${(l.lane / l.count) * 100}%`,
                          width: `${100 / l.count}%`,
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
          <div className="d-grid diary-monthgrid" style={{ gridTemplateColumns: `repeat(${daysPerWeek(options)}, minmax(11rem, 1fr))`, minWidth: 110 * daysPerWeek(options) }}>
            {days.slice(0, daysPerWeek(options)).map((d) => (
              <div key={`h-${ymd(d)}`} className="diary-weekday text-center small fw-bold diary-first-letter p-4">
                {d.toLocaleDateString(dateLocale(), { weekday: 'long' })}
              </div>
            ))}
            {days.map((d) => {
              const key = ymd(d);
              const outside = mode === 'month' && d.getMonth() !== anchor.getMonth();
              return (
                <div key={key} data-day={key} className={`diary-month-day p-4 ${outside ? 'diary-month-day--outside' : ''} ${key === today ? 'diary-day--today' : ''}`}>
                  <div className="small text-gray-700">{d.getDate()}</div>
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
              <Alert type="info">{t('diary.calendar.course.empty', { defaultValue: "Cours de l'emploi du temps : séance pas encore renseignée." })}</Alert>
            ) : (
              <p className="d-flex align-items-center gap-8 mb-8" data-session-status>
                <Badge variant={{ type: 'content', level: selected.published ? 'success' : 'warning', background: true }}>
                  {selected.published ? t('diary.published', { defaultValue: 'Publiée' }) : t('diary.unpublished', { defaultValue: 'Non publiée' })}
                </Badge>
                <span>{t('diary.calendar.homeworks.count', { defaultValue: '[[count]] devoir(s)', count: selected.homeworks.published + selected.homeworks.draft })}</span>
              </p>
            )}
            {canUseProgressions && progressionList.length > 0 && (
              <div className="d-flex gap-8 align-items-end mt-16 flex-wrap" data-use-progression>
                <div style={{ flex: '1 1 22rem' }}>
                  <label htmlFor="cal-progression" className="form-label">{t('diary.calendar.use.progression', { defaultValue: 'Utiliser une progression' })}</label>
                  <select id="cal-progression" className="form-select" value={pickProgression} onChange={(e) => setPickProgression(e.target.value)}>
                    <option value="">—</option>
                    {progressionList.map(({ folder, p }) => <option key={p.id} value={p.id}>{`${folder} › ${p.title}`}</option>)}
                  </select>
                </div>
                <Button type="button" color="secondary" variant="outline" disabled={!pickProgression} onClick={() => applyProgression(selected, pickProgression)}>
                  {t('diary.calendar.use.progression.go', { defaultValue: 'Appliquer' })}
                </Button>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" color="tertiary" variant="ghost" onClick={() => setSelected(null)}>{t('diary.close', { defaultValue: 'Fermer' })}</Button>
            {selected.kind === 'course' && ctx.has('manageSession') && (
              <Button type="button" color="primary" variant="filled" onClick={() => navigate(`/seance/nouvelle?course=${selected.course!._id}&date=${selected.day}`)}>
                {t('diary.calendar.fill', { defaultValue: 'Renseigner la séance' })}
              </Button>
            )}
            {selected.kind === 'session' && !selected.published && ctx.has('publishSession') && selected.session?.teacher_id === ctx.userId && (
              <Button type="button" color="secondary" variant="outline" isLoading={publishSession.isPending} onClick={() => publishSession.mutate(selected.session!.id)}>
                {t('diary.publish', { defaultValue: 'Publier' })}
              </Button>
            )}
            {selected.kind === 'session' && (
              <Button type="button" color="primary" variant="filled" onClick={() => navigate(`/seance/${selected.session!.id}`)}>
                {ctx.has('manageSession')
                  ? selected.session?.teacher_id === ctx.userId
                    ? t('diary.calendar.edit', { defaultValue: 'Modifier' })
                    : t('diary.calendar.propose', { defaultValue: 'Proposer une modification' })
                  : t('diary.calendar.open', { defaultValue: 'Consulter' })}
              </Button>
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
            <Button type="button" color="tertiary" variant="ghost" onClick={() => setSelectedHomework(null)}>{t('diary.close', { defaultValue: 'Fermer' })}</Button>
            {!selectedHomework.is_published && ctx.has('publishHomework') && (
              <Button type="button" color="primary" variant="filled" isLoading={publishHomework.isPending} onClick={() => publishHomework.mutate(selectedHomework.id)}>
                {t('diary.publish', { defaultValue: 'Publier' })}
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      )}

      {legend && (
        <Modal id={`${dialogId}-legend`} isOpen onModalClose={() => setLegend(false)} size="md">
          <Modal.Header onModalClose={() => setLegend(false)}>{t('diary.calendar.legend', { defaultValue: 'Légende' })}</Modal.Header>
          <Modal.Body>
            <ul className="list-unstyled d-flex flex-column gap-12 m-0" data-legend>
              {[
                [COLORS.course, 'session.official', "Séance issue de l'emploi du temps"],
                [COLORS.filled, 'session.official.update', "Séance issue de l'emploi du temps remplie"],
                [COLORS.emptyWithHomeworks, 'session.official.empty', "Séance issue de l'emploi du temps vide avec devoir(s)"],
                [COLORS.punctual, 'session.punctual', 'Séance hors emploi du temps'],
              ].map(([color, key, def]) => (
                <li key={key} className="d-flex align-items-center gap-12">
                  <span aria-hidden className="diary-chip flex-shrink-0" style={{ '--diary-color': color, width: '2.4rem', height: '1.6rem' } as CSSProperties} />
                  {t(key, { defaultValue: def })}
                </li>
              ))}
              <li className="d-flex align-items-center gap-12">
                <span aria-hidden className="flex-shrink-0 text-center" style={{ width: '2.4rem' }}>⦸</span>
                {t('session.or.homework.not.published', { defaultValue: 'Travail à faire ou séance non publié(e)' })}
              </li>
            </ul>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" color="tertiary" variant="ghost" onClick={() => setLegend(false)}>{t('diary.close', { defaultValue: 'Fermer' })}</Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default Calendar;
