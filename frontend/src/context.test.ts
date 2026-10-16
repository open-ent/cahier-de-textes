import { describe, expect, it } from 'vitest';

import { initialStructureId, isStudentOrRelative, navTabs, profileOf, userStructures, WorkflowKey } from './context';

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
    expect(navTabs(has([]), 'other')).toEqual([]);
  });
});
