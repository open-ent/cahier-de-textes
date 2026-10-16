/**
 * Vue liste du cahier de textes, fonctions pures — mêmes règles que l'AngularJS
 * (controllers/list/manageList.ts, template/list/list-view.html) :
 *  - frise par jour : pastille avec le nombre de devoirs du jour (verte ≤ 2, jaune ≤ 4, rouge > 4) ;
 *  - filtres « Séances » et « Devoirs » ; élève : « à faire » / « fait » (élève : à faire seulement
 *    par défaut ; enseignant et parent : les deux) ;
 *  - élève et parent : éléments non publiés masqués ;
 *  - un jour sans élément à afficher n'est pas listé ; période par défaut : aujourd'hui + 28 jours.
 * Ex. lundi 2 : deux devoirs à faire et une séance → pastille verte « 2 », trois lignes.
 */
import { workloadColor } from './homeworkForm';

export interface ListSession {
  id: number;
  date: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  subject_id?: string;
  exceptional_label?: string;
  audience_id?: string;
  room?: string;
  description?: string;
  is_published?: boolean;
}

export interface ListHomework {
  id: number;
  due_date: string;
  subject_id?: string;
  exceptional_label?: string;
  audience_id?: string;
  type_id?: number | null;
  description?: string;
  is_published?: boolean;
  progress?: { state_label?: string } | null;
}

export interface ListDisplay {
  sessions: boolean;
  homeworks: boolean;
  todo: boolean;
  done: boolean;
}

export type ListItem =
  | { kind: 'session'; key: string; day: string; start: string; session: ListSession }
  | { kind: 'homework'; key: string; day: string; start: string; homework: ListHomework };

export interface ListDay {
  day: string;
  items: ListItem[];
  /** Devoirs du jour comptés selon les filtres « à faire » / « fait ». */
  homeworkCount: number;
  color: 'green' | 'yellow' | 'red';
}

const dayOf = (s?: string | null): string => (s ?? '').slice(0, 10);

/** Réglages par défaut selon le profil (manageList.ts init). */
export function defaultDisplay(profile: 'student' | 'relative' | 'teacher' | 'personnel' | 'other'): ListDisplay {
  return { sessions: true, homeworks: true, todo: true, done: profile !== 'student' };
}

/** Période par défaut : aujourd'hui et les 28 jours suivants. */
export function defaultPeriod(today: Date): { start: string; end: string } {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const end = new Date(today);
  end.setDate(end.getDate() + 28);
  return { start: fmt(today), end: fmt(end) };
}

/** Période valide : début au plus égal à la fin (sinon on ne relit pas, comme l'AngularJS). */
export const isValidPeriod = (start: string, end: string): boolean => !!start && !!end && start <= end;

export const isDone = (h: ListHomework): boolean => h.progress?.state_label === 'done';

function homeworkShown(h: ListHomework, d: ListDisplay, pupilView: boolean): boolean {
  if (!d.homeworks) return false;
  if (pupilView && !h.is_published) return false;
  // « à faire » / « fait » : ne concerne que les profils qui suivent l'avancement (élève, parent).
  if (pupilView) return (d.todo && !isDone(h)) || (d.done && isDone(h));
  return true;
}

export function buildDays(sessions: ListSession[], homeworks: ListHomework[], display: ListDisplay, pupilView: boolean): ListDay[] {
  const items: ListItem[] = [];
  if (display.sessions) {
    for (const s of sessions) {
      if (pupilView && !s.is_published) continue;
      items.push({ kind: 'session', key: `s-${s.id}`, day: dayOf(s.date), start: (s.start_time ?? '').slice(0, 5), session: s });
    }
  }
  const countable = new Map<string, number>();
  for (const h of homeworks) {
    if (!homeworkShown(h, display, pupilView)) continue;
    const day = dayOf(h.due_date);
    items.push({ kind: 'homework', key: `h-${h.id}`, day, start: '', homework: h });
    countable.set(day, (countable.get(day) ?? 0) + 1);
  }
  const byDay = new Map<string, ListItem[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const count = countable.get(day) ?? 0;
      // Séances d'abord (par heure), puis devoirs.
      list.sort((a, b) => (a.kind === b.kind ? a.start.localeCompare(b.start) : a.kind === 'session' ? -1 : 1));
      return { day, items: list, homeworkCount: count, color: workloadColor(count) };
    });
}

/** Libellé d'un jour, majuscule initiale. Ex. « Lundi 2 novembre 2026 ». */
export function dayLabel(day: string, locale: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const text = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
