import { EmptyScreen } from '@open-ent/react';
import illuFolder from '@images/emptyscreen/illu-no-content-in-folder.svg';
import illuHomeworks from '@images/emptyscreen/illu-homeworks.svg';
import illuSearch from '@images/emptyscreen/illu-search.svg';

const ILLUSTRATION = {
  diary: illuHomeworks,
  search: illuSearch,
  folder: illuFolder,
} as const;

export interface EmptyProps {
  /** `diary` par défaut ; `search` quand c'est un filtre qui ne ramène rien, `folder` pour un dossier vide. */
  illustration?: keyof typeof ILLUSTRATION;
  title: string;
  /** Ce qu'il y a à faire pour remplir l'écran. Un écran vide est une invitation, pas un constat. */
  text?: string;
  attr?: string;
}

/**
 * Écran vide du socle (illustration + phrase), à la place de la ligne grise perdue en haut à
 * gauche qu'affichaient les listes : sur une page de 1 000 px de haut, elle ne se voyait pas.
 */
export function Empty({ illustration = 'diary', title, text, attr = 'data-empty' }: EmptyProps) {
  return (
    <div className="d-flex justify-content-center py-24" {...{ [attr]: true }}>
      <EmptyScreen imageSrc={ILLUSTRATION[illustration]} imageAlt="" title={title} text={text} size={220} />
    </div>
  );
}

export default Empty;
