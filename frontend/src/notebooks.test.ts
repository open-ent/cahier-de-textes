// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { contentQuery, contentWhen, distinctVisas, Notebook, NotebookContent, NotebookFilters, notebooksQuery, parseVisas, toggleExclusive, triState, visaLabel, visaPayload } from './notebooks';

const filters: NotebookFilters = { structureId: 's1', start: '2025-09-01', end: '2026-10-17', vised: true, notVised: true, published: true, notPublished: true, orderVisaAsc: false, teacherIds: [], audienceIds: [] };
const nb: Notebook = { notebook_id: 'n', id: null, subject: { id: 'sub1', name: 'Maths' }, teacher: { id: 't1', displayName: 'DUPONT Anne' }, audience: { id: 'a1', name: '401' }, sessions: 2, modified: '2026-09-18T09:35:29' };
const base = { teacher: nb.teacher, audience: nb.audience, subject: nb.subject, is_published: true };
const session = (id: number, date: string, extra: Partial<NotebookContent> = {}): NotebookContent => ({ ...base, id, type: 'SESSION', title: `S${id}`, description: '<p>Contenu</p>', annotation: '', date: `${date} 00:00:00.000000+0200`, start_time: '08:00:00', end_time: '09:00:00', diaryType: { label: 'Cours' }, ...extra });
const homework = (id: number, sessionId: number | null, date: string, extra: Partial<NotebookContent> = {}): NotebookContent => ({ ...base, id, type: 'HOMEWORK', description: '<p>Exercices</p>', date, session_id: sessionId, estimatedtime: 20, diaryType: { label: 'Devoir maison' }, color: '#ff9700', ...extra });

describe('cahiers de textes', () => {
  it('états à deux cases : un seul coché = filtre, les deux = aucun filtre', () => {
    expect(triState(true, true)).toBeNull();
    expect(triState(true, false)).toBe(true);
    expect(triState(false, true)).toBe(false);
  });
  it('au moins une case reste cochée', () => {
    expect(toggleExclusive(true, true, 'yes')).toEqual({ yes: false, no: true });
    expect(toggleExclusive(false, true, 'no')).toEqual({ yes: true, no: false });
    expect(toggleExclusive(true, false, 'yes')).toEqual({ yes: false, no: true });
  });
  it('requête de la liste : dates, filtres, enseignants et classes multiples, page', () => {
    const q = new URLSearchParams(notebooksQuery({ ...filters, vised: false, published: true, notPublished: false, teacherIds: ['t1', 't2'], audienceIds: ['a1'], page: 2 }));
    expect(q.get('start_at')).toBe('2025-09-01 00:00:00');
    expect(q.get('end_at')).toBe('2026-10-17 23:59:59');
    expect(q.get('visa')).toBe('false');
    expect(q.get('orderVisa')).toBeNull();
    expect(q.get('is_published')).toBe('true');
    expect(q.getAll('teacher_id')).toEqual(['t1', 't2']);
    expect(q.get('page')).toBe('2');
    // Sans filtre visa, l'ordre est envoyé ; sans page, la requête n'est pas paginée (visa en masse).
    const all = new URLSearchParams(notebooksQuery(filters));
    expect(all.get('orderVisa')).toBe('DESC');
    expect(all.has('page')).toBe(false);
    expect(new URLSearchParams(notebooksQuery({ ...filters, orderVisaAsc: true })).get('orderVisa')).toBe('ASC');
  });
  it('requête du contenu : enseignant, matière, classe', () => {
    const q = new URLSearchParams(contentQuery(nb, filters));
    expect([q.get('teacher_id'), q.get('subject_id'), q.get('audience_id')]).toEqual(['t1', 'sub1', 'a1']);
  });
  it('visas d\'un cahier : découpe de la chaîne SQL', () => {
    const v = parseVisas('18/09/2026 10:00~~UPRETI001 Lilit~~headmaster§§19/09/2026 08:00~~INSP Paul~~inspector');
    expect(v).toEqual([{ date: '18/09/2026 10:00', owner: 'UPRETI001 Lilit', inspector: false }, { date: '19/09/2026 08:00', owner: 'INSP Paul', inspector: true }]);
    expect(parseVisas(null)).toEqual([]);
    expect(visaLabel(v[0], 'Visé le ', 'par')).toBe('Visé le 18/09/2026 10:00 par UPRETI001 Lilit');
  });
  it('libellé de date : séance (de … à …) et devoir (pour le …)', () => {
    const l = { forDate: 'Pour le', from: 'de', to: 'à' };
    expect(contentWhen(session(1, '2026-09-17'), l)).toBe('17/09/2026 de 08:00 à 09:00');
    expect(contentWhen(homework(2, 1, '2026-09-18 00:00:00'), l)).toBe('Pour le 18/09/2026');
  });
  it('visas distincts : un visa couvre plusieurs séances', () => {
    const visa = { id: 34, created: '2026-09-18T10:10:27', owner_name: 'X' };
    expect(distinctVisas([session(1, '2026-09-17', { visas: visa }), session(2, '2026-09-16', { visas: visa }), session(3, '2026-09-15', { visas: { id: null } })])).toEqual([{ id: 34, created: '2026-09-18T10:10:27', owner: 'X' }]);
  });
  it('corps du visa : séances triées, devoirs rattachés, devoirs libres, XHTML', () => {
    const body = visaPayload(
      [session(1, '2026-09-15'), session(2, '2026-09-17'), homework(10, 2, '2026-09-18 00:00:00'), homework(11, null, '2026-09-20 00:00:00', { estimatedtime: 0 })],
      { comment: 'ok', user: 'Chef', structureId: 's1', structureName: 'Collège', atWord: 'à', noWorkload: 'Aucune durée estimée', now: new Date(2026, 8, 20, 9, 5) },
    );
    expect(body).toMatchObject({ comment: 'ok', sessionIds: [1, 2], homeworkIds: [10, 11], audience: '401', subject: 'Maths', teacher: 'DUPONT Anne', structure_id: 's1', teacher_id: 't1', nb_sessions: 4, created: '20/09/2026 à 09:05' });
    // Du plus récent au plus ancien : devoir libre du 20, séance du 17, séance du 15.
    expect(body.sessions.map((s) => s.startDisplayDate)).toEqual(['20/09/2026', '17/09/2026', '15/09/2026']);
    const s2 = body.sessions[1];
    expect(s2).toMatchObject({ title: 'S2', hasHomeworks: true, startDisplayTime: '08:00', endDisplayTime: '09:00', hasDescription: true });
    expect(s2.homeworks[0]).toMatchObject({ estimatedTime: 20, hasEstimatedTime: true, type: 'Devoir maison' });
    expect(s2.description).toContain('<html');
    // Devoir libre : pas d'horaires ; sans durée, le texte « Aucune durée estimée » est affiché.
    expect(body.sessions[0]).toMatchObject({ startDisplayTime: null, annotation: null });
    const noTime = visaPayload([session(5, '2026-09-17'), homework(6, 5, '2026-09-18 00:00:00', { estimatedtime: 0 })], { comment: '', user: 'U', structureId: 's', structureName: 'N', atWord: 'à', noWorkload: 'Aucune durée estimée', now: new Date(2026, 8, 20) });
    expect(noTime.sessions[0].homeworks[0]).toMatchObject({ estimatedTime: 'Aucune durée estimée', hasEstimatedTime: false });
    expect(noTime.comment).toBeNull();
  });
});
