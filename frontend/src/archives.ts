// Archives des cahiers de textes (années passées, PDF), comme l'IHM AngularJS
// (controllers/notebook-archives.controller.ts, services/notebook-archive.service.ts).
// Fonctions pures, testées dans archives.test.ts.

/** Ligne brute de GET /diary/structures/:id/notebooks/archives. */
export interface RawArchive {
  id: number;
  structure_id: string;
  structure_label: string;
  subject_label: string;
  teacher_id: string;
  teacher_first_name: string;
  teacher_last_name: string;
  audience_label: string;
  created_at: string;
  archive_school_year: string;
  file_id: string;
}

export interface ArchivePage {
  all: RawArchive[];
  page: number;
  page_count: number;
}

export interface ArchiveFilters {
  schoolYear: string;
  /** Noms affichés « Prénom NOM » ; plusieurs possibles. */
  teacherNames: string[];
  audienceLabels: string[];
  page?: number;
}

/** Paramètres de la liste : année, enseignants et classes multiples, page. */
export function archivesQuery(f: ArchiveFilters): string {
  const p = new URLSearchParams();
  p.set('schoolYear', f.schoolYear);
  f.teacherNames.forEach((n) => p.append('teacherName', n));
  f.audienceLabels.forEach((a) => p.append('audienceLabel', a));
  if (f.page !== undefined) p.set('page', String(f.page));
  return p.toString();
}

/**
 * Enseignants de la requête : sans le droit de rechercher des enseignants, un enseignant ne voit
 * que ses archives (comme l'AngularJS) ; sinon ceux qui ont été choisis.
 */
export function effectiveTeachers(chosen: string[], isTeacher: boolean, canSearch: boolean, me: { firstName: string; lastName: string }): string[] {
  if (chosen.length > 0) return chosen;
  return isTeacher && !canSearch ? [`${me.firstName} ${me.lastName}`] : [];
}

/** Adresse de téléchargement d'une ou plusieurs archives : un PDF, ou une archive ZIP au-delà. */
export function exportUrl(structureId: string, ids: number[]): string {
  const p = new URLSearchParams();
  ids.forEach((id) => p.append('archiveId', String(id)));
  return `/diary/structures/${structureId}/notebooks/archives/export?${p.toString()}`;
}

/** « 18/09/2026 » à partir de la date de création (ISO ou « AAAA-MM-JJ hh:mm »). */
export function archivedOn(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Libellé de l'enseignant : « Anne DUPONT ». */
export const teacherLabel = (a: Pick<RawArchive, 'teacher_first_name' | 'teacher_last_name'>): string => `${a.teacher_first_name ?? ''} ${(a.teacher_last_name ?? '').toUpperCase()}`.trim();
