import { describe, expect, it } from 'vitest';

import { buildTree, contains, deletionIds, draftFromSession, emptyDraft, flatten, parentChoices, parseHomeworks, searchTree, toBody, validateDraft } from './progressions';

const sess = (id: number, title: string, folder: number | null, homeworks: unknown[] = []) => ({ id, title, class: '6e', subject_label: 'Maths', description: '<p>d</p>', progression_folder_id: folder, homeworks: JSON.stringify(homeworks) });
const raw = [
  { id: 1, parent_id: null, title: 'Cycle 3', progressions: JSON.stringify([sess(10, 'Fractions', 1, [{ id: 5, description: '<p>ex</p>', estimatedtime: 15 }])]) },
  { id: 2, parent_id: 1, title: 'Géométrie', progressions: JSON.stringify([sess(11, 'Angles', 2)]) },
  { id: null, parent_id: null, title: null, progressions: JSON.stringify([sess(12, 'Libre', null)]) },
];

describe('progressions', () => {
  it('arbre : racine virtuelle, profondeurs, séances et devoirs', () => {
    const root = buildTree(raw, 'Mes dossiers');
    expect(root.title).toBe('Mes dossiers');
    expect(root.sessions.map((s) => s.title)).toEqual(['Libre']);
    expect(root.children.map((c) => [c.title, c.deepStep])).toEqual([['Cycle 3', 1]]);
    expect(root.children[0].children[0]).toMatchObject({ title: 'Géométrie', deepStep: 2 });
    expect(root.children[0].sessions[0].homeworks).toEqual([{ id: 5, description: '<p>ex</p>', estimatedTime: 15 }]);
  });
  it('racine ajoutée même si le serveur ne la renvoie pas ; réponse vide', () => {
    expect(buildTree([], 'Mes dossiers')).toMatchObject({ id: null, children: [], sessions: [] });
    expect(buildTree([raw[0]], 'R').children).toHaveLength(1);
  });
  it('chaîne JSON invalide ou « [null] » : aucune séance', () => {
    expect(buildTree([{ id: 1, parent_id: null, title: 'A', progressions: '[null]' }], 'R').children[0].sessions).toEqual([]);
    expect(buildTree([{ id: 1, parent_id: null, title: 'A', progressions: '{oups' }], 'R').children[0].sessions).toEqual([]);
    expect(parseHomeworks('[null]')).toEqual([]);
  });
  it('contains et choix de parent : ni le dossier ni ses descendants, profondeur limitée', () => {
    const root = buildTree(raw, 'R');
    const cycle = root.children[0];
    expect(contains(cycle, 2)).toBe(true);
    expect(contains(cycle, 99)).toBe(false);
    expect(parentChoices(root).map((f) => f.id)).toEqual([null, 1, 2]);
    expect(parentChoices(root, cycle).map((f) => f.id)).toEqual([null]);
    // Un dossier de profondeur 5 n'accepte plus de sous-dossier.
    let chain = raw.slice(0, 1);
    for (let i = 2; i <= 6; i++) chain = [...chain, { id: i, parent_id: i - 1, title: `N${i}`, progressions: '[]' }];
    expect(parentChoices(buildTree(chain, 'R')).map((f) => f.deepStep)).toEqual([0, 1, 2, 3, 4]);
  });
  it('suppression : simple = dossiers seuls, en profondeur = séances et sous-dossiers', () => {
    const root = buildTree(raw, 'R');
    const cycle = root.children[0];
    expect(deletionIds([cycle], false)).toEqual({ folderIds: [1], sessionIds: [] });
    expect(deletionIds([cycle], true)).toEqual({ folderIds: [1, 2], sessionIds: [10, 11] });
  });
  it('recherche par titre sans casse', () => {
    const root = buildTree(raw, 'R');
    expect(searchTree(root, 'ANG').sessions.map((s) => s.id)).toEqual([11]);
    expect(searchTree(root, 'cycle').folders.map((f) => f.id)).toEqual([1]);
    expect(searchTree(root, '  ')).toEqual({ folders: [], sessions: [] });
    expect(flatten(root)).toHaveLength(3);
  });
  it('validation : titre, description (éditeur vide « <p></p> »), devoir sans texte', () => {
    expect(validateDraft(emptyDraft(null)).missing).toEqual(['title', 'description']);
    const ok = { ...emptyDraft(null), title: 'T', description: '<p>x</p>' };
    expect(validateDraft(ok).ok).toBe(true);
    expect(validateDraft({ ...ok, description: '<p></p>' }).missing).toEqual(['description']);
    expect(validateDraft({ ...ok, homeworks: [{ id: null, description: '<p> </p>', estimatedTime: 0 }] }).missing).toEqual(['homework']);
  });
  it('corps : dossier, devoirs conservés avec leur id, devoirs vides écartés', () => {
    const root = buildTree(raw, 'R');
    const d = { ...draftFromSession(root.children[0].sessions[0]), homeworks: [{ id: 5, description: '<p>ex</p>', estimatedTime: 20 }, { id: null, description: '<p></p>', estimatedTime: 3 }] };
    expect(toBody(d, 'u1')).toMatchObject({ title: 'Fractions', class: '6e', progression_folder_id: 1, owner_id: 'u1', progression_homeworks: [{ id: 5, estimatedTime: 20, owner_id: 'u1' }] });
    expect(toBody(d, 'u1').progression_homeworks).toHaveLength(1);
  });
});
