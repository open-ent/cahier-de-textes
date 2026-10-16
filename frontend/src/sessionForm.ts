/**
 * Formulaire de séance, fonctions pures — mêmes règles et mêmes données que l'AngularJS
 * (controllers/session/manageSession.ts, model/session.ts) :
 *  - matière du référentiel ou intitulé libre (« exceptional » + libellé) ;
 *  - titre de 50 caractères au plus, sinon « Travail de la séance du jj/mm/aaaa » ;
 *  - au moins 15 minutes entre le début et la fin (validDate) ;
 *  - description envoyée en XHTML (le rendu PDF des visas l'exige) ;
 *  - PUT qui REMPLACE tout : toujours renvoyer l'objet complet (ressources, salle, réservations).
 * Ex. séance du lundi 8 h–9 h, type « Cours », classe 401, matière « ANGLAIS LV1 ».
 */
import type { SessionResource } from './resources';

export interface SessionDraft {
  id?: number;
  subjectKey: string;
  audienceId: string;
  typeId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  published: boolean;
  description: string;
  room: string;
  courseId: string | null;
  rbsResourceIds: number[];
  resources: SessionResource[];
  teacherId?: string;
  /** Visa posé : la séance ne peut plus être supprimée. */
  hasVisa?: boolean;
}

export const TITLE_MAX = 50;
export const MIN_MINUTES = 15;
export const EXCEPTIONAL = 'exceptional';
export const SESSION_COLOR = '#00ab6f';

export type SessionError = 'subject' | 'audience' | 'type' | 'date' | 'start' | 'end' | 'duration' | 'title';

export const emptyDraft = (): SessionDraft => ({
  subjectKey: '',
  audienceId: '',
  typeId: '',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  published: false,
  description: '',
  room: '',
  courseId: null,
  rbsResourceIds: [],
  resources: [],
});

/** Clé de la liste des matières : l'identifiant, ou « exceptional:<libellé> » pour un intitulé libre. */
export const subjectKeyOf = (subjectId: string, exceptionalLabel?: string | null): string =>
  subjectId === EXCEPTIONAL ? `${EXCEPTIONAL}:${exceptionalLabel ?? ''}` : subjectId;

export const isExceptional = (key: string): boolean => key.startsWith(`${EXCEPTIONAL}:`);
export const exceptionalLabelOf = (key: string): string | undefined => (isExceptional(key) ? key.slice(EXCEPTIONAL.length + 1) : undefined);

export const minutesOf = (hm: string): number => (/^\d{1,2}:\d{2}/.test(hm) ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : NaN);

/** Heure d'un champ « HH:mm:ss » ou « HH:mm » → « HH:mm » (champ `time`). */
export const hhmm = (s?: string | null): string => (s ?? '').slice(0, 5);

/** Date d'une séance serveur (« 2026-09-05 00:00:00.000000+0200 ») → « AAAA-MM-JJ ». */
export const dayOf = (s?: string | null): string => (s ?? '').slice(0, 10);

/** Titre proposé quand le champ est vide : « Travail de la séance du 12/10/2026 ». */
export const titlePlaceholder = (date: string): string => {
  const [y, m, d] = date.split('-');
  return date ? `Travail de la séance du ${d}/${m}/${y}` : 'Travail de la séance';
};

export function validateSession(d: SessionDraft): SessionError[] {
  const errs: SessionError[] = [];
  if (!d.subjectKey) errs.push('subject');
  if (!d.audienceId) errs.push('audience');
  if (!d.typeId) errs.push('type');
  if (!d.date) errs.push('date');
  if (!d.startTime) errs.push('start');
  if (!d.endTime) errs.push('end');
  if (d.startTime && d.endTime && minutesOf(d.endTime) - minutesOf(d.startTime) < MIN_MINUTES) errs.push('duration');
  if (d.title.length > TITLE_MAX) errs.push('title');
  return errs;
}

/** Description en XHTML, comme DateUtils.htmlToXhtml (document complet sérialisé en XML). */
export function htmlToXhtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return new XMLSerializer().serializeToString(doc);
}

