import { describe, expect, it } from 'vitest';

import { courseFilter, externalQuery, ownQuery, readScope } from './searchScope';

const t = { id: 't2', displayName: 'BATTISTI001 Anic' };
const k = [{ id: 'a1', name: '401' }, { id: 'a2', name: '402' }];

describe('périmètre de lecture', () => {
  it('personnel : toujours external, enseignant choisi sinon lui-même', () => {
    expect(readScope('personnel', 'me', t, k)).toEqual({ mode: 'external', teacherId: 't2', audienceIds: ['a1', 'a2'] });
    expect(readScope('personnel', 'me', null, [])).toEqual({ mode: 'external', teacherId: 'me', audienceIds: [] });
  });
  it('enseignant : own, external seulement pour un AUTRE enseignant', () => {
    expect(readScope('teacher', 'me', null, k)).toEqual({ mode: 'own', audienceIds: ['a1', 'a2'] });
    expect(readScope('teacher', 'me', { id: 'me', displayName: 'Moi' }, [])).toEqual({ mode: 'own', audienceIds: [] });
    expect(readScope('teacher', 'me', t, [])).toEqual({ mode: 'external', teacherId: 't2', audienceIds: [] });
  });
  it('élève : own sans filtre ; parent : enfant choisi, sinon rien', () => {
    expect(readScope('student', 'me', t, k)).toEqual({ mode: 'own', audienceIds: [] });
    expect(readScope('relative', 'me', null, [], 'c1')).toEqual({ mode: 'child', childId: 'c1' });
    expect(readScope('relative', 'me', null, [])).toEqual({ mode: 'none' });
  });
  it('requêtes : teacherId, une classe par audienceId, matière', () => {
    expect(externalQuery('t1', ['a', 'b'])).toBe('teacherId=t1&audienceId=a&audienceId=b');
    expect(externalQuery(undefined, [], 'm1')).toBe('subjectId=m1');
    expect(ownQuery(['a'], 'm 1')).toBe('audienceId=a&subjectId=m%201');
    expect(externalQuery(undefined, [])).toBe('');
  });
  it('cours : enseignant et noms de classes choisis', () => {
    expect(courseFilter({ mode: 'external', teacherId: 't2', audienceIds: ['a1'] }, k, 'me')).toEqual({ teacherIds: ['t2'], groups: ['401', '402'] });
    expect(courseFilter({ mode: 'own', audienceIds: [] }, [], 'me')).toEqual({ teacherIds: ['me'], groups: [] });
    expect(courseFilter({ mode: 'none' }, [], 'me')).toEqual({});
  });
});
