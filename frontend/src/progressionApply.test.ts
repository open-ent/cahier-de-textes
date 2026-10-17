import { describe, expect, it } from 'vitest';

import { homeworksFrom, sessionFieldsFrom } from './progressionApply';
import type { ProgressionSession } from './progressions';

const prog = (over: Partial<ProgressionSession> = {}): ProgressionSession => ({ id: 1, title: 'Fractions', description: '<p>Additionner</p>', className: '6e', subjectLabel: 'Maths', folderId: null, homeworks: [{ id: 5, description: '<p>Exercices 1 à 4</p>', estimatedTime: 15 }], ...over });

describe('application d\'une progression à une séance', () => {
  it('titre tronqué à 50 caractères, contenu repris', () => {
    expect(sessionFieldsFrom(prog())).toEqual({ title: 'Fractions', description: '<p>Additionner</p>' });
    expect(sessionFieldsFrom(prog({ title: 'x'.repeat(80) })).title).toHaveLength(50);
  });
  it('devoirs : type par défaut, échéance le lendemain, durée reprise', () => {
    const [h] = homeworksFrom(prog(), { typeId: '3', sessionDate: '2026-10-15', existing: [] });
    expect(h).toMatchObject({ typeId: '3', dueMode: 'date', dueDate: '2026-10-16', estimatedTime: 15, description: '<p>Exercices 1 à 4</p>', published: false });
  });
  it('échéance à la fin du mois et sans date de séance', () => {
    expect(homeworksFrom(prog(), { typeId: '3', sessionDate: '2026-10-31', existing: [] })[0].dueDate).toBe('2026-11-01');
    expect(homeworksFrom(prog(), { typeId: '3', sessionDate: '', existing: [] })[0].dueDate).toBe('');
  });
  it('pas de doublon même si le devoir enregistré est revenu en XHTML', () => {
    const stored = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><p>Exercices 1 à 4</p></body></html>';
    expect(homeworksFrom(prog(), { typeId: '3', sessionDate: '2026-10-15', existing: [{ description: stored }] })).toEqual([]);
  });
  it('pas de doublon même si le devoir enregistré est revenu en XHTML', () => {
    const stored = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><p>Exercices 1 à 4</p></body></html>';
    expect(homeworksFrom(prog(), { typeId: '3', sessionDate: '2026-10-15', existing: [{ description: stored }] })).toEqual([]);
  });
  it('pas de doublon : un devoir déjà présent n\'est pas repris', () => {
    expect(homeworksFrom(prog(), { typeId: '3', sessionDate: '2026-10-15', existing: [{ description: '<p>Exercices 1 à 4</p>' }] })).toEqual([]);
  });
});
