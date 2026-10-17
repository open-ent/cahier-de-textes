// Cahiers de textes (vue « administration » : direction, inspection, enseignant) : cahiers, contenus,
// visas et PDF, comme l'IHM AngularJS (globalAdmin.ts, model/visa.ts, services/NotebookService.ts).
// Fonctions pures, testées dans notebooks.test.ts.
import { htmlToXhtml } from './sessionForm';

/** Un cahier : séances et devoirs d'un enseignant pour une matière et une classe. */
export interface Notebook {
  notebook_id: string | null;
  id: number | null;
  subject: { id: string; name: string | null };
  exceptional_label?: string | null;
  teacher: { id: string; displayName: string; firstName?: string; lastName?: string };
  audience: { id: string; name: string };
  sessions: number | null;
  modified: string;
  /** Visas du cahier : « date~~viseur~~type » séparés par « §§ » (chaîne SQL, à découper). */
  visas_detail?: string | null;
  visa?: string | null;
}

export interface NotebookPage {
  all: Notebook[];
  page: number;
  page_count: number;
}

/** Contenu d'un cahier : une séance ou un devoir. */
export interface NotebookContent {
  id: number;
  type: 'SESSION' | 'HOMEWORK';
  title?: string | null;
  description?: string | null;
  annotation?: string | null;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  is_published: boolean;
  session_id?: number | null;
  estimatedtime?: number | null;
  estimatedTime?: number | null;
  color?: string | null;
  workload?: number | null;
  diaryType?: { label: string | null } | null;
  subject: { id: string; name: string | null };
  exceptional_label?: string | null;
  teacher: { id: string; displayName: string };
  audience: { id: string; name: string };
  visas?: { id: number | null; created?: string | null; owner_name?: string | null; pdf_details?: string | null } | null;
}

/** Filtres de la liste, comme `$scope.filters` de globalAdmin.ts. */
export interface NotebookFilters {
  structureId: string;
  /** « YYYY-MM-DD ». */
  start: string;
  end: string;
  vised: boolean;
  notVised: boolean;
  published: boolean;
  notPublished: boolean;
  /** Tri des visas : vrai = plus anciens d'abord. */
  orderVisaAsc: boolean;
  teacherIds: string[];
  audienceIds: string[];
  page?: number;
}

/** Vrai/faux si un seul état est coché, `null` si les deux (aucun filtre). Ex. visés seuls → true. */
export const triState = (yes: boolean, no: boolean): boolean | null => (yes && no ? null : yes && !no);

/**
 * Au moins un des deux états reste coché : décocher le dernier coche l'autre (comme les boutons
 * « Visés / Non visés » de l'AngularJS). Ex. [visés ✓, non visés ✓] → décocher visés → [✗, ✓] ;
 * puis décocher non visés → [✓, ✗].
 */
export function toggleExclusive(yes: boolean, no: boolean, which: 'yes' | 'no'): { yes: boolean; no: boolean } {
  let y = which === 'yes' ? !yes : yes;
  let n = which === 'no' ? !no : no;
  if (!y && !n) {
    if (which === 'yes') n = true;
    else y = true;
  }
  return { yes: y, no: n };
}

/** Paramètres de GET /diary/notebooks (ordre des visas : DESC par défaut, comme l'AngularJS). */
export function notebooksQuery(f: NotebookFilters): string {
  const p = new URLSearchParams();
  p.set('structure_id', f.structureId);
  p.set('start_at', `${f.start} 00:00:00`);
  p.set('end_at', `${f.end} 23:59:59`);
  const visa = triState(f.vised, f.notVised);
  if (visa !== null) p.set('visa', String(visa));
  // Le tri par visa n'a de sens que si les cahiers visés sont affichés.
  if (visa === null || visa === true) p.set('orderVisa', f.orderVisaAsc ? 'ASC' : 'DESC');
  const published = triState(f.published, f.notPublished);
  if (published !== null) p.set('is_published', String(published));
  f.teacherIds.forEach((id) => p.append('teacher_id', id));
  f.audienceIds.forEach((id) => p.append('audience_id', id));
  if (f.page !== undefined) p.set('page', String(f.page));
  return p.toString();
}

/** Paramètres de GET /diary/notebooks/sessions/homeworks : contenu d'un cahier. */
export function contentQuery(n: Notebook, f: NotebookFilters): string {
  const p = new URLSearchParams();
  p.set('structure_id', f.structureId);
  p.set('start_at', `${f.start} 00:00:00`);
  p.set('end_at', `${f.end} 23:59:59`);
  p.set('teacher_id', n.teacher.id);
  p.set('subject_id', n.subject.id);
  p.set('audience_id', n.audience.id);
  const visa = triState(f.vised, f.notVised);
  if (visa !== null) p.set('visa', String(visa));
  const published = triState(f.published, f.notPublished);
  if (published !== null) p.set('is_published', String(published));
  return p.toString();
}

/** Clé stable d'un cahier (le serveur la fournit ; repli sur enseignant, classe et matière). */
export const notebookKey = (n: Notebook): string => n.notebook_id ?? `${n.teacher.id}|${n.audience.id}|${n.subject.id}|${n.exceptional_label ?? ''}`;

export const subjectLabelOf = (x: { subject: { name: string | null }; exceptional_label?: string | null }): string => x.subject?.name || x.exceptional_label || '';

