// Nom de l'écran courant, affiché dans le fil d'Ariane du socle (« Cahier de textes › Devoirs »).
// Fonction pure, testée dans screenTitle.test.ts. Le fil d'Ariane rend déjà un <h1> : les écrans
// n'en posent plus, sans quoi chaque page en comptait deux, l'un répétant l'autre.

export type TitleKey =
  | 'calendar'
  | 'list'
  | 'homeworks'
  | 'homeworkNew'
  | 'homework'
  | 'sessions'
  | 'sessionNew'
  | 'session'
  | 'notebooks'
  | 'archives'
  | 'progressions'
  | 'progressionNew'
  | 'progression';

/**
 * Écran désigné par un chemin de la route à dièse. `home` est le nom à donner à l'accueil, qui
 * dépend des droits (calendrier pour un enseignant, liste pour un élève).
 * Ex. `/devoir/12` → `homework` ; `/devoir/nouveau` → `homeworkNew`.
 */
export function screenTitleKey(pathname: string, home: TitleKey): TitleKey {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return home;
  if (path === '/liste') return 'list';
  if (path === '/devoirs') return 'homeworks';
  if (path === '/devoir/nouveau') return 'homeworkNew';
  if (path.startsWith('/devoir/')) return 'homework';
  if (path === '/seances') return 'sessions';
  if (path === '/seance/nouvelle') return 'sessionNew';
  if (path.startsWith('/seance/')) return 'session';
  if (path === '/cahiers') return 'notebooks';
  if (path === '/archives') return 'archives';
  if (path === '/progression/nouvelle') return 'progressionNew';
  if (path.startsWith('/progression/')) return 'progression';
  return 'progressions';
}
