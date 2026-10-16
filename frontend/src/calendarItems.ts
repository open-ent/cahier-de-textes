/**
 * Éléments du calendrier du cahier de textes, fonctions pures — mêmes règles que l'AngularJS
 * (controllers/calendar/calendar-view.ts, model/session.ts) :
 *  - une séance s'affiche à sa date et ses horaires ;
 *  - un cours de l'emploi du temps sans séance rattachée (`course_id`) s'affiche « à renseigner » ;
 *  - couleurs : cours non renseigné gris clair, séance issue d'un cours verte (orange si vide avec
 *    devoirs), séance hors emploi du temps gris foncé ;
 *  - « Travail à faire » : devoirs sans séance, au jour d'échéance ;
 *  - élève et parent : séances et devoirs non publiés masqués.
 * Ex. cours « Mathématiques » du lundi 8 h sans séance → élément gris « à renseigner ».
 */

export const COLORS = {
  course: '#f7f6f6',
  filled: '#00ab6f',
  emptyWithHomeworks: '#ff9700',
  punctual: '#7E7E7E',
} as const;

export interface CalendarSession {
  id: number;
  date: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  subject_id?: string;
  exceptional_label?: string;
  audience_id?: string;
  course_id?: string | null;
  is_empty?: boolean;
  is_published?: boolean;
  teacher_id?: string;
}

export interface CalendarCourse {
  _id: string;
  startDate: string;
  endDate: string;
  subjectId?: string;
  subject?: { name?: string };
  exceptionnal?: string;
  classes?: string[];
  groups?: string[];
  roomLabels?: string[];
}

export interface CalendarHomework {
  id: number;
  due_date: string;
  session_id?: number | null;
  is_published?: boolean;
  subject_id?: string;
  exceptional_label?: string;
  audience_id?: string;
  description?: string;
}

export interface CalendarItem {
  kind: 'session' | 'course';
  /** Identifiant unique dans le calendrier, ex. « s-14 » ou « c-8bde… ». */
  key: string;
  /** Jour « AAAA-MM-JJ ». */
  day: string;
  /** Minutes depuis minuit. */
  start: number;
  end: number;
  color: string;
  published: boolean;
  /** Devoirs publiés / non publiés rattachés à la séance. */
  homeworks: { published: number; draft: number };
  session?: CalendarSession;
  course?: CalendarCourse;
}

const minutes = (hm?: string): number => {
  const m = (hm ?? '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** Jour d'une date serveur (« 2026-09-05 00:00:00.000000+0200 » ou « 2026-11-02 08:00:00 »). */
export const dayOf = (s: string): string => (s ?? '').slice(0, 10);

/** Couleur d'une séance (Session.init en AngularJS). */
export function sessionColor(s: CalendarSession, homeworkCount: number): string {
  if (!s.course_id) return COLORS.punctual;
  return s.is_empty && homeworkCount > 0 ? COLORS.emptyWithHomeworks : COLORS.filled;
}

export function buildItems(
  sessions: CalendarSession[],
  courses: CalendarCourse[],
  homeworks: CalendarHomework[],
  pupilView: boolean,
): CalendarItem[] {
  const visibleHw = homeworks.filter((h) => !pupilView || h.is_published);
  const hwBySession = new Map<number, CalendarHomework[]>();
  for (const h of visibleHw) if (h.session_id != null) hwBySession.set(h.session_id, [...(hwBySession.get(h.session_id) ?? []), h]);

  // Élève et parent : une séance non publiée n'apparaît que si elle porte des devoirs publiés
  // (orange, « vide avec devoirs »), comme setToUnpublishedWithHomework.
  const shownSessions = sessions.filter((s) => !pupilView || s.is_published || (hwBySession.get(s.id)?.length ?? 0) > 0);
  const items: CalendarItem[] = shownSessions.map((s) => {
    const hw = hwBySession.get(s.id) ?? [];
    const hidden = pupilView && !s.is_published;
    return {
      kind: 'session',
      key: `s-${s.id}`,
      day: dayOf(s.date),
      start: minutes(s.start_time),
      end: minutes(s.end_time),
      color: hidden ? COLORS.emptyWithHomeworks : sessionColor(s, hw.length),
      published: !!s.is_published,
      homeworks: { published: hw.filter((h) => h.is_published).length, draft: hw.filter((h) => !h.is_published).length },
      session: hidden ? { ...s, title: '', is_empty: true } : s,
    };
  });
  const taken = new Set(sessions.map((s) => s.course_id).filter(Boolean));
  for (const c of courses) {
    if (taken.has(c._id)) continue;
    items.push({
      kind: 'course',
      key: `c-${c._id}`,
      day: dayOf(c.startDate),
      start: minutes(c.startDate.slice(11)),
      end: minutes(c.endDate.slice(11)),
      color: COLORS.course,
      published: true,
      homeworks: { published: 0, draft: 0 },
      course: c,
    });
  }
  return items.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start);
}

/** « Travail à faire » : devoirs sans séance, par jour d'échéance. */
export function dailyHomeworks(homeworks: CalendarHomework[], pupilView: boolean): Map<string, CalendarHomework[]> {
  const map = new Map<string, CalendarHomework[]>();
  for (const h of homeworks) {
    if (h.session_id != null || (pupilView && !h.is_published)) continue;
    const d = dayOf(h.due_date);
    map.set(d, [...(map.get(d) ?? []), h]);
  }
  return map;
}

/** Bornes horaires de la grille : du plus tôt au plus tard des éléments, au moins 8 h - 18 h. */
export function hourRange(items: CalendarItem[], slots: Array<{ startHour: string; endHour: string }>): { from: number; to: number } {
  const starts = [...items.map((i) => i.start), ...slots.map((s) => minutes(s.startHour))].filter((x) => x > 0);
  const ends = [...items.map((i) => i.end), ...slots.map((s) => minutes(s.endHour))].filter((x) => x > 0);
  const from = Math.min(8 * 60, ...starts);
  const to = Math.max(18 * 60, ...ends);
  return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
}