/** Corps de POST / PUT /diary/session, comme Session.toSendFormat. */
export function sessionPayload(d: SessionDraft, structureId: string) {
  const label = exceptionalLabelOf(d.subjectKey);
  return {
    id: d.id ?? null,
    subject_id: label !== undefined ? EXCEPTIONAL : d.subjectKey,
    ...(label !== undefined ? { exceptional_label: label } : {}),
    type_id: Number(d.typeId),
    structure_id: structureId,
    title: d.title.trim() || titlePlaceholder(d.date),
    color: SESSION_COLOR,
    date: d.date,
    start_time: `${d.startTime}:00`,
    end_time: `${d.endTime}:00`,
    description: htmlToXhtml(d.description),
    annotation: '',
    is_published: d.published,
    audience_id: d.audienceId,
    room: d.room,
    course_id: d.courseId,
    resources: d.resources,
    rbsResourceIds: d.rbsResourceIds,
    is_empty: false,
  };
}

/** Séance serveur (GET /diary/session/:id) → brouillon du formulaire. */
export function draftFromSession(s: {
  id: number;
  subject_id?: string;
  exceptional_label?: string | null;
  audience_id?: string;
  type_id?: number | null;
  title?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  is_published?: boolean;
  description?: string;
  room?: string;
  course_id?: string | null;
  rbsResourceIds?: number[];
  resources?: unknown;
  teacher_id?: string;
  one_visa?: boolean;
}): SessionDraft {
  let resources: SessionResource[] = [];
  if (Array.isArray(s.resources)) resources = s.resources as SessionResource[];
  else if (typeof s.resources === 'string') {
    try {
      resources = JSON.parse(s.resources) as SessionResource[];
    } catch {
      resources = [];
    }
  }
  return {
    id: s.id,
    subjectKey: subjectKeyOf(s.subject_id ?? '', s.exceptional_label),
    audienceId: s.audience_id ?? '',
    typeId: s.type_id != null ? String(s.type_id) : '',
    title: s.title ?? '',
    date: dayOf(s.date),
    startTime: hhmm(s.start_time),
    endTime: hhmm(s.end_time),
    published: !!s.is_published,
    description: s.description ?? '',
    room: s.room ?? '',
    courseId: s.course_id ?? null,
    rbsResourceIds: Array.isArray(s.rbsResourceIds) ? s.rbsResourceIds : [],
    resources,
    teacherId: s.teacher_id,
    hasVisa: !!s.one_visa,
  };
}

/**
 * Brouillon d'une séance créée depuis un cours de l'emploi du temps : date, horaires, classe, matière,
 * salle et réservations viennent du cours et ne se modifient pas (Session.createFromCourse).
 * Ex. cours de maths du lundi 8 h–9 h en 401 → séance pré-remplie.
 */
export function draftFromCourse(c: {
  _id: string;
  startDate: string;
  endDate: string;
  subjectId?: string;
  exceptionnal?: string;
  roomLabels?: string[];
  rbsResourceIds?: number[];
}, audienceId: string): SessionDraft {
  return {
    ...emptyDraft(),
    subjectKey: c.exceptionnal ? subjectKeyOf(EXCEPTIONAL, c.exceptionnal) : c.subjectId ?? '',
    audienceId,
    date: dayOf(c.startDate),
    startTime: c.startDate.slice(11, 16),
    endTime: c.endDate.slice(11, 16),
    room: (c.roomLabels ?? []).join(', '),
    courseId: c._id,
    rbsResourceIds: c.rbsResourceIds ?? [],
  };
}

/** Peut modifier : droit de gestion ET propriétaire de la séance (filtre SessionManage). */
export const canEditSession = (d: SessionDraft, userId: string, canManage: boolean): boolean => canManage && (!d.id || d.teacherId === userId);

/** Peut proposer une modification : droit de gestion sur la séance d'un collègue (D8). */
export const canProposeSession = (d: SessionDraft, userId: string, canManage: boolean): boolean => canManage && !!d.id && d.teacherId !== userId;

/** Suppression : propriétaire avec droit de gestion, séance sans visa. */
export const canDeleteSession = (d: SessionDraft, userId: string, canManage: boolean): boolean => canEditSession(d, userId, canManage) && !!d.id && !d.hasVisa;
