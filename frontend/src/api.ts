// Client REST du module Cahier-de-textes (diary) — session ENT, même origine. XSRF sur mutations.
import type { CalendarCourse } from './calendarItems';
import type { CalendarOptions } from './period';
import type { ArchivePage } from './archives';
import type { Notebook, NotebookContent, NotebookPage } from './notebooks';
import type { RawFolder } from './progressions';
import { externalQuery, ownQuery, type Scope, type SearchClass, type SearchTeacher } from './searchScope';

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

// ── Lecture par périmètre (own / external / child), recherches et enfants ──────────────────
/** Enfant d'un parent (GET /diary/children/list). */
export interface Child {
  id: string;
  displayName: string;
  classId?: string;
  className?: string;
  structureId?: string;
}
export const getChildren = async (): Promise<Child[]> => json<Child[]>(await fetch('/diary/children/list', base)).then((a) => a ?? []);

/** Recherche d'enseignants (`/diary/search/users`) : nom ou prénom. Ex. « bat » → BATTISTI001 Anic. */
export const searchTeachers = async (structureId: string, q: string): Promise<SearchTeacher[]> =>
  json<SearchTeacher[]>(await fetch(`/diary/search/users?structureId=${structureId}&profile=Teacher&q=${encodeURIComponent(q.toLowerCase())}&field=firstName&field=lastName`, base)).then((a) => a ?? []).catch(() => []);

/** Recherche de classes et groupes (`/diary/search/groups`) par nom. Ex. « 40 » → 401, 402. */
export const searchClasses = async (structureId: string, q: string): Promise<SearchClass[]> =>
  json<SearchClass[]>(await fetch(`/diary/search/groups?structureId=${structureId}&q=${encodeURIComponent(q.toLowerCase())}&field=name`, base)).then((a) => a ?? []).catch(() => []);

/** Séances du périmètre : own, external, child ; rien si aucun enfant n'est choisi (parent). */
export const readSessions = async (scope: Scope, start: string, end: string, structureId: string, subjectId?: string): Promise<Session[]> => {
  if (scope.mode === 'none') return [];
  const url =
    scope.mode === 'child'
      ? `/diary/sessions/child/${start}/${end}/${scope.childId}${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`
      : scope.mode === 'external'
        ? `/diary/sessions/external/${start}/${end}?${externalQuery(scope.teacherId, scope.audienceIds, subjectId)}`
        : `/diary/sessions/own/${start}/${end}/${structureId}?${ownQuery(scope.audienceIds, subjectId)}`;
  return json<Session[]>(await fetch(url, base)).then((a) => a ?? []);
};

/** Devoirs du périmètre : own, external, child (enfant + établissement). */
export const readHomeworks = async (scope: Scope, start: string, end: string, structureId: string, subjectId?: string): Promise<Homework[]> => {
  if (scope.mode === 'none') return [];
  const url =
    scope.mode === 'child'
      ? `/diary/homeworks/child/${start}/${end}/${scope.childId}/${structureId}${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`
      : scope.mode === 'external'
        ? `/diary/homeworks/external/${start}/${end}?${externalQuery(scope.teacherId, scope.audienceIds, subjectId)}`
        : `/diary/homeworks/own/${start}/${end}/${structureId}?${ownQuery(scope.audienceIds, subjectId)}`;
  return json<Homework[]>(await fetch(url, base)).then((a) => a ?? []);
};

// ── Devoirs ────────────────────────────────────────────────────────────────────
export const getOwnHomeworks = async (start: string, end: string, structureId: string, subjectId?: string): Promise<Homework[]> =>
  json<Homework[]>(await fetch(`/diary/homeworks/own/${start}/${end}/${structureId}${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`, base));

/**
 * Devoirs d'un enseignant pour un personnel (direction, vie scolaire) : routes « external », comme
 * l'AngularJS. La route « own » ne renvoie rien à ce profil. Ex. le chef lit ses propres devoirs.
 */
