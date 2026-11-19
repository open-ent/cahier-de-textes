import { describe, expect, it } from 'vitest';

import { screenTitleKey } from './screenTitle';

describe('screenTitleKey', () => {
  it("nomme l'accueil d'après les droits", () => {
    expect(screenTitleKey('/', 'calendar')).toBe('calendar');
    expect(screenTitleKey('/', 'list')).toBe('list');
  });

  it('distingue la création de la consultation', () => {
    expect(screenTitleKey('/devoir/nouveau', 'calendar')).toBe('homeworkNew');
    expect(screenTitleKey('/devoir/12', 'calendar')).toBe('homework');
    expect(screenTitleKey('/seance/nouvelle', 'calendar')).toBe('sessionNew');
    expect(screenTitleKey('/seance/7', 'calendar')).toBe('session');
    expect(screenTitleKey('/progression/nouvelle', 'calendar')).toBe('progressionNew');
    expect(screenTitleKey('/progression/3', 'calendar')).toBe('progression');
  });

  it('nomme les listes', () => {
    expect(screenTitleKey('/liste', 'calendar')).toBe('list');
    expect(screenTitleKey('/devoirs', 'calendar')).toBe('homeworks');
    expect(screenTitleKey('/seances', 'calendar')).toBe('sessions');
    expect(screenTitleKey('/cahiers', 'calendar')).toBe('notebooks');
    expect(screenTitleKey('/archives', 'calendar')).toBe('archives');
    expect(screenTitleKey('/progressions', 'calendar')).toBe('progressions');
    expect(screenTitleKey('/progressions/consultation', 'calendar')).toBe('progressions');
  });

  it('ignore une barre oblique finale', () => {
    expect(screenTitleKey('/devoirs/', 'calendar')).toBe('homeworks');
    expect(screenTitleKey('/', 'homeworks')).toBe('homeworks');
  });
});
