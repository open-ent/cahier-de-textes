// Client REST du module Cahier-de-textes (diary) — session ENT, même origine. XSRF sur mutations.
import type { CalendarCourse } from './calendarItems';
import type { CalendarOptions } from './period';

/** Matière ; `exceptional` : intitulé libre de l'établissement (id « exceptional »). */
export interface Subject {
  id: string;
  name: string;
  exceptional?: boolean;
}
/** Classe ou groupe ; `type_groupe` 0 classe, 1 groupe d'enseignement, 2 groupe manuel. */
export interface Klass {
  id: string;
  name: string;
  type_groupe?: number;
}
/** Type de séance (Cours, Autre…) ; le premier de rang > 0 est proposé par défaut. */
export interface SessionType {
  id: number;
  label: string;
  rank: number;
}
export interface HomeworkType {
  id: number;
  label: string;
  structure_id: string;
}

/** Créneau horaire du référentiel (pour la vue calendrier). */
export interface TimeSlot {
  id: string;
  name: string;
  startHour: string;
  endHour: string;
}

/** Un devoir (côté liste « own »). Dates « YYYY-MM-DD ». */
export interface Homework {
  id: number;
  subject_id: string;
  structure_id: string;
  audience_id: string;
  type_id?: number;
  due_date: string;
  description: string;
  color?: string;
  estimatedTime?: number;
  is_published?: boolean;
  teacher_id?: string;
  exceptional_label?: string;
  session_id?: number | null;
  from_session_id?: number | null;
  estimatedtime?: number;
  resources?: unknown;
  progress?: { state_label?: string } | null;
}

/** Devoir tel que le renvoie GET /diary/homework/:id (durée en minuscules côté SQL). */
export type HomeworkFull = Homework;

/** Corps de POST /diary/homework (cf. jsonschema/homework.json ; session_id peut être null). */
export interface HomeworkInput {
  subject_id: string;
  exceptional_label?: string;
  structure_id: string;
  audience_id: string;
  type_id: number;
  due_date: string;
  description: string;
  color: string;
  estimatedTime: number;
  is_published: boolean;
  session_id: null;
}

