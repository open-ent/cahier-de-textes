import { Alert, Badge, Button, Checkbox, Loading } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { Empty } from '../components/Empty';
import { SearchBar } from '../components/SearchBar';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { useReadScope } from '../hooks/useReadScope';
import { buildDays, dayLabel, defaultDisplay, defaultPeriod, isDone, isValidPeriod, ListDisplay, ListHomework, ListSession } from '../listItems';
import { dateLocale } from '../locale';
import { scopeKey } from '../searchScope';
import { stripHtml } from '../utils';
import { LoadError } from '../components/LoadError';

/** Charge de travail du jour : la pastille reprend les niveaux du socle, pas des couleurs à soi. */
const BADGE_LEVEL = { green: 'success', yellow: 'warning', red: 'danger' } as const;
/** Filet des cartes : orange pour un devoir, couleur de l'application pour une séance. */
const HOMEWORK_COLOR = '#ff9700';

/**
 * Liste du cahier de textes, comme l'AngularJS (list/list-view.html) : une frise par jour avec, en
 * pastille, le nombre de devoirs ; séances et devoirs du jour ; filtres de période, « Séances »,
 * « Devoirs », matière, et « à faire » / « fait » pour l'élève et le parent ; case « fait » de l'élève.
 * Ex. lundi 2 novembre : pastille verte « 2 », deux devoirs et une séance.
 */
