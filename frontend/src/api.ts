// Client REST du module Cahier-de-textes (diary) — session ENT, même origine. XSRF sur mutations.

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
}

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