function xsrfHeader(): Record<string, string> {
  const m = typeof document !== 'undefined' ? document.cookie.match(/XSRF-TOKEN=([^;]+)/) : null;
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const base = { credentials: 'include' as const };
const jsonHeaders = { 'Content-Type': 'application/json' };
const mutHeaders = () => ({ ...jsonHeaders, ...xsrfHeader() });

// ── Établissement mémorisé (préférence partagée avec l'AngularJS) ─────────────────
export const getStructurePreference = async (): Promise<{ id?: string; name?: string }> => {
  const res = await fetch('/userbook/preference/cdt.structure', base);
  if (!res.ok) return {};
  const body = (await res.json().catch(() => null)) as { preference?: string } | null;
  if (!body?.preference) return {};
  try {
    return (JSON.parse(body.preference) as { id?: string; name?: string }) ?? {};
  } catch {
    return {};
  }
};

export const saveStructurePreference = async (structure: { id: string; name: string }): Promise<void> => {
  await fetch('/userbook/preference/cdt.structure', { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(structure) });
};

// ── Référentiel (mêmes routes que l'AngularJS) ──────────────────────────────────────
/**
 * Matières de l'établissement (`/directory/timetable/subjects`, model/subject.ts) puis intitulés
 * libres (`/diary/subjects/exceptional`). Ex. « ANGLAIS LV1 », puis « Sortie théâtre » (libre).
 */
export const getSubjects = async (structureId: string, teacherId?: string): Promise<Subject[]> => {
  const url = `/directory/timetable/subjects/${structureId}${teacherId ? `?teacherId=${teacherId}` : ''}`;
  const raw = await json<Array<{ subjectId: string; subjectLabel: string }>>(await fetch(url, base));
  const seen = new Set<string>();
  const subjects: Subject[] = [];
  for (const s of raw ?? []) {
    if (seen.has(s.subjectId)) continue;
    seen.add(s.subjectId);
    subjects.push({ id: s.subjectId, name: s.subjectLabel });
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const exceptional = await json<{ values?: string[] }>(await fetch(`/diary/subjects/exceptional/${structureId}`, base)).catch(() => ({ values: [] }));
  for (const label of exceptional?.values ?? []) subjects.push({ id: 'exceptional', name: label, exceptional: true });
  return subjects;
};

/**
 * Classes et groupes (model/audience.ts) : `isEdt=true`, et `isTeacherEdt=true` sauf élève ou
 * parent ; triés par nature puis par nom.
 */
export const getClasses = async (structureId: string, studentOrRelative = false): Promise<Klass[]> =>
  json<Array<{ id: string; name: string; type_groupe?: number }>>(
    await fetch(`/viescolaire/classes?idEtablissement=${structureId}&isEdt=true${studentOrRelative ? '' : '&isTeacherEdt=true'}`, base),
  ).then((arr) =>
    (arr ?? [])
      .map((c) => ({ id: c.id, name: c.name, type_groupe: c.type_groupe }))
      .sort((a, b) => (a.type_groupe ?? 0) - (b.type_groupe ?? 0) || a.name.localeCompare(b.name, 'fr', { numeric: true })),
  );

/** Séance telle que la renvoie GET /diary/session/:id. */
export interface SessionFull extends Session {
  type_id?: number | null;
  course_id?: string | null;
  rbsResourceIds?: number[];
  resources?: unknown;
  one_visa?: boolean;
  homeworks?: Homework[];
  from_homeworks?: Homework[];
}

/** Types de séance de l'établissement (GET /diary/session-types). */
export const getSessionTypes = async (structureId: string): Promise<SessionType[]> =>
  json<SessionType[]>(await fetch(`/diary/session-types?idStructure=${structureId}`, base)).then((a) => (a ?? []).sort((x, y) => x.rank - y.rank));

/** Type proposé par défaut : le premier de rang > 0 (manageSession.ts:857-859). */
export const defaultSessionType = (types: SessionType[]): SessionType | undefined => types.find((t) => t.rank > 0) ?? types[0];

/** Année scolaire de l'établissement (vie scolaire), bornes « AAAA-MM-JJ ». */
export const getSchoolYear = async (structureId: string): Promise<{ start: string; end: string } | null> => {
  const res = await fetch(`/viescolaire/settings/periode/schoolyear?structureId=${structureId}`, base);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { start_date?: string; end_date?: string } | null;
  return body?.start_date && body.end_date ? { start: body.start_date.slice(0, 10), end: body.end_date.slice(0, 10) } : null;
};

export const getHomeworkTypes = async (structureId: string): Promise<HomeworkType[]> =>
  json<HomeworkType[]>(await fetch(`/diary/homework-types/${structureId}`, base));

/** Crée un type de devoir (POST /diary/homework-type). */
export const createHomeworkType = async (structureId: string, label: string): Promise<{ id: number }> =>
  json<{ id: number }>(
    await fetch('/diary/homework-type', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify({ structure_id: structureId, label }) }),
  );

/** Supprime un type de devoir (DELETE /diary/homework-type/:id/:idStructure). */
export const deleteHomeworkType = async (id: number, structureId: string): Promise<void> => {
  const res = await fetch(`/diary/homework-type/${id}/${structureId}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

/** Créneaux horaires de l'établissement (`/viescolaire/structures/:id/time-slot`), triés. */
export const getTimeSlots = async (structureId: string): Promise<TimeSlot[]> =>
  json<{ slots?: Array<{ _id: string; name: string; startHour: string; endHour: string }> }>(await fetch(`/viescolaire/structures/${structureId}/time-slot`, base))
    .then((g) => (g?.slots ?? []).map((x) => ({ id: x._id, name: x.name, startHour: x.startHour, endHour: x.endHour })))
    .then((arr) => [...arr].sort((a, b) => (a.startHour || '').localeCompare(b.startHour || '')))
    .catch(() => []);

// ── Cours de l'emploi du temps (vie scolaire) ──────────────────────────────────────
/**
 * Cours d'une période (`/viescolaire/common/courses`, course.service.ts) : par enseignant
 * (`teacherId`) ou par classe / groupe (`group`, nom). Ex. cours de l'enseignant du lundi au vendredi.
 */
export const getCourses = async (
  structureId: string,
  start: string,
  end: string,
  filter: { teacherIds?: string[]; groups?: string[] },
): Promise<CalendarCourse[]> => {
  const params = [...(filter.teacherIds ?? []).map((id) => `teacherId=${encodeURIComponent(id)}`), ...(filter.groups ?? []).map((g) => `group=${encodeURIComponent(g)}`)];
  if (params.length === 0) return [];
  return json<CalendarCourse[]>(await fetch(`/viescolaire/common/courses/${structureId}/${start}/${end}?${params.join('&')}`, base)).then((a) => a ?? []);
};

// ── Options d'affichage du calendrier (préférence partagée avec l'AngularJS) ───────────
/** Préférence `calendarOptions` du socle AngularJS : quarts d'heure, samedi, dimanche. */
export const getCalendarOptions = async (): Promise<CalendarOptions> => {
  const res = await fetch('/userbook/preference/calendarOptions', base);
  if (!res.ok) return {};
  const body = (await res.json().catch(() => null)) as { preference?: string } | null;
  if (!body?.preference) return {};
  try {
    return (JSON.parse(body.preference) as CalendarOptions) ?? {};
  } catch {
    return {};
  }
};

export const saveCalendarOptions = async (options: CalendarOptions): Promise<void> => {
  await fetch('/userbook/preference/calendarOptions', { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(options) });
};

/** Publie un devoir (POST /diary/homework/publish/:id). */
export const publishHomework = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/homework/publish/${id}`, { ...base, method: 'POST', headers: mutHeaders(), body: '{}' });
  if (!res.ok) throw new Error(String(res.status));
};

// ── Devoirs ────────────────────────────────────────────────────────────────────
export const getOwnHomeworks = async (start: string, end: string, structureId: string): Promise<Homework[]> =>
  json<Homework[]>(await fetch(`/diary/homeworks/own/${start}/${end}/${structureId}`, base));

/**
 * Devoirs d'un enseignant pour un personnel (direction, vie scolaire) : routes « external », comme
 * l'AngularJS. La route « own » ne renvoie rien à ce profil. Ex. le chef lit ses propres devoirs.
 */
export const getExternalHomeworks = async (start: string, end: string, teacherId: string): Promise<Homework[]> =>
  json<Homework[]>(await fetch(`/diary/homeworks/external/${start}/${end}?teacherId=${teacherId}`, base)).then((a) => a ?? []).catch(() => []);

export const createHomework = async (body: HomeworkInput): Promise<{ id: number }> =>
  json<{ id: number }>(await fetch('/diary/homework', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(body) }));

