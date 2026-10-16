// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  canEditHomework,
  dayWorkload,
  draftFromHomework,
  draftFromHomeworkPage,
  emptyHomework,
  emptyHomeworkPage,
  futureSessions,
  homeworkPagePayload,
  homeworkPayload,
  isPastDue,
  progressState,
  validateHomework,
  validateHomeworkPage,
  workloadColor,
} from './homeworkForm';

const ctx = { sessionId: 7, subjectId: 's1', structureId: 'st', audienceId: 'a1', teacherId: 'me' };
const ok = { ...emptyHomework(), typeId: '2', dueDate: '2026-11-05', description: '<p>Exercices 1 à 5</p>', estimatedTime: 30 };

describe('devoirs d\'une séance', () => {
  it('validation : type, échéance, durée, description', () => {
    expect(validateHomework(emptyHomework())).toEqual(['type', 'due', 'description']);
    expect(validateHomework(ok)).toEqual([]);
    expect(validateHomework({ ...ok, dueMode: 'session', dueSessionId: '' })).toEqual(['due']);
    expect(validateHomework({ ...ok, estimatedTime: -5 })).toEqual(['time']);
  });
  it('données envoyées : à une date, détaché de toute séance', () => {
    const p = homeworkPayload(ok, ctx);
    expect(p).toMatchObject({ subject_id: 's1', type_id: 2, teacher_id: 'me', session_id: null, from_session_id: 7, due_date: '2026-11-05', estimatedTime: 30, is_published: false, detachFromSession: true });
    expect(p.description).toContain('Exercices 1 à 5');
    expect(p.description).toContain('xmlns="http://www.w3.org/1999/xhtml"');
  });
  it('à rendre pour une séance : échéance = date de cette séance', () => {
    const p = homeworkPayload({ ...ok, dueMode: 'session', dueSessionId: '12', dueDate: '' }, { ...ctx, dueSessionDate: '2026-11-12' });
    expect(p).toMatchObject({ session_id: 12, due_date: '2026-11-12', detachFromSession: false });
  });
  it('matière libre : libellé conservé', () => {
    expect(homeworkPayload(ok, { ...ctx, subjectId: 'exceptional', exceptionalLabel: 'Sortie' })).toMatchObject({ subject_id: 'exceptional', exceptional_label: 'Sortie' });
  });
  it('devoir serveur → brouillon', () => {
    expect(draftFromHomework({ id: 4, type_id: 2, session_id: 12, due_date: '2026-11-12T00:00:00', estimatedTime: 15, description: 'x', is_published: true })).toMatchObject({
      id: 4, typeId: '2', dueMode: 'session', dueSessionId: '12', dueDate: '2026-11-12', estimatedTime: 15, published: true,
    });
    expect(draftFromHomework({ id: 5, session_id: null, due_date: '2026-11-13' }).dueMode).toBe('date');
  });
  it('charge de travail : pastille et lecture du jour', () => {
    expect([0, 2, 3, 4, 5].map(workloadColor)).toEqual(['green', 'green', 'yellow', 'yellow', 'red']);
    const data = [{ day: '2026-11-05T00:00:00', count: '3', total: '90' }];
    expect(dayWorkload(data, '2026-11-05')).toEqual({ count: 3, total: 90 });
    expect(dayWorkload(data, '2026-11-06')).toEqual({ count: 0, total: 0 });
  });
  it('séances futures : même classe, après la séance courante, triées', () => {
    const sessions = [
      { id: 1, date: '2026-11-02', audience_id: 'a1' },
      { id: 2, date: '2026-11-12', audience_id: 'a1' },
      { id: 3, date: '2026-11-09', audience_id: 'a1' },
      { id: 4, date: '2026-11-10', audience_id: 'a2' },
    ];
    expect(futureSessions(sessions, { id: 1, date: '2026-11-02', audienceId: 'a1' }).map((s) => s.id)).toEqual([3, 2]);
  });
});

describe('page devoir', () => {
  const page = { ...emptyHomeworkPage(), subjectKey: 's1', audienceId: 'a1', typeId: '2', dueDate: '2026-11-12', estimatedTime: 20, description: '<p>Leçon 4</p>' };
  it('validation : matière, classe, type, échéance, durée ; la description est facultative', () => {
    expect(validateHomeworkPage(emptyHomeworkPage())).toEqual(['subject', 'audience', 'type', 'due']);
    expect(validateHomeworkPage(page)).toEqual([]);
    expect(validateHomeworkPage({ ...page, dueMode: 'session', dueSessionId: '' })).toEqual(['due']);
    expect(validateHomeworkPage({ ...page, description: '' })).toEqual([]);
  });
  it('données envoyées : objet complet avec ressources, séance d\'origine conservée', () => {
    const doc = { type: 'workspace' as const, id: 'd1', name: 'a.pdf', url: '/workspace/document/d1' };
    const p = homeworkPagePayload({ ...page, id: 9, resources: [doc], fromSessionId: 3 }, { structureId: 'st', teacherId: 'me' });
    expect(p).toMatchObject({ subject_id: 's1', type_id: 2, session_id: null, from_session_id: 3, audience_id: 'a1', due_date: '2026-11-12', is_published: false, detachFromSession: true });
    expect(p.resources).toEqual([doc]);
    expect(homeworkPagePayload(page, { structureId: 'st', teacherId: 'me' })).not.toHaveProperty('from_session_id');
    expect(homeworkPagePayload({ ...page, subjectKey: 'exceptional:Sortie' }, { structureId: 'st', teacherId: 'me' })).toMatchObject({ subject_id: 'exceptional', exceptional_label: 'Sortie' });
    expect(homeworkPagePayload({ ...page, dueMode: 'session', dueSessionId: '12' }, { structureId: 'st', teacherId: 'me', dueSessionDate: '2026-11-19' })).toMatchObject({ session_id: 12, due_date: '2026-11-19', detachFromSession: false });
  });
  it('devoir serveur → brouillon : durée en minuscules, ressources en chaîne, état « fait »', () => {
    const d = draftFromHomeworkPage({ id: 4, subject_id: 'exceptional', exceptional_label: 'Sortie', audience_id: 'a1', type_id: 2, due_date: '2026-11-12T00:00:00', estimatedtime: 25, resources: '[{"type":"workspace","id":"d","name":"n","url":"u"}]', progress: { state_label: 'done' }, teacher_id: 't1' });
    expect(d).toMatchObject({ id: 4, subjectKey: 'exceptional:Sortie', typeId: '2', dueDate: '2026-11-12', estimatedTime: 25, done: true, teacherId: 't1' });
    expect(d.resources).toHaveLength(1);
  });
  it('droits et état : propriétaire avec gestion, échéance passée, « fait »', () => {
    const mine = { ...page, id: 1, teacherId: 'me' };
    expect(canEditHomework(mine, 'me', true)).toBe(true);
    expect(canEditHomework({ ...mine, teacherId: 'other' }, 'me', true)).toBe(false);
    expect(canEditHomework(mine, 'me', false)).toBe(false);
    expect(isPastDue(mine, '2026-11-13')).toBe(true);
    expect(isPastDue(mine, '2026-11-12')).toBe(false);
    expect(isPastDue(page, '2027-01-01')).toBe(false);
    expect([true, false].map(progressState)).toEqual(['done', 'todo']);
  });
});
