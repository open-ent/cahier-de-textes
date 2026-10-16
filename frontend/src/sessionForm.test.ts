// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  canDeleteSession,
  canEditSession,
  canProposeSession,
  draftFromCourse,
  draftFromSession,
  emptyDraft,
  exceptionalLabelOf,
  sessionPayload,
  subjectKeyOf,
  titlePlaceholder,
  validateSession,
} from './sessionForm';

const valid = { ...emptyDraft(), subjectKey: 's1', audienceId: 'a1', typeId: '1', date: '2026-11-02', startTime: '08:00', endTime: '09:00' };

describe('formulaire de séance', () => {
  it('validation : champs obligatoires, 15 minutes minimum, titre de 50 caractères', () => {
    expect(validateSession(emptyDraft())).toEqual(['subject', 'audience', 'type', 'date', 'start', 'end']);
    expect(validateSession(valid)).toEqual([]);
    expect(validateSession({ ...valid, endTime: '08:10' })).toEqual(['duration']);
    expect(validateSession({ ...valid, endTime: '08:15' })).toEqual([]);
    expect(validateSession({ ...valid, title: 'x'.repeat(51) })).toEqual(['title']);
  });
  it('matière libre : clé « exceptional:<libellé> » aller-retour', () => {
    expect(subjectKeyOf('exceptional', 'Sortie')).toBe('exceptional:Sortie');
    expect(subjectKeyOf('abc')).toBe('abc');
    expect(exceptionalLabelOf('exceptional:Sortie')).toBe('Sortie');
    expect(exceptionalLabelOf('abc')).toBeUndefined();
  });
  it('titre par défaut daté, sinon le titre saisi', () => {
    expect(titlePlaceholder('2026-11-02')).toBe('Travail de la séance du 02/11/2026');
    expect(sessionPayload(valid, 'st').title).toBe('Travail de la séance du 02/11/2026');
    expect(sessionPayload({ ...valid, title: '  Les fractions ' }, 'st').title).toBe('Les fractions');
  });
  it('données envoyées : objet complet, séance non vide, course_id null, description en XHTML', () => {
    const p = sessionPayload({ ...valid, description: '<p>Bonjour</p>', rbsResourceIds: [3], resources: [{ type: 'workspace', id: 'd1', name: 'a.pdf', url: '/workspace/document/d1' }] }, 'st');
    expect(p).toMatchObject({ id: null, subject_id: 's1', type_id: 1, structure_id: 'st', start_time: '08:00:00', end_time: '09:00:00', is_empty: false, course_id: null, room: '', rbsResourceIds: [3], is_published: false });
    expect(p.resources).toHaveLength(1);
    expect(p.description).toContain('<p>Bonjour</p>');
    expect(p.description).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(sessionPayload({ ...valid, subjectKey: 'exceptional:Sortie' }, 'st')).toMatchObject({ subject_id: 'exceptional', exceptional_label: 'Sortie' });
  });
  it('séance serveur → brouillon : date locale, horaires, ressources en chaîne JSON', () => {
    const d = draftFromSession({ id: 14, subject_id: 'exceptional', exceptional_label: 'Sortie', audience_id: 'a1', type_id: 2, date: '2026-09-05 00:00:00.000000+0200', start_time: '08:00:00', end_time: '09:30:00', resources: '[{"type":"workspace","id":"d","name":"n","url":"u"}]', one_visa: true, teacher_id: 't1' });
    expect(d).toMatchObject({ id: 14, subjectKey: 'exceptional:Sortie', typeId: '2', date: '2026-09-05', startTime: '08:00', endTime: '09:30', hasVisa: true });
    expect(d.resources).toHaveLength(1);
  });
  it('depuis un cours : date, horaires, salle et réservations repris, séance rattachée', () => {
    const d = draftFromCourse({ _id: 'c1', startDate: '2026-11-02 08:00:00', endDate: '2026-11-02 09:00:00', subjectId: 'm1', roomLabels: ['Salle 201'], rbsResourceIds: [7] }, 'a1');
    expect(d).toMatchObject({ courseId: 'c1', subjectKey: 'm1', audienceId: 'a1', date: '2026-11-02', startTime: '08:00', endTime: '09:00', room: 'Salle 201', rbsResourceIds: [7] });
    expect(draftFromCourse({ _id: 'c2', startDate: '2026-11-02 08:00:00', endDate: '2026-11-02 09:00:00', exceptionnal: 'AP' }, 'a1').subjectKey).toBe('exceptional:AP');
  });
  it('droits : modifier = gestion + propriétaire ; proposer = séance d\'un collègue ; supprimer sans visa', () => {
    const mine = { ...valid, id: 1, teacherId: 'me' };
    const theirs = { ...valid, id: 2, teacherId: 'other' };
    expect(canEditSession(mine, 'me', true)).toBe(true);
    expect(canEditSession(theirs, 'me', true)).toBe(false);
    expect(canEditSession(valid, 'me', true)).toBe(true);
    expect(canEditSession(mine, 'me', false)).toBe(false);
    expect(canProposeSession(theirs, 'me', true)).toBe(true);
    expect(canProposeSession(mine, 'me', true)).toBe(false);
    expect(canDeleteSession(mine, 'me', true)).toBe(true);
    expect(canDeleteSession({ ...mine, hasVisa: true }, 'me', true)).toBe(false);
    expect(canDeleteSession(valid, 'me', true)).toBe(false);
  });
});
