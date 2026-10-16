import { describe, expect, it } from 'vitest';

import { buildItems, COLORS, dailyHomeworks, hourRange } from './calendarItems';

const course = { _id: 'c1', startDate: '2026-11-02 08:00:00', endDate: '2026-11-02 09:00:00', subject: { name: 'MATHS' } };
const course2 = { _id: 'c2', startDate: '2026-11-02 10:00:00', endDate: '2026-11-02 11:00:00' };

describe('éléments du calendrier', () => {
  it('cours sans séance « à renseigner » (gris clair), cours avec séance masqué', () => {
    const items = buildItems([{ id: 1, date: '2026-11-02 00:00:00.000000+0100', start_time: '10:00:00', end_time: '11:00:00', course_id: 'c2', is_published: true }], [course, course2], [], false);
    expect(items.map((i) => i.key)).toEqual(['c-c1', 's-1']);
    expect(items[0].color).toBe(COLORS.course);
    expect(items[0].start).toBe(8 * 60);
    expect(items[1].color).toBe(COLORS.filled);
  });
  it('couleurs : hors emploi du temps gris foncé, vide avec devoirs orange', () => {
    const items = buildItems(
      [
        { id: 1, date: '2026-11-02', start_time: '08:00:00', end_time: '09:00:00', course_id: null },
        { id: 2, date: '2026-11-03', start_time: '08:00:00', end_time: '09:00:00', course_id: 'cx', is_empty: true },
      ],
      [],
      [{ id: 9, due_date: '2026-11-03', session_id: 2, is_published: false }],
      false,
    );
    expect(items[0].color).toBe(COLORS.punctual);
    expect(items[1].color).toBe(COLORS.emptyWithHomeworks);
    expect(items[1].homeworks).toEqual({ published: 0, draft: 1 });
  });
  it('élève ou parent : séance non publiée masquée, sauf si elle porte des devoirs publiés', () => {
    const sessions = [
      { id: 1, date: '2026-11-02', start_time: '08:00:00', end_time: '09:00:00', course_id: 'a', is_published: false, title: 'Brouillon' },
      { id: 2, date: '2026-11-02', start_time: '09:00:00', end_time: '10:00:00', course_id: 'b', is_published: false, title: 'Avec devoir' },
    ];
    const items = buildItems(sessions, [], [{ id: 5, due_date: '2026-11-02', session_id: 2, is_published: true }], true);
    expect(items.map((i) => i.key)).toEqual(['s-2']);
    expect(items[0].color).toBe(COLORS.emptyWithHomeworks);
    expect(items[0].session?.title).toBe('');
  });
  it('travail à faire : devoirs sans séance, par jour ; non publiés masqués aux élèves', () => {
    const hw = [
      { id: 1, due_date: '2026-11-02', session_id: null, is_published: true },
      { id: 2, due_date: '2026-11-02', session_id: 7, is_published: true },
      { id: 3, due_date: '2026-11-03', session_id: null, is_published: false },
    ];
    expect([...dailyHomeworks(hw, false).keys()]).toEqual(['2026-11-02', '2026-11-03']);
    expect([...dailyHomeworks(hw, true).keys()]).toEqual(['2026-11-02']);
  });
  it('bornes horaires : au moins 8 h - 18 h, élargies aux éléments', () => {
    expect(hourRange([], [])).toEqual({ from: 480, to: 1080 });
    expect(hourRange(buildItems([], [{ _id: 'x', startDate: '2026-11-02 07:30:00', endDate: '2026-11-02 19:15:00' }], [], false), [])).toEqual({ from: 420, to: 1200 });
  });
});