export const getExternalHomeworks = async (start: string, end: string, teacherId: string, subjectId?: string): Promise<Homework[]> =>
  json<Homework[]>(await fetch(`/diary/homeworks/external/${start}/${end}?teacherId=${teacherId}${subjectId ? `&subjectId=${encodeURIComponent(subjectId)}` : ''}`, base)).then((a) => a ?? []);

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
  json<Array<{ day: string; count: number | string; total: number | string }>>(await fetch(`/diary/workload/${structureId}/${audienceId}/${dueDate}/${published}`, base)).then((a) => a ?? []);

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
export const getOwnSessions = async (start: string, end: string, structureId: string, subjectId?: string): Promise<Session[]> =>
  json<Session[]>(await fetch(`/diary/sessions/own/${start}/${end}/${structureId}${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`, base)).then((a) => a ?? []);

/** Séances d'un enseignant pour un personnel (route « external », comme l'AngularJS). */
export const getExternalSessions = async (start: string, end: string, teacherId: string, subjectId?: string): Promise<Session[]> =>
  json<Session[]>(await fetch(`/diary/sessions/external/${start}/${end}?teacherId=${teacherId}${subjectId ? `&subjectId=${encodeURIComponent(subjectId)}` : ''}`, base)).then((a) => a ?? []);

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
    .then((folders) => flattenProgressions(folders ?? []));

/** Crée une progression (POST /diary/progression/create). */
export const createProgression = async (body: ProgressionInput): Promise<{ id: number }> =>
  json<{ id: number }>(await fetch('/diary/progression/create', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(body) }));

/** Dossiers et séances modèles d'un enseignant (GET /diary/progressions/:ownerId), lignes brutes. */
export const getProgressionFolders = async (ownerId: string): Promise<RawFolder[]> => json<RawFolder[]>(await fetch(`/diary/progressions/${ownerId}`, base));

/** Une séance modèle avec ses devoirs (GET /diary/progression/:id) ; le serveur renvoie un tableau d'une ligne. */
export const getProgression = async (id: number): Promise<Record<string, unknown> | null> =>
  json<Array<Record<string, unknown>>>(await fetch(`/diary/progression/${id}`, base)).then((a) => a?.[0] ?? null);

/** Crée (sans `id`) ou met à jour (avec `id`) une séance modèle ; renvoie son identifiant. */
export const saveProgression = async (id: number | null, body: unknown): Promise<{ id: number }> =>
  json<{ id: number }>(
    await fetch(id ? `/diary/progression/update/${id}` : '/diary/progression/create', { ...base, method: id ? 'PUT' : 'POST', headers: mutHeaders(), body: JSON.stringify(body) }),
  );

/** Supprime des séances modèles — DELETE /diary/progressions. */
export const deleteProgressions = async (ownerId: string, ids: number[]): Promise<void> => {
  const res = await fetch('/diary/progressions', { ...base, method: 'DELETE', headers: mutHeaders(), body: JSON.stringify({ owner_id: ownerId, session_ids: ids }) });
  if (!res.ok) throw new Error(String(res.status));
};

/** Supprime des dossiers — DELETE /diary/progression/folders. */
export const deleteProgressionFolders = async (ownerId: string, ids: number[]): Promise<void> => {
  const res = await fetch('/diary/progression/folders', { ...base, method: 'DELETE', headers: mutHeaders(), body: JSON.stringify({ owner_id: ownerId, folder_ids: ids }) });
  if (!res.ok) throw new Error(String(res.status));
};

/** Crée (sans `id`) ou modifie un dossier ; `parentId` nul = à la racine. */
export const saveProgressionFolder = async (id: number | null, ownerId: string, title: string, parentId: number | null): Promise<{ id: number }> =>
  json<{ id: number }>(
    await fetch(id ? `/diary/progression/folder/update/${id}` : '/diary/progression/folder/create', {
      ...base,
      method: id ? 'PUT' : 'POST',
      headers: mutHeaders(),
      body: JSON.stringify({ owner_id: ownerId, title, parent_id: parentId }),
    }),
  );