/** Crée un devoir avec le corps complet de l'AngularJS (homeworkForm.homeworkPayload). */
export const saveHomework = async (body: Record<string, unknown>): Promise<{ id: number }> =>
  json<{ id: number }>(await fetch('/diary/homework', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(body) }));

/**
 * Modifie un devoir (PUT /diary/homework/:id/:publicationStateChanged). Le serveur remplace tous les
 * champs, ressources comprises : envoyer l'objet complet. `publicationStateChanged` à true date la
 * publication et prévient les élèves.
 */
export const updateHomework = async (id: number, publicationStateChanged: boolean, body: Record<string, unknown>): Promise<void> => {
  const res = await fetch(`/diary/homework/${id}/${publicationStateChanged}`, { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
};

/** Charge de travail de la semaine de `dueDate` pour une classe : une entrée par jour {day, count, total}. */
export const getWorkload = async (structureId: string, audienceId: string, dueDate: string, published: boolean): Promise<Array<{ day: string; count: number | string; total: number | string }>> =>
  json<Array<{ day: string; count: number | string; total: number | string }>>(await fetch(`/diary/workload/${structureId}/${audienceId}/${dueDate}/${published}`, base)).then((a) => a ?? []).catch(() => []);

/**
 * Devoir complet. Pour un élève, `/diary/homework/:id/:studentId` : seule cette route renvoie son
 * état « fait » (`progress`), comme l'AngularJS (homework.ts).
 */
export const getHomework = async (id: number, studentId?: string): Promise<HomeworkFull> =>
  json<HomeworkFull>(await fetch(studentId ? `/diary/homework/${id}/${studentId}` : `/diary/homework/${id}`, base));

/** Marque un devoir « fait » ou « à faire » (POST /diary/homework/progress/:id/done|todo), côté élève. */
export const setHomeworkProgress = async (id: number, state: 'done' | 'todo'): Promise<void> => {
  const res = await fetch(`/diary/homework/progress/${id}/${state}`, { ...base, method: 'POST', headers: mutHeaders(), body: '{}' });
  if (!res.ok) throw new Error(String(res.status));
};

export const deleteHomework = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/homework/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Séances (sessions du cahier de textes) ───────────────────────────────────────
/** Une séance (leçon) du cahier de textes. Date « YYYY-MM-DD HH:mm:ss± ». */
export interface Session {
  id: number;
  subject_id: string;
  structure_id: string;
  audience_id: string;
  teacher_id?: string;
  title: string;
  room?: string;
  color?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  annotation?: string;
  is_published?: boolean;
  exceptional_label?: string;
}

/**
 * Corps de POST /diary/session (jsonschema/session.json + champs lus par le SQL), comme
 * Session.toSendFormat en AngularJS : `course_id` null hors cours de l'emploi du temps (une
 * chaîne vide désactive la réservation de salle), `is_empty` false (sinon séance « vide »),
 * `type_id` obligatoire côté IHM.
 */
export interface SessionInput {
  title: string;
  subject_id: string;
  exceptional_label?: string;
  structure_id: string;
  audience_id: string;
  type_id: number;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  color: string;
  course_id: string | null;
  is_empty: false;
  is_published: boolean;
}

/** Séances de l'enseignant courant sur une période (GET /diary/sessions/own/:start/:end/:structureId). */
export const getOwnSessions = async (start: string, end: string, structureId: string): Promise<Session[]> =>
  json<Session[]>(await fetch(`/diary/sessions/own/${start}/${end}/${structureId}`, base)).then((a) => a ?? []).catch(() => []);

/** Séances d'un enseignant pour un personnel (route « external », comme l'AngularJS). */
export const getExternalSessions = async (start: string, end: string, teacherId: string): Promise<Session[]> =>
  json<Session[]>(await fetch(`/diary/sessions/external/${start}/${end}?teacherId=${teacherId}`, base)).then((a) => a ?? []).catch(() => []);

/** Crée une séance (POST /diary/session). */
export const createSession = async (body: SessionInput): Promise<{ id: number }> =>
  json<{ id: number }>(await fetch('/diary/session', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(body) }));

/** Séance complète (GET /diary/session/:id), avec ressources, réservations et devoirs. */
export const getSession = async (id: number): Promise<SessionFull> => json<SessionFull>(await fetch(`/diary/session/${id}`, base));

/**
 * Modifie une séance (PUT /diary/session/:id). Le serveur REMPLACE tous les champs, ressources et
 * réservations comprises : envoyer l'objet complet (sessionForm.sessionPayload). Renvoie les
 * réservations refusées (`rbsConflictResourceIds`), la séance restant enregistrée.
 */
export const updateSession = async (id: number, body: Record<string, unknown>): Promise<{ rbsConflictResourceIds?: number[] }> =>
  json<{ rbsConflictResourceIds?: number[] } | null>(await fetch(`/diary/session/${id}`, { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(body) })).then((r) => r ?? {});

/** Supprime une séance (DELETE /diary/session/:id) ; refusé par le serveur si un visa est posé. */
export const deleteSession = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/session/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

/** Ressources réservables de l'établissement (salles, matériel), avec leur type en clair. */
export interface RbsResource {
  id: number;
  name: string;
  typeName: string;
}
export const getRbsResources = async (structureId: string): Promise<RbsResource[]> => {
  const data = await json<{ types?: Array<{ id: number; name: string }>; resources?: Array<{ id: number; name: string; type_id: number }> } | null>(
    await fetch(`/diary/structures/${structureId}/rbs/resources`, base),
  ).catch(() => null);
  const typeName = new Map((data?.types ?? []).map((t) => [t.id, t.name]));
  return (data?.resources ?? []).map((r) => ({ id: r.id, name: r.name, typeName: typeName.get(r.type_id) ?? '' }));
};

const MEDIACENTRE_SOURCES = [
  'fr.openent.mediacentre.source.GAR',
  'fr.openent.mediacentre.source.Signet',
  'fr.openent.mediacentre.source.Moodle',
  'fr.openent.mediacentre.source.PMB',
];

/** Recherche plein texte dans le médiacentre ; une trame par source (cf. parseMediacentreFrames). */
export const searchMediacentre = async (query: string): Promise<unknown[]> => {
  const jsondata = JSON.stringify({ state: 'PLAIN_TEXT', event: 'search', sources: MEDIACENTRE_SOURCES, data: { query } });
  const res = await fetch(`/mediacentre/search?jsondata=${encodeURIComponent(jsondata)}`, base);
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as unknown[] | null;
  return Array.isArray(body) ? body : [];
};

/** Publie une séance (visible des élèves) — POST /diary/session/publish/:id. */
export const publishSession = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/session/publish/${id}`, { ...base, method: 'POST', headers: mutHeaders(), body: '{}' });
  if (!res.ok) throw new Error(String(res.status));
};

/** Dépublie une séance — POST /diary/session/unpublish/:id. */
export const unpublishSession = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/session/unpublish/${id}`, { ...base, method: 'POST', headers: mutHeaders(), body: '{}' });
  if (!res.ok) throw new Error(String(res.status));
};

