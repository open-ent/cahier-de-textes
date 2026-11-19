import { describe, expect, it } from 'vitest';

import { canWrite, initialStructureId, isStudentOrRelative, navTabs, profileOf, userStructures, WorkflowKey } from './context';

describe('contexte du cahier de textes', () => {
  it('profils d\'après le type de session', () => {
    expect(profileOf('ENSEIGNANT')).toBe('teacher');
    expect(profileOf('PERSRELELEVE')).toBe('relative');
    expect(isStudentOrRelative(profileOf('ELEVE'))).toBe(true);
    expect(isStudentOrRelative(profileOf('PERSEDUCNAT'))).toBe(false);
  });
  it('établissement initial : préférence encore valide, sinon le premier', () => {
    const s = userStructures(['a', 'b'], ['Collège A', 'Lycée B']);
    expect(initialStructureId(s, 'b')).toBe('b');
    expect(initialStructureId(s, 'z')).toBe('a');
    expect(initialStructureId([], undefined)).toBe('');
  });
  it('onglets selon les droits : progressions pour l\'enseignant qui gère les séances', () => {
    const has = (granted: WorkflowKey[]) => (k: WorkflowKey) => granted.includes(k);
    expect(navTabs(has(['readHomework', 'readSession']), 'student')).toEqual(['homeworks', 'sessions']);
    expect(navTabs(has(['manageHomework', 'manageSession']), 'teacher')).toEqual(['homeworks', 'sessions', 'progressions']);
    expect(navTabs(has(['calendarView', 'readHomework']), 'teacher')).toEqual(['calendar', 'homeworks']);
    // Élève : jamais le calendrier, même avec le droit (liste seulement, comme l'AngularJS).
    expect(navTabs(has(['calendarView', 'readHomework']), 'student')).toEqual(['homeworks']);
    // Parent : la liste seulement.
    expect(navTabs(has(['listView', 'readHomework', 'readSession']), 'relative')).toEqual(['list']);
    expect(navTabs(has(['readHomework']), 'relative')).toEqual([]);
    // Liste : avec le droit listView, pour tous les profils ; l'élève y arrive par défaut.
    expect(navTabs(has(['calendarView', 'listView']), 'teacher')).toEqual(['calendar', 'list']);
    expect(navTabs(has(['listView', 'readHomework']), 'student')).toEqual(['list', 'homeworks']);
    // Direction : consultation des progressions d'un enseignant (lecture seule).
    expect(navTabs(has(['calendarView', 'readSession']), 'personnel')).toEqual(['calendar', 'sessions', 'consult']);
    // Archives : droit dédié, enseignant ou direction.
    expect(navTabs(has(['readNotebookArchives']), 'teacher')).toEqual(['archives']);
    expect(navTabs(has(['readNotebookArchives']), 'student')).toEqual([]);
    expect(navTabs(has([]), 'other')).toEqual([]);
  });
});

describe('canWrite', () => {
  const tout = () => true;

  it("refuse l'écriture à l'élève et au parent même quand la session donne le droit", () => {
    expect(canWrite(tout, 'student', 'manageHomework')).toBe(false);
    expect(canWrite(tout, 'relative', 'manageHomework')).toBe(false);
    expect(canWrite(tout, 'student', 'settingTypesManage')).toBe(false);
    expect(canWrite(tout, 'student', 'manageSession')).toBe(false);
  });

  it("laisse écrire l'enseignant et le personnel qui ont le droit", () => {
    expect(canWrite(tout, 'teacher', 'manageHomework')).toBe(true);
    expect(canWrite(tout, 'personnel', 'manageSession')).toBe(true);
  });

  it('respecte toujours le droit de workflow', () => {
    expect(canWrite(() => false, 'teacher', 'manageHomework')).toBe(false);
  });
});
