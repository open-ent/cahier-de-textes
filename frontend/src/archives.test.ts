import { describe, expect, it } from 'vitest';

import { archivedOn, archivesQuery, effectiveTeachers, exportUrl, teacherLabel } from './archives';

describe('archives des cahiers de textes', () => {
  it('requête : année, enseignants et classes multiples, page', () => {
    const q = new URLSearchParams(archivesQuery({ schoolYear: '2025-2026', teacherNames: ['Anne DUPONT', 'Paul MARTIN'], audienceLabels: ['401'], page: 1 }));
    expect(q.get('schoolYear')).toBe('2025-2026');
    expect(q.getAll('teacherName')).toEqual(['Anne DUPONT', 'Paul MARTIN']);
    expect(q.getAll('audienceLabel')).toEqual(['401']);
    expect(q.get('page')).toBe('1');
    expect(new URLSearchParams(archivesQuery({ schoolYear: '2025-2026', teacherNames: [], audienceLabels: [] })).has('page')).toBe(false);
  });
  it('enseignant sans droit de recherche : seulement ses archives', () => {
    const me = { firstName: 'Anne', lastName: 'DUPONT' };
    expect(effectiveTeachers([], true, false, me)).toEqual(['Anne DUPONT']);
    expect(effectiveTeachers([], true, true, me)).toEqual([]);
    expect(effectiveTeachers([], false, false, me)).toEqual([]);
    expect(effectiveTeachers(['Paul MARTIN'], true, false, me)).toEqual(['Paul MARTIN']);
  });
  it('adresse de téléchargement : un identifiant par archive', () => {
    expect(exportUrl('s1', [4, 7])).toBe('/diary/structures/s1/notebooks/archives/export?archiveId=4&archiveId=7');
  });
  it('dates et libellés', () => {
    expect(archivedOn('2026-09-18T10:10:27')).toBe('18/09/2026');
    expect(archivedOn('')).toBe('');
    expect(teacherLabel({ teacher_first_name: 'Anne', teacher_last_name: 'Dupont' })).toBe('Anne DUPONT');
  });
});
