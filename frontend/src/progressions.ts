// Progressions (séquences pédagogiques) : arbre de dossiers et séances modèles, comme l'IHM
// AngularJS (model/Progression.ts, controllers/progression/manageProgression.ts). Fonctions pures,
// testées dans progressions.test.ts.

/** Profondeur maximale d'un dossier : on ne peut pas créer dedans au-delà (Angular : deepStep < 5). */
export const MAX_DEPTH = 5;

/** Devoir d'une progression : durée en minutes, description en HTML. `id` nul tant qu'il n'est pas enregistré. */
export interface ProgressionHomework {
  id: number | null;
  description: string;
  estimatedTime: number;
}

/** Séance modèle d'une progression. */
export interface ProgressionSession {
  id: number;
  title: string;
  description: string;
  className: string;
  subjectLabel: string;
  folderId: number | null;
  homeworks: ProgressionHomework[];
  modified?: string;
}

/** Dossier de l'arbre ; la racine virtuelle (« Mes dossiers ») a `id` nul et `parentId` nul. */
export interface ProgressionFolder {
  id: number | null;
  parentId: number | null;
  title: string;
  deepStep: number;
  children: ProgressionFolder[];
  sessions: ProgressionSession[];
}

/** Ligne brute de GET /diary/progressions/:ownerId : `progressions` est une chaîne JSON (piège serveur). */
export interface RawFolder {
  id: number | null;
  parent_id: number | null;
  title?: string | null;
  progressions?: string | null;
}

type RawHomework = { id?: number | null; description?: string; estimatedtime?: number };

