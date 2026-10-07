import { describe, expect, it } from 'vitest';

import { flattenProgressions } from './api';
import { addDays, formatDate, hhmm, mondayOf, sortKey, stripHtml, weekLabel, ymd } from './utils';

describe('flattenProgressions', () => {
  it('parse la chaîne JSON imbriquée et attache le dossier', () => {
    const folders = [
      { title: null, progressions: JSON.stringify([{ id: 1, class: '2PROCRM', title: 'Séq 1', description: 'obj', subject_label: 'ACO', modified: '2026-07-04T09:01:23' }]) },
      { title: 'Trimestre 2', progressions: JSON.stringify([{ id: 2, class: '1G', title: 'Séq 2', description: '', subject_label: 'MATH' }]) },
    ];
    const out = flattenProgressions(folders);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 1, title: 'Séq 1', className: '2PROCRM', subjectLabel: 'ACO', folder: '' });
    expect(out[1]).toMatchObject({ id: 2, folder: 'Trimestre 2' });
  });
  it('tolère une chaîne invalide ou vide', () => {
    expect(flattenProgressions([{ title: 'x', progressions: 'pas du json' }])).toEqual([]);
    expect(flattenProgressions([{ title: 'x', progressions: null }])).toEqual([]);
    expect(flattenProgressions([])).toEqual([]);
  });
});

describe('hhmm', () => {
  it('réduit HH:mm:ss à HH:mm', () => {
    expect(hhmm('09:00:00')).toBe('09:00');
    expect(hhmm('14:30')).toBe('14:30');
    expect(hhmm(undefined)).toBe('');
  });
});

describe('formatDate (séance)', () => {
  it('gère une date SQL avec fuseau', () => {
    expect(formatDate('2025-10-14 00:00:00.000000+0200')).toBe('14/10/2025');
  });
});

describe('stripHtml (contenu séance)', () => {
  it('retire les balises', () => {
    expect(stripHtml('<p>Découverte des <b>filières</b></p>')).toBe('Découverte des filières');
  });
});

describe('ymd', () => {
  it('formate en YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('addDays', () => {
  it('ajoute des jours', () => {
    expect(ymd(addDays(new Date(2026, 8, 30), 2))).toBe('2026-10-02');
  });
});

describe('formatDate', () => {
  it('convertit YYYY-MM-DD en jj/mm/aaaa', () => {
    expect(formatDate('2026-09-15')).toBe('15/09/2026');
    expect(formatDate('2026-09-15T00:00:00')).toBe('15/09/2026');
    expect(formatDate('')).toBe('');
  });
});

describe('sortKey', () => {
  it('ordonne chronologiquement (absent en dernier)', () => {
    expect(sortKey('2026-01-01') < sortKey('2026-12-31')).toBe(true);
    expect(sortKey(undefined)).toBe('9999-99-99');
  });
});

describe('mondayOf', () => {
  it('renvoie le lundi de la semaine', () => {
    expect(ymd(mondayOf(new Date(2026, 8, 16)))).toBe('2026-09-14'); // mercredi -> lundi
    expect(ymd(mondayOf(new Date(2026, 8, 14)))).toBe('2026-09-14'); // lundi -> lundi
    expect(ymd(mondayOf(new Date(2026, 8, 20)))).toBe('2026-09-14'); // dimanche -> lundi précédent
  });
});

describe('weekLabel', () => {
  it('formate la plage lundi→vendredi', () => {
    expect(weekLabel(new Date(2026, 8, 14))).toBe('du 14/09 au 18/09');
  });
});
