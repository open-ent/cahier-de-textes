// Client REST du module Cahier-de-textes (diary) — session ENT, même origine. XSRF sur mutations.

export interface Subject {
  id: string;
  name: string;
}
export interface Klass {
  id: string;
  name: string;
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
}

/** Corps de POST /diary/homework (cf. jsonschema/homework.json ; session_id peut être null). */
export interface HomeworkInput {
  subject_id: string;
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

// ── Référentiel (matières, classes, types) ────────────────────────────────────
export const getSubjects = async (structureId: string): Promise<Subject[]> =>
  json<Array<{ id: string; name: string }>>(await fetch(`/diary/timetableSubjects/${structureId}`, base)).then((arr) =>
    arr.map((s) => ({ id: s.id, name: s.name })),
  );

export const getClasses = async (structureId: string): Promise<Klass[]> =>
  json<Array<{ id: string; name: string }>>(await fetch(`/viescolaire/classes?idEtablissement=${structureId}`, base)).then((arr) =>
    arr.map((c) => ({ id: c.id, name: c.name })),
  );

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

/** Créneaux horaires (pour la vue calendrier), triés par heure de début. */
export const getTimeSlots = async (structureId: string): Promise<TimeSlot[]> =>
  json<TimeSlot[]>(await fetch(`/edt/time-slots?structureId=${structureId}`, base))
    .then((arr) => [...arr].sort((a, b) => (a.startHour || '').localeCompare(b.startHour || '')))
    .catch(() => []);

// ── Devoirs ────────────────────────────────────────────────────────────────────
export const getOwnHomeworks = async (start: string, end: string, structureId: string): Promise<Homework[]> =>
  json<Homework[]>(await fetch(`/diary/homeworks/own/${start}/${end}/${structureId}`, base));

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
}

/** Corps de POST /diary/session (cf. jsonschema/session.json, tous requis). */
export interface SessionInput {
  title: string;
  subject_id: string;
  structure_id: string;
  audience_id: string;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  color: string;
  course_id: string;
}

/** Séances de l'enseignant courant sur une période (GET /diary/sessions/own/:start/:end/:structureId). */
export const getOwnSessions = async (start: string, end: string, structureId: string): Promise<Session[]> =>
  json<Session[]>(await fetch(`/diary/sessions/own/${start}/${end}/${structureId}`, base)).then((a) => a ?? []).catch(() => []);

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
  progression_homework?: unknown[];
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
  getSubjects,
  getClasses,
  getHomeworkTypes,
  createHomeworkType,
  deleteHomeworkType,
  getTimeSlots,
  getOwnHomeworks,
  createHomework,
  deleteHomework,
  getOwnSessions,
  createSession,
  publishSession,
  unpublishSession,
  getProgressions,
  createProgression,
};
