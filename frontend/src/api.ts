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

// ── Devoirs ────────────────────────────────────────────────────────────────────
export const getOwnHomeworks = async (start: string, end: string, structureId: string): Promise<Homework[]> =>
  json<Homework[]>(await fetch(`/diary/homeworks/own/${start}/${end}/${structureId}`, base));

export const createHomework = async (body: HomeworkInput): Promise<{ id: number }> =>
  json<{ id: number }>(await fetch('/diary/homework', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(body) }));

export const deleteHomework = async (id: number): Promise<void> => {
  const res = await fetch(`/diary/homework/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

export const api = {
  getSubjects,
  getClasses,
  getHomeworkTypes,
  getOwnHomeworks,
  createHomework,
  deleteHomework,
};