/** Supprime un devoir d'une séance modèle — DELETE /diary/progression/homework/:id. */
export const deleteProgressionHomework = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/progression/homework/${id}`, { ...base, method: 'DELETE', headers: mutHeaders() });
  if (!res.ok) throw new Error(String(res.status));
};

/** Proposition de modification d'une séance par un collègue (statut 1 en attente, 2 acceptée, 3 refusée). */
export interface SessionModificationItem {
  id: number;
  session_id: number | null;
  teacher_id: string;
  proposed_by: string;
  status: number;
  refusal_reason?: string | null;
  created?: string;
}

/**
 * Propose une modification de la séance d'un collègue. `teacherId` est aussi passé dans l'adresse :
 * le filtre serveur le lit dans les paramètres de la requête, pas dans le corps (sans cela : 403).
 */
export const proposeSessionModification = async (v: { sessionId: number; date: string; structureId: string; teacherId: string; payload: Record<string, unknown> }): Promise<{ id: number }> =>
  json<{ id: number }>(
    await fetch(`/diary/session/modification?teacherId=${encodeURIComponent(v.teacherId)}`, { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify({ sessionId: v.sessionId, courseId: null, date: v.date, structureId: v.structureId, teacherId: v.teacherId, payload: v.payload }) }),
  );

/** Propositions faites sur une séance, les plus récentes d'abord. */
export const getSessionModifications = async (sessionId: number): Promise<SessionModificationItem[]> =>
  json<SessionModificationItem[]>(await fetch(`/diary/session/${sessionId}/modifications`, base)).then((a) => a ?? []);

/** Accepte (statut 2, la séance est mise à jour) ou refuse (statut 3, motif facultatif) une proposition. */
export const processSessionModification = async (id: number, accept: boolean, reason?: string): Promise<void> => {
  const res = await fetch(`/diary/session/modification/${id}/process`, {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(accept ? { status: 2 } : { status: 3, refusalReason: reason?.trim() || null }),
  });
  if (!res.ok) throw new Error(String(res.status));
};

// ── Cahiers de textes, visas et PDF ─────────────────────────────────────────────────
/** Cahiers (page `page` du filtre, ou tous si la requête n'a pas de page) — GET /diary/notebooks. */
export const getNotebooks = async (query: string): Promise<NotebookPage> => json<NotebookPage>(await fetch(`/diary/notebooks?${query}`, base));

/** Séances et devoirs d'un cahier — GET /diary/notebooks/sessions/homeworks. */
export const getNotebookContents = async (query: string): Promise<NotebookContent[]> =>
  json<NotebookContent[]>(await fetch(`/diary/notebooks/sessions/homeworks?${query}`, base)).then((a) => a ?? []);

/** Visa existants sur des séances et devoirs — GET /diary/visas. */
export interface VisaRow {
  id: number;
  comment?: string | null;
  created: string;
  owner_name?: string | null;
}
export const getVisas = async (structureId: string, sessionIds: number[], homeworkIds: number[]): Promise<VisaRow[]> => {
  const p = new URLSearchParams({ structure_id: structureId });
  sessionIds.forEach((id) => p.append('session_id', String(id)));
  homeworkIds.forEach((id) => p.append('homework_id', String(id)));
  return json<VisaRow[]>(await fetch(`/diary/visas?${p.toString()}`, base)).then((a) => a ?? []);
};

/** Crée des visas (un par cahier) ; `mass` : sélection de tout le filtre, droit distinct. */
export const createVisas = async (mass: boolean, structureId: string, visas: unknown[]): Promise<void> => {
  const res = await fetch(mass ? '/diary/visas/mass' : '/diary/visas', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify({ structure_id: structureId, visas }) });
  if (!res.ok) throw new Error(String(res.status));
};

/** PDF d'un cahier (sans l'enregistrer) — POST /diary/visas/topdf ; renvoie le fichier et son nom. */
export const visaToPdf = async (visa: unknown): Promise<{ blob: Blob; filename: string }> => {
  const res = await fetch('/diary/visas/topdf', { ...base, method: 'POST', headers: { ...mutHeaders(), Accept: 'application/pdf' }, body: JSON.stringify({ visas: visa }) });
  if (!res.ok) throw new Error(String(res.status));
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  return { blob: await res.blob(), filename: name ? decodeURIComponent(name) : 'cahier-de-textes.pdf' };
};

// ── Archives des cahiers de textes ──────────────────────────────────────────────────
/** Années scolaires archivées de l'établissement, la plus récente d'abord. */
export const getArchiveYears = async (structureId: string): Promise<string[]> =>
  json<{ archiveSchoolYears?: string[] }>(await fetch(`/diary/structures/${structureId}/notebooks/archives/periods`, base)).then((r) => r?.archiveSchoolYears ?? []);

export const getArchives = async (structureId: string, query: string): Promise<ArchivePage> => json<ArchivePage>(await fetch(`/diary/structures/${structureId}/notebooks/archives?${query}`, base));

/** Enseignants (droit de recherche d'enseignants) et classes ayant des archives, par fragment de nom. */
export const searchArchiveTeachers = async (structureId: string, q: string): Promise<string[]> =>
  json<{ teacherNames?: string[] }>(await fetch(`/diary/structures/${structureId}/notebooks/archives/teachers/${encodeURIComponent(q)}`, base)).then((r) => r?.teacherNames ?? []).catch(() => []);
export const searchArchiveAudiences = async (structureId: string, q: string): Promise<string[]> =>
  json<{ audienceNames?: string[] }>(await fetch(`/diary/structures/${structureId}/notebooks/archives/audiences/${encodeURIComponent(q)}`, base)).then((r) => r?.audienceNames ?? []).catch(() => []);

// ── Choix d'IHM (bascule AngularJS → React) ──────────────────────────────────────────
/**
 * Préférence `diaryUi` : choix d'interface + état des bandeaux qui le proposent. Le serveur lit `ui`
 * pour servir la bonne vue (DiaryController#preferredUi). Pas de tiret dans la clé : entcore retire
 * les caractères non alphanumériques. Ex. `{ ui: 'react', invitationShown: 2, returnShown: 1 }`.
 */
export interface UiPreference {
  ui?: 'react' | 'angular';
  invitationDismissed?: boolean;
  invitationShown?: number;
  returnDismissed?: boolean;
  returnShown?: number;
  feedback?: string;
  feedbackAt?: string;
}

export const getUiPreference = async (): Promise<UiPreference> => {
  const res = await fetch('/userbook/preference/diaryUi', base);
  if (!res.ok) return {};
  // L'enveloppe est `{ preference: "<json>" }` — une chaîne, pas un objet.
  const body = (await res.json().catch(() => null)) as { preference?: string } | null;
  if (!body?.preference) return {};
  try {
    return (JSON.parse(body.preference) as UiPreference) ?? {};
  } catch {
    return {};
  }
};

export const saveUiPreference = async (preference: UiPreference): Promise<void> => {
  await fetch('/userbook/preference/diaryUi', { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(preference) });
};

export const api = {
  getChildren,
  searchTeachers,
  searchClasses,
  readSessions,
  readHomeworks,
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
  getUiPreference,
  saveUiPreference,
  getNotebooks,
  getArchiveYears,
  getArchives,
  searchArchiveTeachers,
  searchArchiveAudiences,
  getNotebookContents,
  getVisas,
  createVisas,
  visaToPdf,
  proposeSessionModification,
  getSessionModifications,
  processSessionModification,
  getProgressionFolders,
  getProgression,
  saveProgression,
  deleteProgressions,
  deleteProgressionFolders,
  saveProgressionFolder,
  deleteProgressionHomework,
  createProgression,
};
