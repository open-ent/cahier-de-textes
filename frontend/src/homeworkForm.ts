/**
 * Devoirs donnés pendant une séance, fonctions pures — mêmes règles et mêmes données que
 * l'AngularJS (model/homework.ts, controllers/session/manageSession.ts) :
 *  - un devoir donné depuis la séance porte `from_session_id` ; il est à rendre pour une séance
 *    future (`session_id`, échéance = date de cette séance) ou à une date (`session_id` null) ;
 *  - type obligatoire, durée estimée ≥ 0, description en XHTML, brouillon ou publié ;
 *  - charge de travail du jour : nombre de devoirs et durée estimée, pastille verte (≤ 2), jaune
 *    (≤ 4), rouge (> 4).
 * Ex. « Exercices 1 à 5 », type « Exercice(s) », 30 min, pour la séance du jeudi suivant.
 */
import { htmlToXhtml } from './sessionForm';

export const HOMEWORK_COLOR = '#ff9700';

export interface HomeworkDraft {
  /** Clé locale stable (le devoir n'a pas d'identifiant avant enregistrement). */
  key: string;
  id?: number;
  typeId: string;
  /** « session » : à rendre pour une séance future ; « date » : à une date. */
  dueMode: 'session' | 'date';
  dueSessionId: string;
  dueDate: string;
  estimatedTime: number;
  description: string;
  published: boolean;
  /** Retiré de la liste : supprimé à l'enregistrement s'il existe déjà. */
  deleted?: boolean;
}

export type HomeworkError = 'type' | 'due' | 'time' | 'description';

let counter = 0;
export const newKey = (): string => `hw-${(counter += 1)}`;

export const emptyHomework = (): HomeworkDraft => ({
  key: newKey(),
  typeId: '',
  dueMode: 'date',
  dueSessionId: '',
  dueDate: '',
  estimatedTime: 0,
  description: '',
  published: false,
});

export function validateHomework(h: HomeworkDraft): HomeworkError[] {
  const errs: HomeworkError[] = [];
  if (!h.typeId) errs.push('type');
  if (h.dueMode === 'session' ? !h.dueSessionId : !h.dueDate) errs.push('due');
  if (!(h.estimatedTime >= 0)) errs.push('time');
  if (!h.description.trim()) errs.push('description');
  return errs;
}

/** Corps de POST / PUT d'un devoir, comme Homework.toSendFormat. */
export function homeworkPayload(
  h: HomeworkDraft,
  ctx: { sessionId: number; subjectId: string; exceptionalLabel?: string; structureId: string; audienceId: string; teacherId: string; dueSessionDate?: string },
) {
  const session = h.dueMode === 'session' && h.dueSessionId ? Number(h.dueSessionId) : null;
  return {
    subject_id: ctx.subjectId,
    ...(ctx.exceptionalLabel ? { exceptional_label: ctx.exceptionalLabel } : {}),
    type_id: Number(h.typeId),
    teacher_id: ctx.teacherId,
    structure_id: ctx.structureId,
    session_id: session,
    from_session_id: ctx.sessionId,
    audience_id: ctx.audienceId,
    estimatedTime: h.estimatedTime || 0,
    due_date: session ? ctx.dueSessionDate ?? h.dueDate : h.dueDate,
    description: htmlToXhtml(h.description),
    color: HOMEWORK_COLOR,
    is_published: h.published,
    resources: [],
    detachFromSession: session === null,
  };
}

/** Devoir serveur (liste `from_homeworks` d'une séance) → brouillon. */
export function draftFromHomework(h: {
  id: number;
  type_id?: number | null;
  session_id?: number | null;
  due_date?: string;
  estimatedTime?: number;
  description?: string;
  is_published?: boolean;
}): HomeworkDraft {
  return {
    key: `hw-id-${h.id}`,
    id: h.id,
    typeId: h.type_id != null ? String(h.type_id) : '',
    dueMode: h.session_id != null ? 'session' : 'date',
    dueSessionId: h.session_id != null ? String(h.session_id) : '',
    dueDate: (h.due_date ?? '').slice(0, 10),
    estimatedTime: Number(h.estimatedTime ?? 0),
    description: h.description ?? '',
    published: !!h.is_published,
  };
}

/** Pastille de charge de travail (Workload.getWorkloadColor). Ex. 3 devoirs → jaune. */
export function workloadColor(count: number): 'green' | 'yellow' | 'red' {
  if (count <= 2) return 'green';
  if (count <= 4) return 'yellow';
  return 'red';
}

/** Charge d'un jour dans la réponse de `/diary/workload` (une entrée par jour de la semaine). */
export function dayWorkload(data: Array<{ day: string; count: number | string; total: number | string }>, day: string): { count: number; total: number } {
  const found = (data ?? []).find((d) => (d.day ?? '').slice(0, 10) === day);
  return { count: found ? Number(found.count) : 0, total: found ? Number(found.total) : 0 };
}

/** Séances futures proposées comme échéance : même classe, après la séance courante, dans les 28 jours. */
export function futureSessions<T extends { id: number; date: string; audience_id?: string; start_time?: string }>(
  sessions: T[],
  current: { id?: number; date: string; audienceId: string },
): T[] {
  return sessions
    .filter((s) => s.id !== current.id && s.audience_id === current.audienceId && s.date.slice(0, 10) > current.date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}