const parseList = <T>(raw: unknown): T[] => {
  if (typeof raw !== 'string' || !raw.trim()) return Array.isArray(raw) ? (raw as T[]) : [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Devoirs d'une progression (champ `homeworks`, chaîne JSON ou tableau, éléments nuls ignorés). */
export function parseHomeworks(raw: unknown): ProgressionHomework[] {
  return parseList<RawHomework | null>(raw)
    .filter((h): h is RawHomework => !!h && h.id != null)
    .map((h) => ({ id: Number(h.id), description: h.description ?? '', estimatedTime: Number(h.estimatedtime ?? 0) }));
}

/** Séance modèle à partir d'une ligne SQL (`subject_label`, `progression_folder_id`, `homeworks`). */
export function toSession(row: Record<string, unknown>): ProgressionSession {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    className: String(row.class ?? ''),
    subjectLabel: String(row.subject_label ?? ''),
    folderId: row.progression_folder_id == null ? null : Number(row.progression_folder_id),
    homeworks: parseHomeworks(row.homeworks),
    modified: row.modified == null ? undefined : String(row.modified),
  };
}

/**
 * Arbre complet : la racine virtuelle est toujours présente (le serveur ne la renvoie que s'il
 * existe des séances sans dossier). Ex. dossiers 1 (racine) et 2 (dans 1) → racine › 1 › 2,
 * profondeurs 0, 1, 2.
 */
export function buildTree(raw: RawFolder[], rootTitle: string): ProgressionFolder {
  const folders = new Map<number | null, ProgressionFolder>();
  for (const r of raw ?? []) {
    folders.set(r.id ?? null, {
      id: r.id ?? null,
      parentId: r.parent_id ?? null,
      title: r.title ?? '',
      deepStep: 0,
      children: [],
      sessions: parseList<Record<string, unknown> | null>(r.progressions)
        .filter((s): s is Record<string, unknown> => !!s && s.id != null)
        .map(toSession),
    });
  }
  const root = folders.get(null) ?? { id: null, parentId: null, title: '', deepStep: 0, children: [], sessions: [] };
  root.title = rootTitle;
  folders.set(null, root);
  for (const f of folders.values()) {
    if (f.id === null) continue;
    const parent = folders.get(f.parentId) ?? root;
    parent.children.push(f);
  }
  const level = (f: ProgressionFolder, d: number) => {
    f.deepStep = d;
    f.children.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    f.children.forEach((c) => level(c, d + 1));
  };
  level(root, 0);
  return root;
}

/** Tous les dossiers, racine comprise, dans l'ordre de l'arbre. */
export function flatten(root: ProgressionFolder): ProgressionFolder[] {
  return [root, ...root.children.flatMap(flatten)];
}

/** Vrai si `target` est `folder` lui-même ou l'un de ses descendants (évite les cycles au déplacement). */
export function contains(folder: ProgressionFolder, targetId: number | null): boolean {
  if (folder.id === targetId) return true;
  return folder.children.some((c) => contains(c, targetId));
}

/**
 * Dossiers parents proposés : profondeur < 5, et pour un dossier en cours de modification, ni
 * lui-même ni ses descendants. Ex. déplacer « B » (dans « A ») ne propose ni « B » ni ses sous-dossiers.
 */
export function parentChoices(root: ProgressionFolder, editing?: ProgressionFolder | null): ProgressionFolder[] {
  return flatten(root).filter((f) => f.deepStep < MAX_DEPTH && !(editing && contains(editing, f.id)));
}

/**
 * Identifiants à supprimer. Sans suppression en profondeur : les dossiers choisis seulement (le
 * serveur garde leur contenu) ; en profondeur : leurs séances et tous leurs sous-dossiers.
 */
export function deletionIds(folders: ProgressionFolder[], deep: boolean): { folderIds: number[]; sessionIds: number[] } {
  const folderIds: number[] = [];
  const sessionIds: number[] = [];
  const walk = (f: ProgressionFolder) => {
    if (f.id !== null) folderIds.push(f.id);
    if (!deep) return;
    f.sessions.forEach((s) => sessionIds.push(s.id));
    f.children.forEach(walk);
  };
  folders.forEach(walk);
  return { folderIds, sessionIds };
}

/** Recherche par titre (sans tenir compte de la casse) : dossiers et séances correspondants. */
export function searchTree(root: ProgressionFolder, query: string): { folders: ProgressionFolder[]; sessions: ProgressionSession[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { folders: [], sessions: [] };
  const all = flatten(root);
  return {
    folders: all.filter((f) => f.title.toLowerCase().includes(q)),
    sessions: all.flatMap((f) => f.sessions).filter((s) => s.title.toLowerCase().includes(q)),
  };
}

/** Brouillon du formulaire d'une progression. */
export interface ProgressionDraft {
  id: number | null;
  title: string;
  description: string;
  subjectLabel: string;
  className: string;
  folderId: number | null;
  homeworks: ProgressionHomework[];
}

export const emptyDraft = (folderId: number | null): ProgressionDraft => ({ id: null, title: '', description: '', subjectLabel: '', className: '', folderId, homeworks: [] });

export const draftFromSession = (s: ProgressionSession): ProgressionDraft => ({
  id: s.id,
  title: s.title,
  description: s.description,
  subjectLabel: s.subjectLabel,
  className: s.className,
  folderId: s.folderId,
  homeworks: s.homeworks.map((h) => ({ ...h })),
});

/** Texte brut d'un contenu HTML, pour savoir si l'éditeur est vide. Ex. « <p></p> » → « ». */
const plain = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

/** Titre et description obligatoires (comme l'AngularJS) ; un devoir saisi doit avoir une description. */
export function validateDraft(d: ProgressionDraft): { ok: boolean; missing: Array<'title' | 'description' | 'homework'> } {
  const missing: Array<'title' | 'description' | 'homework'> = [];
  if (!d.title.trim()) missing.push('title');
  if (!plain(d.description)) missing.push('description');
  if (d.homeworks.some((h) => !plain(h.description))) missing.push('homework');
  return { ok: missing.length === 0, missing };
}

/**
 * Corps envoyé au serveur (POST create / PUT update). Le serveur remplace la séance : les
 * devoirs sont tous renvoyés, ceux déjà enregistrés avec leur `id` pour être conservés.
 */
export function toBody(d: ProgressionDraft, ownerId: string) {
  return {
    title: d.title.trim(),
    description: d.description,
    subjectLabel: d.subjectLabel.trim(),
    class: d.className.trim(),
    annotation: '',
    owner_id: ownerId,
    progression_folder_id: d.folderId,
    progression_homeworks: d.homeworks
      .filter((h) => plain(h.description))
      .map((h) => ({ id: h.id, description: h.description, estimatedTime: h.estimatedTime || 0, owner_id: ownerId })),
  };
}