export interface VisaEntry {
  date: string;
  owner: string;
  inspector: boolean;
}

/** Visas d'un cahier à partir de « 18/09/2026 10:00~~Dupont Anne~~headmaster§§… ». */
export function parseVisas(raw?: string | null): VisaEntry[] {
  if (!raw) return [];
  return String(raw)
    .split('§§')
    .filter((s) => s.length > 0)
    .map((part) => {
      const [date, owner, type] = part.split('~~');
      return { date: date ?? '', owner: owner ?? '', inspector: type === 'inspector' };
    });
}

/** « Visé le 18/09/2026 10:00 par Dupont Anne » (libellés fournis par l'appelant, traduits). */
export const visaLabel = (v: VisaEntry, on: string, by: string): string => (!v.date ? '' : `${on}${v.date}${v.owner ? ` ${by} ${v.owner}` : ''}`);

const dayOf = (s?: string | null): string => (s ?? '').slice(0, 10);
const dmy = (day: string): string => (day.length === 10 ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : day);
const hm = (t?: string | null): string => (t ?? '').slice(0, 5);

/** « Séance du 17/09/2026 de 08:00 à 09:00 » ou « Pour le 18/09/2026 » pour un devoir. */
export function contentWhen(c: NotebookContent, labels: { forDate: string; from: string; to: string }): string {
  if (c.type === 'HOMEWORK') return `${labels.forDate} ${dmy(dayOf(c.date))}`;
  return `${dmy(dayOf(c.date))} ${labels.from} ${hm(c.start_time)} ${labels.to} ${hm(c.end_time)}`;
}

export const contentTitle = (c: NotebookContent, forDate: string): string => (c.type === 'SESSION' ? (c.title ?? '') : `${forDate} ${dmy(dayOf(c.date))}`);

/** Visas distincts portés par les contenus (un visa couvre plusieurs séances). */
export function distinctVisas(contents: NotebookContent[]): Array<{ id: number; created: string; owner: string }> {
  const seen = new Map<number, { id: number; created: string; owner: string }>();
  for (const c of contents) {
    const v = c.visas;
    if (v && v.id !== null && v.id !== undefined && !seen.has(v.id)) seen.set(v.id, { id: v.id, created: v.created ?? '', owner: v.owner_name ?? '' });
  }
  return [...seen.values()];
}

export interface VisaContext {
  comment: string;
  /** Nom de l'usager qui vise. */
  user: string;
  structureId: string;
  structureName: string;
  /** « à » : « 18/09/2026 à 10:00 ». */
  atWord: string;
  /** Texte d'un devoir sans durée. */
  noWorkload: string;
  now: Date;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * Corps d'un visa (un cahier) tel que l'attend le serveur pour le PDF et l'enregistrement, comme
 * Visa.mapFormData + toSendFormat : séances (et devoirs sans séance) du plus récent au plus ancien,
 * chaque séance portant ses devoirs ; descriptions en XHTML. Ex. 2 séances + 1 devoir rattaché →
 * `sessions` de 2 éléments, la première avec `homeworks: [devoir]`.
 */
export function visaPayload(contents: NotebookContent[], ctx: VisaContext) {
  const sessions = contents.filter((c) => c.type === 'SESSION');
  const homeworks = contents.filter((c) => c.type === 'HOMEWORK');
  const standalone = homeworks.filter((h) => h.session_id === null || h.session_id === undefined);
  const first = contents[0];
  const items = [...sessions, ...standalone]
    .map((n) => {
      const attached = homeworks.filter((h) => h.session_id === n.id && n.type === 'SESSION');
      const isHw = n.type === 'HOMEWORK';
      return {
        audience: n.audience.name,
        subject: n.subject?.name ?? '',
        teacher: n.teacher.displayName,
        title: n.title ?? '',
        type: n.diaryType?.label ?? '',
        startDate: n.date,
        startDisplayDate: dmy(dayOf(n.date)),
        startDisplayTime: isHw ? null : hm(n.start_time),
        endDisplayTime: isHw ? null : hm(n.end_time),
        hasDescription: !!n.description && n.description.trim() !== '',
        description: htmlToXhtml(n.description ?? ''),
        annotation: isHw ? null : (n.annotation ?? ''),
        homeworks: attached.map((h) => {
          const minutes = h.estimatedtime ?? h.estimatedTime ?? 0;
          return {
            estimatedTime: minutes ? minutes : ctx.noWorkload,
            hasEstimatedTime: !!minutes,
            due_date: dayOf(h.date),
            description: htmlToXhtml(h.description ?? ''),
            type: h.diaryType?.label ?? '',
            color: h.color ?? '',
            is_published: h.is_published,
            workload: h.workload ?? 0,
          };
        }),
        hasHomeworks: attached.length > 0,
      };
    })
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const d = ctx.now;
  return {
    comment: ctx.comment || null,
    sessionIds: sessions.map((s) => s.id),
    homeworkIds: homeworks.map((h) => h.id),
    user: ctx.user,
    audience: first.audience.name,
    subject: subjectLabelOf(first),
    teacher: first.teacher.displayName,
    structureName: ctx.structureName,
    sessions: items,
    structure_id: ctx.structureId,
    teacher_id: first.teacher.id,
    nb_sessions: contents.length,
    created: `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${ctx.atWord} ${two(d.getHours())}:${two(d.getMinutes())}`,
  };
}