// ── Progressions (séquences pédagogiques) ────────────────────────────────────────
/** Une progression (séquence) aplatie, avec le dossier parent résolu. */
export interface Progression {
  id: number;
  title: string;
  description: string;
  className: string;
  subjectLabel: string;
  folder: string;
  modified?: string;
}

/** Corps de création d'une progression (POST /diary/progression/create). */
export interface ProgressionInput {
  title: string;
  description: string;
  owner_id: string;
  subjectLabel?: string;
  class?: string;
  /** Pluriel : c'est le nom lu par le serveur (le schéma déclare à tort le singulier). */
  progression_homeworks?: unknown[];
  progression_folder_id?: number | null;
}

/**
 * Aplati la réponse « dossiers » de /diary/progressions/:ownerId. Chaque dossier porte un
 * champ `progressions` qui est une **chaîne JSON** (piège backend) à parser.
 */
export function flattenProgressions(folders: Array<{ title?: string | null; progressions?: string | null }>): Progression[] {
  const out: Progression[] = [];
  for (const folder of folders ?? []) {
    let list: Array<Record<string, unknown>> = [];
    try {
      list = folder.progressions ? JSON.parse(folder.progressions) : [];
    } catch {
      list = [];
    }
    for (const p of list) {
      if (!p || p.id == null) continue;
      out.push({
        id: Number(p.id),
        title: String(p.title ?? ''),
        description: String(p.description ?? ''),
        className: String(p.class ?? ''),
        subjectLabel: String(p.subject_label ?? ''),
        folder: folder.title ?? '',
        modified: (p.modified as string) ?? undefined,
      });
    }
  }
  return out;
}

