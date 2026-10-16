/**
 * Périmètre de lecture du cahier de textes, fonctions pures — mêmes règles que l'AngularJS
 * (calendar-view.ts, manageList.ts) :
 *  - personnel (direction, vie scolaire) : toujours les routes « external », avec l'enseignant
 *    et/ou les classes choisis ;
 *  - enseignant : ses propres données (« own », filtrables par classe) ; s'il choisit un AUTRE
 *    enseignant, les routes « external » ;
 *  - élève : ses propres données ; parent : celles de l'enfant choisi (« child »).
 * Ex. enseignant qui cherche « BATTISTI » → external avec teacherId ; qui coche la classe 401 → own.
 */
export interface SearchTeacher {
  id: string;
  displayName: string;
}
export interface SearchClass {
  id: string;
  name: string;
}

export type Scope =
  | { mode: 'own'; audienceIds: string[] }
  | { mode: 'external'; teacherId?: string; audienceIds: string[] }
  | { mode: 'child'; childId: string }
  | { mode: 'none' };

export function readScope(
  profile: 'student' | 'relative' | 'teacher' | 'personnel' | 'other',
  userId: string,
  teacher: SearchTeacher | null,
  classes: SearchClass[],
  childId?: string,
): Scope {
  const audienceIds = classes.map((c) => c.id);
  if (profile === 'relative') return childId ? { mode: 'child', childId } : { mode: 'none' };
  if (profile === 'student') return { mode: 'own', audienceIds: [] };
  if (profile === 'personnel') return { mode: 'external', teacherId: teacher?.id ?? userId, audienceIds };
  if (profile === 'teacher') {
    if (teacher && teacher.id !== userId) return { mode: 'external', teacherId: teacher.id, audienceIds };
    return { mode: 'own', audienceIds };
  }
  return { mode: 'own', audienceIds: [] };
}

/** Clé stable d'un périmètre, pour le cache des requêtes. */
export const scopeKey = (s: Scope): string => JSON.stringify(s);

/**
 * Paramètres de requête des routes « external » : `teacherId` puis un `audienceId` par classe.
 * Ex. { teacherId: 't1', audienceIds: ['a','b'] } → « teacherId=t1&audienceId=a&audienceId=b ».
 */
export function externalQuery(teacherId: string | undefined, audienceIds: string[], subjectId?: string): string {
  const parts: string[] = [];
  if (teacherId) parts.push(`teacherId=${encodeURIComponent(teacherId)}`);
  for (const a of audienceIds) parts.push(`audienceId=${encodeURIComponent(a)}`);
  if (subjectId) parts.push(`subjectId=${encodeURIComponent(subjectId)}`);
  return parts.join('&');
}

/** Paramètres de la route « own » : une classe par `audienceId`, et la matière. */
export function ownQuery(audienceIds: string[], subjectId?: string): string {
  return externalQuery(undefined, audienceIds, subjectId);
}

/** Filtre des cours de l'emploi du temps : enseignants et noms de classes choisis. */
export function courseFilter(scope: Scope, classes: SearchClass[], userId: string): { teacherIds?: string[]; groups?: string[] } {
  const groups = classes.map((c) => c.name);
  if (scope.mode === 'external') return { teacherIds: scope.teacherId ? [scope.teacherId] : [], groups };
  if (scope.mode === 'own') return { teacherIds: [userId], groups };
  return {};
}
