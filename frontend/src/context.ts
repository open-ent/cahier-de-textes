// Contexte de l'usager pour le cahier de textes : droits, profil, établissement. Fonctions pures,
// testées dans context.test.ts ; le hook React est dans hooks/useDiaryContext.ts. Même logique que
// l'IHM AngularJS (public/ts/behaviours.ts, utils/user.utils.ts), pour que les deux accordent les
// mêmes affichages et les mêmes actions.

/** Droits de workflow du module (clés de la session, cf. public/ts/behaviours.ts). */
export const WORKFLOW = {
  view: 'fr.openent.diary.controllers.DiaryController|view',
  calendarView: 'fr.openent.diary.controllers.DiaryController|workflow1',
  listView: 'fr.openent.diary.controllers.DiaryController|workflow2',
  accessOwnData: 'fr.openent.diary.controllers.DiaryController|workflow3',
  accessChildData: 'fr.openent.diary.controllers.DiaryController|workflow4',
  accessExternalData: 'fr.openent.diary.controllers.FakeRight|accessExternalData',
  diarySearch: 'fr.openent.diary.controllers.SearchController|searchUsers',
  readSession: 'fr.openent.diary.controllers.SessionController|workflow1',
  manageSession: 'fr.openent.diary.controllers.SessionController|workflow2',
  publishSession: 'fr.openent.diary.controllers.SessionController|workflow3',
  readHomework: 'fr.openent.diary.controllers.HomeworkController|workflow1',
  manageHomework: 'fr.openent.diary.controllers.HomeworkController|workflow2',
  publishHomework: 'fr.openent.diary.controllers.HomeworkController|workflow3',
  setProgressHomework: 'fr.openent.diary.controllers.HomeworkController|setProgressHomework',
  settingTypesRead: 'fr.openent.diary.controllers.HomeworkController|workflow4',
  settingTypesManage: 'fr.openent.diary.controllers.HomeworkController|workflow5',
  adminAccess: 'fr.openent.diary.controllers.VisaController|workflow1',
  /** Visa de toute la sélection d'un filtre, droit distinct du visa unitaire (jamais accordé par défaut). */
  adminVisaMassManage: 'fr.openent.diary.controllers.FakeRight|adminVisaMassManage',
  manageVisa: 'fr.openent.diary.controllers.VisaController|workflow2',
  readVisa: 'fr.openent.diary.controllers.FakeRight|adminVisaRead',
  readNotebookArchives: 'fr.openent.diary.controllers.NotebookArchiveController|readArchives',
  searchNotebookArchiveTeachers: 'fr.openent.diary.controllers.NotebookArchiveController|searchTeachers',
} as const;

export type WorkflowKey = keyof typeof WORKFLOW;

/** Profils, d'après `user.type` de la session (cf. public/ts/core/const/user-types.ts). */
export type Profile = 'teacher' | 'personnel' | 'student' | 'relative' | 'other';

export function profileOf(type: string | undefined): Profile {
  switch (type) {
    case 'ENSEIGNANT':
      return 'teacher';
    case 'PERSEDUCNAT':
      return 'personnel';
    case 'ELEVE':
      return 'student';
    case 'PERSRELELEVE':
      return 'relative';
    default:
      return 'other';
  }
}

/** Élève ou parent : liste seulement, éléments non publiés masqués (main.ts:249-250). */
export const isStudentOrRelative = (p: Profile): boolean => p === 'student' || p === 'relative';

export interface StructureRef {
  id: string;
  name: string;
}

/** Établissements de l'usager, dans l'ordre de la session (`structures` / `structureNames`). */
export function userStructures(ids: string[] | undefined, names: string[] | undefined): StructureRef[] {
  return (ids ?? []).map((id, i) => ({ id, name: names?.[i] ?? id }));
}

/**
 * Établissement affiché à l'ouverture, comme l'AngularJS (user.utils.ts) : le dernier choisi
 * (préférence `cdt.structure`) s'il fait toujours partie des établissements de l'usager, sinon le
 * premier. Ex. préférence « Lycée B » retirée du compte → « Collège A ».
 */
export function initialStructureId(structures: StructureRef[], preferredId: string | undefined): string {
  const ids = structures.map((s) => s.id);
  if (preferredId && ids.includes(preferredId)) return preferredId;
  return ids[0] ?? '';
}

/** Onglets de navigation selon les droits, comme le menu latéral de l'AngularJS (side-navbar). */
export type Tab = 'calendar' | 'list' | 'homeworks' | 'sessions' | 'progressions' | 'consult' | 'notebooks' | 'archives';

export function navTabs(has: (k: WorkflowKey) => boolean, profile: Profile): Tab[] {
  const tabs: Tab[] = [];
  // Parent : uniquement la liste de son enfant (ni calendrier, ni création, comme l'AngularJS).
  if (profile === 'relative') return has('listView') ? ['list'] : [];
  // Calendrier : accueil de l'AngularJS, sauf élève et parent (renvoyés vers la liste, main.ts:249).
  if (has('calendarView') && !isStudentOrRelative(profile)) tabs.push('calendar');
  // Liste : accueil de l'élève et du parent (main.ts:249), au choix pour les autres (droit listView).
  if (has('listView')) tabs.push('list');
  if (has('readHomework') || has('manageHomework')) tabs.push('homeworks');
  if (has('readSession') || has('manageSession')) tabs.push('sessions');
  // Progressions : outil de l'enseignant (gestion des séances), comme progressions/view.
  if (profile === 'teacher' && has('manageSession')) tabs.push('progressions');
  // Cahiers de textes (visas, PDF) : enseignant, direction et inspection avec le droit d'accès.
  if ((profile === 'teacher' || profile === 'personnel') && has('adminAccess')) tabs.push('notebooks');
  // Archives des années passées : droit dédié.
  if ((profile === 'teacher' || profile === 'personnel') && has('readNotebookArchives')) tabs.push('archives');
  // Direction : consultation des progressions d'un enseignant, en lecture seule (side-navbar).
  if (profile === 'personnel') tabs.push('consult');
  return tabs;
}