export function List() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const qc = useQueryClient();
  const structureId = ctx.structure?.id ?? '';
  const rs = useReadScope();
  const pupilView = ctx.profile === 'student' || ctx.profile === 'relative';
  const student = ctx.profile === 'student';

  const initial = useMemo(() => defaultPeriod(new Date()), []);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [subjectId, setSubjectId] = useState('');
  const [display, setDisplay] = useState<ListDisplay>(() => defaultDisplay(ctx.profile));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [doneLocal, setDoneLocal] = useState<Record<number, boolean>>({});
  const valid = isValidPeriod(start, end);

  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId, pupilView), enabled: !!structureId });
  const typesQuery = useQuery({ queryKey: ['diary', 'types', structureId], queryFn: () => api.getHomeworkTypes(structureId), enabled: !!structureId });
  const sessionsQuery = useQuery({
    queryKey: ['diary', 'list', 'sessions', structureId, start, end, subjectId, scopeKey(rs.scope)],
    queryFn: () => api.readSessions(rs.scope, start, end, structureId, subjectId || undefined),
    enabled: !!structureId && valid && rs.scope.mode !== 'none',
  });
  const homeworksQuery = useQuery({
    queryKey: ['diary', 'list', 'homeworks', structureId, start, end, subjectId, scopeKey(rs.scope)],
    queryFn: () => api.readHomeworks(rs.scope, start, end, structureId, subjectId || undefined),
    enabled: !!structureId && valid && rs.scope.mode !== 'none',
  });

  const subjectName = useMemo(() => new Map((subjectsQuery.data ?? []).filter((s) => !s.exceptional).map((s) => [s.id, s.name])), [subjectsQuery.data]);
  const className = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])), [classesQuery.data]);
  const typeLabel = useMemo(() => new Map((typesQuery.data ?? []).map((x) => [x.id, x.label])), [typesQuery.data]);
  const sessions = (sessionsQuery.data ?? []) as ListSession[];
  const homeworks = ((homeworksQuery.data ?? []) as ListHomework[]).map((h) => (doneLocal[h.id] === undefined ? h : { ...h, progress: { state_label: doneLocal[h.id] ? 'done' : 'todo' } }));
  const days = useMemo(() => buildDays(sessions, homeworks, display, pupilView), [sessions, homeworks, display, pupilView]);

  const progress = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => api.setHomeworkProgress(id, done ? 'done' : 'todo'),
    onMutate: ({ id, done }) => setDoneLocal((m) => ({ ...m, [id]: done })),
    onError: (_e, { id }) => setDoneLocal((m) => { const n = { ...m }; delete n[id]; return n; }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['diary', 'list'] }),
  });

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };
  const subjectOf = (id?: string, label?: string) => label || subjectName.get(id ?? '') || '';
  const loading = sessionsQuery.isLoading || homeworksQuery.isLoading;
  const failed = sessionsQuery.isError || homeworksQuery.isError;
  // L'écran vide dit quoi faire, pas seulement qu'il n'y a rien.
  const empty = !display.sessions && !display.homeworks
    ? {
        title: t('diary.filter.none', { defaultValue: 'Aucun filtre sélectionné' }),
        text: t('diary.filter.none.hint', { defaultValue: 'Cochez « Séances » ou « Devoirs » pour afficher le cahier de textes.' }),
      }
    : {
        title: display.sessions && !display.homeworks
          ? t('diary.empty.viewlist.session', { defaultValue: 'Aucune séance sur cette période.' })
          : !display.sessions && display.homeworks
            ? t('diary.empty.viewlist.homework', { defaultValue: 'Aucun devoir sur cette période.' })
            : t('diary.empty.on.period', { defaultValue: 'Aucune séance ni aucun devoir sur cette période.' }),
        text: t('diary.empty.period.hint', { defaultValue: 'Élargissez la période ou changez de matière.' }),
      };

  return (
    <div>
      {rs.canSearch && <SearchBar structureId={structureId} teacher={rs.teacher} onTeacher={rs.setTeacher} classes={rs.classes} onClasses={rs.setClasses} />}
      {ctx.profile === 'relative' && (
        <div className="mb-16" style={{ maxWidth: '32rem' }}>
          <label htmlFor="ls-child" className="form-label">{t('diary.child', { defaultValue: 'Enfant' })}</label>
          {rs.children.length === 0 ? (
            <p className="text-gray-700 m-0" data-no-child>{t('diary.child.none', { defaultValue: 'Aucun enfant rattaché à votre compte dans cet établissement.' })}</p>
          ) : (
            <select id="ls-child" className="form-select" value={rs.childId} onChange={(e) => rs.setChildId(e.target.value)}>
              {rs.children.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="d-flex gap-16 flex-wrap align-items-end mb-16" role="group" aria-label={t('diary.list.filters', { defaultValue: 'Filtres' })}>
        <div>
          <label htmlFor="ls-start" className="form-label">{t('diary.list.from', { defaultValue: 'Du' })}</label>
          <input id="ls-start" type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ls-end" className="form-label">{t('diary.list.to', { defaultValue: 'au' })}</label>
          <input id="ls-end" type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div style={{ minWidth: '20rem' }}>
          <label htmlFor="ls-subject" className="form-label">{t('diary.subject', { defaultValue: 'Matière' })}</label>
          <select id="ls-subject" className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{t('diary.list.all.subjects', { defaultValue: 'Toutes les matières' })}</option>
            {(subjectsQuery.data ?? []).filter((s) => !s.exceptional).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="d-flex gap-16 flex-wrap align-items-center pb-8">
          <Checkbox
            label={t('diary.list.sessions', { defaultValue: 'Séances' })}
            checked={display.sessions}
            onChange={(e) => setDisplay({ ...display, sessions: e.target.checked })}
          />
          <Checkbox
            label={t('diary.list.homeworks', { defaultValue: 'Devoirs' })}
            checked={display.homeworks}
            onChange={(e) => setDisplay({ ...display, homeworks: e.target.checked })}
          />
          {pupilView && display.homeworks && (
            <>
              <Checkbox
                label={t('diary.homework.todo', { defaultValue: 'À faire' })}
                checked={display.todo}
                onChange={(e) => setDisplay({ ...display, todo: e.target.checked })}
              />
              <Checkbox
                label={t('diary.homework.done', { defaultValue: 'Fait' })}
                checked={display.done}
                onChange={(e) => setDisplay({ ...display, done: e.target.checked })}
              />
            </>
          )}
        </div>
      </div>

      {!valid && (
        <div className="mb-16">
          <Alert type="warning">{t('diary.list.period.invalid', { defaultValue: 'La date de début doit précéder la date de fin.' })}</Alert>
        </div>
      )}
      {loading && <Loading isLoading />}
      <LoadError failed={failed} />
      {valid && !loading && !failed && days.length === 0 && (
        <Empty illustration="search" title={empty.title} text={empty.text} />
      )}

      <ol className="list-unstyled m-0" data-days>
        {days.map((d) => (
          <li key={d.day} data-day={d.day} className="d-flex gap-16 mb-16">
            <div className="diary-day-label text-end">
              <Button
                type="button"
                color="tertiary"
                variant="ghost"
                className="fw-bold"
                aria-expanded={!collapsed.has(d.day)}
                onClick={() => toggle(collapsed, d.day, setCollapsed)}
              >
                {dayLabel(d.day, dateLocale())}
              </Button>
            </div>
            <div className="flex-shrink-0 pt-8">
              <Badge
                variant={{ type: 'notification', level: BADGE_LEVEL[d.color] }}
                data-count={d.homeworkCount}
                title={t('diary.list.homeworks.count', { defaultValue: '[[count]] devoir(s)', count: d.homeworkCount })}
              >
                {d.homeworkCount}
              </Badge>
            </div>
            {!collapsed.has(d.day) && (
              <div className="flex-grow-1">
                {d.items.map((it) =>
                  it.kind === 'session' ? (
                    <article key={it.key} data-item={it.key} className="card diary-item-card bg-white p-12 mb-8">
                      <div className="d-flex gap-8 flex-wrap align-items-baseline">
                        <strong>{subjectOf(it.session.subject_id, it.session.exceptional_label)}</strong>
                        <strong>{className.get(it.session.audience_id ?? '') ?? ''}</strong>
                        {it.session.start_time && <span className="small text-gray-700">{it.session.start_time.slice(0, 5)} – {(it.session.end_time ?? '').slice(0, 5)}</span>}
                        <Link to={`/seance/${it.session.id}`} className="ms-auto">{t('diary.calendar.open', { defaultValue: 'Consulter' })}</Link>
                      </div>
                      {(it.session.title || it.session.room) && (
                        <div className="small">
                          {it.session.title}
                          {it.session.room ? ` – ${t('diary.session.room', { defaultValue: 'Salle' })} : ${it.session.room}` : ''}
                        </div>
                      )}
                      {it.session.description && (
                        <>
                          <Button
                            type="button"
                            color="tertiary"
                            variant="ghost"
                            size="sm"
                            className="align-self-start px-0"
                            aria-expanded={opened.has(it.key)}
                            onClick={() => toggle(opened, it.key, setOpened)}
                          >
                            {opened.has(it.key) ? t('diary.list.hide', { defaultValue: 'Masquer le contenu' }) : t('diary.list.show', { defaultValue: 'Voir le contenu' })}
                          </Button>
                          {opened.has(it.key) && <div className="mt-4" data-description>{stripHtml(it.session.description)}</div>}
                        </>
                      )}
                    </article>
                  ) : (
                    <article
                      key={it.key}
                      data-item={it.key}
                      className="card diary-item-card bg-white p-12 mb-8"
                      style={{ '--diary-color': HOMEWORK_COLOR } as CSSProperties}
                    >
                      <div className="d-flex gap-8 flex-wrap align-items-baseline">
                        <strong>{subjectOf(it.homework.subject_id, it.homework.exceptional_label)}</strong>
                        <strong>{className.get(it.homework.audience_id ?? '') ?? ''}</strong>
                        <span className="small text-gray-700">{typeLabel.get(it.homework.type_id ?? -1) ?? ''}</span>
                        {student && ctx.has('setProgressHomework') ? (
                          <span data-state>
                            <Checkbox
                              label={t('diary.homework.done', { defaultValue: 'Fait' })}
                              aria-label={`${t('diary.homework.done', { defaultValue: 'Fait' })} : ${stripHtml(it.homework.description)}`}
                              checked={isDone(it.homework)}
                              onChange={(e) => progress.mutate({ id: it.homework.id, done: e.target.checked })}
                            />
                          </span>
                        ) : (
                          pupilView && (
                            <span data-state>
                              <Badge variant={{ type: 'content', level: isDone(it.homework) ? 'success' : 'danger', background: true }}>
                                {isDone(it.homework) ? t('diary.homework.done', { defaultValue: 'Fait' }) : t('diary.homework.todo', { defaultValue: 'À faire' })}
                              </Badge>
                            </span>
                          )
                        )}
                        <Link to={`/devoir/${it.homework.id}`} className="ms-auto">{t('diary.calendar.open', { defaultValue: 'Consulter' })}</Link>
                      </div>
                      {it.homework.description && (
                        <>
                          <Button
                            type="button"
                            color="tertiary"
                            variant="ghost"
                            size="sm"
                            className="align-self-start px-0"
                            aria-expanded={opened.has(it.key)}
                            onClick={() => toggle(opened, it.key, setOpened)}
                          >
                            {opened.has(it.key) ? t('diary.list.hide', { defaultValue: 'Masquer le contenu' }) : t('diary.list.show', { defaultValue: 'Voir le contenu' })}
                          </Button>
                          {opened.has(it.key) && <div className="mt-4" data-description>{stripHtml(it.homework.description)}</div>}
                        </>
                      )}
                    </article>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default List;