/** Progressions de l'utilisateur (GET /diary/progressions/:ownerId), aplaties. */
export const getProgressions = async (ownerId: string): Promise<Progression[]> =>
  json<Array<{ title?: string | null; progressions?: string | null }>>(await fetch(`/diary/progressions/${ownerId}`, base))
    .then((folders) => flattenProgressions(folders ?? []))
    .catch(() => []);

/** Crée une progression (POST /diary/progression/create). */
export const createProgression = async (body: ProgressionInput): Promise<{ id: number }> =>
  json<{ id: number }>(await fetch('/diary/progression/create', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(body) }));

export const api = {
  getHomework,
  setHomeworkProgress,
  saveHomework,
  updateHomework,
  getWorkload,
  getSession,
  updateSession,
  deleteSession,
  getRbsResources,
  searchMediacentre,
  getCourses,
  getCalendarOptions,
  saveCalendarOptions,
  publishHomework,
  getStructurePreference,
  saveStructurePreference,
  getSessionTypes,
  getSchoolYear,
  getSubjects,
  getClasses,
  getHomeworkTypes,
  createHomeworkType,
  deleteHomeworkType,
  getTimeSlots,
  getOwnHomeworks,
  getExternalHomeworks,
  getExternalSessions,
  createHomework,
  deleteHomework,
  getOwnSessions,
  createSession,
  publishSession,
  unpublishSession,
  getProgressions,
  createProgression,
};
