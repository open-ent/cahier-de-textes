import { describe, expect, it } from 'vitest';

import { buildDays, dayLabel, defaultDisplay, defaultPeriod, isValidPeriod } from './listItems';

const session = (id: number, date: string, start: string, published = true) => ({ id, date: `${date} 00:00:00.000000+0100`, start_time: `${start}:00`, end_time: '10:00:00', is_published: published });
const hw = (id: number, due: string, published = true, done = false) => ({ id, due_date: `${due}T00:00:00`, is_published: published, progress: done ? { state_label: 'done' } : null });
const all = { sessions: true, homeworks: true, todo: true, done: true };

describe('vue liste', () => {
  it('réglages par défaut : l\'élève ne voit que le « à faire », les autres tout', () => {
    expect(defaultDisplay('student')).toEqual({ sessions: true, homeworks: true, todo: true, done: false });
    expect(defaultDisplay('teacher').done).toBe(true);
    expect(defaultDisplay('relative').done).toBe(true);
  });
  it('période par défaut : aujourd\'hui + 28 jours ; début après fin invalide', () => {
    expect(defaultPeriod(new Date(2026, 9, 12))).toEqual({ start: '2026-10-12', end: '2026-11-09' });
    expect(isValidPeriod('2026-10-12', '2026-11-09')).toBe(true);
    expect(isValidPeriod('2026-11-09', '2026-10-12')).toBe(false);
    expect(isValidPeriod('', '2026-10-12')).toBe(false);
  });
  it('jours triés, séances avant devoirs, pastille selon le nombre de devoirs', () => {
    const days = buildDays([session(1, '2026-11-02', '10:00'), session(2, '2026-11-02', '08:00')], [hw(1, '2026-11-02'), hw(2, '2026-11-02'), hw(3, '2026-11-02'), hw(4, '2026-11-03')], all, false);
    expect(days.map((d) => d.day)).toEqual(['2026-11-02', '2026-11-03']);
    expect(days[0].items.map((i) => i.key)).toEqual(['s-2', 's-1', 'h-1', 'h-2', 'h-3']);
    expect(days[0]).toMatchObject({ homeworkCount: 3, color: 'yellow' });
    expect(days[1]).toMatchObject({ homeworkCount: 1, color: 'green' });
  });
  it('filtres séances / devoirs : un jour sans élément à afficher disparaît', () => {
    const s = [session(1, '2026-11-02', '08:00')];
    const h = [hw(1, '2026-11-03')];
    expect(buildDays(s, h, { ...all, sessions: false }, false).map((d) => d.day)).toEqual(['2026-11-03']);
    expect(buildDays(s, h, { ...all, homeworks: false }, false).map((d) => d.day)).toEqual(['2026-11-02']);
    expect(buildDays(s, h, { ...all, sessions: false, homeworks: false }, false)).toEqual([]);
  });
  it('élève : non publiés masqués, filtre à faire / fait, pastille selon le filtre', () => {
    const h = [hw(1, '2026-11-02', true, false), hw(2, '2026-11-02', true, true), hw(3, '2026-11-02', false, false)];
    const s = [session(1, '2026-11-02', '08:00', false)];
    expect(buildDays(s, h, { ...all }, true)[0].items.map((i) => i.key)).toEqual(['h-1', 'h-2']);
    const todoOnly = buildDays(s, h, { ...all, done: false }, true);
    expect(todoOnly[0].items.map((i) => i.key)).toEqual(['h-1']);
    expect(todoOnly[0].homeworkCount).toBe(1);
    expect(buildDays(s, h, { ...all, todo: false, done: false }, true)).toEqual([]);
  });
  it('enseignant : à faire / fait ne filtre pas, brouillons visibles', () => {
    const days = buildDays([], [hw(1, '2026-11-02', false, false), hw(2, '2026-11-02', true, true)], { ...all, todo: false, done: false }, false);
    expect(days[0].items).toHaveLength(2);
  });
  it('libellé du jour avec majuscule', () => {
    expect(dayLabel('2026-11-02', 'fr-FR')).toBe('Lundi 2 novembre 2026');
  });
});
